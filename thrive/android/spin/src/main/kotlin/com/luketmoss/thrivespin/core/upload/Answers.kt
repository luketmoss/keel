package com.luketmoss.thrivespin.core.upload

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
import kotlinx.serialization.json.contentOrNull

/** What one write to Thrive came to, by the one rule #769's answer table sets for every queue. */
sealed interface Answer {
    /** `success: true`, whatever `status` says. [data] is the envelope's `data`, if any. */
    data class Success(val data: JsonElement?) : Answer

    /** `bad_request`: Thrive refused it. Never sent again by itself. */
    data class Refused(val text: String) : Answer

    /** The key was refused: stop the run and spend no attempt. */
    data object KeyRefused : Answer

    /** No network, a timeout, a non-2xx, or a body that is not the envelope. Never counts toward `stuck`. */
    data object Offline : Answer

    /** Any other `success: false` (`Lock timeout`): counts toward `stuck`. */
    data object ServerError : Answer
}

/**
 * The classifier #769's ride queue and #770's FTP queue share (#770 extracted it, not copied it). It reads
 * the envelope only, and nothing it returns holds the request, the URL or the key.
 */
object Answers {
    const val BAD_REQUEST = "bad_request"

    /** One form-encoded POST, classified. A transport failure is [Answer.Offline]. */
    suspend fun post(transport: Transport, url: String, form: Map<String, String>, refusal: String): Answer {
        val body = try {
            transport.post(url, form)
        } catch (e: IOException) {
            return Answer.Offline
        }
        return classify(body, refusal)
    }

    fun classify(body: String, refusal: String): Answer {
        val envelope: JsonObject = try {
            SpinJson.parseToJsonElement(body) as? JsonObject
        } catch (e: SerializationException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        } ?: return Answer.Offline
        val success = (envelope["success"] as? JsonPrimitive)?.booleanOrNull ?: return Answer.Offline
        if (success) {
            val data = envelope["data"]
            return Answer.Success(if (data == null || data is JsonNull) null else data)
        }
        val error = (envelope["error"] as? JsonPrimitive)?.contentOrNull
        val code = (envelope["code"] as? JsonPrimitive)?.contentOrNull
        return when {
            error == ConnectionTest.KEY_REJECTED_MESSAGE || code?.endsWith("_forbidden") == true -> Answer.KeyRefused
            code == BAD_REQUEST -> Answer.Refused(error?.takeIf { it.isNotBlank() } ?: refusal)
            else -> Answer.ServerError
        }
    }
}
