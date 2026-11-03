package com.luketmoss.thrivespin.core.upload

import com.luketmoss.thrivespin.core.Transport
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.summary.CardButtons
import com.luketmoss.thrivespin.core.summary.Hashes
import com.luketmoss.thrivespin.core.summary.Mark
import com.luketmoss.thrivespin.core.summary.Recs
import com.luketmoss.thrivespin.core.summary.SummaryPhase
import com.luketmoss.thrivespin.core.summary.SummaryStates
import java.io.File
import java.io.IOException
import java.time.ZoneId
import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FakeTransport : Transport {
    val calls = ArrayList<Map<String, String>>()
    var failure: IOException? = null
    var reply: (Map<String, String>) -> String = { ok("created", "act_1") }

    override suspend fun post(url: String, form: Map<String, String>): String {
        calls += form
        failure?.let { throw it }
        return reply(form)
    }

    companion object {
        fun ok(status: String, id: String = "act_1", extra: String = "") =
            """{"success":true,"data":{"status":"$status","id":"$id","fit_ref":"f","streams_ref":"s"$extra}}"""

        fun error(text: String, code: String? = null) =
            if (code == null) """{"success":false,"error":"$text"}""" else """{"success":false,"error":"$text","code":"$code"}"""
    }
}

class RideUploadsTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private var clock = Recs.START_MS + 4_000_000L
    private lateinit var store: FileRideStore
    private lateinit var uploads: FileRideUploads
    private val transport = FakeTransport()
    private var config = "https://script.example/exec" to "spin-key"

    private fun fresh(): FileRideUploads = FileRideUploads(store, { clock }, "0.1.0", { 0 })

    private fun setUp() {
        store = FileRideStore(File(tmp.root, "rides"))
        uploads = fresh()
    }

    private fun uploader() = RideUploader(uploads, transport, { config }, { clock })

    private fun run(): UploadRun = runBlocking { uploader().runOnce() }

    private fun ride(
        id: String = "ride-1",
        n: Int = 120,
        power: Int? = 200,
        ftp: Int? = 250,
        hr: Int? = null,
        started: String = Recs.START_UTC,
        kind: RideKind = RideKind.Workout,
    ): RideRecording {
        val session = Recs.session(id = id, ftp = ftp)
        val base = Recs.recording(Recs.flat(n, power, target = if (ftp == null) null else 225, hr = hr), session = session)
        val r = RideRecording(base.meta.copy(startedAtUtc = started, kind = kind), base.samples, base.events)
        Recs.write(store, r)
        return r
    }

    private fun save(id: String = "ride-1", effort: Effort? = null, notes: String = ""): SaveResult {
        assertTrue(uploads.prepare(id) is Preparation.Ready)
        val result = uploads.save(id, effort, notes)
        clock += 1_000
        return result
    }

    private fun state(id: String = "ride-1") = uploads.current(id)!!

    private fun payload(id: String = "ride-1"): JsonObject = Json.parseToJsonElement(state(id).payload!!).jsonObject

    // ---- Payload ----

    @Test
    fun thePayloadMatchesNumberSevenSixtyFiveFieldForField() {
        setUp()
        ride(hr = null)
        assertEquals(SaveResult.Queued, save(notes = "felt good"))
        val p = payload()
        assertEquals(
            listOf(
                "ride_id", "started_at_utc", "name", "ride_workout_id", "elapsed_seconds", "moving_seconds", "avg_hr",
                "calories", "distance_m", "avg_power_w", "np_w", "intensity_factor", "tss", "work_kj", "ftp_w",
                "intensity_pct", "effort", "notes", "fit_sha256", "streams_sha256",
            ),
            p.keys.toList(),
        )
        assertEquals("ride-1", p["ride_id"]!!.jsonPrimitive.content)
        assertEquals(Recs.START_UTC, p["started_at_utc"]!!.jsonPrimitive.content)
        assertEquals("Sweet Spot 3x12", p["name"]!!.jsonPrimitive.content)
        assertEquals("rw_1", p["ride_workout_id"]!!.jsonPrimitive.content)
        assertEquals(120, p["elapsed_seconds"]!!.jsonPrimitive.content.toInt())
        assertEquals(120, p["moving_seconds"]!!.jsonPrimitive.content.toInt())
        assertEquals(JsonNull, p["avg_hr"])
        assertEquals(JsonNull, p["calories"])
        assertEquals(JsonNull, p["distance_m"])
        assertEquals(200, p["avg_power_w"]!!.jsonPrimitive.content.toInt())
        assertEquals(200, p["np_w"]!!.jsonPrimitive.content.toInt())
        assertEquals("0.8", p["intensity_factor"]!!.jsonPrimitive.content)
        assertEquals(250, p["ftp_w"]!!.jsonPrimitive.content.toInt())
        assertEquals("", p["effort"]!!.jsonPrimitive.content)
        assertEquals("felt good", p["notes"]!!.jsonPrimitive.content)
    }

    @Test
    fun effortIsBlankOrOneOfThriveThreeAndAvgHrIsWholeWhenThereIsHeartRate() {
        setUp()
        ride(id = "a", hr = 141)
        ride(id = "b")
        save("a", Effort.Hard)
        save("b", null)
        assertEquals("Hard", payload("a")["effort"]!!.jsonPrimitive.content)
        assertEquals(141, payload("a")["avg_hr"]!!.jsonPrimitive.content.toInt())
        assertEquals("", payload("b")["effort"]!!.jsonPrimitive.content)
        assertEquals(listOf("Easy", "Medium", "Hard"), Effort.entries.map { it.wire })
    }

    @Test
    fun theRequestCarriesTheFourFieldsAndBothHashesMatchTheBytesSent() {
        setUp()
        ride()
        save()
        assertEquals(UploadRun.Done, run())
        val form = transport.calls.single()
        assertEquals(setOf("action", "key", "payload", "fit", "streams"), form.keys)
        assertEquals("saveRide", form["action"])
        assertEquals("spin-key", form["key"])
        val p = Json.parseToJsonElement(form["payload"]!!).jsonObject
        val fit = Base64.getDecoder().decode(form["fit"]!!)
        assertEquals(p["fit_sha256"]!!.jsonPrimitive.content, Hashes.sha256Hex(fit))
        assertEquals(".FIT", String(fit, 8, 4))
        assertEquals(p["streams_sha256"]!!.jsonPrimitive.content, Hashes.sha256Hex(form["streams"]!!.toByteArray(Charsets.UTF_8)))
        assertFalse(form["fit"]!!.contains("\n"))
    }

    @Test
    fun aThousandQuotesAsNotesStayUnderTheSixThousandCharacterCap() {
        setUp()
        ride()
        save(notes = "\"".repeat(1000))
        val text = state().payload!!
        assertTrue("payload ${text.length}", text.length < 6000)
        assertEquals(1000, payload()["notes"]!!.jsonPrimitive.content.length)
        // More than the limit is cut, not sent.
        ride(id = "long")
        save("long", notes = "x".repeat(1500))
        assertEquals(1000, payload("long")["notes"]!!.jsonPrimitive.content.length)
    }

    // ---- Save freezes ----

    @Test
    fun afterSaveEffortNotesPayloadAndFilesNoLongerChangeAndRetriesSendIdenticalBytes() {
        setUp()
        ride()
        uploads.prepare("ride-1")
        uploads.setDraft("ride-1", Effort.Medium, "legs")
        // A process restart keeps what was typed.
        uploads = fresh()
        assertEquals("Medium", state().effort)
        assertEquals("legs", state().notes)
        assertEquals(SaveResult.Queued, uploads.save("ride-1", Effort.Medium, "legs"))
        val frozen = state()
        val fit = File(store.dir("ride-1"), "ride.fit").readBytes()
        val streams = File(store.dir("ride-1"), "streams.json").readBytes()

        uploads.setDraft("ride-1", Effort.Easy, "changed")
        assertEquals(frozen, state())
        assertEquals(SaveResult.NotSaved, uploads.save("ride-1", Effort.Easy, "changed"))
        assertTrue(uploads.prepare("ride-1") is Preparation.Ready)
        assertEquals(frozen, state())
        assertTrue(fit.contentEquals(File(store.dir("ride-1"), "ride.fit").readBytes()))
        assertTrue(streams.contentEquals(File(store.dir("ride-1"), "streams.json").readBytes()))

        transport.failure = IOException("offline")
        run()
        run()
        transport.failure = null
        transport.reply = { FakeTransport.error("Lock timeout") }
        run()
        assertEquals(3, transport.calls.size)
        assertEquals(1, transport.calls.map { it["payload"] }.toSet().size)
        assertEquals(1, transport.calls.map { it["fit"] }.toSet().size)
        assertEquals(1, transport.calls.map { it["streams"] }.toSet().size)
    }

    // ---- Success is done ----

    @Test
    fun everySuccessIsSentAndDeletesTheFolder() {
        setUp()
        val cases = listOf(
            "created" to "New activity · bike · indoor",
            "claimed" to "Completed your planned ride",
            "exists" to "Already in Thrive",
            "merged" to "Joined your COROS recording",
            "something_new" to null,
        )
        for ((i, c) in cases.withIndex()) {
            val id = "ride-$i"
            ride(id)
            save(id)
            transport.reply = { FakeTransport.ok(c.first, "act_$i") }
            assertEquals(UploadRun.Done, run())
            assertFalse("${c.first} folder", store.dir(id).exists())
            val st = uploads.current(id)!!
            assertEquals(UploadStage.Sent, st.state)
            assertEquals("act_$i", st.answer!!.id)
            val view = SummaryStates.of(Preparation.Ready(com.luketmoss.thrivespin.core.summary.RideMetrics.summarize(ride(id + "x"), 250), 1000, null), st, false, clock, ZoneId.of("UTC"))
            assertEquals("In Thrive", view.cardTitle)
            assertEquals("Saved to Thrive", view.step3Label)
            assertEquals(c.second, view.step3Note)
            assertEquals(Mark.Done, view.step3Mark)
        }
    }

    @Test
    fun ambiguousAnswersStillCountAsSavedAndShowTheirLine() {
        setUp()
        ride()
        save()
        transport.reply = { FakeTransport.ok("created", "x", ""","ambiguous_plans":["w1","w2"],"ambiguous_coros":true""") }
        run()
        val st = uploads.current("ride-1")!!
        assertEquals(UploadStage.Sent, st.state)
        assertTrue(st.answer!!.ambiguousPlans)
        assertTrue(st.answer!!.ambiguousCoros)
        val view = SummaryStates.of(Preparation.Ready(com.luketmoss.thrivespin.core.summary.RideMetrics.summarize(ride("r2"), 250), 1000, null), st, false, clock, ZoneId.of("UTC"))
        assertEquals(2, view.extraLines.size)
        assertTrue(view.extraLines[0].startsWith("More than one bike workout was planned that day"))
        assertTrue(view.extraLines[1].startsWith("Your watch recorded a ride"))
        assertEquals("In Thrive", view.cardTitle)
        // An empty list is no warning.
        ride("r3")
        save("r3")
        transport.reply = { FakeTransport.ok("created", "y", ""","ambiguous_plans":[]""") }
        run()
        assertFalse(uploads.current("r3")!!.answer!!.ambiguousPlans)
    }

    @Test
    fun aCrashBetweenRecordingTheAnswerAndDeletingTheFolderDeletesWithoutASecondCall() {
        setUp()
        ride()
        save()
        UploadFiles.write(store.dir("ride-1"), state().copy(state = UploadStage.Sent, answer = SaveAnswer("created", "act_1")))
        uploads = fresh()
        assertEquals(UploadRun.Done, run())
        assertEquals(0, transport.calls.size)
        assertFalse(store.dir("ride-1").exists())
    }

    // ---- Failures ----

    @Test
    fun networkFailuresNeverMakeARideStuckHoweverManyOccur() {
        setUp()
        ride()
        save()
        transport.failure = IOException("timeout")
        repeat(25) { assertEquals(UploadRun.Retry, run()) }
        assertEquals(UploadStage.Queued, state().state)
        assertEquals(25, state().attempts)
        assertEquals(Failure.Offline, state().lastFailure)
        transport.failure = null
        transport.reply = { "<html>not the envelope</html>" }
        repeat(12) { assertEquals(UploadRun.Retry, run()) }
        assertEquals(UploadStage.Queued, state().state)
        transport.reply = { """{"nothing":true}""" }
        run()
        assertEquals(UploadStage.Queued, state().state)
        assertTrue(store.dir("ride-1").exists())
    }

    @Test
    fun aNon2xxIsAnIoFailureAndLeavesTheRideQueued() {
        setUp()
        ride()
        save()
        transport.failure = IOException("HTTP 502")
        assertEquals(UploadRun.Retry, run())
        assertEquals(UploadStage.Queued, state().state)
        assertNotNull(state().lastTryUtc)
    }

    @Test
    fun lockTimeoutAndOtherServerErrorsCountAndTheTenthInARowIsStuck() {
        setUp()
        ride()
        save()
        transport.reply = { FakeTransport.error("Lock timeout") }
        repeat(9) {
            assertEquals(UploadRun.Retry, run())
            assertEquals(UploadStage.Queued, state().state)
        }
        assertEquals(9, state().serverErrors)
        assertEquals(UploadRun.Done, run())
        assertEquals(UploadStage.Stuck, state().state)
        val calls = transport.calls.size
        run()
        run()
        assertEquals("a stuck ride is not sent again by itself", calls, transport.calls.size)
        // Try again resets the counters.
        assertEquals(SaveResult.Queued, uploads.retry("ride-1"))
        assertEquals(UploadStage.Queued, state().state)
        assertEquals(0, state().serverErrors)
        assertEquals(0, state().attempts)
        run()
        assertEquals(1, state().serverErrors)
    }

    @Test
    fun anyOtherOutcomeResetsTheRunOfServerErrors() {
        setUp()
        ride()
        save()
        transport.reply = { FakeTransport.error("Something odd", "internal_error") }
        repeat(5) { run() }
        assertEquals(5, state().serverErrors)
        transport.failure = IOException("offline")
        run()
        assertEquals(0, state().serverErrors)
    }

    @Test
    fun aRefusedKeyIsNeedsKeyStopsTheRunAndSpendsNoAttempt() {
        setUp()
        ride("a")
        ride("b")
        save("a")
        save("b")
        transport.reply = { FakeTransport.error("Invalid or missing API key") }
        assertEquals(UploadRun.Done, run())
        assertEquals(1, transport.calls.size)
        assertEquals(UploadStage.NeedsKey, state("a").state)
        assertEquals(0, state("a").attempts)
        run()
        assertEquals("a ride waiting on its key is not sent", 1, transport.calls.size)
        // The caller kind is refused by its code too.
        uploads.settingsSaved()
        transport.calls.clear()
        transport.reply = { FakeTransport.error("Spin caller: this action is not permitted", "spin_forbidden") }
        run()
        assertEquals(UploadStage.NeedsKey, state("a").state)
        // Saving Settings returns it to queued.
        assertEquals(2, uploads.settingsSaved())
        assertEquals(UploadStage.Queued, state("a").state)
        assertEquals(UploadStage.Queued, state("b").state)
    }

    @Test
    fun aBlankUrlOrKeySetsNeedsSetupWithNoCall() {
        setUp()
        ride()
        save()
        config = "" to "spin-key"
        assertEquals(UploadRun.Done, run())
        assertEquals(UploadStage.NeedsSetup, state().state)
        config = "https://script.example/exec" to "  "
        uploads.settingsSaved()
        run()
        assertEquals(UploadStage.NeedsSetup, state().state)
        assertEquals(0, transport.calls.size)
        config = "https://script.example/exec" to "spin-key"
        uploads.settingsSaved()
        assertEquals(UploadStage.Queued, state().state)
        run()
        assertEquals(1, transport.calls.size)
    }

    // ---- bad_request ----

    @Test
    fun badRequestIsFinalAndTheApiIsNeverCalledForThatRideAgain() {
        setUp()
        ride("bad")
        ride("good")
        save("bad")
        save("good")
        transport.reply = { form ->
            if (form["payload"]!!.contains("\"ride_id\":\"bad\"")) FakeTransport.error("effort must be Easy, Medium or Hard", "bad_request") else FakeTransport.ok("created")
        }
        assertEquals(UploadRun.Done, run())
        assertEquals(UploadStage.Rejected, state("bad").state)
        assertEquals("effort must be Easy, Medium or Hard", state("bad").message)
        assertEquals("the next ride is still sent", UploadStage.Sent, uploads.current("good")!!.state)
        assertTrue("the folder is kept", store.dir("bad").exists())
        val calls = transport.calls.size
        repeat(5) { run() }
        assertEquals(calls, transport.calls.size)
        assertEquals(UploadStage.Rejected, state("bad").state)
    }

    @Test
    fun tryAgainRebuildsAndRequeuesARejectedRideWithTheCurrentEffortAndNotes() {
        setUp()
        ride()
        save(effort = Effort.Hard)
        transport.reply = { FakeTransport.error("bad notes", "bad_request") }
        run()
        assertEquals(UploadStage.Rejected, state().state)
        uploads.setDraft("ride-1", Effort.Easy, "fixed")
        assertEquals(SaveResult.Queued, uploads.retry("ride-1"))
        assertEquals(UploadStage.Queued, state().state)
        assertEquals("Easy", payload()["effort"]!!.jsonPrimitive.content)
        assertEquals("fixed", payload()["notes"]!!.jsonPrimitive.content)
        assertNull(state().message)
        transport.reply = { FakeTransport.ok("created") }
        run()
        assertEquals(UploadStage.Sent, uploads.current("ride-1")!!.state)
    }

    @Test
    fun deleteFromPhoneOnlyForARejectedRideAndDiscardOnlyForADraft() {
        setUp()
        ride("a")
        ride("b")
        uploads.prepare("a")
        save("b")
        assertFalse("a queued ride is not deleted", uploads.deleteFromPhone("b"))
        assertFalse("nor discarded", uploads.discard("b"))
        assertTrue(store.dir("b").exists())
        transport.reply = { FakeTransport.error("no", "bad_request") }
        run()
        assertFalse("a rejected ride is not discarded", uploads.discard("b"))
        assertTrue(uploads.deleteFromPhone("b"))
        assertFalse(store.dir("b").exists())
        assertTrue(uploads.discard("a"))
        assertFalse(store.dir("a").exists())
    }

    // ---- Order and deletion ----

    @Test
    fun ridesSendOldestSavedFirstAndFailuresNeverDeleteOne() {
        setUp()
        ride("late", started = "2026-11-07T15:02:11Z")
        ride("early", started = "2026-11-09T15:02:11Z")
        ride("middle", started = "2026-11-08T15:02:11Z")
        // Saved in this order: middle, late, early (the clock moves a second at each save).
        save("middle")
        save("late")
        save("early")
        transport.reply = { FakeTransport.error("Lock timeout") }
        run()
        assertEquals(listOf("middle", "late", "early"), transport.calls.map { Json.parseToJsonElement(it["payload"]!!).jsonObject["ride_id"]!!.jsonPrimitive.content })
        for (id in listOf("middle", "late", "early")) assertTrue(store.dir(id).exists())
        transport.calls.clear()
        transport.reply = { FakeTransport.ok("created") }
        run()
        assertEquals(listOf("middle", "late", "early"), transport.calls.map { Json.parseToJsonElement(it["payload"]!!).jsonObject["ride_id"]!!.jsonPrimitive.content })
    }

    // ---- The FTP hook ----

    @Test
    fun prepareScoresAgainstTheFtpPassedInAndCanBeCalledAgainBeforeSave() {
        setUp()
        ride(ftp = 250)
        val first = uploads.prepare("ride-1", 200) as Preparation.Ready
        assertEquals(200, first.summary.ftpW)
        val second = uploads.prepare("ride-1", 300) as Preparation.Ready
        assertEquals(300, second.summary.ftpW)
        assertEquals(300, state().ftpW)
        uploads.save("ride-1", null, "")
        assertEquals(300, payload()["ftp_w"]!!.jsonPrimitive.content.toInt())
        assertTrue(File(store.dir("ride-1"), "streams.json").readText().contains("\"ftp_w\":300"))
    }

    @Test
    fun withNoFtpFromEitherSaveIsBlockedAndNoPayloadIsBuilt() {
        setUp()
        ride(ftp = null)
        val prep = uploads.prepare("ride-1") as Preparation.Ready
        assertEquals(SaveBlock.NoFtp, prep.block)
        assertNull(prep.summary.intensityFactor)
        assertNull(prep.summary.tss)
        assertEquals(SaveResult.Blocked(SaveBlock.NoFtp), uploads.save("ride-1", null, ""))
        assertNull(state().payload)
        assertEquals(UploadStage.Draft, state().state)
        assertFalse(File(store.dir("ride-1"), "ride.fit").exists())
        val view = SummaryStates.of(prep, state(), false, clock, ZoneId.of("UTC"))
        assertFalse(view.right!!.enabled)
        assertEquals(listOf("Set your FTP first. Thrive needs it to score the ride."), view.extraLines)
        // #770 supplies one: the same ride can then be saved.
        assertNull((uploads.prepare("ride-1", 240) as Preparation.Ready).block)
        assertEquals(SaveResult.Queued, uploads.save("ride-1", null, ""))
    }

    @Test
    fun aRideWithNoPowerAtAllCannotBeSaved() {
        setUp()
        ride(power = null)
        val prep = uploads.prepare("ride-1") as Preparation.Ready
        assertEquals(SaveBlock.NoPower, prep.block)
        assertEquals(SaveResult.Blocked(SaveBlock.NoPower), uploads.save("ride-1", null, ""))
        val view = SummaryStates.of(prep, state(), false, clock, ZoneId.of("UTC"))
        assertEquals("Nothing to save", view.step3Label)
        assertFalse(view.right!!.enabled)
        assertTrue(view.discardVisible)
        // A one-second ride with power is saved like any other.
        ride("one", n = 1)
        assertEquals(SaveResult.Queued, save("one"))
    }

    @Test
    fun anUnreadableRecordingCouldNotBePrepared() {
        setUp()
        assertTrue(uploads.prepare("missing") is Preparation.Failed)
        val view = SummaryStates.of(Preparation.Failed, null, false, clock, ZoneId.of("UTC"))
        assertEquals(SummaryPhase.CouldntPrepare, view.phase)
        assertEquals("Couldn't prepare this ride.", view.cardTitle)
        assertEquals(listOf("The recording couldn't be read."), view.extraLines)
        assertNull(view.right)
        assertEquals("Later", view.left!!.label)
    }

    // ---- Hand-off ----

    @Test
    fun theHandlerOpensAWorkoutAndMarksItAndLeavesARampTestUntouched() {
        val kinds = mapOf("w1" to RideKind.Workout, "w2" to RideKind.Workout, "ramp" to RideKind.RampTest)
        val marked = ArrayList<String>()
        val queue = SummaryQueue()
        val handler = SummaryHandler({ kinds[it] }, { marked += it }, { queue.add(it) })
        // Several un-handed-off rides at app open, oldest first.
        listOf("w1", "ramp", "w2").forEach { handler.onFinished(it) }
        assertEquals(listOf("w1", "w2"), marked)
        assertEquals(listOf("w1", "w2"), queue.ids.value)
        assertEquals("w1", queue.head)
        queue.remove("w1")
        assertEquals("w2", queue.head)
        handler.onFinished("unknown")
        assertEquals(listOf("w2"), queue.ids.value)
    }

    @Test
    fun aBannerTapOpensTheRideAtTheFront() {
        val queue = SummaryQueue()
        queue.add("a")
        queue.showNow("b")
        assertEquals(listOf("b", "a"), queue.ids.value)
    }

    // ---- The banner ----

    @Test
    fun theBannerShowsTheMostUrgentStateWithItsCountAndOpensTheOldest() {
        fun ride(id: String, stage: UploadStage, key: String) = PendingRide(id, stage, key)
        assertNull(PendingRides.banner(emptyList()))
        assertNull(PendingRides.banner(listOf(ride("a", UploadStage.Sent, "1"))))
        val queued = PendingRides.banner(listOf(ride("a", UploadStage.Queued, "2"), ride("b", UploadStage.Queued, "1")))!!
        assertEquals("2 rides are waiting to send to Thrive", queued.text)
        assertEquals("Details", queued.button)
        assertEquals("b", queued.rideId)
        val draft = PendingRides.banner(listOf(ride("a", UploadStage.Queued, "1"), ride("b", UploadStage.Draft, "3")))!!
        assertEquals("1 ride isn't saved to Thrive yet", draft.text)
        assertEquals("Review", draft.button)
        assertEquals("b", draft.rideId)
        val urgent = PendingRides.banner(
            listOf(ride("a", UploadStage.Draft, "1"), ride("b", UploadStage.Rejected, "5"), ride("c", UploadStage.NeedsKey, "4"), ride("d", UploadStage.Queued, "0")),
        )!!
        assertEquals("2 rides couldn't be saved to Thrive", urgent.text)
        assertEquals("c", urgent.rideId)
        assertEquals("1 ride couldn't be saved to Thrive", PendingRides.banner(listOf(ride("a", UploadStage.Stuck, "1")))!!.text)
        assertEquals("3 rides aren't saved to Thrive yet", PendingBanner(BannerKind.NotSaved, 3, "a").text)
        assertEquals("1 ride is waiting to send to Thrive", PendingBanner(BannerKind.Waiting, 1, "a").text)
    }

    @Test
    fun pendingListsTheRidesThatAreNotFinishedWith() {
        setUp()
        ride("a")
        ride("b")
        ride("c")
        uploads.prepare("a")
        save("b")
        // "c" has never been opened: it counts as a draft, so nothing is left with no way back to it.
        assertEquals(
            setOf("a" to UploadStage.Draft, "b" to UploadStage.Queued, "c" to UploadStage.Draft),
            uploads.pending().map { it.rideId to it.stage }.toSet(),
        )
        transport.reply = { FakeTransport.ok("created") }
        run()
        assertEquals(setOf("a", "c"), uploads.pending().map { it.rideId }.toSet())
        // A ramp test is #770's and is never on the banner.
        ride("ramp", kind = RideKind.RampTest)
        assertFalse(uploads.pending().any { it.rideId == "ramp" })
    }

    // ---- The summary's state model ----

    @Test
    fun theStateTableGivesEachStateItsCardFooterAndFields() {
        setUp()
        ride()
        val prep = uploads.prepare("ride-1") as Preparation.Ready
        val zone = ZoneId.of("UTC")
        fun view(st: UploadState?, sending: Boolean = false) = SummaryStates.of(prep, st, sending, clock, zone)
        val draft = state()

        view(draft).let {
            assertEquals("Not saved to Thrive yet", it.cardTitle)
            assertEquals("Later", it.left!!.label)
            assertEquals("Save to Thrive", it.right!!.label)
            assertTrue(it.right!!.enabled)
            assertTrue(it.fieldsEditable)
            assertTrue(it.discardVisible)
            assertEquals("120 samples", it.recordedNote)
            assertEquals(Mark.Done, it.fitMark)
            assertNull(it.openUrl)
        }
        val queued = draft.copy(state = UploadStage.Queued, lastTryUtc = "2026-11-07T18:30:00Z", lastFailure = Failure.Offline)
        view(queued, sending = true).let {
            assertEquals("Sending to Thrive…", it.cardTitle)
            assertTrue(it.progress)
            assertEquals("Done", it.left!!.label)
            assertEquals("Open in Thrive", it.right!!.label)
            assertFalse(it.right!!.enabled)
            assertFalse(it.fieldsEditable)
            assertFalse(it.discardVisible)
            assertEquals("They go with the ride when it sends.", it.fieldsNote)
        }
        view(queued).let {
            assertEquals("Saved on phone, not yet in Thrive", it.cardTitle)
            assertEquals("Waiting to send to Thrive", it.step3Label)
            assertEquals("sends when online", it.step3Note)
            assertEquals(Mark.Waiting, it.step3Mark)
            assertEquals(listOf("Last try 6:30 PM. It sends by itself when there's a connection."), it.extraLines)
            assertEquals(CardButtons.SendNow, it.buttons)
        }
        view(queued.copy(lastFailure = Failure.Server)).let {
            assertEquals("Thrive answered with an error · trying again", it.step3Note)
        }
        view(queued.copy(lastTryUtc = "2026-11-05T18:30:00Z")).let {
            assertEquals("Last try Nov 5. It sends by itself when there's a connection.", it.extraLines.single())
        }
        view(draft.copy(state = UploadStage.NeedsKey)).let {
            assertEquals("Key rejected", it.step3Label)
            assertEquals(Mark.Problem, it.step3Mark)
            assertEquals(listOf("Check the key in Settings."), it.extraLines)
            assertEquals(CardButtons.OpenSettings, it.buttons)
            assertFalse(it.fieldsEditable)
        }
        view(draft.copy(state = UploadStage.NeedsSetup)).let {
            assertEquals("Spin isn't set up", it.step3Label)
            assertEquals(listOf("Add the API URL and key in Settings."), it.extraLines)
            assertEquals(CardButtons.OpenSettings, it.buttons)
        }
        view(draft.copy(state = UploadStage.Stuck)).let {
            assertEquals("Thrive keeps answering with an error", it.step3Label)
            assertEquals(listOf("It stopped trying."), it.extraLines)
            assertEquals(CardButtons.TryAgain, it.buttons)
            assertFalse(it.fieldsEditable)
        }
        view(draft.copy(state = UploadStage.Rejected, message = "bad effort")).let {
            assertEquals("Thrive refused this ride", it.cardTitle)
            assertEquals("Not saved to Thrive", it.step3Label)
            assertEquals("bad effort", it.step3Note)
            assertEquals(listOf("It wasn't sent again. It's still on this phone."), it.extraLines)
            assertEquals(CardButtons.TryAgainOrDelete, it.buttons)
            assertTrue(it.fieldsEditable)
            assertFalse(it.discardVisible)
            assertFalse(it.right!!.enabled)
        }
        val sent = draft.copy(state = UploadStage.Sent, answer = SaveAnswer("created", "act 1/x"))
        view(sent).let {
            assertEquals("In Thrive", it.cardTitle)
            assertTrue(it.right!!.enabled)
            assertEquals("https://luketmoss.github.io/keel/thrive/#/history/act%201%2Fx", it.openUrl)
            assertEquals("Saved with the ride. To change them, edit the ride in Thrive.", it.fieldsNote)
            assertFalse(it.fieldsEditable)
        }
        // "Open in Thrive" is disabled until the answer's id is known.
        view(sent.copy(answer = SaveAnswer("created", ""))).let {
            assertFalse(it.right!!.enabled)
            assertNull(it.openUrl)
        }
        // Discard shows in draft only.
        for (stage in UploadStage.entries) {
            assertEquals(stage.name, stage == UploadStage.Draft, view(draft.copy(state = stage)).discardVisible)
        }
        // Preparing has no footer.
        SummaryStates.of(null, null, false, clock, zone).let {
            assertEquals(SummaryPhase.Preparing, it.phase)
            assertNull(it.left)
            assertNull(it.right)
        }
    }

    @Test
    fun theUnknownProcessStateFlowFollowsTheFiles() {
        setUp()
        ride()
        val flow = uploads.state("ride-1")
        assertNull(flow.value)
        uploads.prepare("ride-1")
        assertEquals(UploadStage.Draft, flow.value!!.state)
        uploads.save("ride-1", null, "")
        assertEquals(UploadStage.Queued, flow.value!!.state)
        transport.reply = { FakeTransport.ok("exists") }
        run()
        assertEquals(UploadStage.Sent, flow.value!!.state)
        assertEquals("exists", flow.value!!.answer!!.status)
        assertTrue(JsonPrimitive(1).toString().isNotEmpty())
    }
}
