package com.luketmoss.thrivespin.core.summary

import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RideSession
import com.luketmoss.thrivespin.core.ride.RideStep
import com.luketmoss.thrivespin.core.ride.StepTarget
import com.luketmoss.thrivespin.core.ride.recording.FileRideRecorder
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.ride.recording.RideFileState
import com.luketmoss.thrivespin.core.ride.recording.RideMeta
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.RideTrainer
import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.workout.TrainerMode

/** Hand-made recordings with exact figures, for pinning the maths. */
object Recs {
    const val START_UTC = "2026-11-07T15:02:11Z"
    const val START_MS = 1_794_063_731_000L

    fun step(label: String = "Sweet spot", dur: Int? = 600, pct: Int = 90, position: String? = null) =
        RideStep(label, position, dur, StepTarget.PctOfFtp(pct, pct), null, null)

    fun session(id: String = "ride-1", ftp: Int? = 250, steps: List<RideStep>? = null, name: String = "Sweet Spot 3x12") =
        RideSession(
            id, RideKind.Workout, name, "rw_1", ftp, TrainerMode.Erg, 100, true,
            steps ?: if (ftp == null) listOf(RideStep("Free ride", null, 600, StepTarget.Free, null, null)) else listOf(step()),
        )

    fun sample(t: Int, power: Int?, target: Int? = null, cadence: Int? = 90, hr: Int? = null, intensity: Int = 100, step: Int = 0) =
        Sample(t, START_MS + t * 1000L, step, power, target, cadence, hr, intensity, power != null)

    fun stepStart(atS: Int, index: Int, label: String, mode: String = "erg", reason: String = "start", at: Long = START_MS + atS * 1000L) =
        RideEvent("step_start", atS, at, RideEvent.fields("step" to index, "label" to label, "mode" to mode, "reason" to reason))

    fun meta(
        session: RideSession = session(),
        endReason: String = "completed",
        started: String? = START_UTC,
        kind: RideKind = RideKind.Workout,
        state: RideFileState = RideFileState.Finished,
    ) = RideMeta(
        rideId = session.rideId,
        kind = kind,
        state = state,
        session = session,
        trainer = RideTrainer("KICKR CORE 1A2B", "AA:BB:CC:00:00:01"),
        createdAtUtc = "2026-11-07T15:01:40Z",
        startedAtUtc = started,
        finishedAtUtc = "2026-11-07T16:02:11Z",
        endReason = endReason,
    )

    fun recording(
        samples: List<Sample>,
        events: List<RideEvent> = listOf(stepStart(0, 0, "Sweet spot")),
        session: RideSession = session(),
        endReason: String = "completed",
    ) = RideRecording(meta(session, endReason), samples, events)

    /** [n] samples of constant [power] with [target]. */
    fun flat(n: Int, power: Int?, target: Int? = null, hr: Int? = null) = List(n) { sample(it, power, target, hr = hr) }

    /** Writes [recording] under [store] as a finished ride, the way #768's recorder does. */
    fun write(store: FileRideStore, recording: RideRecording) {
        val rec = store.recorder(recording.meta.rideId)
        rec.begin(recording.meta.copy(state = RideFileState.InProgress, finishedAtUtc = null, endReason = null))
        recording.samples.forEach { rec.sample(it) }
        recording.events.forEach { rec.event(it) }
        rec.finish(recording.meta.endReason ?: "completed", START_MS + recording.samples.size * 1000L)
    }
}
