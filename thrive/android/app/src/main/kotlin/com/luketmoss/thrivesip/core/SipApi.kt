package com.luketmoss.thrivesip.core

import java.io.IOException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * One form-encoded POST, answered with the response body. Throws [IOException]
 * for anything that is not a body to read: no network, a timeout, a non-2xx.
 */
interface Transport {
    suspend fun post(url: String, form: Map<String, String>): String
}

sealed interface SendOutcome {
    /** The server has the drink (a repeat of a known id counts: it is the same row). */
    data object Sent : SendOutcome

    /** The key was refused. Nothing is lost: the drink stays queued. */
    data object KeyRejected : SendOutcome

    /** Anything else; try again later. */
    data object Failed : SendOutcome
}

sealed interface TotalsOutcome {
    data class Ok(val totals: Totals) : TotalsOutcome
    data object KeyRejected : TotalsOutcome
    data object Failed : TotalsOutcome
}

/**
 * The Thrive Apps Script API as the widget uses it: `logDrink` and
 * `getDrinkTotals`, the only two actions the widget key may run (#519).
 * Nothing else is sent, so a leaked key can do no more than that.
 *
 * The key travels in the POST body, never the URL, and is never logged.
 */
class SipApi(
    private val url: String,
    private val key: String,
    private val transport: Transport,
) {
    suspend fun logDrink(drink: PendingDrink): SendOutcome {
        val payload = buildJsonObject {
            put("id", drink.id)
            put("kind", drink.kind)
            put("amount", drink.amount)
            put("logged_at_utc", drink.loggedAtUtc)
            put("source", SOURCE)
        }
        return when (call(ACTION_LOG_DRINK, payload.toString())) {
            is Reply.Success -> SendOutcome.Sent
            Reply.KeyRejected -> SendOutcome.KeyRejected
            Reply.Failure -> SendOutcome.Failed
        }
    }

    suspend fun totals(): TotalsOutcome {
        return when (val reply = call(ACTION_GET_TOTALS, null)) {
            is Reply.Success -> {
                val totals = try {
                    reply.data?.let { SipJson.decodeFromJsonElement(Totals.serializer(), it) }
                } catch (e: SerializationException) {
                    null
                } catch (e: IllegalArgumentException) {
                    null
                }
                if (totals != null && totals.isSane()) TotalsOutcome.Ok(totals) else TotalsOutcome.Failed
            }
            Reply.KeyRejected -> TotalsOutcome.KeyRejected
            Reply.Failure -> TotalsOutcome.Failed
        }
    }

    private sealed interface Reply {
        data class Success(val data: JsonElement?) : Reply
        data object KeyRejected : Reply
        data object Failure : Reply
    }

    private suspend fun call(action: String, payload: String?): Reply {
        val form = LinkedHashMap<String, String>()
        form["action"] = action
        form["key"] = key
        if (payload != null) form["payload"] = payload
        val body = try {
            transport.post(url, form)
        } catch (e: IOException) {
            return Reply.Failure
        }
        val envelope: JsonObject = try {
            SipJson.parseToJsonElement(body).jsonObject
        } catch (e: SerializationException) {
            return Reply.Failure
        } catch (e: IllegalArgumentException) {
            return Reply.Failure
        }
        val success = (envelope["success"] as? JsonPrimitive)?.booleanOrNull
        if (success == true) return Reply.Success(envelope["data"])
        val message = (envelope["error"] as? JsonPrimitive)?.contentOrNull
        return if (message == KEY_REJECTED_MESSAGE) Reply.KeyRejected else Reply.Failure
    }

    companion object {
        const val ACTION_LOG_DRINK = "logDrink"
        const val ACTION_GET_TOTALS = "getDrinkTotals"
        const val SOURCE = "widget"

        /**
         * What the API answers to a key it does not know (auth.js
         * `resolveCaller`). It sends no `code` for this one, so the fixed text
         * is the only signal; any other failure is treated as transient.
         */
        const val KEY_REJECTED_MESSAGE = "Invalid or missing API key"
    }
}
