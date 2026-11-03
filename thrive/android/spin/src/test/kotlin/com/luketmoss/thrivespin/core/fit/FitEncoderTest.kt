package com.luketmoss.thrivespin.core.fit

import com.garmin.fit.ActivityMesg
import com.garmin.fit.ActivityMesgListener
import com.garmin.fit.Decode
import com.garmin.fit.DeviceInfoMesg
import com.garmin.fit.DeviceInfoMesgListener
import com.garmin.fit.Event
import com.garmin.fit.EventMesg
import com.garmin.fit.EventMesgListener
import com.garmin.fit.EventType
import com.garmin.fit.File
import com.garmin.fit.FileIdMesg
import com.garmin.fit.FileIdMesgListener
import com.garmin.fit.LapMesg
import com.garmin.fit.LapMesgListener
import com.garmin.fit.LapTrigger
import com.garmin.fit.MesgBroadcaster
import com.garmin.fit.RecordMesg
import com.garmin.fit.RecordMesgListener
import com.garmin.fit.SessionMesg
import com.garmin.fit.SessionMesgListener
import com.garmin.fit.Sport
import com.garmin.fit.SubSport
import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.summary.RideMetrics
import com.luketmoss.thrivespin.core.summary.Recs
import com.luketmoss.thrivespin.core.summary.Recs.sample
import com.luketmoss.thrivespin.core.summary.StreamsBuilder
import java.io.ByteArrayInputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the Garmin SDK read out of a file. */
private class Decoded(bytes: ByteArray) {
    val records = ArrayList<RecordMesg>()
    val laps = ArrayList<LapMesg>()
    val events = ArrayList<EventMesg>()
    val sessions = ArrayList<SessionMesg>()
    val activities = ArrayList<ActivityMesg>()
    val fileIds = ArrayList<FileIdMesg>()
    val devices = ArrayList<DeviceInfoMesg>()
    val integrity: Boolean

    init {
        integrity = Decode().checkFileIntegrity(ByteArrayInputStream(bytes))
        val decode = Decode()
        val broadcaster = MesgBroadcaster(decode)
        broadcaster.addListener(RecordMesgListener { records += it })
        broadcaster.addListener(LapMesgListener { laps += it })
        broadcaster.addListener(EventMesgListener { events += it })
        broadcaster.addListener(SessionMesgListener { sessions += it })
        broadcaster.addListener(ActivityMesgListener { activities += it })
        broadcaster.addListener(FileIdMesgListener { fileIds += it })
        broadcaster.addListener(DeviceInfoMesgListener { devices += it })
        broadcaster.run(ByteArrayInputStream(bytes))
    }
}

class FitEncoderTest {
    private val steps = listOf(
        Recs.step("Warm-up", 100, pct = 60),
        Recs.step("Sweet spot", 200, pct = 90),
    )

    /** 160 samples: step 0 for 0-99, step 1 (skipped into) from 100; a 45 s pause before second 60; some nulls. */
    private fun ride(): Pair<com.luketmoss.thrivespin.core.ride.recording.RideRecording, com.luketmoss.thrivespin.core.summary.RideSummary> {
        val samples = List(160) { t ->
            sample(
                t,
                power = if (t in 20..24) null else 150 + t % 7,
                target = if (t < 100) 150 else 225,
                cadence = if (t in 30..34) null else 90,
                hr = if (t < 40) null else 120 + t / 10,
                step = if (t < 100) 0 else 1,
            )
        }
        val events = listOf(
            Recs.stepStart(0, 0, "Warm-up"),
            RideEvent("hr_source", 40, Recs.START_MS + 40_000L, RideEvent.fields("address" to "AA:BB", "name" to "HRM-Pro")),
            RideEvent("pause", 60, 1_000L),
            RideEvent("resume", 60, 46_000L),
            Recs.stepStart(100, 1, "Sweet spot", reason = "skip"),
        )
        val r = Recs.recording(samples, events, Recs.session(steps = steps))
        return r to RideMetrics.summarize(r, 250)
    }

    private fun encode(): Triple<ByteArray, com.luketmoss.thrivespin.core.summary.RideSummary, Decoded> {
        val (r, s) = ride()
        val bytes = FitEncoder.encode(r, s, -25_200, "0.1.0")
        return Triple(bytes, s, Decoded(bytes))
    }

