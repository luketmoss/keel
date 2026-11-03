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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.luketmoss.thrivespin.core.ramp.ResultAction
import com.luketmoss.thrivespin.core.ramp.ResultButton
import com.luketmoss.thrivespin.core.ramp.ResultKind
import com.luketmoss.thrivespin.core.ramp.ResultText
import com.luketmoss.thrivespin.core.ramp.ResultTile
import com.luketmoss.thrivespin.core.ramp.ResultView

class ResultActions(
    /** The top bar's "Later" and the system back gesture: the decision stays pending. */
    val onLater: () -> Unit,
    val onLower: () -> Unit,
    val onHigher: () -> Unit,
    val onReset: () -> Unit,
    /** Keep, Set FTP or Continue. */
    val onFooter: (ResultAction) -> Unit,
    /** After the "Discard this test?" dialog is confirmed. */
    val onDiscard: () -> Unit,
    /** The cool-down strip's "Stop". */
    val onStopCooldown: () -> Unit,
)

/**
 * The result screen (#770): the new FTP to adjust and confirm. Everything it says comes from [view]
 * (core/ramp/RampResultState); this only draws it. A full screen in the system theme with no bottom bar,
 * scrolling, with a pinned footer.
 */
@Composable
fun RampResultScreen(view: ResultView, actions: ResultActions) {
    var confirmDiscard by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg)
            .safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier
                .heightIn(min = SpinSizes.TAP_TARGET.dp)
                .clickable(role = Role.Button, onClick = actions.onLater)
                .padding(end = Tokens.spaceMd),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.size(SpinSizes.TAP_TARGET.dp), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_back), contentDescription = null, tint = spin.text)
            }
            SpinText(ResultText.LATER, Tokens.TEXT_BASE, weight = FontWeight.SemiBold)
        }
        view.strip?.let { CooldownStrip(it, actions.onStopCooldown) }
        if (view.kind == ResultKind.Computing) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(color = spin.primary)
                Spacer(Modifier.size(Tokens.spaceSm))
                SpinText(view.lines.firstOrNull().orEmpty(), Tokens.TEXT_SM, color = spin.textSecondary)
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
            view.eyebrow?.let { SpinText(it, Tokens.TEXT_XS, color = spin.primaryText, weight = FontWeight.Bold) }
            when (view.kind) {
                ResultKind.Pending -> PendingBody(view, actions)
                ResultKind.TooShort -> {
                    SpinText(view.heading, Tokens.TEXT_LG, weight = FontWeight.Bold)
                    view.lines.forEach { SpinText(it, Tokens.TEXT_BASE, color = spin.textSecondary) }
                }
                ResultKind.Set, ResultKind.Kept -> {
                    ResultCard {
                        SpinText(view.heading, Tokens.TEXT_LG, weight = FontWeight.Bold)
                        view.lines.forEach { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary) }
                    }
                    Tiles(view.tiles)
                }
                ResultKind.Computing -> Unit
            }
            if (view.discardInContent) {
                Box(
                    modifier = Modifier
                        .heightIn(min = SpinSizes.TAP_TARGET.dp)
                        .clip(Tokens.radiusMd)
                        .clickable(role = Role.Button) { confirmDiscard = true }
                        .padding(horizontal = Tokens.spaceSm),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    SpinText("Discard test", Tokens.TEXT_BASE, color = spin.dangerText, weight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.size(Tokens.spaceSm))
        }
        Footer(view.footer) { button ->
            if (button.action == ResultAction.DiscardTest) confirmDiscard = true else actions.onFooter(button.action)
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text(ResultText.DISCARD_TITLE) },
            text = { Text(view.discardBody) },
            confirmButton = {
                TextAction("Discard test", onClick = {
                    confirmDiscard = false
                    actions.onDiscard()
                }, color = spin.dangerText)
            },
            dismissButton = { TextAction(ResultText.KEEP_IT, onClick = { confirmDiscard = false }) },
        )
    }
}

@Composable
private fun CooldownStrip(text: String, onStop: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(spin.surface)
            .padding(start = Tokens.spaceMd),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpinText(text, Tokens.TEXT_SM, modifier = Modifier.weight(1f))
        TextAction("Stop", onStop)
    }
}

@Composable
private fun PendingBody(view: ResultView, actions: ResultActions) {
    SpinText(view.heading, Tokens.TEXT_LG, weight = FontWeight.Bold)
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        StepButton("−", "Lower FTP", view.canLower, onStep = actions.onLower)
        Row(
            modifier = Modifier
                .width(160.dp)
                .semantics {
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = view.valueAnnouncement.orEmpty()
                },
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.Center,
        ) {
            Text(
                view.ftpW?.toString().orEmpty(),
                color = spin.text,
                fontSize = Tokens.FIGURE_XL.sp,
                fontWeight = FontWeight.Bold,
                style = TextStyle(fontFeatureSettings = "tnum"),
                maxLines = 1,
            )
            SpinText("W", Tokens.TEXT_LG, modifier = Modifier.padding(start = Tokens.spaceXs, bottom = Tokens.spaceSm), color = spin.textSecondary)
        }
        StepButton("+", "Higher FTP", view.canHigher, onStep = actions.onHigher)
    }
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
        view.changeLine?.let { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary) }
        view.basisLine?.let { SpinText(it, Tokens.TEXT_SM, color = spin.textSecondary) }
        view.resetLabel?.let { TextAction(it, actions.onReset) }
    }
    view.dropoutLine?.let {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(Tokens.radiusLg)
                .background(spin.warningBg)
                .padding(Tokens.spaceMd),
        ) {
            SpinText(it, Tokens.TEXT_SM, color = spin.text)
        }
    }
    Tiles(view.tiles)
}

@Composable
private fun ResultCard(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Tokens.radiusLg)
            .background(spin.surface)
            .border(1.dp, spin.borderSoft, Tokens.radiusLg)
            .padding(Tokens.spaceMd),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs),
    ) { content() }
}

@Composable
private fun Tiles(tiles: List<ResultTile>) {
    if (tiles.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm), modifier = Modifier.fillMaxWidth()) {
        for (tile in tiles) {
            val spoken = if (tile.unit.isEmpty()) "${tile.label} ${tile.value}" else "${tile.label} ${tile.value} ${tile.unit}"
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(Tokens.radiusMd)
                    .background(spin.surface)
                    .border(1.dp, spin.borderSoft, Tokens.radiusMd)
                    .padding(Tokens.spaceSm)
                    .clearAndSetSemantics { contentDescription = spoken },
            ) {
                SpinText(tile.label, Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    tile.value,
                    color = spin.text,
                    fontSize = Tokens.TEXT_XL.sp,
                    fontWeight = FontWeight.Bold,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                    maxLines = 1,
                )
                if (tile.unit.isNotEmpty()) SpinText(tile.unit, Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 1)
            }
        }
    }
}

@Composable
private fun Footer(buttons: List<ResultButton>, onClick: (ResultButton) -> Unit) {
    if (buttons.isEmpty()) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(spin.bg)
            .topRule(spin.borderSoft)
            .padding(Tokens.spaceMd),
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        for (button in buttons) {
            val modifier = Modifier.weight(1f)
            if (button.filled) {
                FilledAction(
                    button.label,
                    { onClick(button) },
                    modifier = modifier,
                    enabled = button.enabled,
                    height = SpinSizes.CTA_HEIGHT,
                    shape = Tokens.radiusLg,
                )
            } else {
                androidx.compose.material3.OutlinedButton(
                    onClick = { onClick(button) },
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
    }
}
