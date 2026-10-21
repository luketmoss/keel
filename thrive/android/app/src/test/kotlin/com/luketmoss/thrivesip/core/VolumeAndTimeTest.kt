package com.luketmoss.thrivesip.core

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class VolumeAndTimeTest {
    @Test
    fun ouncesFollowTheDayCards() {
        assertEquals("4", Volume.formatOz(118))
        assertEquals("64", Volume.formatOz(1893))
        assertEquals("48", Volume.formatOz(1420))
        assertEquals("0", Volume.formatOz(0))
        assertEquals("8.5", Volume.formatOz(251))
    }

    @Test
    fun theTapStampIsWholeSecondsInUtc() {
        assertEquals("2026-10-20T19:42:07Z", tapStamp(Instant.parse("2026-10-20T19:42:07.999Z")))
    }

    @Test
    fun midnightIsDenversAndSurvivesDaylightSavingChanges() {
        // MDT, UTC-6: the next midnight after the 20th is 06:00Z on the 21st.
        assertEquals(Instant.parse("2026-10-21T06:00:00Z"), nextDenverMidnight(Instant.parse("2026-10-20T19:00:00Z")))
        // Clocks go back on 1 Nov 2026; by 12:00Z it is MST (UTC-7), so the next midnight is 07:00Z.
        assertEquals(Instant.parse("2026-11-02T07:00:00Z"), nextDenverMidnight(Instant.parse("2026-11-01T12:00:00Z")))
    }

    @Test
    fun aLateEveningTapIsFiledUnderItsDenverDay() {
        val drink = PendingDrink("a", Kind.WATER, 118, "2026-10-21T05:59:50Z")
        assertEquals("2026-10-20", drink.denverDate().toString())
    }
}
