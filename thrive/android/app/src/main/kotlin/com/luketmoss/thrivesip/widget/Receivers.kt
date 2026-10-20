package com.luketmoss.thrivesip.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SipWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SipWidget()

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        Scheduler.start(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        Scheduler.stop(context)
    }
}

/** Fires just after Denver midnight: redraw with zeros, read the new day, set the next alarm. */
class MidnightReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val app = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                WidgetUpdater.redraw(app)
                Scheduler.enqueueSend(app)
                Scheduler.scheduleMidnight(app)
            } finally {
                pending.finish()
            }
        }
    }
}

/** Alarms do not survive a reboot or an update; put the midnight one back and redraw. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val pending = goAsync()
        val app = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                WidgetUpdater.redraw(app)
                Scheduler.start(app)
            } finally {
                pending.finish()
            }
        }
    }
}
