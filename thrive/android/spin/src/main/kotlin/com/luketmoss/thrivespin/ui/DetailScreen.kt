package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.FtmsFeatures
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.library.RideWorkout
import com.luketmoss.thrivespin.core.workout.DetailState
import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.Repeat
import com.luketmoss.thrivespin.core.workout.ResolvedStep
import com.luketmoss.thrivespin.core.workout.Step
import com.luketmoss.thrivespin.core.workout.TrainerMode
import com.luketmoss.thrivespin.core.workout.WorkoutText

class DetailActions(
    val onBack: () -> Unit,
    val onEdit: () -> Unit,
    val onState: (DetailState) -> Unit,
    val onStart: () -> Unit,
)

/** The detail screen's colour for a step's zone square: its zone token, or the neutral border colour. */
@Composable
private fun zoneColor(step: ResolvedStep, intensityPct: Int): Color {
    val zone = step.zone(intensityPct)
    return if (zone == null) spin.border else spin.zones[zone.ordinal]
}

@Composable
fun DetailContent(
    workout: RideWorkout,
    state: DetailState,
    ftpW: Int?,
    plannedToday: Boolean,
    trainer: FtmsFeatures?,
    actions: DetailActions,
) {
    val steps = workout.steps
    val estimates = remember(steps, ftpW, state.intensityPct) { Maths.estimate(steps, ftpW, state.intensityPct) }
    val ergDisabled = DetailState.ergDisabled(trainer)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = actions.onBack, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                Icon(painterResource(R.drawable.ic_back), contentDescription = "Back", tint = spin.text)
            }
            Spacer(Modifier.weight(1f))
            TextAction("Edit", actions.onEdit)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Tokens.spaceMd)
                .padding(bottom = Tokens.spaceLg),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
                val eyebrow = workout.category.uppercase() + if (plannedToday) " · PLANNED TODAY" else ""
                SpinText(eyebrow, Tokens.TEXT_XS, color = spin.primaryText, weight = FontWeight.Bold)
                SpinText(workout.name, Tokens.TEXT_2XL, color = spin.text, weight = FontWeight.Bold)
                if (workout.description.isNotBlank()) {
                    SpinText(workout.description, Tokens.TEXT_SM, color = spin.textSecondary)
                }
            }

            WorkoutProfile(
                steps = steps,
                intensityPct = state.intensityPct,
                height = SpinSizes.PROFILE_LG,
                ftpLabel = if (ftpW != null) "FTP $ftpW W" else "FTP",
            )

            IntensityCard(state, actions.onState)

            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                Tile("Time", WorkoutText.total(estimates.totalS), Modifier.weight(1f))
                Tile("TSS", "${estimates.tss}", Modifier.weight(1f))
                Tile("IF", estimates.ifText, Modifier.weight(1f))
                Tile("Work", estimates.workKj?.let { "$it kJ" } ?: "—", Modifier.weight(1f))
            }
            if (!steps.allErg) {
                SpinText("Estimated from the ERG steps.", Tokens.TEXT_XS, color = spin.textSecondary)
            }

            SpinText("Steps", Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold)
            StepsCard(workout, ftpW, state.intensityPct)

            if (steps.hasErg) {
                SpinText("Trainer mode", Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold)
                Segmented(
                    name = "Trainer mode",
                    options = listOf(
                        TrainerMode.Erg to "ERG",
                        TrainerMode.Resistance to "Resistance",
                        TrainerMode.Slope to "Slope",
                    ),
                    selected = state.mode,
                    onSelect = { actions.onState(state.withMode(it)) },
                    isEnabled = { it != TrainerMode.Erg || !ergDisabled },
                )
                SpinText(DetailState.modeHint(state.mode, ergDisabled), Tokens.TEXT_XS, color = spin.textSecondary)
            }
        }
        StartFooter(state, ftpW != null, actions.onStart)
    }
}

