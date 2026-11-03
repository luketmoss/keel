package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.ride.recording.RideFileState
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.summary.Recs

/** Ramp-test recordings built by hand, with exact figures. */
object RampRecs {
    /** The staircase's target at second [s] of the ramp. */
    fun target(s: Int) = RampTest.START_W + RampTest.STEP_W * (s / RampTest.STEP_S)

    /**
     * A ramp test: [warm] seconds of warm-up at 100 W, then a ramp whose power is [power] for each of its seconds
     * (null for a dropout), then [cool] seconds of cool-down. [toCool] is the reason the cool-down began; null
     * means the ride ended inside the ramp.
     */
    fun recording(
        warm: Int = 300,
        power: List<Int?>,
        cool: Int = 0,
        toCool: String? = "skip",
        hr: (Int) -> Int? = { null },
        endReason: String = "completed",
        state: RideFileState = RideFileState.Finished,
        id: String = "ride-1",
    ): RideRecording {
        val samples = ArrayList<Sample>()
        var t = 0
        repeat(warm) { samples += Recs.sample(t++, 100, 100, step = 0) }
        for ((i, p) in power.withIndex()) samples += Recs.sample(t++, p, target(i), cadence = 90, hr = hr(i), step = 1)
        repeat(cool) { samples += Recs.sample(t++, 100, 100, step = 2) }
        val events = ArrayList<RideEvent>()
        events += Recs.stepStart(0, 0, "Warm-up", reason = "start")
        events += Recs.stepStart(warm, 1, "Ramp", reason = "skip")
        if (toCool != null) events += Recs.stepStart(warm + power.size, 2, "Cool-down", reason = toCool)
        events += RideEvent("end", t, Recs.START_MS + t * 1000L, RideEvent.fields("reason" to endReason))
        val session = RampTest.session(id)
        return RideRecording(Recs.meta(session, endReason = endReason, kind = RideKind.RampTest, state = state), samples, events)
    }

    /** The ramp ridden exactly on target for [seconds] seconds. */
    fun onTarget(seconds: Int): List<Int?> = List(seconds) { target(it) }
}
