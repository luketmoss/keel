package com.luketmoss.thrivespin.core.workout

import com.luketmoss.thrivespin.core.FtmsFeatures
import kotlinx.serialization.Serializable

enum class TrainerMode { Erg, Resistance, Slope }

/**
 * What Start hands the ride engine (#768). A snapshot: a refresh, an edit or a delete after Start
 * changes nothing in it. Watts are not in it; the engine works them out from [steps], [ftpW] and
 * [intensityPct] with [Maths], so the detail screen and the ride agree to the watt.
 */
data class RideRequest(
    /** The `RideWorkouts` id; becomes the ride's `ride_workout_id`. */
    val workoutId: String,
    /** The ride's name. */
    val workoutName: String,
    val steps: StepsV1,
    val intensityPct: Int,
    val mode: TrainerMode,
    /** The FTP the targets were shown at. */
    val ftpW: Int,
)

interface RideStarter {
    fun start(request: RideRequest)
}

/** The starter #767 ships: it says riding is not there yet. #768 replaces the binding. */
class PlaceholderRideStarter(private val show: (String) -> Unit) : RideStarter {
    override fun start(request: RideRequest) = show(MESSAGE)

    companion object {
        const val MESSAGE = "Riding comes in a later update."
    }
}

/**
 * The detail screen's own state: one intensity for the whole workout and the trainer mode. It is made
 * afresh each time the screen is opened, so intensity is 100% every time and is never saved. Nothing
 * here touches the cache or the API.
 */
@Serializable
data class DetailState(
    val workoutId: String,
    val intensityPct: Int = DEFAULT_INTENSITY,
    val mode: TrainerMode = TrainerMode.Erg,
) {
    fun harder(): DetailState = withIntensity(intensityPct + 1)

    fun easier(): DetailState = withIntensity(intensityPct - 1)

    fun preset(pct: Int): DetailState = withIntensity(pct)

    fun withIntensity(pct: Int): DetailState =
        copy(intensityPct = pct.coerceIn(Maths.MIN_INTENSITY, Maths.MAX_INTENSITY))

    fun withMode(next: TrainerMode): DetailState = copy(mode = next)

    val canEasier: Boolean get() = intensityPct > Maths.MIN_INTENSITY

    val canHarder: Boolean get() = intensityPct < Maths.MAX_INTENSITY

    /** The preset equal to the value, none when it is between presets. */
    val selectedPreset: Int? get() = PRESETS.firstOrNull { it == intensityPct }

    val hint: String
        get() = if (intensityPct == DEFAULT_INTENSITY) {
            "The whole workout, as written"
        } else {
            "The whole workout at $intensityPct% · watts below are scaled"
        }

    val startLabel: String
        get() = if (intensityPct == DEFAULT_INTENSITY) "Start ride" else "Start at $intensityPct%"

    /** The request Start sends, or null with no FTP: the button is disabled then. */
    fun request(name: String, steps: StepsV1, ftpW: Int?): RideRequest? {
        if (ftpW == null) return null
        return RideRequest(workoutId, name, steps, intensityPct, mode, ftpW)
    }

    companion object {
        const val DEFAULT_INTENSITY = 100
        val PRESETS = listOf(80, 90, 100, 105, 110)

        /** A new detail state: 100%, ERG, or Resistance when the saved trainer is known to lack ERG. */
        fun open(workoutId: String, trainer: FtmsFeatures?): DetailState =
            DetailState(workoutId, DEFAULT_INTENSITY, defaultMode(trainer))

        /** ERG, unless the saved trainer's features are known and lack it. */
        fun defaultMode(trainer: FtmsFeatures?): TrainerMode =
            if (trainer != null && !trainer.erg) TrainerMode.Resistance else TrainerMode.Erg

        fun ergDisabled(trainer: FtmsFeatures?): Boolean = trainer != null && !trainer.erg

        fun modeHint(mode: TrainerMode, ergDisabled: Boolean): String = when {
            ergDisabled -> "Your trainer doesn't report ERG, so the targets are a guide."
            mode == TrainerMode.Erg -> "ERG holds the target power for you, whatever your cadence or gear."
            mode == TrainerMode.Resistance ->
                "Resistance sets a fixed level. You hit the target by shifting and changing cadence."
            else -> "Slope makes it feel like riding a hill. The target shows as a guide."
        }
    }
}
