package com.luketmoss.thrivespin.core

/**
 * One connection's GATT operations, one at a time. Android's GATT API runs a
 * single operation per connection and answers each in a callback; an operation
 * started before the last one answers is dropped. An operation is a function
 * that starts the call and says whether the stack accepted it; the callback
 * then reports [complete]. #768 reuses this for the ride.
 */
class GattQueue {
    private val pending = ArrayDeque<() -> Boolean>()
    private var busy = false

    val isBusy: Boolean get() = busy

    fun add(operation: () -> Boolean) {
        pending.addLast(operation)
        if (!busy) next()
    }

    /** The running operation's callback arrived. */
    fun complete() {
        busy = false
        next()
    }

    /** The connection is gone: nothing queued or running means anything now. */
    fun clear() {
        pending.clear()
        busy = false
    }

    private fun next() {
        while (!busy) {
            val operation = pending.removeFirstOrNull() ?: return
            busy = operation()
        }
    }
}
