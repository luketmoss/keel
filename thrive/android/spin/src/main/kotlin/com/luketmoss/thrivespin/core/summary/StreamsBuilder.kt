package com.luketmoss.thrivespin.core.summary

import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import java.security.MessageDigest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** A built file: the text, its UTF-8 bytes and the lowercase hex SHA-256 of those bytes. */
class BuiltText(val text: String) {
    val bytes: ByteArray = text.toByteArray(Charsets.UTF_8)
    val sha256: String = Hashes.sha256Hex(bytes)
}

object Hashes {
    fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

/** #765's `thrive-spin-streams` v1, built from a recording. */
object StreamsBuilder {
    const val FORMAT = "thrive-spin-streams"

    /** Null when the file cannot be built: no FTP (a required number in `saveRide`) or a ride whose clock never started. */
    fun build(recording: RideRecording, summary: RideSummary): BuiltText? {
        val ftp = summary.ftpW ?: return null
        if (summary.startedAtUtc.isEmpty() || recording.samples.isEmpty()) return null
        fun series(pick: (com.luketmoss.thrivespin.core.ride.recording.Sample) -> Int?) =
            JsonArray(recording.samples.map { s -> pick(s)?.let { JsonPrimitive(it) } ?: JsonNull })
        val steps = JsonArray(
            summary.spans.map {
                JsonObject(
                    linkedMapOf(
                        "start_s" to JsonPrimitive(it.startS),
                        "end_s" to JsonPrimitive(it.endS),
                        "label" to JsonPrimitive(it.label),
                        "mode" to JsonPrimitive(it.mode),
                    ),
                )
            },
        )
        val pauses = JsonArray(
            summary.pauses.map {
                JsonObject(linkedMapOf("at_s" to JsonPrimitive(it.atS), "duration_s" to JsonPrimitive(it.durationS)))
            },
        )
        val root = JsonObject(
            linkedMapOf(
                "format" to JsonPrimitive(FORMAT),
                "v" to JsonPrimitive(1),
                "ride_id" to JsonPrimitive(summary.rideId),
                "started_at_utc" to JsonPrimitive(summary.startedAtUtc),
                "interval_s" to JsonPrimitive(1),
                "ftp_w" to JsonPrimitive(ftp),
                "intensity_pct" to JsonPrimitive(summary.intensityPct),
                "power_w" to series { it.powerW },
                "target_w" to series { it.targetW },
                "hr_bpm" to series { it.hrBpm },
                "cadence_rpm" to series { it.cadenceRpm },
                "steps" to steps,
                "pauses" to pauses,
            ),
        )
        return BuiltText(root.toString())
    }
}
