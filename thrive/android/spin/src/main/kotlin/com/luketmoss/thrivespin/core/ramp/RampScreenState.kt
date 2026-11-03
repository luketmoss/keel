package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.ftp.FtpDates
import com.luketmoss.thrivespin.core.ftp.FtpNow
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RideState
import com.luketmoss.thrivespin.core.ride.RideText
import com.luketmoss.thrivespin.core.ride.RideTime

enum class RampPhase { Ready, Warmup, Ramp, TestOver, Interrupted }

enum class StairKind { Done, Current, Upcoming }

/** One bar of the stairs card: [fraction] is its height over the tallest bar shown. */
data class StairBar(val watts: Int, val kind: StairKind, val fraction: Float)

/** What the pinned button does. */
enum class RampButton { StartRamp, Done, SeeResult, DiscardTest }

/**
 * The ramp screen's state model (#770): every word and every state of it, from the engine's [RideState], so
 * the JVM tests pin the copy and the screen only draws. The tiles, the target and power cards and the
 * banner are #768's and read [RideState] directly.
 */
data class RampView(
    val phase: RampPhase,
    /** "Warm-up", "Step 7", "Test over", "Interrupted". */
    val title: String,
    /** "2:48 in", "on the ramp 6:42"; none in the other phases. */
    val right: String?,
    /** The step card's big text: the warm-up's countdown, the ramp's target, the test's result line. */
    val big: String?,
    /** Under or beside [big]: "left in warm-up", "W". */
    val bigCaption: String?,
    /** Lines under the figure, in order. */
    val lines: List<String>,
    /** The progress bar, 0 to 1. */
    val progress: Float,
    /** The status line before the clock starts; null once it has. */
    val ready: String?,
    /** The hint above the button. */
    val hint: String?,
    val button: RampButton?,
    val buttonLabel: String?,
    val buttonEnabled: Boolean,
    /** "Stop cool-down" under the button; only in the cool-down. */
    val stopCooldown: Boolean,
    /** "End" or "Cancel" in the top row; the ramp has neither (the tap is how the test stops). */
    val endLabel: String?,
    val cadenceWarn: Boolean,
    val stairs: List<StairBar>,
    val stairsDescription: String?,
    /** "238 W → FTP about 179 W", or "—". Ramp only. */
    val bestValue: String?,
    /** "after the first full minute" until there is a best minute. */
    val bestHint: String?,
    /** What a screen reader hears when the step changes, polite. */
    val announcement: String,
    /** The "Back keeps the ride going" snackbar's words. */
    val backMessage: String,
)

object RampText {
    const val WARMUP_HINT = "Warm up at an easy pace. After this the power rises 20 W every minute."
    const val RAMP_HINT =
        "Every minute adds 20 W. Ride until you can't hold the target. The test ends when you tap below, " +
            "or when your cadence stays under 60 rpm for 5 seconds."
    const val START_RAMP = "Start the ramp"
    const val IM_DONE = "I'm done"
    const val SEE_RESULT = "See your result"
    const val STOP_COOLDOWN = "Stop cool-down"
    const val DISCARD_TEST = "Discard test"
    const val KEEP_UP = "rpm · keep it up"
    const val BEST_HINT = "after the first full minute"
    const val STOP_TITLE = "Stop the test?"
    const val STOP_BODY = "You haven't started the ramp yet. Nothing from this test is saved."
    const val STOP_TEST = "Stop test"
    const val KEEP_RIDING = "Keep riding"
    const val BACK_WARMUP = "The test keeps going. Use End to stop."
    const val BACK_RAMP = "The test keeps going."

    const val INTRO_TITLE = "Ramp test"
    const val INTRO_BODY =
        "A ramp test measures your FTP. You ride 5 minutes easy, then the power rises 20 W every minute, " +
            "starting at 100 W, until you can't keep it up."
    const val HOW_IT_WORKS = "How it works"
    val INTRO_BULLETS = listOf(
        "The test ends when you tap \"I'm done\", or when your cadence stays under 60 rpm for 5 seconds.",
        "Your FTP is 75% of your best minute.",
        "A 10-minute cool-down follows. You can stop it early.",
    )
    const val INTRO_NOTE = "Nothing is saved to your FTP until you confirm it on the result screen."
    const val START_TEST = "Start test"

