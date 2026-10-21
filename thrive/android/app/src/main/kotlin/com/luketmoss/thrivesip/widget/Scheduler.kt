package com.luketmoss.thrivesip.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.luketmoss.thrivesip.core.Refresh
import com.luketmoss.thrivesip.core.nextDenverMidnight
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Every background job: the send, the 15-minute refresh, the body-tap re-reads and the Denver-midnight redraw. */
object Scheduler {
    private const val SEND = "sip-send"
    private const val PERIODIC = "sip-refresh"
    private const val BODY_TAP = "sip-body-tap"
    private const val MIDNIGHT_REQUEST = 1

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /**
     * Send what is queued, then read today's totals. Appended, not replaced or
     * dropped: a tap that arrives while a send is running still gets its own
     * run afterwards. Failing is retried with exponential backoff, and the
     * queue is what is retried, so a retry cannot lose or double a drink.
     */
    fun enqueueSend(context: Context) {
        val request = OneTimeWorkRequestBuilder<SendWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(SEND, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /**
     * The widget body was tapped (Thrive is opening): read now, again after
     * [Refresh.BODY_TAP_FIRST_MINUTES] and again after [Refresh.BODY_TAP_SECOND_MINUTES],
     * to pick up a drink fixed in the app. One unique chain, so a later tap
     * replaces it rather than stacking a second; each link is the ordinary
     * send-then-read worker, so a queued tap is always sent before any read.
     */
    fun scheduleBodyTapReads(context: Context) {
        val links = Refresh.bodyTapDelaysMinutes().map { delay ->
            OneTimeWorkRequestBuilder<SendWorker>()
                .setConstraints(online)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInitialDelay(delay, TimeUnit.MINUTES)
                .build()
        }
        var chain = WorkManager.getInstance(context)
            .beginUniqueWork(BODY_TAP, ExistingWorkPolicy.REPLACE, links.first())
        links.drop(1).forEach { chain = chain.then(it) }
        chain.enqueue()
    }

    /**
     * Android may delay a periodic run; 15 minutes is a target, not a promise.
     * UPDATE, not KEEP: a phone that installed the 30-minute request picks up
     * the new period the next time this runs (every update, boot and widget add).
     */
    fun ensurePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SendWorker>(Refresh.PERIODIC_MINUTES, TimeUnit.MINUTES)
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    /**
     * Wake just after the next Denver midnight to redraw with zeros. Inexact
     * (no special permission): Android may run it a little late, and the figure
     * is also corrected by any redraw after midnight, since a read from
     * yesterday is shown as zero.
     */
    fun scheduleMidnight(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val at = nextDenverMidnight(Instant.now()).plusSeconds(5)
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, at.toEpochMilli(), midnightIntent(context))
    }

    /** Everything a freshly added or restored widget needs. */
    fun start(context: Context) {
        ensurePeriodic(context)
        scheduleMidnight(context)
        enqueueSend(context)
    }

    fun stop(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(BODY_TAP)
        context.getSystemService(AlarmManager::class.java)?.cancel(midnightIntent(context))
    }

    private fun midnightIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            MIDNIGHT_REQUEST,
            Intent(context, MidnightReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
}
