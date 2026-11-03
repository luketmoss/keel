package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.workout.TrainerMode
import com.luketmoss.thrivespin.core.workout.Zone

/** Called once for each ride that finishes, on the main thread, and on each app open for a finished ride not yet handed off. */
interface RideFinishedHandler {
    fun onFinished(rideId: String)
}

enum class RidePhase { GettingReady, Running, Paused, Finished }

/** What the step card says before the clock starts. */
enum class ReadyStatus { Connecting, CantFind, BluetoothOff, PermissionMissing, PedalToStart }

/** The one banner under the top row, in priority order. */
sealed interface RideBanner {
    /** A recovered ride, until Resume. */
    data class Interrupted(val atS: Int) : RideBanner

    data object TrainerLost : RideBanner

    data object BluetoothOff : RideBanner

    data object NoControl : RideBanner

    data object PowerUnsupported : RideBanner

    data object ResistanceUnsupported : RideBanner

    data object SlopeUnsupported : RideBanner

    data object Refused : RideBanner
}

/** What the trainer pill says the trainer is doing. */
sealed interface TrainerPill {
    data object Connecting : TrainerPill

    data object Reconnecting : TrainerPill

    data object Erg : TrainerPill

    data class Level(val level: Int) : TrainerPill

    data class Slope(val tenths: Int) : TrainerPill

    data object Free : TrainerPill

    /** The current command is not being applied: no control, unsupported or refused. */
    data object Guide : TrainerPill
}

enum class HrStatus { Connecting, Reading, NoReading, None }

/** What the step card's "Next" line says. */
data class NextView(val label: String, val durS: Int?, val target: String)

/** How the target card reads for the current step. */
sealed interface TargetView {
    /** An erg target: [watts], and the scaled [pct] of FTP when the step is a percentage. */
    data class Erg(val watts: Int, val pct: Int?) : TargetView

    data class Level(val level: Int) : TargetView

    data class Grade(val tenths: Int) : TargetView

    data object Free : TargetView
}

/**
 * Everything the ride screen, the notification and #770's screen render, as one value (#768). Seconds
 * are ride time: whole seconds since the clock started, pauses excluded.
 */
data class RideState(
    val rideId: String,
    val name: String,
    val phase: RidePhase,
    val ready: ReadyStatus?,
    val stepIndex: Int,
    val stepCount: Int,
    val stepLabel: String,
    val stepPosition: String?,
    val stepSecond: Int,
    val stepDurS: Int?,
    val stepLeftS: Int?,
    val rideS: Int,
    /** Ride time plus what is left of this step and every later step; null when a step is open-ended. */
    val totalS: Int?,
    /** Where the cursor is on the profile: the start of this step as planned, plus the seconds into it. */
    val plannedS: Int,
    val target: TargetView,
    val targetW: Int?,
    val zone: Zone?,
    val power3sW: Int?,
    val band: Band?,
    val cadenceRpm: Int?,
    val cadenceTarget: Int?,
    val heartRate: Int?,
    val hrStatus: HrStatus,
    val hrName: String?,
    val stepAvgW: Int?,
    val totalKj: Int,
    val intensityPct: Int,
    val intensityAdjustable: Boolean,
    val canEasier: Boolean,
    val canHarder: Boolean,
    val mode: TrainerMode,
    val modeLevel: Int,
    val modeGradeTenths: Int,
    /** The Trainer row shows: Resistance or Slope mode, during an erg step. */
    val showTrainerRow: Boolean,
    /** An erg target is shown as a guide rather than held: Resistance or Slope mode, or not being applied. */
    val targetIsGuide: Boolean,
    val trainerName: String,
    val trainerConnected: Boolean,
    val pill: TrainerPill,
    val banner: RideBanner?,
    val canPause: Boolean,
    val canResume: Boolean,
    val canSkip: Boolean,
    val next: NextView?,
    /** The reason the ride ended, once it has: `completed`, `ended`, `paused_too_long`, `limit`, `interrupted`, `discarded` or `cancelled`. */
    val endReason: String?,
    /** A write failed: the ride was ended at [rideS] for want of space. */
    val storageFull: Boolean,
) {
    val started: Boolean get() = phase == RidePhase.Running || phase == RidePhase.Paused || (phase == RidePhase.Finished && rideS > 0)
}
