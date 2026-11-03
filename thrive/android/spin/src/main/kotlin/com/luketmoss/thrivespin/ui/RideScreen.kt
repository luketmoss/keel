package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.ride.Band
import com.luketmoss.thrivespin.core.ride.RideBanner
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RideState
import com.luketmoss.thrivespin.core.ride.RideText
import com.luketmoss.thrivespin.core.ride.RideTime
import com.luketmoss.thrivespin.core.ride.TargetView
import com.luketmoss.thrivespin.core.ride.HrStatus
import com.luketmoss.thrivespin.core.workout.ProfileModel
import com.luketmoss.thrivespin.core.workout.TrainerMode
import com.luketmoss.thrivespin.core.workout.WorkoutText

class RideActions(
    val onPause: () -> Unit,
    val onResume: () -> Unit,
    val onSkip: () -> Unit,
    /** One tap of Intensity: -1 or +1 percent. */
    val onIntensity: (Int) -> Unit,
    /** One tap of the Trainer row: -1 or +1 step. */
    val onTrainerStep: (Int) -> Unit,
    /** End ride, confirmed. */
    val onEnd: () -> Unit,
    /** Discard ride, confirmed twice. */
    val onDiscard: () -> Unit,
    /** Cancel, before the clock starts: nothing was recorded. */
    val onCancel: () -> Unit,
    val onTurnOnBluetooth: () -> Unit,
)

/**
 * The ride screen (#768): the prototype's bike computer, always in the dark scheme, kept on while it is
 * visible. It only draws [state] and calls [actions]; every decision is the engine's.
 */
@Composable
fun RideScreen(state: RideState, profile: ProfileModel, actions: RideActions) {
    SpinDarkTheme {
        val view = LocalView.current
        DisposableEffect(view) {
            view.keepScreenOn = true
            onDispose { view.keepScreenOn = false }
        }
        var endOpen by rememberSaveable { mutableStateOf(false) }
        var discardOpen by rememberSaveable { mutableStateOf(false) }
        val started = state.phase == RidePhase.Running || state.phase == RidePhase.Paused

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
                TopRow(state, started) {
                    if (started) {
                        endOpen = true
                    } else {
                        actions.onCancel()
                    }
                }
                state.banner?.let { RideBannerCard(it, actions.onTurnOnBluetooth) }
                StepCard(state)
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    TargetCard(state, Modifier.weight(1f))
                    PowerCard(state, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    CadenceTile(state, Modifier.weight(1f))
                    HeartRateTile(state, Modifier.weight(1f))
                    StepAverageTile(state, Modifier.weight(1f))
                }
                ProfileCard(state, profile)
                if (state.showTrainerRow) TrainerRow(state, actions.onTrainerStep)
            }
            ControlRow(state, actions)
        }

        if (endOpen) {
            AlertDialog(
                onDismissRequest = { endOpen = false },
                containerColor = spin.surface,
                titleContentColor = spin.text,
                textContentColor = spin.textSecondary,
                title = { Text("End the ride?", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        Text(RideText.endBody(state))
                        TextAction("Discard ride", onClick = {
                            endOpen = false
                            discardOpen = true
                        }, color = spin.dangerText)
                    }
                },
                confirmButton = {
                    FilledAction("End ride", onClick = {
                        endOpen = false
                        actions.onEnd()
                    })
                },
                dismissButton = { OutlineAction("Keep riding", onClick = { endOpen = false }) },
            )
        }
        if (discardOpen) {
            AlertDialog(
                onDismissRequest = { discardOpen = false },
                containerColor = spin.surface,
                titleContentColor = spin.text,
                textContentColor = spin.textSecondary,
                title = { Text("Discard this ride?", fontWeight = FontWeight.Bold) },
                text = { Text("Nothing from it is saved, here or in Thrive.") },
                confirmButton = {
                    TextAction("Discard ride", onClick = {
                        discardOpen = false
                        actions.onDiscard()
                    }, color = spin.dangerText)
                },
                dismissButton = { TextAction("Keep it", onClick = { discardOpen = false }) },
            )
        }
    }
}

