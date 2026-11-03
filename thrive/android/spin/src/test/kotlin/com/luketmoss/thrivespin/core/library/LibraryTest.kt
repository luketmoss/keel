package com.luketmoss.thrivespin.core.library

import com.luketmoss.thrivespin.core.workout.EXAMPLE_STEPS
import com.luketmoss.thrivespin.core.workout.Step
import com.luketmoss.thrivespin.core.workout.StepMode
import com.luketmoss.thrivespin.core.workout.StepsV1
import com.luketmoss.thrivespin.core.workout.exampleSteps
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LibraryTest {
    private val today = LocalDate.of(2026, 11, 10)

    private fun w(id: String, name: String, seconds: Int, category: String = "Endurance", description: String = "") =
        RideWorkout(id, name, category, description, StepsV1(listOf(Step("A", seconds, StepMode.Erg, pct = 70))))

    private fun cache(
        workouts: List<RideWorkout>,
        plans: List<PlanRow> = emptyList(),
        plansDate: String = today.toString(),
        unreadable: Int = 0,
        ftp: Int? = 250,
    ) = LibraryCache(workouts, unreadable, ftp, plans, plansDate, 0L)

    @Test
    fun theListIsSortedByTotalThenName() {
        val list = listOf(w("1", "Zeta", 1800), w("2", "alpha", 3600), w("3", "Beta", 1800), w("4", "Alpha", 3600))
        assertEquals(listOf("Beta", "Zeta", "Alpha", "alpha"), LibraryView.sorted(list).map { it.name })
    }

    @Test
    fun searchIgnoresCaseAndAccentsOverNameAndDescription() {
        val list = listOf(
            w("1", "Café Ride", 1800, description = "easy spin"),
            w("2", "Hills", 1800, description = "Steady CLIMBING"),
        )
        assertEquals(listOf("1"), LibraryView.filter(list, null, "cafe").map { it.id })
        assertEquals(listOf("1"), LibraryView.filter(list, null, "CAFÉ").map { it.id })
        assertEquals(listOf("2"), LibraryView.filter(list, null, "climb").map { it.id })
        assertEquals(listOf("1", "2"), LibraryView.filter(list, null, "  ").map { it.id })
        assertTrue(LibraryView.filter(list, null, "xyz").isEmpty())
    }

    @Test
    fun chipsAndSearchCombine() {
        val list = listOf(
            w("1", "Easy Spin", 1800, "Recovery"),
            w("2", "Easy Climb", 1800, "Endurance"),
            w("3", "Hard", 1800, "Recovery"),
        )
        assertEquals(listOf("1"), LibraryView.filter(list, "Recovery", "easy").map { it.id })
        assertEquals(listOf("1", "3"), LibraryView.filter(list, "Recovery", "").map { it.id })
        assertEquals(3, LibraryView.filter(list, null, "").size)
    }

    @Test
    fun theHeadingReads() {
        assertEquals("All workouts · 12", LibraryView.heading(null, "", 12))
        assertEquals("Sweet spot · 3", LibraryView.heading("Sweet spot", "", 3))
        assertEquals("2 matching", LibraryView.heading(null, "easy", 2))
        assertEquals("2 matching", LibraryView.heading("VO2", "easy", 2))
        assertEquals("Search 48 workouts", LibraryView.searchPlaceholder(48))
    }

    @Test
    fun aRowWhoseStepsFailTheValidatorIsLeftOutAndCounted() {
        val good = """{"id":"a","name":"Good","category":"Endurance","description":"","steps":$EXAMPLE_STEPS,"duration_s":4440,"last_ridden_date":""}"""
        val nested = """{"id":"b","name":"Bad","category":"Endurance","description":"","steps":{"v":1,"steps":[{"repeat":2,"steps":[{"repeat":2,"steps":[{"label":"A","dur_s":60,"mode":"free"}]}]}]},"last_ridden_date":""}"""
        val v2 = """{"id":"c","name":"V2","category":"Endurance","description":"","steps":{"v":2,"steps":[]},"last_ridden_date":""}"""
        val nulled = """{"id":"d","name":"Null","category":"Endurance","description":"","steps":null,"last_ridden_date":""}"""
        val data = com.luketmoss.thrivespin.core.SpinJson.parseToJsonElement("[$good,$nested,$v2,$nulled]")
        val read = LibraryRows.workouts(data)
        assertEquals(listOf("a"), read.readable.map { it.id })
        assertEquals(3, read.unreadable)
        assertNull(LibraryView.unreadableText(0))
        assertEquals("1 workout couldn't be read.", LibraryView.unreadableText(1))
        assertEquals("3 workouts couldn't be read.", LibraryView.unreadableText(3))
    }

    @Test
    fun lastRiddenReadsAtEveryBoundary() {
        fun at(daysAgo: Long) = LibraryView.lastRidden(today.minusDays(daysAgo).toString(), today)
        assertEquals("Ridden today", at(0))
        assertEquals("Ridden yesterday", at(1))
        assertEquals("Ridden 2 days ago", at(2))
        assertEquals("Ridden 13 days ago", at(13))
        assertEquals("Ridden 2 weeks ago", at(14))
        assertEquals("Ridden 8 weeks ago", at(59))
        assertEquals("Ridden Sep 11, 2026", at(60))
        assertEquals("Never ridden", LibraryView.lastRidden("", today))
        assertEquals("Never ridden", LibraryView.lastRidden("not a date", today))
    }

    @Test
    fun plannedTodayKeepsOnlyPlannedBikeRowsWithAWorkoutInTimeOrder() {
        val data = com.luketmoss.thrivespin.core.SpinJson.parseToJsonElement(
            """[
              {"id":"p1","type":"bike","status":"planned","time":"18:00","name":"Evening","ride_workout_id":"w2"},
              {"id":"p2","type":"bike","status":"planned","time":"06:30","name":"Morning","ride_workout_id":"w1"},
              {"id":"p3","type":"weight","status":"planned","time":"07:00","name":"Lift","ride_workout_id":"w1"},
              {"id":"p4","type":"bike","status":"planned","time":"08:00","name":"No link","ride_workout_id":""},
              {"id":"p5","type":"bike","status":"active","time":"09:00","name":"Active","ride_workout_id":"w1"},
              {"id":"p6","type":"bike","status":"planned","time":"12:00","name":"Gone","ride_workout_id":"w9"}
            ]""",
        )
        val plans = LibraryRows.bikePlans(data)
        val cards = LibraryView.planned(cache(listOf(w("w1", "One", 600), w("w2", "Two", 600)), plans), today)
        assertEquals(listOf("Morning", "Gone", "Evening"), cards.map { it.planName })
        assertEquals("One", cards[0].workout?.name)
        assertNull(cards[1].workout)
        assertEquals("Two", cards[2].workout?.name)
    }

    @Test
    fun cachedPlansFromBeforeTodayAreNotShown() {
        val plans = listOf(PlanRow("p1", "Old", "06:30", "planned", "w1"))
        val c = cache(listOf(w("w1", "One", 600)), plans, plansDate = today.minusDays(1).toString())
        assertTrue(LibraryView.planned(c, today).isEmpty())
        assertEquals(false, LibraryView.isPlannedToday(c, "w1", today))
        val fresh = c.copy(plansDate = today.toString())
        assertEquals(true, LibraryView.isPlannedToday(fresh, "w1", today))
    }

    @Test
    fun theCurrentFtpIsReadOrNull() {
        val json = com.luketmoss.thrivespin.core.SpinJson
        assertEquals(250, LibraryRows.currentFtp(json.parseToJsonElement("""{"current":{"ftp_w":"250"},"history":[]}""")))
        assertEquals(250, LibraryRows.currentFtp(json.parseToJsonElement("""{"current":{"ftp_w":250}}""")))
        assertNull(LibraryRows.currentFtp(json.parseToJsonElement("""{"current":null,"history":[]}""")))
        assertNull(LibraryRows.currentFtp(null))
    }

    @Test
    fun theRefreshTimeReadsAsAClockTodayElseADate() {
        val zone = ZoneId.of("UTC")
        val at = java.time.LocalDateTime.of(2026, 11, 10, 15, 5).atZone(zone).toInstant().toEpochMilli()
        val sameDay = java.time.LocalDateTime.of(2026, 11, 10, 20, 0).atZone(zone).toInstant().toEpochMilli()
        val later = java.time.LocalDateTime.of(2026, 11, 12, 8, 0).atZone(zone).toInstant().toEpochMilli()
        assertEquals("3:05 PM", LibraryView.refreshedAt(at, sameDay, zone))
        assertEquals("Nov 10", LibraryView.refreshedAt(at, later, zone))
        assertEquals("Offline · library from 3:05 PM", LibraryView.staleNotice(Reason.Network, at, sameDay, zone))
        assertEquals("Couldn't refresh · library from Nov 10", LibraryView.staleNotice(Reason.ApiError, at, later, zone))
    }

    @Test
    fun theCacheSurvivesBeingStoredAndReadBack() {
        val c = cache(listOf(RideWorkout("a", "Good", "Endurance", "d", exampleSteps(), "2026-11-01")), unreadable = 2)
        assertEquals(c, LibraryCodec.decode(LibraryCodec.encode(c)))
        assertNull(LibraryCodec.decode(null))
        assertNull(LibraryCodec.decode("{not json"))
        assertNull(LibraryCodec.decode("""{"workouts":"wrong"}"""))
    }

    @Test
    fun aWorkoutCardsEstimatesAreAt100Percent() {
        val e = RideWorkout("a", "Good", "Endurance", "", exampleSteps()).estimates
        assertEquals(61, e.tss)
        assertEquals("0.70", e.ifText)
    }
}
