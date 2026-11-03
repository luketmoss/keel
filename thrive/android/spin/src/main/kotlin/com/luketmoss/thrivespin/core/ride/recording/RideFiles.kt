package com.luketmoss.thrivespin.core.ride.recording

import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RideSession
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.long

/** The recording's own JSON: defaults and nulls are written, so `meta.json` always has every key. */
val RideJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = true
}

@Serializable
enum class RideFileState {
    @SerialName("in_progress")
    InProgress,

    @SerialName("finished")
    Finished,

    @SerialName("discarded")
    Discarded,
}

@Serializable
data class RideTrainer(val name: String, val address: String)

/** `meta.json`: rewritten whole, through a temp file and a rename, whenever its state changes. */
@Serializable
data class RideMeta(
    val format: String = FORMAT,
    val v: Int = 1,
    @SerialName("ride_id") val rideId: String,
    val kind: RideKind,
    val state: RideFileState,
    val session: RideSession,
    val trainer: RideTrainer?,
    @SerialName("created_at_utc") val createdAtUtc: String,
    @SerialName("started_at_utc") val startedAtUtc: String?,
    @SerialName("finished_at_utc") val finishedAtUtc: String?,
    @SerialName("end_reason") val endReason: String?,
    @SerialName("handed_off") val handedOff: Boolean = false,
) {
    companion object {
        const val FORMAT = "thrive-spin-ride"
    }
}

/** One row of `samples.csv`: one ride-second. Null power, cadence, heart rate or target is an empty cell. */
data class Sample(
    val t: Int,
    val epochMs: Long,
    val step: Int,
    val powerW: Int?,
    val targetW: Int?,
    val cadenceRpm: Int?,
    val hrBpm: Int?,
    val intensityPct: Int,
    val trainer: Boolean,
) {
    fun toCsv(): String = listOf(
        t.toString(),
        epochMs.toString(),
        step.toString(),
        powerW?.toString().orEmpty(),
        targetW?.toString().orEmpty(),
        cadenceRpm?.toString().orEmpty(),
        hrBpm?.toString().orEmpty(),
        intensityPct.toString(),
        if (trainer) "1" else "0",
    ).joinToString(",")

    companion object {
        const val HEADER = "t,epoch_ms,step,power_w,target_w,cadence_rpm,hr_bpm,intensity_pct,trainer"

        /** A row, or null for one that is cut short or not a row. */
        fun fromCsv(line: String): Sample? {
            val cells = line.split(',')
            if (cells.size != 9) return null
            return try {
                fun opt(i: Int) = cells[i].takeIf { it.isNotEmpty() }?.toInt()
                val trainer = when (cells[8]) {
                    "1" -> true
                    "0" -> false
                    else -> return null
                }
                Sample(
                    t = cells[0].toInt(),
                    epochMs = cells[1].toLong(),
                    step = cells[2].toInt(),
                    powerW = opt(3),
                    targetW = opt(4),
                    cadenceRpm = opt(5),
                    hrBpm = opt(6),
                    intensityPct = cells[7].toInt(),
                    trainer = trainer,
                )
            } catch (e: NumberFormatException) {
                null
            }
        }
    }
}

