package com.luketmoss.thrivespin.core.fit

import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.summary.RideSpan
import com.luketmoss.thrivespin.core.summary.RideSummary
import com.luketmoss.thrivespin.core.workout.Maths
import java.io.ByteArrayOutputStream
import java.time.Instant

/** FIT base types: the byte that names the type in a field definition, its width and its invalid value. */
enum class FitType(val code: Int, val size: Int) {
    Enum(0x00, 1),
    Uint8(0x02, 1),
    Uint16(0x84, 2),
    Uint32(0x86, 4),
    Uint32z(0x8C, 4),
    Str(0x07, 1),
}

/** One field of a message definition: its number, its type and its width in bytes ([FitType.Str] is a fixed buffer). */
class FitField(val num: Int, val type: FitType, val width: Int = type.size)

/** The FIT protocol's CRC-16, nibble at a time, as in the SDK's documentation. */
object FitCrc {
    private val table = intArrayOf(
        0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
        0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
    )

    fun update(crc: Int, byte: Int): Int {
        var c = crc
        var tmp = table[c and 0xF]
        c = (c shr 4) and 0x0FFF
        c = c xor tmp xor table[byte and 0xF]
        tmp = table[c and 0xF]
        c = (c shr 4) and 0x0FFF
        c = c xor tmp xor table[(byte shr 4) and 0xF]
        return c
    }

    fun of(bytes: ByteArray, from: Int = 0, to: Int = bytes.size): Int {
        var crc = 0
        for (i in from until to) crc = update(crc, bytes[i].toInt() and 0xFF)
        return crc
    }
}

/** A growing little-endian record stream: definitions and data, no header and no CRC. */
class FitRecords {
    private val out = ByteArrayOutputStream()

    val size: Int get() = out.size()

    fun toByteArray(): ByteArray = out.toByteArray()

    private fun u8(v: Int) = out.write(v and 0xFF)

    private fun u16(v: Int) {
        u8(v)
        u8(v shr 8)
    }

    private fun u32(v: Long) {
        u16((v and 0xFFFF).toInt())
        u16(((v shr 16) and 0xFFFF).toInt())
    }

    /** A definition record for [mesgNum] on local type [local]: little-endian, no developer fields. */
    fun define(local: Int, mesgNum: Int, fields: List<FitField>) {
        u8(0x40 or local)
        u8(0)
        u8(0)
        u16(mesgNum)
        u8(fields.size)
        for (f in fields) {
            u8(f.num)
            u8(f.width)
            u8(f.type.code)
        }
    }

    /**
     * A data record. [values] is one entry per field: a [Number] (null is the field's invalid value, never 0)
     * or, for a string field, a [String].
     */
    fun data(local: Int, fields: List<FitField>, values: List<Any?>) {
        u8(local)
        for ((i, f) in fields.withIndex()) {
            val v = values[i]
            when (f.type) {
                FitType.Enum, FitType.Uint8 -> u8(if (v == null) 0xFF else (v as Number).toInt())
                FitType.Uint16 -> u16(if (v == null) 0xFFFF else (v as Number).toInt())
                FitType.Uint32 -> u32(if (v == null) 0xFFFFFFFFL else (v as Number).toLong())
                FitType.Uint32z -> u32(if (v == null) 0L else (v as Number).toLong())
                FitType.Str -> {
                    val bytes = ((v as String?) ?: "").toByteArray(Charsets.UTF_8)
                    val keep = minOf(bytes.size, f.width - 1)
                    out.write(bytes, 0, keep)
                    repeat(f.width - keep) { u8(0) }
                }
            }
        }
    }
}

/**
 * The activity file (#769): a small hand-written encoder, not the Garmin SDK. It writes file_id, device_info,
 * timer events, a record per sample, a lap per step, a session and an activity. A null reading is written as the
 * field's FIT invalid value. The tests decode what it writes with the Garmin SDK.
 */
object FitEncoder {
    /** Seconds from the Unix epoch to the FIT epoch, 1989-12-31 00:00:00 UTC. */
    const val FIT_EPOCH_OFFSET_S = 631_065_600L

    private const val PROTOCOL_VERSION = 0x20
    private const val PROFILE_VERSION = 2140

