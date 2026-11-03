package com.luketmoss.thrivespin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.workout.Categories
import com.luketmoss.thrivespin.core.workout.Draft
import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.Repeat
import com.luketmoss.thrivespin.core.workout.Selection
import com.luketmoss.thrivespin.core.workout.Step
import com.luketmoss.thrivespin.core.workout.StepMode
import com.luketmoss.thrivespin.core.workout.WorkoutText
import kotlin.math.roundToInt

class BuilderActions(
    val onDraft: (Draft) -> Unit,
    val onSave: () -> Unit,
    /** Leave without saving, after any confirmation the builder asked for. */
    val onDiscard: () -> Unit,
    /** Delete the workout, after the builder's own confirmation. */
    val onDelete: () -> Unit,
)

/** A number the person types: which field, and the text it starts with. */
private enum class NumberField(val title: String) {
    Pct("Target · % of FTP"),
    PctEnd("End %"),
    Level("Level"),
    Grade("Grade"),
    Rpm("rpm"),
}

@Composable
fun BuilderContent(
    draft: Draft,
    ftpW: Int?,
    saving: Boolean,
    error: String?,
    actions: BuilderActions,
) {
    var confirmDiscard by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val requestClose: () -> Unit = {
        if (draft.dirty) {
            confirmDiscard = true
        } else {
            actions.onDiscard()
        }
    }
    BackHandler(enabled = !saving) { requestClose() }

    Box(modifier = Modifier.fillMaxSize().background(spin.bg).safeDrawingPadding()) {
        Column(modifier = Modifier.fillMaxSize()) {
            BuilderHeader(draft, saving, requestClose, { confirmDelete = true }, actions)
            if (error != null) {
                ErrorLine(error, Modifier.padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceXs))
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Tokens.spaceMd)
                    .padding(bottom = Tokens.spaceMd),
                verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd),
            ) {
                WorkoutProfile(
                    steps = draft.steps(),
                    intensityPct = 100,
                    height = SpinSizes.PROFILE_LG,
                    ftpLabel = if (ftpW != null) "FTP $ftpW W" else "FTP",
                )
                Summary(draft, ftpW)
                SpinText("Category", Tokens.TEXT_SM, color = spin.textSecondary, weight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .selectableGroup()
                        .semantics { contentDescription = "Category" },
                    horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
                ) {
                    Categories.ALL.forEach { c ->
                        Chip(c, draft.content.category == c, { actions.onDraft(draft.withCategory(c)) })
                    }
                }
                OutlinedTextField(
                    value = draft.content.description,
                    onValueChange = { actions.onDraft(draft.withDescription(it)) },
                    label = { Text("Description") },
                    placeholder = { Text("What it's for, and how to ride it") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Blocks(draft, ftpW, actions)
            }
            EditorPanel(draft, ftpW, actions)
        }
        if (saving) {
            // Read-only while a save is in flight: the overlay takes every tap.
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
            )
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Discard changes?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDiscard = false
                    actions.onDiscard()
                }) { Text("Discard", color = spin.dangerText) }
            },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text("Keep editing") } },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete ${draft.initial.name}?") },
            text = { Text("It's removed from Thrive's library. Rides and plans that used it keep their record.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    actions.onDelete()
                }) { Text("Delete", color = spin.dangerText) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun BuilderHeader(
    draft: Draft,
    saving: Boolean,
    onClose: () -> Unit,
    onAskDelete: () -> Unit,
    actions: BuilderActions,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceSm),
        verticalAlignment = Alignment.Top,
    ) {
        IconButton(onClick = onClose, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
            Icon(painterResource(R.drawable.ic_close), contentDescription = "Close builder", tint = spin.text)
        }
        val length = draft.content.name.length
        val counter: (@Composable () -> Unit)? = if (length >= 70) {
            { Text("$length/${Draft.MAX_NAME}") }
        } else {
            null
        }
        OutlinedTextField(
            value = draft.content.name,
            onValueChange = { actions.onDraft(draft.withName(it)) },
            label = { Text("Workout name") },
            singleLine = true,
            textStyle = TextStyle(fontSize = Tokens.TEXT_LG.sp, fontWeight = FontWeight.Bold),
            supportingText = counter,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(Tokens.spaceSm))
        FilledAction(if (saving) "Saving…" else "Save", actions.onSave, enabled = !saving)
        if (!draft.isNew) {
            Box {
                IconButton(onClick = { menu = true }, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                    Icon(painterResource(R.drawable.ic_more), contentDescription = "More", tint = spin.text)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("Delete workout", color = spin.dangerText) },
                        onClick = {
                            menu = false
                            onAskDelete()
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun Summary(draft: Draft, ftpW: Int?) {
    val e = Maths.estimate(draft.steps(), ftpW, 100)
    val ftp = if (ftpW != null) "at FTP $ftpW W" else "No FTP yet"
    SpinText(
        "${WorkoutText.total(e.totalS)}   TSS ${e.tss}   IF ${e.ifText}   $ftp",
        Tokens.TEXT_SM,
        color = spin.text,
    )
}

@Composable
private fun Blocks(draft: Draft, ftpW: Int?, actions: BuilderActions) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        draft.blocks.forEachIndexed { i, block ->
            when (block) {
                is Step -> BlockStepRow(block, draft.selected == Selection(i), ftpW) {
                    actions.onDraft(draft.select(Selection(i)))
                }
                is Repeat -> RepeatBox(draft, i, block, ftpW, actions)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            DashedAction("+ Step", { actions.onDraft(draft.addStep()) }, Modifier.weight(1f), enabled = draft.canAddBlock)
            DashedAction("+ Repeat", { actions.onDraft(draft.addRepeat()) }, Modifier.weight(1f), enabled = draft.canAddBlock)
        }
    }
}

@Composable
private fun RepeatBox(draft: Draft, index: Int, repeat: Repeat, ftpW: Int?, actions: BuilderActions) {
    val selected = draft.selected == Selection(index)
    val group = repeat.steps.sumOf { it.durS }
    val shape = Tokens.radiusLg
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(spin.primaryBg)
            .then(if (selected) Modifier.border(2.dp, spin.primary, shape) else Modifier)
            .padding(Tokens.spaceSm),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = SpinSizes.TAP_TARGET.dp)
                .clickable(role = Role.Button) { actions.onDraft(draft.select(Selection(index))) }
                .padding(horizontal = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SpinText("REPEAT ${repeat.times}×", Tokens.TEXT_XS, color = spin.primaryText, weight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            SpinText(
                "${WorkoutText.total(group)} each · ${WorkoutText.total(group * repeat.times)} total",
                Tokens.TEXT_XS,
                color = spin.primaryText,
                maxLines = 1,
            )
        }
        repeat.steps.forEachIndexed { j, s ->
            BlockStepRow(s, draft.selected == Selection(index, j), ftpW) {
                actions.onDraft(draft.select(Selection(index, j)))
            }
        }
        DashedAction(
            "+ Step in repeat",
            { actions.onDraft(draft.addStepInRepeat(index)) },
            Modifier.fillMaxWidth(),
            enabled = draft.canAddStepInRepeat(index),
        )
    }
}

@Composable
private fun BlockStepRow(step: Step, selected: Boolean, ftpW: Int?, onClick: () -> Unit) {
    val r = Maths.resolve(step, ftpW, 100)
    val zone = r.zone(100)
    val zoneColor = if (zone == null) spin.border else spin.zones[zone.ordinal]
    val target = WorkoutText.target(r)
    val duration = WorkoutText.clock(step.durS)
    val shape = Tokens.radiusMd
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = SpinSizes.ROW_HEIGHT.dp)
            .clip(shape)
            .background(spin.surface)
            .border(if (selected) 2.dp else 1.dp, if (selected) spin.primary else spin.borderSoft, shape)
            .semantics(mergeDescendants = true) { contentDescription = "${step.label}, $duration, $target" }
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceSm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        Box(
            modifier = Modifier
                .width(Tokens.spaceXs)
                .height(40.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(zoneColor),
        )
        SpinText(step.label.ifBlank { "(no name)" }, Tokens.TEXT_SM, modifier = Modifier.weight(1f), color = spin.text, weight = FontWeight.SemiBold, maxLines = 2)
        SpinText(duration, Tokens.TEXT_SM, color = spin.textSecondary, maxLines = 1)
        SpinText(target, Tokens.TEXT_SM, color = spin.text, weight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun EditorPanel(draft: Draft, ftpW: Int?, actions: BuilderActions) {
    val sel = draft.selected
    val step = draft.stepAt(sel)
    val repeat = draft.repeatAt(sel)
    var numberField by remember { mutableStateOf<NumberField?>(null) }
    var durationOpen by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(8.dp)
            .background(spin.surface)
            .topRule(spin.borderSoft)
            .heightIn(max = 340.dp)
            .verticalScroll(rememberScrollState())
            .padding(Tokens.spaceMd),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        if (sel == null || (step == null && repeat == null)) {
            SpinText("Add a step to start.", Tokens.TEXT_SM, color = spin.textSecondary)
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            SpinText(
                step?.label?.ifBlank { "Step" } ?: "Repeat block",
                Tokens.TEXT_BASE,
                modifier = Modifier.weight(1f),
                color = spin.text,
                weight = FontWeight.Bold,
                maxLines = 1,
            )
            TextAction("Delete", { actions.onDraft(draft.delete(sel)) }, color = spin.dangerText)
        }
        if (step != null) {
            OutlinedTextField(
                value = step.label,
                onValueChange = { actions.onDraft(draft.setLabel(sel, it)) },
                label = { Text("Label") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Segmented(
                name = "Mode",
                options = listOf(
                    StepMode.Erg to "ERG",
                    StepMode.Resistance to "Resistance",
                    StepMode.Slope to "Slope",
                    StepMode.Free to "Free",
                ),
                selected = step.mode,
                onSelect = { actions.onDraft(draft.setMode(sel, it)) },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
                Stepper(
                    title = "Duration",
                    value = WorkoutText.clock(step.durS),
                    onMinus = { actions.onDraft(draft.nudgeDuration(sel, false)) },
                    onPlus = { actions.onDraft(draft.nudgeDuration(sel, true)) },
                    minusDescription = "Shorter",
                    plusDescription = "Longer",
                    modifier = Modifier.weight(1f),
                    canMinus = step.durS > 30,
                    canPlus = step.durS < Draft.MAX_DURATION_S,
                    onValueClick = { durationOpen = true },
                )
                TargetStepper(draft, sel, step, Modifier.weight(1f), onDraft = actions.onDraft, onType = { numberField = it })
            }
            when (step.mode) {
                StepMode.Erg -> {
                    CheckRow("Ramp to", step.pctEnd != null, { actions.onDraft(draft.setRamp(sel, it)) })
                    if (step.pctEnd != null) {
                        Stepper(
                            title = "End %",
                            value = "${step.pctEnd}%",
                            onMinus = { actions.onDraft(draft.nudgePctEnd(sel, false)) },
                            onPlus = { actions.onDraft(draft.nudgePctEnd(sel, true)) },
                            minusDescription = "Lower end",
                            plusDescription = "Higher end",
                            canMinus = step.pctEnd > 0,
                            canPlus = step.pctEnd < 300,
                            onValueClick = { numberField = NumberField.PctEnd },
                        )
                    }
                }
                StepMode.Free -> SpinText(
                    "Ride as you like. The trainer applies no resistance target.",
                    Tokens.TEXT_XS,
                    color = spin.textSecondary,
                )
                else -> Unit
            }
            CheckRow("Cadence target", step.cadence != null, { actions.onDraft(draft.setCadenceOn(sel, it)) })
            if (step.cadence != null) {
                Stepper(
                    title = "rpm",
                    value = "${step.cadence}",
                    onMinus = { actions.onDraft(draft.nudgeCadence(sel, false)) },
                    onPlus = { actions.onDraft(draft.nudgeCadence(sel, true)) },
                    minusDescription = "Slower cadence",
                    plusDescription = "Faster cadence",
                    canMinus = step.cadence > 40,
                    canPlus = step.cadence < 150,
                    onValueClick = { numberField = NumberField.Rpm },
                )
            }
            if (step.mode == StepMode.Erg) {
                SpinText(ergNote(step, ftpW), Tokens.TEXT_XS, color = spin.textSecondary)
            }
        }
        if (repeat != null) {
            Stepper(
                title = "Times through",
                value = "${repeat.times}×",
                onMinus = { actions.onDraft(draft.nudgeTimes(sel.block, false)) },
                onPlus = { actions.onDraft(draft.nudgeTimes(sel.block, true)) },
                minusDescription = "Fewer times",
                plusDescription = "More times",
                canMinus = repeat.times > 2,
                canPlus = repeat.times < 50,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            if (draft.canMoveUp(sel)) {
                OutlineAction("Move up", { actions.onDraft(draft.moveUp(sel)) }, Modifier.weight(1f))
            }
            if (draft.canMoveDown(sel)) {
                OutlineAction("Move down", { actions.onDraft(draft.moveDown(sel)) }, Modifier.weight(1f))
            }
        }
        if (step != null) {
            val field = numberField
            if (field != null) {
                NumberDialog(
                    title = field.title,
                    initial = initialText(field, step),
                    decimal = field == NumberField.Grade,
                    onDismiss = { numberField = null },
                    onDone = { text ->
                        numberField = null
                        actions.onDraft(applyNumber(draft, sel, field, text))
                    },
                )
            }
            if (durationOpen) {
                DurationDialog(
                    initialS = step.durS,
                    onDismiss = { durationOpen = false },
                    onDone = { total ->
                        durationOpen = false
                        actions.onDraft(draft.setDuration(sel, total))
                    },
                )
            }
        }
    }
}

@Composable
private fun TargetStepper(
    draft: Draft,
    sel: Selection,
    step: Step,
    modifier: Modifier,
    onDraft: (Draft) -> Unit,
    onType: (NumberField) -> Unit,
) {
    when (step.mode) {
        StepMode.Erg -> Stepper(
            title = "Target · % of FTP",
            value = "${step.pct ?: 0}%",
            onMinus = { onDraft(draft.nudgePct(sel, false)) },
            onPlus = { onDraft(draft.nudgePct(sel, true)) },
            minusDescription = "Lower target",
            plusDescription = "Higher target",
            modifier = modifier,
            canMinus = (step.pct ?: 0) > 0,
            canPlus = (step.pct ?: 0) < 300,
            onValueClick = { onType(NumberField.Pct) },
        )
        StepMode.Resistance -> Stepper(
            title = "Level",
            value = "${step.level ?: 0}",
            onMinus = { onDraft(draft.nudgeLevel(sel, false)) },
            onPlus = { onDraft(draft.nudgeLevel(sel, true)) },
            minusDescription = "Lower level",
            plusDescription = "Higher level",
            modifier = modifier,
            canMinus = (step.level ?: 0) > 0,
            canPlus = (step.level ?: 0) < 100,
            onValueClick = { onType(NumberField.Level) },
        )
        StepMode.Slope -> Stepper(
            title = "Grade",
            value = WorkoutText.grade(step.gradeTenths ?: 0),
            onMinus = { onDraft(draft.nudgeGrade(sel, false)) },
            onPlus = { onDraft(draft.nudgeGrade(sel, true)) },
            minusDescription = "Flatter",
            plusDescription = "Steeper",
            modifier = modifier,
            canMinus = (step.gradeTenths ?: 0) > -100,
            canPlus = (step.gradeTenths ?: 0) < 200,
            onValueClick = { onType(NumberField.Grade) },
        )
        StepMode.Free -> Spacer(modifier)
    }
}

private fun ergNote(step: Step, ftpW: Int?): String {
    val pct = step.pct ?: return ""
    if (ftpW == null) return "Targets are saved as a percentage of FTP."
    val tail = "at your current FTP. Targets are saved as a percentage, so they move when your FTP changes."
    val a = Maths.watts(ftpW, pct, 100)
    val end = step.pctEnd
    return if (end != null && end != pct) {
        "$a–${Maths.watts(ftpW, end, 100)} W $tail"
    } else {
        "$a W $tail"
    }
}

private fun initialText(field: NumberField, step: Step): String = when (field) {
    NumberField.Pct -> "${step.pct ?: 0}"
    NumberField.PctEnd -> "${step.pctEnd ?: 0}"
    NumberField.Level -> "${step.level ?: 0}"
    NumberField.Grade -> gradeText(step.gradeTenths ?: 0)
    NumberField.Rpm -> "${step.cadence ?: 90}"
}

private fun gradeText(tenths: Int): String {
    val sign = if (tenths < 0) "-" else ""
    val a = kotlin.math.abs(tenths)
    return "$sign${a / 10}.${a % 10}"
}

private fun applyNumber(draft: Draft, sel: Selection, field: NumberField, text: String): Draft {
    val n = text.trim().toDoubleOrNull() ?: return draft
    return when (field) {
        NumberField.Pct -> draft.setPct(sel, n.roundToInt())
        NumberField.PctEnd -> draft.setPctEnd(sel, n.roundToInt())
        NumberField.Level -> draft.setLevel(sel, n.roundToInt())
        NumberField.Grade -> draft.setGrade(sel, (n * 10).roundToInt())
        NumberField.Rpm -> draft.setCadence(sel, n.roundToInt())
    }
}

@Composable
private fun NumberDialog(
    title: String,
    initial: String,
    decimal: Boolean,
    onDismiss: () -> Unit,
    onDone: (String) -> Unit,
) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
            )
        },
        confirmButton = { TextButton(onClick = { onDone(text) }) { Text("OK") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun DurationDialog(initialS: Int, onDismiss: () -> Unit, onDone: (Int) -> Unit) {
    var minutes by remember { mutableStateOf("${initialS / 60}") }
    var seconds by remember { mutableStateOf("${initialS % 60}") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Duration") },
        text = {
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                OutlinedTextField(
                    value = minutes,
                    onValueChange = { minutes = it.filter(Char::isDigit).take(3) },
                    label = { Text("Minutes") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = seconds,
                    onValueChange = { seconds = it.filter(Char::isDigit).take(2) },
                    label = { Text("Seconds") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val total = (minutes.toIntOrNull() ?: 0) * 60 + (seconds.toIntOrNull() ?: 0)
                onDone(total)
            }) { Text("OK") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
