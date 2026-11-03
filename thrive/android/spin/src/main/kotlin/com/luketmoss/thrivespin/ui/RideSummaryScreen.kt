package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.summary.Band
import com.luketmoss.thrivespin.core.summary.CardButtons
import com.luketmoss.thrivespin.core.summary.IntervalRow
import com.luketmoss.thrivespin.core.summary.Mark
import com.luketmoss.thrivespin.core.summary.RideSummary
import com.luketmoss.thrivespin.core.summary.SummaryPhase
import com.luketmoss.thrivespin.core.summary.SummaryText
import com.luketmoss.thrivespin.core.summary.SummaryTiles
import com.luketmoss.thrivespin.core.summary.SummaryView
import com.luketmoss.thrivespin.core.summary.Tile
import com.luketmoss.thrivespin.core.upload.Effort
import com.luketmoss.thrivespin.core.upload.PendingBanner
import com.luketmoss.thrivespin.core.upload.BannerKind
import com.luketmoss.thrivespin.core.upload.SavePayload
import java.time.ZoneId

class SummaryActions(
    /** The top bar's arrow and the system back: Later on a draft, Done anywhere else. */
    val onBack: () -> Unit,
    val onLater: () -> Unit,
    val onDone: () -> Unit,
    val onSave: () -> Unit,
    val onOpenInThrive: () -> Unit,
    val onSendNow: () -> Unit,
    val onTryAgain: () -> Unit,
    /** After the "Delete this ride?" dialog is confirmed. */
    val onDeleteFromPhone: () -> Unit,
    /** After the "Discard this ride?" dialog is confirmed. */
    val onDiscard: () -> Unit,
    val onOpenSettings: () -> Unit,
    val onEffort: (Effort?) -> Unit,
    val onNotes: (String) -> Unit,
)

/**
 * "5 · Saved to Thrive": what the ride was, whether Thrive has it, and effort and notes to send with it.
 * Everything it says comes from [view] (core/summary/SummaryState); this only draws it. A full screen with no
 * bottom bar, in the system theme, scrolling, with a pinned footer.
 */
@Composable
fun RideSummaryScreen(
    summary: RideSummary?,
    view: SummaryView,
    effort: Effort?,
    notes: String,
    zone: ZoneId,
    storageNote: String?,
    actions: SummaryActions,
) {
    var confirmDiscard by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg)
            .safeDrawingPadding(),
    ) {
        IconButton(onClick = actions.onBack, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
            Icon(painterResource(R.drawable.ic_back), contentDescription = "Back", tint = spin.text)
        }
        if (view.phase == SummaryPhase.Preparing) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(color = spin.primary)
                Spacer(Modifier.height(Tokens.spaceSm))
                SpinText("Preparing your ride…", Tokens.TEXT_SM, color = spin.textSecondary)
            }
            return@Column
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd),
        ) {
            if (summary != null) Heading(summary, storageNote)
            StatusCard(view, actions, onDelete = { confirmDelete = true })
            if (summary != null && view.phase == SummaryPhase.Ready) {
                Tiles(summary)
                ScoredLine(summary)
                if (summary.intervals.isNotEmpty()) Intervals(summary.intervals)
            }
            if (view.fieldsVisible) {
                EffortGroup(effort, view.fieldsEditable, actions.onEffort)
                NotesField(notes, view.fieldsEditable, actions.onNotes)
                if (view.fieldsNote != null) SpinText(view.fieldsNote, Tokens.TEXT_XS, color = spin.textSecondary)
            }
            if (view.discardVisible) {
                Box(
                    modifier = Modifier
                        .heightIn(min = SpinSizes.TAP_TARGET.dp)
                        .clip(Tokens.radiusMd)
                        .clickable(role = Role.Button) { confirmDiscard = true }
                        .padding(horizontal = Tokens.spaceSm),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    SpinText("Discard ride", Tokens.TEXT_BASE, color = spin.dangerText, weight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(Tokens.spaceSm))
        }
        Footer(view, actions)
    }

    if (confirmDiscard && summary != null) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Discard this ride?") },
            text = {
                Text("“${summary.name}”, ${SummaryText.dateOnly(summary.startedAtUtc, zone)}. Nothing from it is saved, here or in Thrive.")
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDiscard = false
                    actions.onDiscard()
                }) { Text("Discard ride", color = spin.dangerText, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text("Keep it") } },
        )
    }
    if (confirmDelete && summary != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this ride?") },
            text = {
                Text(
                    "“${summary.name}”, ${SummaryText.dateOnly(summary.startedAtUtc, zone)}. Thrive didn't take it, " +
                        "so it only exists on this phone. Deleting it removes the recording and its FIT file for good.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    actions.onDeleteFromPhone()
                }) { Text("Delete ride", color = spin.dangerText, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Keep it") } },
        )
    }
}

