package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.core.SpinSizes
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** A 1dp rule along the top edge: the footer, the bottom bar and the editor panel. */
fun Modifier.topRule(color: Color): Modifier = drawBehind {
    drawLine(color, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1.dp.toPx())
}

/** A filled button in `--color-primary-fill`; [height] defaults to the tap target. */
@Composable
fun FilledAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    iconRes: Int? = null,
    height: Int = SpinSizes.TAP_TARGET,
    shape: androidx.compose.ui.graphics.Shape = Tokens.radiusMd,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = height.dp),
        shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = spin.primaryFill,
            contentColor = spin.onFill,
            disabledContainerColor = spin.primaryFill.copy(alpha = SpinSizes.OPACITY_DISABLED),
            disabledContentColor = spin.onFill,
        ),
    ) {
        if (iconRes != null) {
            Icon(painterResource(iconRes), contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Tokens.spaceSm))
        }
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

/** An outlined button, `--tap-target` tall. */
@Composable
fun OutlineAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = spin.primaryText,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = SpinSizes.TAP_TARGET.dp),
        shape = Tokens.radiusMd,
        border = BorderStroke(1.dp, spin.border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color, disabledContentColor = color.copy(alpha = SpinSizes.OPACITY_DISABLED)),
    ) { Text(text) }
}

@Composable
fun TextAction(text: String, onClick: () -> Unit, color: Color = spin.primaryText, enabled: Boolean = true) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.heightIn(min = SpinSizes.TAP_TARGET.dp),
        colors = ButtonDefaults.textButtonColors(contentColor = color, disabledContentColor = color.copy(alpha = SpinSizes.OPACITY_DISABLED)),
    ) { Text(text, fontWeight = FontWeight.SemiBold) }
}

/** A dashed-outline button: "+ Step", "+ Repeat", "+ Step in repeat". */
@Composable
fun DashedAction(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val color = spin.primary
    Box(
        modifier = modifier
            .heightIn(min = SpinSizes.TAP_TARGET.dp)
            .alpha(if (enabled) 1f else SpinSizes.OPACITY_DISABLED)
            .drawBehind {
                drawRoundRect(
                    color = color,
                    cornerRadius = CornerRadius(8.dp.toPx()),
                    style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f))),
                )
            }
            .clip(Tokens.radiusMd)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        SpinText(text, Tokens.TEXT_SM, color = spin.primaryText, weight = FontWeight.SemiBold)
    }
}

