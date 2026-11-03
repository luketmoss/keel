package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HeartRateTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    private fun parse(vararg values: Int, at: Long = 0L) = HeartRate.parse(bytes(*values), at)

    @Test
    fun uint8Bpm() {
        assertEquals(64, parse(0x00, 64)!!.bpm)
        assertEquals(200, parse(0x00, 200)!!.bpm)
    }

    @Test
    fun uint16Bpm() {
        assertEquals(300, parse(0x01, 0x2C, 0x01)!!.bpm)
    }

    @Test
    fun contactBitsAreOnlyMeaningWhenSupported() {
        assertNull(parse(0x00, 64)!!.contact) // not reported
        assertNull(parse(0x02, 64)!!.contact) // "detected" without "supported" says nothing
        assertEquals(true, parse(0x06, 64)!!.contact)
        assertEquals(false, parse(0x04, 64)!!.contact)
    }

    @Test
    fun aShortValueIsNotParsed() {
        assertNull(parse())
        assertNull(parse(0x00))
        assertNull(parse(0x01, 0x40))
    }

    @Test
    fun aFreshReadingWithContactShowsBpm() {
        val reading = parse(0x06, 64, at = 1_000L)
        assertEquals("64 bpm", HeartRate.liveText(reading, nowMs = 2_000L))
    }

    @Test
    fun aReadingWithNoContactReportedStillShowsBpm() {
        assertEquals("72 bpm", HeartRate.liveText(parse(0x00, 72, at = 0L), nowMs = 100L))
    }

    @Test
    fun noReadingWhenContactIsMissing() {
        assertEquals("No reading", HeartRate.liveText(parse(0x04, 64, at = 0L), nowMs = 100L))
    }

    @Test
    fun noReadingWhenBpmIsZero() {
        assertEquals("No reading", HeartRate.liveText(parse(0x06, 0, at = 0L), nowMs = 100L))
    }

    @Test
    fun noReadingBeforeTheFirstOne() {
        assertEquals("No reading", HeartRate.liveText(null, nowMs = 100L))
    }

    @Test
    fun noReadingAfterFiveSecondsOfSilence() {
        var now = 10_000L
        val reading = parse(0x06, 64, at = now)
        assertEquals("64 bpm", HeartRate.liveText(reading, now))
        now += 4_999L
        assertEquals("64 bpm", HeartRate.liveText(reading, now))
        now += 1L
        assertEquals("No reading", HeartRate.liveText(reading, now))
    }
}
