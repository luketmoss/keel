package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.ble.FtmsControl
import com.luketmoss.thrivespin.core.ble.TargetSupport
import com.luketmoss.thrivespin.core.ble.ValueRange
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FtmsControlTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    @Test
    fun theCommandsAreTheBytesOfTheSpec() {
        assertArrayEquals(bytes(0x00), FtmsControl.requestControl())
        assertArrayEquals(bytes(0x07), FtmsControl.startOrResume())
        assertArrayEquals(bytes(0x05, 0xE1, 0x00), FtmsControl.setTargetPower(225))
        assertArrayEquals(bytes(0x05, 0x90, 0x01), FtmsControl.setTargetPower(400))
        assertArrayEquals(bytes(0x04, 0x1E), FtmsControl.setTargetResistance(30))
        assertArrayEquals(bytes(0x11, 0x00, 0x00, 0xC2, 0x01, 0x28, 0x33), FtmsControl.setSimulation(450))
        assertArrayEquals(bytes(0x11, 0x00, 0x00, 0x38, 0xFF, 0x28, 0x33), FtmsControl.setSimulation(-200))
        assertArrayEquals(bytes(0x11, 0x00, 0x00, 0xC8, 0x00, 0x28, 0x33), FtmsControl.setSimulation(200))
        assertArrayEquals(bytes(0x11, 0x00, 0x00, 0x00, 0x00, 0x28, 0x33), FtmsControl.setSimulation(0))
    }

    @Test
    fun theTargetSupportIsReadFromTheFeatureBits() {
        // Target Setting Features: resistance (bit 2), power (bit 3), simulation (bit 13).
        val target = (1L shl 2) or (1L shl 3) or (1L shl 13)
        val feature = ByteArray(8)
        for (i in 0 until 4) feature[4 + i] = (target shr (8 * i)).toByte()
        assertEquals(TargetSupport(power = true, resistance = true, simulation = true), FtmsControl.parseTargetSupport(feature))
        val onlyPower = ByteArray(8).also { it[4] = 0x08 }
        assertEquals(TargetSupport(power = true, resistance = false, simulation = false), FtmsControl.parseTargetSupport(onlyPower))
        assertNull(FtmsControl.parseTargetSupport(ByteArray(4)))
    }

    @Test
    fun theRangesAreSint16MinMaxAndUint16Increment() {
        assertEquals(ValueRange(0, 2000, 1), FtmsControl.parsePowerRange(bytes(0x00, 0x00, 0xD0, 0x07, 0x01, 0x00)))
        assertEquals(ValueRange(-10, 100, 5), FtmsControl.parseResistanceRange(bytes(0xF6, 0xFF, 0x64, 0x00, 0x05, 0x00)))
        assertNull(FtmsControl.parsePowerRange(bytes(0x00, 0x00)))
    }

    @Test
    fun aLevelIsMappedOntoTheRangeAndSnappedDownToTheIncrement() {
        assertEquals(40, FtmsControl.levelToRaw(30, ValueRange(10, 110, 5)))
        assertEquals(30, FtmsControl.levelToRaw(30, ValueRange(0, 100, 1)))
        assertEquals(60, FtmsControl.levelToRaw(33, ValueRange(0, 200, 10)))
        assertEquals(0, FtmsControl.levelToRaw(0, ValueRange(0, 200, 10)))
        assertEquals(200, FtmsControl.levelToRaw(100, ValueRange(0, 200, 10)))
        assertEquals(30, FtmsControl.levelToRaw(30, null))
    }

    @Test
    fun powerIsHeldInsideTheRange() {
        assertEquals(400, FtmsControl.clampPower(500, ValueRange(0, 400, 1)))
        assertEquals(20, FtmsControl.clampPower(5, ValueRange(20, 400, 1)))
        assertEquals(225, FtmsControl.clampPower(225, ValueRange(0, 400, 1)))
        assertEquals(500, FtmsControl.clampPower(500, null))
    }

    @Test
    fun onlyControlLostAndResetCallForTheSequenceAgain() {
        assertTrue(FtmsControl.isControlLost(bytes(0xFF)))
        assertTrue(FtmsControl.isControlLost(bytes(0x01)))
        assertFalse(FtmsControl.isControlLost(bytes(0x02)))
        assertFalse(FtmsControl.isControlLost(bytes()))
    }
}
