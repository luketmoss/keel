package com.luketmoss.thrivesip.widget

import android.content.Context
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
