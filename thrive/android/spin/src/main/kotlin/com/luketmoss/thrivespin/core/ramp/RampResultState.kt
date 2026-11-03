package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.ftp.FtpDates
import com.luketmoss.thrivespin.core.ftp.FtpNow
import com.luketmoss.thrivespin.core.ftp.FtpText
import com.luketmoss.thrivespin.core.ride.RideTime
import java.time.Instant
import java.time.ZoneId

/** The stepper of the new FTP: one watt a tap, within what `addFtp` accepts. */
object FtpStepper {
    const val MIN = RampOutcome.MIN_FTP
    const val MAX = RampOutcome.MAX_FTP

    fun step(value: Int, delta: Int): Int = (value + delta).coerceIn(MIN, MAX)

    fun canLower(value: Int): Boolean = value > MIN

    fun canHigher(value: Int): Boolean = value < MAX
}

enum class ResultKind { Computing, TooShort, Pending, Set, Kept }

/** What a footer button does. */
enum class ResultAction { Keep, SetFtp, Continue, DiscardTest }

data class ResultButton(val action: ResultAction, val label: String, val filled: Boolean, val enabled: Boolean = true)

data class ResultTile(val label: String, val value: String, val unit: String)

/** The result screen's inputs: everything that changes what it says. */
data class ResultInputs(
    /** Null while the result is being measured. */
    val outcome: RampOutcome?,
    /** The stepper's value as last saved to `ramp.json`. */
    val adjustedFtpW: Int?,
    val decision: RampDecision,
    /** `CurrentFtp`: what Spin has now. */
    val current: FtpNow?,
    /** Seconds left of the cool-down while the ride has not finished. */
    val coolDownLeftS: Int?,
    val startedAtUtc: String,
    val zone: ZoneId,
    val thisYear: Int,
    /** A tap of "Set FTP to N W" is being written: the button is disabled until the state changes. */
    val setting: Boolean = false,
)

/** The result screen's state model (#770): every word and every state of it. */
data class ResultView(
    val kind: ResultKind,
    val eyebrow: String?,
    /** "Your new FTP", "Not enough to measure", or a card's title. */
    val heading: String,
    /** The stepper's value; null where there is no stepper. */
    val ftpW: Int?,
    val canLower: Boolean,
    val canHigher: Boolean,
    val changeLine: String?,
    val basisLine: String?,
    /** "Reset to 262 W", only when the value differs from the computed one. */
    val resetLabel: String?,
    val resetTo: Int?,
    val dropoutLine: String?,
    val tiles: List<ResultTile>,
    /** The lines under the heading in a Set, Kept or too-short state. */
    val lines: List<String>,
    /** The "Discard test" text button in the content (the pending states). */
    val discardInContent: Boolean,
    val footer: List<ResultButton>,
    /** "Cooling down · 7:42 left", with a Stop button; null once the ride has finished. */
    val strip: String?,
    /** The stepper's value, announced politely when it changes. */
    val valueAnnouncement: String?,
    /** The discard dialog's body. */
    val discardBody: String,
)

object ResultText {
    const val LATER = "Later"
    const val CONTINUE = "Continue"
    const val CONTINUE_STOP = "Stop cool-down and continue"
    const val DISCARD_TITLE = "Discard this test?"
    const val KEEP_IT = "Keep it"
    const val MEASURING = "Measuring your test…"
    const val TOO_SHORT_TITLE = "Not enough to measure"
    const val TOO_SHORT_BODY = "The test ended before a full minute of the ramp was ridden."
    const val NO_READINGS_BODY = "There weren't enough power readings to find a best minute."
    const val MINUS = "−"

    fun basis(bestW: Int, adjusted: Boolean): String =
        "75% of your best minute ($bestW W)" + if (adjusted) ", adjusted by you" else ""

    fun dropouts(seconds: Int): String =
        "The trainer dropped out for $seconds s during the test, so the best minute may be low."

    fun strip(leftS: Int): String = "Cooling down · ${RideTime.clock(leftS)} left"

    /** "+12 W (+4.8%) since 12 Oct", "−8 W (−3.2%) since 12 Oct", "No change from 250 W", "Your first FTP test". */
    fun change(newW: Int, current: FtpNow?, thisYear: Int): String {
        if (current == null) return "Your first FTP test"
        val diff = newW - current.ftpW
        if (diff == 0) return "No change from ${current.ftpW} W"
        val tenths = (Math.abs(diff).toLong() * 2000 + current.ftpW) / (2L * current.ftpW)
        val pct = "${tenths / 10}.${tenths % 10}"
        val sign = if (diff > 0) "+" else MINUS
        val since = FtpDates.short(current.date, thisYear).let { if (it.isEmpty()) "" else " since $it" }
        return "$sign${Math.abs(diff)} W ($sign$pct%)$since"
    }

