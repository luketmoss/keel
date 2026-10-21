package com.luketmoss.thrivesip.core

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Everything the widget draws from, read from storage: the widget holds none of it. */
data class Snapshot(
    val configured: Boolean,
    /** The last good `getDrinkTotals`, if there has been one. */
    val totals: Totals?,
    /** When that read happened. */
    val readAt: Instant?,
    val keyRejected: Boolean,
    val pending: List<PendingDrink>,
    val now: Instant,
    /** For the "updated" time. Denver is for filing drinks, not for the phone's clock. */
    val zone: ZoneId = ZoneId.systemDefault(),
)

enum class Mode { NOT_CONFIGURED, LOADING, NORMAL, OFFLINE, KEY_REJECTED }

/**
 * The widget as plain data (design note 524): what to say, not how to draw it.
 * `waterText`, `goalText`, `alcoholText` and `coffeeText` are null where the design shows
 * something else in their place (see [Mode]).
 */
data class WidgetView(
    val mode: Mode,
    /** "Set up Thrive Sip", "Loading…", or "Key rejected — open Thrive Sip" instead of figures. */
    val headline: String?,
    val waterText: String?,
    val goalText: String?,
    /** 0..1, or null when the goal is unknown and the bar is hidden. */
    val progress: Float?,
    val alcoholText: String?,
    /** The bare count, for layouts where the icon and the button colour say what it counts. */
    val alcoholCount: String?,
    /** Cups: the bare number, as the icon says what it counts. */
    val coffeeText: String?,
    /** "updated 3:42 PM", "offline · 2 queued", or empty. */
    val status: String,
    val buttonsEnabled: Boolean,
    val waterDescription: String,
    val alcoholDescription: String,
    val coffeeDescription: String,
)

object WidgetViews {
    const val NOT_CONFIGURED_TEXT = "Set up Thrive Sip"
    const val LOADING_TEXT = "Loading…"
    const val KEY_REJECTED_TEXT = "Key rejected — open Thrive Sip"

    private val TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.US)

    fun build(s: Snapshot): WidgetView {
        if (!s.configured) {
            return WidgetView(
                mode = Mode.NOT_CONFIGURED,
                headline = NOT_CONFIGURED_TEXT,
                waterText = null,
                goalText = null,
                progress = null,
                alcoholText = null,
                alcoholCount = null,
                coffeeText = null,
                status = "",
                buttonsEnabled = false,
                waterDescription = NOT_CONFIGURED_TEXT,
                alcoholDescription = NOT_CONFIGURED_TEXT,
                coffeeDescription = NOT_CONFIGURED_TEXT,
            )
        }

        val today = s.now.atZone(DENVER).toLocalDate()
        val queuedToday = s.pending.filter { it.denverDate() == today }
        val queuedWater = queuedToday.filter { it.kind == Kind.WATER }.sumOf { it.amount }
        val queuedAlcohol = queuedToday.filter { it.kind == Kind.ALCOHOL }.sumOf { it.amount }
        val queuedCoffee = queuedToday.filter { it.kind == Kind.COFFEE }.sumOf { it.amount }
        val queuedText = if (s.pending.isEmpty()) "" else "offline · ${s.pending.size} queued"

        val loading = s.totals == null && !s.keyRejected
        val mode = when {
            s.keyRejected -> Mode.KEY_REJECTED
            loading -> Mode.LOADING
            s.pending.isNotEmpty() -> Mode.OFFLINE
            else -> Mode.NORMAL
        }

        // A read from before Denver midnight says nothing about today: today starts at zero.
        val base = s.totals?.takeIf { it.date == today.toString() }
        val waterMl = (base?.waterMl ?: 0) + queuedWater
        val alcohol = (base?.alcoholDrinks ?: 0) + queuedAlcohol
        val coffee = (base?.coffeeCups ?: 0) + queuedCoffee
        val goal = s.totals?.waterGoalMl?.takeIf { it > 0 }

        val status = when (mode) {
            Mode.KEY_REJECTED -> KEY_REJECTED_TEXT
            Mode.LOADING, Mode.OFFLINE -> queuedText
            else -> s.readAt?.let { "updated ${TIME.format(it.atZone(s.zone))}" } ?: ""
        }

        val water = Volume.formatOz(waterMl)
        val waterDescription = if (goal != null) {
            "Water $water of ${Volume.formatOz(goal)} ounces"
        } else {
            "Water $water ounces"
        }
        val alcoholDescription = if (alcohol == 1) "1 alcoholic drink" else "$alcohol alcoholic drinks"
        val coffeeDescription = if (coffee == 1) "1 cup of coffee" else "$coffee cups of coffee"

        return WidgetView(
            mode = mode,
            headline = if (loading) LOADING_TEXT else null,
            waterText = if (loading) null else "$water oz",
            goalText = if (loading || goal == null) null else "of ${Volume.formatOz(goal)} oz",
            progress = if (loading || goal == null) null else (waterMl.toFloat() / goal).coerceIn(0f, 1f),
            alcoholText = if (loading) null else if (alcohol == 1) "1 drink" else "$alcohol drinks",
            alcoholCount = if (loading) null else "$alcohol",
            coffeeText = if (loading) null else "$coffee",
            status = status,
            buttonsEnabled = true,
            waterDescription = waterDescription,
            alcoholDescription = alcoholDescription,
            coffeeDescription = coffeeDescription,
        )
    }
}
