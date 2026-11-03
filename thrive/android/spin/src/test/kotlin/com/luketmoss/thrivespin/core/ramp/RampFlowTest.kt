package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.DeviceKind
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.SavedDevice
import com.luketmoss.thrivespin.core.ftp.FtpNow
import com.luketmoss.thrivespin.core.ftp.FtpQueue
import com.luketmoss.thrivespin.core.ftp.FtpRecord
import com.luketmoss.thrivespin.core.ftp.FtpStage
import com.luketmoss.thrivespin.core.ftp.FtpStore
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RestoreData
import com.luketmoss.thrivespin.core.ride.Rig
import com.luketmoss.thrivespin.core.ride.StartOutcome
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.ride.recording.RideFileState
import com.luketmoss.thrivespin.core.ride.recording.RideJson
import com.luketmoss.thrivespin.core.summary.Recs
import com.luketmoss.thrivespin.core.upload.FileRideUploads
import com.luketmoss.thrivespin.core.upload.Preparation
import com.luketmoss.thrivespin.core.upload.SaveBlock
import com.luketmoss.thrivespin.core.upload.SaveResult
import com.luketmoss.thrivespin.core.upload.SummaryHandler
import com.luketmoss.thrivespin.core.upload.UploadFiles
import java.io.File
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RampFlowTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val clock = 1_794_067_000_000L
    private lateinit var store: FileRideStore
    private lateinit var files: RampFiles
    private lateinit var queue: FtpQueue
    private lateinit var decider: RampDecider

    private fun setUp() {
        store = FileRideStore(File(tmp.root, "rides"))
        files = RampFiles(store)
        queue = FtpQueue(FtpStore(File(tmp.root, "ftp")), { clock })
        decider = RampDecider(store, files, queue)
    }

    private fun write(id: String = "ride-1", power: List<Int?> = RampRecs.onTarget(480), cool: Int = 120, toCool: String? = "skip") {
        Recs.write(store, RampRecs.recording(power = power, cool = cool, toCool = toCool, id = id))
    }

    // ---- ramp.json ----

    @Test
    fun theResultIsFrozenIntoRampJsonAndReadsTheSameAfterARestart() {
        setUp()
        write()
        val file = files.ensure("ride-1")!!
        val json = Json.parseToJsonElement(File(store.dir("ride-1"), "ramp.json").readText()).jsonObject
        assertEquals(1, json["v"]!!.jsonPrimitive.content.toInt())
        val result = json["result"] as JsonObject
        assertEquals(
            listOf("best_minute_w", "computed_ftp_w", "lasted_s", "last_step_w", "max_hr", "end", "null_power_s"),
            result.keys.toList(),
        )
        assertEquals(240, result["best_minute_w"]!!.jsonPrimitive.content.toInt())
        assertEquals(180, result["computed_ftp_w"]!!.jsonPrimitive.content.toInt())
        assertEquals(480, result["lasted_s"]!!.jsonPrimitive.content.toInt())
        assertEquals("skip", result["end"]!!.jsonPrimitive.content)
        assertEquals(false, json["kept"]!!.jsonPrimitive.content.toBoolean())
        // A new process reads the file, not the recording.
        val again = RampFiles(FileRideStore(File(tmp.root, "rides"))).ensure("ride-1")!!
        assertEquals(file, again)
        assertEquals(RampOutcome.Measured(240, 180, 480, RampTest.stairW(7), null, RampEnd.Tap, 0), again.outcome())
    }

    @Test
    fun aTooShortTestIsStoredWithANullResult() {
        setUp()
        write(power = RampRecs.onTarget(30))
        val file = files.ensure("ride-1")!!
        assertNull(file.result)
        assertEquals(RampOutcome.TooShort(noReadings = false, lastedS = 30), file.outcome())
        assertTrue(File(store.dir("ride-1"), "ramp.json").readText().contains("\"result\":null"))
    }

    @Test
    fun nothingIsFrozenWhileTheRampIsStillGoing() {
        setUp()
        Recs.write(store, RampRecs.recording(power = RampRecs.onTarget(120), toCool = null))
        // The recorder wrote it finished; make it an in-progress ride with no cool-down yet.
        val meta = store.readMeta("ride-1")
        com.luketmoss.thrivespin.core.ride.recording.FileRideRecorder.writeMeta(
            store.dir("ride-1"),
            meta.copy(state = RideFileState.InProgress, finishedAtUtc = null, endReason = null),
        )
        assertNull(files.ensure("ride-1"))
        assertFalse(File(store.dir("ride-1"), "ramp.json").exists())
    }

    @Test
    fun theSteppersValueIsKeptAsItChanges() {
        setUp()
        write()
        files.adjust("ride-1", 185)
        assertEquals(185, files.read("ride-1")!!.adjustedFtpW)
        assertEquals(240, files.read("ride-1")!!.result!!.bestMinuteW)
    }

    // ---- The two decisions ----

    @Test
    fun settingTheFtpWritesTheRecordThenRampJsonAndTheRideIsScoredAtIt() {
        setUp()
        write()
        files.ensure("ride-1")
        assertEquals(RampDecision.Pending, decider.decision("ride-1"))
        assertNull(decider.finalFtp("ride-1"))
        val set = decider.setFtp("ride-1", 185, 180, FtpNow(250, "2026-10-12", "manual", false))!!
        assertEquals(185, set.ftpW)
        val record = queue.record("ftp_ride-1")!!
        assertEquals(185, record.ftpW)
        assertEquals(180, record.computedW)
        assertEquals("2026-11-07", record.date)
        assertEquals(250, record.previousW)
        assertEquals(185, files.read("ride-1")!!.finalFtpW)
        assertTrue(files.read("ride-1")!!.set)
        assertEquals(185, decider.finalFtp("ride-1"))
        // A repeated tap is one record, and the result cannot return to the stepper.
        decider.setFtp("ride-1", 190, 180, null)
        assertEquals(1, queue.records.value.size)
        assertEquals(185, queue.record("ftp_ride-1")!!.ftpW)
        assertTrue(decider.decision("ride-1") is RampDecision.Set)
    }

    @Test
    fun aProcessThatDiedBetweenTheRecordAndRampJsonReopensInTheSetState() {
        setUp()
        write()
        files.ensure("ride-1")
        // Only the first step happened: the record exists, ramp.json was never told.
        queue.confirm("ride-1", store.readMeta("ride-1").startedAtUtc!!, 185, 180, null)
        assertFalse(files.read("ride-1")!!.set)
        val decision = decider.decision("ride-1")
        assertEquals(RampDecision.Set(185, queue.record("ftp_ride-1")), decision)
    }

    @Test
    fun onceThriveHasTheFtpAndTheRecordIsGoneTheDecisionIsStillSet() {
        setUp()
        write()
        files.ensure("ride-1")
        decider.setFtp("ride-1", 185, 180, null)
        queue.drop("ftp_ride-1")
        assertEquals(RampDecision.Set(185, null), decider.decision("ride-1"))
        assertEquals(185, decider.finalFtp("ride-1"))
    }

    @Test
    fun keepingWritesNothingToTheQueueAndScoresTheRideAtTheKeptFtp() {
        setUp()
        write()
        files.ensure("ride-1")
        val kept = decider.keep("ride-1", 250)!!
        assertEquals(250, kept.ftpW)
        assertTrue(queue.records.value.isEmpty())
        assertTrue(files.read("ride-1")!!.kept)
        assertEquals(RampDecision.Kept(250), decider.decision("ride-1"))
        assertEquals(250, decider.finalFtp("ride-1"))
    }

    // ---- The ride is scored at the FTP in force after the decision ----

    private fun uploads() = FileRideUploads(store, { clock }, "0.1.0", { 0 })

    @Test
    fun aRampTestWithADecidedFtpIsNeverNoFtpFromAnyWayOfOpeningItsSummary() {
        setUp()
        write()
        val uploads = uploads()
        // Before the decision there is no FTP to score it at.
        val blocked = uploads.prepare("ride-1") as Preparation.Ready
        assertEquals(SaveBlock.NoFtp, blocked.block)
        assertNull(blocked.summary.ftpW)
        files.ensure("ride-1")
        decider.setFtp("ride-1", 185, 180, null)
        // Continue prepares with the final FTP.
        val ready = uploads.prepare("ride-1", decider.finalFtp("ride-1")) as Preparation.Ready
        assertNull(ready.block)
        assertEquals(185, ready.summary.ftpW)
        assertNotNull(ready.summary.intensityFactor)
        assertNotNull(ready.summary.tss)
        // The handler, the banner, Later and back each open it again, passing the same final FTP; a bare open keeps what was prepared.
        repeat(3) {
            val again = uploads.prepare("ride-1", decider.finalFtp("ride-1")) as Preparation.Ready
            assertEquals(185, again.summary.ftpW)
            assertNull(again.block)
        }
        val bare = uploads.prepare("ride-1") as Preparation.Ready
        assertEquals(185, bare.summary.ftpW)
        assertNull(bare.block)
        // Saved, the payload, the streams file and the FIT file carry it.
        assertEquals(SaveResult.Queued, uploads.save("ride-1", null, ""))
        val state = uploads.current("ride-1")!!
        assertEquals(185, state.ftpW)
        val payload = Json.parseToJsonElement(state.payload!!).jsonObject
        assertEquals(185, payload["ftp_w"]!!.jsonPrimitive.content.toInt())
        assertEquals("Ramp test", payload["name"]!!.jsonPrimitive.content)
        assertEquals("", payload["ride_workout_id"]!!.jsonPrimitive.content)
        val streams = Json.parseToJsonElement(File(store.dir("ride-1"), UploadFiles.STREAMS).readText()).jsonObject
        assertEquals(185, streams["ftp_w"]!!.jsonPrimitive.content.toInt())
        val fit = File(store.dir("ride-1"), UploadFiles.FIT).readBytes()
        assertTrue(fit.size > 14)
    }

    @Test
    fun aKeptFtpScoresTheRideAtTheKeptValue() {
        setUp()
        write()
        files.ensure("ride-1")
        decider.keep("ride-1", 250)
        val ready = uploads().prepare("ride-1", decider.finalFtp("ride-1")) as Preparation.Ready
        assertEquals(250, ready.summary.ftpW)
    }

    // ---- The hand-off ----

    @Test
    fun theHandlerOpensARampResultAndLeavesItUnhandedOffUntilContinue() {
        val kinds = mapOf("w1" to RideKind.Workout, "ramp" to RideKind.RampTest, "done" to RideKind.RampTest)
        val marked = ArrayList<String>()
        val summaries = ArrayList<String>()
        val results = ArrayList<String>()
        val handedOff = setOf("done")
        val handler = SummaryHandler({ kinds[it] }, { marked += it }, { summaries += it }, { results += it }, { it in handedOff })
        listOf("ramp", "w1", "done", "unknown").forEach { handler.onFinished(it) }
        assertEquals(listOf("ramp"), results)
        assertEquals(listOf("w1"), summaries)
        assertEquals(listOf("w1"), marked)
        // Un-handed-off, it is presented again at each app open.
        handler.onFinished("ramp")
        assertEquals(listOf("ramp", "ramp"), results)
    }

    @Test
    fun aRampTestIsOnTheBannerOnlyOnceItsSummaryHasBeenPrepared() {
        setUp()
        write()
        val uploads = uploads()
        assertTrue(uploads.pending().isEmpty())
        files.ensure("ride-1")
        decider.setFtp("ride-1", 185, 180, null)
        uploads.prepare("ride-1", 185)
        assertEquals(listOf("ride-1"), uploads.pending().map { it.rideId })
    }

    // ---- Starting ----

    @Test
    fun startingFollowsNumberSevenSixtyEightsRules() {
        val trainer = SavedDevice("AA", "KICKR", DeviceKind.Trainer)
        var active = false
        val launched = ArrayList<String>()
        var next = 0
        fun launcher(devices: DeviceState) = RampLauncher({ devices }, { active }, { "ride-${++next}" }, { launched += it.rideId })
        assertEquals(StartOutcome.NoTrainer, launcher(DeviceState()).start())
        assertTrue(launched.isEmpty())
        active = true
        assertEquals(StartOutcome.AlreadyRiding, launcher(DeviceState(trainer = trainer)).start())
        assertTrue(launched.isEmpty())
        active = false
        val started = launcher(DeviceState(trainer = trainer)).start() as StartOutcome.Started
        assertEquals(listOf(started.session.rideId), launched)
        assertEquals(RideKind.RampTest, started.session.kind)
    }

    // ---- The ramp screen's state model ----

    private fun rig() = Rig(RampTest.session("ride-1"))

    @Test
    fun gettingReadyShowsTheWarmupLayoutBehindTheTableAndCancel() {
        val rig = rig()
        val v = RampScreenStates.of(rig.state, null, null, false)
        assertEquals(RampPhase.Ready, v.phase)
        assertEquals("5:00", v.big)
        assertEquals("left in warm-up", v.bigCaption)
        assertEquals("Connecting to KICKR CORE 1A2B…", v.ready)
        assertEquals("Cancel", v.endLabel)
        assertNull(v.button)
    }

    @Test
    fun warmupShowsTheTimeInWarmupAndStartTheRamp() {
        val rig = rig()
        rig.start()
        rig.seconds(168)
        val v = RampScreenStates.of(rig.state, null, null, false)
        assertEquals(RampPhase.Warmup, v.phase)
        assertEquals("Warm-up", v.title)
        assertEquals("2:48 in", v.right)
        assertEquals("2:12", v.big)
        assertEquals("left in warm-up", v.bigCaption)
        assertEquals("Warm up at an easy pace. After this the power rises 20 W every minute.", v.hint)
        assertEquals(RampButton.StartRamp, v.button)
        assertEquals("Start the ramp", v.buttonLabel)
        assertTrue(v.buttonEnabled)
        assertEquals("End", v.endLabel)
        assertEquals("The test keeps going. Use End to stop.", v.backMessage)
        assertEquals("Warm-up, 100 watts", v.announcement)
    }

    @Test
    fun theRampShowsStepTargetNextStepStairsBestMinuteAndImDoneDisabledForFiveSeconds() {
        val rig = rig()
        rig.start()
        rig.seconds(2)
        rig.engine.skipStep()
        rig.seconds(2)
        var v = RampScreenStates.of(rig.state, null, null, false)
        assertEquals(RampPhase.Ramp, v.phase)
        assertEquals("Step 1", v.title)
        assertEquals("on the ramp 0:02", v.right)
        assertEquals("100", v.big)
        assertEquals("W", v.bigCaption)
        assertEquals(listOf("next step in 0:58 · 120 W"), v.lines)
        assertEquals("I'm done", v.buttonLabel)
        assertFalse(v.buttonEnabled)
        assertNull(v.endLabel)
        assertEquals("—", v.bestValue)
        assertEquals("after the first full minute", v.bestHint)
        assertEquals("The test keeps going.", v.backMessage)
        assertEquals("Ramp, 100 watts", v.announcement)
        rig.seconds(3)
        v = RampScreenStates.of(rig.state, null, null, false)
        assertTrue(v.buttonEnabled)
        // 6:42 into the ramp is the seventh minute: 220 W now and 240 W in 18 s.
        rig.seconds(402 - 5)
        v = RampScreenStates.of(rig.state, null, BestMinute(14280, 60), false)
        assertEquals("Step 7", v.title)
        assertEquals("on the ramp 6:42", v.right)
        assertEquals("220", v.big)
        assertEquals(listOf("next step in 0:18 · 240 W"), v.lines)
        assertEquals("238 W → FTP about 179 W", v.bestValue)
        assertNull(v.bestHint)
        assertEquals("Ramp steps. You are on step 7 of the ramp, 220 watts.", v.stairsDescription)
        assertEquals(7 + 2, v.stairs.size)
        assertEquals(listOf(StairKind.Done, StairKind.Done, StairKind.Done, StairKind.Done, StairKind.Done, StairKind.Done, StairKind.Current, StairKind.Upcoming, StairKind.Upcoming), v.stairs.map { it.kind })
        assertEquals(1f, v.stairs.last().fraction, 0.0001f)
        assertEquals(100f / 260f, v.stairs.first().fraction, 0.0001f)
    }

    @Test
    fun theStairsShowTheLastThirteenStepsAndTheNextTwo() {
        val bars = RampScreenStates.stairs(20)
        assertEquals(13 + 2, bars.size)
        assertEquals(RampTest.stairW(8), bars.first().watts)
        assertEquals(RampTest.stairW(22), bars.last().watts)
        assertEquals(StairKind.Current, bars[12].kind)
        assertEquals(RampTest.stairW(20), bars[12].watts)
        assertEquals(3, RampScreenStates.stairs(0).size)
    }

    @Test
    fun lowCadenceWarnsInWordsAndNullCadenceDoesNot() {
        val rig = rig()
        rig.start()
        rig.seconds(2)
        rig.engine.skipStep()
        rig.second(cadence = 65.0)
        assertTrue(RampScreenStates.of(rig.state, null, null, false).cadenceWarn)
        rig.second(cadence = 90.0)
        assertFalse(RampScreenStates.of(rig.state, null, null, false).cadenceWarn)
        assertEquals("rpm · keep it up", RampText.KEEP_UP)
    }

    @Test
    fun theCooldownShowsTestOverTheResultLineAndSeeYourResult() {
        val rig = rig()
        rig.start()
        rig.seconds(2)
        rig.engine.skipStep()
        rig.seconds(10)
        rig.engine.skipStep()
        rig.seconds(18)
        val measured = RampOutcome.Measured(349, 262, 811, 360, 184, RampEnd.Cadence, 0)
        val v = RampScreenStates.of(rig.state, measured, null, false)
        assertEquals(RampPhase.TestOver, v.phase)
        assertEquals("Test over", v.title)
        assertEquals(listOf("You lasted 13:31", "Your cadence stayed under 60 rpm.", "Cool-down: 9:42 left at 100 W."), v.lines)
        assertEquals("See your result", v.buttonLabel)
        assertTrue(v.stopCooldown)
        assertNull(v.endLabel)
        assertEquals("Cool-down, 100 watts", v.announcement)
        // Until the result is frozen the screen words the reason from the tap it saw.
        val unfrozen = RampScreenStates.of(rig.state, null, null, true)
        assertEquals(listOf("You ended the test.", "Cool-down: 9:42 left at 100 W."), unfrozen.lines)
        assertEquals("The app was closed during the test.", RampText.reason(RampEnd.Closed))
        assertEquals("The test stopped early.", RampText.reason(RampEnd.Stopped))
        assertEquals("You ended the test.", RampText.reason(RampEnd.Tap))
    }

    @Test
    fun aRecoveredPausedRampShowsNoResumeAndOffersTheResultOrDiscard() {
        fun recovered(rampSeconds: Int): Rig {
            val rec = RampRecs.recording(power = RampRecs.onTarget(rampSeconds), toCool = null, state = RideFileState.InProgress)
            return Rig(rec.meta.session, restore = RestoreData.from(rec, Recs.START_MS))
        }
        val long = recovered(90)
        assertEquals(RidePhase.Paused, long.state.phase)
        val v = RampScreenStates.of(long.state, null, null, false)
        assertEquals(RampPhase.Interrupted, v.phase)
        assertEquals(listOf("The test was interrupted at 6:30 when the app was closed."), v.lines)
        assertEquals(RampButton.SeeResult, v.button)
        assertEquals("See your result", v.buttonLabel)
        assertNull(v.endLabel)
        val short = RampScreenStates.of(recovered(30).state, null, null, false)
        assertEquals(RampButton.DiscardTest, short.button)
        assertEquals("Discard test", short.buttonLabel)
        // No Resume button exists on the model at all.
        assertFalse(RampButton.entries.any { it.name.contains("Resume") })
    }

    // ---- The result screen's state model ----

    private val measured = RampOutcome.Measured(349, 262, 811, 360, 184, RampEnd.Tap, 0)
    private val current = FtpNow(250, "2026-10-12", "manual", false)

    private fun inputs(
        outcome: RampOutcome? = measured,
        adjusted: Int? = null,
        decision: RampDecision = RampDecision.Pending,
        now: FtpNow? = current,
        cool: Int? = null,
        setting: Boolean = false,
    ) = ResultInputs(outcome, adjusted, decision, now, cool, "2026-11-07T15:02:11Z", ZoneId.of("America/Denver"), 2026, setting)

    @Test
    fun theResultIsComputingUntilMeasured() {
        val v = ResultStates.of(inputs(outcome = null))
        assertEquals(ResultKind.Computing, v.kind)
        assertEquals(listOf("Measuring your test…"), v.lines)
        assertTrue(v.footer.isEmpty())
    }

    @Test
    fun pendingWithACurrentFtpOffersKeepAndSetAndShowsTheChange() {
        val v = ResultStates.of(inputs())
        assertEquals(ResultKind.Pending, v.kind)
        assertEquals("RAMP TEST · SAT 7 NOV", v.eyebrow)
        assertEquals("Your new FTP", v.heading)
        assertEquals(262, v.ftpW)
        assertEquals("+12 W (+4.8%) since 12 Oct", v.changeLine)
        assertEquals("75% of your best minute (349 W)", v.basisLine)
        assertNull(v.resetLabel)
        assertEquals(listOf("Lasted" to "13:31", "Last step" to "360", "Max HR" to "184"), v.tiles.map { it.label to it.value })
        assertEquals(listOf("", "W", "bpm"), v.tiles.map { it.unit })
        assertTrue(v.discardInContent)
        assertEquals(listOf("Keep 250 W", "Set FTP to 262 W"), v.footer.map { it.label })
        assertEquals(listOf(false, true), v.footer.map { it.filled })
        assertEquals("“Ramp test”, 7 Nov. Your FTP stays 250 W and nothing from the test is saved, here or in Thrive.", v.discardBody)
        assertNull(v.strip)
    }

    @Test
    fun withNoCurrentFtpItIsYourFirstTestAndThereIsNoKeep() {
        val v = ResultStates.of(inputs(now = null))
        assertEquals("Your first FTP test", v.changeLine)
        assertEquals(listOf("Set FTP to 262 W"), v.footer.map { it.label })
        assertEquals("“Ramp test”, 7 Nov. You will still have no FTP.", v.discardBody)
    }

    @Test
    fun theChangeLineReadsPlusMinusAndNoChangeWithOneDecimalHalfUp() {
        fun line(new: Int, old: Int) = ResultText.change(new, FtpNow(old, "2026-10-12", "manual", false), 2026)
        assertEquals("+12 W (+4.8%) since 12 Oct", line(262, 250))
        assertEquals("−8 W (−3.2%) since 12 Oct", line(242, 250))
        assertEquals("No change from 250 W", line(250, 250))
        // 1 W of 200 is 0.5%; 1 W of 300 is 0.333... which is 0.3%; 3 W of 400 is 0.75%, half up to 0.8%.
        assertEquals("+1 W (+0.5%) since 12 Oct", line(201, 200))
        assertEquals("+1 W (+0.3%) since 12 Oct", line(301, 300))
        assertEquals("+3 W (+0.8%) since 12 Oct", line(403, 400))
        assertEquals("−3 W (−0.8%) since 12 Oct", line(397, 400))
        assertEquals("Your first FTP test", ResultText.change(262, null, 2026))
        assertEquals("+12 W (+4.8%) since 12 Oct 2025", ResultText.change(262, FtpNow(250, "2025-10-12", "manual", false), 2026))
    }

    @Test
    fun theStepperMovesOneWattWithinFiftyAndAThousand() {
        assertEquals(263, FtpStepper.step(262, 1))
        assertEquals(261, FtpStepper.step(262, -1))
        assertEquals(50, FtpStepper.step(50, -1))
        assertEquals(1000, FtpStepper.step(1000, 1))
        assertFalse(FtpStepper.canLower(50))
        assertTrue(FtpStepper.canLower(51))
        assertFalse(FtpStepper.canHigher(1000))
        assertTrue(FtpStepper.canHigher(999))
        val low = ResultStates.of(inputs(adjusted = 50))
        assertFalse(low.canLower)
        assertTrue(low.canHigher)
        val high = ResultStates.of(inputs(adjusted = 1000))
        assertTrue(high.canLower)
        assertFalse(high.canHigher)
    }

    @Test
    fun adjustedByYouAndResetShowOnlyWhenTheValueDiffersFromTheComputedOne() {
        val same = ResultStates.of(inputs(adjusted = 262))
        assertEquals("75% of your best minute (349 W)", same.basisLine)
        assertNull(same.resetLabel)
        val moved = ResultStates.of(inputs(adjusted = 265))
        assertEquals("75% of your best minute (349 W), adjusted by you", moved.basisLine)
        assertEquals("Reset to 262 W", moved.resetLabel)
        assertEquals(262, moved.resetTo)
        assertEquals("Set FTP to 265 W", moved.footer.last().label)
        assertEquals("+15 W (+6.0%) since 12 Oct", moved.changeLine)
        assertEquals("265 watts", moved.valueAnnouncement)
    }

    @Test
    fun aComputedFtpUnderFiftyIsClampedAndOnlyAdjustedOnceMoved() {
        val low = RampOutcome.Measured(60, 45, 90, 100, null, RampEnd.Tap, 0)
        val v = ResultStates.of(inputs(outcome = low))
        assertEquals(50, v.ftpW)
        assertEquals("75% of your best minute (60 W)", v.basisLine)
        assertNull(v.resetLabel)
        assertEquals("Max HR", v.tiles.last().label)
        assertEquals("—", v.tiles.last().value)
        assertEquals("No heart rate", v.tiles.last().unit)
    }

    @Test
    fun dropoutsAddTheirLine() {
        val v = ResultStates.of(inputs(outcome = measured.copy(nullPowerS = 7)))
        assertEquals("The trainer dropped out for 7 s during the test, so the best minute may be low.", v.dropoutLine)
        assertNull(ResultStates.of(inputs()).dropoutLine)
    }

    @Test
    fun tooShortOffersOnlyDiscardTest() {
        val short = ResultStates.of(inputs(outcome = RampOutcome.TooShort(noReadings = false, lastedS = 30)))
        assertEquals(ResultKind.TooShort, short.kind)
        assertEquals("Not enough to measure", short.heading)
        assertEquals(listOf("The test ended before a full minute of the ramp was ridden."), short.lines)
        assertNull(short.ftpW)
        assertEquals(listOf("Discard test"), short.footer.map { it.label })
        assertEquals(ResultAction.DiscardTest, short.footer.single().action)
        assertTrue(short.footer.single().filled)
        assertTrue(short.tiles.isEmpty())
        val missing = ResultStates.of(inputs(outcome = RampOutcome.TooShort(noReadings = true, lastedS = 90)))
        assertEquals(listOf("There weren't enough power readings to find a best minute."), missing.lines)
    }

    @Test
    fun setAndKeptStatesCannotReturnToTheStepper() {
        val record = FtpRecord(id = "ftp_ride-1", state = FtpStage.Queued, date = "2026-11-07", ftpW = 262, rideId = "ride-1", computedW = 262, createdAtUtc = "t")
        val set = ResultStates.of(inputs(decision = RampDecision.Set(262, record)))
        assertEquals(ResultKind.Set, set.kind)
        assertEquals("FTP is now 262 W", set.heading)
        assertNull(set.ftpW)
        assertEquals(
            listOf("Spin uses it now. Saved on phone, not yet in Thrive · sends when online.", "Past rides keep the FTP they were ridden at."),
            set.lines,
        )
        assertEquals(listOf("Continue"), set.footer.map { it.label })
        assertEquals(3, set.tiles.size)
        assertFalse(set.discardInContent)
        val sent = ResultStates.of(inputs(decision = RampDecision.Set(262, null)))
        assertEquals("Spin uses it now. Added to Thrive's FTP history.", sent.lines.first())
        val kept = ResultStates.of(inputs(decision = RampDecision.Kept(250)))
        assertEquals(ResultKind.Kept, kept.kind)
        assertEquals("FTP stays 250 W", kept.heading)
        assertEquals(listOf("Nothing was changed in Thrive."), kept.lines)
        assertEquals(listOf("Continue"), kept.footer.map { it.label })
    }

    @Test
    fun whileTheCooldownRunsTheStripShowsAndContinueStopsItFirst() {
        val running = ResultStates.of(inputs(cool = 462))
        assertEquals("Cooling down · 7:42 left", running.strip)
        val set = ResultStates.of(inputs(decision = RampDecision.Set(262, null), cool = 462))
        assertEquals(listOf("Stop cool-down and continue"), set.footer.map { it.label })
        assertNull(ResultStates.of(inputs(decision = RampDecision.Set(262, null))).strip)
    }

    @Test
    fun aTapOnSetDisablesBothButtonsUntilTheStateChanges() {
        val v = ResultStates.of(inputs(setting = true))
        assertTrue(v.footer.none { it.enabled })
    }

    @Test
    fun theDiscardBodyNamesTheTestAndWhatStays() {
        assertEquals(
            "“Ramp test”, 7 Nov. Your FTP stays 250 W and nothing from the test is saved, here or in Thrive.",
            ResultText.discardBody("7 Nov", current),
        )
        assertEquals("“Ramp test”, 7 Nov. You will still have no FTP.", ResultText.discardBody("7 Nov", null))
        assertEquals(RideJson.encodeToString(RampFile.serializer(), RampFile()).contains("\"v\":1"), true)
    }
}
