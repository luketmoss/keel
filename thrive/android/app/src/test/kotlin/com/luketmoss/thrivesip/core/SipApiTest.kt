package com.luketmoss.thrivesip.core

import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SipApiTest {
    private fun replying(body: String) = object : Transport {
        override suspend fun post(url: String, form: Map<String, String>): String = body
    }

    private fun totals(body: String) = runBlocking { SipApi("https://x.test", "k", replying(body)).totals() }

    @Test
    fun readsWaterAlcoholAndGoalFromTheServer() {
        val out = totals("""{"success":true,"data":{"date":"2026-10-20","water_ml":1420,"alcohol_drinks":2,"water_goal_ml":1893}}""")
        assertEquals(Totals("2026-10-20", 1420, 2, 1893), (out as TotalsOutcome.Ok).totals)
    }

    @Test
    fun anUnknownFieldIsIgnored() {
        val out = totals("""{"success":true,"data":{"date":"2026-10-20","water_ml":0,"alcohol_drinks":0,"water_goal_ml":1893,"extra":1}}""")
        assertTrue(out is TotalsOutcome.Ok)
    }

    @Test
    fun theRefusedKeyMessageIsRecognised() {
        assertEquals(TotalsOutcome.KeyRejected, totals("""{"success":false,"error":"Invalid or missing API key"}"""))
    }

    @Test
    fun anyOtherFailureIsTransient() {
        assertEquals(TotalsOutcome.Failed, totals("""{"success":false,"error":"Something broke"}"""))
        assertEquals(TotalsOutcome.Failed, totals("not json"))
        assertEquals(TotalsOutcome.Failed, totals("""{"success":true,"data":{"date":"x"}}"""))
        assertEquals(
            TotalsOutcome.Failed,
            totals("""{"success":true,"data":{"date":"2026-10-20","water_ml":-1,"alcohol_drinks":0,"water_goal_ml":1}}"""),
        )
    }

    @Test
    fun aTransportErrorIsAFailureNotACrash() {
        val broken = object : Transport {
            override suspend fun post(url: String, form: Map<String, String>): String = throw IOException("down")
        }
        assertEquals(TotalsOutcome.Failed, runBlocking { SipApi("https://x.test", "k", broken).totals() })
    }

    @Test
    fun logDrinkSendsTheFieldsTheServerValidates() = runBlocking {
        var form = emptyMap<String, String>()
        val spy = object : Transport {
            override suspend fun post(url: String, form: Map<String, String>): String {
                this@SipApiTest.captured = form
                return """{"success":true,"data":{}}"""
            }
        }
        val drink = PendingDrink("abc-123", Kind.ALCOHOL, 1, "2026-10-20T19:42:08Z")
        assertEquals(SendOutcome.Sent, SipApi("https://x.test", "k", spy).logDrink(drink))
        form = captured
        assertEquals("logDrink", form["action"])
        assertEquals(
            """{"id":"abc-123","kind":"alcohol","amount":1,"logged_at_utc":"2026-10-20T19:42:08Z","source":"widget"}""",
            form["payload"],
        )
    }

    private var captured: Map<String, String> = emptyMap()

    @Test
    fun coffeeCupsAreReadWhenTheServerSendsThem() {
        val out = totals("""{"success":true,"data":{"date":"2026-10-20","water_ml":0,"alcohol_drinks":0,"water_goal_ml":1893,"coffee_cups":3}}""")
        assertEquals(3, (out as TotalsOutcome.Ok).totals.coffeeCups)
    }

    @Test
    fun aReplyWithoutCoffeeCupsStillParsesWithCoffeeAtZero() {
        val out = totals("""{"success":true,"data":{"date":"2026-10-20","water_ml":1420,"alcohol_drinks":2,"water_goal_ml":1893}}""")
        assertEquals(0, (out as TotalsOutcome.Ok).totals.coffeeCups)
    }
}
