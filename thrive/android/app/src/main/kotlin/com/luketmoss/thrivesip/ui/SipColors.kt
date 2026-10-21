package com.luketmoss.thrivesip.ui

/**
 * The one place a colour is written down. Hex values are Thrive's own
 * `--metric-water`, `--metric-coffee` and `--metric-alcohol` (frontend/src/global.css), light and
 * dark, so the widget and the app match the Day cards. Plain Longs, so this has
 * no Compose or Glance in it and both toolkits wrap the same numbers.
 */
object SipColors {
    const val WATER_LIGHT = 0xFF0B6FB8
    const val WATER_DARK = 0xFF5BB8F5
    const val COFFEE_LIGHT = 0xFF6F4E37
    const val COFFEE_DARK = 0xFFC9A27E
    const val ALCOHOL_LIGHT = 0xFFB45309
    const val ALCOHOL_DARK = 0xFFF5A524

    /** Text on a water, coffee or alcohol fill: white on the light accents, near-black on the dark ones. */
    const val ON_ACCENT_LIGHT = 0xFFFFFFFF
    const val ON_ACCENT_DARK = 0xFF0B1520

    /** The bar's empty track. */
    const val TRACK_LIGHT = 0xFFD9DEE5
    const val TRACK_DARK = 0xFF3A4350
}
