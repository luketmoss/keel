package com.luketmoss.thrivespin.core.ftp

import com.luketmoss.thrivespin.core.library.CachePersistence
import com.luketmoss.thrivespin.core.library.LibraryCache
import com.luketmoss.thrivespin.core.library.LibraryModel
import com.luketmoss.thrivespin.core.upload.FakeTransport
import com.luketmoss.thrivespin.core.upload.UploadRun
import java.io.File
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
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

class FtpTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private var clock = 1_794_067_000_000L
    private val transport = FakeTransport()
    private var config = "https://script.example/exec" to "spin-key"
    private val sent = ArrayList<FtpRow>()

    private fun store() = FtpStore(File(tmp.root, "ftp"))

    private fun queue(): FtpQueue = FtpQueue(store(), { clock })

    private fun uploader(q: FtpQueue) = FtpUploader(q, transport, { config }, { clock }, { sent += it })

    private fun run(q: FtpQueue): UploadRun = runBlocking { uploader(q).runOnce() }

    private fun confirm(q: FtpQueue, rideId: String = "ride-1", w: Int = 262, previous: FtpNow? = null) =
        q.confirm(rideId, "2026-11-07T15:02:11Z", w, 262, previous)!!

    private fun rowReply(id: String = "ftp_ride-1", w: Int = 262) =
        """{"success":true,"data":{"id":"$id","date":"2026-11-07","ftp_w":$w,"source":"ramp_test","ride_id":"ride-1","created":"2026-11-07T15:40:13.000Z"}}"""

    // ---- The record ----

    @Test
    fun confirmingWritesOneRecordKeyedByTheRideAndARepeatIsTheSameRecord() {
        val q = queue()
        val first = confirm(q, previous = FtpNow(250, "2026-10-12", "manual", false))
        assertEquals("ftp_ride-1", first.id)
        assertEquals("2026-11-07", first.date)
        assertEquals(262, first.ftpW)
        assertEquals("ramp_test", first.source)
        assertEquals("ride-1", first.rideId)
        assertEquals(250, first.previousW)
        assertEquals("2026-10-12", first.previousDate)
        assertEquals(FtpStage.Queued, first.state)
        // A rapid second tap, even with another number, is the one record.
        val second = q.confirm("ride-1", "2026-11-07T15:02:11Z", 270, 262, null)!!
        assertEquals(262, second.ftpW)
        assertEquals(1, q.records.value.size)
        assertEquals(1, File(tmp.root, "ftp").listFiles { f -> f.name.endsWith(".json") }!!.size)
    }

    @Test
    fun theRecordsDateIsTheDenverDateOfTheTestsStartNotTheConfirmDay() {
        val q = queue()
        // 11:30 pm Denver on 7 Nov is 06:30 UTC on the 8th; the record is for the 7th even when confirmed on the 8th.
        clock = 1_794_130_000_000L
        val r = q.confirm("late", "2026-11-08T06:30:00Z", 250, 250, null)!!
        assertEquals("2026-11-07", r.date)
    }

    @Test
    fun theRecordSurvivesARestart() {
        val q = queue()
        confirm(q)
        val again = queue()
        assertEquals(listOf("ftp_ride-1"), again.records.value.map { it.id })
        assertEquals(262, again.record("ftp_ride-1")!!.ftpW)
    }

    // ---- The queue ----

    @Test
    fun theRecordIsSentAsAddFtpWithTheKeyInTheBodyAndThenRemovedAfterTheCacheTakesTheRow() {
        val q = queue()
        confirm(q)
        transport.reply = { rowReply() }
        assertEquals(UploadRun.Done, run(q))
        val call = transport.calls.single()
        assertEquals("addFtp", call["action"])
        assertEquals("spin-key", call["key"])
        val payload = Json.parseToJsonElement(call["payload"]!!).jsonObject
        assertEquals(listOf("id", "date", "ftp_w", "source", "ride_id"), payload.keys.toList())
        assertEquals("ftp_ride-1", payload["id"]!!.jsonPrimitive.content)
        assertEquals("2026-11-07", payload["date"]!!.jsonPrimitive.content)
        assertEquals(262, payload["ftp_w"]!!.jsonPrimitive.content.toInt())
        assertEquals("ramp_test", payload["source"]!!.jsonPrimitive.content)
        assertEquals("ride-1", payload["ride_id"]!!.jsonPrimitive.content)
        assertEquals(listOf(FtpRow("ftp_ride-1", "2026-11-07", 262, "ramp_test", "2026-11-07T15:40:13.000Z")), sent)
        assertTrue(q.records.value.isEmpty())
        assertNull(store().read("ftp_ride-1"))
    }

    @Test
    fun anExistingRowAnswersSuccessAndIsDone() {
        val q = queue()
        confirm(q)
        transport.reply = { FakeTransport.ok("exists") }
        run(q)
        assertTrue(q.records.value.isEmpty())
    }

    @Test
    fun aNetworkFailureKeepsTheRecordQueuedAndNeverMakesItStuck() {
        val q = queue()
        confirm(q)
        transport.failure = IOException("offline")
        repeat(15) { assertEquals(UploadRun.Retry, run(q)) }
        val r = q.record("ftp_ride-1")!!
        assertEquals(FtpStage.Queued, r.state)
        assertEquals(15, r.attempts)
        assertNotNull(r.lastTryUtc)
        assertEquals(0, r.serverErrors)
        // A body that is not the envelope is a network failure too.
        transport.failure = null
        transport.reply = { "<html>" }
        run(q)
        assertEquals(FtpStage.Queued, q.record("ftp_ride-1")!!.state)
    }

    @Test
    fun theTenthServerErrorInARowMakesItStuckAndTheNinthDoesNot() {
        val q = queue()
        confirm(q)
        transport.reply = { FakeTransport.error("Lock timeout", "lock_timeout") }
        repeat(9) { assertEquals(UploadRun.Retry, run(q)) }
        assertEquals(FtpStage.Queued, q.record("ftp_ride-1")!!.state)
        assertEquals(UploadRun.Done, run(q))
        val r = q.record("ftp_ride-1")!!
        assertEquals(FtpStage.Stuck, r.state)
        assertEquals(10, r.serverErrors)
        // Stuck is not tried again by itself; Try again puts it back with the counters reset.
        val calls = transport.calls.size
        run(q)
        assertEquals(calls, transport.calls.size)
        assertTrue(q.retry("ftp_ride-1"))
        assertEquals(FtpStage.Queued, q.record("ftp_ride-1")!!.state)
        assertEquals(0, q.record("ftp_ride-1")!!.serverErrors)
    }

    @Test
    fun aNetworkFailureBetweenServerErrorsResetsTheRun() {
        val q = queue()
        confirm(q)
        transport.reply = { FakeTransport.error("Lock timeout", "lock_timeout") }
        repeat(9) { run(q) }
        transport.failure = IOException("offline")
        run(q)
        transport.failure = null
        run(q)
        assertEquals(FtpStage.Queued, q.record("ftp_ride-1")!!.state)
        assertEquals(1, q.record("ftp_ride-1")!!.serverErrors)
    }

    @Test
    fun aRefusedKeyIsNeedsKeyAndStopsTheRunSpendingNoAttempt() {
        val q = queue()
        confirm(q, "a")
        clock += 1000
        confirm(q, "b")
        transport.reply = { FakeTransport.error("Invalid or missing API key") }
        assertEquals(UploadRun.Done, run(q))
        assertEquals(1, transport.calls.size)
        assertEquals(listOf(FtpStage.NeedsKey, FtpStage.NeedsKey), q.records.value.map { it.state })
        assertEquals(0, q.record("ftp_a")!!.attempts)
        // The spin key's own refusal reads the same.
        transport.reply = { FakeTransport.error("Spin caller: this action is not permitted", "spin_forbidden") }
        q.settingsSaved()
        run(q)
        assertEquals(FtpStage.NeedsKey, q.record("ftp_a")!!.state)
    }

    @Test
    fun noUrlOrKeyIsNeedsSetupAndSavingSettingsPutsItBack() {
        val q = queue()
        confirm(q)
        config = "" to ""
        assertEquals(UploadRun.Done, run(q))
        assertTrue(transport.calls.isEmpty())
        assertEquals(FtpStage.NeedsSetup, q.record("ftp_ride-1")!!.state)
        config = "https://script.example/exec" to ""
        q.settingsSaved()
        run(q)
        assertEquals(FtpStage.NeedsSetup, q.record("ftp_ride-1")!!.state)
        config = "https://script.example/exec" to "spin-key"
        assertEquals(1, q.settingsSaved())
        assertEquals(FtpStage.Queued, q.record("ftp_ride-1")!!.state)
        transport.reply = { rowReply() }
        run(q)
        assertTrue(q.records.value.isEmpty())
    }

    @Test
    fun badRequestIsRejectedWithTheServersTextAndNeverRetriedByItself() {
        val q = queue()
        confirm(q)
        transport.reply = { FakeTransport.error("ftp_w must be 50-1000", "bad_request") }
        assertEquals(UploadRun.Done, run(q))
        val r = q.record("ftp_ride-1")!!
        assertEquals(FtpStage.Rejected, r.state)
        assertEquals("ftp_w must be 50-1000", r.message)
        run(q)
        run(q)
        assertEquals(1, transport.calls.size)
        // Try again sends it once more.
        transport.reply = { rowReply() }
        assertTrue(q.retry("ftp_ride-1"))
        run(q)
        assertEquals(2, transport.calls.size)
        assertTrue(q.records.value.isEmpty())
    }

    @Test
    fun recordsGoOldestFirstOneAtATime() {
        val q = queue()
        confirm(q, "a", 250)
        clock += 5000
        confirm(q, "b", 260)
        transport.reply = { rowReply() }
        run(q)
        assertEquals(listOf("ftp_a", "ftp_b"), transport.calls.map { Json.parseToJsonElement(it["payload"]!!).jsonObject["id"]!!.jsonPrimitive.content })
    }

    @Test
    fun droppingARecordDeletesItAndNothingElse() {
        val q = queue()
        confirm(q, "a")
        confirm(q, "b")
        q.drop("ftp_a")
        assertEquals(listOf("ftp_b"), q.records.value.map { it.id })
    }

    @Test
    fun aFullPhoneMeansNoRecordWasWritten() {
        val blocker = File(tmp.root, "ftp").also { it.writeText("not a directory") }
        assertTrue(blocker.isFile)
        val q = FtpQueue(FtpStore(blocker), { clock })
        assertNull(q.confirm("ride-1", "2026-11-07T15:02:11Z", 262, 262, null))
        assertTrue(q.records.value.isEmpty())
    }

    // ---- CurrentFtp ----

    private fun cache(w: Int?, date: String = "2026-10-12", source: String = "manual", created: String = "2026-10-12T14:00:00Z") =
        LibraryCache(emptyList(), 0, w, emptyList(), "", 0L, ftpDate = date, ftpSource = source, ftpCreated = created)

    @Test
    fun currentFtpIsTheNewestOfTheCacheAndEveryRecordNotYetSent() {
        val q = queue()
        confirm(q, "a", 262)
        val records = q.records.value
        assertEquals(FtpNow(262, "2026-11-07", "ramp_test", pending = true), CurrentFtp.of(cache(250), records))
        // A Library refresh that returns the old row while a record is queued still gives the new FTP.
        assertEquals(262, CurrentFtp.of(cache(250), records)!!.ftpW)
        // Dropping the record gives the old one back.
        q.drop("ftp_a")
        assertEquals(FtpNow(250, "2026-10-12", "manual", pending = false), CurrentFtp.of(cache(250), q.records.value))
        // The cache alone gives its own; neither gives none.
        assertEquals(250, CurrentFtp.of(cache(250), emptyList())!!.ftpW)
        assertNull(CurrentFtp.of(cache(null), emptyList()))
        assertNull(CurrentFtp.of(null, emptyList()))
    }

    @Test
    fun aRejectedOrFailedRecordStaysInForceUntilTheyDropIt() {
        val q = queue()
        confirm(q, "a", 262)
        transport.reply = { FakeTransport.error("no", "bad_request") }
        run(q)
        assertEquals(FtpStage.Rejected, q.record("ftp_a")!!.state)
        assertEquals(262, CurrentFtp.of(cache(250), q.records.value)!!.ftpW)
        q.drop("ftp_a")
        assertEquals(250, CurrentFtp.of(cache(250), q.records.value)!!.ftpW)
    }

    @Test
    fun aNewerRowInTheCacheOutranksAnOlderRecordAndSameDayRowsBreakOnCreation() {
        val q = queue()
        confirm(q, "a", 262)
        // Someone set a newer FTP by hand since: the cache's row is newer by date.
        assertEquals(270, CurrentFtp.of(cache(270, date = "2026-11-09"), q.records.value)!!.ftpW)
        // Same date: the later creation wins. The record was made at 2026-11-07T15:..., the cache row after it.
        assertEquals(255, CurrentFtp.of(cache(255, date = "2026-11-07", created = "2099-01-01T00:00:00Z"), q.records.value)!!.ftpW)
        assertEquals(262, CurrentFtp.of(cache(255, date = "2026-11-07", created = "2000-01-01T00:00:00Z"), q.records.value)!!.ftpW)
        // Two tests before the first was sent: the newest wins and both go.
        clock += 60_000
        confirm(q, "b", 265)
        assertEquals(265, CurrentFtp.of(cache(250), q.records.value)!!.ftpW)
    }

    @Test
    fun whenAnFtpIsSentTheLibraryCacheTakesTheReturnedRowAndASecondRefreshAgrees() {
        val persisted = ArrayList<String>()
        val persistence = object : CachePersistence {
            override fun read(): String? = null

            override fun write(text: String) {
                persisted += text
            }
        }
        val model = LibraryModel(persistence, transport, { config })
        model.setCurrentFtp(FtpRow("x", "2026-10-12", 250, "manual", "2026-10-12T14:00:00Z"))
        assertEquals(250, model.cache.value!!.ftpW)
        val q = queue()
        confirm(q)
        transport.reply = { rowReply() }
        runBlocking { FtpUploader(q, transport, { config }, { clock }, { model.setCurrentFtp(it) }).runOnce() }
        val c = model.cache.value!!
        assertEquals(262, c.ftpW)
        assertEquals("2026-11-07", c.ftpDate)
        assertEquals("ramp_test", c.ftpSource)
        assertTrue(q.records.value.isEmpty())
        assertEquals(262, CurrentFtp.of(c, q.records.value)!!.ftpW)
        assertFalse(CurrentFtp.of(c, q.records.value)!!.pending)
        assertTrue(persisted.last().contains("\"ftpW\":262"))
        // An older row never replaces a newer cached one.
        model.setCurrentFtp(FtpRow("old", "2026-09-01", 200, "manual", "2026-09-01T00:00:00Z"))
        assertEquals(262, model.cache.value!!.ftpW)
    }

    // ---- Words ----

    @Test
    fun theBannerCountsRecordsNotSentAndOpensTheOldestOfTheMostUrgentState() {
        assertNull(PendingFtp.banner(emptyList()))
        fun rec(id: String, stage: FtpStage, at: String) =
            FtpRecord(id = id, state = stage, date = "2026-11-07", ftpW = 262, rideId = id, computedW = 262, createdAtUtc = at)
        val queued = PendingFtp.banner(listOf(rec("b", FtpStage.Queued, "2"), rec("a", FtpStage.Queued, "1")))!!
        assertEquals("2 FTP changes are waiting to send to Thrive", queued.text)
        assertFalse(queued.urgent)
        assertEquals("a", queued.recordId)
        assertEquals("Details", queued.button)
        assertEquals("1 FTP change is waiting to send to Thrive", PendingFtp.banner(listOf(rec("a", FtpStage.Queued, "1")))!!.text)
        for (stage in listOf(FtpStage.Rejected, FtpStage.NeedsKey, FtpStage.NeedsSetup, FtpStage.Stuck)) {
            val b = PendingFtp.banner(listOf(rec("a", FtpStage.Queued, "1"), rec("c", stage, "3"), rec("d", stage, "2")))!!
            assertTrue(b.urgent)
            assertEquals("2 FTP changes couldn't be saved to Thrive", b.text)
            assertEquals("d", b.recordId)
        }
        assertEquals("1 FTP change couldn't be saved to Thrive", PendingFtp.banner(listOf(rec("a", FtpStage.Stuck, "1")))!!.text)
    }

    @Test
    fun theSheetWordsEachStateAndTheDropDialogNamesWhatSpinGoesBackTo() {
        fun rec(stage: FtpStage, previous: Int? = 250, message: String? = null) = FtpRecord(
            id = "ftp_a", state = stage, date = "2026-11-07", ftpW = 262, rideId = "a", computedW = 262, previousW = previous,
            createdAtUtc = "2026-11-07T15:40:12Z", message = message,
        )
        val queued = FtpText.sheet(rec(FtpStage.Queued), 2026)
        assertEquals("FTP 262 W", queued.title)
        assertEquals("Set by a ramp test on 7 Nov. Spin is using it now.", queued.line)
        assertEquals("Saved on phone, not yet in Thrive · sends when online.", queued.status)
        assertEquals(FtpSheetAction.SendNow, queued.action)
        assertEquals("Drop this FTP change?", queued.dropTitle)
        assertEquals(
            "FTP 262 W from the ramp test on 7 Nov will not be added to Thrive's FTP history. Spin goes back to 250 W.",
            queued.dropBody,
        )
        assertEquals(
            "FTP 262 W from the ramp test on 7 Nov will not be added to Thrive's FTP history. Spin goes back to having no FTP.",
            FtpText.sheet(rec(FtpStage.Queued, previous = null), 2026).dropBody,
        )
        assertEquals("Key rejected. Check the key in Settings.", FtpText.sheet(rec(FtpStage.NeedsKey), 2026).status)
        assertEquals(FtpSheetAction.OpenSettings, FtpText.sheet(rec(FtpStage.NeedsKey), 2026).action)
        assertEquals("Add the API URL and key in Settings.", FtpText.sheet(rec(FtpStage.NeedsSetup), 2026).status)
        assertEquals(FtpSheetAction.OpenSettings, FtpText.sheet(rec(FtpStage.NeedsSetup), 2026).action)
        assertEquals("Thrive keeps answering with an error. It stopped trying.", FtpText.sheet(rec(FtpStage.Stuck), 2026).status)
        assertEquals(FtpSheetAction.TryAgain, FtpText.sheet(rec(FtpStage.Stuck), 2026).action)
        assertEquals(
            "Thrive refused this change: ftp_w must be 50-1000. It wasn't sent again.",
            FtpText.sheet(rec(FtpStage.Rejected, message = "ftp_w must be 50-1000"), 2026).status,
        )
    }

    @Test
    fun theLibraryCardSaysWhatTheFtpIsAndHowItWasSet() {
        assertEquals("FTP 262 W · set 7 Nov by a ramp test", FtpText.cardLine(FtpNow(262, "2026-11-07", "ramp_test", true), 2026))
        assertEquals("FTP 250 W · set 12 Oct by hand", FtpText.cardLine(FtpNow(250, "2026-10-12", "manual", false), 2026))
        assertEquals("FTP 250 W · set 12 Oct 2025 by hand", FtpText.cardLine(FtpNow(250, "2025-10-12", "manual", false), 2026))
        assertEquals("FTP 250 W", FtpText.cardLine(FtpNow(250, "", "", false), 2026))
        assertEquals("No FTP yet. Ride the ramp test to set one.", FtpText.cardLine(null, 2026))
    }

    @Test
    fun theSetStatusLineFollowsTheRecordsState() {
        fun rec(stage: FtpStage) = FtpRecord(id = "a", state = stage, date = "d", ftpW = 1, rideId = "a", computedW = 1, createdAtUtc = "t")
        assertEquals("Spin uses it now. Added to Thrive's FTP history.", FtpText.setStatus(null))
        assertEquals("Spin uses it now. Saved on phone, not yet in Thrive · sends when online.", FtpText.setStatus(rec(FtpStage.Queued)))
        assertEquals("Spin uses it now. Thrive refused it. It's still on this phone.", FtpText.setStatus(rec(FtpStage.Rejected)))
        assertEquals("Spin uses it now. Key rejected.", FtpText.setStatus(rec(FtpStage.NeedsKey)))
        assertEquals("Spin uses it now. Spin isn't set up.", FtpText.setStatus(rec(FtpStage.NeedsSetup)))
        assertEquals("Spin uses it now. Thrive keeps answering with an error.", FtpText.setStatus(rec(FtpStage.Stuck)))
    }
}
