package com.luketmoss.thrivesip.ui

import kotlin.math.pow
import org.junit.Assert.assertTrue
import org.junit.Test

class SipColorsTest {
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

    @Test
    fun coffeeMirrorsTheAppsMetricColour() {
        // --metric-coffee in thrive/frontend/src/global.css, light and dark (#560).
        assertTrue(SipColors.COFFEE_LIGHT == 0xFF6F4E37)
        assertTrue(SipColors.COFFEE_DARK == 0xFFC9A27E)
    }

    @Test
    fun unwindMirrorsTheAppsMetricColour() {
        // --metric-unwind in thrive/frontend/src/global.css, light and dark (#590).
        assertTrue(SipColors.UNWIND_LIGHT == 0xFF5E7C62)
        assertTrue(SipColors.UNWIND_DARK == 0xFF9CBF9F)
    }

    @Test
    fun theLabelOnEveryAccentFillMeetsAA() {
        val pairs = mapOf(
            "water light" to (SipColors.ON_ACCENT_LIGHT to SipColors.WATER_LIGHT),
            "water dark" to (SipColors.ON_ACCENT_DARK to SipColors.WATER_DARK),
            "coffee light" to (SipColors.ON_ACCENT_LIGHT to SipColors.COFFEE_LIGHT),
            "coffee dark" to (SipColors.ON_ACCENT_DARK to SipColors.COFFEE_DARK),
            "alcohol light" to (SipColors.ON_ACCENT_LIGHT to SipColors.ALCOHOL_LIGHT),
            "alcohol dark" to (SipColors.ON_ACCENT_DARK to SipColors.ALCOHOL_DARK),
            "unwind light" to (SipColors.ON_ACCENT_LIGHT to SipColors.UNWIND_LIGHT),
            "unwind dark" to (SipColors.ON_ACCENT_DARK to SipColors.UNWIND_DARK),
        )
        pairs.forEach { (name, p) ->
            val ratio = contrast(p.first, p.second)
            assertTrue("$name label contrast $ratio is under 4.5", ratio >= 4.5)
        }
    }
}
