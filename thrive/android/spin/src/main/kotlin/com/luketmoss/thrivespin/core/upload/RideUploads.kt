package com.luketmoss.thrivespin.core.upload

import com.luketmoss.thrivespin.core.fit.FitEncoder
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.ride.recording.RideFileState
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.isoSeconds
import com.luketmoss.thrivespin.core.summary.Hashes
import com.luketmoss.thrivespin.core.summary.RideMetrics
import com.luketmoss.thrivespin.core.summary.RideSummary
import com.luketmoss.thrivespin.core.summary.StreamsBuilder
import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.SerializationException

/** Why a ride cannot be saved yet. */
enum class SaveBlock {
    /** No power reading at all: Thrive could not score it. */
    NoPower,

    /** No FTP from the caller or the recording (a first ramp test's, #770). */
    NoFtp,
}

sealed interface Preparation {
    /** The metrics are ready; [fitBytes] is the FIT file's size once it has been written. */
    data class Ready(val summary: RideSummary, val fitBytes: Int?, val block: SaveBlock?) : Preparation

    /** The recording could not be read or a file could not be written. */
    data object Failed : Preparation
}

sealed interface SaveResult {
    data object Queued : SaveResult

    /** Not a draft any more, or nothing to build. */
    data object NotSaved : SaveResult

    data class Blocked(val block: SaveBlock) : SaveResult
}

/** One ride that is not finished with, for the Library banner. */
data class PendingRide(val rideId: String, val stage: UploadStage, val orderKey: String)

/** What #770's ramp-test result calls to put a ride through the same summary and queue. */
interface RideUploads {
    /** The metrics, `ride.fit` and `streams.json`; callable again until the ride is saved. [ftpW] wins over the recording's own. */
    fun prepare(rideId: String, ftpW: Int? = null): Preparation

    /** Freezes the payload and queues the ride. */
    fun save(rideId: String, effort: Effort?, notes: String): SaveResult

    fun state(rideId: String): StateFlow<UploadState?>
}

/**
 * The uploads of the rides on this phone: each ride's `upload.json`, FIT file and streams file beside its
 * recording. One instance per process; every read-modify-write of an `upload.json` is under [lock].
 */
