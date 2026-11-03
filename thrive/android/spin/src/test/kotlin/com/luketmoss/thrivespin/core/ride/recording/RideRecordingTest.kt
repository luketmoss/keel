package com.luketmoss.thrivespin.core.ride.recording

import com.luketmoss.thrivespin.core.ride.FakeClock
import com.luketmoss.thrivespin.core.ride.MemorySink
import com.luketmoss.thrivespin.core.ride.RideBanner
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RestoreData
import com.luketmoss.thrivespin.core.ride.Rig
import com.luketmoss.thrivespin.core.ride.pct
import com.luketmoss.thrivespin.core.ride.session
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RideRecordingTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun store() = FileRideStore(File(tmp.root, "rides"))

    /** A ride of [seconds] seconds recorded to disk, left running (as if the process were killed). */
    private fun rideOnDisk(store: FileRideStore, seconds: Int, id: String = "ride-1", finish: Boolean = false): Rig {
        val s = session(pct(durS = 3600)).copy(rideId = id)
        val rig = Rig(s, sink = MemorySink(store.recorder(id)))
        rig.start()
        rig.seconds(seconds)
        if (finish) rig.engine.end()
        return rig
    }

    @Test
    fun aRideWritesTheThreeFilesInTheNotesShape() {
        val store = store()
        val rig = rideOnDisk(store, 4)
        rig.engine.onTrainerDisconnected()
        rig.idle(1_000)
        rig.engine.pause()
        rig.engine.resume()
        rig.engine.adjustIntensity(+1)
        rig.engine.end()

        val dir = store.dir("ride-1")
        val meta = File(dir, "meta.json").readText()
        assertTrue(meta.contains("\"format\":\"thrive-spin-ride\""))
        assertTrue(meta.contains("\"v\":1"))
        assertTrue(meta.contains("\"ride_id\":\"ride-1\""))
        assertTrue(meta.contains("\"kind\":\"workout\""))
        assertTrue(meta.contains("\"state\":\"finished\""))
        assertTrue(meta.contains("\"end_reason\":\"ended\""))
        assertTrue(meta.contains("\"handed_off\":false"))
        assertTrue(meta.contains("\"trainer\":{\"name\":\"KICKR CORE 1A2B\""))
        assertTrue(meta.contains("\"started_at_utc\":\"2026-"))
        assertFalse(File(dir, "meta.json.tmp").exists())

        val lines = File(dir, "samples.csv").readLines()
        assertEquals("t,epoch_ms,step,power_w,target_w,cadence_rpm,hr_bpm,intensity_pct,trainer", lines[0])
        // Power 150, target 225, cadence 90, no heart rate, 100%, trainer connected.
        assertEquals("0,${rig.sink.samples[0].epochMs},0,150,225,90,,100,1", lines[1])
        // After the trainer was lost the cells are empty and the flag is 0.
        assertTrue(lines.last().endsWith(",,225,,,100,0"))

        val events = File(dir, "events.jsonl").readLines()
        assertEquals("step_start", RideEvent.fromJson(events[0])!!.type)
        assertTrue(events[0].contains("\"mode\":\"erg\""))
        assertTrue(events[0].contains("\"reason\":\"start\""))
        assertEquals(
            listOf("step_start", "trainer_lost", "pause", "resume", "intensity", "end"),
            events.map { RideEvent.fromJson(it)!!.type },
        )
    }

    @Test
    fun theReaderSkipsATruncatedLastLine() {
        val store = store()
        rideOnDisk(store, 3)
        val dir = store.dir("ride-1")
        File(dir, "samples.csv").appendText("3,1794063735000,0,15")
        File(dir, "events.jsonl").appendText("{\"type\":\"pause\",\"at_s\":3,\"epo")
        val recording = store.open("ride-1")
        assertEquals(listOf(0, 1, 2), recording.samples.map { it.t })
        assertEquals(listOf("step_start"), recording.events.map { it.type })
        // A row that is whole is still read, and an empty cell is a null.
        assertNull(Sample.fromCsv("1,2,0,,,,,100,1")!!.powerW)
        assertNull(Sample.fromCsv("1,2,0,100,,,,100,"))
    }

    @Test
    fun anInProgressFolderWithNoSamplesIsDeleted() {
        val store = store()
        val recorder = store.recorder("ride-1")
        val rig = Rig(session(pct(durS = 600)), sink = MemorySink(recorder))
        rig.start()
        assertTrue(store.dir("ride-1").exists())
        // The process dies here; its open files go with it.
        recorder.close()
        val outcome = RideRecovery.run(store, rig.clock.wall + 5_000)
        assertNull(outcome.resume)
        assertTrue(outcome.handOff.isEmpty())
        assertFalse(store.dir("ride-1").exists())
    }

    @Test
    fun aRideWhoseLastSampleIsTenMinutesOldComesBackPausedWithTheGapRecorded() {
        val store = store()
        val first = rideOnDisk(store, 20)
        val lastEpoch = first.sink.samples.last().epochMs
        val now = lastEpoch + 600_000
        val outcome = RideRecovery.run(store, now)
        val recording = outcome.resume!!
        assertEquals(20, recording.samples.size)
        assertTrue(outcome.handOff.isEmpty())

        val restore = RestoreData.from(recording, startedAtMs = first.sink.samples.first().epochMs)
        val rig = Rig(
            recording.meta.session,
            sink = MemorySink(store.reopen("ride-1")),
            restore = restore,
            clock = FakeClock(wall = now),
        )
        assertEquals(RidePhase.Paused, rig.state.phase)
        assertEquals(RideBanner.Interrupted(20), rig.state.banner)
        assertEquals(20, rig.state.rideS)
        val interrupted = rig.sink.events("interrupted").single()
        assertEquals(599, interrupted.int("gap_s"))
        assertEquals(lastEpoch + 1000, interrupted.epochMs)
        assertEquals(1, rig.sink.events("pause").size)

        // It reconnects, resumes, and carries on from the next second; the pause covers the gap.
        rig.ready()
        rig.engine.resume()
        rig.answerAll()
        assertNull(rig.state.banner)
        rig.pedal()
        rig.seconds(3)
        val after = store.open("ride-1")
        assertEquals((0..22).toList(), after.samples.map { it.t })
        val pause = after.events.last { it.type == "pause" }
        val resume = after.events.last { it.type == "resume" }
        assertTrue(resume.epochMs - pause.epochMs >= 599_000)
        assertEquals(RideFileState.InProgress, after.meta.state)
    }

    @Test
    fun aRideTwoHoursOldIsFinishedAsInterruptedAndHandedOffOldestFirst() {
        val store = store()
        val first = rideOnDisk(store, 15, id = "ride-a")
        val lastEpoch = first.sink.samples.last().epochMs
        rideOnDisk(store, 8, id = "ride-b", finish = true)
        assertEquals(false, store.open("ride-b").meta.handedOff)

        val outcome = RideRecovery.run(store, lastEpoch + 2 * 3_600_000L)
        assertNull(outcome.resume)
        val interrupted = store.open("ride-a")
        assertEquals(RideFileState.Finished, interrupted.meta.state)
        assertEquals("interrupted", interrupted.meta.endReason)
        assertEquals("interrupted", interrupted.events.last().text("reason"))
        assertEquals(15, interrupted.samples.size)
        assertEquals(setOf("ride-a", "ride-b"), outcome.handOff.toSet())
        assertEquals(2, outcome.handOff.size)
        assertEquals(RideKind.Workout, interrupted.meta.kind)

        store.markHandedOff("ride-a")
        store.markHandedOff("ride-b")
        assertTrue(RideRecovery.run(store, lastEpoch + 3 * 3_600_000L).handOff.isEmpty())
        assertEquals(true, store.open("ride-a").meta.handedOff)
        // #768 never deletes a finished recording.
        assertTrue(store.dir("ride-a").exists() && store.dir("ride-b").exists())
    }

    @Test
    fun aRestoredRideKeepsItsStepIntensityAndLevel() {
        val store = store()
        val s = session(pct("A", durS = 60), pct("B", 60, durS = 600), mode = com.luketmoss.thrivespin.core.workout.TrainerMode.Resistance).copy(rideId = "ride-1")
        val first = Rig(s, sink = MemorySink(store.recorder("ride-1")))
        first.start()
        first.seconds(10)
        first.engine.adjustIntensity(+3)
        first.engine.adjustModeSetting(+1)
        first.engine.skipStep()
        first.seconds(5)
        val recording = store.open("ride-1")
        val restore = RestoreData.from(recording, first.sink.samples.first().epochMs)
        assertEquals(1, restore.stepIndex)
        assertEquals(10, restore.stepStartS)
        assertEquals(103, restore.intensityPct)
        assertEquals(35, restore.modeLevel)
        val rig = Rig(recording.meta.session, sink = MemorySink(store.reopen("ride-1")), restore = restore, clock = FakeClock(wall = first.clock.wall + 60_000))
        assertEquals("B", rig.state.stepLabel)
        assertEquals(103, rig.state.intensityPct)
        assertEquals(35, rig.state.modeLevel)
        assertEquals(5, rig.state.stepSecond)
    }

    @Test
    fun theStoreListsEveryFolderAndSkipsOnesItCannotRead() {
        val store = store()
        rideOnDisk(store, 2, id = "ride-a")
        File(store.dir("junk"), "x").also { it.parentFile.mkdirs(); it.writeText("nope") }
        val list = store.list()
        assertEquals(listOf("ride-a"), list.map { it.id })
        assertEquals(RideFileState.InProgress, list.single().state)
    }
}
