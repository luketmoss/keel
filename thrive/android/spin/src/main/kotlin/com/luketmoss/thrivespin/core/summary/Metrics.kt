package com.luketmoss.thrivespin.core.summary

import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.workout.Maths
import kotlin.math.pow
import kotlin.math.roundToLong

/** One paused stretch: where in ride time it began and how long it lasted. */
data class RidePause(val atS: Int, val durationS: Int)

/** One ride step as ridden: the seconds [startS] until [endS] (end-exclusive), from the `step_start` events. */
data class RideSpan(
    /** The step's index in the session. */
    val step: Int,
    val startS: Int,
    val endS: Int,
    val label: String,
    val mode: String,
    /** Why this step began: `start`, `time`, `skip` or `end_condition`. */
    val startReason: String,
) {
    val seconds: Int get() = endS - startS
}

enum class Band(val word: String) {
    OnTarget("On target"),
    Below("Below target"),
    Above("Above target"),
    TooShort("Too short"),
}

/** A row of the Intervals card. [percent] is null when [band] is [Band.TooShort]. */
data class IntervalRow(
    val name: String,
    val targetLowW: Int,
    val targetHighW: Int,
    val targetMeanW: Int,
    val avgW: Int?,
    val percent: Int?,
    val band: Band,
) {
    /** "225" for a flat target, "low-high" for a ramp or stairs. */
    val targetText: String
        get() = if (targetLowW == targetHighW) "$targetLowW" else "$targetLowW–$targetHighW"
}

/** Everything the summary, the FIT file, the streams file and the payload read, worked out once from a recording. */
data class RideSummary(
    val rideId: String,
    val name: String,
    val workoutId: String,
    val startedAtUtc: String,
    val endReason: String,
    val sampleCount: Int,
    val movingS: Int,
    val elapsedS: Int,
    val pausedS: Int,
    val avgPowerW: Int?,
    val maxPowerW: Int?,
    val npW: Int?,
    val ftpW: Int?,
    /** NP / FTP, to two decimals. Null with no FTP or no power. */
    val intensityFactor: Double?,
    val tss: Int?,
    val workKj: Int?,
    /** The exact joules, for the FIT's total work. */
    val workJ: Long,
    val avgHr: Int?,
    val maxHr: Int?,
    val avgCadence: Int?,
    val intensityPct: Int,
    val pauses: List<RidePause>,
    val spans: List<RideSpan>,
    val intervals: List<IntervalRow>,
) {
    val hasPower: Boolean get() = avgPowerW != null
}

object RideMetrics {
    const val NP_WINDOW = 30
    const val NP_MIN_READINGS = 15
    const val MIN_COMPLIANCE_SECONDS = 10
    const val MIN_FTP = 50
    const val MAX_FTP = 1000
    const val LABEL_MAX = 40

    fun validFtp(ftpW: Int?): Int? = ftpW?.takeIf { it in MIN_FTP..MAX_FTP }

    /** The mean of [values], rounded half up; null when there are none. */
    private fun meanRounded(values: List<Int>): Int? =
        if (values.isEmpty()) null else Maths.roundHalfUp(values.sumOf { it.toLong() }.toDouble() / values.size)

    /** The mean of the non-null readings, unrounded. */
    fun meanPower(samples: List<Sample>): Double? {
        var sum = 0L
        var n = 0
        for (s in samples) {
            val p = s.powerW ?: continue
            sum += p
            n++
        }
        return if (n == 0) null else sum.toDouble() / n
    }

    /**
     * Normalized power, unrounded: the fourth root of the mean of the fourth powers of the 30 s rolling
     * means (kept only with at least 15 readings in the window). With no kept window, the average power.
     */
    fun normalizedPower(samples: List<Sample>): Double? {
        val average = meanPower(samples) ?: return null
        val n = samples.size
        if (n < NP_WINDOW) return average
        val sums = LongArray(n + 1)
        val counts = IntArray(n + 1)
        for (i in 0 until n) {
            val p = samples[i].powerW
            sums[i + 1] = sums[i] + (p ?: 0)
            counts[i + 1] = counts[i] + if (p == null) 0 else 1
        }
        var total = 0.0
        var kept = 0
        for (t in NP_WINDOW - 1 until n) {
            val from = t - NP_WINDOW + 1
            val count = counts[t + 1] - counts[from]
            if (count < NP_MIN_READINGS) continue
            val mean = (sums[t + 1] - sums[from]).toDouble() / count
            total += mean.pow(4)
            kept++
        }
        if (kept == 0) return average
        return (total / kept).pow(0.25)
    }

    /** Pauses from `pause`/`resume` pairs in order; one that rounds under a second, and a trailing `pause`, are dropped. */
    fun pauses(events: List<RideEvent>): List<RidePause> {
        val out = ArrayList<RidePause>()
        var open: RideEvent? = null
        for (e in events) {
            when (e.type) {
                "pause" -> if (open == null) open = e
                "resume" -> {
                    val p = open ?: continue
                    open = null
                    val d = Maths.roundHalfUp((e.epochMs - p.epochMs) / 1000.0)
                    if (d >= 1) out += RidePause(p.atS, d)
                }
            }
        }
        return out
    }

