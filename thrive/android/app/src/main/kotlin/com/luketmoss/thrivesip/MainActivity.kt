package com.luketmoss.thrivesip

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.luketmoss.thrivesip.core.ConnectionTest
import com.luketmoss.thrivesip.core.TestResult
import com.luketmoss.thrivesip.data.OkHttpTransport
import com.luketmoss.thrivesip.data.SipStore
import com.luketmoss.thrivesip.ui.SettingsScreen
import com.luketmoss.thrivesip.ui.SipTheme
import com.luketmoss.thrivesip.widget.Scheduler
import com.luketmoss.thrivesip.widget.WidgetUpdater
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * The app's one screen: API URL and key. It is also the widget's configuration
 * activity, so adding the widget lands here; the result is OK from the first
 * moment, so backing out still places the widget (it then says "Set up Thrive Sip").
 */
class MainActivity : ComponentActivity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
            // A widget with a configuration activity gets no first update from the system.
            CoroutineScope(Dispatchers.Default).launch {
                WidgetUpdater.redraw(applicationContext)
                Scheduler.start(applicationContext)
            }
        }

        val store = SipStore(this)
        setContent {
            SipTheme {
                SettingsScreen(
                    initialUrl = store.savedUrl(),
                    initialKey = store.savedKey(),
                    onTest = { url, key -> ConnectionTest.run(url, key, OkHttpTransport) },
                    onSave = { url, key -> save(store, url, key) },
                )
            }
        }
    }

    /** Opening the settings app re-reads totals, so the widget is current when you get back to it. */
    override fun onStart() {
        super.onStart()
        Scheduler.enqueueSend(applicationContext)
    }

    private suspend fun save(store: SipStore, url: String, key: String): TestResult? {
        if (!ConnectionTest.isValidUrl(url)) return TestResult.BadUrl
        store.saveConfig(url, key)
        WidgetUpdater.redraw(applicationContext)
        // Whatever was queued while the key was wrong goes out now.
        Scheduler.start(applicationContext)
        // Opened to configure a widget: the system places it only when this
        // activity finishes, so Save has to end the screen or nothing appears.
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
            finish()
        }
        return null
    }
}