@Composable
private fun Heading(summary: RideSummary, storageNote: String?) {
    val zone = remember { ZoneId.systemDefault() }
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
        SpinText(
            SummaryText.eyebrow(summary.endReason, summary.startedAtUtc, zone).uppercase(),
            Tokens.TEXT_XS,
            color = spin.primaryText,
            weight = FontWeight.Bold,
        )
        Text(summary.name, color = spin.text, fontSize = Tokens.TEXT_2XL.sp, fontWeight = FontWeight.Bold)
        val why = SummaryText.whyEnded(summary.endReason, summary.elapsedS)
        if (why != null) SpinText(why, Tokens.TEXT_SM, color = spin.textSecondary)
        if (storageNote != null) SpinText(storageNote, Tokens.TEXT_SM, color = spin.warning)
    }
}

@Composable
private fun StatusCard(view: SummaryView, actions: SummaryActions, onDelete: () -> Unit) {
    SpinCard(modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(
            modifier = Modifier.padding(Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            SpinText(view.cardTitle, Tokens.TEXT_SM, color = spin.text, weight = FontWeight.Bold)
            if (view.progress) {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(Tokens.radiusFull),
                    color = spin.primary,
                    trackColor = spin.borderSoft,
                )
            }
            if (view.phase == SummaryPhase.Ready) {
                StatusStep("Recorded on this phone", view.recordedNote, Mark.Done)
                StatusStep("FIT file written", view.fitNote, view.fitMark)
                StatusStep(view.step3Label, view.step3Note, view.step3Mark)
            }
            for (line in view.extraLines) SpinText(line, Tokens.TEXT_SM, color = spin.textSecondary)
            when (view.buttons) {
                CardButtons.None -> Unit
                CardButtons.SendNow -> OutlineAction("Send now", actions.onSendNow, color = spin.text)
                CardButtons.TryAgain -> FilledAction("Try again", actions.onTryAgain)
                CardButtons.OpenSettings -> FilledAction("Open settings", actions.onOpenSettings)
                CardButtons.TryAgainOrDelete -> Row(
                    horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FilledAction("Try again", actions.onTryAgain)
                    TextAction("Delete from phone", onDelete, color = spin.dangerText)
                }
            }
        }
    }
}

@Composable
private fun StatusStep(label: String, note: String?, mark: Mark) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 28.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MarkCircle(mark)
        Spacer(Modifier.width(Tokens.spaceSm))
        SpinText(label, Tokens.TEXT_SM, color = spin.text, modifier = Modifier.weight(1f, fill = false))
        if (note != null) {
            Spacer(Modifier.width(Tokens.spaceSm))
            SpinText(note, Tokens.TEXT_XS, color = spin.textSecondary, modifier = Modifier.weight(1f), maxLines = 1)
        }
    }
}

