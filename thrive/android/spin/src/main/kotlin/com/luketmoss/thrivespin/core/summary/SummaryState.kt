package com.luketmoss.thrivespin.core.summary

import com.luketmoss.thrivespin.core.ride.RideTime
import com.luketmoss.thrivespin.core.upload.Failure
import com.luketmoss.thrivespin.core.upload.Preparation
import com.luketmoss.thrivespin.core.upload.SaveBlock
import com.luketmoss.thrivespin.core.upload.UploadStage
import com.luketmoss.thrivespin.core.upload.UploadState
import com.luketmoss.thrivespin.core.workout.Maths
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class Mark { Done, Waiting, Problem, NotYet }

/** The two buttons a state can put under its status card. */
enum class CardButtons { None, SendNow, TryAgain, TryAgainOrDelete, OpenSettings }

enum class SummaryPhase { Preparing, CouldntPrepare, Ready }

class FooterButton(val label: String, val filled: Boolean, val enabled: Boolean = true)

/** What the summary screen draws for one state: the status card, the footer, and which fields can be edited. */
data class SummaryView(
    val phase: SummaryPhase,
    val cardTitle: String,
    val recordedNote: String?,
    val fitMark: Mark,
    val fitNote: String?,
    val step3Label: String,
    val step3Mark: Mark,
    val step3Note: String?,
    val extraLines: List<String>,
    val buttons: CardButtons,
    /** A thin progress bar runs under the card's title. */
    val progress: Boolean,
    /** Null while preparing: no footer. */
    val left: FooterButton?,
    val right: FooterButton?,
    val discardVisible: Boolean,
    val fieldsEditable: Boolean,
    val fieldsNote: String?,
    val fieldsVisible: Boolean,
    /** `https://luketmoss.github.io/keel/thrive/#/history/<id>`, only once the answer's id is known. */
    val openUrl: String?,
)

object SummaryText {
    const val THRIVE_HISTORY = "https://luketmoss.github.io/keel/thrive/#/history/"

    fun eyebrowPhrase(endReason: String): String = when (endReason) {
        "ended" -> "Ride ended"
        "paused_too_long" -> "Ride ended after a long pause"
        "limit" -> "Ride reached the limit"
        "interrupted" -> "Ride interrupted"
        else -> "Ride complete"
    }

    private val EYEBROW_DATE = DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.US)

    /** "Ride complete · Sat 7 Nov, 8:02 AM" in the phone's zone; the screen draws it in capitals. */
    fun eyebrow(endReason: String, startedAtUtc: String, zone: ZoneId): String {
        val when_ = try {
            EYEBROW_DATE.format(Instant.parse(startedAtUtc).atZone(zone))
        } catch (e: java.time.DateTimeException) {
            ""
        }
        return if (when_.isEmpty()) eyebrowPhrase(endReason) else "${eyebrowPhrase(endReason)} · $when_"
    }

    /** "Sat 7 Nov", for the Discard dialog. */
    fun dateOnly(startedAtUtc: String, zone: ZoneId): String = try {
        DateTimeFormatter.ofPattern("EEE d MMM", Locale.US).format(Instant.parse(startedAtUtc).atZone(zone))
    } catch (e: java.time.DateTimeException) {
        ""
    }

    /** Why the ride stopped, when it was not the person's own End or the last step. */
    fun whyEnded(endReason: String, elapsedS: Int): String? = when (endReason) {
        "paused_too_long" -> "It ended after a 60-minute pause."
        "limit" -> "It stopped at the 12-hour limit."
        "interrupted" -> "The app was closed during this ride, so it ended at ${RideTime.clock(elapsedS)}."
        else -> null
    }

    /** "h:mm a" for a try today, else "MMM d". */
    fun lastTry(lastTryUtc: String, nowMs: Long, zone: ZoneId): String = try {
        val at = Instant.parse(lastTryUtc).atZone(zone)
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        if (at.toLocalDate() == today) {
            DateTimeFormatter.ofPattern("h:mm a", Locale.US).format(at)
        } else {
            DateTimeFormatter.ofPattern("MMM d", Locale.US).format(at)
        }
    } catch (e: java.time.DateTimeException) {
        ""
    }

    /** The wording a `saveRide` status gets; a status the app has never heard of gets none. */
    fun statusNote(status: String): String? = when (status) {
        "created" -> "New activity · bike · indoor"
        "claimed" -> "Completed your planned ride"
        "exists" -> "Already in Thrive"
        "merged" -> "Joined your COROS recording"
        else -> null
    }

    const val AMBIGUOUS_PLANS =
        "More than one bike workout was planned that day, so Thrive didn't match this ride to a plan. You can match it in Thrive."
    const val AMBIGUOUS_COROS =
        "Your watch recorded a ride at about the same time. Thrive kept both, so check Activities for a duplicate."

    fun openUrl(id: String): String =
        THRIVE_HISTORY + URLEncoder.encode(id, "UTF-8").replace("+", "%20")

    fun samples(n: Int): String = "%,d samples".format(Locale.US, n)

    fun kb(bytes: Int): String = "${maxOf(1, Maths.roundHalfUp(bytes / 1000.0))} KB"

    /** `m:ss`, for "Paused 0:45 in total". */
    fun pausedTotal(pausedS: Int): String = "Paused ${RideTime.clock(pausedS)} in total"
}

