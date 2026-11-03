package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.HeartRate
import com.luketmoss.thrivespin.core.HeartRateReading
import com.luketmoss.thrivespin.core.IndoorBikeData
import com.luketmoss.thrivespin.core.RideHeartRate
import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.ride.recording.RideFileState
import com.luketmoss.thrivespin.core.ride.recording.RideMeta
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.RideSink
import com.luketmoss.thrivespin.core.ride.recording.RideTrainer
import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.ride.recording.isoSeconds
import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.StepMode
import com.luketmoss.thrivespin.core.workout.TrainerMode
import com.luketmoss.thrivespin.core.workout.Zones
import java.io.IOException
import kotlin.math.floor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** What a recovered ride needs to carry on where it stopped: read from its samples and events. */
class RestoreData(
    val nextSecond: Int,
    val stepIndex: Int,
    val stepStartS: Int,
    val intensityPct: Int,
    val modeLevel: Int,
    val modeGradeTenths: Int,
    val recentPower: List<Int?>,
    val stepPowerSum: Long,
    val stepPowerCount: Int,
    val totalPowerSum: Long,
    val lastSampleEpochMs: Long,
    val startedAtMs: Long,
) {
    companion object {
        fun from(recording: RideRecording, startedAtMs: Long): RestoreData {
            val samples = recording.samples
            val last = samples.last()
            val stepStarts = recording.events.filter { it.type == "step_start" }
            val lastStart = stepStarts.lastOrNull()
            val stepIndex = lastStart?.int("step") ?: last.step
            val stepStartS = lastStart?.atS ?: 0
            val inStep = samples.filter { it.step == stepIndex && it.t >= stepStartS }
            val levelEvent = recording.events.lastOrNull { it.type == "mode_setting" && it.fields.containsKey("level") }
            val gradeEvent = recording.events.lastOrNull { it.type == "mode_setting" && it.fields.containsKey("grade") }
            return RestoreData(
                nextSecond = last.t + 1,
                stepIndex = stepIndex,
                stepStartS = stepStartS,
                intensityPct = recording.events.lastOrNull { it.type == "intensity" }?.int("pct") ?: recording.meta.session.intensityPct,
                modeLevel = levelEvent?.int("level") ?: RideEngine.START_LEVEL,
                modeGradeTenths = gradeEvent?.int("grade") ?: RideEngine.START_GRADE_TENTHS,
                recentPower = samples.takeLast(3).map { it.powerW },
                stepPowerSum = inStep.sumOf { (it.powerW ?: 0).toLong() },
                stepPowerCount = inStep.count { it.powerW != null },
                totalPowerSum = samples.sumOf { (it.powerW ?: 0).toLong() },
                lastSampleEpochMs = last.epochMs,
                startedAtMs = startedAtMs,
            )
        }
    }
}

/**
 * The ride (#768): a [RideSession] run on a clock, a trainer and some monitors, with nothing from
 * Android in it. The caller feeds it what arrives (readings, answers, taps) and calls [tick]; every
 * call first brings the ride up to `clock.monotonicMs()`, so a late tick writes every second it
 * missed and a reading is binned by the second it arrived in. Everything runs on one thread.
 */