/** One line of `events.jsonl`: a [type], the ride-time second and the wall clock it happened at, and its own fields. */
data class RideEvent(
    val type: String,
    val atS: Int,
    val epochMs: Long,
    val fields: Map<String, JsonElement> = emptyMap(),
) {
    fun toJson(): String {
        val map = LinkedHashMap<String, JsonElement>()
        map["type"] = JsonPrimitive(type)
        map["at_s"] = JsonPrimitive(atS)
        map["epoch_ms"] = JsonPrimitive(epochMs)
        map.putAll(fields)
        return JsonObject(map).toString()
    }

    fun int(key: String): Int? = (fields[key] as? JsonPrimitive)?.intOrNull

    fun text(key: String): String? = (fields[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    companion object {
        fun fromJson(line: String): RideEvent? {
            val obj = try {
                RideJson.parseToJsonElement(line) as? JsonObject
            } catch (e: SerializationException) {
                null
            } catch (e: IllegalArgumentException) {
                null
            } ?: return null
            return try {
                RideEvent(
                    type = (obj["type"] as JsonPrimitive).content,
                    atS = (obj["at_s"] as JsonPrimitive).int,
                    epochMs = (obj["epoch_ms"] as JsonPrimitive).long,
                    fields = obj.filterKeys { it != "type" && it != "at_s" && it != "epoch_ms" },
                )
            } catch (e: ClassCastException) {
                null
            } catch (e: NumberFormatException) {
                null
            } catch (e: NullPointerException) {
                null
            }
        }

        fun fields(vararg pairs: Pair<String, Any?>): Map<String, JsonElement> =
            pairs.associate { (k, v) ->
                k to when (v) {
                    null -> JsonNull
                    is Int -> JsonPrimitive(v)
                    is Long -> JsonPrimitive(v)
                    is Double -> JsonPrimitive(v)
                    is Boolean -> JsonPrimitive(v)
                    else -> JsonPrimitive(v.toString())
                }
            }
    }
}

/** A ride read back: the meta, and every sample and event that was written (a cut last line is skipped). */
class RideRecording(val meta: RideMeta, val samples: List<Sample>, val events: List<RideEvent>)

data class RideInfo(
    val id: String,
    val kind: RideKind,
    val state: RideFileState,
    val handedOff: Boolean,
    val startedAtUtc: String?,
    val finishedAtUtc: String?,
)

/** What #769 reads and tidies. #768 never deletes a finished recording. */
interface RideStore {
    fun list(): List<RideInfo>

    fun open(rideId: String): RideRecording

    fun markHandedOff(rideId: String)

    fun delete(rideId: String)
}

/** Where the engine writes a ride as it goes. Every call may throw [IOException] (a full phone). */
interface RideSink {
    /** The clock started: make the folder and write `meta.json`, the header and empty logs. */
    fun begin(meta: RideMeta)

    fun sample(sample: Sample)

    fun event(event: RideEvent)

    /** Syncs the logs to storage: every 10 s, and at each pause, end and recovery. */
    fun sync()

    /** Marks the ride finished. */
    fun finish(reason: String, finishedAtMs: Long)

    /** Removes the folder: nothing from the ride is kept. */
    fun discard()
}

/** The recording that is not there: a sink that keeps nothing (the ride's folder is made at [begin] by the real one). */
object NoSink : RideSink {
    override fun begin(meta: RideMeta) = Unit

    override fun sample(sample: Sample) = Unit

    override fun event(event: RideEvent) = Unit

    override fun sync() = Unit

    override fun finish(reason: String, finishedAtMs: Long) = Unit

    override fun discard() = Unit
}

fun isoSeconds(epochMs: Long): String = Instant.ofEpochSecond(epochMs / 1000).toString()

/**
 * One ride's folder, `files/rides/<ride_id>/`: `meta.json`, `samples.csv` and `events.jsonl`, each line
 * appended with one write straight to the file, so a process killed between lines loses nothing that was
 * written. [sync] makes it durable.
 */
class FileRideRecorder private constructor(private val dir: File, private var meta: RideMeta?) : RideSink {
    private var samples: FileOutputStream? = null
    private var events: FileOutputStream? = null

    override fun begin(meta: RideMeta) {
        dir.mkdirs()
        this.meta = meta
        writeMeta(dir, meta)
        samples = FileOutputStream(File(dir, SAMPLES), true).also { it.write((Sample.HEADER + "\n").toByteArray()) }
        events = FileOutputStream(File(dir, EVENTS), true)
    }

    private fun open() {
        if (samples == null) samples = FileOutputStream(File(dir, SAMPLES), true)
        if (events == null) events = FileOutputStream(File(dir, EVENTS), true)
    }

    override fun sample(sample: Sample) {
        open()
        samples!!.write((sample.toCsv() + "\n").toByteArray())
    }

    override fun event(event: RideEvent) {
        open()
        events!!.write((event.toJson() + "\n").toByteArray())
    }

    override fun sync() {
        samples?.fd?.sync()
        events?.fd?.sync()
    }

    override fun finish(reason: String, finishedAtMs: Long) {
        val current = meta ?: return
        sync()
        val next = current.copy(
            state = RideFileState.Finished,
            finishedAtUtc = isoSeconds(finishedAtMs),
            endReason = reason,
        )
        meta = next
        writeMeta(dir, next)
        close()
    }

    override fun discard() {
        close()
        dir.deleteRecursively()
    }

    /** Lets go of the log files. The process ending does the same, which is what a killed ride looks like to the next open. */
    fun close() {
        try {
            samples?.close()
            events?.close()
        } catch (e: IOException) {
            // Closing a file that could not be written: nothing more to lose.
        }
        samples = null
        events = null
    }

    companion object {
        const val META = "meta.json"
        const val SAMPLES = "samples.csv"
        const val EVENTS = "events.jsonl"

        /** A recorder for a ride that has not started; [begin] makes its folder. */
        fun create(dir: File): FileRideRecorder = FileRideRecorder(dir, null)

        /** A recorder that appends to a recovered ride's folder. */
        fun reopen(dir: File, meta: RideMeta): FileRideRecorder = FileRideRecorder(dir, meta)

        internal fun writeMeta(dir: File, meta: RideMeta) {
            dir.mkdirs()
            val tmp = File(dir, "$META.tmp")
            FileOutputStream(tmp).use { out ->
                out.write(RideJson.encodeToString(RideMeta.serializer(), meta).toByteArray())
                out.fd.sync()
            }
            val target = File(dir, META)
            try {
                Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (e: AtomicMoveNotSupportedException) {
                Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        }
    }
}

/** The rides on this phone: a folder each under [root]. */
class FileRideStore(private val root: File) : RideStore {
    fun dir(rideId: String): File = File(root, rideId)

    fun recorder(rideId: String): FileRideRecorder = FileRideRecorder.create(dir(rideId))

    fun reopen(rideId: String): FileRideRecorder = FileRideRecorder.reopen(dir(rideId), readMeta(rideId))

    fun readMeta(rideId: String): RideMeta =
        RideJson.decodeFromString(RideMeta.serializer(), File(dir(rideId), FileRideRecorder.META).readText())

    override fun list(): List<RideInfo> {
        val folders = root.listFiles { f -> f.isDirectory } ?: return emptyList()
        return folders.mapNotNull { f ->
            try {
                val m = readMeta(f.name)
                RideInfo(m.rideId, m.kind, m.state, m.handedOff, m.startedAtUtc, m.finishedAtUtc)
            } catch (e: IOException) {
                null
            } catch (e: SerializationException) {
                null
            } catch (e: IllegalArgumentException) {
                null
            }
        }.sortedBy { it.startedAtUtc ?: "" }
    }

    override fun open(rideId: String): RideRecording {
        val dir = dir(rideId)
        val meta = readMeta(rideId)
        val samples = File(dir, FileRideRecorder.SAMPLES).takeIf { it.exists() }?.readLines().orEmpty()
            .drop(1)
            .mapNotNull { Sample.fromCsv(it) }
        val events = File(dir, FileRideRecorder.EVENTS).takeIf { it.exists() }?.readLines().orEmpty()
            .mapNotNull { RideEvent.fromJson(it) }
        return RideRecording(meta, samples, events)
    }

    override fun markHandedOff(rideId: String) {
        FileRideRecorder.writeMeta(dir(rideId), readMeta(rideId).copy(handedOff = true))
    }

    override fun delete(rideId: String) {
        dir(rideId).deleteRecursively()
    }

    /** Finishes a recovered ride at its last sample with reason `interrupted`. */
    fun finishInterrupted(rideId: String, recording: RideRecording) {
        val last = recording.samples.last()
        val at = last.epochMs + 1000
        val recorder = reopen(rideId)
        recorder.event(RideEvent("end", last.t + 1, at, RideEvent.fields("reason" to "interrupted")))
        recorder.finish("interrupted", at)
    }
}
