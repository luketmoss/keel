package com.luketmoss.thrivesip.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import com.luketmoss.thrivesip.core.Kind
import com.luketmoss.thrivesip.core.Outbox
import com.luketmoss.thrivesip.core.Volume
import com.luketmoss.thrivesip.data.SipStore

class AddWaterAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        Tap.log(context, Kind.WATER, Volume.QUICK_WATER_ML)
    }
}

/**
 * The widget body when it is set up: open Thrive, and schedule the re-reads
 * that pick up a fix made there. Not-configured and key-rejected widgets use
 * a plain start-activity action for settings instead and never reach this.
 */
class OpenThriveAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        // Open first, so nothing about scheduling can delay or lose the tap's one visible job.
        try {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(THRIVE_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (e: Exception) {
            Log.w("OpenThriveAction", "could not open Thrive", e)
        }
        Scheduler.scheduleBodyTapReads(context)
    }
}

class AddAlcoholAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        Tap.log(context, Kind.ALCOHOL, 1)
    }
}

/**
 * What a button press does, and all it does: queue the drink (with its id and
 * the instant of the tap), show it at once, and ask for a send. The network
 * is WorkManager's, never this callback's.
 */
private object Tap {
    suspend fun log(context: Context, kind: String, amount: Int) {
        val store = SipStore(context)
        if (store.config() == null) return // not set up: the buttons log nothing
        Outbox(store).enqueue(kind, amount)
        buzz(context)
        WidgetUpdater.redraw(context)
        Scheduler.enqueueSend(context)
    }

    private fun buzz(context: Context) {
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        vibrator.vibrate(VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE))
    }
}

const val THRIVE_URL = "https://luketmoss.github.io/keel/thrive/"
