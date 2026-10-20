package com.luketmoss.thrivesip.core

import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionTestTest {
    private val url = "https://script.google.com/macros/s/abc/exec"

    private fun run(url: String, key: String, transport: Transport) =
        runBlocking { ConnectionTest.run(url, key, transport) }

    private val never = object : Transport {
        override suspend fun post(url: String, form: Map<String, String>): String = error("must not be called")
    }

    @Test
    fun aValidKeyReportsTodaysWater() {
        val server = FakeServer()
        server.rows["w"] = Json.parseToJsonElement("""{"id":"w","kind":"water","amount":1420}""").jsonObject
        assertEquals("Connected — 48 oz today", run(url, "good-key", server).message)
    }

    @Test
    fun aWrongKeyIsKeyRejected() {
        assertEquals(TestResult.KeyRejected, run(url, "wrong", FakeServer()))
        assertEquals("Key rejected", TestResult.KeyRejected.message)
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
    fun aBadUrlIsCaughtBeforeAnythingIsSent() {
        assertEquals(TestResult.BadUrl, run("not a url", "k", never))
        assertEquals(TestResult.BadUrl, run("ftp://example.test/x", "k", never))
        assertEquals(TestResult.BadUrl, run("", "k", never))
        assertEquals("That doesn't look like a URL", TestResult.BadUrl.message)
    }

    @Test
    fun aBlankKeyIsRejectedWithoutAskingTheServer() {
        assertEquals(TestResult.KeyRejected, run(url, "  ", never))
    }

    @Test
    fun urlValidation() {
        assertTrue(ConnectionTest.isValidUrl(" $url "))
        assertFalse(ConnectionTest.isValidUrl("https://"))
        assertFalse(ConnectionTest.isValidUrl("script.google.com/x"))
    }
}