    /** The ride's steps from the `step_start` events, each ending where the next starts and the last at [n]; zero-length ones are dropped. */
    fun spans(events: List<RideEvent>, n: Int, firstLabel: String): List<RideSpan> {
        val starts = events.filter { it.type == "step_start" }.sortedBy { it.atS }
        if (starts.isEmpty()) return if (n > 0) listOf(RideSpan(0, 0, n, firstLabel.take(LABEL_MAX), "erg", "start")) else emptyList()
        val out = ArrayList<RideSpan>()
        for ((i, e) in starts.withIndex()) {
            val start = e.atS.coerceIn(0, n)
            val end = if (i + 1 < starts.size) starts[i + 1].atS.coerceIn(0, n) else n
            if (end <= start) continue
            out += RideSpan(
                step = e.int("step") ?: i,
                startS = start,
                endS = end,
                label = (e.text("label") ?: "").take(LABEL_MAX),
                mode = e.text("mode") ?: "erg",
                startReason = e.text("reason") ?: "start",
            )
        }
        return out
    }

    /** The band for a rounded percent of target. */
    fun band(percent: Int): Band = when {
        percent < 95 -> Band.Below
        percent > 105 -> Band.Above
        else -> Band.OnTarget
    }

    /** One row for each span with an erg target, in ride order. */
    fun intervals(recording: RideRecording, spans: List<RideSpan>): List<IntervalRow> {
        val samples = recording.samples
        val steps = recording.meta.session.steps
        val rows = ArrayList<IntervalRow>()
        for (span in spans) {
            val slice = samples.subList(span.startS.coerceAtMost(samples.size), span.endS.coerceAtMost(samples.size))
            val targets = slice.mapNotNull { it.targetW }
            if (targets.isEmpty()) continue
            val targetMean = targets.sumOf { it.toLong() }.toDouble() / targets.size
            val both = slice.filter { it.powerW != null && it.targetW != null }
            val position = steps.getOrNull(span.step)?.position
            val name = if (position != null) "${span.label} · $position" else span.label
            val targetRounded = Maths.roundHalfUp(targetMean)
            val tooShort = both.size < MIN_COMPLIANCE_SECONDS || targetMean <= 0.0
            val avg = if (both.isEmpty()) null else Maths.roundHalfUp(both.sumOf { it.powerW!!.toLong() }.toDouble() / both.size)
            if (tooShort) {
                rows += IntervalRow(name, targets.min(), targets.max(), targetRounded, avg, null, Band.TooShort)
            } else {
                val percent = Maths.roundHalfUp(both.sumOf { it.powerW!!.toLong() }.toDouble() / both.size / targetMean * 100)
                rows += IntervalRow(name, targets.min(), targets.max(), targetRounded, avg, percent, band(percent))
            }
        }
        return rows
    }

    /**
     * The ride's figures. [ftpW] is what the ride is scored against (#770's hook); without a valid one the
     * recording's own `session.ftpW` is used, and without that IF and TSS are blank.
     */
    fun summarize(recording: RideRecording, ftpW: Int? = null): RideSummary {
        val meta = recording.meta
        val samples = recording.samples
        val n = samples.size
        val ftp = validFtp(ftpW) ?: validFtp(meta.session.ftpW)
        val pauses = pauses(recording.events)
        val pausedS = pauses.sumOf { it.durationS }
        val powers = samples.mapNotNull { it.powerW }
        val average = meanPower(samples)
        val np = normalizedPower(samples)
        val factor = if (np != null && ftp != null) np / ftp else null
        val tss = if (np != null && ftp != null && factor != null) {
            Maths.roundHalfUp(n * np * factor / (ftp * 3600.0) * 100)
        } else {
            null
        }
        val hrs = samples.mapNotNull { it.hrBpm }
        val cadences = samples.mapNotNull { it.cadenceRpm }.filter { it > 0 }
        val spans = spans(recording.events, n, meta.session.steps.firstOrNull()?.label ?: meta.session.name)
        val workJ = powers.sumOf { it.toLong() }
        return RideSummary(
            rideId = meta.rideId,
            name = meta.session.name,
            workoutId = meta.session.workoutId.orEmpty(),
            startedAtUtc = meta.startedAtUtc.orEmpty(),
            endReason = meta.endReason.orEmpty(),
            sampleCount = n,
            movingS = n,
            elapsedS = n + pausedS,
            pausedS = pausedS,
            avgPowerW = average?.let { Maths.roundHalfUp(it) },
            maxPowerW = powers.maxOrNull(),
            npW = np?.let { Maths.roundHalfUp(it) },
            ftpW = ftp,
            intensityFactor = factor?.let { (it * 100).roundToLong() / 100.0 },
            tss = tss,
            workKj = if (powers.isEmpty()) null else Maths.roundHalfUp(workJ / 1000.0),
            workJ = workJ,
            avgHr = meanRounded(hrs),
            maxHr = hrs.maxOrNull(),
            avgCadence = meanRounded(cadences),
            intensityPct = if (n == 0) meta.session.intensityPct else Maths.roundHalfUp(samples.sumOf { it.intensityPct.toLong() }.toDouble() / n),
            pauses = pauses,
            spans = spans,
            intervals = intervals(recording, spans),
        )
    }
}
