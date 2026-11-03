package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.Sample
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Why the ramp ended, from the recording: `skip` is the tap, `end_condition` is cadence. */
@Serializable
enum class RampEnd {
    @SerialName("skip")
    Tap,

    @SerialName("end_condition")
    Cadence,

    @SerialName("interrupted")
    Closed,

    @SerialName("stopped")
    Stopped,
}

/** The best minute as an exact fraction: [sum] watts over [count] readings. Means are compared by cross-multiplying, never as floats. */
data class BestMinute(val sum: Long, val count: Int) {
    /** Whole watts, half up. */
    val watts: Int get() = ((2 * sum + count) / (2L * count)).toInt()

    /** 75% of the mean, once, from the unrounded value, half up. */
    val ftpW: Int
        get() = ((2L * RampTest.FTP_NUMERATOR * sum + RampTest.FTP_DENOMINATOR.toLong() * count) /
            (2L * RampTest.FTP_DENOMINATOR * count)).toInt()

    /** Whether this mean is larger than [other]'s. */
    fun beats(other: BestMinute): Boolean = sum * other.count > other.sum * count
}

/** What the ramp came to (#770's §Result maths). */
sealed interface RampOutcome {
    /** The ramp has no window of [RampTest.MIN_READINGS] readings: no result, no FTP. [noReadings] is true when it ran a full minute but the readings were missing. */
    data class TooShort(val noReadings: Boolean, val lastedS: Int) : RampOutcome

    data class Measured(
        val bestMinuteW: Int,
        /** The FTP the test computes, before the rider's adjustment and before the 50-1000 clamp. */
        val computedFtpW: Int,
        val lastedS: Int,
        val lastStepW: Int?,
        val maxHr: Int?,
        val end: RampEnd,
        /** Seconds of the ramp with no power reading. */
        val nullPowerS: Int,
    ) : RampOutcome {
        /** The computed FTP shown on the result, within what `addFtp` accepts. */
        val shownFtpW: Int get() = computedFtpW.coerceIn(MIN_FTP, MAX_FTP)

        /** Three or more seconds without a reading: the best minute may be low. */
        val droppedOut: Boolean get() = nullPowerS >= DROPOUT_S
    }

    companion object {
        const val MIN_FTP = 50
        const val MAX_FTP = 1000
        const val DROPOUT_S = 3
    }
}

/**
 * `RampResult.from(recording)`: a pure function over #768's recording. The ramp's samples are those whose
 * step is the ramp's, one per ride-second, power in whole watts or null (never 0 for no reading).
 */
object RampResult {
    fun rampSamples(samples: List<Sample>): List<Sample> = samples.filter { it.step == RampTest.RAMP }

    /**
     * The largest mean of the non-null power over any [RampTest.WINDOW_S] consecutive ramp samples with at least
     * [RampTest.MIN_READINGS] readings in them, or null with no such window. Warm-up and cool-down samples are
     * never in it: the caller passes the ramp's power only.
     */
    fun bestMinute(power: List<Int?>): BestMinute? {
        val w = RampTest.WINDOW_S
        if (power.size < w) return null
        var best: BestMinute? = null
        var sum = 0L
        var count = 0
        for (i in power.indices) {
            power[i]?.let {
                sum += it
                count++
            }
            if (i >= w) {
                power[i - w]?.let {
                    sum -= it
                    count--
                }
            }
            if (i >= w - 1 && count >= RampTest.MIN_READINGS) {
                val here = BestMinute(sum, count)
                if (best == null || here.beats(best)) best = here
            }
        }
        return best
    }

    /** The best minute so far and its FTP, for the ramp screen: null until the ramp has a window. */
    fun soFar(samples: List<Sample>): BestMinute? = bestMinute(rampSamples(samples).map { it.powerW })

    fun end(recording: RideRecording): RampEnd {
        val toCooldown = recording.events.lastOrNull { it.type == "step_start" && it.int("step") == RampTest.COOLDOWN }
        if (toCooldown != null) {
            return when (toCooldown.text("reason")) {
                "end_condition" -> RampEnd.Cadence
                "skip" -> RampEnd.Tap
                else -> RampEnd.Stopped
            }
        }
        // The ramp was cut. A recovery (the app was killed) leaves its own event, so the test reads as closed
        // whether #768 finished it as `interrupted` or the rider ended the recovered test by "See your result".
        val ended = recording.events.lastOrNull { it.type == "end" }
        val closed = ended?.text("reason") == "interrupted" || recording.events.any { it.type == "interrupted" }
        return if (closed) RampEnd.Closed else RampEnd.Stopped
    }

    fun from(recording: RideRecording): RampOutcome {
        val ramp = rampSamples(recording.samples)
        val best = bestMinute(ramp.map { it.powerW })
            ?: return RampOutcome.TooShort(noReadings = ramp.size >= RampTest.WINDOW_S, lastedS = ramp.size)
        return RampOutcome.Measured(
            bestMinuteW = best.watts,
            computedFtpW = best.ftpW,
            lastedS = ramp.size,
            lastStepW = ramp.lastOrNull { it.targetW != null }?.targetW,
            maxHr = ramp.mapNotNull { it.hrBpm }.maxOrNull(),
            end = end(recording),
            nullPowerS = ramp.count { it.powerW == null },
        )
    }

    /** Whether the ramp is over in [recording]: the cool-down began, or the ride finished. */
    fun over(recording: RideRecording): Boolean =
        recording.events.any { it.type == "step_start" && it.int("step") == RampTest.COOLDOWN } ||
            recording.meta.state != com.luketmoss.thrivespin.core.ride.recording.RideFileState.InProgress
}
