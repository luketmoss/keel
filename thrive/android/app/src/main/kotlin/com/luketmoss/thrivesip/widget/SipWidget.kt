package com.luketmoss.thrivesip.widget

import android.content.Context
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
import androidx.glance.action.actionStartActivity
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
import androidx.glance.layout.Box
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
import androidx.glance.color.ColorProvider as DayNightColorProvider

// Two heights and three widths. Responsive mode draws the largest declared size
// that fits. The base heights are 0dp, so a widget of any height gets the stacked
// layout (figures over buttons): the one-row layout of #524 and #561 is gone.
private val SMALL = DpSize(110.dp, 0.dp)
private val WIDE = DpSize(250.dp, 0.dp)
private val SMALL_TALL = DpSize(110.dp, 150.dp)
private val WIDE_TALL = DpSize(250.dp, 150.dp)

/**
 * 310dp wide or more: a fourth fixed column for Unwind (#591).
 * Water keeps 105dp: 310 - 24 (padding) - 3 * 8 (gaps) - 3 * 52 (counts) = 106.
 */
private val WIDEST = DpSize(310.dp, 0.dp)
private val WIDEST_TALL = DpSize(310.dp, 150.dp)
private val WIDE_FROM = 200.dp
private val WIDEST_FROM = 310.dp

/**
 * A coffee, alcohol or Unwind column: icon and count over a button. Water takes
 * the rest, so a wider widget only widens water.
 */
private val COUNT_COLUMN = 52.dp
private val COLUMN_GAP = 8.dp

/** From this up the title and status line are shown above the figures. */
private val TALL_FROM = 150.dp

private val BUTTON_HEIGHT = 40.dp

private val REVISION = longPreferencesKey("revision")

private fun accent(light: Long, dark: Long): androidx.glance.unit.ColorProvider =
    DayNightColorProvider(day = Color(light), night = Color(dark))

private val WATER = accent(SipColors.WATER_LIGHT, SipColors.WATER_DARK)
private val COFFEE = accent(SipColors.COFFEE_LIGHT, SipColors.COFFEE_DARK)
private val ALCOHOL = accent(SipColors.ALCOHOL_LIGHT, SipColors.ALCOHOL_DARK)
private val UNWIND = accent(SipColors.UNWIND_LIGHT, SipColors.UNWIND_DARK)
private val ON_ACCENT = accent(SipColors.ON_ACCENT_LIGHT, SipColors.ON_ACCENT_DARK)
private val TRACK = accent(SipColors.TRACK_LIGHT, SipColors.TRACK_DARK)

/**
 * The Thrive Sip widget (design note 524, "live"). It holds no state: it is
 * drawn from [SipStore] each time [WidgetUpdater] bumps the revision in
 * Glance's own state, which is what makes a redraw reach a session that is
 * already running.
 */
class SipWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE, SMALL_TALL, WIDE_TALL, WIDEST, WIDEST_TALL))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = SipStore(context)
        provideContent {
            val revision = currentState<Preferences>()[REVISION]
            val view = remember(revision) { WidgetViews.build(store.snapshot(Instant.now())) }
            GlanceTheme {
                val size = LocalSize.current
                Content(
                    view,
                    wide = size.width >= WIDE_FROM,
                    tall = size.height >= TALL_FROM,
                    widest = size.width >= WIDEST_FROM,
                )
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
private fun Content(view: WidgetView, wide: Boolean, tall: Boolean, widest: Boolean) {
    val openThrive: Action = actionStartActivity<OpenThriveActivity>()
    val openSettings: Action = actionStartActivity<MainActivity>()
    val bodyAction = if (view.mode == Mode.NOT_CONFIGURED || view.mode == Mode.KEY_REJECTED) openSettings else openThrive
    val secondary = GlanceTheme.colors.onSurfaceVariant

    // Built in rows, not per-drink columns, so the two figures share a
    // baseline and the two buttons share a top edge whatever either side holds.
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(16.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .clickable(bodyAction),
    ) {
        if (tall) {
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
            Spacer(GlanceModifier.height(6.dp))
        }

        if (view.mode == Mode.KEY_REJECTED) {
            // Every size: the one status that must not be dropped, since taps are going nowhere.
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

        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(modifier = GlanceModifier.defaultWeight()) { WaterFigure(view) }
            if (wide) {
                Spacer(GlanceModifier.width(COLUMN_GAP))
                Column(modifier = GlanceModifier.width(COUNT_COLUMN)) { CoffeeFigure(view) }
                Spacer(GlanceModifier.width(COLUMN_GAP))
                Column(modifier = GlanceModifier.width(COUNT_COLUMN)) { AlcoholFigure(view) }
            }
            if (widest) {
                Spacer(GlanceModifier.width(COLUMN_GAP))
                Column(modifier = GlanceModifier.width(COUNT_COLUMN)) { UnwindFigure(view) }
            }
        }

        if (view.progress != null && view.mode != Mode.LOADING) {
            Spacer(GlanceModifier.height(4.dp))
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                LinearProgressIndicator(
                    progress = view.progress,
                    modifier = GlanceModifier.defaultWeight().height(6.dp),
                    color = WATER,
                    backgroundColor = TRACK,
                )
                if (wide) {
                    // Holds the bar to the water column, so it ends where the water button does.
                    Spacer(GlanceModifier.width(COLUMN_GAP + COUNT_COLUMN + COLUMN_GAP + COUNT_COLUMN))
                }
                if (widest) Spacer(GlanceModifier.width(COLUMN_GAP + COUNT_COLUMN))
            }
        }

        // Extra height goes here, between the figures and the buttons.
        Spacer(GlanceModifier.defaultWeight())

        Row(modifier = GlanceModifier.fillMaxWidth()) {
            SipButton("+ 4 oz", "Add 4 ounces of water", actionRunCallback<AddWaterAction>(), view.buttonsEnabled, WATER, GlanceModifier.defaultWeight())
            if (wide) {
                Spacer(GlanceModifier.width(COLUMN_GAP))
                SipButton("+ 1", "Add one cup of coffee", actionRunCallback<AddCoffeeAction>(), view.buttonsEnabled, COFFEE, GlanceModifier.width(COUNT_COLUMN))
                Spacer(GlanceModifier.width(COLUMN_GAP))
                SipButton("+ 1", "Add one alcoholic drink", actionRunCallback<AddAlcoholAction>(), view.buttonsEnabled, ALCOHOL, GlanceModifier.width(COUNT_COLUMN))
            }
            if (widest) {
                Spacer(GlanceModifier.width(COLUMN_GAP))
                SipButton("+ 5", "Add 5 mg of Unwind", actionRunCallback<AddUnwindAction>(), view.buttonsEnabled, UNWIND, GlanceModifier.width(COUNT_COLUMN))
            }
        }
    }
}

/**
 * A filled pill with its label centred. Not Glance's Button: that one's own
 * padding left "+ 5" no room in a 52dp column and cut it to "+".
 * Disabled, it takes the track colour and does nothing; a tap reaches the body.
 */
@Composable
private fun SipButton(
    label: String,
    description: String,
    onClick: Action,
    enabled: Boolean,
    color: androidx.glance.unit.ColorProvider,
    modifier: GlanceModifier,
) {
    val base = modifier
        .height(BUTTON_HEIGHT)
        .cornerRadius(BUTTON_HEIGHT / 2)
        .background(if (enabled) color else TRACK)
        .semantics { contentDescription = description }
    Box(
        modifier = if (enabled) base.clickable(onClick) else base,
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = TextStyle(
                color = if (enabled) ON_ACCENT else GlanceTheme.colors.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )
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
            // One line: where the row is too narrow, the trailing "oz" drops rather than wrapping under.
            Text(text = view.goalText, style = TextStyle(color = secondary, fontSize = 12.sp), maxLines = 1)
        }
    }
}

/** Icon and the bare count; "drinks" stays in the content description. */
@Composable
private fun AlcoholFigure(view: WidgetView) {
    val onSurface = GlanceTheme.colors.onSurface
    val text = view.alcoholCount ?: return
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
        Text(text = text, style = TextStyle(color = onSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold))
    }
}

/** Icon and cup count; "cups" stays in the content description. */
@Composable
private fun CoffeeFigure(view: WidgetView) {
    val onSurface = GlanceTheme.colors.onSurface
    if (view.coffeeText == null) return
    Row(
        modifier = GlanceModifier.semantics { contentDescription = view.coffeeDescription },
        verticalAlignment = Alignment.Bottom,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_coffee),
            contentDescription = null,
            modifier = GlanceModifier.size(20.dp),
            colorFilter = ColorFilter.tint(COFFEE),
        )
        Spacer(GlanceModifier.width(4.dp))
        Text(text = view.coffeeText, style = TextStyle(color = onSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold))
    }
}

/** Icon and mg; the unit stays in the content description. */
@Composable
private fun UnwindFigure(view: WidgetView) {
    val onSurface = GlanceTheme.colors.onSurface
    if (view.unwindText == null) return
    Row(
        modifier = GlanceModifier.semantics { contentDescription = view.unwindDescription },
        verticalAlignment = Alignment.Bottom,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_unwind),
            contentDescription = null,
            modifier = GlanceModifier.size(20.dp),
            colorFilter = ColorFilter.tint(UNWIND),
        )
        Spacer(GlanceModifier.width(4.dp))
        Text(text = view.unwindText, style = TextStyle(color = onSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold))
    }
}
