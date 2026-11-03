package com.luketmoss.thrivespin.core.ftp

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/** The dates of the FTP screens, from `java.time`. */
object FtpDates {
    /** The zone Thrive files rides and FTP rows under (#765). */
    val DENVER: ZoneId = ZoneId.of("America/Denver")

    /** The calendar date of an instant in Denver: the test day, whatever the phone's zone and the hour. */
    fun denverDate(utc: String): String = Instant.parse(utc).atZone(DENVER).toLocalDate().toString()

    private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMM", Locale.US)
    private val DAY_MONTH_YEAR = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)
    private val EYEBROW = DateTimeFormatter.ofPattern("EEE d MMM", Locale.US)

    /** "12 Oct", with the year when it is not [thisYear]'s. Blank in, blank out. */
    fun short(date: String, thisYear: Int): String {
        val d = parse(date) ?: return ""
        return if (d.year == thisYear) d.format(DAY_MONTH) else d.format(DAY_MONTH_YEAR)
    }

    /** "SAT 7 NOV", in the phone's zone. */
    fun eyebrow(startedAtUtc: String, zone: ZoneId): String =
        Instant.parse(startedAtUtc).atZone(zone).format(EYEBROW).uppercase(Locale.US)

    fun parse(date: String): LocalDate? = try {
        LocalDate.parse(date.trim())
    } catch (e: DateTimeParseException) {
        null
    }
}
