package com.luketmoss.thrivespin.core.ftp

import com.luketmoss.thrivespin.core.library.LibraryCache

/** The FTP Spin is using, and how it got there. [pending] is true while it is a record not yet in Thrive. */
data class FtpNow(
    val ftpW: Int,
    /** `YYYY-MM-DD`. */
    val date: String,
    /** `ramp_test`, `manual`, or blank when the cache does not say. */
    val source: String,
    val pending: Boolean,
) {
    val byRampTest: Boolean get() = source == FtpRecord.SOURCE_RAMP_TEST
}

/**
 * `CurrentFtp` (#770): the wrapper around the cached `getFtp` `current` that everything in Spin reads, so a
 * confirmed FTP is used at once and offline, and a Library refresh that lands before the write reaches
 * Thrive cannot put the old number back.
 *
 * It is the newest, by (`date`, then creation time), of the cached `current` and every record that is not
 * `sent`: queued, `needs_*`, `stuck` and `rejected` alike, because a refused number stays in force until the
 * person drops it. A `sent` record is deleted after the cache takes the row Thrive returned.
 */
object CurrentFtp {
    fun of(cache: LibraryCache?, records: List<FtpRecord>): FtpNow? {
        var best: FtpNow? = null
        var bestKey: Pair<String, String>? = null
        fun consider(now: FtpNow, created: String) {
            val key = now.date to created
            val current = bestKey
            if (current == null || compare(key, current) >= 0) {
                best = now
                bestKey = key
            }
        }
        val cachedFtp = cache?.ftpW
        if (cache != null && cachedFtp != null) {
            consider(FtpNow(cachedFtp, cache.ftpDate, cache.ftpSource, pending = false), cache.ftpCreated)
        }
        for (r in records) consider(FtpNow(r.ftpW, r.date, r.source, pending = true), r.createdAtUtc)
        return best
    }

    private fun compare(a: Pair<String, String>, b: Pair<String, String>): Int =
        compareValuesBy(a, b, { it.first }, { it.second })
}
