package com.luketmoss.thrivespin.core.ftp

/** The Library's FTP banner (#770): the records not yet in Thrive, most urgent state first. */
data class FtpBanner(val urgent: Boolean, val count: Int, val recordId: String) {
    val text: String
        get() = if (urgent) {
            if (count == 1) "1 FTP change couldn't be saved to Thrive" else "$count FTP changes couldn't be saved to Thrive"
        } else {
            if (count == 1) "1 FTP change is waiting to send to Thrive" else "$count FTP changes are waiting to send to Thrive"
        }

    val button: String get() = "Details"
}

object PendingFtp {
    private fun urgent(stage: FtpStage): Boolean = stage != FtpStage.Queued

    /**
     * Null with nothing waiting. A tap opens the oldest record of the most urgent state present: the
     * failed states, else the queued ones.
     */
    fun banner(records: List<FtpRecord>): FtpBanner? {
        if (records.isEmpty()) return null
        val failed = records.filter { urgent(it.state) }
        val group = failed.ifEmpty { records }
        val oldest = group.minWith(compareBy({ it.createdAtUtc }, { it.id }))
        return FtpBanner(urgent = failed.isNotEmpty(), count = group.size, recordId = oldest.id)
    }
}

/** What the FTP sheet's button does. */
enum class FtpSheetAction(val label: String) {
    SendNow("Send now"),
    OpenSettings("Open settings"),
    TryAgain("Try again"),
}

/** The FTP sheet (#770) for one record: every word in it. */
data class FtpSheetView(
    val title: String,
    val line: String,
    val status: String,
    val action: FtpSheetAction,
    val dropTitle: String,
    val dropBody: String,
)

object FtpText {
    const val DROP_CHANGE = "Drop change"
    const val KEEP_IT = "Keep it"
    const val PAST_RIDES = "Past rides keep the FTP they were ridden at."

    fun sheet(record: FtpRecord, thisYear: Int): FtpSheetView {
        val date = FtpDates.short(record.date, thisYear)
        val (status, action) = when (record.state) {
            FtpStage.Queued -> "Saved on phone, not yet in Thrive · sends when online." to FtpSheetAction.SendNow
            FtpStage.NeedsKey -> "Key rejected. Check the key in Settings." to FtpSheetAction.OpenSettings
            FtpStage.NeedsSetup -> "Add the API URL and key in Settings." to FtpSheetAction.OpenSettings
            FtpStage.Stuck -> "Thrive keeps answering with an error. It stopped trying." to FtpSheetAction.TryAgain
            FtpStage.Rejected -> "Thrive refused this change: ${record.message.orEmpty()}. It wasn't sent again." to FtpSheetAction.TryAgain
        }
        val back = record.previousW?.let { "Spin goes back to $it W." } ?: "Spin goes back to having no FTP."
        return FtpSheetView(
            title = "FTP ${record.ftpW} W",
            line = "Set by a ramp test on $date. Spin is using it now.",
            status = status,
            action = action,
            dropTitle = "Drop this FTP change?",
            dropBody = "FTP ${record.ftpW} W from the ramp test on $date will not be added to Thrive's FTP history. $back",
        )
    }

    /** The result screen's status line once the FTP is set: what Spin and Thrive each have. [record] is null once Thrive has it. */
    fun setStatus(record: FtpRecord?): String = "Spin uses it now. " + when (record?.state) {
        null -> "Added to Thrive's FTP history."
        FtpStage.Queued -> "Saved on phone, not yet in Thrive · sends when online."
        FtpStage.Rejected -> "Thrive refused it. It's still on this phone."
        FtpStage.NeedsKey -> "Key rejected."
        FtpStage.NeedsSetup -> "Spin isn't set up."
        FtpStage.Stuck -> "Thrive keeps answering with an error."
    }

    /** The Library card's line under "Ramp test". */
    fun cardLine(now: FtpNow?, thisYear: Int): String {
        if (now == null) return "No FTP yet. Ride the ramp test to set one."
        val date = FtpDates.short(now.date, thisYear)
        val how = when (now.source) {
            FtpRecord.SOURCE_RAMP_TEST -> " by a ramp test"
            "manual" -> " by hand"
            else -> ""
        }
        val set = if (date.isEmpty()) "" else " · set $date$how"
        return "FTP ${now.ftpW} W$set"
    }
}