    @Test
    fun theFileCarriesTheFitSignatureAndPassesTheIntegrityCheck() {
        val (bytes, _, decoded) = encode()
        assertEquals(".FIT", String(bytes, 8, 4, Charsets.US_ASCII))
        assertEquals(14, bytes[0].toInt())
        assertTrue(decoded.integrity)
        val dataSize = (bytes[4].toInt() and 0xFF) or ((bytes[5].toInt() and 0xFF) shl 8) or ((bytes[6].toInt() and 0xFF) shl 16) or ((bytes[7].toInt() and 0xFF) shl 24)
        assertEquals(bytes.size - 14 - 2, dataSize)
    }

    @Test
    fun aCorruptedByteFailsTheIntegrityCheck() {
        val (bytes, _, _) = encode()
        val bad = bytes.copyOf().also { it[60] = (it[60] + 1).toByte() }
        assertFalse(Decode().checkFileIntegrity(ByteArrayInputStream(bad)))
    }

    @Test
    fun fileIdIsAnActivity() {
        val (_, _, d) = encode()
        assertEquals(1, d.fileIds.size)
        assertEquals(File.ACTIVITY, d.fileIds[0].type)
        assertEquals("Thrive Spin", d.fileIds[0].productName)
    }

    @Test
    fun oneRecordPerSampleWithTheNullsAsInvalidValuesNeverZero() {
        val (_, _, d) = encode()
        assertEquals(160, d.records.size)
        assertNull(d.records[20].power)
        assertNull(d.records[24].power)
        assertEquals(150 + 25 % 7, d.records[25].power)
        assertNull(d.records[30].cadence)
        assertEquals(90, d.records[35].cadence.toInt())
        assertNull(d.records[0].heartRate)
        assertEquals(124, d.records[40].heartRate.toInt())
    }

    @Test
    fun timestampsAreStrictlyOneSecondApartAndJumpByThePauseAcrossIt() {
        val (_, _, d) = encode()
        val stamps = d.records.map { it.timestamp.timestamp }
        for (i in 1 until stamps.size) {
            if (i == 60) {
                assertEquals("the jump across the 45 s pause", 1L + 45, stamps[i] - stamps[i - 1])
            } else {
                assertEquals("second $i", 1L, stamps[i] - stamps[i - 1])
            }
        }
        val start = java.time.Instant.parse(Recs.START_UTC).epochSecond - FitEncoder.FIT_EPOCH_OFFSET_S
        assertEquals(start, stamps[0])
    }

    @Test
    fun timerEventsSurroundEachPause() {
        val (_, _, d) = encode()
        val timer = d.events.filter { it.event == Event.TIMER }
        assertEquals(listOf(EventType.START, EventType.STOP_ALL, EventType.START, EventType.STOP_ALL), timer.map { it.eventType })
        val lastBefore = d.records[59].timestamp.timestamp
        assertEquals(lastBefore + 1, timer[1].timestamp.timestamp)
        assertEquals(lastBefore + 1 + 45, timer[2].timestamp.timestamp)
        assertEquals(d.records[60].timestamp.timestamp, timer[2].timestamp.timestamp)
        assertEquals(d.records[159].timestamp.timestamp + 1, timer[3].timestamp.timestamp)
    }

    @Test
    fun oneLapPerStepWithTheTriggerThatEndedIt() {
        val (_, _, d) = encode()
        assertEquals(2, d.laps.size)
        assertEquals(LapTrigger.MANUAL, d.laps[0].lapTrigger)
        assertEquals(LapTrigger.SESSION_END, d.laps[1].lapTrigger)
        assertEquals(100f, d.laps[0].totalTimerTime, 0f)
        assertEquals(145f, d.laps[0].totalElapsedTime, 0f)
        assertEquals(60f, d.laps[1].totalTimerTime, 0f)
        assertEquals(Sport.CYCLING, d.laps[0].sport)
        assertEquals(SubSport.INDOOR_CYCLING, d.laps[0].subSport)
        assertEquals(d.records[0].timestamp.timestamp, d.laps[0].startTime.timestamp)
        assertEquals(d.records[100].timestamp.timestamp, d.laps[1].startTime.timestamp)
        // The heart rate average leaves out the seconds with no reading.
        val hrs = (40 until 100).map { 120 + it / 10 }
        assertEquals(Math.round(hrs.average()).toInt(), d.laps[0].avgHeartRate.toInt())
        assertEquals(hrs.max(), d.laps[0].maxHeartRate.toInt())
    }

