package com.luketmoss.thrivespin.core

/** One advertisement the scan saw, reduced to what the list needs. */
data class ScanHit(val address: String, val name: String?, val advertisesFtms: Boolean, val advertisesHeartRate: Boolean)

sealed interface ScanAction {
    data object Add : ScanAction
    data object Saved : ScanAction
    data object None : ScanAction
}

data class ScanRow(
    val address: String,
    val name: String,
    val kind: DeviceKind,
    val detail: String,
    val action: ScanAction,
)

/** The name as shown and as saved: what the device advertised, else "Unnamed device (…3A:7F)". */
fun displayName(name: String?, address: String): String =
    if (!name.isNullOrBlank()) name else "Unnamed device (…${address.takeLast(5)})"

/**
 * The scan sheet's list: each device once by address, appended in the order
 * found and never re-sorted, so a row does not move under a finger. A repeat
 * advertisement changes nothing.
 */
class ScanList {
    private val hits = LinkedHashMap<String, ScanHit>()

    /** Returns true when the device is new to the list. */
    fun offer(hit: ScanHit): Boolean {
        if (!hit.advertisesFtms && !hit.advertisesHeartRate) return false
        if (hit.address in hits) return false
        hits[hit.address] = hit
        return true
    }

    val isEmpty: Boolean get() = hits.isEmpty()

    fun rows(state: DeviceState): List<ScanRow> {
        val trainer = state.trainer
        return hits.values.map { hit ->
            val kind = if (hit.advertisesFtms) DeviceKind.Trainer else DeviceKind.HeartRate
            val name = displayName(hit.name, hit.address)
            val saved = trainer?.address == hit.address || state.monitors.any { it.address == hit.address }
            val base = if (kind == DeviceKind.Trainer) "Trainer" else "Heart rate monitor"
            when {
                saved -> ScanRow(hit.address, name, kind, base, ScanAction.Saved)
                kind == DeviceKind.Trainer && trainer != null ->
                    ScanRow(hit.address, name, kind, "Trainer · forget ${trainer.name} to add this one", ScanAction.None)
                else -> ScanRow(hit.address, name, kind, base, ScanAction.Add)
            }
        }
    }
}
