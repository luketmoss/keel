package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.Repeat
import com.luketmoss.thrivespin.core.workout.RideRequest
import com.luketmoss.thrivespin.core.workout.Step
import com.luketmoss.thrivespin.core.workout.StepMode
import com.luketmoss.thrivespin.core.workout.TrainerMode
import kotlin.math.roundToInt
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class RideKind {
    @SerialName("workout")
    Workout,

    @SerialName("ramp_test")
    RampTest,
}

/**
 * What the engine runs (#768), and what #770's ramp test builds directly. It is written into the
 * recording whole, so everything in it is data and a recovered ride rebuilds exactly.
 */
@Serializable
data class RideSession(
    /** A UUID; becomes `ride_id`. */
    val rideId: String,
    val kind: RideKind,
    val name: String,
    /** The `RideWorkouts` id; null for a ramp test. */
    val workoutId: String?,
    /** Null only when no step is [StepTarget.PctOfFtp]. */
    val ftpW: Int?,
    /** How erg steps are ridden. */
    val mode: TrainerMode,
    /** The starting intensity, 50 to 130. */
    val intensityPct: Int,
    /** False hides Intensity (a ramp test). */
    val intensityAdjustable: Boolean,
    val steps: List<RideStep>,
) {
    init {
        require(steps.isNotEmpty()) { "A ride needs at least one step" }
        steps.forEach { it.check() }
        require(ftpW != null || steps.none { it.target is StepTarget.PctOfFtp }) { "A percentage of FTP needs an FTP" }
    }
}

@Serializable
data class RideStep(
    val label: String,
    /** "2 of 3" inside a repeat, else null. */
    val position: String?,
    /** Null runs until [endWhen] fires or the step is skipped. */
    val durS: Int?,
    val target: StepTarget,
    /** Shown, never enforced. */
    val cadenceRpm: Int?,
    val endWhen: EndCondition?,
) {
    internal fun check() {
        require(durS == null || durS > 0) { "A step's duration is positive" }
        if (durS == null) {
            val ok = when (target) {
                is StepTarget.PctOfFtp -> target.start == target.end
                is StepTarget.Watts -> target.startW == target.endW
                is StepTarget.WattsStairs, is StepTarget.Level, is StepTarget.Grade, StepTarget.Free -> true
            }
            require(ok) { "A ramp needs a duration" }
        }
    }
}

@Serializable
sealed interface StepTarget {
    /** Erg, scaled by intensity; [end] equals [start] unless a ramp. */
    @Serializable
    @SerialName("pct")
    data class PctOfFtp(val start: Int, val end: Int) : StepTarget

    /** Erg, absolute, never scaled. */
    @Serializable
    @SerialName("watts")
    data class Watts(val startW: Int, val endW: Int) : StepTarget

    /** Erg, absolute, climbs [stepW] every [everyS] seconds for ever. */
    @Serializable
    @SerialName("stairs")
    data class WattsStairs(val startW: Int, val stepW: Int, val everyS: Int) : StepTarget

    /** A resistance level 0 to 100. */
    @Serializable
    @SerialName("level")
    data class Level(val level: Int) : StepTarget

    /** A grade, -10.0 to 20.0. */
    @Serializable
    @SerialName("grade")
    data class Grade(val grade: Double) : StepTarget

    @Serializable
    @SerialName("free")
    data object Free : StepTarget

    /** Erg steps: ridden as a power target (in ERG) and given a target in watts. */
    val isErg: Boolean
        get() = this is PctOfFtp || this is Watts || this is WattsStairs
}

@Serializable
sealed interface EndCondition {
    /** Every sample of the last [forS] seconds under [rpm]. */
    @Serializable
    @SerialName("cadence_below")
    data class CadenceBelow(val rpm: Int, val forS: Int) : EndCondition
}

object RideSessions {
    /**
     * #767's request as a session: one [RideStep] per resolved step, in order. A step in an n-times
     * repeat reads "k of n" for its k-th pass. Every duration is set and nothing ends on a condition.
     */
    fun fromRequest(request: RideRequest, rideId: String): RideSession {
        val resolved = Maths.expand(request.steps, request.ftpW, request.intensityPct)
        val positions = ArrayList<String?>(resolved.size)
        for (block in request.steps.blocks) {
            when (block) {
                is Step -> positions += null
                is Repeat -> repeat(block.times) { pass -> block.steps.forEach { _ -> positions += "${pass + 1} of ${block.times}" } }
            }
        }
        val steps = resolved.mapIndexed { i, s ->
            val target = when (s.mode) {
                StepMode.Erg -> StepTarget.PctOfFtp(s.pctStart ?: 0, s.pctEnd ?: s.pctStart ?: 0)
                StepMode.Resistance -> StepTarget.Level(s.level ?: 0)
                StepMode.Slope -> StepTarget.Grade((s.gradeTenths ?: 0) / 10.0)
                StepMode.Free -> StepTarget.Free
            }
            RideStep(
                label = s.label,
                position = positions[i],
                durS = s.durS,
                target = target,
                cadenceRpm = s.cadence,
                endWhen = null,
            )
        }
        return RideSession(
            rideId = rideId,
            kind = RideKind.Workout,
            name = request.workoutName,
            workoutId = request.workoutId,
            ftpW = request.ftpW,
            mode = request.mode,
            intensityPct = request.intensityPct,
            intensityAdjustable = true,
            steps = steps,
        )
    }

    /** A grade in hundredths of a percent, for the control point: 4.5 is 450. */
    fun gradeHundredths(grade: Double): Int = (grade * 100).roundToInt()
}
