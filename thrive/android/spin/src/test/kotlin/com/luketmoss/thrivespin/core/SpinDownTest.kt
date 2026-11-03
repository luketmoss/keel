package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SpinDownTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    private class Rig {
        var now = 0L
        val written = mutableListOf<List<Byte>>()
        val spinDown = SpinDown(write = { written += it.toList() }, nowMs = { now })
        val state get() = spinDown.state
    }

    private val accepted = bytes(0x80, 0x00, 0x01)

    /** Spin Down Control accepted, targets 30.00 and 37.00 km/h. */
    private val started = bytes(0x80, 0x13, 0x01, 0xB8, 0x0B, 0x74, 0x0E)

    private fun running(): Rig = Rig().also {
        it.spinDown.start()
        it.spinDown.onControlResponse(accepted)
        it.spinDown.onControlResponse(started)
    }

    @Test
    fun itWritesRequestControlThenSpinDownInThatOrder() {
        val rig = Rig()
        rig.spinDown.start()
        assertEquals(listOf(listOf<Byte>(0x00)), rig.written)
        assertEquals("Getting the trainer ready…", rig.state.message)
        rig.spinDown.onControlResponse(accepted)
        assertEquals(listOf(listOf<Byte>(0x00), listOf<Byte>(0x13, 0x01)), rig.written)
        assertEquals(SpinDownState.Starting, rig.state)
    }

    @Test
    fun theSpinDownResponseShowsTheHighTargetInMphToOneDecimal() {
        val rig = running()
        // 37.00 km/h = 22.99 mph
        assertEquals("Pedal up to 23.0 mph", rig.state.message)
        assertEquals(SpinDownState.SpeedUp(37.0 / SpinDown.KMH_PER_MPH), rig.state)
    }

    @Test
    fun stopPedallingStatusMovesToCoast() {
        val rig = running()
        rig.spinDown.onStatus(bytes(0x14, 0x04))
        assertEquals("Stop pedalling and let it coast.", rig.state.message)
    }

    @Test
    fun successStatusIsCalibrated() {
        val rig = running()
        rig.spinDown.onStatus(bytes(0x14, 0x04))
        rig.spinDown.onStatus(bytes(0x14, 0x02))
        assertEquals(SpinDownState.Done, rig.state)
        assertEquals("Calibrated.", rig.state.message)
        assertTrue(rig.spinDown.finished)
    }

    @Test
    fun errorStatusFails() {
        val rig = running()
        rig.spinDown.onStatus(bytes(0x14, 0x03))
        assertEquals("Spin-down didn't finish. Try again.", rig.state.message)
        assertTrue(rig.state is SpinDownState.Failed)
    }

    @Test
    fun aRequestedStatusChangesNothingButResetsTheClock() {
        val rig = running()
        rig.now = 50_000L
        rig.spinDown.onStatus(bytes(0x14, 0x01))
        rig.now = 100_000L
        rig.spinDown.onTick()
        assertTrue(rig.state is SpinDownState.SpeedUp)
    }

    @Test
    fun aResultOtherThanSuccessIsTheTrainerSayingNo() {
        val refusedControl = Rig().also {
            it.spinDown.start()
            it.spinDown.onControlResponse(bytes(0x80, 0x00, 0x03))
        }
        val no = "The trainer said no. Close other apps connected to it and try again."
        assertEquals(no, refusedControl.state.message)
        assertEquals(1, refusedControl.written.size)

        val refusedSpinDown = Rig().also {
            it.spinDown.start()
            it.spinDown.onControlResponse(accepted)
            it.spinDown.onControlResponse(bytes(0x80, 0x13, 0x02))
        }
        assertEquals(no, refusedSpinDown.state.message)
    }

    @Test
    fun aDisconnectLosesTheTrainer() {
        val rig = running()
        rig.spinDown.onDisconnect()
        assertEquals("Lost the trainer. Try again when it's connected.", rig.state.message)
    }

    @Test
    fun aDisconnectWhileStartingLosesTheTrainerToo() {
        val rig = Rig()
        rig.spinDown.start()
        rig.spinDown.onDisconnect()
        assertTrue(rig.state is SpinDownState.Failed)
    }

    @Test
    fun sixtySecondsWithNoStatusChangeFails() {
        val rig = running()
        rig.now = 59_999L
        rig.spinDown.onTick()
        assertTrue(rig.state is SpinDownState.SpeedUp)
        rig.now = 60_000L
        rig.spinDown.onTick()
        assertEquals("Spin-down didn't finish. Try again.", rig.state.message)
    }

    @Test
    fun theSixtySecondsRestartWithEachStatusChange() {
        val rig = running()
        rig.now = 50_000L
        rig.spinDown.onStatus(bytes(0x14, 0x04))
        rig.now = 109_999L
        rig.spinDown.onTick()
        assertEquals(SpinDownState.Coast, rig.state)
        rig.now = 110_000L
        rig.spinDown.onTick()
        assertTrue(rig.state is SpinDownState.Failed)
    }

    @Test
    fun speedIsShownInMph() {
        val rig = running()
        rig.spinDown.onSpeed(29.6)
        assertEquals("%.1f".format(29.6 / SpinDown.KMH_PER_MPH), SpinDown.formatMph(rig.spinDown.speedMph!!))
        assertEquals("18.4", SpinDown.formatMph(29.61 / SpinDown.KMH_PER_MPH))
        rig.spinDown.onSpeed(null)
        assertEquals(null, rig.spinDown.speedMph)
    }

    @Test
    fun nothingMovesAfterItEnds() {
        val rig = running()
        rig.spinDown.onStatus(bytes(0x14, 0x03))
        val failed = rig.state
        rig.spinDown.onStatus(bytes(0x14, 0x02))
        rig.spinDown.onControlResponse(started)
        rig.spinDown.onDisconnect()
        rig.now = 1_000_000L
        rig.spinDown.onTick()
        assertEquals(failed, rig.state)
        assertEquals(2, rig.written.size)
    }

    @Test
    fun tryAgainRestartsFromTheStart() {
        val rig = running()
        rig.spinDown.onStatus(bytes(0x14, 0x03))
        rig.spinDown.start()
        assertEquals(SpinDownState.Starting, rig.state)
        assertEquals(listOf<Byte>(0x00), rig.written.last())
        rig.spinDown.onControlResponse(accepted)
        assertEquals(listOf<Byte>(0x13, 0x01), rig.written.last())
    }
}
