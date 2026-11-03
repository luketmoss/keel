package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FtmsTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    // ---- Feature ----

    /** Machine features: cadence (bit 1), power (bit 14). Target: power target (bit 3), spin-down (bit 15). */
    private fun feature(machine: Long, target: Long): ByteArray {
        val out = ByteArray(8)
        for (i in 0 until 4) {
            out[i] = (machine shr (8 * i)).toByte()
            out[4 + i] = (target shr (8 * i)).toByte()
        }
        return out
    }

    @Test
    fun aKickrLikeFeatureReportsCadencePowerAndErg() {
        val features = Ftms.parseFeature(feature(machine = (1L shl 1) or (1L shl 14), target = 1L shl 3))
        assertEquals(FtmsFeatures(cadence = true, power = true, erg = true, spinDown = false), features)
        assertEquals("Trainer · power, cadence, ERG", Ftms.detailLine(features))
    }

    @Test
    fun spinDownIsTargetBit15() {
        val features = Ftms.parseFeature(feature(machine = 1L shl 14, target = (1L shl 15) or (1L shl 3)))!!
        assertTrue(features.spinDown)
        assertTrue(features.power)
        assertTrue(!features.cadence)
        assertEquals("Trainer · power, ERG", Ftms.detailLine(features))
    }

    @Test
    fun bitsOutsideTheFourAreIgnored() {
        val features = Ftms.parseFeature(feature(machine = 0xFFFF_FFFFL and (1L shl 1).inv() and (1L shl 14).inv(), target = 0L))!!
        assertEquals(FtmsFeatures(cadence = false, power = false, erg = false, spinDown = false), features)
        assertEquals("Trainer", Ftms.detailLine(features))
    }

    @Test
    fun theDetailLineIsPlainTrainerBeforeAnyRead() {
        assertEquals("Trainer", Ftms.detailLine(null))
    }

    @Test
    fun aShortFeatureValueIsNotParsed() {
        assertNull(Ftms.parseFeature(bytes(0x02, 0x40, 0, 0)))
    }

    // ---- Indoor Bike Data ----

    @Test
    fun speedAloneWhenFlagBitZeroIsClear() {
        // flags 0x0000, speed 0x0A28 = 2600 -> 26.00 km/h
        val data = Ftms.parseIndoorBikeData(bytes(0x00, 0x00, 0x28, 0x0A))!!
        assertEquals(26.0, data.speedKmh!!, 1e-9)
        assertNull(data.cadenceRpm)
        assertNull(data.powerW)
    }

    @Test
    fun speedIsAbsentWhenFlagBitZeroIsSet() {
        // flags 0x0044: bit 0 set (no speed), bit 2 cadence, bit 6 power. Cadence 180 -> 90 rpm, power 250 W.
        val data = Ftms.parseIndoorBikeData(bytes(0x45, 0x00, 0xB4, 0x00, 0xFA, 0x00))!!
        assertNull(data.speedKmh)
        assertEquals(90.0, data.cadenceRpm!!, 1e-9)
        assertEquals(250, data.powerW)
    }

    @Test
    fun speedCadenceAndPowerInOneValue() {
        // flags 0x0044: speed present, cadence, power. 31.50 km/h, 85.5 rpm, 301 W.
        val data = Ftms.parseIndoorBikeData(bytes(0x44, 0x00, 0x4E, 0x0C, 0xAB, 0x00, 0x2D, 0x01))!!
        assertEquals(31.5, data.speedKmh!!, 1e-9)
        assertEquals(85.5, data.cadenceRpm!!, 1e-9)
        assertEquals(301, data.powerW)
    }

    @Test
    fun everyFieldBeforePowerIsSkippedIncludingDistanceAndEnergy() {
        // flags: avg speed (1), cadence (2), avg cadence (3), distance (4), resistance (5), power (6), avg power (7), energy (8)
        val flags = (1 shl 1) or (1 shl 2) or (1 shl 3) or (1 shl 4) or (1 shl 5) or (1 shl 6) or (1 shl 7) or (1 shl 8)
        val data = Ftms.parseIndoorBikeData(
            bytes(
                flags and 0xFF, flags shr 8,
                0x10, 0x0E, // instantaneous speed 3600 -> 36.00
                0x11, 0x0E, // average speed
                0x50, 0x00, // cadence 80 -> 40 rpm
                0x4F, 0x00, // average cadence
                0x01, 0x02, 0x03, // total distance (uint24)
                0x0A, 0x00, // resistance
                0x2C, 0x01, // power 300
                0x2B, 0x01, // average power
                0x01, 0x00, 0x02, 0x00, 0x03, // expended energy (5 bytes)
            ),
        )!!
        assertEquals(36.0, data.speedKmh!!, 1e-9)
        assertEquals(40.0, data.cadenceRpm!!, 1e-9)
        assertEquals(300, data.powerW)
    }

    @Test
    fun fieldsAfterPowerDoNotDisturbIt() {
        // flags: power (6), heart rate (9), metabolic equivalent (10), elapsed (11), remaining (12), speed present.
        val flags = (1 shl 6) or (1 shl 9) or (1 shl 10) or (1 shl 11) or (1 shl 12)
        val data = Ftms.parseIndoorBikeData(
            bytes(flags and 0xFF, flags shr 8, 0xE8, 0x03, 0xC8, 0x00, 0x90, 0x05, 0x2C, 0x01, 0x58, 0x02),
        )!!
        assertEquals(10.0, data.speedKmh!!, 1e-9)
        assertEquals(200, data.powerW)
        assertNull(data.cadenceRpm)
    }

    @Test
    fun powerIsSigned() {
        val data = Ftms.parseIndoorBikeData(bytes(0x41, 0x00, 0xFF, 0xFF))!!
        assertEquals(-1, data.powerW)
        assertNull(data.speedKmh)
    }

    @Test
    fun aValueCutShortIsNotParsed() {
        assertNull(Ftms.parseIndoorBikeData(bytes(0x44, 0x00, 0x76, 0x0C, 0xAB)))
        assertNull(Ftms.parseIndoorBikeData(bytes(0x00)))
        assertNotNull(Ftms.parseIndoorBikeData(bytes(0x01, 0x00)))
    }

    // ---- Control Point and status ----

    @Test
    fun theControlPointCommandsAreTheDocumentedBytes() {
        assertEquals(listOf<Byte>(0x00), Ftms.REQUEST_CONTROL.toList())
        assertEquals(listOf<Byte>(0x13, 0x01), Ftms.SPIN_DOWN_START.toList())
    }

    @Test
    fun aControlResponseCarriesTheOpTheResultAndTheTargets() {
        val response = Ftms.parseControlResponse(bytes(0x80, 0x13, 0x01, 0xB8, 0x0B, 0xD8, 0x0E))!!
        assertEquals(0x13, response.op)
        assertEquals(0x01, response.result)
        val (low, high) = Ftms.spinDownTargets(response)!!
        assertEquals(30.0, low, 1e-9)
        assertEquals(38.0, high, 1e-9)
    }

    @Test
    fun aValueThatIsNotAResponseIsNotParsed() {
        assertNull(Ftms.parseControlResponse(bytes(0x00, 0x13, 0x01)))
        assertNull(Ftms.parseControlResponse(bytes(0x80, 0x13)))
        assertNull(Ftms.spinDownTargets(Ftms.parseControlResponse(bytes(0x80, 0x13, 0x02))!!))
    }

    @Test
    fun spinDownStatusIsTheSecondByteOfA14Value() {
        assertEquals(0x04, Ftms.parseSpinDownStatus(bytes(0x14, 0x04)))
        assertNull(Ftms.parseSpinDownStatus(bytes(0x05, 0x04)))
        assertNull(Ftms.parseSpinDownStatus(bytes(0x14)))
    }
}