/** A single-choice pill: the category chips and the presets. */
@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, enabled: Boolean = true) {
    Box(
        modifier = Modifier
            .heightIn(min = SpinSizes.TAP_TARGET.dp)
            .alpha(if (enabled) 1f else SpinSizes.OPACITY_DISABLED)
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .clip(Tokens.radiusFull)
                .background(if (selected) spin.primaryFill else spin.surface)
                .border(1.dp, if (selected) spin.primaryFill else spin.border, Tokens.radiusFull)
                .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
        ) {
            SpinText(
                text,
                Tokens.TEXT_SM,
                color = if (selected) spin.onFill else spin.text,
                weight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}

/** A segmented single-choice control with an accessible [name]. */
@Composable
fun <T> Segmented(
    name: String,
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    isEnabled: (T) -> Boolean = { true },
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(Tokens.radiusMd)
            .border(1.dp, spin.border, Tokens.radiusMd)
            .selectableGroup()
            .semantics { contentDescription = name },
    ) {
        options.forEach { (value, label) ->
            val on = value == selected
            val enabled = isEnabled(value)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = SpinSizes.TAP_TARGET.dp)
                    .background(if (on) spin.primaryFill else spin.surface)
                    .alpha(if (enabled) 1f else SpinSizes.OPACITY_DISABLED)
                    .selectable(selected = on, enabled = enabled, role = Role.RadioButton, onClick = { onSelect(value) }),
                contentAlignment = Alignment.Center,
            ) {
                SpinText(
                    label,
                    Tokens.TEXT_SM,
                    color = if (on) spin.onFill else spin.text,
                    weight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * An icon-less round-cornered "-" or "+" button that steps once on press and then repeats while it
 * is held. It is also a plain click for an accessibility service.
 */
@Composable
fun StepButton(
    symbol: String,
    description: String,
    enabled: Boolean,
    width: Dp = SpinSizes.TAP_TARGET.dp,
    height: Dp = SpinSizes.TAP_TARGET.dp,
    onStep: () -> Unit,
) {
    val current by rememberUpdatedState(onStep)
    val scope = rememberCoroutineScope()
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .alpha(if (enabled) 1f else SpinSizes.OPACITY_DISABLED)
            .clip(Tokens.radiusMd)
            .border(1.dp, spin.border, Tokens.radiusMd)
            .semantics {
                contentDescription = description
                role = Role.Button
                onClick {
                    if (enabled) current()
                    enabled
                }
            }
            .pointerInput(enabled) {
                detectTapGestures(
                    onPress = {
                        if (!enabled) return@detectTapGestures
                        current()
                        val job = scope.launch {
                            delay(450)
                            while (true) {
                                current()
                                delay(80)
                            }
                        }
                        try {
                            tryAwaitRelease()
                        } finally {
                            job.cancel()
                        }
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        SpinText(symbol, Tokens.TEXT_XL, color = spin.text, weight = FontWeight.Bold)
    }
}

/** A labelled stepper: a title, "-", the value (tappable when [onValueClick] is given) and "+". */
@Composable
fun Stepper(
    title: String,
    value: String,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    minusDescription: String,
    plusDescription: String,
    modifier: Modifier = Modifier,
    canMinus: Boolean = true,
    canPlus: Boolean = true,
    onValueClick: (() -> Unit)? = null,
) {
    Column(modifier = modifier) {
        SpinText(title, Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            StepButton("−", minusDescription, canMinus, onStep = onMinus)
            Box(
                modifier = Modifier
                    .widthIn(min = 72.dp)
                    .heightIn(min = SpinSizes.TAP_TARGET.dp)
                    .then(
                        if (onValueClick != null) {
                            Modifier.clickable(role = Role.Button, onClick = onValueClick)
                        } else {
                            Modifier
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                SpinText(value, Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold, maxLines = 1)
            }
            StepButton("+", plusDescription, canPlus, onStep = onPlus)
        }
    }
}

/** The error line under a header: `--text-sm`, `--color-danger-text`. */
@Composable
fun ErrorLine(text: String, modifier: Modifier = Modifier) {
    SpinText(text, Tokens.TEXT_SM, modifier = modifier.fillMaxWidth(), color = spin.dangerText)
}

/** A checkbox row with a label; the whole row toggles. */
@Composable
fun CheckRow(text: String, checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .heightIn(min = SpinSizes.TAP_TARGET.dp)
            .selectable(selected = checked, role = Role.Checkbox, onClick = { onChange(!checked) }),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.material3.Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = androidx.compose.material3.CheckboxDefaults.colors(
                checkedColor = spin.primaryFill,
                checkmarkColor = spin.onFill,
                uncheckedColor = spin.borderStrong,
            ),
        )
        Spacer(Modifier.width(Tokens.spaceSm))
        SpinText(text, Tokens.TEXT_SM, color = spin.text)
    }
}

/** A centered message: a bold line, a secondary line, and optionally one action under them. */
@Composable
fun MessageBlock(
    title: String,
    body: String?,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Tokens.spaceLg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        Text(
            title,
            color = spin.text,
            fontWeight = FontWeight.Bold,
            fontSize = Tokens.TEXT_BASE.sp,
            textAlign = TextAlign.Center,
        )
        if (body != null) {
            Text(
                body,
                color = spin.textSecondary,
                fontSize = Tokens.TEXT_SM.sp,
                textAlign = TextAlign.Center,
            )
        }
        if (action != null) {
            Spacer(Modifier.height(Tokens.spaceSm))
            action()
        }
    }
}
