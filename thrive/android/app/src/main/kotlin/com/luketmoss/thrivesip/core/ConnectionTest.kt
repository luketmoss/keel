package com.luketmoss.thrivesip.core

import java.net.URI
import java.net.URISyntaxException

/** The settings screen's "Test connection": one `getDrinkTotals`, reported in words. */
sealed interface TestResult {
    val message: String

    data class Connected(val waterMl: Int) : TestResult {
        override val message get() = "Connected — ${Volume.formatOz(waterMl)} oz today"
    }

    data object KeyRejected : TestResult {
        override val message get() = "Key rejected"
    }

    data object Unreachable : TestResult {
        override val message get() = "Can't reach the server"
    }

    data object BadUrl : TestResult {
        override val message get() = "That doesn't look like a URL"
    }
}

object ConnectionTest {
    /** An http(s) URL with a host and no whitespace inside it. */
    fun isValidUrl(raw: String): Boolean {
        val text = raw.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return false
        val uri = try {
            URI(text)
        } catch (e: URISyntaxException) {
            return false
        }
        return (uri.scheme == "https" || uri.scheme == "http") && !uri.host.isNullOrEmpty()
    }

    suspend fun run(url: String, key: String, transport: Transport): TestResult {
        if (!isValidUrl(url)) return TestResult.BadUrl
        if (key.isBlank()) return TestResult.KeyRejected
        return when (val outcome = SipApi(url.trim(), key.trim(), transport).totals()) {
            is TotalsOutcome.Ok -> TestResult.Connected(outcome.totals.waterMl)
            TotalsOutcome.KeyRejected -> TestResult.KeyRejected
            TotalsOutcome.Failed -> TestResult.Unreachable
        }
    }
}
