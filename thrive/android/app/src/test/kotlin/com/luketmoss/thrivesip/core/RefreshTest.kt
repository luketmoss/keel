package com.luketmoss.thrivesip.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefreshTest {
    @Test
    fun theBodyTapReadsAreNowAndAtOneAndFiveMinutes() {
        assertEquals(1L, Refresh.BODY_TAP_FIRST_MINUTES)
        assertEquals(5L, Refresh.BODY_TAP_SECOND_MINUTES)
        assertEquals(listOf(0L, 1L, 5L), Refresh.BODY_TAP_OFFSETS_MINUTES)
    }

    @Test
    fun chainedDelaysAreTheGapsSoTheReadsLandAtTheOffsets() {
        val delays = Refresh.bodyTapDelaysMinutes()
        assertEquals(listOf(0L, 1L, 4L), delays)
        assertEquals(Refresh.BODY_TAP_OFFSETS_MINUTES, delays.runningFold(0L) { at, d -> at + d }.drop(1))
    }

    @Test
    fun thereAreNeverMoreThanThreeReadsPerTap() {
        assertEquals(3, Refresh.bodyTapDelaysMinutes().size)
    }

    @Test
    fun theFirstReadIsImmediateAndNoDelayIsNegative() {
        assertEquals(0L, Refresh.bodyTapDelaysMinutes().first())
        assertTrue(Refresh.bodyTapDelaysMinutes().all { it >= 0 })
    }

    @Test
    fun thePeriodicRefreshIsFifteenMinutesWorkManagersMinimum() {
        assertEquals(15L, Refresh.PERIODIC_MINUTES)
    }
}
