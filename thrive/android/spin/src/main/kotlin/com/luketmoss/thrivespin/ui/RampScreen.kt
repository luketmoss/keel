package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.ramp.RampButton
import com.luketmoss.thrivespin.core.ramp.RampPhase
import com.luketmoss.thrivespin.core.ramp.RampText
import com.luketmoss.thrivespin.core.ramp.RampView
import com.luketmoss.thrivespin.core.ramp.StairKind
import com.luketmoss.thrivespin.core.ride.Band
import com.luketmoss.thrivespin.core.ride.HrStatus
import com.luketmoss.thrivespin.core.ride.RideState
import com.luketmoss.thrivespin.core.ride.RideText

class RampActions(
    /** "Start the ramp" and "I'm done": the engine's `skipStep()`. */
    val onSkip: () -> Unit,
    /** Cancel, before the clock starts: nothing was recorded. */
    val onCancel: () -> Unit,
    /** "Stop test" in the warm-up's dialog, and "Discard test" on a recovered test too short to measure. */
    val onDiscard: () -> Unit,
    /** "See your result" on a finished ramp: the result opens above the cool-down. */
    val onSeeResult: () -> Unit,
    /** "See your result" on a recovered test: ends it, and the hand-off opens the result. */
    val onEndForResult: () -> Unit,
    /** "Stop cool-down": the test is already measured, so there is nothing to confirm. */
    val onStopCooldown: () -> Unit,
    val onTurnOnBluetooth: () -> Unit,
)

/**
 * The ramp screen (#770), always dark like the ride screen and kept on while it is visible. It draws [view]
 * (core/ramp/RampScreenState) over #768's own tiles and calls only [actions]; every decision is the engine's.
 */
