package com.luketmoss.thrivesip.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The server files every drink by this zone's calendar (#519). */
val DENVER: ZoneId = ZoneId.of("America/Denver")

val SipJson = Json { ignoreUnknownKeys = true }

object Kind {
    const val WATER = "water"
    const val ALCOHOL = "alcohol"
    const val COFFEE = "coffee"
    const val UNWIND = "unwind"
}

/**
 * A drink the person has tapped and the server may not have yet. `id` is
 * generated once, at the tap, and travels with every retry: the server stores a
 * given id once, so sending twice can never count twice. `loggedAtUtc` is the
 * instant of the tap, whole seconds, and is never rewritten by delivery.
 */
@Serializable
data class PendingDrink(
    val id: String,
    val kind: String,
    val amount: Int,
    @SerialName("logged_at_utc") val loggedAtUtc: String,
) {
    /** The Denver calendar day this tap belongs to, or null if the stamp is unreadable. */
    fun denverDate(): LocalDate? =
        runCatching { Instant.parse(loggedAtUtc).atZone(DENVER).toLocalDate() }.getOrNull()
}

/** `getDrinkTotals`' data: today's intake in Denver, zeros on a quiet day. */
@Serializable
data class Totals(
    val date: String,
    @SerialName("water_ml") val waterMl: Int,
    @SerialName("alcohol_drinks") val alcoholDrinks: Int,
    @SerialName("water_goal_ml") val waterGoalMl: Int,
    /** Defaulted so a deployment that predates coffee (#560) still reads. */
    @SerialName("coffee_cups") val coffeeCups: Int = 0,
    /** Mg. Defaulted so a deployment that predates Unwind (#590) still reads. */
    @SerialName("unwind_mg") val unwindMg: Int = 0,
) {
    fun isSane(): Boolean =
        waterMl >= 0 && alcoholDrinks >= 0 && waterGoalMl >= 0 && coffeeCups >= 0 && unwindMg >= 0
}

/** The tap instant in the form the API takes: ISO 8601 UTC, whole seconds, `...Z`. */
fun tapStamp(now: Instant): String = now.truncatedTo(ChronoUnit.SECONDS).toString()

/** The first instant of the next Denver day, DST included. */
fun nextDenverMidnight(now: Instant): Instant =
    now.atZone(DENVER).toLocalDate().plusDays(1).atStartOfDay(DENVER).toInstant()
