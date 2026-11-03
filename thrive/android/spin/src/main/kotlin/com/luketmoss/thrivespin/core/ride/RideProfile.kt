package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.Profile
import com.luketmoss.thrivespin.core.workout.ProfileBar
import com.luketmoss.thrivespin.core.workout.ProfileModel
import com.luketmoss.thrivespin.core.workout.Zones

object RideProfile {
    private const val FLOOR_TOP = 130.0

    /**
     * The profile of a session at [intensityPct], drawn the way #767's is: a bar per step, wide by its
     * duration, high by its scaled target. A step with no percentage target is a flat neutral bar, and an
     * open-ended step has no width.
     */
    fun model(session: RideSession, intensityPct: Int): ProfileModel {
        val pcts = session.steps.map { s -> (s.target as? StepTarget.PctOfFtp) }
        val highest = pcts.maxOfOrNull { t -> if (t == null) 0.0 else maxOf(t.start, t.end) * intensityPct / 100.0 } ?: 0.0
        val top = maxOf(FLOOR_TOP, highest + 10.0)
        val bars = session.steps.mapIndexed { i, s ->
            val t = pcts[i]
            val dur = s.durS ?: 0
            if (t == null) {
                ProfileBar(dur, Profile.NEUTRAL_HEIGHT, Profile.NEUTRAL_HEIGHT, null)
            } else {
                ProfileBar(
                    durS = dur,
                    startFraction = (t.start * intensityPct / 100.0 / top).toFloat(),
                    endFraction = (t.end * intensityPct / 100.0 / top).toFloat(),
                    zone = Zones.forPct((t.start + t.end) / 2.0 * intensityPct / 100.0),
                )
            }
        }
        return ProfileModel(bars, (100.0 / top).toFloat(), session.steps.sumOf { it.durS ?: 0 })
    }
}

/** The "Ride recorded" screen's one line, from the samples that were written. */
object RideRecordedText {
    /** "<elapsed> · <avg> W avg · <kJ> kJ"; the average is over the non-null power samples, "—" with none. */
    fun line(samples: List<Sample>): String {
        val powers = samples.mapNotNull { it.powerW }
        val avg = if (powers.isEmpty()) "—" else Maths.roundHalfUp(powers.sum().toDouble() / powers.size).toString()
        val kj = powers.sumOf { it.toLong() } / 1000
        return "${RideTime.clock(samples.size)} · $avg W avg · $kj kJ"
    }

    const val KEPT = "It's kept on this phone. Saving to Thrive comes in a later update."
}
