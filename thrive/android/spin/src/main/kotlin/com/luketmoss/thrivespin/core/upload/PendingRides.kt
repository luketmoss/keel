package com.luketmoss.thrivespin.core.upload

import com.luketmoss.thrivespin.core.ride.RideKind
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** The three grounds and wordings of the Library banner, most urgent first. */
enum class BannerKind { CouldntSave, NotSaved, Waiting }

/** The Library banner: the most urgent state present, its count, and the ride a tap opens (the oldest in it). */
data class PendingBanner(val kind: BannerKind, val count: Int, val rideId: String) {
    val text: String
        get() = when (kind) {
            BannerKind.CouldntSave -> if (count == 1) "1 ride couldn't be saved to Thrive" else "$count rides couldn't be saved to Thrive"
            BannerKind.NotSaved -> if (count == 1) "1 ride isn't saved to Thrive yet" else "$count rides aren't saved to Thrive yet"
            BannerKind.Waiting -> if (count == 1) "1 ride is waiting to send to Thrive" else "$count rides are waiting to send to Thrive"
        }

    /** "Review" for a ride nobody has saved, "Details" otherwise. */
    val button: String get() = if (kind == BannerKind.NotSaved) "Review" else "Details"
}

object PendingRides {
    private fun kindOf(stage: UploadStage): BannerKind? = when (stage) {
        UploadStage.Rejected, UploadStage.NeedsKey, UploadStage.NeedsSetup, UploadStage.Stuck -> BannerKind.CouldntSave
        UploadStage.Draft -> BannerKind.NotSaved
        UploadStage.Queued -> BannerKind.Waiting
        UploadStage.Sent -> null
    }

    /** Null with no ride that is not finished with. */
    fun banner(rides: List<PendingRide>): PendingBanner? {
        val byKind = rides.mapNotNull { r -> kindOf(r.stage)?.let { it to r } }.groupBy({ it.first }, { it.second })
        for (kind in BannerKind.entries) {
            val group = byKind[kind] ?: continue
            val oldest = group.minWith(compareBy({ it.orderKey }, { it.rideId }))
            return PendingBanner(kind, group.size, oldest.rideId)
        }
        return null
    }
}

/**
 * The hand-off from #768 (`RideFinishedHandler`): a finished workout opens its summary and is marked handed
 * off at once, so an unsaved ride is not re-presented on every app open. A ramp test (#770) opens its result
 * screen instead and is **left un-handed-off** until the person presses Continue there, so a decision left
 * with "Later" comes back at every app open, oldest first, until it is made or the test is discarded.
 */
class SummaryHandler(
    private val kindOf: (String) -> RideKind?,
    private val markHandedOff: (String) -> Unit,
    private val show: (String) -> Unit,
    /** Opens a ramp test's result; null leaves a ramp test untouched. */
    private val showResult: ((String) -> Unit)? = null,
    private val isHandedOff: (String) -> Boolean = { false },
) : com.luketmoss.thrivespin.core.ride.RideFinishedHandler {
    override fun onFinished(rideId: String) {
        when (kindOf(rideId)) {
            RideKind.Workout -> {
                show(rideId)
                markHandedOff(rideId)
            }
            RideKind.RampTest -> if (showResult != null && !isHandedOff(rideId)) showResult.invoke(rideId)
            null -> Unit
        }
    }
}

/** The summaries waiting to be shown, oldest first, one at a time: Done or Later on one opens the next. */
class SummaryQueue {
    private val _ids = MutableStateFlow<List<String>>(emptyList())
    val ids: StateFlow<List<String>> get() = _ids

    /** The summary on screen, if any. */
    val head: String? get() = _ids.value.firstOrNull()

    /** Queues [rideId] behind the others, once. */
    fun add(rideId: String) {
        if (rideId !in _ids.value) _ids.value = _ids.value + rideId
    }

    /** Brings [rideId] to the front: a banner tap opens that ride next. */
    fun showNow(rideId: String) {
        _ids.value = listOf(rideId) + _ids.value.filter { it != rideId }
    }

    fun remove(rideId: String) {
        _ids.value = _ids.value - rideId
    }
}
