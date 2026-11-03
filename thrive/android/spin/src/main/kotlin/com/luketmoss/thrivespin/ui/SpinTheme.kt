package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.luketmoss.thrivespin.core.SpinColors as C

/** [SpinColors] for one theme, as Compose colours. The names are the tokens'. */
@Immutable
class SpinPalette(
    val bg: Color,
    val surface: Color,
    val border: Color,
    val borderSoft: Color,
    val borderStrong: Color,
    val text: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val success: Color,
    val successBg: Color,
    val warningBg: Color,
    val onFill: Color,
    val scrim: Color,
    val overlayXs: Color,
    val primary: Color,
    val primaryBg: Color,
    val primaryText: Color,
    val primaryFill: Color,
    val dangerText: Color,
    val warning: Color,
    /** Z1 to Z6, in order. */
    val zones: List<Color>,
)

private val Light = SpinPalette(
    bg = Color(C.BG_LIGHT),
    surface = Color(C.SURFACE_LIGHT),
    border = Color(C.BORDER_LIGHT),
    borderSoft = Color(C.BORDER_SOFT_LIGHT),
    borderStrong = Color(C.BORDER_STRONG_LIGHT),
    text = Color(C.TEXT_LIGHT),
    textSecondary = Color(C.TEXT_SECONDARY_LIGHT),
    textMuted = Color(C.TEXT_MUTED_LIGHT),
    success = Color(C.SUCCESS_LIGHT),
    successBg = Color(C.SUCCESS_BG_LIGHT),
    warningBg = Color(C.WARNING_BG_LIGHT),
    onFill = Color(C.ON_FILL_LIGHT),
    scrim = Color(C.SCRIM_LIGHT),
    overlayXs = Color(C.OVERLAY_XS_LIGHT),
    primary = Color(C.PRIMARY_LIGHT),
    primaryBg = Color(C.PRIMARY_BG_LIGHT),
    primaryText = Color(C.PRIMARY_TEXT_LIGHT),
    primaryFill = Color(C.PRIMARY_FILL_LIGHT),
    dangerText = Color(C.DANGER_TEXT_LIGHT),
    warning = Color(C.WARNING_LIGHT),
    zones = listOf(
        Color(C.ZONE_1_LIGHT),
        Color(C.ZONE_2_LIGHT),
        Color(C.ZONE_3_LIGHT),
        Color(C.ZONE_4_LIGHT),
        Color(C.ZONE_5_LIGHT),
        Color(C.ZONE_6_LIGHT),
    ),
)

private val Dark = SpinPalette(
    bg = Color(C.BG_DARK),
    surface = Color(C.SURFACE_DARK),
    border = Color(C.BORDER_DARK),
    borderSoft = Color(C.BORDER_SOFT_DARK),
    borderStrong = Color(C.BORDER_STRONG_DARK),
    text = Color(C.TEXT_DARK),
    textSecondary = Color(C.TEXT_SECONDARY_DARK),
    textMuted = Color(C.TEXT_MUTED_DARK),
    success = Color(C.SUCCESS_DARK),
    successBg = Color(C.SUCCESS_BG_DARK),
    warningBg = Color(C.WARNING_BG_DARK),
    onFill = Color(C.ON_FILL_DARK),
    scrim = Color(C.SCRIM_DARK),
    overlayXs = Color(C.OVERLAY_XS_DARK),
    primary = Color(C.PRIMARY_DARK),
    primaryBg = Color(C.PRIMARY_BG_DARK),
    primaryText = Color(C.PRIMARY_TEXT_DARK),
    primaryFill = Color(C.PRIMARY_FILL_DARK),
    dangerText = Color(C.DANGER_TEXT_DARK),
    warning = Color(C.WARNING_DARK),
    zones = listOf(
        Color(C.ZONE_1_DARK),
        Color(C.ZONE_2_DARK),
        Color(C.ZONE_3_DARK),
        Color(C.ZONE_4_DARK),
        Color(C.ZONE_5_DARK),
        Color(C.ZONE_6_DARK),
    ),
)

val LocalSpin = staticCompositionLocalOf { Light }

/** Material 3 following the system's light or dark theme, with the palette under it. */
@Composable
fun SpinTheme(content: @Composable () -> Unit) {
    SpinThemeFor(dark = isSystemInDarkTheme(), content = content)
}

/** The dark scheme whatever the system says: the ride screen is read at arm's length, often in a dim room. */
@Composable
fun SpinDarkTheme(content: @Composable () -> Unit) {
    SpinThemeFor(dark = true, content = content)
}

@Composable
private fun SpinThemeFor(dark: Boolean, content: @Composable () -> Unit) {
    val p = if (dark) Dark else Light
    val scheme = if (dark) {
        darkColorScheme(
            primary = p.primary,
            onPrimary = p.onFill,
            background = p.bg,
            onBackground = p.text,
            surface = p.surface,
            onSurface = p.text,
            onSurfaceVariant = p.textSecondary,
            outline = p.borderStrong,
            outlineVariant = p.border,
        )
    } else {
        lightColorScheme(
            primary = p.primary,
            onPrimary = p.onFill,
            background = p.bg,
            onBackground = p.text,
            surface = p.surface,
            onSurface = p.text,
            onSurfaceVariant = p.textSecondary,
            outline = p.borderStrong,
            outlineVariant = p.border,
        )
    }
    CompositionLocalProvider(LocalSpin provides p) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** The palette of the current theme. */
val spin: SpinPalette
    @Composable get() = LocalSpin.current
