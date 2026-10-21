package com.luketmoss.thrivesip.core

/**
 * When the widget re-reads totals it did not log itself (#555). Plain numbers,
 * so the schedule is pinned by JVM tests; the WorkManager wiring is
 * `widget/Scheduler.kt`.
 */
object Refresh {
    /** The periodic read. 15 minutes is WorkManager's minimum; Android may still run it late under Doze. */
    const val PERIODIC_MINUTES = 15L

    /** Re-reads after a body tap, counted from the tap: one minute and five minutes. */
    const val BODY_TAP_FIRST_MINUTES = 1L
    const val BODY_TAP_SECOND_MINUTES = 5L

    /** Minutes from the tap to each read. The first is the immediate send-then-read. */
    val BODY_TAP_OFFSETS_MINUTES: List<Long> = listOf(0L, BODY_TAP_FIRST_MINUTES, BODY_TAP_SECOND_MINUTES)

    /**
     * The wait before each read in a chain where every read starts only once the
     * one before it has finished: the gaps between [BODY_TAP_OFFSETS_MINUTES],
     * so 0, 1 and 4 minutes put the reads at about 0, 1 and 5.
     */
    fun bodyTapDelaysMinutes(): List<Long> =
        BODY_TAP_OFFSETS_MINUTES.mapIndexed { i, at -> at - (BODY_TAP_OFFSETS_MINUTES.getOrNull(i - 1) ?: 0L) }
}
