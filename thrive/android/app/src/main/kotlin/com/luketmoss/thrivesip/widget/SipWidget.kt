package com.luketmoss.thrivesip.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.luketmoss.thrivesip.MainActivity
import com.luketmoss.thrivesip.R
import com.luketmoss.thrivesip.core.Mode
import com.luketmoss.thrivesip.core.WidgetView
import com.luketmoss.thrivesip.core.WidgetViews
import com.luketmoss.thrivesip.data.SipStore
import com.luketmoss.thrivesip.ui.SipColors
import java.time.Instant
import androidx.glance.Button
import androidx.glance.ButtonDefaults
import androidx.glance.color.ColorProvider as DayNightColorProvider

private const val THRIVE_URL = "https://luketmoss.github.io/keel/thrive/"

private val SMALL = DpSize(110.dp, 110.dp)
private val WIDE = DpSize(250.dp, 110.dp)
private val WIDE_FROM = 200.dp

private val REVISION = longPreferencesKey("revision")

private fun accent(light: Long, dark: Long): androidx.glance.unit.ColorProvider =
    DayNightColorProvider(day = Color(light), night = Color(dark))

private val WATER = accent(SipColors.WATER_LIGHT, SipColors.WATER_DARK)
private val ALCOHOL = accent(SipColors.ALCOHOL_LIGHT, SipColors.ALCOHOL_DARK)
private val ON_ACCENT = accent(SipColors.ON_ACCENT_LIGHT, SipColors.ON_ACCENT_DARK)
private val TRACK = accent(SipColors.TRACK_LIGHT, SipColors.TRACK_DARK)

/**
 * The Thrive Sip widget (design note 524, "live"). It holds no state: it is
 * drawn from [SipStore] each time [WidgetUpdater] bumps the revision in
 * Glance's own state, which is what makes a redraw reach a session that is
 * already running.
 */
class SipWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = SipStore(context)
        provideContent {
            val revision = currentState<Preferences>()[REVISION]
            val view = remember(revision) { WidgetViews.build(store.snapshot(Instant.now())) }
            GlanceTheme {
                Content(view, wide = LocalSize.current.width >= WIDE_FROM)
            }
        }
    }
}

/** Asks every placed widget to redraw from storage. */
object WidgetUpdater {
    suspend fun redraw(context: Context) {
        val widget = SipWidget()
        val ids = GlanceAppWidgetManager(context).getGlanceIds(SipWidget::class.java)
        ids.forEach { id ->
            updateAppWidgetState(context, id) { it[REVISION] = System.nanoTime() }
            widget.update(context, id)
        }
    }
}

@Composable
private fun Content(view: WidgetView, wide: Boolean) {
    val openThrive: Action = actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(THRIVE_URL)))
    val openSettings: Action = actionStartActivity<MainActivity>()
    val bodyAction = if (view.mode == Mode.NOT_CONFIGURED || view.mode == Mode.KEY_REJECTED) openSettings else openThrive
    val secondary = GlanceTheme.colors.onSurfaceVariant

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(16.dp)
            .padding(12.dp)
            .clickable(bodyAction),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Thrive Sip",
                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Bold),
            )
            if (wide && view.status.isNotEmpty() && view.mode != Mode.KEY_REJECTED) {
                Spacer(GlanceModifier.defaultWeight())
                Text(text = view.status, style = TextStyle(color = secondary, fontSize = 11.sp))
            }
        }
        Spacer(GlanceModifier.height(4.dp))

        if (view.mode == Mode.KEY_REJECTED) {
            // Either size: this is the one status that must not be dropped, since taps are going nowhere.
            Text(text = view.status, style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 11.sp))
            Spacer(GlanceModifier.height(4.dp))
        }

        if (view.headline != null && view.mode != Mode.LOADING) {
            // Not configured: the prompt sits over both (disabled) buttons.
            Text(
                text = view.headline,
                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold),
            )
        }

        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                WaterFigure(view)
                Spacer(GlanceModifier.defaultWeight())
                Button(
                    text = "+ 4 oz",
                    onClick = actionRunCallback<AddWaterAction>(),
                    enabled = view.buttonsEnabled,
                    modifier = GlanceModifier.fillMaxWidth().height(48.dp)
                        .semantics { contentDescription = "Add 4 ounces of water" },
                    colors = ButtonDefaults.buttonColors(backgroundColor = WATER, contentColor = ON_ACCENT),
                )
            }
            if (wide) {
                Spacer(GlanceModifier.width(12.dp))
                Column(modifier = GlanceModifier.defaultWeight()) {
                    AlcoholFigure(view)
                    Spacer(GlanceModifier.defaultWeight())
                    Button(
                        text = "+ 1",
                        onClick = actionRunCallback<AddAlcoholAction>(),
                        enabled = view.buttonsEnabled,
                        modifier = GlanceModifier.fillMaxWidth().height(48.dp)
                            .semantics { contentDescription = "Add one alcoholic drink" },
                        colors = ButtonDefaults.buttonColors(backgroundColor = ALCOHOL, contentColor = ON_ACCENT),
                    )
                }
            }
        }
    }
}

@Composable
private fun WaterFigure(view: WidgetView) {
    val onSurface = GlanceTheme.colors.onSurface
    val secondary = GlanceTheme.colors.onSurfaceVariant
    if (view.mode == Mode.LOADING) {
        Text(text = view.headline.orEmpty(), style = TextStyle(color = onSurface, fontSize = 14.sp))
        return
    }
    if (view.waterText == null) return
    Row(
        modifier = GlanceModifier.semantics { contentDescription = view.waterDescription },
        verticalAlignment = Alignment.Bottom,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_water),
            contentDescription = null,
            modifier = GlanceModifier.size(20.dp),
            colorFilter = ColorFilter.tint(WATER),
        )
        Spacer(GlanceModifier.width(4.dp))
        Text(text = view.waterText, style = TextStyle(color = onSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold))
        if (view.goalText != null) {
            Spacer(GlanceModifier.width(4.dp))
            Text(text = view.goalText, style = TextStyle(color = secondary, fontSize = 12.sp))
        }
    }
    Spacer(GlanceModifier.height(4.dp))
    if (view.progress != null) {
        LinearProgressIndicator(
            progress = view.progress,
            modifier = GlanceModifier.fillMaxWidth().height(6.dp),
            color = WATER,
            backgroundColor = TRACK,
        )
    }
}

@Composable
private fun AlcoholFigure(view: WidgetView) {
    val onSurface = GlanceTheme.colors.onSurface
    if (view.alcoholText == null) return
    Row(
        modifier = GlanceModifier.semantics { contentDescription = view.alcoholDescription },
        verticalAlignment = Alignment.Bottom,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_alcohol),
            contentDescription = null,
            modifier = GlanceModifier.size(20.dp),
            colorFilter = ColorFilter.tint(ALCOHOL),
        )
        Spacer(GlanceModifier.width(4.dp))
        Text(text = view.alcoholText, style = TextStyle(color = onSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold))
    }
}
