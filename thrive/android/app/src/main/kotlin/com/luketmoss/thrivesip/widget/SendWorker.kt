package com.luketmoss.thrivesip.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.luketmoss.thrivesip.core.FlushResult
import com.luketmoss.thrivesip.core.Outbox
import com.luketmoss.thrivesip.core.SipApi
import com.luketmoss.thrivesip.core.TotalsOutcome
import com.luketmoss.thrivesip.data.OkHttpTransport
import com.luketmoss.thrivesip.data.SipStore
import java.time.Instant

/**
 * Send the queue, then re-read today's totals, then redraw. The one place the
 * widget talks to the network, run by WorkManager so it survives the app being
 * killed and waits for a connection.
 */
class SendWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val store = SipStore(applicationContext)
        val config = store.config() ?: return Result.success()
        val api = SipApi(config.url, config.key, OkHttpTransport)

        when (Outbox(store).flush(api)) {
            FlushResult.Done -> Unit
            FlushResult.KeyRejected -> return rejected(store)
            FlushResult.Failed -> {
                WidgetUpdater.redraw(applicationContext)
                return Result.retry()
            }
        }

        return when (val read = api.totals()) {
            is TotalsOutcome.Ok -> {
                store.saveTotals(read.totals, Instant.now())
                store.setKeyRejected(false)
                WidgetUpdater.redraw(applicationContext)
                Result.success()
            }
            TotalsOutcome.KeyRejected -> rejected(store)
            TotalsOutcome.Failed -> {
                WidgetUpdater.redraw(applicationContext)
                Result.retry()
            }
        }
    }

    /** Taps stay queued. Retrying with the same key would be refused again; saving a new one starts a send. */
    private suspend fun rejected(store: SipStore): Result {
        store.setKeyRejected(true)
        WidgetUpdater.redraw(applicationContext)
        return Result.success()
    }
}
