package com.luketmoss.thrivespin.core

import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlin.math.roundToInt

/**
 * One form-encoded POST, answered with the response body. Throws [IOException]
 * for anything that is not a body to read: no network, a timeout, a non-2xx.
 */
interface Transport {
    suspend fun post(url: String, form: Map<String, String>): String
}

val SpinJson = Json { ignoreUnknownKeys = true }

/** The Settings screen's "Test connection": one `getFtp`, reported in words. */
sealed interface TestResult {
    val message: String

    data class Connected(val ftpW: Int?) : TestResult {
        override val message get() = if (ftpW == null) "Connected — no FTP set yet" else "Connected — FTP $ftpW W"
    }

    data object KeyRejected : TestResult {
        override val message get() = "Key rejected"
    }

    data object ApiError : TestResult {
        override val message get() = "Thrive answered with an error"
    }

    data object Unreachable : TestResult {
        override val message get() = "Can't reach the server"
    }

    data object BadUrl : TestResult {
        override val message get() = "That doesn't look like a URL"
    }

    data object EnterKey : TestResult {
        override val message get() = "Enter the key"
    }
}

object ConnectionTest {
    const val ACTION_GET_FTP = "getFtp"

    /**
     * What the API answers to a key it does not know (auth.js `resolveCaller`).
     * It sends no `code` for this one, so the fixed text is the only signal.
     */
    const val KEY_REJECTED_MESSAGE = "Invalid or missing API key"

    /** An http(s) URL with a host and no whitespace inside it. */
    fun isValidUrl(raw: String): Boolean {
        val text = raw.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return false
        val uri = try {
            URI(text)
        } catch (e: URISyntaxException) {
            return false
        }
        return (uri.scheme == "https" || uri.scheme == "http") && !uri.host.isNullOrEmpty()
    }

    /**
     * The key travels in the POST body, never the URL, and is never logged.
     * A blank key sends nothing.
     */
    suspend fun run(url: String, key: String, transport: Transport): TestResult {
        if (!isValidUrl(url)) return TestResult.BadUrl
        if (key.isBlank()) return TestResult.EnterKey
        val body = try {
            transport.post(url.trim(), linkedMapOf("action" to ACTION_GET_FTP, "key" to key.trim()))
        } catch (e: IOException) {
            return TestResult.Unreachable
        }
        val envelope: JsonObject = try {
            SpinJson.parseToJsonElement(body).jsonObject
        } catch (e: SerializationException) {
            return TestResult.Unreachable
        } catch (e: IllegalArgumentException) {
            return TestResult.Unreachable
        }
        val success = (envelope["success"] as? JsonPrimitive)?.booleanOrNull
            ?: return TestResult.Unreachable
        if (!success) {
            val error = (envelope["error"] as? JsonPrimitive)?.contentOrNull
            val code = (envelope["code"] as? JsonPrimitive)?.contentOrNull
            return if (error == KEY_REJECTED_MESSAGE || code?.endsWith("_forbidden") == true) {
                TestResult.KeyRejected
            } else {
                TestResult.ApiError
            }
        }
        val data = envelope["data"] as? JsonObject ?: return TestResult.ApiError
        return when (val current: JsonElement? = data["current"]) {
            null, JsonNull -> TestResult.Connected(null)
            is JsonObject -> {
                val ftp = (current["ftp_w"] as? JsonPrimitive)?.doubleOrNull
                if (ftp == null) TestResult.ApiError else TestResult.Connected(ftp.roundToInt())
            }
            else -> TestResult.ApiError
        }
    }
}
