package com.luketmoss.thrivespin.core.ramp

import com.garmin.fit.Decode
import com.garmin.fit.MesgBroadcaster
import com.garmin.fit.SessionMesg
import com.garmin.fit.SessionMesgListener
import com.luketmoss.thrivespin.core.ftp.FtpQueue
import com.luketmoss.thrivespin.core.ftp.FtpStore
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.summary.Recs
import com.luketmoss.thrivespin.core.upload.FileRideUploads
import com.luketmoss.thrivespin.core.upload.Preparation
import com.luketmoss.thrivespin.core.upload.UploadFiles
import java.io.ByteArrayInputStream
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** A ramp test's FIT file carries the FTP it was scored at: the confirmed N, or the kept n. */
class RampFitTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun thresholdOf(fit: ByteArray): Int? {
        assertTrue(Decode().checkFileIntegrity(ByteArrayInputStream(fit)))
        val sessions = ArrayList<SessionMesg>()
        val decode = Decode()
        val broadcaster = MesgBroadcaster(decode)
        broadcaster.addListener(SessionMesgListener { sessions += it })
        broadcaster.run(ByteArrayInputStream(fit))
        return sessions.single().thresholdPower
    }

    private fun scored(decide: (RampDecider) -> Unit): ByteArray {
        val store = FileRideStore(File(tmp.root, "rides"))
        Recs.write(store, RampRecs.recording(power = RampRecs.onTarget(480), cool = 120))
        val files = RampFiles(store)
        val decider = RampDecider(store, files, FtpQueue(FtpStore(File(tmp.root, "ftp")), { 1_794_067_000_000L }))
        files.ensure("ride-1")
        decide(decider)
        val uploads = FileRideUploads(store, { 1_794_067_000_000L }, "0.1.0", { 0 })
        assertTrue(uploads.prepare("ride-1", decider.finalFtp("ride-1")) is Preparation.Ready)
        return File(store.dir("ride-1"), UploadFiles.FIT).readBytes()
    }

    @Test
    fun theFitsThresholdPowerIsTheConfirmedFtp() {
        assertEquals(185, thresholdOf(scored { it.setFtp("ride-1", 185, 180, null) }))
    }

    @Test
    fun theFitsThresholdPowerIsTheKeptFtp() {
        assertEquals(250, thresholdOf(scored { it.keep("ride-1", 250) }))
    }
}
