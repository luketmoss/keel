package com.luketmoss.thrivespin.core.ride.recording

import java.io.IOException
import kotlinx.serialization.SerializationException

/** What the next app open does: one ride to bring back paused, and the finished ones to hand off, oldest first. */
class RecoveryOutcome(val resume: RideRecording?, val handOff: List<String>)

/**
 * Recovery after the app was killed (#768). It runs when the app next opens, before Library is shown,
 * for each folder whose `meta.json` says `in_progress`:
 *
 * - no samples (the clock never started): the folder is deleted;
 * - a last sample under 60 minutes ago: the ride comes back paused (the newest only);
 * - older: the ride is finished at its last sample with reason `interrupted`.
 *
 * A finished folder whose `handed_off` is false is handed off as well.
 */
object RideRecovery {
    const val RESUME_WINDOW_MS = 3_600_000L

    fun run(store: FileRideStore, nowMs: Long): RecoveryOutcome {
        val candidates = ArrayList<RideRecording>()
        for (info in store.list().filter { it.state == RideFileState.InProgress }) {
            val recording = try {
                store.open(info.id)
            } catch (e: IOException) {
                continue
            } catch (e: SerializationException) {
                continue
            }
            if (recording.samples.isEmpty()) {
                store.delete(info.id)
            } else {
                candidates += recording
            }
        }
        var resume: RideRecording? = null
        val newest = candidates.lastOrNull()
        for (recording in candidates) {
            val age = nowMs - recording.samples.last().epochMs
            if (recording === newest && age < RESUME_WINDOW_MS) {
                resume = recording
            } else {
                store.finishInterrupted(recording.meta.rideId, recording)
            }
        }
        val handOff = store.list()
            .filter { it.state == RideFileState.Finished && !it.handedOff }
            .sortedBy { it.finishedAtUtc ?: it.startedAtUtc ?: "" }
            .map { it.id }
        return RecoveryOutcome(resume, handOff)
    }
}
