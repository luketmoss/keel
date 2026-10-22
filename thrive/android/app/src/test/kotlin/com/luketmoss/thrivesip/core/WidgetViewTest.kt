package com.luketmoss.thrivesip.core

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetViewTest {
    // 2026-10-20 13:00 in Denver (MDT, UTC-6).
    private val now = Instant.parse("2026-10-20T19:00:00Z")
    private val readAt = Instant.parse("2026-10-20T18:42:00Z")
    private val zone = ZoneId.of("America/Denver")
    private val today = Totals("2026-10-20", waterMl = 1420, alcoholDrinks = 2, waterGoalMl = 1893)

    private fun snapshot(
        configured: Boolean = true,
        totals: Totals? = today,
        keyRejected: Boolean = false,
        pending: List<PendingDrink> = emptyList(),
        at: Instant = now,
    ) = Snapshot(configured, totals, if (totals == null) null else readAt, keyRejected, pending, at, zone)

    private var n = 0

    private fun tap(kind: String, amount: Int, at: String = "2026-10-20T18:59:00Z") =
        PendingDrink("id-${n++}", kind, amount, at)

    @Test
    fun normalShowsTheServersFiguresAndWhenTheyWereRead() {
        val view = WidgetViews.build(snapshot())
        assertEquals(Mode.NORMAL, view.mode)
        assertEquals("48 oz", view.waterText)
        assertEquals("of 64 oz", view.goalText)
        assertEquals("2 drinks", view.alcoholText)
        assertEquals("updated 12:42 PM", view.status)
        assertEquals(1420f / 1893f, view.progress!!, 0.0001f)
        assertTrue(view.buttonsEnabled)
    }

    @Test
    fun notConfiguredAsksForSetupAndDisablesBothButtons() {
        val view = WidgetViews.build(snapshot(configured = false, totals = null))
        assertEquals(Mode.NOT_CONFIGURED, view.mode)
        assertEquals("Set up Thrive Sip", view.headline)
        assertFalse(view.buttonsEnabled)
        assertNull(view.waterText)
    }

    @Test
    fun beforeTheFirstReadItSaysLoadingAndTheButtonsWork() {
        val view = WidgetViews.build(snapshot(totals = null))
        assertEquals(Mode.LOADING, view.mode)
        assertEquals("Loading…", view.headline)
        assertTrue(view.buttonsEnabled)
    }

    @Test
    fun queuedTapsAreAddedAndCounted() {
        val view = WidgetViews.build(
            snapshot(pending = listOf(tap(Kind.WATER, 118), tap(Kind.WATER, 118), tap(Kind.ALCOHOL, 1))),
        )
        assertEquals(Mode.OFFLINE, view.mode)
        assertEquals("56 oz", view.waterText) // 1420 + 236 ml = 1656 ml
        assertEquals("3 drinks", view.alcoholText)
        assertEquals("offline · 3 queued", view.status)
    }

    @Test
    fun theFirstTapRaisesTheTotalAtOnce() {
        val empty = Totals("2026-10-20", 0, 0, 1893)
        val before = WidgetViews.build(snapshot(totals = empty))
        val after = WidgetViews.build(snapshot(totals = empty, pending = listOf(tap(Kind.WATER, 118))))
        assertEquals("0 oz", before.waterText)
        assertEquals("4 oz", after.waterText)
    }

    @Test
    fun aRejectedKeySaysSoAndStillCountsTheQueue() {
        val view = WidgetViews.build(snapshot(keyRejected = true, pending = listOf(tap(Kind.ALCOHOL, 1))))
        assertEquals(Mode.KEY_REJECTED, view.mode)
        assertEquals("Key rejected — open Thrive Sip", view.status)
        assertEquals("3 drinks", view.alcoholText)
    }

    @Test
    fun overTheGoalTheBarIsFullAndTheFigureContinues() {
        val view = WidgetViews.build(snapshot(totals = Totals("2026-10-20", 2400, 0, 1893)))
        assertEquals(1f, view.progress!!, 0f)
        assertEquals("81 oz", view.waterText)
    }

    @Test
    fun anUnknownGoalHidesTheBarAndTheOf() {
        val view = WidgetViews.build(snapshot(totals = Totals("2026-10-20", 1420, 0, 0)))
        assertNull(view.progress)
        assertNull(view.goalText)
        assertEquals("48 oz", view.waterText)
    }

    @Test
    fun aReadFromYesterdayShowsAsZeroAfterDenverMidnight() {
        // 00:30 on the 21st in Denver, with the last read from the 20th.
        val view = WidgetViews.build(snapshot(at = Instant.parse("2026-10-21T06:30:00Z")))
        assertEquals("0 oz", view.waterText)
        assertEquals("0 drinks", view.alcoholText)
        assertEquals("of 64 oz", view.goalText)
    }

    @Test
    fun aTapJustBeforeMidnightStaysOnItsOwnDay() {
        // 23:59:50 Denver on the 20th, still queued at 00:10 on the 21st.
        val late = tap(Kind.WATER, 118, at = "2026-10-21T05:59:50Z")
        val view = WidgetViews.build(snapshot(pending = listOf(late), at = Instant.parse("2026-10-21T06:10:00Z")))
        assertEquals("0 oz", view.waterText)
        assertEquals("offline · 1 queued", view.status)
    }

    @Test
    fun descriptionsReadAsTheDesignSays() {
        val view = WidgetViews.build(snapshot())
        assertEquals("Water 48 of 64 ounces", view.waterDescription)
        assertEquals("2 alcoholic drinks", view.alcoholDescription)
        val one = WidgetViews.build(snapshot(totals = Totals("2026-10-20", 0, 1, 1893)))
        assertEquals("1 drink", one.alcoholText)
        assertEquals("1 alcoholic drink", one.alcoholDescription)
    }

    @Test
    fun coffeeIsTodaysCupsPlusQueuedTaps() {
        val withCoffee = today.copy(coffeeCups = 2)
        val view = WidgetViews.build(snapshot(totals = withCoffee, pending = listOf(tap(Kind.COFFEE, 1))))
        assertEquals("3", view.coffeeText)
        assertEquals("3 cups of coffee", view.coffeeDescription)
        // The queue counts coffee: one queued tap is "1 queued", water and alcohol alike.
        assertEquals("offline · 1 queued", view.status)
    }

    @Test
    fun coffeeDescriptionIsSingularForOneAndPluralForZero() {
        assertEquals("0 cups of coffee", WidgetViews.build(snapshot()).coffeeDescription)
        val one = WidgetViews.build(snapshot(totals = today.copy(coffeeCups = 1)))
        assertEquals("1 cup of coffee", one.coffeeDescription)
        assertEquals("1", one.coffeeText)
    }

    @Test
    fun coffeeFromBeforeDenverMidnightCountsFromZero() {
        val yesterday = today.copy(coffeeCups = 4)
        val view = WidgetViews.build(snapshot(totals = yesterday, at = Instant.parse("2026-10-21T06:30:00Z")))
        assertEquals("0", view.coffeeText)
        assertEquals("0 cups of coffee", view.coffeeDescription)
    }

    @Test
    fun alcoholAlsoHasABareCountForTheThreeColumnLayout() {
        val view = WidgetViews.build(snapshot())
        assertEquals("2", view.alcoholCount)
        assertEquals("2 drinks", view.alcoholText)
    }

    @Test
    fun coffeeIsAbsentWhileLoadingAndWhenNotConfigured() {
        assertNull(WidgetViews.build(snapshot(totals = null)).coffeeText)
        val off = WidgetViews.build(snapshot(configured = false, totals = null))
        assertNull(off.coffeeText)
        assertEquals("Set up Thrive Sip", off.coffeeDescription)
    }
}
