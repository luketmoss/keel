package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.DeviceKind
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.HeartRateReading
import com.luketmoss.thrivespin.core.IndoorBikeData
import com.luketmoss.thrivespin.core.SavedDevice
import com.luketmoss.thrivespin.core.ble.TargetSupport
import com.luketmoss.thrivespin.core.ble.ValueRange
import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.ride.recording.RideMeta
import com.luketmoss.thrivespin.core.ride.recording.RideSink
import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.workout.TrainerMode

class FakeClock(var mono: Long = 10_000L, var wall: Long = 1_794_063_731_000L) : RideClock {
    override fun monotonicMs() = mono

    override fun wallMs() = wall

    fun advance(ms: Long) {
        mono += ms
        wall += ms
    }
}

/** The trainer's Control Point as the engine sees it: every write, in order, as hex. */
class FakeTrainer : TrainerPort {
    val writes = mutableListOf<ByteArray>()
    val log = mutableListOf<String>()
    var answered = 0

    override fun write(bytes: ByteArray) {
        writes += bytes
        log += hex(bytes)
    }

    fun subscribed() {
        log += "subscribe"
    }

    fun hexes(): List<String> = writes.map { hex(it) }

    companion object {
        fun hex(bytes: ByteArray) = bytes.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }
    }
}

class MemorySink(private val delegate: RideSink? = null) : RideSink {
    var meta: RideMeta? = null
    val samples = mutableListOf<Sample>()
    val events = mutableListOf<RideEvent>()
    var finishedReason: String? = null
    var discarded = false
    var syncs = 0
    var failWrites = false

    override fun begin(meta: RideMeta) {
        this.meta = meta
        delegate?.begin(meta)
    }

    override fun sample(sample: Sample) {
        if (failWrites) throw java.io.IOException("No space left on device")
        samples += sample
        delegate?.sample(sample)
    }

    override fun event(event: RideEvent) {
        events += event
        delegate?.event(event)
    }

    override fun sync() {
        syncs++
        delegate?.sync()
    }

    override fun finish(reason: String, finishedAtMs: Long) {
        finishedReason = reason
        delegate?.finish(reason, finishedAtMs)
    }

    override fun discard() {
        discarded = true
        delegate?.discard()
    }

    fun events(type: String) = events.filter { it.type == type }
}

class CountingHandler : RideFinishedHandler {
    val ids = mutableListOf<String>()

    override fun onFinished(rideId: String) {
        ids += rideId
    }
}

val TRAINER = SavedDevice("AA:BB:CC:00:00:01", "KICKR CORE 1A2B", DeviceKind.Trainer)
val STRAP_A = SavedDevice("AA:BB:CC:00:00:0A", "HRM-Pro", DeviceKind.HeartRate)
val STRAP_B = SavedDevice("AA:BB:CC:00:00:0B", "Polar H10", DeviceKind.HeartRate)

fun pct(
    label: String = "Sweet spot",
    start: Int = 90,
    durS: Int? = 600,
    end: Int = start,
    cadence: Int? = null,
    endWhen: EndCondition? = null,
    position: String? = null,
) = RideStep(label, position, durS, StepTarget.PctOfFtp(start, end), cadence, endWhen)

fun step(label: String, target: StepTarget, durS: Int? = 60, endWhen: EndCondition? = null) =
    RideStep(label, null, durS, target, null, endWhen)

fun session(
    vararg steps: RideStep,
    ftp: Int? = 250,
    mode: TrainerMode = TrainerMode.Erg,
    intensity: Int = 100,
    adjustable: Boolean = true,
    kind: RideKind = RideKind.Workout,
) = RideSession("ride-1", kind, "Test ride", "rw_1", ftp, mode, intensity, adjustable, steps.toList())

/** A ride's whole world on fake clocks: the engine, a trainer that logs what it is sent, and a sink in memory. */
class Rig(
    val session: RideSession,
    var devices: DeviceState = DeviceState(trainer = TRAINER),
    val sink: MemorySink = MemorySink(),
    restore: RestoreData? = null,
    val clock: FakeClock = FakeClock(),
) {
    val trainer = FakeTrainer()
    val handler = CountingHandler()
    val engine = RideEngine(session, clock, sink, trainer, { devices }, handler, restore)

    val state: RideState get() = engine.state.value

    fun connect(
        support: TargetSupport? = TargetSupport.ALL,
        power: ValueRange? = ValueRange(0, 2000, 1),
        resistance: ValueRange? = ValueRange(0, 100, 1),
    ) {
        trainer.subscribed()
        engine.onTrainerConnected(TrainerSetup(support, power, resistance))
    }

    /** Answers one write with [result]. */
    fun answer(op: Int, result: Int = 1) {
        trainer.answered = trainer.writes.size
        engine.onControlResponse(byteArrayOf(0x80.toByte(), op.toByte(), result.toByte()))
    }

    /** Answers every outstanding write with success, and the writes those answers cause. */
    fun answerAll() {
        while (trainer.answered < trainer.writes.size) {
            val w = trainer.writes[trainer.answered++]
            engine.onControlResponse(byteArrayOf(0x80.toByte(), w[0], 1))
        }
    }

    /** Connected, and the sequence answered: "Pedal to start". */
    fun ready() {
        connect()
        answerAll()
    }

    fun pedal(power: Int? = 150, cadence: Double? = 90.0) {
        engine.onBikeData(IndoorBikeData(speedKmh = null, cadenceRpm = cadence, powerW = power))
    }

    /** Ready, then the first pedal stroke: the clock starts. */
    fun start(power: Int = 150) {
        ready()
        pedal(power)
        answerAll()
    }

    /** One ride-second with a reading in the middle of it, then the tick that ends it. */
    fun second(power: Int? = 150, cadence: Double? = 90.0) {
        clock.advance(500)
        pedal(power, cadence)
        clock.advance(500)
        engine.tick()
        answerAll()
    }

    fun seconds(n: Int, power: Int? = 150, cadence: Double? = 90.0) = repeat(n) { second(power, cadence) }

    fun idle(ms: Long) {
        clock.advance(ms)
        engine.tick()
    }

    fun heartRate(address: String, bpm: Int = 140, contact: Boolean? = null) {
        engine.onHeartRate(address, HeartRateReading(bpm, contact, clock.monotonicMs()))
    }
}
