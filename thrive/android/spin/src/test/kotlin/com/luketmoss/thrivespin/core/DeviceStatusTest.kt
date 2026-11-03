package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceStatusTest {
    @Test
    fun connectedWinsWhenReady() {
        assertEquals(DeviceStatus.Connected, DeviceStatus.of(ready = true, connected = true, lookingSinceMs = 0, nowMs = 60_000))
    }

    @Test
    fun lookingUnderTenSecondsIsConnecting() {
        assertEquals(DeviceStatus.Connecting, DeviceStatus.of(true, false, 1_000, 10_999))
    }

    @Test
    fun notSeenForTenSecondsIsNotFound() {
        assertEquals(DeviceStatus.NotFound, DeviceStatus.of(true, false, 1_000, 11_000))
    }

    @Test
    fun bluetoothOffOrNoPermissionIsUnavailableWhateverElse() {
        assertEquals(DeviceStatus.Unavailable, DeviceStatus.of(false, true, 0, 0))
        assertEquals(DeviceStatus.Unavailable, DeviceStatus.of(false, false, 0, 99_000))
    }
}
