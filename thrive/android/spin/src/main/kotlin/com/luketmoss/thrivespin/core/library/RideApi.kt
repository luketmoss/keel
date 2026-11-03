package com.luketmoss.thrivespin.core.library

import com.luketmoss.thrivespin.core.ConnectionTest
import com.luketmoss.thrivespin.core.SpinJson
import com.luketmoss.thrivespin.core.Transport
import java.io.IOException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Why a call to Thrive did not give an answer, in the words the screens use. */
enum class Reason(val text: String) {
    /** No network, a timeout, a non-2xx, or a body that is not the envelope. */
    Network("Can't reach Thrive."),

    /** "Invalid or missing API key", or a refusal whose code ends `_forbidden`. */
    KeyRejected("Key rejected. Check the key in Settings."),

    /** Any other `success: false`. */
    ApiError("Thrive answered with an error."),

    /** `bad_request`: the API refused what was sent. */
    BadRequest("Thrive answered with an error."),
}

sealed interface ApiResult {
    /** [data] is the envelope's `data`, which may be absent. */
    data class Ok(val data: JsonElement?) : ApiResult
    data class Fail(val reason: Reason) : ApiResult
}

/**
 * Spin's calls to the Thrive API (#765's actions). Every one is one form-encoded POST with the key in
 * the body, never the URL. The key is in no message and no exception.
 */
class RideApi(private val url: String, private val key: String, private val transport: Transport) {

    suspend fun getRideWorkouts(): ApiResult = call("getRideWorkouts")

    suspend fun getFtp(): ApiResult = call("getFtp")

    suspend fun getPlannedWorkouts(date: String): ApiResult = call("getPlannedWorkouts", mapOf("date" to date))

    /** [id] is the caller's: the workout's own, or one made once for a new workout. */
    suspend fun saveRideWorkout(id: String, name: String, category: String, description: String, stepsJson: String): ApiResult {
        val payload = buildJsonObject {
            put("id", id)
            put("name", name)
            put("category", category)
            put("description", description)
            put("steps", SpinJson.parseToJsonElement(stepsJson))
        }
        return call("saveRideWorkout", mapOf("payload" to payload.toString()))
    }

    suspend fun deleteRideWorkout(id: String): ApiResult {
        val payload = buildJsonObject { put("id", id) }
        return call("deleteRideWorkout", mapOf("payload" to payload.toString()))
    }

    private suspend fun call(action: String, extra: Map<String, String> = emptyMap()): ApiResult {
        val form = LinkedHashMap<String, String>()
        form["action"] = action
        form["key"] = key.trim()
        form.putAll(extra)
        val body = try {
            transport.post(url.trim(), form)
        } catch (e: IOException) {
            return ApiResult.Fail(Reason.Network)
        }
        val envelope: JsonObject = try {
            SpinJson.parseToJsonElement(body).jsonObject
        } catch (e: SerializationException) {
            return ApiResult.Fail(Reason.Network)
        } catch (e: IllegalArgumentException) {
            return ApiResult.Fail(Reason.Network)
        }
        val success = (envelope["success"] as? JsonPrimitive)?.booleanOrNull
            ?: return ApiResult.Fail(Reason.Network)
        if (success) {
            val data = envelope["data"]
            return ApiResult.Ok(if (data == null || data is JsonNull) null else data)
        }
        val error = (envelope["error"] as? JsonPrimitive)?.contentOrNull
        val code = (envelope["code"] as? JsonPrimitive)?.contentOrNull
        return ApiResult.Fail(
            when {
                error == ConnectionTest.KEY_REJECTED_MESSAGE || code?.endsWith("_forbidden") == true -> Reason.KeyRejected
                code == "bad_request" -> Reason.BadRequest
                else -> Reason.ApiError
            },
        )
    }

    companion object {
        /** A key and a URL are both there: Library is set up. */
        fun isConfigured(url: String, key: String): Boolean =
            ConnectionTest.isValidUrl(url) && key.isNotBlank()
    }
}
