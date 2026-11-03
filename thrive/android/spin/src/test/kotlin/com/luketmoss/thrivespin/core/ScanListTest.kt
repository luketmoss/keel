package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanListTest {
    private fun hit(address: String, name: String?, ftms: Boolean = false, hr: Boolean = false) =
        ScanHit(address, name, advertisesFtms = ftms, advertisesHeartRate = hr)

    private fun rows(list: ScanList, state: DeviceState = DeviceState()) = list.rows(state)

    @Test
    fun aDeviceAdvertisingFtmsIsATrainerEvenWithHeartRateToo() {
        val list = ScanList()
        list.offer(hit("A1", "KICKR", ftms = true))
        list.offer(hit("A2", "Combo", ftms = true, hr = true))
        val rows = rows(list)
        assertEquals(listOf(DeviceKind.Trainer, DeviceKind.Trainer), rows.map { it.kind })
        assertEquals(listOf("Trainer", "Trainer"), rows.map { it.detail })
    }

    @Test
    fun aDeviceAdvertisingOnlyHeartRateIsAHeartRateMonitor() {
        val list = ScanList()
        list.offer(hit("B1", "TICKR", hr = true))
        val row = rows(list).single()
        assertEquals(DeviceKind.HeartRate, row.kind)
        assertEquals("Heart rate monitor", row.detail)
        assertEquals(ScanAction.Add, row.action)
    }

    @Test
    fun eachAddressAppearsOnceInFirstSeenOrderAndARepeatUpdatesNothing() {
        val list = ScanList()
        assertTrue(list.offer(hit("B2", "Second", hr = true)))
        assertTrue(list.offer(hit("A1", "First", ftms = true)))
        assertFalse(list.offer(hit("B2", "Renamed", ftms = true)))
        val rows = rows(list)
        assertEquals(listOf("B2", "A1"), rows.map { it.address })
        assertEquals("Second", rows[0].name)
        assertEquals(DeviceKind.HeartRate, rows[0].kind)
    }

    @Test
    fun aDeviceAdvertisingNeitherServiceIsNotListed() {
        val list = ScanList()
        assertFalse(list.offer(hit("C1", "Headphones")))
        assertTrue(list.isEmpty)
    }

    @Test
    fun aSavedAddressShowsSavedWithNoAdd() {
        val list = ScanList()
        list.offer(hit("A1", "KICKR", ftms = true))
        list.offer(hit("B1", "TICKR", hr = true))
        val state = DeviceState(
            trainer = SavedDevice("A1", "KICKR", DeviceKind.Trainer),
            monitors = listOf(SavedDevice("B1", "TICKR", DeviceKind.HeartRate)),
        )
        assertEquals(listOf(ScanAction.Saved, ScanAction.Saved), rows(list, state).map { it.action })
    }

    @Test
    fun aTrainerWhileAnotherIsSavedHasNoAddAndSaysWhatToForget() {
        val list = ScanList()
        list.offer(hit("A2", "Other trainer", ftms = true))
        list.offer(hit("B1", "TICKR", hr = true))
        val state = DeviceState(trainer = SavedDevice("A1", "Wahoo KICKR", DeviceKind.Trainer))
        val rows = rows(list, state)
        assertEquals("Trainer · forget Wahoo KICKR to add this one", rows[0].detail)
        assertEquals(ScanAction.None, rows[0].action)
        assertEquals(ScanAction.Add, rows[1].action)
    }

    @Test
    fun aNamelessDeviceIsUnnamedWithTheLastTwoBytes() {
        val list = ScanList()
        list.offer(hit("C4:5B:BE:11:3A:7F", null, hr = true))
        list.offer(hit("C4:5B:BE:11:3A:80", "  ", hr = true))
        assertEquals("Unnamed device (…3A:7F)", rows(list)[0].name)
        assertEquals("Unnamed device (…3A:80)", rows(list)[1].name)
    }

    @Test
    fun theRowsFollowTheStoreAsItChanges() {
        val list = ScanList()
        list.offer(hit("B1", "TICKR", hr = true))
        assertEquals(ScanAction.Add, rows(list).single().action)
        val store = DeviceStore(
            object : DevicePersistence {
                override fun read(): String? = null
                override fun write(json: String) {}
            },
        )
        store.add(SavedDevice("B1", "TICKR", DeviceKind.HeartRate))
        assertEquals(ScanAction.Saved, rows(list, store.state).single().action)
    }
}
