package com.luketmoss.thrivespin.core.upload

import com.luketmoss.thrivespin.core.summary.RideSummary
import java.util.Base64
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Thrive's three effort levels. None is not a level: a ride saved without one sends `''`. */
enum class Effort(val wire: String) {
    Easy("Easy"),
    Medium("Medium"),
    Hard("Hard"),
    ;

    companion object {
        fun fromWire(text: String): Effort? = entries.firstOrNull { it.wire == text }
    }
}

/** #765's `saveRide` request: the `payload` object and the four form fields. */
object SavePayload {
    const val ACTION = "saveRide"
    const val NOTES_MAX = 1000
    const val NAME_MAX = 80

    /** The payload as JSON text, field for field as #765 defines it. Calories and distance are null: Spin measures neither. */
    fun build(summary: RideSummary, effort: Effort?, notes: String, fitSha256: String, streamsSha256: String): String {
        val cleanNotes = notes.take(NOTES_MAX)
        val fields = linkedMapOf(
            "ride_id" to JsonPrimitive(summary.rideId),
            "started_at_utc" to JsonPrimitive(summary.startedAtUtc),
            "name" to JsonPrimitive(summary.name.take(NAME_MAX)),
            "ride_workout_id" to JsonPrimitive(summary.workoutId),
            "elapsed_seconds" to JsonPrimitive(summary.elapsedS),
            "moving_seconds" to JsonPrimitive(summary.movingS),
            "avg_hr" to (summary.avgHr?.let { JsonPrimitive(it) } ?: JsonNull),
            "calories" to JsonNull,
            "distance_m" to JsonNull,
            "avg_power_w" to (summary.avgPowerW?.let { JsonPrimitive(it) } ?: JsonNull),
            "np_w" to (summary.npW?.let { JsonPrimitive(it) } ?: JsonNull),
            "intensity_factor" to (summary.intensityFactor?.let { JsonPrimitive(it) } ?: JsonNull),
            "tss" to (summary.tss?.let { JsonPrimitive(it) } ?: JsonNull),
            "work_kj" to (summary.workKj?.let { JsonPrimitive(it) } ?: JsonNull),
            "ftp_w" to (summary.ftpW?.let { JsonPrimitive(it) } ?: JsonNull),
            "intensity_pct" to JsonPrimitive(summary.intensityPct),
            "effort" to JsonPrimitive(effort?.wire ?: ""),
            "notes" to JsonPrimitive(cleanNotes),
            "fit_sha256" to JsonPrimitive(fitSha256),
            "streams_sha256" to JsonPrimitive(streamsSha256),
        )
        return JsonObject(fields).toString()
    }

    /** The form: the key is in the body, never the URL. The FIT file is standard base64 on one line. */
    fun form(payload: String, key: String, fit: ByteArray, streams: ByteArray): Map<String, String> = linkedMapOf(
        "action" to ACTION,
        "key" to key.trim(),
        "payload" to payload,
        "fit" to Base64.getEncoder().encodeToString(fit),
        "streams" to String(streams, Charsets.UTF_8),
    )
}
