package com.luketmoss.thrivespin.core

import java.util.Locale

sealed interface SpinDownState {
    val message: String

    data object Starting : SpinDownState {
        override val message get() = "Getting the trainer ready…"
    }

    /** [targetMph] is the high target speed, from the trainer's reply. */
    data class SpeedUp(val targetMph: Double) : SpinDownState {
        override val message get() = "Pedal up to ${SpinDown.formatMph(targetMph)} mph"
    }

    data object Coast : SpinDownState {
        override val message get() = "Stop pedalling and let it coast."
    }

    data object Done : SpinDownState {
        override val message get() = "Calibrated."
    }

    data class Failed(override val message: String) : SpinDownState
}

/**
 * The spin-down procedure as a state machine over trainer bytes. It writes
 * Request Control (`00`), waits for its response, then Spin Down Control start
 * (`13 01`), and follows the trainer's status from there. It sends nothing
 * after it ends, and closing the sheet just stops feeding it.
 *
 * [write] sends bytes to the Control Point; [nowMs] is the clock, so a test
 * can pass 60 s without waiting.
 */
class SpinDown(private val write: (ByteArray) -> Unit, private val nowMs: () -> Long) {
    var state: SpinDownState = SpinDownState.Starting
        private set

    /** The current speed from Indoor Bike Data, in mph, for the figure on the sheet. */
    var speedMph: Double? = null
        private set

    private var changedAt = 0L
    private var requested = false

    val finished: Boolean get() = state is SpinDownState.Done || state is SpinDownState.Failed

    fun start() {
        state = SpinDownState.Starting
        speedMph = null
        requested = false
        changedAt = nowMs()
        write(Ftms.REQUEST_CONTROL)
    }

    fun onSpeed(kmh: Double?) {
        speedMph = kmh?.let { it / KMH_PER_MPH }
    }

    fun onControlResponse(bytes: ByteArray) {
        if (finished) return
        val response = Ftms.parseControlResponse(bytes) ?: return
        when (response.op) {
            Ftms.OP_REQUEST_CONTROL -> {
                if (requested) return
                if (response.result != Ftms.RESULT_SUCCESS) return fail(REFUSED)
                requested = true
                changedAt = nowMs()
                write(Ftms.SPIN_DOWN_START)
            }
            Ftms.OP_SPIN_DOWN -> {
                if (response.result != Ftms.RESULT_SUCCESS) return fail(REFUSED)
                val targets = Ftms.spinDownTargets(response) ?: return fail(REFUSED)
                changedAt = nowMs()
                state = SpinDownState.SpeedUp(targets.second / KMH_PER_MPH)
            }
        }
    }

    fun onStatus(bytes: ByteArray) {
        if (finished) return
        when (Ftms.parseSpinDownStatus(bytes)) {
            STATUS_STOP_PEDALLING -> change(SpinDownState.Coast)
            STATUS_SUCCESS -> change(SpinDownState.Done)
            STATUS_ERROR -> fail(DIDNT_FINISH)
            STATUS_REQUESTED -> changedAt = nowMs()
        }
    }

    fun onDisconnect() {
        if (!finished) fail(LOST)
    }

    /** Call about once a second: a step with no change for 60 s fails. */
    fun onTick() {
        if (!finished && nowMs() - changedAt >= TIMEOUT_MS) fail(DIDNT_FINISH)
    }

    private fun change(next: SpinDownState) {
        changedAt = nowMs()
        state = next
    }

    private fun fail(reason: String) {
        state = SpinDownState.Failed(reason)
    }

    companion object {
        const val TIMEOUT_MS = 60_000L
        const val KMH_PER_MPH = 1.609344
        private const val STATUS_REQUESTED = 0x01
        private const val STATUS_SUCCESS = 0x02
        private const val STATUS_ERROR = 0x03
        private const val STATUS_STOP_PEDALLING = 0x04

        const val DIDNT_FINISH = "Spin-down didn't finish. Try again."
        const val REFUSED = "The trainer said no. Close other apps connected to it and try again."
        const val LOST = "Lost the trainer. Try again when it's connected."

        fun formatMph(mph: Double): String = String.format(Locale.ROOT, "%.1f", mph)
    }
}