    // Global message numbers.
    private const val FILE_ID = 0
    private const val SESSION = 18
    private const val LAP = 19
    private const val RECORD = 20
    private const val EVENT = 21
    private const val DEVICE_INFO = 23
    private const val ACTIVITY = 34

    // Enumerations.
    private const val TYPE_ACTIVITY = 4
    private const val MANUFACTURER_DEVELOPMENT = 255
    private const val EVENT_TIMER = 0
    private const val EVENT_LAP = 9
    private const val EVENT_SESSION = 8
    private const val EVENT_ACTIVITY = 26
    private const val EVENT_TYPE_START = 0
    private const val EVENT_TYPE_STOP = 1
    private const val EVENT_TYPE_STOP_ALL = 4
    private const val SPORT_CYCLING = 2
    private const val SUB_SPORT_INDOOR_CYCLING = 6
    private const val SOURCE_BLE = 3
    private const val SOURCE_LOCAL = 5
    private const val ACTIVITY_MANUAL = 0
    private const val LAP_TRIGGER_MANUAL = 0
    private const val LAP_TRIGGER_TIME = 1
    private const val LAP_TRIGGER_SESSION_END = 7

    private const val PRODUCT_NAME = "Thrive Spin"
    private const val NAME_WIDTH = 24

    private val timestamp = FitField(253, FitType.Uint32)

    private val fileIdFields = listOf(
        FitField(0, FitType.Enum),
        FitField(1, FitType.Uint16),
        FitField(4, FitType.Uint32),
        FitField(8, FitType.Str, NAME_WIDTH),
    )
    private val deviceInfoFields = listOf(
        timestamp,
        FitField(0, FitType.Uint8),
        FitField(5, FitType.Uint16),
        FitField(25, FitType.Enum),
        FitField(27, FitType.Str, NAME_WIDTH),
    )
    private val eventFields = listOf(timestamp, FitField(0, FitType.Enum), FitField(1, FitType.Enum))
    private val recordFields = listOf(
        timestamp,
        FitField(7, FitType.Uint16),
        FitField(4, FitType.Uint8),
        FitField(3, FitType.Uint8),
    )
    private val lapFields = listOf(
        FitField(254, FitType.Uint16),
        timestamp,
        FitField(0, FitType.Enum),
        FitField(1, FitType.Enum),
        FitField(2, FitType.Uint32),
        FitField(7, FitType.Uint32),
        FitField(8, FitType.Uint32),
        FitField(15, FitType.Uint8),
        FitField(16, FitType.Uint8),
        FitField(17, FitType.Uint8),
        FitField(19, FitType.Uint16),
        FitField(20, FitType.Uint16),
        FitField(24, FitType.Enum),
        FitField(25, FitType.Enum),
        FitField(39, FitType.Enum),
    )
    private val sessionFields = listOf(
        FitField(254, FitType.Uint16),
        timestamp,
        FitField(0, FitType.Enum),
        FitField(1, FitType.Enum),
        FitField(2, FitType.Uint32),
        FitField(5, FitType.Enum),
        FitField(6, FitType.Enum),
        FitField(7, FitType.Uint32),
        FitField(8, FitType.Uint32),
        FitField(16, FitType.Uint8),
        FitField(17, FitType.Uint8),
        FitField(18, FitType.Uint8),
        FitField(20, FitType.Uint16),
        FitField(21, FitType.Uint16),
        FitField(26, FitType.Uint16),
        FitField(34, FitType.Uint16),
        FitField(35, FitType.Uint16),
        FitField(36, FitType.Uint16),
        FitField(45, FitType.Uint16),
        FitField(48, FitType.Uint32),
    )
    private val activityFields = listOf(
        timestamp,
        FitField(0, FitType.Uint32),
        FitField(1, FitType.Uint16),
        FitField(2, FitType.Enum),
        FitField(3, FitType.Enum),
        FitField(4, FitType.Enum),
        FitField(5, FitType.Uint32),
    )

    // Local message types.
    private const val L_FILE_ID = 0
    private const val L_DEVICE = 1
    private const val L_EVENT = 2
    private const val L_RECORD = 3
    private const val L_LAP = 4
    private const val L_SESSION = 5
    private const val L_ACTIVITY = 6