/** One of the nine tiles. [unit] is the unit, or the words that explain a blank. */
data class Tile(val label: String, val value: String, val unit: String, val blank: Boolean) {
    val description: String get() = if (blank) "$label, no reading" else "$label, $value $unit"
}

object SummaryTiles {
    fun of(s: RideSummary): List<Tile> {
        fun num(label: String, v: Int?, unit: String, none: String) =
            if (v == null) Tile(label, "—", none, true) else Tile(label, v.toString(), unit, false)
        val ifText = s.intensityFactor?.let { "%.2f".format(Locale.US, it) }
        return listOf(
            Tile("Time", RideTime.clock(s.movingS), "", false),
            num("Avg power", s.avgPowerW, "W", "No reading"),
            num("Norm. power", s.npW, "W", "No reading"),
            if (ifText == null) Tile("IF", "—", "No FTP", true) else Tile("IF", ifText, "", false),
            num("TSS", s.tss, "", "No FTP"),
            num("Work", s.workKj, "kJ", "No reading"),
            num("Avg HR", s.avgHr, "bpm", "No heart rate"),
            num("Max HR", s.maxHr, "bpm", "No heart rate"),
            num("Cadence", s.avgCadence, "rpm", "No reading"),
        )
    }

    /** "Scored at FTP 250 W · intensity 100%", without the FTP part when there is none. */
    fun scoredLine(s: RideSummary): String =
        if (s.ftpW == null) "intensity ${s.intensityPct}%" else "Scored at FTP ${s.ftpW} W · intensity ${s.intensityPct}%"

    fun rowDescription(r: IntervalRow): String =
        if (r.percent == null) {
            "${r.name}, target ${r.targetText} watts, too short to score"
        } else {
            "${r.name}, target ${r.targetText} watts, average ${r.avgW} watts, ${r.percent} percent of target, ${r.band.word}"
        }
}

object SummaryStates {
    /**
     * The view for one moment of one ride. [prep] is null while the metrics and files are being made;
     * [upload] is null until `upload.json` has been written; [sending] is true while a send is in flight.
     */
    fun of(prep: Preparation?, upload: UploadState?, sending: Boolean, nowMs: Long, zone: ZoneId): SummaryView {
        val stage = upload?.state ?: UploadStage.Draft
        if (prep == null && stage == UploadStage.Draft) {
            return view(SummaryPhase.Preparing, "", UploadStage.Draft, null, null, null, upload, sending, nowMs, zone)
        }
        if (prep is Preparation.Failed && stage == UploadStage.Draft) {
            return view(SummaryPhase.CouldntPrepare, "Couldn't prepare this ride.", UploadStage.Draft, null, null, null, upload, sending, nowMs, zone)
        }
        val ready = prep as? Preparation.Ready
        return view(SummaryPhase.Ready, "", stage, ready?.fitBytes, ready?.block, ready?.summary?.sampleCount, upload, sending, nowMs, zone)
    }

