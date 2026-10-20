package com.luketmoss.thrivesip.core

import java.time.Instant
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OutboxTest {
    private var tick = 0
    private val queue = MemoryQueue()
    private val outbox = Outbox(
        store = queue,
        newId = { "id-${++tick}" },
        clock = { Instant.parse("2026-10-20T19:42:07.512Z").plusSeconds(tick.toLong()) },
    )

    private fun api(server: FakeServer, key: String = "good-key") =
        SipApi("https://example.test/exec", key, server)

    @Test
    fun theTapInstantIsKeptToTheSecondAndNeverRewritten() = runBlocking {
        val drink = outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML)
        // The id is taken before the clock is read, so tick is 1 here.
        assertEquals("2026-10-20T19:42:08Z", drink.loggedAtUtc)

        val server = FakeServer()
        outbox.flush(api(server))
        // Sent later, the row still carries the tap's own time.
        val sent = server.rows.getValue("id-1").getValue("logged_at_utc").jsonPrimitive.content
        assertEquals("2026-10-20T19:42:08Z", sent)
    }

    @Test
    fun theWidgetSendsItsSourceAndTheQuickAmount() = runBlocking {
        outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML)
        outbox.enqueue(Kind.ALCOHOL, 1)
        val server = FakeServer()
        outbox.flush(api(server))
        val water = server.rows.getValue("id-1")
        assertEquals("widget", water.getValue("source").jsonPrimitive.content)
        assertEquals("118", water.getValue("amount").jsonPrimitive.content)
        assertEquals("alcohol", server.rows.getValue("id-2").getValue("kind").jsonPrimitive.content)
    }

    @Test
    fun aResponseLostAfterTheServerWroteTheRowDoesNotDuplicateIt() = runBlocking {
        outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML)
        val server = FakeServer()
        server.dropResponses = 1

        assertEquals(FlushResult.Failed, outbox.flush(api(server)))
        assertEquals("the drink is still queued", 1, outbox.pending().size)
        assertEquals("the server already has it", 1, server.rows.size)

        assertEquals(FlushResult.Done, outbox.flush(api(server)))
        assertTrue(outbox.pending().isEmpty())
        assertEquals("one row, not two", 1, server.rows.size)
        assertEquals("the retry sent the same id", listOf("logDrink", "logDrink"), server.actions)
    }

    @Test
    fun theRetryCarriesTheSameIdAndTime() = runBlocking {
        val first = outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML)
        val server = FakeServer()
        server.offline = 1
        outbox.flush(api(server))
        assertEquals(first, outbox.pending().single())
    }

    @Test
    fun offlineTapsAreSentInTapOrderOnceThePhoneIsBack() = runBlocking {
        val taps = listOf(
            outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML),
            outbox.enqueue(Kind.ALCOHOL, 1),
            outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML),
        )
        val server = FakeServer()
        server.offline = 5
        assertEquals(FlushResult.Failed, outbox.flush(api(server)))
        assertEquals("nothing is lost while offline", taps, outbox.pending())

        server.offline = 0
        assertEquals(FlushResult.Done, outbox.flush(api(server)))
        assertEquals(taps.map { it.id }, server.rows.keys.toList())
        val times = server.rows.values.map { it.getValue("logged_at_utc").jsonPrimitive.content }
        assertEquals(taps.map { it.loggedAtUtc }, times)
    }

    @Test
    fun aFailureStopsTheFlushSoOrderIsKept() = runBlocking {
        outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML)
        outbox.enqueue(Kind.ALCOHOL, 1)
        val server = FakeServer()
        server.offline = 1
        outbox.flush(api(server))
        assertTrue("the second drink was not tried ahead of the first", server.rows.isEmpty())
        assertEquals(2, outbox.pending().size)
    }

    @Test
    fun aRefusedKeyKeepsEveryTapQueued() = runBlocking {
        outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML)
        outbox.enqueue(Kind.ALCOHOL, 1)
        val server = FakeServer()
        assertEquals(FlushResult.KeyRejected, outbox.flush(api(server, key = "rotated-away")))
        assertEquals(2, outbox.pending().size)
        assertTrue(server.rows.isEmpty())

        // The new key sends them.
        assertEquals(FlushResult.Done, outbox.flush(api(server)))
        assertEquals(2, server.rows.size)
    }

    @Test
    fun fiveRapidTapsAreFiveEntriesWithFiveIds() {
        repeat(5) { outbox.enqueue(Kind.WATER, Volume.QUICK_WATER_ML) }
        val pending = outbox.pending()
        assertEquals(5, pending.size)
        assertEquals(5, pending.map { it.id }.toSet().size)
    }

    @Test
    fun realIdsAreDistinctAndTheShapeTheServerAccepts() {
        val real = Outbox(MemoryQueue())
        val a = real.enqueue(Kind.WATER, 118)
        val b = real.enqueue(Kind.WATER, 118)
        // drinks.js: 1-64 characters of letters, digits, _ and -
        val shape = Regex("^[A-Za-z0-9_-]{1,64}$")
        assertTrue(shape.matches(a.id))
        assertNotEquals(a.id, b.id)
    }

    @Test
    fun theWidgetOnlyEverSendsTheTwoActionsItsKeyMayRun() = runBlocking {
        outbox.enqueue(Kind.WATER, 118)
        val server = FakeServer()
        val api = api(server)
        outbox.flush(api)
        api.totals()
        assertEquals(setOf("logDrink", "getDrinkTotals"), server.actions.toSet())
    }

    @Test
    fun theKeyTravelsInTheBodyNotTheUrl() = runBlocking {
        var seenUrl = ""
        var seenForm = emptyMap<String, String>()
        val spy = object : Transport {
            override suspend fun post(url: String, form: Map<String, String>): String {
                seenUrl = url
                seenForm = form
                return """{"success":true,"data":{"date":"2026-10-20","water_ml":0,"alcohol_drinks":0,"water_goal_ml":1893}}"""
            }
        }
        SipApi("https://example.test/exec", "secret-key", spy).totals()
        assertEquals("https://example.test/exec", seenUrl)
        assertEquals("secret-key", seenForm["key"])
    }
}
