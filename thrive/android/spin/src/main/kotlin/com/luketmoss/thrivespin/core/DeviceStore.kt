package com.luketmoss.thrivespin.core

import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable

@Serializable
enum class DeviceKind { Trainer, HeartRate }

/** What "pairing" means here: the address, the name it advertised, and what kind it is. */
@Serializable
data class SavedDevice(
    val address: String,
    val name: String,
    val kind: DeviceKind,
    /** A trainer's FTMS features, kept once read so the card's detail survives a disconnect. */
    val features: FtmsFeatures? = null,
)

@Serializable
data class DeviceState(
    val trainer: SavedDevice? = null,
    /** In list order, which is the order a ride falls back through. */
    val monitors: List<SavedDevice> = emptyList(),
    /** The monitor picked for rides, by address. */
    val picked: String? = null,
    /** "If it isn't found, use the next one". On by default, kept while hidden. */
    val fallback: Boolean = true,
)

/** The only thing the store needs from storage: one string, in and out. */
interface DevicePersistence {
    fun read(): String?
    fun write(json: String)
}

enum class AddResult { Added, AlreadySaved, TrainerSlotTaken }

/**
 * Saved devices, plain Kotlin over [DevicePersistence]. Spin keeps one trainer
 * and any number of heart rate monitors; every change is written at once.
 */
class DeviceStore(private val persistence: DevicePersistence) {
    var state: DeviceState = load()
        private set

    private fun load(): DeviceState {
        val raw = persistence.read() ?: return DeviceState()
        return try {
            SpinJson.decodeFromString(DeviceState.serializer(), raw)
        } catch (e: SerializationException) {
            DeviceState()
        } catch (e: IllegalArgumentException) {
            DeviceState()
        }
    }

    private fun update(next: DeviceState) {
        if (next == state) return
        state = next
        persistence.write(SpinJson.encodeToString(DeviceState.serializer(), next))
    }

    fun isSaved(address: String): Boolean =
        state.trainer?.address == address || state.monitors.any { it.address == address }

    fun add(device: SavedDevice): AddResult {
        if (isSaved(device.address)) return AddResult.AlreadySaved
        return when (device.kind) {
            DeviceKind.Trainer -> {
                if (state.trainer != null) return AddResult.TrainerSlotTaken
                update(state.copy(trainer = device))
                AddResult.Added
            }
            DeviceKind.HeartRate -> {
                update(
                    state.copy(
                        monitors = state.monitors + device,
                        picked = state.picked ?: device.address,
                    ),
                )
                AddResult.Added
            }
        }
    }

    fun forget(address: String) {
        if (state.trainer?.address == address) {
            update(state.copy(trainer = null))
            return
        }
        val monitors = state.monitors.filterNot { it.address == address }
        if (monitors.size == state.monitors.size) return
        val picked = if (state.picked == address) monitors.firstOrNull()?.address else state.picked
        update(state.copy(monitors = monitors, picked = picked))
    }

    fun pick(address: String) {
        if (state.monitors.none { it.address == address }) return
        update(state.copy(picked = address))
    }

    fun moveUp(address: String) = move(address, -1)

    fun moveDown(address: String) = move(address, 1)

    private fun move(address: String, by: Int) {
        val from = state.monitors.indexOfFirst { it.address == address }
        val to = from + by
        if (from < 0 || to !in state.monitors.indices) return
        val list = state.monitors.toMutableList()
        list[from] = list[to].also { list[to] = list[from] }
        update(state.copy(monitors = list))
    }

    fun setFallback(on: Boolean) = update(state.copy(fallback = on))

    /** Keeps what the trainer reported about itself. */
    fun setFeatures(address: String, features: FtmsFeatures) {
        val trainer = state.trainer ?: return
        if (trainer.address != address) return
        update(state.copy(trainer = trainer.copy(features = features)))
    }
}

/**
 * Which monitor a ride uses (#768 calls this): the picked one if it is found;
 * otherwise, with the fallback on, the first found one in list order. Otherwise none.
 */
object RideHeartRate {
    fun choose(state: DeviceState, found: Set<String>): String? {
        if (state.monitors.isEmpty()) return null
        val picked = state.picked
        if (picked != null && picked in found) return picked
        if (!state.fallback) return null
        return state.monitors.firstOrNull { it.address != picked && it.address in found }?.address
    }
}