/** Each mark differs in shape as well as colour: a check, an ellipsis, an exclamation mark, an empty circle. */
@Composable
private fun MarkCircle(mark: Mark) {
    val word = when (mark) {
        Mark.Done -> "done"
        Mark.Waiting -> "waiting"
        Mark.Problem -> "problem"
        Mark.NotYet -> "not yet"
    }
    val base = Modifier
        .size(22.dp)
        .clip(CircleShape)
    val styled = when (mark) {
        Mark.Done -> base.background(spin.success)
        Mark.Problem -> base.background(spin.dangerText)
        Mark.Waiting -> base.border(2.dp, spin.warning, CircleShape)
        Mark.NotYet -> base.border(2.dp, spin.borderStrong, CircleShape)
    }
    val glyph = when (mark) {
        Mark.Done -> "✓"
        Mark.Waiting -> "…"
        Mark.Problem -> "!"
        Mark.NotYet -> ""
    }
    val glyphColor = if (mark == Mark.Waiting) spin.text else spin.onFill
    Box(
        modifier = styled.semantics { contentDescription = word },
        contentAlignment = Alignment.Center,
    ) {
        if (glyph.isNotEmpty()) Text(glyph, color = glyphColor, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Tiles(summary: RideSummary) {
    val tiles = SummaryTiles.of(summary)
    // At a font scale where a value would not fit on one line the grid is two columns, never a cut value.
    val columns = if (LocalDensity.current.fontScale > 1.3f) 2 else 3
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        for (row in tiles.chunked(columns)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm), modifier = Modifier.fillMaxWidth()) {
                for (tile in row) TileCard(tile, Modifier.weight(1f))
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun TileCard(tile: Tile, modifier: Modifier) {
    Column(
        modifier = modifier
            .clip(Tokens.radiusMd)
            .background(spin.surface)
            .border(1.dp, spin.borderSoft, Tokens.radiusMd)
            .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceSm)
            .clearAndSetSemantics { contentDescription = tile.description },
    ) {
        SpinText(tile.label, Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.SemiBold, maxLines = 1)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                tile.value,
                color = spin.text,
                fontSize = Tokens.TEXT_XL.sp,
                fontWeight = FontWeight.Bold,
                style = TextStyle(fontFeatureSettings = "tnum"),
                maxLines = 1,
            )
            if (tile.unit.isNotEmpty()) {
                Spacer(Modifier.width(Tokens.spaceXs))
                SpinText(tile.unit, Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 1)
            }
        }
    }
}

@Composable
private fun ScoredLine(summary: RideSummary) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        SpinText(SummaryTiles.scoredLine(summary), Tokens.TEXT_XS, color = spin.textSecondary, modifier = Modifier.weight(1f))
        if (summary.pausedS > 0) {
            SpinText(SummaryText.pausedTotal(summary.pausedS), Tokens.TEXT_XS, color = spin.textSecondary)
        }
    }
}

@Composable
private fun Intervals(rows: List<IntervalRow>) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
        SpinText("Intervals", Tokens.TEXT_LG, color = spin.text, weight = FontWeight.Bold)
        SpinText("Average power against the target you rode, after intensity.", Tokens.TEXT_SM, color = spin.textSecondary)
    }
    SpinCard {
        rows.forEachIndexed { i, row ->
            if (i > 0) Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(spin.borderSoft))
            IntervalRowView(row)
        }
    }
}

@Composable
private fun IntervalRowView(row: IntervalRow) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = SpinSizes.ROW_HEIGHT.dp)
            .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm)
            .clearAndSetSemantics { contentDescription = SummaryTiles.rowDescription(row) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                row.name,
                color = spin.text,
                fontSize = Tokens.TEXT_BASE.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
            )
            SpinText("target ${row.targetText} W", Tokens.TEXT_SM, color = spin.textSecondary)
        }
        Spacer(Modifier.width(Tokens.spaceSm))
        if (row.avgW != null) {
            SpinText("${row.avgW} W", Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold, maxLines = 1)
            Spacer(Modifier.width(Tokens.spaceMd))
        }
        Column(horizontalAlignment = Alignment.End) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val glyph = bandGlyph(row.band)
                if (glyph != null) {
                    Text(glyph.first, color = glyph.second, fontSize = Tokens.TEXT_SM.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(Tokens.spaceXs))
                }
                SpinText(row.percent?.let { "$it%" } ?: "—", Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold, maxLines = 1)
            }
            SpinText(row.band.word, Tokens.TEXT_XS, color = spin.text, maxLines = 1)
        }
    }
}

/** A glyph that differs in shape as well as colour, so a band survives greyscale; none for "too short". */
@Composable
private fun bandGlyph(band: Band): Pair<String, Color>? = when (band) {
    Band.OnTarget -> "✓" to spin.success
    Band.Below -> "▼" to spin.warning
    Band.Above -> "▲" to spin.zones[4]
    Band.TooShort -> null
}

