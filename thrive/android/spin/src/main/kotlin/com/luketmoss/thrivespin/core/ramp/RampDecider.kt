package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.ftp.FtpNow
import com.luketmoss.thrivespin.core.ftp.FtpQueue
import com.luketmoss.thrivespin.core.ftp.FtpRecord
import com.luketmoss.thrivespin.core.ride.RideSession
import com.luketmoss.thrivespin.core.ride.StartOutcome
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import java.io.IOException

/**
 * The two decisions of the result screen (#770), and the one place that knows what a test's final FTP is.
 *
 * "Set FTP to N W" writes the FTP record first, the commit, and only then touches `ramp.json`; a process that
 * dies between the two reopens the result in its set state, because the record is read first
 * ([RampDecisions.of]). "Keep n W" writes `kept` into `ramp.json` and nothing else: nothing is sent.
 */
class RampDecider(
    private val store: FileRideStore,
    private val files: RampFiles,
    private val queue: FtpQueue,
) {
    /** Where the test's decision stands, from `ramp.json` and the record. */
    fun decision(rideId: String): RampDecision =
        RampDecisions.of(files.read(rideId), queue.record(FtpRecord.idFor(rideId)))

    /** The FTP the ride is scored at: the confirmed N or the kept n, and null while the decision is pending. */
    fun finalFtp(rideId: String): Int? = RampDecisions.finalFtp(decision(rideId))

    /**
     * Writes the record and then remembers it. Null when the phone cannot hold the record: nothing was decided.
     * A repeat for the same ride changes nothing and returns the first decision (a rapid second tap is one record).
     */
    fun setFtp(rideId: String, ftpW: Int, computedW: Int, previous: FtpNow?): RampDecision.Set? {
        val startedAt = try {
            store.readMeta(rideId).startedAtUtc
        } catch (e: IOException) {
            null
        } ?: return null
        val record = queue.confirm(rideId, startedAt, ftpW, computedW, previous) ?: return null
        files.markSet(rideId, record.ftpW)
        return RampDecision.Set(record.ftpW, record)
    }

    fun keep(rideId: String, ftpW: Int): RampDecision.Kept? =
        if (files.keep(rideId, ftpW)) RampDecision.Kept(ftpW) else null
}

/**
 * The intro's Start (#770): #768's starting rules, unchanged, with the ramp's session. No trainer saved, or a
 * ride already going, start nothing; otherwise the service starts and the ramp screen opens.
 */
class RampLauncher(
    private val devices: () -> DeviceState,
    /** A ride is getting ready, running or paused. */
    private val rideActive: () -> Boolean,
    private val newRideId: () -> String,
    /** Starts the service and opens the ramp screen. */
    private val launch: (RideSession) -> Unit,
) {
    fun start(): StartOutcome {
        if (devices().trainer == null) return StartOutcome.NoTrainer
        if (rideActive()) return StartOutcome.AlreadyRiding
        val session = RampTest.session(newRideId())
        launch(session)
        return StartOutcome.Started(session)
    }
}