@Composable
private fun TopRow(state: RideState, started: Boolean, onEnd: () -> Unit) {
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
        Box(
            modifier = Modifier
                .heightIn(min = SpinSizes.TAP_TARGET.dp)
                .clip(Tokens.radiusMd)
                .background(spin.surface)
                .clickable(role = Role.Button, onClick = onEnd)
                .padding(horizontal = Tokens.spaceMd),
            contentAlignment = Alignment.Center,
        ) {
            SpinText(if (started) "End" else "Cancel", Tokens.TEXT_SM, color = spin.dangerText, weight = FontWeight.Bold, maxLines = 1)
        }
    }
}

@Composable
internal fun StatusPill(text: String, dot: Color?, modifier: Modifier = Modifier, textColor: Color = spin.textSecondary) {
    Row(
        modifier = modifier
            .clip(Tokens.radiusFull)
            .background(spin.surface)
            .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceXs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot != null) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(dot),
            )
            Spacer(Modifier.width(Tokens.spaceXs))
        }
        SpinText(text, Tokens.TEXT_XS, color = textColor, weight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
internal fun RideBannerCard(banner: RideBanner, onTurnOnBluetooth: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Tokens.radiusLg)
            .background(spin.warningBg)
            .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpinText(RideText.banner(banner), Tokens.TEXT_SM, modifier = Modifier.weight(1f), color = spin.text)
        if (banner == RideBanner.BluetoothOff) TextAction("Turn on", onTurnOnBluetooth)
    }
}

@Composable
internal fun RideCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier = modifier
            .clip(Tokens.radiusLg)
            .background(spin.surface),
    ) { content() }
}

@Composable
private fun StepCard(state: RideState) {
    val gettingReady = state.phase == RidePhase.GettingReady
    val paused = state.phase == RidePhase.Paused
    val announcement = remember(state.stepIndex) { RideText.stepAnnouncement(state) }
    RideCard(Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val title = state.stepLabel + (state.stepPosition?.let { " · $it" } ?: "")
                SpinText(
                    title,
                    Tokens.TEXT_SM,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = announcement
                        },
                    weight = FontWeight.Bold,
                    maxLines = 1,
                )
                if (!gettingReady) {
                    val total = state.totalS?.let { " / ${RideTime.clock(it)}" }.orEmpty()
                    SpinText("${RideTime.clock(state.rideS)}$total", Tokens.TEXT_SM, color = spin.textSecondary, maxLines = 1)
                }
            }
            if (gettingReady) {
                val status = state.ready?.let { RideText.ready(it, state.trainerName) }.orEmpty()
                SpinText(status, Tokens.TEXT_XL, weight = FontWeight.Bold)
            } else {
                val left = state.stepLeftS
                val clockText = RideTime.clock(left ?: state.stepSecond)
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    Text(
                        clockText,
                        color = if (paused) spin.textSecondary else spin.text,
                        fontSize = Tokens.LIFT_CLOCK.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                    val caption = when {
                        paused -> "Paused"
                        left != null -> "left in step"
                        else -> "in step"
                    }
                    SpinText(
                        caption,
                        Tokens.TEXT_SM,
                        modifier = Modifier.padding(bottom = Tokens.spaceSm),
                        color = spin.textSecondary,
                    )
                }
            }
            val dur = state.stepDurS
            val fraction = if (dur != null && dur > 0) (state.stepSecond.toFloat() / dur).coerceIn(0f, 1f) else 0f
            val fill = state.zone?.let { spin.zones[it.ordinal] } ?: spin.borderStrong
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Tokens.spaceXs)
                    .clip(Tokens.radiusFull)
                    .background(spin.border),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction)
                        .fillMaxHeight()
                        .clip(Tokens.radiusFull)
                        .background(fill),
                )
            }
        }
    }
}

@Composable
private fun TargetCard(state: RideState, modifier: Modifier) {
    RideCard(modifier) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText("TARGET", Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold)
            val color = if (state.target is TargetView.Erg) spin.primaryText else spin.text
            Text(
                RideText.targetFigure(state),
                color = color,
                fontSize = Tokens.FIGURE_XL.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            SpinText(RideText.targetCaption(state), Tokens.TEXT_SM, color = spin.textSecondary)
        }
    }
}

