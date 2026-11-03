package com.luketmoss.thrivespin.core.library

import com.luketmoss.thrivespin.core.SpinJson
import com.luketmoss.thrivespin.core.ftp.FtpRow
import com.luketmoss.thrivespin.core.workout.Estimates
import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.StepsParse
import com.luketmoss.thrivespin.core.workout.StepsV1
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/** One library workout whose steps passed the v1 validator. */
@Serializable
data class RideWorkout(
    val id: String,
    val name: String,
    val category: String,
    val description: String,
    val steps: StepsV1,
    /** The newest date of a completed Spin ride of it (`YYYY-MM-DD`), or blank. */
    val lastRiddenDate: String = "",
) {
    val totalS: Int get() = steps.totalSeconds

    /** TSS and IF at 100% do not depend on FTP. */
    val estimates: Estimates get() = Maths.estimate(steps, null, 100)
}

/** A row of `getPlannedWorkouts`, kept for the bike rows only. */
@Serializable
data class PlanRow(
    val id: String,
    val name: String,
    val time: String,
    val status: String,
    val rideWorkoutId: String,
)

/**
 * Everything the library keeps on the phone, replaced whole by each successful refresh: the workouts
 * that could be read, how many could not, the current FTP, today's bike plans and the date they are
 * for, and when it was refreshed.
 */
@Serializable
data class LibraryCache(
    val workouts: List<RideWorkout>,
    val unreadable: Int,
    val ftpW: Int?,
    val plans: List<PlanRow>,
    val plansDate: String,
    val refreshedAtMs: Long,
    /** #770: when the cached `current` took effect, how it was set and when the server made it, for [com.luketmoss.thrivespin.core.ftp.CurrentFtp]. */
    val ftpDate: String = "",
    val ftpSource: String = "",
    val ftpCreated: String = "",
) {
    /** The cache with `getFtp`'s current replaced by [row]. */
    fun withFtp(row: FtpRow): LibraryCache = copy(ftpW = row.ftpW, ftpDate = row.date, ftpSource = row.source, ftpCreated = row.created)

    fun withWorkout(w: RideWorkout): LibraryCache =
        if (workouts.any { it.id == w.id }) {
            copy(workouts = workouts.map { if (it.id == w.id) w else it })
        } else {
            copy(workouts = workouts + w)
        }

    fun without(id: String): LibraryCache = copy(workouts = workouts.filterNot { it.id == id })
}

/** Reads what the API sends into the cache's own types. */
object LibraryRows {
    data class Workouts(val readable: List<RideWorkout>, val unreadable: Int)

    /** A row of `getRideWorkouts` or the one `saveRideWorkout` returns; null when it cannot be read. */
    fun workout(row: JsonElement?): RideWorkout? {
        val obj = row as? JsonObject ?: return null
        val id = text(obj["id"]).takeIf { it.isNotBlank() } ?: return null
        val steps = (StepsV1.fromElement(obj["steps"]) as? StepsParse.Ok)?.steps ?: return null
        return RideWorkout(
            id = id,
            name = text(obj["name"]),
            category = text(obj["category"]),
            description = text(obj["description"]),
            steps = steps,
            lastRiddenDate = text(obj["last_ridden_date"]),
        )
    }

    /** Every row it can read, and a count of the ones it cannot (a row with no id counts too). */
    fun workouts(data: JsonElement?): Workouts {
        val rows = data as? JsonArray ?: return Workouts(emptyList(), 0)
        val readable = ArrayList<RideWorkout>()
        var unreadable = 0
        for (row in rows) {
            val w = workout(row)
            if (w == null) unreadable++ else readable += w
        }
        return Workouts(readable, unreadable)
    }

    /** `getFtp`'s `current.ftp_w`, or null when there is none. */
    fun currentFtp(data: JsonElement?): Int? = currentFtpRow(data)?.ftpW

    /** `getFtp`'s `current` row, or null when there is none. */
    fun currentFtpRow(data: JsonElement?): FtpRow? = FtpRow.read((data as? JsonObject)?.get("current"))

    /** The `bike` rows of `getPlannedWorkouts`. */
    fun bikePlans(data: JsonElement?): List<PlanRow> {
        val rows = data as? JsonArray ?: return emptyList()
        return rows.mapNotNull { row ->
            val obj = row as? JsonObject ?: return@mapNotNull null
            if (text(obj["type"]) != "bike") return@mapNotNull null
            PlanRow(
                id = text(obj["id"]),
                name = text(obj["name"]),
                time = text(obj["time"]),
                status = text(obj["status"]),
                rideWorkoutId = text(obj["ride_workout_id"]),
            )
        }
    }