    private fun view(
        phase: SummaryPhase,
        failedTitle: String,
        stage: UploadStage,
        fitBytes: Int?,
        block: SaveBlock?,
        sampleCount: Int?,
        upload: UploadState?,
        sending: Boolean,
        nowMs: Long,
        zone: ZoneId,
    ): SummaryView {
        val none = SummaryView(
            phase = phase,
            cardTitle = "",
            recordedNote = null,
            fitMark = Mark.NotYet,
            fitNote = null,
            step3Label = "Saved to Thrive",
            step3Mark = Mark.NotYet,
            step3Note = null,
            extraLines = emptyList(),
            buttons = CardButtons.None,
            progress = false,
            left = null,
            right = null,
            discardVisible = false,
            fieldsEditable = false,
            fieldsNote = null,
            fieldsVisible = false,
            openUrl = null,
        )
        if (phase == SummaryPhase.Preparing) return none
        if (phase == SummaryPhase.CouldntPrepare) {
            return none.copy(
                cardTitle = failedTitle,
                extraLines = listOf("The recording couldn't be read."),
                left = FooterButton("Later", filled = false),
            )
        }
        val fit = if (fitBytes != null) Mark.Done else Mark.NotYet
        val fitNote = fitBytes?.let { SummaryText.kb(it) }
        val base = none.copy(
            recordedNote = sampleCount?.let { SummaryText.samples(it) },
            fitMark = fit,
            fitNote = fitNote,
            fieldsVisible = true,
        )
        val done = FooterButton("Done", filled = false)
        val noOpen = FooterButton("Open in Thrive", filled = true, enabled = false)
        val sentWords = "They go with the ride when it sends."
        val retryNote = upload?.lastTryUtc?.let {
            "Last try ${SummaryText.lastTry(it, nowMs, zone)}. It sends by itself when there's a connection."
        } ?: "It sends by itself when there's a connection."
        return when (stage) {
            UploadStage.Draft -> {
                val savable = block == null
                base.copy(
                    cardTitle = "Not saved to Thrive yet",
                    step3Label = if (block == SaveBlock.NoPower) "Nothing to save" else "Saved to Thrive",
                    extraLines = when (block) {
                        SaveBlock.NoPower -> listOf("No power was recorded, so Thrive can't score this ride.")
                        SaveBlock.NoFtp -> listOf("Set your FTP first. Thrive needs it to score the ride.")
                        null -> emptyList()
                    },
                    left = FooterButton("Later", filled = false),
                    right = FooterButton("Save to Thrive", filled = true, enabled = savable),
                    discardVisible = true,
                    fieldsEditable = true,
                )
            }
            UploadStage.Queued -> {
                val failure = upload?.lastFailure
                base.copy(
                    cardTitle = if (sending) "Sending to Thrive…" else "Saved on phone, not yet in Thrive",
                    step3Label = if (sending) "Saved to Thrive" else "Waiting to send to Thrive",
                    step3Mark = Mark.Waiting,
                    step3Note = if (sending) {
                        null
                    } else if (failure == Failure.Server) {
                        "Thrive answered with an error · trying again"
                    } else {
                        "sends when online"
                    },
                    extraLines = if (sending) emptyList() else listOf(retryNote),
                    buttons = if (sending) CardButtons.None else CardButtons.SendNow,
                    progress = sending,
                    left = done,
                    right = noOpen,
                    fieldsNote = sentWords,
                )
            }
            UploadStage.NeedsKey -> base.copy(
                cardTitle = "Saved on phone, not yet in Thrive",
                step3Label = "Key rejected",
                step3Mark = Mark.Problem,
                extraLines = listOf("Check the key in Settings."),
                buttons = CardButtons.OpenSettings,
                left = done,
                right = noOpen,
                fieldsNote = sentWords,
            )
            UploadStage.NeedsSetup -> base.copy(
                cardTitle = "Saved on phone, not yet in Thrive",
                step3Label = "Spin isn't set up",
                step3Mark = Mark.Problem,
                extraLines = listOf("Add the API URL and key in Settings."),
                buttons = CardButtons.OpenSettings,
                left = done,
                right = noOpen,
                fieldsNote = sentWords,
            )
            UploadStage.Stuck -> base.copy(
                cardTitle = "Saved on phone, not yet in Thrive",
                step3Label = "Thrive keeps answering with an error",
                step3Mark = Mark.Problem,
                extraLines = listOf("It stopped trying."),
                buttons = CardButtons.TryAgain,
                left = done,
                right = noOpen,
                fieldsNote = sentWords,
            )
            UploadStage.Rejected -> base.copy(
                cardTitle = "Thrive refused this ride",
                step3Label = "Not saved to Thrive",
                step3Mark = Mark.Problem,
                step3Note = upload?.message,
                extraLines = listOf("It wasn't sent again. It's still on this phone."),
                buttons = CardButtons.TryAgainOrDelete,
                left = done,
                right = noOpen,
                fieldsEditable = true,
            )
            UploadStage.Sent -> {
                val answer = upload?.answer
                val lines = ArrayList<String>()
                if (answer?.ambiguousPlans == true) lines += SummaryText.AMBIGUOUS_PLANS
                if (answer?.ambiguousCoros == true) lines += SummaryText.AMBIGUOUS_COROS
                val id = answer?.id.orEmpty()
                base.copy(
                    cardTitle = "In Thrive",
                    step3Label = "Saved to Thrive",
                    step3Mark = Mark.Done,
                    step3Note = answer?.let { SummaryText.statusNote(it.status) },
                    extraLines = lines,
                    left = done,
                    right = FooterButton("Open in Thrive", filled = true, enabled = id.isNotBlank()),
                    fieldsNote = "Saved with the ride. To change them, edit the ride in Thrive.",
                    openUrl = if (id.isBlank()) null else SummaryText.openUrl(id),
                )
            }
        }
    }
}