    @Test
    fun theSessionEqualsTheSummary() {
        val (_, s, d) = encode()
        assertEquals(1, d.sessions.size)
        val session = d.sessions[0]
        assertEquals(Sport.CYCLING, session.sport)
        assertEquals(SubSport.INDOOR_CYCLING, session.subSport)
        assertEquals(s.avgPowerW, session.avgPower)
        assertEquals(s.npW, session.normalizedPower)
        assertEquals(s.tss!!.toFloat(), session.trainingStressScore, 0.001f)
        assertEquals(s.intensityFactor!!.toFloat(), session.intensityFactor, 0.0001f)
        assertEquals(s.ftpW, session.thresholdPower)
        assertEquals(s.workJ, session.totalWork)
        assertEquals(s.movingS.toFloat(), session.totalTimerTime, 0f)
        assertEquals(s.elapsedS.toFloat(), session.totalElapsedTime, 0f)
        assertEquals(s.avgHr, session.avgHeartRate.toInt())
        assertEquals(s.maxHr, session.maxHeartRate.toInt())
        assertEquals(s.avgCadence, session.avgCadence.toInt())
        assertEquals(2, session.numLaps)
        assertEquals(s.maxPowerW, session.maxPower)
    }

    @Test
    fun anActivityMessageClosesTheFile() {
        val (_, s, d) = encode()
        assertEquals(1, d.activities.size)
        assertEquals(s.movingS.toFloat(), d.activities[0].totalTimerTime, 0f)
        assertEquals(1, d.activities[0].numSessions)
        assertEquals(Event.ACTIVITY, d.activities[0].event)
        // The local timestamp is the phone's zone: UTC-7 here.
        assertEquals(d.activities[0].timestamp.timestamp - 25_200, d.activities[0].localTimestamp)
    }

    @Test
    fun deviceInfoNamesThePhoneTheTrainerAndTheHeartRateMonitor() {
        val (_, _, d) = encode()
        assertEquals(listOf("Thrive Spin", "KICKR CORE 1A2B", "HRM-Pro"), d.devices.map { it.productName })
        assertEquals(10, d.devices[0].softwareVersion.let { (it * 100).toInt() })
    }

    @Test
    fun aTwelveHourRideIsUnderFiveMegabytesWithStreamsUnderFour() {
        val n = 43_200
        val samples = List(n) { t -> sample(t, 100 + t % 900, 150, hr = 100 + t % 90, cadence = 60 + t % 40) }
        val r = Recs.recording(samples, listOf(Recs.stepStart(0, 0, "Sweet spot")))
        val s = RideMetrics.summarize(r, 250)
        val fit = FitEncoder.encode(r, s, 0, "0.1.0")
        assertTrue("FIT ${fit.size}", fit.size < 5_000_000)
        val streams = StreamsBuilder.build(r, s)!!
        assertTrue("streams ${streams.bytes.size}", streams.bytes.size < 4_000_000)
        assertTrue(Decoded(fit).integrity)
        assertEquals(n, Decoded(fit).records.size)
    }

    @Test
    fun aOneSecondRideEncodes() {
        val r = Recs.recording(listOf(sample(0, 120, 150)), listOf(Recs.stepStart(0, 0, "Sweet spot")))
        val s = RideMetrics.summarize(r, 250)
        val d = Decoded(FitEncoder.encode(r, s, 0, "0.1.0"))
        assertTrue(d.integrity)
        assertEquals(1, d.records.size)
        assertEquals(1, d.laps.size)
    }

    @Test
    fun theSameRecordingAlwaysEncodesToTheSameBytes() {
        val (r, s) = ride()
        assertArrayEquals(FitEncoder.encode(r, s, 0, "0.1.0"), FitEncoder.encode(r, s, 0, "0.1.0"))
    }
}