@Composable
private fun IntensityCard(state: DetailState, onState: (DetailState) -> Unit) {
    SpinCard {
        Column(
            modifier = Modifier.padding(Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SpinText("Intensity", Tokens.TEXT_BASE, modifier = Modifier.weight(1f), color = spin.text, weight = FontWeight.Bold)
                StepButton("−", "Easier", state.canEasier) { onState(state.easier()) }
                Box(modifier = Modifier.width(64.dp), contentAlignment = Alignment.Center) {
                    val color = when {
                        state.intensityPct == DetailState.DEFAULT_INTENSITY -> spin.text
                        state.intensityPct < DetailState.DEFAULT_INTENSITY -> spin.primaryText
                        else -> spin.warning
                    }
                    SpinText("${state.intensityPct}%", Tokens.TEXT_LG, color = color, weight = FontWeight.Bold, maxLines = 1)
                }
                StepButton("+", "Harder", state.canHarder) { onState(state.harder()) }
            }
            SpinText(state.hint, Tokens.TEXT_XS, color = spin.textSecondary)
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .selectableGroup()
                    .semantics { contentDescription = "Intensity presets" },
                horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
            ) {
                DetailState.PRESETS.forEach { p ->
                    Chip("$p%", state.selectedPreset == p, { onState(state.preset(p)) })
                }
            }
        }
    }
}

@Composable
private fun Tile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(Tokens.radiusMd)
            .background(spin.surface)
            .border(1.dp, spin.borderSoft, Tokens.radiusMd)
            .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceSm),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs),
    ) {
        SpinText(label, Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.SemiBold, maxLines = 1)
        SpinText(value, Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun StepsCard(workout: RideWorkout, ftpW: Int?, intensityPct: Int) {
    SpinCard {
        workout.steps.blocks.forEachIndexed { i, block ->
            if (i > 0) Divider()
            when (block) {
                is Step -> StepRow(Maths.resolve(block, ftpW, intensityPct), intensityPct)
                is Repeat -> {
                    val group = block.times * block.steps.sumOf { it.durS }
                    Column(
                        modifier = Modifier
                            .padding(Tokens.spaceSm)
                            .clip(Tokens.radiusMd)
                            .background(spin.primaryBg),
                    ) {
                        SpinText(
                            "${block.times}× · ${WorkoutText.total(group)}",
                            Tokens.TEXT_XS,
                            modifier = Modifier.padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
                            color = spin.primaryText,
                            weight = FontWeight.Bold,
                        )
                        block.steps.forEachIndexed { j, s ->
                            if (j > 0) Divider()
                            StepRow(Maths.resolve(s, ftpW, intensityPct), intensityPct)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Divider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(spin.borderSoft),
    )
}

@Composable
private fun StepRow(step: ResolvedStep, intensityPct: Int) {
    val target = WorkoutText.target(step)
    val duration = WorkoutText.clock(step.durS)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = SpinSizes.TAP_TARGET.dp)
            .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm)
            .semantics(mergeDescendants = true) { contentDescription = "${step.label}, $duration, $target" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(Tokens.radiusSm)
                .background(zoneColor(step, intensityPct)),
        )
        Column(modifier = Modifier.weight(1f)) {
            SpinText(step.label, Tokens.TEXT_SM, color = spin.text, weight = FontWeight.SemiBold, maxLines = 2)
            if (step.cadence != null) {
                SpinText("${step.cadence} rpm", Tokens.TEXT_XS, color = spin.textSecondary)
            }
        }
        SpinText(duration, Tokens.TEXT_SM, color = spin.textSecondary, maxLines = 1)
        SpinText(target, Tokens.TEXT_SM, color = spin.text, weight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun StartFooter(state: DetailState, hasFtp: Boolean, onStart: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(spin.surface)
            .topRule(spin.borderSoft)
            .padding(Tokens.spaceMd),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        if (!hasFtp) {
            SpinText("No FTP yet. Ride the ramp test to set one.", Tokens.TEXT_XS, color = spin.textSecondary)
        }
        FilledAction(
            text = state.startLabel,
            onClick = onStart,
            modifier = Modifier.fillMaxWidth(),
            enabled = hasFtp,
            iconRes = R.drawable.ic_play,
            height = SpinSizes.CTA_HEIGHT,
            shape = Tokens.radiusLg,
        )
    }
}