    /** FIT time for a Unix second. */
    fun fitTime(unixS: Long): Long = unixS - FIT_EPOCH_OFFSET_S

    /** The 8-bit and 16-bit fields cannot hold their invalid value as a reading. */
    private fun byteReading(v: Int?): Int? = v?.coerceIn(0, 254)

    private fun wattReading(v: Int?): Int? = v?.coerceIn(0, 65534)

    /**
     * Encodes [recording] with the figures in [summary]. [zoneOffsetS] is the phone's offset from UTC at the
     * start (for the activity's local timestamp); [appVersion] is the app's version name.
     */
    fun encode(recording: RideRecording, summary: RideSummary, zoneOffsetS: Int, appVersion: String): ByteArray {
        val samples = recording.samples
        require(samples.isNotEmpty()) { "A FIT file needs at least one sample" }
        val startUnix = Instant.parse(summary.startedAtUtc).epochSecond
        val first = fitTime(startUnix)
        val pauseAt = summary.pauses.groupBy { it.atS }
        // Stamp of ride second t: start + t + the pauses that ended at or before it.
        val shift = IntArray(samples.size + 1)
        var cumulative = 0
        for (t in 0..samples.size) {
            cumulative += pauseAt[t]?.sumOf { it.durationS } ?: 0
            shift[t] = cumulative
        }
        fun stamp(t: Int): Long = first + t + shift[t]

        val rec = FitRecords()
        rec.define(L_FILE_ID, FILE_ID, fileIdFields)
        rec.data(L_FILE_ID, fileIdFields, listOf(TYPE_ACTIVITY, MANUFACTURER_DEVELOPMENT, first, PRODUCT_NAME))

        rec.define(L_DEVICE, DEVICE_INFO, deviceInfoFields)
        val version = softwareVersion(appVersion)
        rec.data(L_DEVICE, deviceInfoFields, listOf(first, 0, version, SOURCE_LOCAL, PRODUCT_NAME))
        recording.meta.trainer?.let {
            rec.data(L_DEVICE, deviceInfoFields, listOf(first, 1, null, SOURCE_BLE, it.name))
        }
        heartRateMonitorName(recording.events)?.let {
            rec.data(L_DEVICE, deviceInfoFields, listOf(first, 2, null, SOURCE_BLE, it))
        }

        rec.define(L_EVENT, EVENT, eventFields)
        rec.data(L_EVENT, eventFields, listOf(first, EVENT_TIMER, EVENT_TYPE_START))

        rec.define(L_RECORD, RECORD, recordFields)
        rec.define(L_LAP, LAP, lapFields)

        val spans = summary.spans
        var spanIdx = 0
        for (t in samples.indices) {
            val gap = pauseAt[t]?.sumOf { it.durationS } ?: 0
            if (t > 0 && gap > 0) {
                val stopAt = stamp(t - 1) + 1
                rec.data(L_EVENT, eventFields, listOf(stopAt, EVENT_TIMER, EVENT_TYPE_STOP_ALL))
                rec.data(L_EVENT, eventFields, listOf(stopAt + gap, EVENT_TIMER, EVENT_TYPE_START))
            }
            val s = samples[t]
            rec.data(L_RECORD, recordFields, listOf(stamp(t), wattReading(s.powerW), byteReading(s.cadenceRpm), byteReading(s.hrBpm)))
            while (spanIdx < spans.size && spans[spanIdx].endS == t + 1) {
                lap(rec, recording, summary, spans, spanIdx, ::stamp)
                spanIdx++
            }
        }
        val lastStamp = stamp(samples.size - 1)
        val end = lastStamp + 1
        rec.data(L_EVENT, eventFields, listOf(end, EVENT_TIMER, EVENT_TYPE_STOP_ALL))

        rec.define(L_SESSION, SESSION, sessionFields)
        rec.data(
            L_SESSION,
            sessionFields,
            listOf(
                0,
                end,
                EVENT_SESSION,
                EVENT_TYPE_STOP,
                first,
                SPORT_CYCLING,
                SUB_SPORT_INDOOR_CYCLING,
                summary.elapsedS * 1000L,
                summary.movingS * 1000L,
                summary.avgHr,
                summary.maxHr,
                summary.avgCadence,
                summary.avgPowerW,
                summary.maxPowerW,
                spans.size,
                summary.npW,
                summary.tss?.let { it * 10 },
                summary.intensityFactor?.let { Maths.roundHalfUp(it * 1000) },
                summary.ftpW,
                if (summary.hasPower) summary.workJ else null,
            ),
        )

        rec.define(L_ACTIVITY, ACTIVITY, activityFields)
        rec.data(
            L_ACTIVITY,
            activityFields,
            listOf(end, summary.movingS * 1000L, 1, ACTIVITY_MANUAL, EVENT_ACTIVITY, EVENT_TYPE_STOP, end + zoneOffsetS),
        )

        return wrap(rec.toByteArray())
    }

