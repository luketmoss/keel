package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceStoreTest {
    private class Memory(var json: String? = null) : DevicePersistence {
        var writes = 0
        override fun read() = json
        override fun write(json: String) {
            this.json = json
            writes++
        }
    }

    private fun trainer(address: String = "AA:00:00:00:00:01", name: String = "Wahoo KICKR") =
        SavedDevice(address, name, DeviceKind.Trainer)

    private fun strap(n: Int) = SavedDevice("BB:00:00:00:00:0$n", "Strap $n", DeviceKind.HeartRate)

    private fun names(store: DeviceStore) = store.state.monitors.map { it.name }

    @Test
    fun stateRoundTripsThroughSerialization() {
        val memory = Memory()
        val store = DeviceStore(memory)
        val features = FtmsFeatures(cadence = true, power = true, erg = true, spinDown = false)
        store.add(trainer())
        store.setFeatures("AA:00:00:00:00:01", features)
        store.add(strap(1))
        store.add(strap(2))
        store.pick(strap(2).address)
        store.setFallback(false)

        val reloaded = DeviceStore(Memory(memory.json))
        assertEquals(store.state, reloaded.state)
        assertEquals(features, reloaded.state.trainer?.features)
        assertEquals(strap(2).address, reloaded.state.picked)
        assertEquals(listOf("Strap 1", "Strap 2"), names(reloaded))
    }

    @Test
    fun anUnreadableSaveIsAnEmptyStore() {
        val store = DeviceStore(Memory("{ not json"))
        assertEquals(DeviceState(), store.state)
    }

    @Test
    fun aSecondTrainerIsRefusedWhileOneIsSaved() {
        val store = DeviceStore(Memory())
        assertEquals(AddResult.Added, store.add(trainer()))
        assertEquals(AddResult.TrainerSlotTaken, store.add(trainer("AA:00:00:00:00:02", "Other")))
        assertEquals("Wahoo KICKR", store.state.trainer?.name)
        store.forget("AA:00:00:00:00:01")
        assertNull(store.state.trainer)
        assertEquals(AddResult.Added, store.add(trainer("AA:00:00:00:00:02", "Other")))
    }

    @Test
    fun addingASavedAddressAgainChangesNothing() {
        val memory = Memory()
        val store = DeviceStore(memory)
        store.add(trainer())
        store.add(strap(1))
        val writes = memory.writes
        assertEquals(AddResult.AlreadySaved, store.add(trainer()))
        assertEquals(AddResult.AlreadySaved, store.add(strap(1).copy(name = "Renamed")))
        assertEquals(writes, memory.writes)
        assertEquals(listOf("Strap 1"), names(store))
    }

    @Test
    fun theFirstMonitorAddedIsPicked() {
        val store = DeviceStore(Memory())
        store.add(strap(1))
        store.add(strap(2))
        assertEquals(strap(1).address, store.state.picked)
    }

    @Test
    fun forgettingThePickedMonitorPicksTheFirstRemainingOrNone() {
        val store = DeviceStore(Memory())
        store.add(strap(1))
        store.add(strap(2))
        store.add(strap(3))
        store.pick(strap(2).address)
        store.forget(strap(2).address)
        assertEquals(strap(1).address, store.state.picked)
        store.forget(strap(1).address)
        assertEquals(strap(3).address, store.state.picked)
        store.forget(strap(3).address)
        assertNull(store.state.picked)
        assertTrue(store.state.monitors.isEmpty())
    }

    @Test
    fun forgettingAnotherMonitorKeepsThePick() {
        val store = DeviceStore(Memory())
        store.add(strap(1))
        store.add(strap(2))
        store.forget(strap(2).address)
        assertEquals(strap(1).address, store.state.picked)
    }

    @Test
    fun aForgottenMonitorAddedAgainJoinsAtTheBottomAndIsPickedOnlyIfAlone() {
        val store = DeviceStore(Memory())
        store.add(strap(1))
        store.add(strap(2))
        store.forget(strap(1).address)
        store.add(strap(1))
        assertEquals(listOf("Strap 2", "Strap 1"), names(store))
        assertEquals(strap(2).address, store.state.picked)
        store.forget(strap(1).address)
        store.forget(strap(2).address)
        store.add(strap(1))
        assertEquals(strap(1).address, store.state.picked)
    }

    @Test
    fun moveUpAndDownReorderAndAreNoOpsAtTheEnds() {
        val store = DeviceStore(Memory())
        store.add(strap(1))
        store.add(strap(2))
        store.add(strap(3))
        store.moveUp(strap(1).address)
        assertEquals(listOf("Strap 1", "Strap 2", "Strap 3"), names(store))
        store.moveDown(strap(3).address)
        assertEquals(listOf("Strap 1", "Strap 2", "Strap 3"), names(store))
        store.moveUp(strap(3).address)
        assertEquals(listOf("Strap 1", "Strap 3", "Strap 2"), names(store))
        store.moveDown(strap(1).address)
        assertEquals(listOf("Strap 3", "Strap 1", "Strap 2"), names(store))
        assertEquals(strap(1).address, store.state.picked)
    }

    @Test
    fun theFallbackDefaultsOnAndSurvivesAReload() {
        val memory = Memory()
        val store = DeviceStore(memory)
        assertTrue(store.state.fallback)
        store.setFallback(false)
        assertTrue(!DeviceStore(Memory(memory.json)).state.fallback)
        store.setFallback(true)
        assertTrue(DeviceStore(Memory(memory.json)).state.fallback)
    }

    @Test
    fun theFallbackKeepsItsValueWhileTheMonitorsGoAndComeBack() {
        val store = DeviceStore(Memory())
        store.add(strap(1))
        store.setFallback(false)
        store.forget(strap(1).address)
        store.add(strap(2))
        assertTrue(!store.state.fallback)
    }
}