    fun discardBody(date: String, current: FtpNow?): String {
        val tail = if (current == null) {
            "You will still have no FTP."
        } else {
            "Your FTP stays ${current.ftpW} W and nothing from the test is saved, here or in Thrive."
        }
        return "“${RampTest.NAME}”, $date. $tail"
    }

    fun lastStep(w: Int?): ResultTile = ResultTile("Last step", w?.toString() ?: "—", if (w != null) "W" else "")

    fun maxHr(bpm: Int?): ResultTile = ResultTile("Max HR", bpm?.toString() ?: "—", if (bpm != null) "bpm" else "No heart rate")
}

object ResultStates {
    fun of(i: ResultInputs): ResultView {
        val eyebrow = "RAMP TEST · " + FtpDates.eyebrow(i.startedAtUtc, i.zone)
        val date = Instant.parse(i.startedAtUtc).atZone(i.zone).toLocalDate().toString().let { FtpDates.short(it, i.thisYear) }
        val discardBody = ResultText.discardBody(date, i.current)
        val strip = i.coolDownLeftS?.let { ResultText.strip(it) }
        val base = ResultView(
            kind = ResultKind.Computing,
            eyebrow = eyebrow,
            heading = "",
            ftpW = null,
            canLower = false,
            canHigher = false,
            changeLine = null,
            basisLine = null,
            resetLabel = null,
            resetTo = null,
            dropoutLine = null,
            tiles = emptyList(),
            lines = emptyList(),
            discardInContent = false,
            footer = emptyList(),
            strip = strip,
            valueAnnouncement = null,
            discardBody = discardBody,
        )
        val outcome = i.outcome ?: return base.copy(lines = listOf(ResultText.MEASURING))
        if (outcome is RampOutcome.TooShort) {
            return base.copy(
                kind = ResultKind.TooShort,
                heading = ResultText.TOO_SHORT_TITLE,
                lines = listOf(if (outcome.noReadings) ResultText.NO_READINGS_BODY else ResultText.TOO_SHORT_BODY),
                footer = listOf(ResultButton(ResultAction.DiscardTest, RampText.DISCARD_TEST, filled = true)),
            )
        }
        outcome as RampOutcome.Measured
        val tiles = listOf(
            ResultTile("Lasted", RideTime.clock(outcome.lastedS), ""),
            ResultText.lastStep(outcome.lastStepW),
            ResultText.maxHr(outcome.maxHr),
        )
        val continueLabel = if (i.coolDownLeftS != null) ResultText.CONTINUE_STOP else ResultText.CONTINUE
        return when (val decision = i.decision) {
            is RampDecision.Set -> base.copy(
                kind = ResultKind.Set,
                heading = "FTP is now ${decision.ftpW} W",
                lines = listOf(FtpText.setStatus(decision.record), FtpText.PAST_RIDES),
                tiles = tiles,
                footer = listOf(ResultButton(ResultAction.Continue, continueLabel, filled = true)),
            )
            is RampDecision.Kept -> base.copy(
                kind = ResultKind.Kept,
                heading = "FTP stays ${decision.ftpW} W",
                lines = listOf("Nothing was changed in Thrive."),
                tiles = tiles,
                footer = listOf(ResultButton(ResultAction.Continue, continueLabel, filled = true)),
            )
            RampDecision.Pending -> {
                val computed = outcome.shownFtpW
                val value = (i.adjustedFtpW ?: computed).coerceIn(FtpStepper.MIN, FtpStepper.MAX)
                val adjusted = value != computed
                val footer = ArrayList<ResultButton>()
                if (i.current != null) footer += ResultButton(ResultAction.Keep, "Keep ${i.current.ftpW} W", filled = false, enabled = !i.setting)
                footer += ResultButton(ResultAction.SetFtp, "Set FTP to $value W", filled = true, enabled = !i.setting)
                base.copy(
                    kind = ResultKind.Pending,
                    heading = "Your new FTP",
                    ftpW = value,
                    canLower = FtpStepper.canLower(value),
                    canHigher = FtpStepper.canHigher(value),
                    changeLine = ResultText.change(value, i.current, i.thisYear),
                    basisLine = ResultText.basis(outcome.bestMinuteW, adjusted),
                    resetLabel = if (adjusted) "Reset to $computed W" else null,
                    resetTo = if (adjusted) computed else null,
                    dropoutLine = if (outcome.droppedOut) ResultText.dropouts(outcome.nullPowerS) else null,
                    tiles = tiles,
                    discardInContent = true,
                    footer = footer,
                    valueAnnouncement = "$value watts",
                )
            }
        }
    }
}