    private fun lap(
        rec: FitRecords,
        recording: RideRecording,
        summary: RideSummary,
        spans: List<RideSpan>,
        index: Int,
        stamp: (Int) -> Long,
    ) {
        val span = spans[index]
        val slice = recording.samples.subList(span.startS, span.endS)
        val powers = slice.mapNotNull { it.powerW }
        val hrs = slice.mapNotNull { it.hrBpm }
        val cadences = slice.mapNotNull { it.cadenceRpm }.filter { it > 0 }
        val start = stamp(span.startS)
        val endStamp = stamp(span.endS - 1) + 1
        val elapsed = (endStamp - start).toInt()
        val trigger = when {
            index == spans.lastIndex -> LAP_TRIGGER_SESSION_END
            spans[index + 1].startReason == "skip" -> LAP_TRIGGER_MANUAL
            else -> LAP_TRIGGER_TIME
        }
        rec.data(
            L_LAP,
            lapFields,
            listOf(
                index,
                endStamp,
                EVENT_LAP,
                EVENT_TYPE_STOP,
                start,
                elapsed * 1000L,
                span.seconds * 1000L,
                mean(hrs),
                hrs.maxOrNull(),
                mean(cadences),
                mean(powers),
                powers.maxOrNull(),
                trigger,
                SPORT_CYCLING,
                SUB_SPORT_INDOOR_CYCLING,
            ),
        )
    }

    private fun mean(values: List<Int>): Int? =
        if (values.isEmpty()) null else Maths.roundHalfUp(values.sumOf { it.toLong() }.toDouble() / values.size)

    /** The version name's "major.minor" at scale 100: "0.1.0" is 10 (0.10), "1.12.3" is 112. */
    internal fun softwareVersion(name: String): Int {
        val parts = name.split('.')
        val majorMinor = "${parts.getOrNull(0) ?: "0"}.${parts.getOrNull(1) ?: "0"}".toDoubleOrNull() ?: 0.0
        return Maths.roundHalfUp(majorMinor * 100).coerceIn(0, 65534)
    }

    private fun heartRateMonitorName(events: List<RideEvent>): String? =
        events.filter { it.type == "hr_source" }.lastOrNull { it.text("address") != null }?.text("name")

    /** The 14-byte header with its CRC, the records, and the file CRC. */
    private fun wrap(records: ByteArray): ByteArray {
        val header = ByteArray(14)
        header[0] = 14
        header[1] = PROTOCOL_VERSION.toByte()
        header[2] = (PROFILE_VERSION and 0xFF).toByte()
        header[3] = ((PROFILE_VERSION shr 8) and 0xFF).toByte()
        val size = records.size
        for (i in 0 until 4) header[4 + i] = ((size shr (8 * i)) and 0xFF).toByte()
        header[8] = '.'.code.toByte()
        header[9] = 'F'.code.toByte()
        header[10] = 'I'.code.toByte()
        header[11] = 'T'.code.toByte()
        val headerCrc = FitCrc.of(header, 0, 12)
        header[12] = (headerCrc and 0xFF).toByte()
        header[13] = ((headerCrc shr 8) and 0xFF).toByte()
        val body = header + records
        val crc = FitCrc.of(body)
        return body + byteArrayOf((crc and 0xFF).toByte(), ((crc shr 8) and 0xFF).toByte())
    }
}
