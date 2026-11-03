package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Test

class RouteTest {
    private fun roundTrip(r: Route) = assertEquals(r, Routes.decode(Routes.encode(r)))

    @Test
    fun everyRouteSurvivesBeingSavedAsAString() {
        roundTrip(Route.Tab(AppTab.Library))
        roundTrip(Route.Tab(AppTab.Devices))
        roundTrip(Route.Settings(AppTab.Library))
        roundTrip(Route.Settings(AppTab.Devices))
        roundTrip(Route.Detail("rw_1a2b3c4d"))
        roundTrip(Route.Builder(null, Route.Tab(AppTab.Devices)))
        roundTrip(Route.Builder("rw_1", Route.Detail("rw_1")))
    }

    @Test
    fun theAppOpensOnLibrary() {
        assertEquals(Route.Tab(AppTab.Library), Routes.START)
        assertEquals(Route.Tab(AppTab.Library), Routes.decode(null))
    }

    @Test
    fun anythingUnreadableIsTheStartScreen() {
        for (text in listOf("", "nonsense", "tab:rides", "detail:", "builder:x", "settings:")) {
            assertEquals(text, Routes.START, Routes.decode(text))
        }
    }
}
