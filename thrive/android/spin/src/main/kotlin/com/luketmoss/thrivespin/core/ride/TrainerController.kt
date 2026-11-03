package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.Ftms
import com.luketmoss.thrivespin.core.ble.FtmsControl
import com.luketmoss.thrivespin.core.ble.TargetSupport
import com.luketmoss.thrivespin.core.ble.ValueRange

/** Where the controller writes: the trainer's Control Point. The answer comes back through [TrainerController.onResponse]. */
interface TrainerPort {
    fun write(bytes: ByteArray)
}

/** What the trainer reported about itself when it connected; null where a read failed. */
data class TrainerSetup(
    val support: TargetSupport?,
    val powerRange: ValueRange?,
    val resistanceRange: ValueRange?,
)

/** What the ride wants the trainer to do right now. Flat is the road that feels like no target. */
sealed interface Desired {
    data class Power(val watts: Int) : Desired
    data class Resistance(val level: Int) : Desired
    data class Grade(val hundredths: Int) : Desired
    data object Flat : Desired
}

enum class ControlNotice { NoControl, PowerUnsupported, ResistanceUnsupported, SimulationUnsupported, Refused }

/**
 * The ride's side of the Fitness Machine Control Point (#768): the connection sequence, one command in
 * flight, only the newest target waiting behind it, and what each refusal means. Plain Kotlin; time is
 * passed in, so a fake clock drives it. It never sends Reset or Stop.
 */
