package com.luketmoss.thrivespin.core

/**
 * The one place a colour is written down. Each value is the suite's
 * (`ui/tokens/suite.css`) or Thrive's (`frontend/src/global.css`) token of the
 * name in the comment, light and dark. Plain Longs, so this has no Compose in it.
 * Overlays are ARGB: an rgba alpha of 0.04, 0.4 or 0.6 is 0x0A, 0x66 or 0x99.
 */
object SpinColors {
    // --color-bg
    const val BG_LIGHT = 0xFFF0F2F5
    const val BG_DARK = 0xFF121212
    // --color-surface
    const val SURFACE_LIGHT = 0xFFFFFFFF
    const val SURFACE_DARK = 0xFF1A1A1E
    // --color-border
    const val BORDER_LIGHT = 0xFFDADCE0
    const val BORDER_DARK = 0xFF3C3C3C
    // --color-border-light
    const val BORDER_SOFT_LIGHT = 0xFFE8EAED
    const val BORDER_SOFT_DARK = 0xFF25252B
    // --color-border-strong
    const val BORDER_STRONG_LIGHT = 0xFF7D838A
    const val BORDER_STRONG_DARK = 0xFF74797F
    // --color-text
    const val TEXT_LIGHT = 0xFF1F1F1F
    const val TEXT_DARK = 0xFFE8EAED
    // --color-text-secondary
    const val TEXT_SECONDARY_LIGHT = 0xFF5F6368
    const val TEXT_SECONDARY_DARK = 0xFF9AA0A6
    // --color-text-muted
    const val TEXT_MUTED_LIGHT = 0xFF606B76
    const val TEXT_MUTED_DARK = 0xFF868E98
    // --color-success
    const val SUCCESS_LIGHT = 0xFF2E7D32
    const val SUCCESS_DARK = 0xFF66BB6A
    // --color-success-light
    const val SUCCESS_BG_LIGHT = 0xFFE8F5E9
    const val SUCCESS_BG_DARK = 0xFF1B5E20
    // --color-warning-light
    const val WARNING_BG_LIGHT = 0xFFFFF8E1
    const val WARNING_BG_DARK = 0xFF2D2210
    // --color-on-fill
    const val ON_FILL_LIGHT = 0xFFFFFFFF
    const val ON_FILL_DARK = 0xFF121212
    // --color-overlay
    const val SCRIM_LIGHT = 0x66000000L
    const val SCRIM_DARK = 0x99000000L
    // --overlay-xs
    const val OVERLAY_XS_LIGHT = 0x0A000000L
    const val OVERLAY_XS_DARK = 0x0AFFFFFFL
    // --color-primary
    const val PRIMARY_LIGHT = 0xFF2F66F0
    const val PRIMARY_DARK = 0xFF6E97FF
    // --color-primary-light
    const val PRIMARY_BG_LIGHT = 0xFFEBF1FF
    const val PRIMARY_BG_DARK = 0xFF16213F
    // --color-primary-text
    const val PRIMARY_TEXT_LIGHT = 0xFF2452C9
    const val PRIMARY_TEXT_DARK = 0xFF6E97FF
    // --color-primary-fill
    const val PRIMARY_FILL_LIGHT = 0xFF2F66F0
    const val PRIMARY_FILL_DARK = 0xFF6E97FF
    // --color-danger-text
    const val DANGER_TEXT_LIGHT = 0xFFB71C1C
    const val DANGER_TEXT_DARK = 0xFFF26B68
    // --color-warning
    const val WARNING_LIGHT = 0xFFA05D00
    const val WARNING_DARK = 0xFFFFB74D

    // Power zones (design note 767, New tokens): Android only, not CSS.
    // --zone-1
    const val ZONE_1_LIGHT = 0xFF8A93A8
    const val ZONE_1_DARK = 0xFF9AA3B5
    // --zone-2
    const val ZONE_2_LIGHT = 0xFF4F86F7
    const val ZONE_2_DARK = 0xFF6E97FF
    // --zone-3
    const val ZONE_3_LIGHT = 0xFF14A098
    const val ZONE_3_DARK = 0xFF2CC2B8
    // --zone-4
    const val ZONE_4_LIGHT = 0xFFE8A317
    const val ZONE_4_DARK = 0xFFF2B84B
    // --zone-5
    const val ZONE_5_LIGHT = 0xFFEE6A1F
    const val ZONE_5_DARK = 0xFFF58A4F
    // --zone-6
    const val ZONE_6_LIGHT = 0xFFCF3A3A
    const val ZONE_6_DARK = 0xFFEF6B6B
}

/** Size tokens in dp that the suite has no CSS for (design note §New tokens), and the alpha of `--opacity-disabled`. */
object SpinSizes {
    const val TAP_TARGET = 48
    const val ROW_HEIGHT = 64
    const val CTA_HEIGHT = 52
    const val NAV_HEIGHT = 64
    const val PROFILE_SM = 40
    const val PROFILE_LG = 140

    /** `--spin-profile-ride`: the profile on the ride screen, smaller so the screen fits a phone. */
    const val PROFILE_RIDE = 88

    /** `--spin-ride-button`: the ride's control row, pressed mid-effort. */
    const val RIDE_BUTTON = 72
    const val OPACITY_DISABLED = 0.4f
}
