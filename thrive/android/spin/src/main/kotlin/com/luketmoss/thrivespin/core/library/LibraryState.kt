package com.luketmoss.thrivespin.core.library

import java.time.LocalDate
import java.time.ZoneId

/** What Library's body shows, from the design note's table. */
sealed interface LibraryScreen {
    /** No URL or key in Settings. */
    data object NotSetUp : LibraryScreen

    /** No cache yet and a refresh running. */
    data object Loading : LibraryScreen

    /** No cache and the refresh failed. */
    data class Failed(val reason: Reason) : LibraryScreen

    /**
     * The cache. [notice] is the one line under the title after a failed refresh. [empty] says why the
     * list is not there: an empty library, or a filter nothing matches.
     */
    data class Ready(
        val notice: String?,
        val planned: List<PlannedCard>,
        val heading: String,
        val cards: List<RideWorkout>,
        val unreadable: String?,
        val placeholder: String,
        val empty: Empty?,
    ) : LibraryScreen

    enum class Empty { NoWorkouts, NothingMatches }
}

/** The inputs of one frame of Library. */
data class LibraryInputs(
    val configured: Boolean,
    val cache: LibraryCache?,
    val refreshing: Boolean,
    val failure: Reason?,
    val category: String?,
    val search: String,
    val today: LocalDate,
    val nowMs: Long,
    val zone: ZoneId,
)

object LibraryStates {
    fun screen(i: LibraryInputs): LibraryScreen {
        if (!i.configured) return LibraryScreen.NotSetUp
        val cache = i.cache
        if (cache == null) {
            return if (i.failure != null && !i.refreshing) LibraryScreen.Failed(i.failure) else LibraryScreen.Loading
        }
        val matches = LibraryView.filter(cache.workouts, i.category, i.search)
        val filtering = i.category != null || i.search.isNotBlank()
        val empty = when {
            cache.workouts.isEmpty() -> LibraryScreen.Empty.NoWorkouts
            matches.isEmpty() && filtering -> LibraryScreen.Empty.NothingMatches
            else -> null
        }
        return LibraryScreen.Ready(
            notice = i.failure?.let { LibraryView.staleNotice(it, cache.refreshedAtMs, i.nowMs, i.zone) },
            planned = LibraryView.planned(cache, i.today),
            heading = LibraryView.heading(i.category, i.search, matches.size),
            cards = matches,
            unreadable = LibraryView.unreadableText(cache.unreadable),
            placeholder = LibraryView.searchPlaceholder(cache.workouts.size),
            empty = empty,
        )
    }
}
