package com.luketmoss.thrivespin.core.upload

import com.luketmoss.thrivespin.core.ride.recording.RideJson
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Where a ride is on its way to Thrive (`upload.json`'s `state`). */
@Serializable
enum class UploadStage {
    /** Prepared, not yet saved. */
    @SerialName("draft")
    Draft,

    /** Saved: waiting to send, or sending now. */
    @SerialName("queued")
    Queued,

    @SerialName("needs_key")
    NeedsKey,

    @SerialName("needs_setup")
    NeedsSetup,

    /** Thrive keeps answering with an error: it stopped trying. */
    @SerialName("stuck")
    Stuck,

    /** Thrive refused the ride (`bad_request`): never retried by itself. */
    @SerialName("rejected")
    Rejected,

    /** Thrive has it; the folder is about to be deleted. */
    @SerialName("sent")
    Sent,
}

/** Why a queued ride has not gone yet, for the card's words. */
@Serializable
enum class Failure {
    /** No network, a timeout, a non-2xx or a body that is not the envelope. */
    @SerialName("offline")
    Offline,

    /** `success: false` with a code that is not a refusal. */
    @SerialName("server")
    Server,
}

/** What Thrive answered to a `saveRide` that worked. [status] is read only for its wording. */
@Serializable
data class SaveAnswer(
    val status: String = "",
    val id: String = "",
    @SerialName("ambiguous_plans") val ambiguousPlans: Boolean = false,
    @SerialName("ambiguous_coros") val ambiguousCoros: Boolean = false,
)

/**
 * `upload.json`: a ride's upload state, rewritten whole through a temp file and a rename like `meta.json`.
 * [payload] is the JSON text of #765's payload, built once at Save, so every retry sends the same bytes.
 */
@Serializable
data class UploadState(
    val v: Int = 1,
    val state: UploadStage = UploadStage.Draft,
    val effort: String = "",
    val notes: String = "",
    @SerialName("ftp_w") val ftpW: Int? = null,
    val payload: String? = null,
    @SerialName("fit_sha256") val fitSha256: String? = null,
    @SerialName("streams_sha256") val streamsSha256: String? = null,
    @SerialName("saved_at_utc") val savedAtUtc: String? = null,
    val attempts: Int = 0,
    @SerialName("server_errors") val serverErrors: Int = 0,
    @SerialName("last_try_utc") val lastTryUtc: String? = null,
    @SerialName("last_failure") val lastFailure: Failure? = null,
    val message: String? = null,
    val answer: SaveAnswer? = null,
) {
    /** Effort and notes can change until the ride is saved, and again after Thrive refused it. */
    val editable: Boolean get() = state == UploadStage.Draft || state == UploadStage.Rejected
}

object UploadFiles {
    const val UPLOAD = "upload.json"
    const val FIT = "ride.fit"
    const val STREAMS = "streams.json"

    fun read(dir: File): UploadState? {
        val file = File(dir, UPLOAD)
        if (!file.exists()) return null
        return try {
            RideJson.decodeFromString(UploadState.serializer(), file.readText())
        } catch (e: IOException) {
            null
        } catch (e: SerializationException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    /** Whole, through a temp file and a rename. */
    fun write(dir: File, state: UploadState) {
        dir.mkdirs()
        val tmp = File(dir, "$UPLOAD.tmp")
        FileOutputStream(tmp).use { out ->
            out.write(RideJson.encodeToString(UploadState.serializer(), state).toByteArray())
            out.fd.sync()
        }
        val target = File(dir, UPLOAD)
        try {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (e: AtomicMoveNotSupportedException) {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    /** A file written to a temp name and renamed, so a ride never holds half a FIT file. */
    fun writeBytes(dir: File, name: String, bytes: ByteArray) {
        dir.mkdirs()
        val tmp = File(dir, "$name.tmp")
        FileOutputStream(tmp).use { out ->
            out.write(bytes)
            out.fd.sync()
        }
        val target = File(dir, name)
        try {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (e: AtomicMoveNotSupportedException) {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }
}

/** What `saveRide` answered, read from `data`: a status the app may not know, the activity's id and the two warnings. */
object AnswerReader {
    fun read(data: JsonElement?): SaveAnswer {
        val obj = data as? JsonObject ?: return SaveAnswer()
        fun text(key: String) = (obj[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
        fun listed(key: String): Boolean = when (val v = obj[key]) {
            is JsonArray -> v.isNotEmpty()
            is JsonPrimitive -> v.booleanOrNull == true
            else -> false
        }
        return SaveAnswer(
            status = text("status"),
            id = text("id"),
            ambiguousPlans = listed("ambiguous_plans"),
            ambiguousCoros = listed("ambiguous_coros"),
        )
    }
}
