package com.luketmoss.thrivespin.core.library

import com.luketmoss.thrivespin.core.SpinJson
import com.luketmoss.thrivespin.core.Transport
import com.luketmoss.thrivespin.core.workout.Draft
import com.luketmoss.thrivespin.core.workout.EXAMPLE_STEPS
import com.luketmoss.thrivespin.core.workout.Selection
import com.luketmoss.thrivespin.core.workout.exampleSteps
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class LibraryModelTest {
    private val today = LocalDate.of(2026, 11, 10)
    private val url = "https://script.google.com/macros/s/abc/exec"

    private class MemoryPersistence(var text: String? = null) : CachePersistence {
        var writes = 0
        override fun read(): String? = text
        override fun write(text: String) {
            this.text = text
            writes++
        }
    }

    /** Answers by action, keeps every request, and can be told to fail an action. */
    private class Fake : Transport {
        val requests = mutableListOf<Map<String, String>>()
        val replies = mutableMapOf<String, String>()
        val failures = mutableMapOf<String, IOException>()

        override suspend fun post(url: String, form: Map<String, String>): String {
            requests += form
            val action = form.getValue("action")
            failures[action]?.let { throw it }
            return replies[action] ?: """{"success":false,"error":"no such action"}"""
        }

        fun count(action: String) = requests.count { it["action"] == action }
    }

    private fun workoutRow(id: String, name: String, last: String = "") =
        """{"id":"$id","name":"$name","category":"Sweet spot","description":"d","steps":$EXAMPLE_STEPS,"duration_s":4440,"last_ridden_date":"$last"}"""

    private fun fakeWithLibrary(): Fake = Fake().apply {
        replies["getRideWorkouts"] = """{"success":true,"data":[${workoutRow("a", "Alpha", "2026-11-09")},${workoutRow("b", "Beta")}]}"""
        replies["getFtp"] = """{"success":true,"data":{"current":{"ftp_w":250},"history":[]}}"""
        replies["getPlannedWorkouts"] =
            """{"success":true,"data":[{"id":"p1","type":"bike","status":"planned","time":"06:30","name":"Morning","ride_workout_id":"a"}]}"""
    }

    private var now = 1_000_000L
    private val persistence = MemoryPersistence()
    private var configured: Pair<String, String> = url to "key"

    @Before
    fun resetThrottle() {
        LibraryModel.lastAttemptMs = 0L
    }

    private fun model(fake: Fake, p: MemoryPersistence = persistence) =
        LibraryModel(p, fake, { configured }, { now }, { today })

    private fun refresh(m: LibraryModel, force: Boolean = true) = runBlocking { m.refresh(force) }

    @Test
    fun aSuccessfulRefreshFillsTheCacheAndKeepsItOnDisk() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        assertNull(m.cache.value)
        assertEquals(RefreshOutcome.Refreshed, refresh(m))
        val c = m.cache.value!!
        assertEquals(listOf("a", "b"), c.workouts.map { it.id })
        assertEquals(250, c.ftpW)
        assertEquals("2026-11-10", c.plansDate)
        assertEquals(1, c.plans.size)
        assertEquals(now, c.refreshedAtMs)
        // A new model over the same storage, with no network, has the same cache: it survives a reload.
        val reloaded = model(Fake())
        assertEquals(c, reloaded.cache.value)
        // The three reads and the date for the plans.
        assertEquals(1, fake.count("getRideWorkouts"))
        assertEquals(1, fake.count("getFtp"))
        assertEquals("2026-11-10", fake.requests.first { it["action"] == "getPlannedWorkouts" }["date"])
    }

    @Test
    fun theKeyTravelsInTheBodyOnly() {
        val fake = fakeWithLibrary()
        refresh(model(fake))
        assertTrue(fake.requests.all { it["key"] == "key" })
    }

    @Test
    fun aPartialFailureLeavesTheOldCacheWhole() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        val before = m.cache.value
        val writes = persistence.writes
        // The workouts call would now return something different, but the FTP call fails.
        fake.replies["getRideWorkouts"] = """{"success":true,"data":[${workoutRow("z", "Zed")}]}"""
        fake.replies["getFtp"] = """{"success":false,"error":"boom"}"""
        val outcome = refresh(m)
        assertEquals(RefreshOutcome.Failed(Reason.ApiError), outcome)
        assertEquals(before, m.cache.value)
        assertEquals(writes, persistence.writes)
        assertEquals(Reason.ApiError, m.failure.value)
        // The next success clears the note.
        fake.replies["getFtp"] = """{"success":true,"data":{"current":{"ftp_w":260}}}"""
        assertEquals(RefreshOutcome.Refreshed, refresh(m))
        assertNull(m.failure.value)
        assertEquals(listOf("z"), m.cache.value!!.workouts.map { it.id })
        assertEquals(260, m.cache.value!!.ftpW)
    }

    @Test
    fun theReasonsAreMapped() {
        fun reasonFor(body: String?, io: Boolean = false): Reason? {
            val fake = fakeWithLibrary()
            if (io) fake.failures["getRideWorkouts"] = IOException("HTTP 500")
            else if (body != null) fake.replies["getRideWorkouts"] = body
            val m = model(fake, MemoryPersistence())
            return (refresh(m) as? RefreshOutcome.Failed)?.reason
        }
        assertEquals(Reason.Network, reasonFor(null, io = true))
        assertEquals(Reason.Network, reasonFor("<html>not an envelope</html>"))
        assertEquals(Reason.KeyRejected, reasonFor("""{"success":false,"error":"Invalid or missing API key"}"""))
        assertEquals(Reason.KeyRejected, reasonFor("""{"success":false,"error":"x","code":"widget_forbidden"}"""))
        assertEquals(Reason.KeyRejected, reasonFor("""{"success":false,"error":"x","code":"spin_forbidden"}"""))
        assertEquals(Reason.ApiError, reasonFor("""{"success":false,"error":"Lock timeout"}"""))
        assertEquals("Can't reach Thrive.", Reason.Network.text)
        assertEquals("Key rejected. Check the key in Settings.", Reason.KeyRejected.text)
        assertEquals("Thrive answered with an error.", Reason.ApiError.text)
    }

    @Test
    fun theLibraryStatesMapAsTheNoteSays() {
        val zone = ZoneId.of("UTC")
        fun screen(configured: Boolean, cache: LibraryCache?, refreshing: Boolean, failure: Reason?, category: String? = null, search: String = "") =
            LibraryStates.screen(LibraryInputs(configured, cache, refreshing, failure, category, search, today, now, zone))

        assertEquals(LibraryScreen.NotSetUp, screen(false, null, false, null))
        assertEquals(LibraryScreen.Loading, screen(true, null, true, null))
        assertEquals(LibraryScreen.Loading, screen(true, null, false, null))
        assertEquals(LibraryScreen.Failed(Reason.Network), screen(true, null, false, Reason.Network))

        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        val cache = m.cache.value!!

        val ok = screen(true, cache, false, null) as LibraryScreen.Ready
        assertNull(ok.notice)
        assertEquals("All workouts · 2", ok.heading)
        assertEquals(1, ok.planned.size)
        assertNull(ok.empty)
        assertEquals("Search 2 workouts", ok.placeholder)

        val refreshing = screen(true, cache, true, null) as LibraryScreen.Ready
        assertEquals(ok, refreshing)

        val offline = screen(true, cache, false, Reason.Network) as LibraryScreen.Ready
        assertTrue(offline.notice!!.startsWith("Offline · library from "))
        val errored = screen(true, cache, false, Reason.ApiError) as LibraryScreen.Ready
        assertTrue(errored.notice!!.startsWith("Couldn't refresh · library from "))

        val none = screen(true, cache, false, null, search = "zzz") as LibraryScreen.Ready
        assertEquals(LibraryScreen.Empty.NothingMatches, none.empty)
        assertEquals("0 matching", none.heading)
        val noneInCategory = screen(true, cache, false, null, category = "Recovery") as LibraryScreen.Ready
        assertEquals(LibraryScreen.Empty.NothingMatches, noneInCategory.empty)
        assertEquals("Recovery · 0", noneInCategory.heading)

        val empty = screen(true, cache.copy(workouts = emptyList(), unreadable = 1), false, null) as LibraryScreen.Ready
        assertEquals(LibraryScreen.Empty.NoWorkouts, empty.empty)
        assertEquals("1 workout couldn't be read.", empty.unreadable)
    }

    @Test
    fun notSetUpMakesNoCall() {
        val fake = fakeWithLibrary()
        configured = "" to ""
        val m = model(fake)
        assertFalse(m.isConfigured)
        assertEquals(RefreshOutcome.Skipped, refresh(m))
        assertTrue(fake.requests.isEmpty())
        configured = url to " "
        assertFalse(model(fake).isConfigured)
        configured = "not a url" to "k"
        assertFalse(model(fake).isConfigured)
    }

    @Test
    fun aBackgroundRefreshRunsAtMostOnceAMinute() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        assertEquals(RefreshOutcome.Refreshed, refresh(m, force = false))
        now += 30_000
        assertEquals(RefreshOutcome.Skipped, refresh(m, force = false))
        assertEquals(1, fake.count("getFtp"))
        now += 31_000
        assertEquals(RefreshOutcome.Refreshed, refresh(m, force = false))
        // Pulling to refresh is never throttled.
        assertEquals(RefreshOutcome.Refreshed, refresh(m, force = true))
    }

    // ---- the builder's save and delete ---------------------------------------------------------

    private fun draft(id: String = "id-1", isNew: Boolean = true): Draft =
        (if (isNew) Draft.forNew(id) else Draft.forEdit(id, "Old", "Endurance", "", exampleSteps()))
            .withName("Sweet Spot").withCategory("Sweet spot")

    private fun savedReply(id: String, name: String) = """{"success":true,"data":${workoutRow(id, name)}}"""

    @Test
    fun aSaveSendsTheDraftsIdAndPutsTheReturnedRowInTheCache() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        fake.replies["saveRideWorkout"] = savedReply("id-1", "Sweet Spot")
        val outcome = runBlocking { m.save(draft()) } as SaveOutcome.Saved
        assertEquals("id-1", outcome.workout.id)
        assertEquals(listOf("a", "b", "id-1"), m.cache.value!!.workouts.map { it.id })
        val sent = SpinJson.parseToJsonElement(fake.requests.last { it["action"] == "saveRideWorkout" }.getValue("payload")).jsonObject
        assertEquals("id-1", sent["id"]!!.jsonPrimitive.content)
        assertEquals("Sweet Spot", sent["name"]!!.jsonPrimitive.content)
        assertEquals("Sweet spot", sent["category"]!!.jsonPrimitive.content)
        assertTrue(sent["steps"] is JsonObject)
        assertEquals(1, sent["steps"]!!.jsonObject["v"]!!.jsonPrimitive.content.toInt())
        // Saving an existing workout replaces its row in the cache.
        fake.replies["saveRideWorkout"] = savedReply("a", "Renamed")
        runBlocking { m.save(draft("a", isNew = false)) }
        assertEquals("Renamed", m.cache.value!!.workouts.first { it.id == "a" }.name)
        assertEquals(3, m.cache.value!!.workouts.size)
    }

    @Test
    fun aNewWorkoutSendsTheSameIdOnEveryRetry() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        fake.failures["saveRideWorkout"] = IOException("timeout")
        val d = draft("made-once")
        repeat(3) { assertTrue(runBlocking { m.save(d) } is SaveOutcome.Failed) }
        fake.failures.clear()
        fake.replies["saveRideWorkout"] = savedReply("made-once", "Sweet Spot")
        runBlocking { m.save(d) }
        val ids = fake.requests.filter { it["action"] == "saveRideWorkout" }
            .map { SpinJson.parseToJsonElement(it.getValue("payload")).jsonObject["id"]!!.jsonPrimitive.content }
        assertEquals(listOf("made-once", "made-once", "made-once", "made-once"), ids)
    }

    @Test
    fun anOfflineSaveKeepsTheDraftAndQueuesNothing() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        val cacheBefore = m.cache.value
        fake.failures["saveRideWorkout"] = IOException("no network")
        val d = draft()
        val outcome = runBlocking { m.save(d) } as SaveOutcome.Failed
        assertEquals("Couldn't save. Can't reach Thrive.", outcome.text)
        assertEquals(cacheBefore, m.cache.value)
        // Back online: nothing was queued, so nothing goes out until a person saves again.
        fake.failures.clear()
        val sentBefore = fake.count("saveRideWorkout")
        refresh(m)
        assertEquals(sentBefore, fake.count("saveRideWorkout"))
    }

    @Test
    fun aValidationProblemSendsNothing() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        val outcome = runBlocking { m.save(Draft.forNew("x")) } as SaveOutcome.Failed
        assertEquals("Give the workout a name.", outcome.text)
        assertEquals(0, fake.count("saveRideWorkout"))
    }

    @Test
    fun theSaveFailureTextsFollowTheNote() {
        fun textFor(body: String): String {
            val fake = fakeWithLibrary()
            fake.replies["saveRideWorkout"] = body
            return (runBlocking { model(fake).save(draft()) } as SaveOutcome.Failed).text
        }
        assertEquals("Couldn't save. Thrive refused this workout.", textFor("""{"success":false,"error":"x","code":"bad_request"}"""))
        assertEquals("Couldn't save. Key rejected. Check the key in Settings.", textFor("""{"success":false,"error":"Invalid or missing API key"}"""))
        assertEquals("Couldn't save. Thrive answered with an error.", textFor("""{"success":false,"error":"Lock timeout"}"""))
    }

    @Test
    fun deleteSendsTheIdAndRemovesTheRowWhateverDeletedSays() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        fake.replies["deleteRideWorkout"] = """{"success":true,"data":{"id":"a","deleted":true}}"""
        assertEquals(DeleteOutcome.Deleted, runBlocking { m.delete("a") })
        assertEquals(listOf("b"), m.cache.value!!.workouts.map { it.id })
        val sent = SpinJson.parseToJsonElement(fake.requests.last { it["action"] == "deleteRideWorkout" }.getValue("payload")).jsonObject
        assertEquals("a", sent["id"]!!.jsonPrimitive.content)

        fake.replies["deleteRideWorkout"] = """{"success":true,"data":{"id":"b","deleted":false}}"""
        assertEquals(DeleteOutcome.Deleted, runBlocking { m.delete("b") })
        assertTrue(m.cache.value!!.workouts.isEmpty())
    }

    @Test
    fun deleteOfflineChangesNothing() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        val before = m.cache.value
        fake.failures["deleteRideWorkout"] = IOException("no network")
        val outcome = runBlocking { m.delete("a") } as DeleteOutcome.Failed
        assertEquals("Couldn't delete. Can't reach Thrive.", outcome.text)
        assertEquals(before, m.cache.value)
    }

    @Test
    fun changingIntensityTouchesNeitherTheApiNorTheCache() {
        val fake = fakeWithLibrary()
        val m = model(fake)
        refresh(m)
        val requests = fake.requests.size
        val cache = m.cache.value
        val writes = persistence.writes
        var state = com.luketmoss.thrivespin.core.workout.DetailState.open("a", null)
        repeat(30) { state = state.harder() }
        state = state.preset(80).easier()
        assertEquals(79, state.intensityPct)
        assertEquals(requests, fake.requests.size)
        assertEquals(cache, m.cache.value)
        assertEquals(writes, persistence.writes)
        assertNotNull(m.cache.value)
    }

    @Test
    fun theSelectionTheValidatorPicksIsTheOffendingStep() {
        val d = draft().addRepeat().setLabel(Selection(1, 1), "")
        assertEquals(Selection(1, 1), d.problem()!!.selection)
    }
}
