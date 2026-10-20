package com.luketmoss.thrivesip.core

import java.time.Instant
import java.util.UUID

/** Where the queue lives between taps. Writes must be durable before they return. */
interface QueueStore {
    fun load(): List<PendingDrink>
    fun save(drinks: List<PendingDrink>)
}

sealed interface FlushResult {
    /** The queue is empty. */
    data object Done : FlushResult
    data object KeyRejected : FlushResult
    data object Failed : FlushResult
}

/**
 * The taps waiting to reach the server, in tap order.
 *
 * Stateless over its [QueueStore]: every operation reads, changes and writes
 * under one process-wide lock, so a tap from the widget and a flush from a
 * worker never overwrite each other. Nothing is ever discarded for being old
 * or for failing; a drink leaves the queue only when the server has it.
 */
class Outbox(
    private val store: QueueStore,
    private val newId: () -> String = { UUID.randomUUID().toString() },
    private val clock: () -> Instant = { Instant.now() },
) {
    /** Queue one drink with a fresh id and the instant of this call. Every tap is its own entry. */
    fun enqueue(kind: String, amount: Int): PendingDrink {
        val drink = PendingDrink(newId(), kind, amount, tapStamp(clock()))
        synchronized(LOCK) { store.save(store.load() + drink) }
        return drink
    }

    fun pending(): List<PendingDrink> = synchronized(LOCK) { store.load() }

    /**
     * Send the queue oldest first, stopping at the first drink that does not
     * get through so order is kept. A repeat of a drink the server already
     * has is a success, which is what makes retrying after a lost response safe.
     */
    suspend fun flush(api: SipApi): FlushResult {
        while (true) {
            val head = pending().firstOrNull() ?: return FlushResult.Done
            when (api.logDrink(head)) {
                SendOutcome.Sent -> remove(head.id)
                SendOutcome.KeyRejected -> return FlushResult.KeyRejected
                SendOutcome.Failed -> { remove(head.id); return FlushResult.Failed }
            }
        }
    }

    private fun remove(id: String) {
        synchronized(LOCK) { store.save(store.load().filterNot { it.id == id }) }
    }

    private companion object {
        val LOCK = Any()
    }
}
