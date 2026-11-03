package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.ble.TargetSupport
import com.luketmoss.thrivespin.core.ble.ValueRange
import com.luketmoss.thrivespin.core.workout.TrainerMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class RideEngineTest {
    private val flat = "11 00 00 00 00 28 33"

    // ---- Sequence ----

    @Test
    fun aConnectionRunsTheSequenceInOrder() {
        val rig = Rig(session(pct()))
        rig.connect()
        rig.answer(0x00)
        rig.answer(0x07)
        assertEquals(listOf("subscribe", "00", "07", flat), rig.trainer.log)
    }

    @Test
    fun aNotSupportedAnswerToStartDoesNotStopTheSequenceAndResetIsNeverSent() {
        val rig = Rig(session(pct()))
        rig.connect()
        rig.answer(0x00)
        rig.answer(0x07, result = 0x02)
        assertEquals(listOf("subscribe", "00", "07", flat), rig.trainer.log)
        rig.answerAll()
        assertTrue(rig.state.ready == ReadyStatus.PedalToStart)
        assertFalse(rig.trainer.hexes().any { it == "01" })
    }

    @Test
    fun aReconnectMidRideRepeatsTheSequenceAndEndsWithTheCurrentTarget() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.start()
        rig.seconds(5)
        assertEquals("05 E1 00", rig.trainer.hexes().last())
        rig.engine.onTrainerDisconnected()
        rig.seconds(2)
        rig.trainer.log.clear()
        rig.connect()
        rig.answer(0x00)
        rig.answer(0x07)
        assertEquals(listOf("subscribe", "00", "07", "05 E1 00"), rig.trainer.log)
        assertEquals(1, rig.sink.events("trainer_lost").size)
        assertEquals(1, rig.sink.events("trainer_back").size)
    }

    // ---- ERG targets ----

    @Test
    fun aNinetyPercentStepAtFtp250SendsTheWattsOnceAtTheStart() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start()
        rig.seconds(30)
        assertEquals(listOf("00", "07", flat, "05 E1 00"), rig.trainer.hexes())
    }

    @Test
    fun aRampTargetsTheLineAndIsSentOnlyWhenItChangesAtMostOncePerSecond() {
        val step = pct(start = 50, end = 70, durS = 600)
        assertEquals(125, Targets.ergWatts(step, 0, 250, 100))
        assertEquals(150, Targets.ergWatts(step, 300, 250, 100))
        assertEquals(175, Targets.ergWatts(step, 599, 250, 100))
        val rig = Rig(session(step))
        rig.start()
        rig.seconds(60)
        val power = rig.trainer.hexes().filter { it.startsWith("05 ") }
        // 125 W for the first 12 s, then 126, 127 ... : never twice in a row, never more than once a second.
        assertEquals(power.distinct(), power)
        assertTrue(power.size in 5..61)
        assertEquals("05 7D 00", power.first())
    }

    @Test
    fun aTargetAboveTheSupportedRangeIsSentAsTheMax() {
        val rig = Rig(session(step("Sprint", StepTarget.Watts(500, 500), 60), ftp = null))
        rig.ready()
        rig.engine.onTrainerDisconnected()
        rig.connect(power = ValueRange(0, 400, 1))
        rig.answerAll()
        rig.pedal()
        rig.answerAll()
        assertEquals("05 90 01", rig.trainer.hexes().last())
    }

    // ---- Intensity ----

    @Test
    fun plusAtSecond100ChangesTheTargetToTheNextWattAndScalesLaterSteps() {
        val rig = Rig(session(pct(durS = 3600), pct("Later", 100, durS = 600)))
        rig.start()
        rig.seconds(100)
        assertEquals(225, rig.state.targetW)
        rig.engine.adjustIntensity(+1)
        assertEquals(227, rig.state.targetW)
        rig.answerAll()
        assertEquals(1, rig.trainer.hexes().count { it == "05 E3 00" })
        rig.seconds(3)
        assertEquals(1, rig.trainer.hexes().count { it == "05 E3 00" })
        assertEquals(listOf(100, 101), rig.sink.samples.map { it.intensityPct }.distinct())
        assertEquals(1, rig.sink.events("intensity").size)
        assertEquals(101, rig.sink.events("intensity").single().int("pct"))
        // The later 100% step is 101% too.
        assertEquals(253, Targets.ergWatts(rig.session.steps[1], 0, 250, 101))
    }

    @Test
    fun intensityDoesNotTouchLevelGradeOrAbsoluteWattsTargets() {
        val steps = listOf(
            step("W", StepTarget.Watts(200, 200)),
            step("S", StepTarget.WattsStairs(100, 20, 60)),
            step("L", StepTarget.Level(40)),
            step("G", StepTarget.Grade(3.0)),
        )
        steps.forEach { assertEquals(Targets.ergWatts(it, 0, 250, 100), Targets.ergWatts(it, 0, 250, 130)) }
    }

    @Test
    fun intensityStopsAt50And130() {
        val rig = Rig(session(pct(durS = 3600), intensity = 128))
        rig.start()
        repeat(5) { rig.engine.adjustIntensity(+1) }
        assertEquals(130, rig.state.intensityPct)
        assertFalse(rig.state.canHarder)
        repeat(90) { rig.engine.adjustIntensity(-1) }
        assertEquals(50, rig.state.intensityPct)
        assertFalse(rig.state.canEasier)
    }

    @Test
    fun theMeanOfTheSamplesIntensityIsTheTimeWeightedMean() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.start()
        rig.seconds(100)
        rig.engine.adjustIntensity(+1)
        rig.seconds(100)
        // The tap came during second 100, so it is in force from the next sample on.
        assertEquals(100, rig.sink.samples[100].intensityPct)
        assertEquals(101, rig.sink.samples[101].intensityPct)
        val mean = rig.sink.samples.map { it.intensityPct }.average()
        assertEquals((100 * 101 + 101 * 99) / 200.0, mean, 0.0001)
        assertEquals(100, com.luketmoss.thrivespin.core.workout.Maths.roundHalfUp(mean))
    }

    @Test
    fun aRideThatIsNotAdjustableIgnoresIntensity() {
        val rig = Rig(session(pct(durS = 600), adjustable = false))
        rig.start()
        rig.engine.adjustIntensity(+5)
        assertEquals(100, rig.state.intensityPct)
    }

    // ---- Other commands ----

    @Test
    fun aGradeStepSendsTheSimulationParametersAndAFreeStepTheFlatRoad() {
        val rig = Rig(
            session(
                step("Hill", StepTarget.Grade(4.5), 5),
                step("Dip", StepTarget.Grade(-2.0), 5),
                step("Coast", StepTarget.Free, 5),
                ftp = null,
            ),
        )
        rig.start()
        rig.seconds(5)
        rig.seconds(5)
        rig.seconds(1)
        assertEquals(
            listOf("00", "07", flat, "11 00 00 C2 01 28 33", "11 00 00 38 FF 28 33", flat),
            rig.trainer.hexes(),
        )
    }

    @Test
    fun withoutSimulationTheFlatRoadIsResistanceAtTheRangeMinimum() {
        val rig = Rig(session(step("Coast", StepTarget.Free, null), ftp = null))
        rig.connect(support = TargetSupport(power = true, resistance = true, simulation = false), resistance = ValueRange(10, 110, 5))
        rig.answer(0x00)
        rig.answer(0x07)
        assertEquals("04 0A", rig.trainer.hexes().last())
    }

    @Test
    fun inResistanceModeAnErgStepSendsTheLevelMappedOntoTheRange() {
        val rig = Rig(session(pct(durS = 600), mode = TrainerMode.Resistance))
        rig.ready()
        rig.engine.onTrainerDisconnected()
        rig.connect(resistance = ValueRange(10, 110, 5))
        rig.answerAll()
        rig.pedal()
        rig.answerAll()
        // Level 30 of 10..110 is 40.
        assertEquals("04 28", rig.trainer.hexes().last())
        assertEquals(225, rig.state.targetW)
        assertTrue(rig.state.targetIsGuide)
        assertTrue(rig.state.showTrainerRow)
    }

    @Test
    fun inSlopeModeAnErgStepSendsTheRidesGradeAndLevelAndGradeMoveByFiveAndHalf() {
        val rig = Rig(session(pct(durS = 600), mode = TrainerMode.Slope))
        rig.start()
        assertEquals("11 00 00 C8 00 28 33", rig.trainer.hexes().last())
        rig.engine.adjustModeSetting(+1)
        rig.answerAll()
        assertEquals("11 00 00 FA 00 28 33", rig.trainer.hexes().last())
        repeat(100) { rig.engine.adjustModeSetting(+1) }
        assertEquals(200, rig.state.modeGradeTenths)
        repeat(100) { rig.engine.adjustModeSetting(-1) }
        assertEquals(-100, rig.state.modeGradeTenths)

        val level = Rig(session(pct(durS = 600), mode = TrainerMode.Resistance))
        level.start()
        assertEquals(30, level.state.modeLevel)
        level.engine.adjustModeSetting(+1)
        assertEquals(35, level.state.modeLevel)
        repeat(30) { level.engine.adjustModeSetting(+1) }
        assertEquals(100, level.state.modeLevel)
        repeat(30) { level.engine.adjustModeSetting(-1) }
        assertEquals(0, level.state.modeLevel)
        assertTrue(level.sink.events("mode_setting").isNotEmpty())
    }

    // ---- One command in flight ----

    @Test
    fun fiveTapsWhileACommandAwaitsItsAnswerSendOneMoreWithTheNewestValue() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.start()
        assertEquals("05 E1 00", rig.trainer.hexes().last())
        // The 225 W command is still in flight: nothing has answered it.
        val before = rig.trainer.writes.size
        // The start's flat road and target were both answered by answerAll(); send a new one unanswered.
        repeat(5) { rig.engine.adjustIntensity(+1) }
        // 101 went out at once (nothing was in flight); the other four wait behind it.
        assertEquals(before + 1, rig.trainer.writes.size)
        rig.answerAll()
        assertEquals(before + 2, rig.trainer.writes.size)
        // 105% of 90% of 250 W is 236 W.
        assertEquals("05 EC 00", rig.trainer.hexes().last())
        rig.answerAll()
        assertEquals(before + 2, rig.trainer.writes.size)
    }

    // ---- Refusals ----

    @Test
    fun aRefusedRequestControlKeepsTheRideGoingRetriesEvery15sAndSetsTheBanner() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.connect()
        rig.answer(0x00, result = 0x04)
        assertEquals(listOf("subscribe", "00"), rig.trainer.log)
        assertEquals(RideBanner.NoControl, rig.state.banner)
        assertEquals(ReadyStatus.PedalToStart, rig.state.ready)
        rig.pedal()
        assertEquals(RidePhase.Running, rig.state.phase)
        rig.idle(14_000)
        assertEquals(listOf("subscribe", "00"), rig.trainer.log)
        rig.idle(2_000)
        assertEquals(listOf("subscribe", "00", "00"), rig.trainer.log)
        rig.answer(0x00, result = 0x04)
        rig.idle(14_000)
        assertEquals(listOf("subscribe", "00", "00"), rig.trainer.log)
        rig.idle(2_000)
        assertEquals(listOf("subscribe", "00", "00", "00"), rig.trainer.log)
        rig.answer(0x00)
        assertEquals("07", rig.trainer.log.last())
        rig.answer(0x07)
        assertEquals("05 E1 00", rig.trainer.log.last())
        assertNull(rig.state.banner)
        assertTrue(rig.sink.events("control").isNotEmpty())
    }

    @Test
    fun controlNotPermittedOnATargetRequestsControlOnceAndResendsOnce() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.ready()
        rig.pedal()
        assertEquals("05 E1 00", rig.trainer.hexes().last())
        rig.answer(0x05, result = 0x05)
        assertEquals("00", rig.trainer.hexes().last())
        rig.answer(0x00)
        assertEquals("05 E1 00", rig.trainer.hexes().last())
        assertEquals(2, rig.trainer.hexes().count { it == "05 E1 00" })
        // Refused again: not a loop. It is as if Request Control were refused.
        rig.answer(0x05, result = 0x05)
        assertEquals(RideBanner.NoControl, rig.state.banner)
        assertEquals(2, rig.trainer.hexes().count { it == "05 E1 00" })
    }

    @Test
    fun notSupportedStopsThatCommandForTheRideWithItsBanner() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.ready()
        rig.pedal()
        rig.answer(0x05, result = 0x02)
        assertEquals(RideBanner.PowerUnsupported, rig.state.banner)
        rig.engine.adjustIntensity(+1)
        rig.seconds(5)
        assertEquals(1, rig.trainer.hexes().count { it.startsWith("05 ") })
        assertEquals(TrainerPill.Guide, rig.state.pill)
    }

    @Test
    fun invalidParameterIsNotResentButTheNextDifferentValueIs() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.ready()
        rig.pedal()
        rig.answer(0x05, result = 0x03)
        assertEquals(RideBanner.Refused, rig.state.banner)
        rig.seconds(5)
        assertEquals(1, rig.trainer.hexes().count { it == "05 E1 00" })
        rig.engine.adjustIntensity(+1)
        rig.answerAll()
        assertEquals("05 E3 00", rig.trainer.hexes().last())
        assertNull(rig.state.banner)
    }

    @Test
    fun aFailureOrATimeoutIsResentOnceAfterASecondAndTheSecondFailureCountsAsInvalid() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.ready()
        rig.pedal()
        rig.answer(0x05, result = 0x04)
        rig.idle(900)
        assertEquals(1, rig.trainer.hexes().count { it == "05 E1 00" })
        rig.idle(200)
        assertEquals(2, rig.trainer.hexes().count { it == "05 E1 00" })
        // No answer for 3 s is a failure too: the second one is final.
        rig.idle(3_000)
        rig.idle(2_000)
        assertEquals(2, rig.trainer.hexes().count { it == "05 E1 00" })
        assertEquals(RideBanner.Refused, rig.state.banner)
    }

    @Test
    fun aTimeoutIsResentOnceToo() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.ready()
        rig.pedal()
        rig.idle(3_000)
        rig.idle(1_000)
        assertEquals(2, rig.trainer.hexes().count { it == "05 E1 00" })
    }

    @Test
    fun controlLostOrResetRunsTheSequenceAgain() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.start()
        rig.trainer.log.clear()
        rig.engine.onMachineStatus(byteArrayOf(0xFF.toByte()))
        rig.answer(0x00)
        rig.answer(0x07)
        assertEquals(listOf("00", "07", "05 E1 00"), rig.trainer.log)
        rig.answerAll()
        rig.trainer.log.clear()
        rig.engine.onMachineStatus(byteArrayOf(0x01))
        rig.answer(0x00)
        rig.answer(0x07)
        assertEquals(listOf("00", "07", "05 E1 00"), rig.trainer.log)
        // Another status is ignored.
        rig.answerAll()
        rig.trainer.log.clear()
        rig.engine.onMachineStatus(byteArrayOf(0x02))
        assertTrue(rig.trainer.log.isEmpty())
    }

    // ---- Clock and samples ----

    @Test
    fun theClockWaitsForTheTrainerToBeReadyAndForPower() {
        val rig = Rig(session(pct(durS = 600)))
        rig.connect()
        rig.pedal() // before the sequence is done
        assertEquals(RidePhase.GettingReady, rig.state.phase)
        rig.answerAll()
        rig.pedal(power = 0, cadence = 0.0)
        assertEquals(RidePhase.GettingReady, rig.state.phase)
        assertNull(rig.sink.meta)
        rig.pedal(power = null, cadence = 12.0)
        assertEquals(RidePhase.Running, rig.state.phase)
        assertEquals(RideKind.Workout, rig.sink.meta!!.session.kind)
        assertEquals(listOf("start"), rig.sink.events("step_start").map { it.text("reason") })
    }

    @Test
    fun aClockThatJumpsThreeSecondsWritesThreeSamples() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start()
        rig.idle(3_000)
        assertEquals(listOf(0, 1, 2), rig.sink.samples.map { it.t })
    }

    @Test
    fun aSamplesPowerIsTheMeanOfItsSecondElseTheLastReadingUnderThreeSecondsElseNull() {
        val rig = Rig(session(pct(durS = 600)))
        rig.ready()
        rig.clock.advance(100)
        rig.pedal(power = 100)
        rig.clock.advance(500)
        rig.pedal(power = 201)
        rig.clock.advance(400)
        rig.clock.advance(100)
        rig.engine.tick()
        // Seconds 1 and 2 have no reading: the last one is 1.5 s and 2.5 s old at their ends, and 3.5 s at the third's.
        rig.idle(1000)
        rig.idle(1000)
        rig.idle(1000)
        assertEquals(listOf(151, 201, 201, null), rig.sink.samples.map { it.powerW })
    }

    @Test
    fun aReadingIsBinnedByTheSecondItArrivedInEvenWhenTheTickIsLate() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start(power = 100)
        rig.clock.advance(2_500)
        rig.pedal(power = 300)
        assertEquals(listOf(100, 100), rig.sink.samples.map { it.powerW })
        rig.clock.advance(500)
        rig.engine.tick()
        assertEquals(300, rig.sink.samples.last().powerW)
    }

    @Test
    fun threeSecondPowerIsTheMeanOfTheLastThreeNonNullSamples() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start(power = 100)
        rig.seconds(1, power = 200)
        rig.seconds(1, power = 300)
        rig.seconds(1, power = 400)
        // Samples: 100, 200, 300, 400? The first was binned with the start reading and the one in its second.
        val power = rig.sink.samples.map { it.powerW }
        val last3 = power.takeLast(3).filterNotNull()
        assertEquals(Math.round(last3.sum() / 3.0).toInt(), rig.state.power3sW)
        rig.idle(10_000)
        assertNull(rig.state.power3sW)
    }

    @Test
    fun stepAverageAndTotalKjSumTheNonNullPower() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start(power = 200)
        rig.seconds(9, power = 200)
        assertEquals(200, rig.state.stepAvgW)
        // Nine samples of 200 W are 1.8 kJ: shown rounded down.
        assertEquals(1, rig.state.totalKj)
        rig.seconds(1, power = 200)
        assertEquals(2, rig.state.totalKj)
    }

    @Test
    fun theBandIsFivePercentOfTheTarget() {
        assertEquals(Band.On, Targets.band(200, 190))
        assertEquals(Band.On, Targets.band(200, 210))
        assertEquals(Band.Below, Targets.band(200, 189))
        assertEquals(Band.Above, Targets.band(200, 211))
        assertNull(Targets.band(null, 200))
        assertNull(Targets.band(200, null))
    }

    // ---- Trainer lost ----

    @Test
    fun whenTheTrainerIsLostTheClockRunsOnWithNullPowerAndCadence() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start()
        rig.seconds(3)
        rig.engine.onTrainerDisconnected()
        assertEquals(RideBanner.TrainerLost, rig.state.banner)
        assertEquals(TrainerPill.Reconnecting, rig.state.pill)
        rig.idle(4_000)
        val lost = rig.sink.samples.takeLast(4)
        assertTrue(lost.all { it.powerW == null || it.t < 3 })
        val afterLoss = rig.sink.samples.filter { !it.trainer }
        assertTrue(afterLoss.isNotEmpty())
        assertTrue(afterLoss.all { it.powerW == null && it.cadenceRpm == null && it.targetW == 225 })
        assertEquals(RidePhase.Running, rig.state.phase)
        assertEquals(1, rig.sink.events("trainer_lost").size)
    }

    // ---- Heart rate ----

    private val twoStraps = DeviceState(trainer = TRAINER, monitors = listOf(STRAP_A, STRAP_B), picked = STRAP_A.address, fallback = true)

    @Test
    fun theMonitorIsChosenSoonerWhenThePickedOneReadsFirst() {
        val rig = Rig(session(pct(durS = 600)), devices = twoStraps)
        rig.start()
        assertEquals(HrStatus.Connecting, rig.state.hrStatus)
        rig.heartRate(STRAP_A.address, 140)
        rig.seconds(2)
        assertEquals(HrStatus.Reading, rig.state.hrStatus)
        assertEquals("HRM-Pro", rig.state.hrName)
        rig.heartRate(STRAP_A.address, 141)
        assertEquals(141, rig.state.heartRate)
    }

    @Test
    fun theMonitorIsChosenFifteenSecondsInAndFallsBackToTheOneThatReads() {
        val rig = Rig(session(pct(durS = 600)), devices = twoStraps)
        rig.start()
        repeat(14) {
            rig.heartRate(STRAP_B.address, 120)
            rig.second()
        }
        assertEquals(HrStatus.Connecting, rig.state.hrStatus)
        rig.heartRate(STRAP_B.address, 120)
        rig.second()
        rig.second()
        assertEquals("Polar H10", rig.state.hrName)
        assertEquals(120, rig.sink.samples.last().hrBpm)
    }

    @Test
    fun afterThirtySecondsWithNoReadingTheRideSwitchesToAMonitorThatReadsInTheLastFive() {
        val rig = Rig(session(pct(durS = 600)), devices = twoStraps)
        rig.start()
        repeat(5) {
            rig.heartRate(STRAP_A.address, 150)
            rig.second()
        }
        assertEquals("HRM-Pro", rig.state.hrName)
        // The picked strap goes quiet; the other one reads.
        repeat(28) {
            rig.heartRate(STRAP_B.address, 130)
            rig.second()
        }
        assertEquals("HRM-Pro", rig.state.hrName)
        assertTrue(rig.sink.samples.takeLast(10).all { it.hrBpm == null })
        repeat(2) {
            rig.heartRate(STRAP_B.address, 130)
            rig.second()
        }
        assertEquals("Polar H10", rig.state.hrName)
        val event = rig.sink.events("hr_source").single()
        assertEquals(STRAP_B.address, event.text("address"))
        assertEquals(130, rig.sink.samples.last().hrBpm)
    }

    @Test
    fun withTheFallbackOffTheRideDoesNotSwitch() {
        val rig = Rig(session(pct(durS = 600)), devices = twoStraps.copy(fallback = false))
        rig.start()
        repeat(5) {
            rig.heartRate(STRAP_A.address, 150)
            rig.second()
        }
        repeat(40) {
            rig.heartRate(STRAP_B.address, 130)
            rig.second()
        }
        assertEquals("HRM-Pro", rig.state.hrName)
        assertEquals(HrStatus.NoReading, rig.state.hrStatus)
        assertTrue(rig.sink.events("hr_source").isEmpty())
        assertNull(rig.sink.samples.last().hrBpm)
    }

    @Test
    fun aMonitorWithoutContactIsNotAReading() {
        val rig = Rig(session(pct(durS = 600)), devices = twoStraps)
        rig.start()
        rig.heartRate(STRAP_A.address, 0)
        rig.heartRate(STRAP_A.address, 90, contact = false)
        rig.second()
        assertNull(rig.sink.samples.last().hrBpm)
    }

    // ---- Pause ----

    @Test
    fun pauseWritesNoSamplesSendsTheFlatRoadAndResumeTheStepsTarget() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.start()
        rig.seconds(4)
        rig.engine.pause()
        rig.answerAll()
        assertEquals(flat, rig.trainer.hexes().last())
        val count = rig.sink.samples.size
        rig.idle(120_000)
        assertEquals(count, rig.sink.samples.size)
        assertEquals(RidePhase.Paused, rig.state.phase)
        rig.engine.resume()
        rig.answerAll()
        assertEquals("05 E1 00", rig.trainer.hexes().last())
        rig.seconds(2)
        assertEquals(count + 2, rig.sink.samples.size)
        assertEquals(count, rig.sink.samples.last().t - 1)
        assertEquals(1, rig.sink.events("pause").size)
        assertEquals(1, rig.sink.events("resume").size)
        val pauseEvent = rig.sink.events("pause").single()
        val resumeEvent = rig.sink.events("resume").single()
        assertEquals(120_000L, resumeEvent.epochMs - pauseEvent.epochMs)
    }

    @Test
    fun aSixtyMinutePauseEndsTheRide() {
        val rig = Rig(session(pct(durS = 3600)))
        rig.start()
        rig.seconds(4)
        rig.engine.pause()
        rig.idle(3_599_000)
        assertEquals(RidePhase.Paused, rig.state.phase)
        rig.idle(1_000)
        assertEquals(RidePhase.Finished, rig.state.phase)
        assertEquals("paused_too_long", rig.sink.finishedReason)
        assertEquals(listOf("ride-1"), rig.handler.ids)
    }

    // ---- Skip ----

    @Test
    fun skipStartsTheNextStepAtOnceAndAnotherWithinASecondIsIgnored() {
        val rig = Rig(session(pct("A", durS = 600), pct("B", 60, durS = 600), pct("C", 70, durS = 600)))
        rig.start()
        rig.seconds(10)
        rig.engine.skipStep()
        rig.engine.skipStep()
        assertEquals("B", rig.state.stepLabel)
        val skip = rig.sink.events("step_start").last()
        assertEquals("skip", skip.text("reason"))
        assertEquals(10, skip.atS)
        rig.seconds(2)
        rig.engine.skipStep()
        assertEquals("C", rig.state.stepLabel)
        assertFalse(rig.state.canSkip)
        rig.seconds(2)
        rig.engine.skipStep()
        assertEquals("C", rig.state.stepLabel)
        // The sample at the skip second belongs to the new step.
        assertEquals(1, rig.sink.samples.first { it.t == 10 }.step)
    }

    @Test
    fun aSkipWhilePausedStaysPaused() {
        val rig = Rig(session(pct("A", durS = 600), pct("B", 60, durS = 600)))
        rig.start()
        rig.seconds(3)
        rig.engine.pause()
        rig.answerAll()
        val writes = rig.trainer.writes.size
        rig.engine.skipStep()
        assertEquals("B", rig.state.stepLabel)
        assertEquals(RidePhase.Paused, rig.state.phase)
        assertEquals(writes, rig.trainer.writes.size)
        rig.engine.resume()
        rig.answerAll()
        assertEquals("05 96 00", rig.trainer.hexes().last())
    }

    @Test
    fun skipIsOffBeforeTheClockStarts() {
        val rig = Rig(session(pct("A", durS = 600), pct("B", durS = 600)))
        rig.ready()
        rig.engine.skipStep()
        assertEquals("A", rig.state.stepLabel)
        assertFalse(rig.state.canSkip)
    }

    // ---- Finish ----

    @Test
    fun theEndOfTheLastStepFinishesTheRideOnceAndSendsTheFlatRoad() {
        val rig = Rig(session(pct("A", durS = 5), pct("B", 60, durS = 3)))
        rig.start()
        rig.seconds(8)
        assertEquals(RidePhase.Finished, rig.state.phase)
        assertEquals("completed", rig.sink.finishedReason)
        assertEquals(8, rig.sink.samples.size)
        assertEquals(flat, rig.trainer.hexes().last())
        assertEquals(listOf("ride-1"), rig.handler.ids)
        rig.seconds(5)
        assertEquals(listOf("ride-1"), rig.handler.ids)
        assertEquals(listOf("start", "time"), rig.sink.events("step_start").map { it.text("reason") })
        assertEquals("completed", rig.sink.events("end").single().text("reason"))
    }

    @Test
    fun theRideEndsAtTheTwelveHourLimit() {
        val rig = Rig(session(step("Free ride", StepTarget.Free, null), ftp = null))
        rig.start()
        rig.idle(43_199_000)
        assertEquals(RidePhase.Running, rig.state.phase)
        rig.idle(1_000)
        assertEquals(RidePhase.Finished, rig.state.phase)
        assertEquals("limit", rig.sink.finishedReason)
        assertEquals(43_200, rig.sink.samples.size)
        assertEquals(listOf("ride-1"), rig.handler.ids)
    }

    @Test
    fun endFinishesWithReasonEndedAndDiscardKeepsNothing() {
        val ended = Rig(session(pct(durS = 600)))
        ended.start()
        ended.seconds(5)
        ended.engine.end()
        assertEquals("ended", ended.sink.finishedReason)
        assertEquals(listOf("ride-1"), ended.handler.ids)
        assertEquals(5, ended.sink.samples.size)

        val discarded = Rig(session(pct(durS = 600)))
        discarded.start()
        discarded.seconds(5)
        discarded.engine.discard()
        assertTrue(discarded.sink.discarded)
        assertNull(discarded.sink.finishedReason)
        assertTrue(discarded.handler.ids.isEmpty())
        assertEquals(RidePhase.Finished, discarded.state.phase)
        assertEquals(flat, discarded.trainer.hexes().last())
    }

    @Test
    fun cancelBeforeTheClockStartsRecordsNothingAndReleasesTheTrainer() {
        val rig = Rig(session(pct(durS = 600)))
        rig.ready()
        rig.engine.end()
        assertEquals(RidePhase.Finished, rig.state.phase)
        assertNull(rig.sink.meta)
        assertTrue(rig.handler.ids.isEmpty())
        assertFalse(rig.state.canPause)
    }

    @Test
    fun anEndInTheFirstSecondKeepsNothingBecauseNothingWasRecorded() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start()
        rig.engine.end()
        assertTrue(rig.sink.discarded)
        assertTrue(rig.handler.ids.isEmpty())
    }

    @Test
    fun aFailedWriteEndsTheRideAtTheLastSampleWritten() {
        val rig = Rig(session(pct(durS = 600)))
        rig.start()
        rig.seconds(3)
        rig.sink.failWrites = true
        rig.second()
        assertEquals(RidePhase.Finished, rig.state.phase)
        assertTrue(rig.state.storageFull)
        assertEquals(3, rig.sink.samples.size)
        assertEquals(listOf("ride-1"), rig.handler.ids)
    }

    // ---- #770's hook ----

    @Test
    fun anOpenEndedStairsStepClimbsEverySixtySecondsAndEndsOnSkip() {
        val stairs = step("Ramp", StepTarget.WattsStairs(100, 20, 60), null)
        assertEquals(100, Targets.ergWatts(stairs, 59, null, 100))
        assertEquals(120, Targets.ergWatts(stairs, 60, null, 100))
        val rig = Rig(session(stairs, step("Cool", StepTarget.Watts(100, 100), 60), ftp = null, adjustable = false, kind = RideKind.RampTest))
        rig.start()
        rig.seconds(61)
        assertEquals("Ramp", rig.state.stepLabel)
        assertNull(rig.state.stepLeftS)
        assertNull(rig.state.totalS)
        assertEquals(RideKind.RampTest, rig.sink.meta!!.kind)
        rig.engine.skipStep()
        assertEquals("Cool", rig.state.stepLabel)
    }

    @Test
    fun lowCadenceForFiveConsecutiveSamplesEndsTheStepAndTheNextOneStartsAtTheFollowingSecond() {
        val stairs = step("Ramp", StepTarget.WattsStairs(100, 20, 60), null, endWhen = EndCondition.CadenceBelow(60, 5))
        val rig = Rig(session(stairs, step("Cool", StepTarget.Watts(100, 100), 60), ftp = null, adjustable = false))
        rig.start()
        rig.seconds(10, cadence = 85.0)
        repeat(4) { rig.second(cadence = 50.0) }
        rig.second(cadence = 85.0)
        assertEquals("Ramp", rig.state.stepLabel)
        repeat(4) { rig.second(cadence = 50.0) }
        assertEquals("Ramp", rig.state.stepLabel)
        rig.second(cadence = 50.0)
        assertEquals("Cool", rig.state.stepLabel)
        val start = rig.sink.events("step_start").last()
        assertEquals("end_condition", start.text("reason"))
        assertEquals(rig.sink.samples.last().t + 1, start.atS)
    }

    @Test
    fun aSessionThatBreaksTheRulesIsRejected() {
        try {
            session(pct(start = 50, end = 70, durS = null))
            fail("a ramp of no duration is rejected")
        } catch (e: IllegalArgumentException) {
            // expected
        }
        try {
            session(pct(durS = 60), ftp = null)
            fail("a percentage with no FTP is rejected")
        } catch (e: IllegalArgumentException) {
            // expected
        }
        try {
            session()
            fail("no steps is rejected")
        } catch (e: IllegalArgumentException) {
            // expected
        }
        // A flat percentage with no duration, and every open-ended kind, are fine.
        session(pct(durS = null), step("L", StepTarget.Level(30), null), step("G", StepTarget.Grade(1.0), null), step("F", StepTarget.Free, null))
    }

    // ---- State for the screen ----

    @Test
    fun theStateCarriesTheStepTotalsAndTheNextStep() {
        val rig = Rig(session(pct("Warm up", 60, durS = 120), pct("Hard", 105, durS = 60, cadence = 90, position = "1 of 2"), step("Free", StepTarget.Free, 30)))
        rig.start()
        rig.seconds(5)
        val s = rig.state
        assertEquals(5, s.rideS)
        assertEquals(115, s.stepLeftS)
        assertEquals(210, s.totalS)
        assertEquals("Hard", s.next!!.label)
        assertEquals("263 W", s.next!!.target)
        assertEquals(5, s.plannedS)
        rig.engine.skipStep()
        assertEquals("1 of 2", rig.state.stepPosition)
        assertEquals(90, rig.state.cadenceTarget)
        assertEquals(120, rig.state.plannedS)
    }

    @Test
    fun theReadyStatusFollowsTheTrainer() {
        val rig = Rig(session(pct(durS = 600)))
        assertEquals(ReadyStatus.Connecting, rig.state.ready)
        rig.idle(20_000)
        assertEquals(ReadyStatus.CantFind, rig.state.ready)
        rig.engine.onBluetooth(on = false, permission = true)
        assertEquals(ReadyStatus.BluetoothOff, rig.state.ready)
        rig.engine.onBluetooth(on = true, permission = true)
        rig.ready()
        assertEquals(ReadyStatus.PedalToStart, rig.state.ready)
        assertTrue(rig.state.trainerConnected)
    }
}