    /** "Your FTP is 250 W, set 12 Oct." or "You have no FTP yet." */
    fun introLine(now: FtpNow?, thisYear: Int): String {
        if (now == null) return "You have no FTP yet."
        val date = FtpDates.short(now.date, thisYear)
        return "Your FTP is ${now.ftpW} W" + if (date.isEmpty()) "." else ", set $date."
    }

    fun reason(end: RampEnd): String = when (end) {
        RampEnd.Tap -> "You ended the test."
        RampEnd.Cadence -> "Your cadence stayed under 60 rpm."
        RampEnd.Closed -> "The app was closed during the test."
        RampEnd.Stopped -> "The test stopped early."
    }

    fun lasted(seconds: Int): String = "You lasted ${RideTime.clock(seconds)}"

    fun cooldown(leftS: Int): String = "Cool-down: ${RideTime.clock(leftS)} left at ${RampTest.COOLDOWN_W} W."

    fun interrupted(atS: Int): String = "The test was interrupted at ${RideTime.clock(atS)} when the app was closed."

    fun best(best: BestMinute?): String =
        if (best == null) "—" else "${best.watts} W → FTP about ${best.ftpW} W"

    fun stairsDescription(minute: Int, watts: Int): String =
        "Ramp steps. You are on step ${minute + 1} of the ramp, $watts watts."

    fun announce(label: String, watts: Int): String = "$label, $watts watts"
}

object RampScreenStates {
    /** The last 13 steps (the current one included) and the next 2. */
    const val BARS_BEHIND = 12
    const val BARS_AHEAD = 2