class FileRideUploads(
    private val store: FileRideStore,
    private val now: () -> Long,
    private val appVersion: String,
    /** The phone's offset from UTC, in seconds, at a Unix second. */
    private val zoneOffsetS: (Long) -> Int,
) : RideUploads {
    private val lock = Any()
    private val flows = HashMap<String, MutableStateFlow<UploadState?>>()
    private val sendingIds = MutableStateFlow<Set<String>>(emptySet())

    /** The rides that are being sent this second, for the progress bar. */
    val sending: StateFlow<Set<String>> get() = sendingIds

    private fun dir(rideId: String): File = store.dir(rideId)

    private fun flow(rideId: String): MutableStateFlow<UploadState?> = synchronized(flows) {
        flows.getOrPut(rideId) { MutableStateFlow(UploadFiles.read(dir(rideId))) }
    }

    override fun state(rideId: String): StateFlow<UploadState?> = flow(rideId)

    /** The state on disk, or the last one this process saw when the folder is gone (a sent ride). */
    fun current(rideId: String): UploadState? = flow(rideId).value

    private fun put(rideId: String, next: UploadState) {
        UploadFiles.write(dir(rideId), next)
        flow(rideId).value = next
    }

    private fun open(rideId: String): RideRecording? = try {
        val recording = store.open(rideId)
        if (recording.meta.state != RideFileState.Finished || recording.samples.isEmpty()) null else recording
    } catch (e: IOException) {
        null
    } catch (e: SerializationException) {
        null
    } catch (e: IllegalArgumentException) {
        null
    }

    private class Built(val fit: ByteArray, val streamsSha: String, val streams: ByteArray)

    private fun block(summary: RideSummary): SaveBlock? = when {
        !summary.hasPower -> SaveBlock.NoPower
        summary.ftpW == null -> SaveBlock.NoFtp
        else -> null
    }

    /** Builds and writes the two files. Throws [IOException] when the phone cannot hold them. */
    private fun build(rideId: String, recording: RideRecording, summary: RideSummary): Built? {
        val streams = StreamsBuilder.build(recording, summary) ?: return null
        val offset = zoneOffsetS(Instant.parse(summary.startedAtUtc).epochSecond)
        val fit = FitEncoder.encode(recording, summary, offset, appVersion)
        UploadFiles.writeBytes(dir(rideId), UploadFiles.FIT, fit)
        UploadFiles.writeBytes(dir(rideId), UploadFiles.STREAMS, streams.bytes)
        return Built(fit, streams.sha256, streams.bytes)
    }

    override fun prepare(rideId: String, ftpW: Int?): Preparation = synchronized(lock) {
        val recording = open(rideId) ?: return Preparation.Failed
        val existing = UploadFiles.read(dir(rideId))
        if (existing != null && existing.state != UploadStage.Draft) {
            // Past Save the files are the ride's, as sent: read the figures, rebuild nothing.
            val summary = RideMetrics.summarize(recording, existing.ftpW)
            val fit = File(dir(rideId), UploadFiles.FIT).takeIf { it.exists() }?.length()?.toInt()
            return Preparation.Ready(summary, fit, null)
        }
        val summary = RideMetrics.summarize(recording, ftpW ?: existing?.ftpW)
        val blocked = block(summary)
        val base = existing ?: UploadState()
        try {
            if (blocked == null) {
                val built = build(rideId, recording, summary) ?: return Preparation.Failed
                put(
                    rideId,
                    base.copy(
                        state = UploadStage.Draft,
                        ftpW = summary.ftpW,
                        fitSha256 = Hashes.sha256Hex(built.fit),
                        streamsSha256 = built.streamsSha,
                    ),
                )
                return Preparation.Ready(summary, built.fit.size, null)
            }
            File(dir(rideId), UploadFiles.FIT).delete()
            File(dir(rideId), UploadFiles.STREAMS).delete()
            put(rideId, base.copy(state = UploadStage.Draft, ftpW = summary.ftpW, fitSha256 = null, streamsSha256 = null))
            Preparation.Ready(summary, null, blocked)
        } catch (e: IOException) {
            Preparation.Failed
        }
    }

    /** Keeps what has been typed: effort and notes are saved as they change, until the ride is saved. */
    fun setDraft(rideId: String, effort: Effort?, notes: String) = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId)) ?: flow(rideId).value ?: return@synchronized
        if (!st.editable) return@synchronized
        try {
            put(rideId, st.copy(effort = effort?.wire ?: "", notes = notes.take(SavePayload.NOTES_MAX)))
        } catch (e: IOException) {
            // The next change writes it again.
        }
    }

    override fun save(rideId: String, effort: Effort?, notes: String): SaveResult = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId)) ?: return@synchronized SaveResult.NotSaved
        if (st.state != UploadStage.Draft) return@synchronized SaveResult.NotSaved
        queueFrom(rideId, st, effort, notes)
    }

    /** Rebuilds the files and the payload from the recording and queues the ride with [effort] and [notes]. */
    private fun queueFrom(rideId: String, st: UploadState, effort: Effort?, notes: String): SaveResult {
        val recording = open(rideId) ?: return SaveResult.NotSaved
        val summary = RideMetrics.summarize(recording, st.ftpW)
        block(summary)?.let { return SaveResult.Blocked(it) }
        return try {
            val built = build(rideId, recording, summary) ?: return SaveResult.NotSaved
            val fitSha = Hashes.sha256Hex(built.fit)
            val clean = notes.take(SavePayload.NOTES_MAX)
            put(
                rideId,
                st.copy(
                    state = UploadStage.Queued,
                    effort = effort?.wire ?: "",
                    notes = clean,
                    ftpW = summary.ftpW,
                    payload = SavePayload.build(summary, effort, clean, fitSha, built.streamsSha),
                    fitSha256 = fitSha,
                    streamsSha256 = built.streamsSha,
                    savedAtUtc = isoSeconds(now()),
                    attempts = 0,
                    serverErrors = 0,
                    lastTryUtc = null,
                    lastFailure = null,
                    message = null,
                    answer = null,
                ),
            )
            SaveResult.Queued
        } catch (e: IOException) {
            SaveResult.NotSaved
        }
    }

    /**
     * "Try again": a rejected ride is rebuilt from the recording with the effort and notes as they stand and
     * queued; a stuck one, or one waiting on Settings, goes back to the queue with its counters reset.
     */
    fun retry(rideId: String): SaveResult = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId)) ?: return@synchronized SaveResult.NotSaved
        when (st.state) {
            UploadStage.Rejected -> queueFrom(rideId, st, Effort.fromWire(st.effort), st.notes)
            UploadStage.Stuck, UploadStage.NeedsKey, UploadStage.NeedsSetup -> {
                put(rideId, st.copy(state = UploadStage.Queued, attempts = 0, serverErrors = 0, lastFailure = null, message = null))
                SaveResult.Queued
            }
            UploadStage.Queued -> SaveResult.Queued
            else -> SaveResult.NotSaved
        }
    }

    /** Saving Settings takes the rides that were waiting on them back to the queue. */
    fun settingsSaved(): Int = synchronized(lock) {
        var moved = 0
        for (id in ridesWithUploads()) {
            val st = UploadFiles.read(dir(id)) ?: continue
            if (st.state == UploadStage.NeedsKey || st.state == UploadStage.NeedsSetup) {
                put(id, st.copy(state = UploadStage.Queued, lastFailure = null, message = null))
                moved++
            }
        }
        moved
    }

    /** "Discard ride": only a draft, by the person's own word. */
    fun discard(rideId: String): Boolean = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId))
        if (st != null && st.state != UploadStage.Draft) return@synchronized false
        store.delete(rideId)
        flow(rideId).value = null
        true
    }

    /** "Delete from phone": only a ride Thrive refused, by the person's own word. */
    fun deleteFromPhone(rideId: String): Boolean = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId)) ?: return@synchronized false
        if (st.state != UploadStage.Rejected) return@synchronized false
        store.delete(rideId)
        flow(rideId).value = null
        true
    }

    private fun ridesWithUploads(): List<String> =
        store.list().filter { it.state == RideFileState.Finished }.map { it.id }

    /**
     * Every finished workout whose upload is not over, for the Library banner. A ride with no `upload.json`
     * yet (its summary has not opened) counts as a draft, so it is never left with nothing pointing at it.
     */
    fun pending(): List<PendingRide> = synchronized(lock) {
        store.list().filter { it.state == RideFileState.Finished }.mapNotNull { info ->
            val st = UploadFiles.read(dir(info.id))
            when {
                // A ramp test (#770) with no upload.json is a decision still pending: its result is
                // presented at each app open, so the banner does not count it. Once Continue has
                // prepared it, it is a ride like any other.
                info.kind == RideKind.RampTest && st == null -> null
                st == null -> PendingRide(info.id, UploadStage.Draft, info.startedAtUtc ?: "")
                st.state == UploadStage.Sent -> null
                else -> PendingRide(info.id, st.state, st.savedAtUtc ?: info.startedAtUtc ?: "")
            }
        }
    }

    // ---- For the queue ----

    /** The queued rides, oldest `saved_at_utc` first. */
    internal fun queued(): List<Pair<String, UploadState>> = synchronized(lock) {
        ridesWithUploads().mapNotNull { id ->
            UploadFiles.read(dir(id))?.takeIf { it.state == UploadStage.Queued }?.let { id to it }
        }.sortedWith(compareBy({ it.second.savedAtUtc ?: "" }, { it.first }))
    }

    /** Rides recorded as sent whose folder is still there: a process died between the answer and the delete. */
    internal fun finishSent(): Int = synchronized(lock) {
        var n = 0
        for (id in ridesWithUploads()) {
            if (UploadFiles.read(dir(id))?.state == UploadStage.Sent) {
                store.delete(id)
                n++
            }
        }
        n
    }

    internal fun sendingNow(rideId: String, on: Boolean) {
        sendingIds.value = if (on) sendingIds.value + rideId else sendingIds.value - rideId
    }

    internal fun readFiles(rideId: String): Pair<ByteArray, ByteArray>? = try {
        File(dir(rideId), UploadFiles.FIT).readBytes() to File(dir(rideId), UploadFiles.STREAMS).readBytes()
    } catch (e: IOException) {
        null
    }

    /** Applies [change] to a ride that is still queued. */
    internal fun update(rideId: String, change: (UploadState) -> UploadState) = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId)) ?: return@synchronized
        if (st.state != UploadStage.Queued) return@synchronized
        try {
            put(rideId, change(st))
        } catch (e: IOException) {
            // The answer is lost with the write; a queued ride is simply tried again.
        }
    }

    /** Records the answer, then deletes the ride: the only way a finished ride leaves the phone unasked. */
    internal fun markSent(rideId: String, answer: SaveAnswer) = synchronized(lock) {
        val st = UploadFiles.read(dir(rideId)) ?: return@synchronized
        val sent = st.copy(state = UploadStage.Sent, answer = answer, lastFailure = null, message = null, serverErrors = 0)
        try {
            put(rideId, sent)
        } catch (e: IOException) {
            // Without the record the ride is sent again and answered `exists`.
            return@synchronized
        }
        store.delete(rideId)
    }

    internal fun setStageForQueued(stage: UploadStage) = synchronized(lock) {
        for ((id, st) in queued()) {
            try {
                put(id, st.copy(state = stage))
            } catch (e: IOException) {
                // Stays queued.
            }
        }
    }
}
