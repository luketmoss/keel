package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.FtmsFeatures
import com.luketmoss.thrivespin.core.ride.EndCondition
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RideSession
import com.luketmoss.thrivespin.core.ride.RideStep
import com.luketmoss.thrivespin.core.ride.StepTarget
import com.luketmoss.thrivespin.core.workout.TrainerMode

/**
 * The ramp test (#770): the protocol's constants in one place, so a later protocol is a new object rather
 * than an edit, and the [RideSession] #768's engine runs for it.
 */
object RampTest {
    const val NAME = "Ramp test"

    const val WARMUP_S = 300
    const val WARMUP_W = 100
    const val START_W = 100
    const val STEP_W = 20
    const val STEP_S = 60
    const val COOLDOWN_S = 600
    const val COOLDOWN_W = 100

    /** The ramp ends when cadence has been under [CADENCE_BELOW_RPM] for [CADENCE_FOR_S] seconds. */
    const val CADENCE_BELOW_RPM = 60
    const val CADENCE_FOR_S = 5

    /** Cadence under this turns the tile to a warning on the ramp screen. */
    const val CADENCE_WARN_RPM = 70

    /** "I'm done" is disabled for the first seconds of the ramp: the tap that started it cannot end it. */
    const val DONE_GUARD_S = 5

    /** FTP is this share of the best minute. */
    const val FTP_NUMERATOR = 3
    const val FTP_DENOMINATOR = 4

    /** The best minute's window, and how many of its seconds must hold a power reading. */
    const val WINDOW_S = 60
    const val MIN_READINGS = 50

    /** The step indexes of the session. */
    const val WARMUP = 0
    const val RAMP = 1
    const val COOLDOWN = 2

    /** The recording of #768's engine: the session of kind [RideKind.RampTest]. */
    fun session(rideId: String): RideSession = RideSession(
        rideId = rideId,
        kind = RideKind.RampTest,
        name = NAME,
        workoutId = null,
        ftpW = null,
        mode = TrainerMode.Erg,
        intensityPct = 100,
        intensityAdjustable = false,
        steps = listOf(
            RideStep("Warm-up", null, WARMUP_S, StepTarget.Watts(WARMUP_W, WARMUP_W), null, null),
            RideStep(
                "Ramp",
                null,
                null,
                StepTarget.WattsStairs(START_W, STEP_W, STEP_S),
                null,
                EndCondition.CadenceBelow(CADENCE_BELOW_RPM, CADENCE_FOR_S),
            ),
            RideStep("Cool-down", null, COOLDOWN_S, StepTarget.Watts(COOLDOWN_W, COOLDOWN_W), null, null),
        ),
    )

    /** The target of the ramp's minute [index] (0 is the first minute): 100, 120, 140 and so on. */
    fun stairW(index: Int): Int = START_W + STEP_W * index

    /**
     * Whether Start may run: a trainer whose saved features are known and lack power target setting cannot
     * hold the staircase. Unknown features (never connected since saving) are allowed; the engine's own
     * refusal handling applies.
     */
    fun canRun(features: FtmsFeatures?): Boolean = features == null || features.erg

    const val CANT_RUN = "Your trainer can't hold a power target, so it can't run the ramp test."
}