    /**
     * @param outcome the frozen result, once the ramp has ended and `ramp.json` holds it.
     * @param best the best minute so far, from the ramp's samples (the screen reads them each second).
     * @param tapped the screen saw the rider tap "I'm done", used to word the reason only until the result is frozen.
     */
    fun of(state: RideState, outcome: RampOutcome?, best: BestMinute?, tapped: Boolean): RampView {
        val base = RampView(
            phase = RampPhase.Ready,
            title = "Warm-up",
            right = null,
            big = null,
            bigCaption = null,
            lines = emptyList(),
            progress = 0f,
            ready = null,
            hint = null,
            button = null,
            buttonLabel = null,
            buttonEnabled = false,
            stopCooldown = false,
            endLabel = "End",
            cadenceWarn = state.cadenceRpm?.let { it < RampTest.CADENCE_WARN_RPM } == true,
            stairs = emptyList(),
            stairsDescription = null,
            bestValue = null,
            bestHint = null,
            announcement = "",
            backMessage = RampText.BACK_WARMUP,
        )
        if (state.phase == RidePhase.GettingReady) {
            return base.copy(
                phase = RampPhase.Ready,
                big = RideTime.clock(RampTest.WARMUP_S),
                bigCaption = "left in warm-up",
                ready = state.ready?.let { RideText.ready(it, state.trainerName) }.orEmpty(),
                endLabel = "Cancel",
                announcement = RampText.announce("Warm-up", RampTest.WARMUP_W),
            )
        }
        if (state.phase == RidePhase.Paused) {
            val seeResult = state.stepIndex >= RampTest.COOLDOWN ||
                (state.stepIndex == RampTest.RAMP && state.stepSecond >= RampTest.WINDOW_S)
            return base.copy(
                phase = RampPhase.Interrupted,
                title = "Test interrupted",
                lines = listOf(RampText.interrupted(state.rideS)),
                button = if (seeResult) RampButton.SeeResult else RampButton.DiscardTest,
                buttonLabel = if (seeResult) RampText.SEE_RESULT else RampText.DISCARD_TEST,
                buttonEnabled = true,
                endLabel = null,
                announcement = "",
            )
        }
        return when (state.stepIndex) {
            RampTest.WARMUP -> {
                val left = state.stepLeftS ?: 0
                base.copy(
                    phase = RampPhase.Warmup,
                    title = "Warm-up",
                    right = "${RideTime.clock(state.stepSecond)} in",
                    big = RideTime.clock(left),
                    bigCaption = "left in warm-up",
                    progress = (state.stepSecond.toFloat() / RampTest.WARMUP_S).coerceIn(0f, 1f),
                    hint = RampText.WARMUP_HINT,
                    button = RampButton.StartRamp,
                    buttonLabel = RampText.START_RAMP,
                    buttonEnabled = state.canSkip,
                    announcement = RampText.announce("Warm-up", RampTest.WARMUP_W),
                )
            }
            RampTest.RAMP -> {
                val minute = state.stepSecond / RampTest.STEP_S
                val target = state.targetW ?: RampTest.stairW(minute)
                val nextIn = RampTest.STEP_S - state.stepSecond % RampTest.STEP_S
                base.copy(
                    phase = RampPhase.Ramp,
                    title = "Step ${minute + 1}",
                    right = "on the ramp ${RideTime.clock(state.stepSecond)}",
                    big = target.toString(),
                    bigCaption = "W",
                    lines = listOf("next step in ${RideTime.clock(nextIn)} · ${target + RampTest.STEP_W} W"),
                    progress = (state.stepSecond % RampTest.STEP_S).toFloat() / RampTest.STEP_S,
                    hint = RampText.RAMP_HINT,
                    button = RampButton.Done,
                    buttonLabel = RampText.IM_DONE,
                    buttonEnabled = state.canSkip && state.stepSecond >= RampTest.DONE_GUARD_S,
                    endLabel = null,
                    stairs = stairs(minute),
                    stairsDescription = RampText.stairsDescription(minute, RampTest.stairW(minute)),
                    bestValue = RampText.best(best),
                    bestHint = if (best == null) RampText.BEST_HINT else null,
                    announcement = RampText.announce("Ramp", RampTest.START_W),
                    backMessage = RampText.BACK_RAMP,
                )
            }
            else -> {
                val lasted = when (outcome) {
                    is RampOutcome.Measured -> outcome.lastedS
                    is RampOutcome.TooShort -> outcome.lastedS
                    null -> null
                }
                val end = (outcome as? RampOutcome.Measured)?.end
                    ?: if (tapped) RampEnd.Tap else RampEnd.Cadence
                val lines = ArrayList<String>()
                if (lasted != null) lines += RampText.lasted(lasted)
                lines += RampText.reason(end)
                state.stepLeftS?.let { lines += RampText.cooldown(it) }
                base.copy(
                    phase = RampPhase.TestOver,
                    title = "Test over",
                    lines = lines,
                    progress = (state.stepSecond.toFloat() / RampTest.COOLDOWN_S).coerceIn(0f, 1f),
                    button = RampButton.SeeResult,
                    buttonLabel = RampText.SEE_RESULT,
                    buttonEnabled = true,
                    stopCooldown = state.phase == RidePhase.Running,
                    endLabel = null,
                    announcement = RampText.announce("Cool-down", RampTest.COOLDOWN_W),
                    backMessage = RampText.BACK_RAMP,
                )
            }
        }
    }

    /** Bars for the minutes [minute] - 12 to [minute] + 2, the first one not below minute 0. */
    fun stairs(minute: Int): List<StairBar> {
        val first = (minute - BARS_BEHIND).coerceAtLeast(0)
        val indexes = first..(minute + BARS_AHEAD)
        val tallest = RampTest.stairW(indexes.last).toFloat()
        return indexes.map { i ->
            StairBar(
                watts = RampTest.stairW(i),
                kind = when {
                    i < minute -> StairKind.Done
                    i == minute -> StairKind.Current
                    else -> StairKind.Upcoming
                },
                fraction = RampTest.stairW(i) / tallest,
            )
        }
    }
}
