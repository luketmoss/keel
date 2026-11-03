package com.luketmoss.thrivespin.core

import kotlinx.serialization.Serializable

/**
 * Fitness Machine Service parsing and encoding, plain Kotlin on byte arrays so
 * it is tested on the JVM and reused by the ride (#768). Every multi-byte field
 * is little-endian.
 */
object Ftms {
    const val FTMS_SERVICE = "00001826-0000-1000-8000-00805f9b34fb"
    const val FEATURE = "00002acc-0000-1000-8000-00805f9b34fb"
    const val INDOOR_BIKE_DATA = "00002ad2-0000-1000-8000-00805f9b34fb"
    const val CONTROL_POINT = "00002ad9-0000-1000-8000-00805f9b34fb"
    const val MACHINE_STATUS = "00002ada-0000-1000-8000-00805f9b34fb"

    const val OP_REQUEST_CONTROL = 0x00
    const val OP_SPIN_DOWN = 0x13
    const val RESPONSE_CODE = 0x80
    const val RESULT_SUCCESS = 0x01
    const val STATUS_SPIN_DOWN = 0x14

    val REQUEST_CONTROL = byteArrayOf(0x00)
    val SPIN_DOWN_START = byteArrayOf(0x13, 0x01)

    /** FTMS Feature (0x2ACC): the machine features, then the target setting features. */
    fun parseFeature(bytes: ByteArray): FtmsFeatures? {
        if (bytes.size < 8) return null
        val machine = bytes.u32(0)
        val target = bytes.u32(4)
        return FtmsFeatures(
            cadence = machine.bit(1),
            power = machine.bit(14),
            erg = target.bit(3),
            spinDown = target.bit(15),
        )
    }

    /** The trainer card's detail line: "Trainer" until a read, then what it supports. */
    fun detailLine(features: FtmsFeatures?): String {
        if (features == null) return "Trainer"
        val items = buildList {
            if (features.power) add("power")
            if (features.cadence) add("cadence")
            if (features.erg) add("ERG")
        }
        return if (items.isEmpty()) "Trainer" else "Trainer · " + items.joinToString(", ")
    }

    /**
     * Indoor Bike Data (0x2AD2). Walks the flags in order and skips every field
     * it does not return. Null when the value is cut short.
     */
    fun parseIndoorBikeData(bytes: ByteArray): IndoorBikeData? {
        if (bytes.size < 2) return null
        val flags = bytes.u16(0)
        var at = 2
        var speed: Double? = null
        var cadence: Double? = null
        var power: Int? = null

        fun take(size: Int): Int? {
            if (at + size > bytes.size) return null
            val start = at
            at += size
            return start
        }

        // Instantaneous speed is present when bit 0 is clear.
        if (!flags.bit(0)) speed = (take(2) ?: return null).let { bytes.u16(it) * 0.01 }
        if (flags.bit(1)) take(2) ?: return null // average speed
        if (flags.bit(2)) cadence = (take(2) ?: return null).let { bytes.u16(it) * 0.5 }
        if (flags.bit(3)) take(2) ?: return null // average cadence
        if (flags.bit(4)) take(3) ?: return null // total distance
        if (flags.bit(5)) take(2) ?: return null // resistance level
        if (flags.bit(6)) power = (take(2) ?: return null).let { bytes.s16(it) }
        if (flags.bit(7)) take(2) ?: return null // average power
        if (flags.bit(8)) take(5) ?: return null // expended energy
        if (flags.bit(9)) take(1) ?: return null // heart rate
        if (flags.bit(10)) take(1) ?: return null // metabolic equivalent
        if (flags.bit(11)) take(2) ?: return null // elapsed time
        if (flags.bit(12)) take(2) ?: return null // remaining time
        return IndoorBikeData(speedKmh = speed, cadenceRpm = cadence, powerW = power)
    }

    /** A Control Point indication: `80 <request op> <result> [data]`. */
    fun parseControlResponse(bytes: ByteArray): ControlResponse? {
        if (bytes.size < 3 || bytes.u8(0) != RESPONSE_CODE) return null
        return ControlResponse(op = bytes.u8(1), result = bytes.u8(2), data = bytes.copyOfRange(3, bytes.size))
    }

    /** The spin-down target speeds in a successful Spin Down Control response, in km/h: low, high. */
    fun spinDownTargets(response: ControlResponse): Pair<Double, Double>? {
        if (response.op != OP_SPIN_DOWN || response.result != RESULT_SUCCESS || response.data.size < 4) return null
        return response.data.u16(0) * 0.01 to response.data.u16(2) * 0.01
    }

    /** A Fitness Machine Status value that is a spin-down status: `14 <status>`. */
    fun parseSpinDownStatus(bytes: ByteArray): Int? {
        if (bytes.size < 2 || bytes.u8(0) != STATUS_SPIN_DOWN) return null
        return bytes.u8(1)
    }
}

@Serializable
data class FtmsFeatures(
    val cadence: Boolean,
    val power: Boolean,
    val erg: Boolean,
    val spinDown: Boolean,
)

/** Each field is null when the trainer did not send it. */
data class IndoorBikeData(val speedKmh: Double?, val cadenceRpm: Double?, val powerW: Int?)

class ControlResponse(val op: Int, val result: Int, val data: ByteArray)

fun ByteArray.u8(at: Int): Int = this[at].toInt() and 0xFF

fun ByteArray.u16(at: Int): Int = u8(at) or (u8(at + 1) shl 8)

fun ByteArray.s16(at: Int): Int = u16(at).toShort().toInt()

fun ByteArray.u32(at: Int): Long =
    u8(at).toLong() or (u8(at + 1).toLong() shl 8) or (u8(at + 2).toLong() shl 16) or (u8(at + 3).toLong() shl 24)

private fun Int.bit(n: Int): Boolean = (this shr n) and 1 == 1

private fun Long.bit(n: Int): Boolean = (this shr n) and 1L == 1L