@Composable
private fun EffortGroup(effort: Effort?, editable: Boolean, onEffort: (Effort?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        SpinText("How did it feel?", Tokens.TEXT_LG, color = spin.text, weight = FontWeight.Bold)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .selectableGroup()
                .semantics { contentDescription = "Effort" },
            horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            for (level in Effort.entries) {
                val selected = effort == level
                val shape = Tokens.radiusMd
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = SpinSizes.TAP_TARGET.dp)
                        .alpha(if (editable) 1f else 0.6f)
                        .clip(shape)
                        .background(if (selected) spin.primaryFill else spin.surface)
                        .then(if (selected) Modifier else Modifier.border(1.dp, spin.border, shape))
                        .selectable(
                            selected = selected,
                            enabled = editable,
                            role = Role.RadioButton,
                            onClick = { onEffort(if (selected) null else level) },
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    SpinText(
                        if (selected) "✓ ${level.wire}" else level.wire,
                        Tokens.TEXT_BASE,
                        color = if (selected) spin.onFill else spin.text,
                        weight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun NotesField(notes: String, editable: Boolean, onNotes: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
        SpinText("Notes", Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold)
        BasicTextField(
            value = notes,
            onValueChange = { if (it.length <= SavePayload.NOTES_MAX) onNotes(it) },
            enabled = editable,
            minLines = 2,
            maxLines = 6,
            textStyle = TextStyle(color = spin.text, fontSize = Tokens.TEXT_BASE.sp),
            cursorBrush = SolidColor(spin.primary),
            modifier = Modifier
                .fillMaxWidth()
                .alpha(if (editable) 1f else 0.6f)
                .clip(Tokens.radiusMd)
                .background(spin.surface)
                .border(1.dp, spin.border, Tokens.radiusMd),
            decorationBox = { inner ->
                Box(modifier = Modifier.padding(Tokens.spaceMd)) {
                    if (notes.isEmpty()) {
                        SpinText("Legs felt heavy in the last block", Tokens.TEXT_BASE, color = spin.textMuted)
                    }
                    inner()
                }
            },
        )
        if (editable && notes.length >= 900) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                SpinText("${SavePayload.NOTES_MAX - notes.length} left", Tokens.TEXT_XS, color = spin.textSecondary)
            }
        }
    }
}

@Composable
private fun Footer(view: SummaryView, actions: SummaryActions) {
    val left = view.left
    val right = view.right
    if (left == null && right == null) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(spin.bg)
            .topRule(spin.borderSoft)
            .padding(Tokens.spaceMd),
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        if (left != null) {
            FooterAction(
                left,
                onClick = if (left.label == "Later") actions.onLater else actions.onDone,
                modifier = Modifier.weight(1f),
            )
        }
        if (right != null) {
            FooterAction(
                right,
                onClick = if (right.label == "Save to Thrive") actions.onSave else actions.onOpenInThrive,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun FooterAction(button: com.luketmoss.thrivespin.core.summary.FooterButton, onClick: () -> Unit, modifier: Modifier) {
    if (button.filled) {
        FilledAction(button.label, onClick, modifier = modifier, enabled = button.enabled, height = SpinSizes.CTA_HEIGHT, shape = Tokens.radiusLg)
    } else {
        androidx.compose.material3.OutlinedButton(
            onClick = onClick,
            enabled = button.enabled,
            modifier = modifier.heightIn(min = SpinSizes.CTA_HEIGHT.dp),
            shape = Tokens.radiusLg,
            border = androidx.compose.foundation.BorderStroke(1.dp, spin.border),
            colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                containerColor = spin.surface,
                contentColor = spin.text,
                disabledContentColor = spin.text.copy(alpha = SpinSizes.OPACITY_DISABLED),
            ),
        ) { Text(button.label, fontWeight = FontWeight.Bold) }
    }
}

/**
 * The Library banner (#769): the one way back to a ride that is not finished with. [banner] is null when there
 * is nothing to show. Tapping anywhere opens the oldest ride in the most urgent state.
 */
@Composable
fun PendingRidesBanner(banner: PendingBanner?, onClick: () -> Unit) {
    if (banner == null) return
    val urgent = banner.kind == BannerKind.CouldntSave
    val shape = Tokens.radiusLg
    Row(
        modifier = Modifier
            .padding(horizontal = Tokens.spaceMd)
            .padding(bottom = Tokens.spaceSm)
            .fillMaxWidth()
            .clip(shape)
            .background(if (urgent) spin.warningBg else spin.surface)
            .then(if (urgent) Modifier else Modifier.border(1.dp, spin.borderSoft, shape))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(Tokens.spaceMd),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpinText(banner.text, Tokens.TEXT_SM, color = spin.text, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Tokens.spaceSm))
        Box(modifier = Modifier.heightIn(min = SpinSizes.TAP_TARGET.dp), contentAlignment = Alignment.Center) {
            SpinText(banner.button, Tokens.TEXT_SM, color = spin.primaryText, weight = FontWeight.Bold, maxLines = 1)
        }
    }
}
