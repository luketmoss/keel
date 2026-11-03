package com.luketmoss.thrivespin.core.library

import com.luketmoss.thrivespin.core.Transport
import com.luketmoss.thrivespin.core.ftp.FtpRow
import com.luketmoss.thrivespin.core.workout.Draft
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Where the cache lives: one string, in and out. */
interface CachePersistence {
    fun read(): String?
    fun write(text: String)
}

sealed interface RefreshOutcome {
    data object Refreshed : RefreshOutcome
    data class Failed(val reason: Reason) : RefreshOutcome

    /** Skipped: not set up, or one ran a moment ago. */
    data object Skipped : RefreshOutcome
}

sealed interface SaveOutcome {
    data class Saved(val workout: RideWorkout) : SaveOutcome

    /** The builder shows [text] under its header and keeps the draft as typed. */
    data class Failed(val text: String) : SaveOutcome
}

sealed interface DeleteOutcome {
    data object Deleted : DeleteOutcome
    data class Failed(val text: String) : DeleteOutcome
}

/**
 * The library's one cache and the calls that change it, plain Kotlin. [config] gives the saved API URL
 * and key at the time of a call, so a change in Settings is picked up with no restart. A refresh
 * replaces the cache whole and only when every call succeeded; a save or delete writes the one row.
 */
class LibraryModel(
    private val persistence: CachePersistence,
    private val transport: Transport,
    private val config: () -> Pair<String, String>,
    private val clock: () -> Long = System::currentTimeMillis,
    private val today: () -> LocalDate = { LocalDate.now() },
) {
    private val cacheFlow = MutableStateFlow(LibraryCodec.decode(persistence.read()))
    private val refreshingFlow = MutableStateFlow(false)
    private val failureFlow = MutableStateFlow<Reason?>(null)

    val cache: StateFlow<LibraryCache?> = cacheFlow.asStateFlow()

    /** True while a refresh is running. */
    val refreshing: StateFlow<Boolean> = refreshingFlow.asStateFlow()

    /** Why the last refresh failed, until the next one succeeds. */
    val failure: StateFlow<Reason?> = failureFlow.asStateFlow()

    val isConfigured: Boolean
        get() = config().let { (url, key) -> RideApi.isConfigured(url, key) }

    private fun api(): RideApi = config().let { (url, key) -> RideApi(url, key, transport) }

    /**
     * Refreshes the cache. Unless [force], a refresh that ran less than a minute ago is skipped. All
     * three calls must succeed; one failing leaves the old cache whole and records why.
     */
    suspend fun refresh(force: Boolean): RefreshOutcome {
        if (!isConfigured) return RefreshOutcome.Skipped
        if (refreshingFlow.value) return RefreshOutcome.Skipped
        val now = clock()
        if (!force && lastAttemptMs != 0L && now - lastAttemptMs < MIN_INTERVAL_MS) return RefreshOutcome.Skipped
        lastAttemptMs = now
        refreshingFlow.value = true
        try {
            val api = api()
            val date = today().toString()
            val workouts = api.getRideWorkouts()
            val ftp = api.getFtp()
            val plans = api.getPlannedWorkouts(date)
            val failed = listOf(workouts, ftp, plans).filterIsInstance<ApiResult.Fail>().firstOrNull()
            if (failed != null) {
                failureFlow.value = failed.reason
                return RefreshOutcome.Failed(failed.reason)
            }
            val read = LibraryRows.workouts((workouts as ApiResult.Ok).data)
            val ftpRow = LibraryRows.currentFtpRow((ftp as ApiResult.Ok).data)
            val next = LibraryCache(
                workouts = read.readable,
                unreadable = read.unreadable,
                ftpW = ftpRow?.ftpW,
                ftpDate = ftpRow?.date.orEmpty(),
                ftpSource = ftpRow?.source.orEmpty(),
                ftpCreated = ftpRow?.created.orEmpty(),
                plans = LibraryRows.bikePlans((plans as ApiResult.Ok).data),
                plansDate = date,
                refreshedAtMs = clock(),
            )
            store(next)
            failureFlow.value = null
            return RefreshOutcome.Refreshed
        } finally {
            refreshingFlow.value = false
        }
    }

    /**
     * Saves the draft with one `saveRideWorkout`. The id is the draft's own, so a retry sends the same
     * one. On success the returned row goes into the cache. Nothing is queued: a failure leaves the
     * draft to the caller and sends nothing later.
     */
    suspend fun save(draft: Draft): SaveOutcome {
        val problem = draft.problem()
        if (problem != null) return SaveOutcome.Failed(problem.text)
        val category = draft.content.category ?: return SaveOutcome.Failed("Pick a category.")
        val steps = draft.steps()
        val result = api().saveRideWorkout(
            id = draft.id,
            name = draft.content.name.trim(),
            category = category,
            description = draft.content.description,
            stepsJson = steps.toJson(),
        )
        return when (result) {
            is ApiResult.Fail ->
                SaveOutcome.Failed(
                    if (result.reason == Reason.BadRequest) {
                        "Couldn't save. Thrive refused this workout."
                    } else {
                        "Couldn't save. ${result.reason.text}"
                    },
                )
            is ApiResult.Ok -> {
                val saved = LibraryRows.workout(result.data) ?: RideWorkout(
                    id = draft.id,
                    name = draft.content.name.trim(),
                    category = category,
                    description = draft.content.description,
                    steps = steps,
                    lastRiddenDate = cacheFlow.value?.workouts?.firstOrNull { it.id == draft.id }?.lastRiddenDate.orEmpty(),
                )
                putWorkout(saved)
                SaveOutcome.Saved(saved)
            }
        }
    }

    /** `deleted: true` and `deleted: false` both count as done. Offline changes nothing. */
    suspend fun delete(id: String): DeleteOutcome =
        when (val result = api().deleteRideWorkout(id)) {
            is ApiResult.Fail -> DeleteOutcome.Failed("Couldn't delete. ${result.reason.text}")
            is ApiResult.Ok -> {
                removeWorkout(id)
                DeleteOutcome.Deleted
            }
        }

    /**
     * A queued FTP write reached Thrive (#770): the cache's `current` becomes the row it returned, unless
     * the cache already holds a newer one. Safe from the worker: the model is the process's one.
     */
    fun setCurrentFtp(row: FtpRow) {
        val current = cacheFlow.value ?: LibraryCache(emptyList(), 0, null, emptyList(), "", 0L)
        val cachedKey = current.ftpDate to current.ftpCreated
        if (current.ftpW != null && (cachedKey.first > row.date || (cachedKey.first == row.date && cachedKey.second > row.created))) return
        store(current.withFtp(row))
    }

    private fun putWorkout(w: RideWorkout) {
        val current = cacheFlow.value
            ?: LibraryCache(emptyList(), 0, null, emptyList(), "", 0L)
        store(current.withWorkout(w))
    }

    private fun removeWorkout(id: String) {
        val current = cacheFlow.value ?: return
        store(current.without(id))
    }

    private fun store(next: LibraryCache) {
        persistence.write(LibraryCodec.encode(next))
        cacheFlow.value = next
    }

    companion object {
        const val MIN_INTERVAL_MS = 60_000L

        /** When a refresh was last tried, in this process: rotation makes a new model and must not refresh again. */
        @Volatile
        var lastAttemptMs: Long = 0L
    }
}