@Composable
fun RampScreen(state: RideState, view: RampView, actions: RampActions) {
    SpinDarkTheme {
        val screen = LocalView.current
        DisposableEffect(screen) {
            screen.keepScreenOn = true
            onDispose { screen.keepScreenOn = false }
        }
        var stopOpen by rememberSaveable { mutableStateOf(false) }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(spin.bg)
                .safeDrawingPadding(),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
                verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
            ) {
                TopRow(state, view) {
                    if (view.phase == RampPhase.Ready) actions.onCancel() else stopOpen = true
                }
                if (view.phase != RampPhase.Interrupted) {
                    state.banner?.let { RideBannerCard(it, actions.onTurnOnBluetooth) }
                }
                StepCard(view)
                when (view.phase) {
                    RampPhase.Ramp -> {
                        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                            PowerTile(state, Modifier.weight(1f))
                            CadenceTile(state, view, Modifier.weight(1f))
                            HeartTile(state, Modifier.weight(1f))
                        }
                        StairsCard(view)
                        BestCard(view)
                    }
                    RampPhase.Interrupted -> Unit
                    else -> {
                        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                            TargetCard(state, Modifier.weight(1f))
                            PowerTile(state, Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                            CadenceTile(state, view, Modifier.weight(1f))
                            HeartTile(state, Modifier.weight(1f))
                        }
                    }
                }
                view.hint?.let { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary) }
            }
            val button = view.button
            if (button != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    PinnedButton(view.buttonLabel.orEmpty(), view.buttonEnabled) {
                        when (button) {
                            RampButton.StartRamp, RampButton.Done -> actions.onSkip()
                            RampButton.SeeResult ->
                                if (view.phase == RampPhase.Interrupted) actions.onEndForResult() else actions.onSeeResult()
                            RampButton.DiscardTest -> actions.onDiscard()
                        }
                    }
                    if (view.stopCooldown) {
                        Box(
                            modifier = Modifier
                                .heightIn(min = SpinSizes.TAP_TARGET.dp)
                                .clip(Tokens.radiusMd)
                                .clickable(role = Role.Button, onClick = actions.onStopCooldown)
                                .padding(horizontal = Tokens.spaceMd),
                            contentAlignment = Alignment.Center,
                        ) {
                            SpinText(RampText.STOP_COOLDOWN, Tokens.TEXT_BASE, color = spin.textSecondary, weight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        if (stopOpen) {
            AlertDialog(
                onDismissRequest = { stopOpen = false },
                containerColor = spin.surface,
                titleContentColor = spin.text,
                textContentColor = spin.textSecondary,
                title = { Text(RampText.STOP_TITLE, fontWeight = FontWeight.Bold) },
                text = { Text(RampText.STOP_BODY) },
                confirmButton = {
                    TextAction(RampText.STOP_TEST, onClick = {
                        stopOpen = false
                        actions.onDiscard()
                    }, color = spin.dangerText)
                },
                dismissButton = { TextAction(RampText.KEEP_RIDING, onClick = { stopOpen = false }) },
            )
        }
    }
}

@Composable
private fun TopRow(state: RideState, view: RampView, onEnd: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceXs),
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(Tokens.spaceXs),
        ) {
            val trainerDot = if (state.trainerConnected) spin.success else spin.warning
            StatusPill(RideText.trainerPill(state), trainerDot, Modifier.weight(1f, fill = false))
            val hrDot = when (state.hrStatus) {
                HrStatus.Reading -> spin.success
                HrStatus.NoReading -> spin.warning
                HrStatus.Connecting -> spin.textSecondary
                HrStatus.None -> null
            }
            val hrColor = if (state.hrStatus == HrStatus.None) spin.textMuted else spin.textSecondary
            StatusPill(RideText.hrPill(state), hrDot, Modifier.weight(1f, fill = false), hrColor)
        }
        val label = view.endLabel
        if (label != null) {
            Box(
                modifier = Modifier
                    .heightIn(min = SpinSizes.TAP_TARGET.dp)
                    .clip(Tokens.radiusMd)
                    .background(spin.surface)
                    .clickable(role = Role.Button, onClick = onEnd)
                    .padding(horizontal = Tokens.spaceMd),
                contentAlignment = Alignment.Center,
            ) {
                SpinText(label, Tokens.TEXT_SM, color = spin.dangerText, weight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/** The step card of every phase: its title and clock line, the figure, the lines under it and the progress bar. */
@Composable
private fun StepCard(view: RampView) {
    RideCard(Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SpinText(
                    view.title,
                    if (view.phase == RampPhase.TestOver) Tokens.TEXT_LG else Tokens.TEXT_SM,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = view.announcement.ifEmpty { view.title }
                        },
                    weight = FontWeight.Bold,
                    maxLines = 1,
                )
                view.right?.let { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary, maxLines = 1) }
            }
            when (view.phase) {
                RampPhase.Ready -> {
                    SpinText(view.ready.orEmpty(), Tokens.TEXT_XL, weight = FontWeight.Bold)
                }
                RampPhase.Warmup -> BigFigure(view.big.orEmpty(), view.bigCaption.orEmpty(), spin.text, Tokens.LIFT_CLOCK)
                RampPhase.Ramp -> {
                    BigFigure(view.big.orEmpty(), view.bigCaption.orEmpty(), spin.primaryText, Tokens.FIGURE_XL)
                    view.lines.forEach { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary) }
                }
                RampPhase.TestOver, RampPhase.Interrupted -> {
                    view.lines.forEachIndexed { i, line ->
                        if (i == 0) {
                            SpinText(line, Tokens.TEXT_BASE, weight = FontWeight.Bold)
                        } else {
                            SpinText(line, Tokens.TEXT_SM, color = spin.textSecondary)
                        }
                    }
                }
            }
            if (view.phase == RampPhase.Warmup || view.phase == RampPhase.Ramp || view.phase == RampPhase.TestOver) {
                val fill = if (view.phase == RampPhase.Ramp) spin.primary else spin.borderStrong
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(Tokens.spaceXs)
                        .clip(Tokens.radiusFull)
                        .background(spin.border),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(view.progress.coerceIn(0f, 1f))
                            .fillMaxHeight()
                            .clip(Tokens.radiusFull)
                            .background(fill),
                    )
                }
            }
        }
    }
}

@Composable
private fun BigFigure(figure: String, caption: String, color: Color, size: Int) {
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        Text(figure, color = color, fontSize = size.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        SpinText(
            caption,
            if (caption == "W") Tokens.TEXT_LG else Tokens.TEXT_SM,
            modifier = Modifier.padding(bottom = Tokens.spaceSm),
            color = spin.textSecondary,
        )
    }
}

@Composable
private fun TargetCard(state: RideState, modifier: Modifier) {
    RideCard(modifier) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText("TARGET", Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold)
            Text(
                RideText.targetFigure(state),
                color = spin.primaryText,
                fontSize = Tokens.FIGURE_XL.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            SpinText(RideText.targetCaption(state), Tokens.TEXT_SM, color = spin.textSecondary)
        }
    }
}