class TrainerController(
    private val port: TrainerPort,
    /** A refusal or a timeout, for the recording: the op, and the result (-1 for a timeout). */
    private val onControlEvent: (op: Int, result: Int) -> Unit,
) {
    private class Wire(val op: Int, val bytes: ByteArray) {
        fun same(other: Wire) = op == other.op && bytes.contentEquals(other.bytes)
    }

    private sealed interface Flight {
        val sentAt: Long

        class Seq(val op: Int, override val sentAt: Long) : Flight
        class Target(val wire: Wire, override val sentAt: Long) : Flight
    }

    private enum class LastState { Sent, Acked, FailedOnce, Rejected }

    private var connected = false
    private var setup = TrainerSetup(null, null, null)
    private var hasControl = false
    private var noControl = false
    private var refused = false
    private var recovery = false
    private var recoveryWire: Wire? = null
    private val queue = ArrayDeque<Int>()
    private var inFlight: Flight? = null
    private var desired: Desired? = null
    private var last: Wire? = null
    private var lastState = LastState.Sent
    private var attempts = 0
    private var retryAt = 0L
    private var rcRetryAt = -1L
    private val unsupported = HashSet<Int>()

    /** True once the connection's sequence has been answered (or Request Control was refused): "Pedal to start". */
    var sequenceDone = false
        private set

    /** The ride's own Bluetooth connection is up and subscribed; run the sequence from Request Control. */
    fun onConnected(newSetup: TrainerSetup, nowMs: Long) {
        setup = newSetup
        connected = true
        hasControl = false
        noControl = false
        sequenceDone = false
        recovery = false
        recoveryWire = null
        queue.clear()
        queue.addLast(FtmsControl.OP_REQUEST_CONTROL)
        inFlight = null
        last = null
        rcRetryAt = -1L
        pump(nowMs)
    }

    fun onDisconnected() {
        connected = false
        hasControl = false
        noControl = false
        sequenceDone = false
        recovery = false
        queue.clear()
        inFlight = null
        last = null
        rcRetryAt = -1L
    }

    /** The newest thing the ride wants. Sent when it changes, once nothing is in flight. */
    fun setDesired(next: Desired, nowMs: Long) {
        desired = next
        pump(nowMs)
    }

    /** A new step: a refusal of the last step's target does not carry over. */
    fun stepChanged() {
        refused = false
    }

    fun tick(nowMs: Long) {
        val f = inFlight
        if (f != null && nowMs - f.sentAt >= TIMEOUT_MS) {
            inFlight = null
            when (f) {
                is Flight.Seq -> {
                    onControlEvent(f.op, -1)
                    seqAnswered(f.op, result = null, nowMs = nowMs)
                }
                is Flight.Target -> {
                    onControlEvent(f.wire.op, -1)
                    failedAttempt(nowMs)
                }
            }
        }
        pump(nowMs)
    }

    fun onResponse(bytes: ByteArray, nowMs: Long) {
        val response = Ftms.parseControlResponse(bytes) ?: return
        when (val f = inFlight ?: return) {
            is Flight.Seq -> {
                if (response.op != f.op) return
                inFlight = null
                if (response.result != FtmsControl.RESULT_SUCCESS) onControlEvent(f.op, response.result)
                seqAnswered(f.op, response.result, nowMs)
            }
            is Flight.Target -> {
                if (response.op != f.wire.op) return
                inFlight = null
                targetAnswered(f.wire, response.result, nowMs)
            }
        }
        pump(nowMs)
    }

    /** Fitness Machine Status: control lost, or a reset, runs the sequence again from Request Control. */
    fun onStatus(bytes: ByteArray, nowMs: Long) {
        if (!connected || !FtmsControl.isControlLost(bytes)) return
        onControlEvent(-1, bytes[0].toInt() and 0xFF)
        queue.clear()
        queue.addLast(FtmsControl.OP_REQUEST_CONTROL)
        inFlight = null
        hasControl = false
        sequenceDone = false
        recovery = false
        recoveryWire = null
        last = null
        pump(nowMs)
    }

    /** Nothing is waiting to be sent or answered: the trainer can be let go. */
    val settled: Boolean
        get() {
            if (!connected) return true
            if (inFlight != null || queue.isNotEmpty()) return false
            if (!hasControl) return true
            val wanted = desired?.let { resolve(it) } ?: return true
            val l = last ?: return false
            return l.same(wanted) && (lastState == LastState.Acked || lastState == LastState.Rejected)
        }

    /** The current target is being applied: connected, in control, supported and not refused. */
    val applying: Boolean
        get() {
            if (!connected || !hasControl) return false
            val wanted = desired?.let { resolve(it) } ?: return false
            val l = last
            return !(l != null && l.same(wanted) && lastState == LastState.Rejected)
        }

    /** The banner the trainer's answers call for, or null. */
    val notice: ControlNotice?
        get() {
            if (!connected) return null
            if (noControl) return ControlNotice.NoControl
            val missing = when (desired) {
                is Desired.Power -> if (!supports(FtmsControl.OP_SET_POWER)) ControlNotice.PowerUnsupported else null
                is Desired.Resistance -> if (!supports(FtmsControl.OP_SET_RESISTANCE)) ControlNotice.ResistanceUnsupported else null
                is Desired.Grade -> if (!supports(FtmsControl.OP_SET_SIMULATION)) ControlNotice.SimulationUnsupported else null
                Desired.Flat, null -> null
            }
            if (missing != null) return missing
            return if (refused) ControlNotice.Refused else null
        }

    private fun supports(op: Int): Boolean {
        if (op in unsupported) return false
        val s = setup.support ?: TargetSupport.ALL
        return when (op) {
            FtmsControl.OP_SET_POWER -> s.power
            FtmsControl.OP_SET_RESISTANCE -> s.resistance
            FtmsControl.OP_SET_SIMULATION -> s.simulation
            else -> true
        }
    }

    private fun resolve(d: Desired): Wire? = when (d) {
        is Desired.Power ->
            if (supports(FtmsControl.OP_SET_POWER)) {
                Wire(FtmsControl.OP_SET_POWER, FtmsControl.setTargetPower(FtmsControl.clampPower(d.watts, setup.powerRange)))
            } else {
                null
            }
        is Desired.Resistance -> resistance(FtmsControl.levelToRaw(d.level, setup.resistanceRange))
        is Desired.Grade -> simulation(d.hundredths)
        Desired.Flat -> simulation(0) ?: resistance(setup.resistanceRange?.min ?: 0)
    }

    private fun resistance(raw: Int): Wire? =
        if (supports(FtmsControl.OP_SET_RESISTANCE)) Wire(FtmsControl.OP_SET_RESISTANCE, FtmsControl.setTargetResistance(raw)) else null

    private fun simulation(hundredths: Int): Wire? =
        if (supports(FtmsControl.OP_SET_SIMULATION)) Wire(FtmsControl.OP_SET_SIMULATION, FtmsControl.setSimulation(hundredths)) else null

    private fun pump(nowMs: Long) {
        if (!connected || inFlight != null) return
        if (queue.isNotEmpty()) {
            sendSeq(queue.removeFirst(), nowMs)
            return
        }
        if (!hasControl) {
            if (rcRetryAt in 0..nowMs) {
                rcRetryAt = -1L
                sendSeq(FtmsControl.OP_REQUEST_CONTROL, nowMs)
            }
            return
        }
        val wanted = desired?.let { resolve(it) } ?: return
        val l = last
        if (l != null && l.same(wanted)) {
            when (lastState) {
                LastState.Sent, LastState.Acked, LastState.Rejected -> return
                LastState.FailedOnce -> if (nowMs < retryAt) return
            }
        } else {
            attempts = 0
        }
        sendTarget(wanted, nowMs)
    }

    private fun sendSeq(op: Int, nowMs: Long) {
        inFlight = Flight.Seq(op, nowMs)
        port.write(byteArrayOf(op.toByte()))
    }

    private fun sendTarget(wire: Wire, nowMs: Long) {
        last = wire
        lastState = LastState.Sent
        inFlight = Flight.Target(wire, nowMs)
        port.write(wire.bytes)
    }

    private fun seqAnswered(op: Int, result: Int?, nowMs: Long) {
        when (op) {
            FtmsControl.OP_REQUEST_CONTROL -> {
                if (result == FtmsControl.RESULT_SUCCESS) {
                    hasControl = true
                    noControl = false
                    rcRetryAt = -1L
                    if (recovery) {
                        recovery = false
                        last = null
                    } else {
                        queue.addLast(FtmsControl.OP_START_OR_RESUME)
                    }
                } else {
                    controlRefused(nowMs)
                }
            }
            FtmsControl.OP_START_OR_RESUME -> {
                // A "not supported" answer is ignored: some trainers start on their own.
                sequenceDone = true
                last = null
            }
        }
    }

    private fun controlRefused(nowMs: Long) {
        hasControl = false
        noControl = true
        recovery = false
        sequenceDone = true
        rcRetryAt = nowMs + RC_RETRY_MS
    }

    private fun targetAnswered(wire: Wire, result: Int, nowMs: Long) {
        when (result) {
            FtmsControl.RESULT_SUCCESS -> {
                lastState = LastState.Acked
                refused = false
                recoveryWire = null
            }
            FtmsControl.RESULT_NOT_PERMITTED -> {
                onControlEvent(wire.op, result)
                val tried = recoveryWire
                if (tried != null && tried.same(wire)) {
                    controlRefused(nowMs)
                } else {
                    recoveryWire = wire
                    recovery = true
                    queue.addLast(FtmsControl.OP_REQUEST_CONTROL)
                }
            }
            FtmsControl.RESULT_NOT_SUPPORTED -> {
                onControlEvent(wire.op, result)
                unsupported += wire.op
                lastState = LastState.Rejected
            }
            FtmsControl.RESULT_INVALID -> {
                onControlEvent(wire.op, result)
                refused = true
                lastState = LastState.Rejected
            }
            else -> {
                onControlEvent(wire.op, result)
                failedAttempt(nowMs)
            }
        }
    }

    /** A failure or a timeout: one resend after a second, and a second failure counts as an invalid parameter. */
    private fun failedAttempt(nowMs: Long) {
        if (attempts == 0) {
            attempts = 1
            lastState = LastState.FailedOnce
            retryAt = nowMs + RESEND_MS
        } else {
            refused = true
            lastState = LastState.Rejected
        }
    }

    companion object {
        const val TIMEOUT_MS = 3_000L
        const val RESEND_MS = 1_000L
        const val RC_RETRY_MS = 15_000L
    }
}
