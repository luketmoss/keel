package com.luketmoss.thrivespin.core.workout

/** One bar of the workout profile: a width weight, and a start and end height as a fraction of the chart. */
data class ProfileBar(
    val durS: Int,
    val startFraction: Float,
    val endFraction: Float,
    /** Null for a step with no power target: a flat neutral bar. */
    val zone: Zone?,
)

/** What a profile draws, with no Android in it: [bars] left to right, [ftpFraction] the height of the 100% line. */
data class ProfileModel(val bars: List<ProfileBar>, val ftpFraction: Float, val totalS: Int)

object Profile {
    const val NEUTRAL_HEIGHT = 0.4f
    private const val FLOOR_TOP = 130.0

    fun model(steps: StepsV1, intensityPct: Int = 100): ProfileModel {
        val resolved = Maths.expand(steps, null, intensityPct)
        val highest = resolved.maxOfOrNull { s ->
            if (s.pctStart == null || s.pctEnd == null) 0.0 else maxOf(s.pctStart, s.pctEnd) * intensityPct / 100.0
        } ?: 0.0
        // The chart's top: 130%, or the highest scaled target plus 10%, so nothing clips at high intensity.
        val top = maxOf(FLOOR_TOP, highest + 10.0)
        val bars = resolved.map { s ->
            if (s.pctStart == null || s.pctEnd == null) {
                ProfileBar(s.durS, NEUTRAL_HEIGHT, NEUTRAL_HEIGHT, null)
            } else {
                ProfileBar(
                    durS = s.durS,
                    startFraction = (s.pctStart * intensityPct / 100.0 / top).toFloat(),
                    endFraction = (s.pctEnd * intensityPct / 100.0 / top).toFloat(),
                    zone = s.zone(intensityPct),
                )
            }
        }
        return ProfileModel(bars, (100.0 / top).toFloat(), steps.totalSeconds)
    }

    /** The profile's content description. */
    fun description(steps: StepsV1): String =
        "Profile: ${steps.flatSteps.size} steps, ${WorkoutText.total(steps.totalSeconds)}"
}
