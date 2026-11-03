package com.luketmoss.thrivespin.core.ftp

import com.luketmoss.thrivespin.core.ride.recording.RideJson
import com.luketmoss.thrivespin.core.upload.UploadFiles
import java.io.File
import java.io.IOException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

/** Where a confirmed FTP is on its way to Thrive (`files/ftp/<id>.json`'s `state`). A `sent` record is deleted, so it has no state. */
@Serializable
enum class FtpStage {
    /** Waiting to send, or sending. */
    @SerialName("queued")
    Queued,

    @SerialName("needs_key")
    NeedsKey,

    @SerialName("needs_setup")
    NeedsSetup,

    /** Thrive keeps answering with an error: it stopped trying. */
    @SerialName("stuck")
    Stuck,

    /** Thrive refused it (`bad_request`): never retried by itself. */
    @SerialName("rejected")
    Rejected,
}

/**
 * One confirmed test's FTP, the commit of the decision (#770). Its existence means the person said yes; it is
 * written before `ramp.json` is touched and lives outside the ride's folder, which #769 deletes once Thrive
 * has the ride.
 */
@Serializable
data class FtpRecord(
    val v: Int = 1,
    /** `ftp_` + the ride id: a test has at most one FTP row, and a repeat of the call is one row. */
    val id: String,
    val state: FtpStage = FtpStage.Queued,
    /** The America/Denver date of the test's start, fixed across retries. */
    val date: String,
    @SerialName("ftp_w") val ftpW: Int,
    val source: String = SOURCE_RAMP_TEST,
    @SerialName("ride_id") val rideId: String,
    @SerialName("computed_w") val computedW: Int,
    @SerialName("previous_w") val previousW: Int? = null,
    @SerialName("previous_date") val previousDate: String? = null,
    @SerialName("created_at_utc") val createdAtUtc: String,
    val attempts: Int = 0,
    @SerialName("server_errors") val serverErrors: Int = 0,
    @SerialName("last_try_utc") val lastTryUtc: String? = null,
    val message: String? = null,
) {
    companion object {
        const val SOURCE_RAMP_TEST = "ramp_test"

        fun idFor(rideId: String): String = "ftp_$rideId"
    }
}

/** The records on this phone: `files/ftp/<id>.json`, each rewritten whole through a temp file and a rename. */
class FtpStore(private val dir: File) {
    fun list(): List<FtpRecord> {
        val files = dir.listFiles { f -> f.isFile && f.name.endsWith(".json") } ?: return emptyList()
        return files.mapNotNull { read(it) }.sortedWith(compareBy({ it.createdAtUtc }, { it.id }))
    }

    fun read(id: String): FtpRecord? = read(File(dir, "$id.json"))

    private fun read(file: File): FtpRecord? = try {
        if (!file.exists()) null else RideJson.decodeFromString(FtpRecord.serializer(), file.readText())
    } catch (e: IOException) {
        null
    } catch (e: SerializationException) {
        null
    } catch (e: IllegalArgumentException) {
        null
    }

    /** Throws [IOException] when the phone cannot hold it. */
    fun write(record: FtpRecord) {
        UploadFiles.writeBytes(dir, "${record.id}.json", RideJson.encodeToString(FtpRecord.serializer(), record).toByteArray())
    }

    fun delete(id: String) {
        File(dir, "$id.json").delete()
    }
}
