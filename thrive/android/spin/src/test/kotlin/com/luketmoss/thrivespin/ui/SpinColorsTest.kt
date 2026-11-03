package com.luketmoss.thrivespin.ui

import com.luketmoss.thrivespin.core.SpinColors
import kotlin.math.pow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SpinColorsTest {
    private fun channel(value: Long, shift: Int): Double {
        val c = ((value shr shift) and 0xFF) / 255.0
        return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }

    private fun luminance(color: Long): Double =
        0.2126 * channel(color, 16) + 0.7152 * channel(color, 8) + 0.0722 * channel(color, 0)

    private fun contrast(a: Long, b: Long): Double {
        val (hi, lo) = luminance(a).let { x -> luminance(b).let { y -> maxOf(x, y) to minOf(x, y) } }
        return (hi + 0.05) / (lo + 0.05)
    }

    private fun pin(token: String, expected: Long, actual: Long) =
        assertEquals("$token is the token's value", expected, actual)

    @Test
    fun theSuiteTokensAreMirroredExactly() {
        // ui/tokens/suite.css, light then dark.
        pin("--color-bg light", 0xFFF0F2F5, SpinColors.BG_LIGHT)
        pin("--color-bg dark", 0xFF121212, SpinColors.BG_DARK)
        pin("--color-surface light", 0xFFFFFFFF, SpinColors.SURFACE_LIGHT)
        pin("--color-surface dark", 0xFF1A1A1E, SpinColors.SURFACE_DARK)
        pin("--color-border light", 0xFFDADCE0, SpinColors.BORDER_LIGHT)
        pin("--color-border dark", 0xFF3C3C3C, SpinColors.BORDER_DARK)
        pin("--color-border-light light", 0xFFE8EAED, SpinColors.BORDER_SOFT_LIGHT)
        pin("--color-border-light dark", 0xFF25252B, SpinColors.BORDER_SOFT_DARK)
        pin("--color-border-strong light", 0xFF7D838A, SpinColors.BORDER_STRONG_LIGHT)
        pin("--color-border-strong dark", 0xFF74797F, SpinColors.BORDER_STRONG_DARK)
        pin("--color-text light", 0xFF1F1F1F, SpinColors.TEXT_LIGHT)
        pin("--color-text dark", 0xFFE8EAED, SpinColors.TEXT_DARK)
        pin("--color-text-secondary light", 0xFF5F6368, SpinColors.TEXT_SECONDARY_LIGHT)
        pin("--color-text-secondary dark", 0xFF9AA0A6, SpinColors.TEXT_SECONDARY_DARK)
        pin("--color-text-muted light", 0xFF606B76, SpinColors.TEXT_MUTED_LIGHT)
        pin("--color-text-muted dark", 0xFF868E98, SpinColors.TEXT_MUTED_DARK)
        pin("--color-success light", 0xFF2E7D32, SpinColors.SUCCESS_LIGHT)
        pin("--color-success dark", 0xFF66BB6A, SpinColors.SUCCESS_DARK)
        pin("--color-success-light light", 0xFFE8F5E9, SpinColors.SUCCESS_BG_LIGHT)
        pin("--color-success-light dark", 0xFF1B5E20, SpinColors.SUCCESS_BG_DARK)
        pin("--color-warning-light light", 0xFFFFF8E1, SpinColors.WARNING_BG_LIGHT)
        pin("--color-warning-light dark", 0xFF2D2210, SpinColors.WARNING_BG_DARK)
        pin("--color-on-fill light", 0xFFFFFFFF, SpinColors.ON_FILL_LIGHT)
        pin("--color-on-fill dark", 0xFF121212, SpinColors.ON_FILL_DARK)
        // rgba(0,0,0,0.4) and rgba(0,0,0,0.6): alpha 0x66 and 0x99.
        pin("--color-overlay light", 0x66000000L, SpinColors.SCRIM_LIGHT)
        pin("--color-overlay dark", 0x99000000L, SpinColors.SCRIM_DARK)
        // rgba(0,0,0,0.04) and rgba(255,255,255,0.04): alpha 0x0A.
        pin("--overlay-xs light", 0x0A000000L, SpinColors.OVERLAY_XS_LIGHT)
        pin("--overlay-xs dark", 0x0AFFFFFFL, SpinColors.OVERLAY_XS_DARK)
    }

    @Test
    fun thriveTokensAreMirroredExactly() {
        // thrive/frontend/src/global.css, light then dark.
        pin("--color-primary light", 0xFF2F66F0, SpinColors.PRIMARY_LIGHT)
        pin("--color-primary dark", 0xFF6E97FF, SpinColors.PRIMARY_DARK)
        pin("--color-primary-light light", 0xFFEBF1FF, SpinColors.PRIMARY_BG_LIGHT)
        pin("--color-primary-light dark", 0xFF16213F, SpinColors.PRIMARY_BG_DARK)
        pin("--color-primary-text light", 0xFF2452C9, SpinColors.PRIMARY_TEXT_LIGHT)
        pin("--color-primary-text dark", 0xFF6E97FF, SpinColors.PRIMARY_TEXT_DARK)
        pin("--color-primary-fill light", 0xFF2F66F0, SpinColors.PRIMARY_FILL_LIGHT)
        pin("--color-primary-fill dark", 0xFF6E97FF, SpinColors.PRIMARY_FILL_DARK)
    }

    @Test
    fun theLabelOnEveryFillMeetsAA() {
        val pairs = mapOf(
            "primary fill light" to (SpinColors.ON_FILL_LIGHT to SpinColors.PRIMARY_FILL_LIGHT),
            "primary fill dark" to (SpinColors.ON_FILL_DARK to SpinColors.PRIMARY_FILL_DARK),
            "success on its tint light" to (SpinColors.SUCCESS_LIGHT to SpinColors.SUCCESS_BG_LIGHT),
            "primary text on its tint light" to (SpinColors.PRIMARY_TEXT_LIGHT to SpinColors.PRIMARY_BG_LIGHT),
            "primary text on the card light" to (SpinColors.PRIMARY_TEXT_LIGHT to SpinColors.SURFACE_LIGHT),
            "primary text on the card dark" to (SpinColors.PRIMARY_TEXT_DARK to SpinColors.SURFACE_DARK),
            "secondary text on the card light" to (SpinColors.TEXT_SECONDARY_LIGHT to SpinColors.SURFACE_LIGHT),
            "secondary text on the card dark" to (SpinColors.TEXT_SECONDARY_DARK to SpinColors.SURFACE_DARK),
            "muted text on the card light" to (SpinColors.TEXT_MUTED_LIGHT to SpinColors.SURFACE_LIGHT),
            "muted text on the card dark" to (SpinColors.TEXT_MUTED_DARK to SpinColors.SURFACE_DARK),
        )
        pairs.forEach { (name, p) ->
            val ratio = contrast(p.first, p.second)
            assertTrue("$name contrast $ratio is under 4.5", ratio >= 4.5)
        }
    }
}
