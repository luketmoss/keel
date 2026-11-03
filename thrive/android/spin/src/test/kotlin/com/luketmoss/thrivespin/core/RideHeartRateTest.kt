package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RideHeartRateTest {
    private fun monitor(name: String) = SavedDevice("addr-$name", name, DeviceKind.HeartRate)

    private fun state(picked: String?, fallback: Boolean = true, vararg names: String) = DeviceState(
        monitors = names.map { monitor(it) },
        picked = picked?.let { "addr-$it" },
        fallback = fallback,
    )

    private fun found(vararg names: String) = names.map { "addr-$it" }.toSet()

    private fun choose(state: DeviceState, found: Set<String>) = RideHeartRate.choose(state, found)

    @Test
    fun thePickedMonitorWinsWhenFound() {
        assertEquals("addr-B", choose(state("B", true, "A", "B", "C"), found("A", "B", "C")))
        assertEquals("addr-B", choose(state("B", true, "A", "B", "C"), found("B")))
    }

    @Test
    fun withTheFallbackOnTheFirstFoundInListOrderStandsIn() {
        assertEquals("addr-A", choose(state("B", true, "A", "B", "C"), found("A", "C")))
    }

    @Test
    fun onlyCFoundIsC() {
        assertEquals("addr-C", choose(state("B", true, "A", "B", "C"), found("C")))
    }

    @Test
    fun withTheFallbackOffAndThePickedNotFoundThereIsNone() {
        assertNull(choose(state("B", false, "A", "B", "C"), found("A", "C")))
    }

    @Test
    fun withTheFallbackOffThePickedStillWinsWhenFound() {
        assertEquals("addr-B", choose(state("B", false, "A", "B", "C"), found("A", "B")))
    }

    @Test
    fun nothingFoundIsNone() {
        assertNull(choose(state("B", true, "A", "B", "C"), emptySet()))
    }

    @Test
    fun nothingSavedIsNone() {
        assertNull(choose(DeviceState(), found("A", "B")))
    }

    @Test
    fun aFoundDeviceThatIsNotASavedMonitorIsIgnored() {
        assertNull(choose(state("B", true, "A", "B", "C"), found("Z")))
    }
}