    private fun text(e: JsonElement?): String = (e as? JsonPrimitive)?.contentOrNull.orEmpty()
}

/** One card of "Planned today". [workout] is null when the plan's workout is not in the library. */
data class PlannedCard(val planName: String, val rideWorkoutId: String, val workout: RideWorkout?)

/** What a library screen shows, derived from the cache, the filter and today's date. */
object LibraryView {
    val CATEGORIES = listOf("Endurance", "Sweet spot", "Threshold", "VO2", "Recovery")

    /** Lower case with accents taken off, for the search. */
    fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase(Locale.ROOT)

    /** Shortest total first, then name A to Z. */
    fun sorted(workouts: List<RideWorkout>): List<RideWorkout> =
        workouts.sortedWith(
            compareBy<RideWorkout> { it.totalS }
                .thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
                .thenBy { it.name }
                .thenBy { it.id },
        )

    /** The chip and the search together: both must match. [category] null is "All". */
    fun filter(workouts: List<RideWorkout>, category: String?, search: String): List<RideWorkout> {
        val needle = fold(search.trim())
        return sorted(workouts).filter { w ->
            (category == null || w.category == category) &&
                (needle.isEmpty() || fold(w.name).contains(needle) || fold(w.description).contains(needle))
        }
    }

    fun heading(category: String?, search: String, count: Int): String = when {
        search.isNotBlank() -> "$count matching"
        category != null -> "$category · $count"
        else -> "All workouts · $count"
    }

    fun unreadableText(count: Int): String? = when {
        count <= 0 -> null
        count == 1 -> "1 workout couldn't be read."
        else -> "$count workouts couldn't be read."
    }

    fun searchPlaceholder(count: Int): String = "Search $count workouts"

    /**
     * Today's Spin workouts from Thrive: `bike` rows that are `planned` with a non-blank workout id, in
     * time order, from cached plans only when they are for [today].
     */
    fun planned(cache: LibraryCache, today: LocalDate): List<PlannedCard> {
        if (cache.plansDate != today.toString()) return emptyList()
        return cache.plans
            .filter { it.status == "planned" && it.rideWorkoutId.isNotBlank() }
            .sortedBy { it.time }
            .map { p -> PlannedCard(p.name, p.rideWorkoutId, cache.workouts.firstOrNull { it.id == p.rideWorkoutId }) }
    }

    /** Whether [workoutId] is one of today's planned Spin workouts, for the detail's eyebrow. */
    fun isPlannedToday(cache: LibraryCache?, workoutId: String, today: LocalDate): Boolean =
        cache != null && planned(cache, today).any { it.rideWorkoutId == workoutId }

    private val LONG_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)
    private val SHORT_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d", Locale.US)
    private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.US)

    /** "Never ridden", "Ridden today", "Ridden yesterday", "Ridden 5 days ago", "Ridden 3 weeks ago", "Ridden Sep 4, 2026". */
    fun lastRidden(date: String, today: LocalDate): String {
        val d = try {
            LocalDate.parse(date.trim())
        } catch (e: java.time.format.DateTimeParseException) {
            return "Never ridden"
        }
        val days = ChronoUnit.DAYS.between(d, today)
        return when {
            days <= 0 -> "Ridden today"
            days == 1L -> "Ridden yesterday"
            days < 14 -> "Ridden $days days ago"
            days < 60 -> "Ridden ${days / 7} weeks ago"
            else -> "Ridden ${d.format(LONG_DATE)}"
        }
    }

    /** "h:mm a" when the refresh was today, else "MMM d". */
    fun refreshedAt(atMs: Long, nowMs: Long, zone: ZoneId): String {
        val at = Instant.ofEpochMilli(atMs).atZone(zone)
        val now = Instant.ofEpochMilli(nowMs).atZone(zone)
        return if (at.toLocalDate() == now.toLocalDate()) at.format(CLOCK) else at.format(SHORT_DATE)
    }

    /** The line under the title when the last refresh failed. */
    fun staleNotice(reason: Reason, atMs: Long, nowMs: Long, zone: ZoneId): String {
        val time = refreshedAt(atMs, nowMs, zone)
        return if (reason == Reason.Network) "Offline · library from $time" else "Couldn't refresh · library from $time"
    }
}

/** The cache as the one string the phone keeps, and back. */
object LibraryCodec {
    fun encode(cache: LibraryCache): String = SpinJson.encodeToString(LibraryCache.serializer(), cache)

    /** Null for nothing stored or something this version cannot read. */
    fun decode(text: String?): LibraryCache? {
        if (text.isNullOrBlank()) return null
        return try {
            SpinJson.decodeFromString(LibraryCache.serializer(), text)
        } catch (e: SerializationException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }
    }
}