/** Power over 3 s against the absolute target: the band as #768's, in words as well as colour. */
@Composable
private fun PowerTile(state: RideState, modifier: Modifier) {
    val bandColor = bandColor(state.band)
    val power = state.power3sW
    RampTile("POWER 3S", power?.toString() ?: "—", powerUnit(state), modifier, valueColor = bandColor ?: if (power == null) spin.textSecondary else spin.text, unitColor = bandColor)
}

@Composable
private fun bandColor(band: Band?): Color? = when (band) {
    Band.On -> spin.success
    Band.Below -> spin.warning
    Band.Above -> spin.zones[4]
    null -> null
}

private fun powerUnit(state: RideState): String = when {
    state.power3sW == null -> "No power reading"
    state.band != null -> RideText.bandWord(state.band)
    else -> "watts"
}

@Composable
private fun CadenceTile(state: RideState, view: RampView, modifier: Modifier) {
    val warn = view.cadenceWarn
    RampTile(
        "CADENCE",
        state.cadenceRpm?.toString() ?: "—",
        if (warn) RampText.KEEP_UP else "rpm",
        modifier,
        valueColor = if (warn) spin.warning else spin.text,
        unitColor = if (warn) spin.warning else null,
    )
}

@Composable
private fun HeartTile(state: RideState, modifier: Modifier) {
    val bpm = state.heartRate
    val unit = when {
        bpm != null -> "bpm"
        state.hrStatus == HrStatus.None -> "No monitor"
        else -> "No reading"
    }
    RampTile("HEART RATE", bpm?.toString() ?: "—", unit, modifier)
}

@Composable
private fun RampTile(
    eyebrow: String,
    value: String,
    unit: String,
    modifier: Modifier,
    valueColor: Color = spin.text,
    unitColor: Color? = null,
) {
    RideCard(modifier) {
        Column(modifier = Modifier.padding(Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText(eyebrow, Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold, maxLines = 1)
            Text(value, color = valueColor, fontSize = Tokens.FIGURE_MD.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            SpinText(
                unit,
                Tokens.TEXT_XS,
                color = unitColor ?: spin.textSecondary,
                weight = if (unitColor != null) FontWeight.Bold else FontWeight.Normal,
                maxLines = 2,
            )
        }
    }
}

/** One bar a minute of the staircase: done, the current minute and the next two. */
@Composable
private fun StairsCard(view: RampView) {
    val done = spin.primaryFill
    val current = spin.primaryText
    val upcoming = spin.border
    val description = view.stairsDescription.orEmpty()
    RideCard(Modifier.fillMaxWidth()) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Tokens.spaceMd)
                .height(SpinSizes.PROFILE_RIDE.dp)
                .semantics { contentDescription = description },
        ) {
            val bars = view.stairs
            if (bars.isEmpty()) return@Canvas
            val gap = 2.dp.toPx()
            val width = ((size.width - gap * (bars.size - 1)) / bars.size).coerceAtLeast(1f)
            val corner = CornerRadius(4.dp.toPx())
            bars.forEachIndexed { i, bar ->
                val h = size.height * bar.fraction
                val color = when (bar.kind) {
                    StairKind.Done -> done
                    StairKind.Current -> current
                    StairKind.Upcoming -> upcoming
                }
                drawRoundRect(
                    color = color,
                    topLeft = Offset(i * (width + gap), size.height - h),
                    size = Size(width, h),
                    cornerRadius = corner,
                )
            }
        }
    }
}

@Composable
private fun BestCard(view: RampView) {
    RideCard(Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText("BEST MINUTE SO FAR", Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold)
            SpinText(view.bestValue.orEmpty(), Tokens.TEXT_LG, weight = FontWeight.Bold)
            view.bestHint?.let { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary) }
        }
    }
}

/** "Start the ramp" and "I'm done" share one position and one size, pressed mid-effort. */
@Composable
private fun PinnedButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(SpinSizes.RIDE_BUTTON.dp)
            .alpha(if (enabled) 1f else SpinSizes.OPACITY_DISABLED)
            .clip(Tokens.radiusLg)
            .background(spin.primaryFill)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        SpinText(label, Tokens.TEXT_LG, color = spin.onFill, weight = FontWeight.Bold, maxLines = 1)
    }
}
