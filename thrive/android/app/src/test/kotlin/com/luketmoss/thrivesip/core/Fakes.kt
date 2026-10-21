package com.luketmoss.thrivesip.core

import java.io.IOException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** A queue held in memory: the same contract as the SharedPreferences one. */
class MemoryQueue(initial: List<PendingDrink> = emptyList()) : QueueStore {
    private var drinks = initial
    override fun load(): List<PendingDrink> = drinks
    override fun save(drinks: List<PendingDrink>) {
        this.drinks = drinks
    }
}

/**
 * The Apps Script API as far as the widget can see it (#519): form-encoded
 * POSTs answered with an envelope. A `logDrink` for an id it already has
 * returns the stored row and writes nothing, as `logDrink` in drinks.js does.
 */
class FakeServer(
    private val widgetKey: String = "good-key",
    private val goalMl: Int = 1893,
) : Transport {
    /** One entry per request that reached the server, in order: the action name only, never the key. */
    val actions = mutableListOf<String>()

    /** The sheet: rows by id, in the order they were first written. */
    val rows = LinkedHashMap<String, JsonObject>()

    /** The next N responses are lost after the server has handled the request. */
    var dropResponses = 0

    /** The next N requests never reach the server (no network). */
    var offline = 0

    var date = "2026-10-20"

    override suspend fun post(url: String, form: Map<String, String>): String {
        if (offline > 0) {
            offline--
            throw IOException("offline")
        }
        val action = form.getValue("action")
        actions += action
        if (form["key"] != widgetKey) return """{"success":false,"error":"Invalid or missing API key"}"""
        val reply = when (action) {
            "logDrink" -> {
                val payload = Json.parseToJsonElement(form.getValue("payload")).jsonObject
                rows.getOrPut(payload.getValue("id").jsonPrimitive.content) { payload }
                """{"success":true,"data":$payload}"""
            }
            "getDrinkTotals" -> {
                val water = rows.values.filter { it.getValue("kind").jsonPrimitive.content == "water" }
                    .sumOf { it.getValue("amount").jsonPrimitive.content.toInt() }
                val alcohol = rows.values.count { it.getValue("kind").jsonPrimitive.content == "alcohol" }
                """{"success":true,"data":{"date":"$date","water_ml":$water,"alcohol_drinks":$alcohol,"water_goal_ml":$goalMl}}"""
            }
            else -> """{"success":false,"error":"Widget caller: this action is not permitted","code":"widget_forbidden"}"""
        }
        if (dropResponses > 0) {
            dropResponses--
            throw IOException("timeout")
        }
        return reply
    }
}