class RideEngine(
    val session: RideSession,
    private val clock: RideClock,
    private val sink: RideSink,
    port: TrainerPort,
    private val devices: () -> DeviceState,
    private val handler: RideFinishedHandler,
    restore: RestoreData? = null,
) {
    private val steps = session.steps
    private val lastIndex = steps.lastIndex
    private val createdAtMono = clock.monotonicMs()
    private val createdAtWall = clock.wallMs()

    private val controller = TrainerController(port) { op, result -> control(op, result) }

    private var phase = RidePhase.GettingReady
    private var clockStarted = false
    private var baseMs = 0L
    private var cur = 0
    private var stepIdx = 0
    private var stepStartS = 0
    private var endConditionFired = false
    private var lowCadenceRun = 0
    private var intensity = session.intensityPct
    private var modeLevel = START_LEVEL
    private var modeGradeTenths = START_GRADE_TENTHS
    private var header: Header? = null
    private var lastSkipMs = Long.MIN_VALUE / 2
    private var pausedAtMs = 0L
    private var endReason: String? = null
    private var storageFull = false
    private var interruptedAtS: Int? = null
    private var startedAtWall = 0L

    private var trainerConnected = false
    private var lostWritten = false
    private var bluetoothOn = true
    private var permitted = true

    private var powerSum = 0L
    private var powerCount = 0
    private var cadenceSum = 0.0
    private var cadenceCount = 0
    private var lastPowerW: Int? = null
    private var lastPowerAt = -1L
    private var lastCadence: Double? = null
    private var lastCadenceAt = -1L

    private val recentPower = ArrayDeque<Int?>()
    private var stepPowerSum = 0L
    private var stepPowerCount = 0
    private var totalPowerSum = 0L
    private var sampleCount = 0

    private val readings = HashMap<String, HeartRateReading>()
    private val lastValidHr = HashMap<String, Long>()
    private var hrDecided = false
    private var hrChosen: String? = null
    private var hrChosenAt = 0L

    private class Header(val t: Int, val step: Int, val targetW: Int?, val intensityPct: Int)

    private val _state: MutableStateFlow<RideState>
    val state: StateFlow<RideState> get() = _state

    init {
        if (restore != null) {
            phase = RidePhase.Paused
            clockStarted = true
            cur = restore.nextSecond
            stepIdx = restore.stepIndex.coerceIn(0, lastIndex)
            stepStartS = restore.stepStartS
            intensity = restore.intensityPct
            modeLevel = restore.modeLevel
            modeGradeTenths = restore.modeGradeTenths
            recentPower.addAll(restore.recentPower)
            stepPowerSum = restore.stepPowerSum
            stepPowerCount = restore.stepPowerCount
            totalPowerSum = restore.totalPowerSum
            sampleCount = restore.nextSecond
            startedAtWall = restore.startedAtMs
            pausedAtMs = createdAtMono
            interruptedAtS = cur
            val stoppedAt = restore.lastSampleEpochMs + 1000
            val gap = ((createdAtWall - stoppedAt) / 1000).coerceAtLeast(0).toInt()
            safely {
                sink.event(RideEvent("interrupted", cur, stoppedAt, RideEvent.fields("gap_s" to gap)))
                sink.event(RideEvent("pause", cur, stoppedAt))
                sink.sync()
            }
        }
        _state = MutableStateFlow(snapshot(createdAtMono))
        controller.setDesired(Desired.Flat, createdAtMono)
    }

    // ---- What arrives ----

    fun tick() {
        step { }
    }

    /** The ride's own connection to the trainer is up and subscribed, and its features and ranges read. */
    fun onTrainerConnected(setup: TrainerSetup) = step { now ->
        trainerConnected = true
        controller.onConnected(setup, now)
        if (lostWritten) {
            lostWritten = false
            event("trainer_back")
        }
    }

    fun onTrainerDisconnected() = step { now ->
        if (!trainerConnected) return@step
        trainerConnected = false
        controller.onDisconnected()
        powerSum = 0
        powerCount = 0
        cadenceSum = 0.0
        cadenceCount = 0
        lastPowerW = null
        lastCadence = null
        if (clockStarted && phase != RidePhase.Finished) {
            lostWritten = true
            event("trainer_lost")
        }
    }

    fun onControlResponse(bytes: ByteArray) = step { now -> controller.onResponse(bytes, now) }

    fun onMachineStatus(bytes: ByteArray) = step { now -> controller.onStatus(bytes, now) }

    /** An Indoor Bike Data reading, arrived now. */
    fun onBikeData(data: IndoorBikeData) = step { now ->
        if (!trainerConnected) return@step
        val power = data.powerW?.coerceAtLeast(0)
        if (phase == RidePhase.GettingReady && controller.sequenceDone &&
            ((power ?: 0) > 0 || (data.cadenceRpm ?: 0.0) > 0.0)
        ) {
            startClock(now)
        }
        if (power != null) {
            lastPowerW = power
            lastPowerAt = now
        }
        if (data.cadenceRpm != null) {
            lastCadence = data.cadenceRpm
            lastCadenceAt = now
        }
        if (phase == RidePhase.Running) {
            if (power != null) {
                powerSum += power
                powerCount++
            }
            if (data.cadenceRpm != null) {
                cadenceSum += data.cadenceRpm
                cadenceCount++
            }
        }
    }

    fun onHeartRate(address: String, reading: HeartRateReading) = step { _ ->
        readings[address] = reading
        if (reading.bpm > 0 && reading.contact != false) lastValidHr[address] = reading.atMs
    }

    /** Bluetooth or its permission changed: it is off for the ride when either is missing. */
    fun onBluetooth(on: Boolean, permission: Boolean) = step { _ ->
        bluetoothOn = on
        permitted = permission
    }

    /** A write failed and the ride was ended for want of space. */
    val endedForSpace: Boolean get() = storageFull

    /** Whole seconds of ride time so far. */
    val elapsedS: Int get() = cur

    /** The trainer's connection is let go once nothing waits on it. */
    val trainerSettled: Boolean get() = controller.settled

    // ---- What the rider does ----

    fun pause() = step { now ->
        if (phase != RidePhase.Running) return@step
        phase = RidePhase.Paused
        pausedAtMs = now
        resetBins()
        header = null
        event("pause")
        safely { sink.sync() }
        applyDesired(now)
    }

    fun resume() = step { now ->
        if (phase != RidePhase.Paused) return@step
        phase = RidePhase.Running
        baseMs = now - cur * 1000L
        interruptedAtS = null
        resetBins()
        event("resume")
        captureHeader()
        applyDesired(now)
    }

    fun skipStep() = step { now ->
        if (!clockStarted || phase == RidePhase.GettingReady || phase == RidePhase.Finished) return@step
        if (stepIdx >= lastIndex) return@step
        if (now - lastSkipMs < SKIP_GUARD_MS) return@step
        lastSkipMs = now
        startStep(stepIdx + 1, "skip")
        if (phase == RidePhase.Running) captureHeader()
        applyDesired(now)
    }

    fun setIntensity(pct: Int) = step { now ->
        if (!session.intensityAdjustable || phase == RidePhase.Finished) return@step
        val next = pct.coerceIn(Maths.MIN_INTENSITY, Maths.MAX_INTENSITY)
        if (next == intensity) return@step
        intensity = next
        event("intensity", "pct" to next)
        applyDesired(now)
    }

    /** One tap of Intensity: [delta] percent, within 50 to 130. */
    fun adjustIntensity(delta: Int) = setIntensity(intensity + delta)

    fun setModeLevel(level: Int) = step { now ->
        if (session.mode != TrainerMode.Resistance || phase == RidePhase.Finished) return@step
        val next = level.coerceIn(0, 100)
        if (next == modeLevel) return@step
        modeLevel = next
        event("mode_setting", "level" to next)
        applyDesired(now)
    }

    fun setModeGradeTenths(tenths: Int) = step { now ->
        if (session.mode != TrainerMode.Slope || phase == RidePhase.Finished) return@step
        val next = tenths.coerceIn(-100, 200)
        if (next == modeGradeTenths) return@step
        modeGradeTenths = next
        event("mode_setting", "grade" to next / 10.0)
        applyDesired(now)
    }

    /** The Trainer row's − and +: level by 5, or grade by 0.5, within their limits. */
    fun adjustModeSetting(direction: Int) {
        when (session.mode) {
            TrainerMode.Resistance -> setModeLevel(modeLevel + direction * LEVEL_STEP)
            TrainerMode.Slope -> setModeGradeTenths(modeGradeTenths + direction * GRADE_STEP_TENTHS)
            TrainerMode.Erg -> Unit
        }
    }

    /** End: finishes a started ride with reason `ended`; before the clock starts it is Cancel. */
    fun end() {
        if (phase == RidePhase.Finished) return
        if (!clockStarted) cancel() else step { finish("ended") }
    }

    /** Cancel, before the clock starts: nothing was recorded. */
    fun cancel() = step { _ ->
        if (phase == RidePhase.Finished || clockStarted) return@step
        stop("cancelled")
    }

    /** Discard a started ride: the trainer is released and nothing is kept. */
    fun discard() = step { _ ->
        if (phase == RidePhase.Finished) return@step
        if (!clockStarted) {
            stop("cancelled")
            return@step
        }
        safely { sink.discard() }
        stop("discarded")
    }

    // ---- The clock ----

    private inline fun step(block: (Long) -> Unit) {
        val now = clock.monotonicMs()
        advance(now)
        block(now)
        _state.value = snapshot(now)
    }

    private fun advance(now: Long) {
        updateHeartRate(now)
        controller.tick(now)
        when (phase) {
            RidePhase.Running -> {
                val target = ((now - baseMs) / 1000).toInt()
                while (phase == RidePhase.Running && cur < target) boundary()
            }
            RidePhase.Paused -> if (now - pausedAtMs >= PAUSE_LIMIT_MS) finish("paused_too_long")
            RidePhase.GettingReady, RidePhase.Finished -> Unit
        }
    }

    private fun startClock(now: Long) {
        clockStarted = true
        phase = RidePhase.Running
        baseMs = now
        cur = 0
        startedAtWall = wallOf(now)
        val trainer = devices().trainer
        val meta = RideMeta(
            rideId = session.rideId,
            kind = session.kind,
            state = RideFileState.InProgress,
            session = session.copy(intensityPct = intensity),
            trainer = trainer?.let { RideTrainer(it.name, it.address) },
            createdAtUtc = isoSeconds(createdAtWall),
            startedAtUtc = isoSeconds(startedAtWall),
            finishedAtUtc = null,
            endReason = null,
        )
        try {
            sink.begin(meta)
        } catch (e: IOException) {
            storageFull = true
            stop("ended")
            return
        }
        startStep(0, "start")
        captureHeader()
        applyDesired(now)
    }

    /** Second [cur] is over: record it, then begin the next. */
    private fun boundary() {
        finalizeSecond(baseMs + (cur + 1) * 1000L)
        if (phase != RidePhase.Running) return
        cur++
        beginSecond()
    }

    private fun beginSecond() {
        if (cur >= LIMIT_S) {
            finish("limit")
            return
        }
        val step = steps[stepIdx]
        val reason = when {
            endConditionFired -> "end_condition"
            step.durS != null && cur - stepStartS >= step.durS -> "time"
            else -> null
        }
        if (reason != null) {
            if (stepIdx == lastIndex) {
                finish("completed")
                return
            }
            startStep(stepIdx + 1, reason)
        }
        captureHeader()
        applyDesired(clock.monotonicMs())
    }

    private fun startStep(index: Int, reason: String) {
        stepIdx = index
        stepStartS = cur
        endConditionFired = false
        lowCadenceRun = 0
        stepPowerSum = 0
        stepPowerCount = 0
        controller.stepChanged()
        val step = steps[index]
        val mode = when (step.target) {
            is StepTarget.Level -> StepMode.Resistance
            is StepTarget.Grade -> StepMode.Slope
            StepTarget.Free -> StepMode.Free
            else -> StepMode.Erg
        }
        event("step_start", "step" to index, "label" to step.label, "mode" to mode.wire, "reason" to reason)
    }

    private fun captureHeader() {
        val step = steps[stepIdx]
        header = Header(cur, stepIdx, Targets.ergWatts(step, cur - stepStartS, session.ftpW, intensity), intensity)
    }

    private fun finalizeSecond(endMs: Long) {
        val h = header ?: return
        val connected = trainerConnected
        val power = if (!connected) null else binned(powerSum, powerCount, lastPowerW, lastPowerAt, endMs)
        val cadence = if (!connected) null else binnedCadence(endMs)
        val hr = hrChosen?.let { readings[it] }?.takeIf { HeartRate.hasReading(it, endMs) }?.bpm
        val sample = Sample(
            t = h.t,
            epochMs = wallOf(baseMs + h.t * 1000L),
            step = h.step,
            powerW = power,
            targetW = h.targetW,
            cadenceRpm = cadence,
            hrBpm = hr,
            intensityPct = h.intensityPct,
            trainer = connected,
        )
        resetBins()
        if (!write { sink.sample(sample) }) return
        sampleCount++
        recentPower.addLast(power)
        while (recentPower.size > 3) recentPower.removeFirst()
        if (power != null) {
            stepPowerSum += power
            stepPowerCount++
            totalPowerSum += power
        }
        val condition = steps[stepIdx].endWhen
        if (condition is EndCondition.CadenceBelow) {
            lowCadenceRun = if (cadence != null && cadence < condition.rpm) lowCadenceRun + 1 else 0
            if (lowCadenceRun >= condition.forS) endConditionFired = true
        }
        if (sample.t % SYNC_EVERY_S == SYNC_EVERY_S - 1) safely { sink.sync() }
    }

    private fun binned(sum: Long, count: Int, last: Int?, lastAt: Long, endMs: Long): Int? = when {
        count > 0 -> ((sum * 2 + count) / (2L * count)).toInt()
        last != null && endMs - lastAt < STALE_MS -> last
        else -> null
    }

    private fun binnedCadence(endMs: Long): Int? = when {
        cadenceCount > 0 -> Maths.roundHalfUp(cadenceSum / cadenceCount)
        lastCadence != null && endMs - lastCadenceAt < STALE_MS -> Maths.roundHalfUp(lastCadence!!)
        else -> null
    }

    private fun resetBins() {
        powerSum = 0
        powerCount = 0
        cadenceSum = 0.0
        cadenceCount = 0
    }

    // ---- What the trainer is told ----

    private fun applyDesired(now: Long) {
        controller.setDesired(desiredNow(), now)
    }

    private fun desiredNow(): Desired {
        if (phase != RidePhase.Running) return Desired.Flat
        val step = steps[stepIdx]
        val second = cur - stepStartS
        return when (val t = step.target) {
            is StepTarget.Level -> Desired.Resistance(t.level)
            is StepTarget.Grade -> Desired.Grade(RideSessions.gradeHundredths(t.grade))
            StepTarget.Free -> Desired.Flat
            is StepTarget.PctOfFtp, is StepTarget.Watts, is StepTarget.WattsStairs ->
                when (session.mode) {
                    TrainerMode.Erg -> Desired.Power(Targets.ergWatts(step, second, session.ftpW, intensity) ?: 0)
                    TrainerMode.Resistance -> Desired.Resistance(modeLevel)
                    TrainerMode.Slope -> Desired.Grade(modeGradeTenths * 10)
                }
        }
    }

    private fun control(op: Int, result: Int) {
        event("control", "op" to op, "result" to result)
    }

    // ---- Heart rate ----

    private fun updateHeartRate(now: Long) {
        val state = devices()
        if (state.monitors.isEmpty()) {
            hrChosen = null
            return
        }
        fun reads(address: String) = HeartRate.hasReading(readings[address], now)
        val found = state.monitors.map { it.address }.filter { reads(it) }.toSet()
        val chosen = hrChosen
        if (chosen == null) {
            if (!hrDecided) {
                val pickedReads = state.picked?.let { reads(it) } == true
                if (pickedReads || now - createdAtMono >= HR_DECIDE_MS) {
                    hrDecided = true
                    hrChosen = RideHeartRate.choose(state, found)
                    hrChosenAt = now
                }
            } else {
                hrChosen = RideHeartRate.choose(state, found)
                hrChosenAt = now
            }
            return
        }
        if (reads(chosen)) return
        val quietSince = maxOf(lastValidHr[chosen] ?: hrChosenAt, hrChosenAt)
        if (now - quietSince < HR_LOST_MS) return
        val next = RideHeartRate.choose(state, found - chosen)
        if (next != null && next != chosen) {
            hrChosen = next
            hrChosenAt = now
            val saved = state.monitors.firstOrNull { it.address == next }
            event("hr_source", "address" to next, "name" to saved?.name)
        }
    }

    // ---- Ending ----

    private fun finish(reason: String) {
        if (phase == RidePhase.Finished) return
        val recorded = clockStarted && sampleCount > 0
        if (!recorded) {
            safely { sink.discard() }
            stop(if (clockStarted) "cancelled" else reason)
            return
        }
        event("end", "reason" to reason)
        safely { sink.finish(reason, wallOf(clock.monotonicMs())) }
        stop(reason)
        handler.onFinished(session.rideId)
    }

    /** Releases the trainer on the flat road and marks the ride over. */
    private fun stop(reason: String) {
        phase = RidePhase.Finished
        endReason = reason
        header = null
        controller.setDesired(Desired.Flat, clock.monotonicMs())
    }

    // ---- Writing ----

    private fun wallOf(mono: Long): Long = clock.wallMs() - clock.monotonicMs() + mono

    private fun event(type: String, vararg fields: Pair<String, Any?>) {
        if (!clockStarted) return
        safely { sink.event(RideEvent(type, cur, clock.wallMs(), RideEvent.fields(*fields))) }
    }

    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (e: IOException) {
            if (!storageFull) storageFull = true
        }
    }

    /** A write that failed ends the ride at the last sample written. */
    private inline fun write(block: () -> Unit): Boolean {
        try {
            block()
            return true
        } catch (e: IOException) {
            storageFull = true
            finish("ended")
            return false
        }
    }

    // ---- What the screen shows ----

    private fun snapshot(now: Long): RideState {
        val step = steps[stepIdx]
        val second = (cur - stepStartS).coerceAtLeast(0)
        val running = phase == RidePhase.Running || phase == RidePhase.Paused
        val ergStep = step.target.isErg
        // The first step's target is on screen while getting ready, as it will be at second 0.
        val showsTarget = phase != RidePhase.Finished
        val targetW = if (showsTarget) Targets.ergWatts(step, second, session.ftpW, intensity) else null
        val scaled = if (showsTarget) Targets.scaledPct(step, second, intensity) else null
        val devicesNow = devices()
        val trainerName = devicesNow.trainer?.name ?: "Trainer"
        val power3 = recentPower.filterNotNull().let { list ->
            if (list.isEmpty()) null else Maths.roundHalfUp(list.sum().toDouble() / list.size)
        }
        val left = step.durS?.let { (it - second).coerceAtLeast(0) }
        val later = steps.drop(stepIdx + 1)
        val total = if (left != null && later.all { it.durS != null }) cur + left + later.sumOf { it.durS ?: 0 } else null
        val planned = steps.take(stepIdx).sumOf { it.durS ?: 0 } + second
        val nextStep = steps.getOrNull(stepIdx + 1)
        val notice = controller.notice
        val applying = controller.applying
        val modeNotErg = session.mode != TrainerMode.Erg
        val banner: RideBanner? = when {
            interruptedAtS != null -> RideBanner.Interrupted(interruptedAtS!!)
            clockStarted && phase != RidePhase.Finished && !bluetoothOn -> RideBanner.BluetoothOff
            clockStarted && phase != RidePhase.Finished && !trainerConnected -> RideBanner.TrainerLost
            notice == ControlNotice.NoControl -> RideBanner.NoControl
            notice == ControlNotice.PowerUnsupported -> RideBanner.PowerUnsupported
            notice == ControlNotice.ResistanceUnsupported -> RideBanner.ResistanceUnsupported
            notice == ControlNotice.SimulationUnsupported -> RideBanner.SlopeUnsupported
            notice == ControlNotice.Refused -> RideBanner.Refused
            else -> null
        }
        val pill: TrainerPill = when {
            !trainerConnected -> if (clockStarted) TrainerPill.Reconnecting else TrainerPill.Connecting
            !applying -> TrainerPill.Guide
            phase != RidePhase.Running -> TrainerPill.Free
            else -> when (val t = step.target) {
                is StepTarget.Level -> TrainerPill.Level(t.level)
                is StepTarget.Grade -> TrainerPill.Slope(SpinGrade.tenths(t.grade))
                StepTarget.Free -> TrainerPill.Free
                else -> when (session.mode) {
                    TrainerMode.Erg -> TrainerPill.Erg
                    TrainerMode.Resistance -> TrainerPill.Level(modeLevel)
                    TrainerMode.Slope -> TrainerPill.Slope(modeGradeTenths)
                }
            }
        }
        val hrAddress = hrChosen
        val hrStatus = when {
            devicesNow.monitors.isEmpty() -> HrStatus.None
            !hrDecided -> HrStatus.Connecting
            hrAddress == null -> HrStatus.None
            HeartRate.hasReading(readings[hrAddress], now) -> HrStatus.Reading
            else -> HrStatus.NoReading
        }
        val hrReading = hrAddress?.let { readings[it] }?.takeIf { HeartRate.hasReading(it, now) }
        val target: TargetView = when (val t = step.target) {
            is StepTarget.Level -> TargetView.Level(t.level)
            is StepTarget.Grade -> TargetView.Grade(SpinGrade.tenths(t.grade))
            StepTarget.Free -> TargetView.Free
            else -> TargetView.Erg(targetW ?: 0, scaled?.let { Maths.roundHalfUp(it) })
        }
        val ready = if (phase == RidePhase.GettingReady) {
            when {
                !permitted -> ReadyStatus.PermissionMissing
                !bluetoothOn -> ReadyStatus.BluetoothOff
                trainerConnected && controller.sequenceDone -> ReadyStatus.PedalToStart
                now - createdAtMono >= CANT_FIND_MS -> ReadyStatus.CantFind
                else -> ReadyStatus.Connecting
            }
        } else {
            null
        }
        return RideState(
            rideId = session.rideId,
            name = session.name,
            phase = phase,
            ready = ready,
            stepIndex = stepIdx,
            stepCount = steps.size,
            stepLabel = step.label,
            stepPosition = step.position,
            stepSecond = second,
            stepDurS = step.durS,
            stepLeftS = left,
            rideS = cur,
            totalS = total,
            plannedS = planned,
            target = target,
            targetW = targetW,
            zone = scaled?.let { Zones.forPct(it) },
            power3sW = power3,
            band = Targets.band(targetW, power3),
            cadenceRpm = if (trainerConnected && lastCadenceAt >= 0 && now - lastCadenceAt < STALE_MS) lastCadence?.let { Maths.roundHalfUp(it) } else null,
            cadenceTarget = step.cadenceRpm,
            heartRate = hrReading?.bpm,
            hrStatus = hrStatus,
            hrName = hrAddress?.let { a -> devicesNow.monitors.firstOrNull { it.address == a }?.name },
            stepAvgW = if (stepPowerCount > 0) Maths.roundHalfUp(stepPowerSum.toDouble() / stepPowerCount) else null,
            totalKj = floor(totalPowerSum / 1000.0).toInt(),
            intensityPct = intensity,
            intensityAdjustable = session.intensityAdjustable,
            canEasier = intensity > Maths.MIN_INTENSITY,
            canHarder = intensity < Maths.MAX_INTENSITY,
            mode = session.mode,
            modeLevel = modeLevel,
            modeGradeTenths = modeGradeTenths,
            showTrainerRow = modeNotErg && ergStep,
            targetIsGuide = ergStep && (modeNotErg || (trainerConnected && !applying)),
            trainerName = trainerName,
            trainerConnected = trainerConnected,
            pill = pill,
            banner = banner,
            canPause = phase == RidePhase.Running,
            canResume = phase == RidePhase.Paused,
            canSkip = (phase == RidePhase.Running || phase == RidePhase.Paused) && stepIdx < lastIndex,
            next = nextStep?.let { NextView(it.label, it.durS, Targets.text(it, 0, session.ftpW, intensity)) },
            endReason = endReason,
            storageFull = storageFull,
        )
    }

    companion object {
        const val START_LEVEL = 30
        const val START_GRADE_TENTHS = 20
        const val LEVEL_STEP = 5
        const val GRADE_STEP_TENTHS = 5
        const val LIMIT_S = 43_200
        const val SKIP_GUARD_MS = 1_000L
        const val PAUSE_LIMIT_MS = 3_600_000L
        const val STALE_MS = 3_000L
        const val SYNC_EVERY_S = 10
        const val HR_DECIDE_MS = 15_000L
        const val HR_LOST_MS = 30_000L
        const val CANT_FIND_MS = 20_000L
    }
}
