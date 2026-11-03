package com.luketmoss.thrivespin.core.ble

import com.luketmoss.thrivespin.core.s16
import com.luketmoss.thrivespin.core.u16
import com.luketmoss.thrivespin.core.u32
import com.luketmoss.thrivespin.core.u8

/** What the trainer says it can be told to do: the Target Setting Features bits the ride uses. */
data class TargetSupport(val power: Boolean, val resistance: Boolean, val simulation: Boolean) {
    companion object {
        /** Nothing was read: assume it can, and let a "not supported" answer say otherwise. */
        val ALL = TargetSupport(power = true, resistance = true, simulation = true)
    }
}

/** A Supported Range: [min] and [max] in the characteristic's raw units, and the [increment]. */
data class ValueRange(val min: Int, val max: Int, val increment: Int)

/**
 * The Fitness Machine Control Point's writes and the reads that go with them, as bytes (#768). Plain
 * Kotlin so the JVM tests pin every byte. Every multi-byte field is little-endian.
 */
object FtmsControl {
    const val POWER_RANGE = "00002ad8-0000-1000-8000-00805f9b34fb"
    const val RESISTANCE_RANGE = "00002ad6-0000-1000-8000-00805f9b34fb"

    const val OP_REQUEST_CONTROL = 0x00
    const val OP_SET_RESISTANCE = 0x04
    const val OP_SET_POWER = 0x05
    const val OP_START_OR_RESUME = 0x07
    const val OP_SET_SIMULATION = 0x11

    const val RESULT_SUCCESS = 0x01
    const val RESULT_NOT_SUPPORTED = 0x02
    const val RESULT_INVALID = 0x03
    const val RESULT_FAILED = 0x04
    const val RESULT_NOT_PERMITTED = 0x05

    const val STATUS_RESET = 0x01
    const val STATUS_CONTROL_LOST = 0xFF

    /** Crr 0.0040 (uint8, 0.0001) and Cw 0.51 kg/m (uint8, 0.01): the fixed road the slope is ridden on. */
    private const val CRR = 40
    private const val CW = 51

    fun requestControl(): ByteArray = byteArrayOf(OP_REQUEST_CONTROL.toByte())

    fun startOrResume(): ByteArray = byteArrayOf(OP_START_OR_RESUME.toByte())

    /** Set Target Power `05`, a sint16 in watts. 225 W is `05 E1 00`. */
    fun setTargetPower(watts: Int): ByteArray = byteArrayOf(OP_SET_POWER.toByte(), *le16(watts))

    /**
     * Set Target Resistance Level `04`: a uint8 in 0.1 units, as the Fitness Machine Service 1.0 table
     * has it. [raw] is in the units of the Supported Resistance Level Range.
     */
    fun setTargetResistance(raw: Int): ByteArray =
        byteArrayOf(OP_SET_RESISTANCE.toByte(), raw.coerceIn(0, 255).toByte())

    /**
     * Set Indoor Bike Simulation Parameters `11`: wind 0 (sint16, 0.001 m/s), grade (sint16, 0.01%),
     * Crr and Cw. 4.5% is `11 00 00 C2 01 28 33`.
     */
    fun setSimulation(gradeHundredths: Int): ByteArray =
        byteArrayOf(OP_SET_SIMULATION.toByte(), 0, 0, *le16(gradeHundredths), CRR.toByte(), CW.toByte())

    /** The FTMS Feature characteristic's Target Setting Features: resistance bit 2, power bit 3, simulation bit 13. */
    fun parseTargetSupport(feature: ByteArray): TargetSupport? {
        if (feature.size < 8) return null
        val target = feature.u32(4)
        return TargetSupport(
            power = target and (1L shl 3) != 0L,
            resistance = target and (1L shl 2) != 0L,
            simulation = target and (1L shl 13) != 0L,
        )
    }

    /** Supported Power Range (0x2AD8): sint16 minimum and maximum in watts, uint16 increment. */
    fun parsePowerRange(bytes: ByteArray): ValueRange? {
        if (bytes.size < 6) return null
        return ValueRange(bytes.s16(0), bytes.s16(2), bytes.u16(4))
    }

    /** Supported Resistance Level Range (0x2AD6): sint16 minimum and maximum and uint16 increment, all 0.1 units. */
    fun parseResistanceRange(bytes: ByteArray): ValueRange? {
        if (bytes.size < 6) return null
        return ValueRange(bytes.s16(0), bytes.s16(2), bytes.u16(4))
    }

    /**
     * A level 0-100 on the trainer's range: `min + (max - min) x level / 100`, snapped down to the
     * increment. With no range, the level itself.
     */
    fun levelToRaw(level: Int, range: ValueRange?): Int {
        val l = level.coerceIn(0, 100)
        if (range == null) return l
        val raw = range.min + (range.max - range.min) * l / 100
        if (range.increment <= 0) return raw
        return range.min + (raw - range.min) / range.increment * range.increment
    }

    /** The power to send: [watts] held inside the trainer's range when it is known. */
    fun clampPower(watts: Int, range: ValueRange?): Int =
        if (range == null) watts else watts.coerceIn(range.min, maxOf(range.min, range.max))

    /** Fitness Machine Status `FF` (control permission lost) or `01` (reset): the sequence has to run again. */
    fun isControlLost(status: ByteArray): Boolean =
        status.isNotEmpty() && (status.u8(0) == STATUS_CONTROL_LOST || status.u8(0) == STATUS_RESET)

    private fun le16(value: Int): ByteArray =
        byteArrayOf((value and 0xFF).toByte(), ((value shr 8) and 0xFF).toByte())
}
