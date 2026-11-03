package com.luketmoss.thrivespin.core

/** Heart Rate Measurement (0x2A37) and what the Devices screen says about it. */
object HeartRate {
    const val HEART_RATE_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb"
    const val MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb"

    /** A reading is stale this long after it arrived. */
    const val FRESH_MS = 5_000L

    /**
     * Flags bit 0 picks uint8 or uint16 bpm; bit 2 says the strap reports sensor
     * contact and bit 1 whether it has it. [HeartRateReading.contact] is null when
     * the strap does not report contact.
     */
    fun parse(bytes: ByteArray, atMs: Long): HeartRateReading? {
        if (bytes.isEmpty()) return null
        val flags = bytes.u8(0)
        val wide = flags and 0x01 != 0
        if (bytes.size < if (wide) 3 else 2) return null
        val bpm = if (wide) bytes.u16(1) else bytes.u8(1)
        val contact = if (flags and 0x04 != 0) flags and 0x02 != 0 else null
        return HeartRateReading(bpm = bpm, contact = contact, atMs = atMs)
    }

    /** "64 bpm" for a fresh reading with contact; otherwise "No reading". */
    fun liveText(reading: HeartRateReading?, nowMs: Long): String =
        if (hasReading(reading, nowMs)) "${reading!!.bpm} bpm" else "No reading"

    fun hasReading(reading: HeartRateReading?, nowMs: Long): Boolean =
        reading != null && reading.bpm > 0 && reading.contact != false && nowMs - reading.atMs < FRESH_MS
}

data class HeartRateReading(val bpm: Int, val contact: Boolean?, val atMs: Long)
