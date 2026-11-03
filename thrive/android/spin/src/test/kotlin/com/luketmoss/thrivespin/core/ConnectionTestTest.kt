package com.luketmoss.thrivespin.core

import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionTestTest {
    private val url = "https://script.google.com/macros/s/abc/exec"

    /** Answers every request with [body] and keeps what it was sent. */
    private class Canned(private val body: String) : Transport {
        val requests = mutableListOf<Pair<String, Map<String, String>>>()
        override suspend fun post(url: String, form: Map<String, String>): String {
            requests += url to form
            return body
        }
    }

    private val never = object : Transport {
        override suspend fun post(url: String, form: Map<String, String>): String = error("must not be called")
    }

    private fun run(url: String, key: String, transport: Transport) =
        runBlocking { ConnectionTest.run(url, key, transport) }

    private fun message(body: String) = run(url, "k", Canned(body)).message

    @Test
    fun anFtpIsReported() {
        assertEquals(
            "Connected — FTP 250 W",
            message("""{"success":true,"data":{"current":{"ftp_w":250,"effective_from":"2026-10-01"}}}"""),
        )
    }

    @Test
    fun noFtpYetIsReported() {
        assertEquals("Connected — no FTP set yet", message("""{"success":true,"data":{"current":null}}"""))
        assertEquals("Connected — no FTP set yet", message("""{"success":true,"data":{}}"""))
    }

    @Test
    fun aKeyTheApiDoesNotKnowIsKeyRejected() {
        assertEquals("Key rejected", message("""{"success":false,"error":"Invalid or missing API key"}"""))
    }

    @Test
    fun aRefusalCodeEndingForbiddenIsKeyRejected() {
        assertEquals(
            "Key rejected",
            message("""{"success":false,"error":"Widget caller: this action is not permitted","code":"widget_forbidden"}"""),
        )
    }

    @Test
    fun anyOtherFailureIsAnError() {
        assertEquals("Thrive answered with an error", message("""{"success":false,"error":"Something broke"}"""))
        assertEquals(
            "Thrive answered with an error",
            message("""{"success":false,"error":"Bad request","code":"bad_request"}"""),
        )
    }

    @Test
    fun noNetworkIsCantReachTheServer() {
        val down = object : Transport {
            override suspend fun post(url: String, form: Map<String, String>): String = throw IOException("down")
        }
        assertEquals(TestResult.Unreachable, run(url, "k", down))
        assertEquals("Can't reach the server", TestResult.Unreachable.message)
    }

    @Test
    fun aBodyThatIsNotTheEnvelopeIsCantReachTheServer() {
        assertEquals("Can't reach the server", message("<html>Sign in</html>"))
        assertEquals("Can't reach the server", message("[1,2]"))
        assertEquals("Can't reach the server", message("""{"data":{}}"""))
        assertEquals("Can't reach the server", message(""))
    }

    @Test
    fun aBadUrlIsCaughtBeforeAnythingIsSent() {
        assertEquals("That doesn't look like a URL", run("not a url", "k", never).message)
        assertEquals(TestResult.BadUrl, run("ftp://example.test/x", "k", never))
        assertEquals(TestResult.BadUrl, run("", "k", never))
        assertEquals(TestResult.BadUrl, run("https://exa mple.test/x", "k", never))
    }

    @Test
    fun aBlankKeyIsRejectedWithoutAskingTheServer() {
        assertEquals("Enter the key", run(url, "  ", never).message)
        assertEquals("Enter the key", run(url, "", never).message)
    }

    @Test
    fun theRequestIsAFormPostWithTheKeyInTheBodyNotTheUrl() {
        val transport = Canned("""{"success":true,"data":{"current":null}}""")
        run(" $url ", " secret-key ", transport)
        val (sentUrl, form) = transport.requests.single()
        assertEquals(url, sentUrl)
        assertFalse(sentUrl.contains("secret-key"))
        assertEquals(mapOf("action" to "getFtp", "key" to "secret-key"), form)
    }

    @Test
    fun urlValidation() {
        assertTrue(ConnectionTest.isValidUrl(" $url "))
        assertFalse(ConnectionTest.isValidUrl("https://"))
        assertFalse(ConnectionTest.isValidUrl("script.google.com/x"))
    }
}