@Composable
private fun PowerCard(state: RideState, modifier: Modifier) {
    val power = state.power3sW
    val band = state.band
    val bandColor = when (band) {
        Band.On -> spin.success
        Band.Below -> spin.warning
        Band.Above -> spin.zones[4]
        null -> null
    }
    val ringed = power != null && bandColor != null
    RideCard(
        modifier = modifier.then(if (ringed) Modifier.border(2.dp, bandColor!!, Tokens.radiusLg) else Modifier),
    ) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText("POWER 3S", Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold)
            val numberColor = if (ringed) bandColor!! else if (power == null) spin.textSecondary else spin.text
            Text(
                power?.toString() ?: "—",
                color = numberColor,
                fontSize = Tokens.FIGURE_XL.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            when {
                power == null -> SpinText("No power reading", Tokens.TEXT_SM, color = spin.textSecondary, weight = FontWeight.Bold)
                band != null -> SpinText(RideText.bandWord(band), Tokens.TEXT_SM, color = bandColor!!, weight = FontWeight.Bold)
                else -> SpinText("watts", Tokens.TEXT_SM, color = spin.textSecondary, weight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun Tile(eyebrow: String, value: String, unit: String, modifier: Modifier) {
    RideCard(modifier) {
        Column(modifier = Modifier.padding(Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText(eyebrow, Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold, maxLines = 1)
            Text(value, color = spin.text, fontSize = Tokens.FIGURE_MD.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            SpinText(unit, Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 2)
        }
    }
}

@Composable
private fun CadenceTile(state: RideState, modifier: Modifier) {
    val unit = state.cadenceTarget?.let { "rpm · target $it" } ?: "rpm"
    Tile("CADENCE", state.cadenceRpm?.toString() ?: "—", unit, modifier)
}

@Composable
private fun HeartRateTile(state: RideState, modifier: Modifier) {
    val bpm = state.heartRate
    val unit = when {
        bpm != null -> "bpm"
        state.hrStatus == HrStatus.None -> "No monitor"
        else -> "No reading"
    }
    Tile("HEART RATE", bpm?.toString() ?: "—", unit, modifier)
}

@Composable
private fun StepAverageTile(state: RideState, modifier: Modifier) {
    Tile("STEP AVG", state.stepAvgW?.toString() ?: "—", "W · ${state.totalKj} kJ total", modifier)
}

@Composable
private fun ProfileCard(state: RideState, profile: ProfileModel) {
    val (nextLabel, nextValue) = RideText.next(state.next)
    RideCard(Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            RideProfileChart(profile, state.plannedS)
            Row(verticalAlignment = Alignment.CenterVertically) {
                SpinText(nextLabel, Tokens.TEXT_SM, color = spin.textSecondary)
                Spacer(Modifier.weight(1f))
                SpinText(nextValue, Tokens.TEXT_SM, color = spin.text, weight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/** The profile at the ride's intensity, the part already ridden covered, and a cursor at the planned position. */
@Composable
private fun RideProfileChart(model: ProfileModel, plannedS: Int) {
    val zones = spin.zones
    val neutral = spin.border
    val overlay = spin.scrim
    val cursorColor = spin.text
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height((SpinSizes.PROFILE_RIDE + 8).dp),
    ) {
        val pad = 4.dp.toPx()
        val chartH = size.height - 2 * pad
        val gap = 2.dp.toPx()
        val corner = CornerRadius(4.dp.toPx())
        val total = model.totalS.coerceAtLeast(1).toFloat()
        val bars = model.bars
        val usable = (size.width - gap * (bars.size - 1)).coerceAtLeast(1f)
        var x = 0f
        var cursorX: Float? = null
        var remaining = plannedS
        for (bar in bars) {
            val w = usable * bar.durS / total
            val color = if (bar.zone == null) neutral else zones[bar.zone.ordinal]
            val startH = chartH * bar.startFraction
            val endH = chartH * bar.endFraction
            val bottom = pad + chartH
            if (bar.startFraction == bar.endFraction) {
                val path = Path().apply {
                    addRoundRect(
                        RoundRect(
                            left = x,
                            top = bottom - startH,
                            right = x + w,
                            bottom = bottom,
                            topLeftCornerRadius = corner,
                            topRightCornerRadius = corner,
                            bottomLeftCornerRadius = CornerRadius.Zero,
                            bottomRightCornerRadius = CornerRadius.Zero,
                        ),
                    )
                }
                drawPath(path, color)
            } else {
                val path = Path().apply {
                    moveTo(x, bottom)
                    lineTo(x, bottom - startH)
                    lineTo(x + w, bottom - endH)
                    lineTo(x + w, bottom)
                    close()
                }
                drawPath(path, color)
            }
            if (cursorX == null) {
                if (remaining <= bar.durS) {
                    cursorX = x + if (bar.durS > 0) w * remaining / bar.durS else 0f
                } else {
                    remaining -= bar.durS
                }
            }
            x += w + gap
        }
        val at = (cursorX ?: size.width).coerceIn(0f, size.width)
        drawRect(overlay, topLeft = Offset(0f, pad), size = Size(at, chartH))
        val barWidth = Tokens.spaceXs.toPx()
        drawRoundRect(
            color = cursorColor,
            topLeft = Offset((at - barWidth / 2).coerceIn(0f, size.width - barWidth), 0f),
            size = Size(barWidth, size.height),
            cornerRadius = CornerRadius(2.dp.toPx()),
        )
    }
}

@Composable
private fun TrainerRow(state: RideState, onStep: (Int) -> Unit) {
    val resistance = state.mode == TrainerMode.Resistance
    val value = if (resistance) "Level ${state.modeLevel}" else "Slope ${WorkoutText.grade(state.modeGradeTenths)}"
    RideCard(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SpinText("Trainer", Tokens.TEXT_SM, modifier = Modifier.weight(1f), color = spin.textSecondary)
            StepButton("−", if (resistance) "Lower level" else "Less slope", true) { onStep(-1) }
            Box(modifier = Modifier.width(104.dp), contentAlignment = Alignment.Center) {
                SpinText(value, Tokens.TEXT_LG, weight = FontWeight.Bold, maxLines = 1)
            }
            StepButton("+", if (resistance) "Higher level" else "More slope", true) { onStep(1) }
        }
    }
}

@Composable
private fun ControlRow(state: RideState, actions: RideActions) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm)
            .height(SpinSizes.RIDE_BUTTON.dp),
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        if (state.intensityAdjustable) {
            IntensityControl(state, actions.onIntensity, Modifier.weight(1.5f))
        }
        val pauseEnabled = state.canPause || state.canResume
        val pauseText = if (state.canResume) "Resume" else "Pause"
        Box(
            modifier = Modifier
                .weight(1.2f)
                .fillMaxHeight()
                .alpha(if (pauseEnabled) 1f else SpinSizes.OPACITY_DISABLED)
                .clip(Tokens.radiusLg)
                .background(spin.primaryFill)
                .clickable(enabled = pauseEnabled, role = Role.Button) {
                    if (state.canResume) actions.onResume() else actions.onPause()
                },
            contentAlignment = Alignment.Center,
        ) {
            SpinText(pauseText, Tokens.TEXT_LG, color = spin.onFill, weight = FontWeight.Bold, maxLines = 1)
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .alpha(if (state.canSkip) 1f else SpinSizes.OPACITY_DISABLED)
                .clip(Tokens.radiusLg)
                .background(spin.surface)
                .clickable(enabled = state.canSkip, role = Role.Button, onClick = actions.onSkip),
            contentAlignment = Alignment.Center,
        ) {
            SpinText("Skip step", Tokens.TEXT_BASE, weight = FontWeight.Bold, maxLines = 2)
        }
    }
}

@Composable
private fun IntensityControl(state: RideState, onIntensity: (Int) -> Unit, modifier: Modifier) {
    val color = when {
        state.intensityPct == 100 -> spin.text
        state.intensityPct < 100 -> spin.primaryText
        else -> spin.warning
    }
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clip(Tokens.radiusLg)
            .background(spin.surface),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SpinText(
            "INTENSITY",
            Tokens.TEXT_XS,
            modifier = Modifier.padding(top = Tokens.spaceXs),
            color = spin.textSecondary,
            weight = FontWeight.Bold,
            maxLines = 1,
        )
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StepButton("−", "Easier", state.canEasier, width = 44.dp, height = 52.dp) { onIntensity(-1) }
            SpinText(
                "${state.intensityPct}%",
                Tokens.TEXT_BASE,
                modifier = Modifier.weight(1f),
                color = color,
                weight = FontWeight.Bold,
                maxLines = 1,
            )
            StepButton("+", "Harder", state.canHarder, width = 44.dp, height = 52.dp) { onIntensity(1) }
        }
    }
}
