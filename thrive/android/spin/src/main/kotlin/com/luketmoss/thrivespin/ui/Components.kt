package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** The suite's spacing, radii and type scale as dp and sp: 1rem is 16sp (design note, Shell). */
object Tokens {
    val spaceXs = 4.dp
    val spaceSm = 8.dp
    val spaceMd = 16.dp
    val spaceLg = 24.dp
    val radiusSm = RoundedCornerShape(4.dp)
    val radiusMd = RoundedCornerShape(8.dp)
    val radiusLg = RoundedCornerShape(16.dp)
    val radiusFull = RoundedCornerShape(percent = 50)
    const val TEXT_XS = 12
    const val TEXT_SM = 14
    const val TEXT_BASE = 16
    const val TEXT_LG = 18
    const val TEXT_XL = 20
    const val TEXT_2XL = 24
    const val FIGURE_LG = 36

    /** `--figure-xl`, `--figure-md` and `--lift-clock-size`: Thrive's tokens, mirrored under the same names (#768). */
    const val FIGURE_XL = 44
    const val FIGURE_MD = 28
    const val LIFT_CLOCK = 72
}

@Composable
fun SpinText(
    text: String,
    size: Int,
    modifier: Modifier = Modifier,
    color: Color = spin.text,
    weight: FontWeight = FontWeight.Normal,
    maxLines: Int = Int.MAX_VALUE,
) {
    Text(
        text = text,
        modifier = modifier,
        color = color,
        fontSize = size.sp,
        fontWeight = weight,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

/** A card: `--color-surface`, a 1dp `--color-border-light` outline, `--radius-lg` corners. */
@Composable
fun SpinCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(Tokens.radiusLg)
            .background(spin.surface)
            .border(1.dp, spin.borderSoft, Tokens.radiusLg),
        content = content,
    )
}

/** A section heading: uppercase, `--text-xs` bold, `--color-text-secondary`. */
@Composable
fun SectionHeading(text: String) {
    SpinText(text.uppercase(), Tokens.TEXT_XS, color = spin.textSecondary, weight = FontWeight.Bold)
}

@Composable
fun CenteredRow(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, content = content)
}

@Composable
fun Pill(text: String, color: Color, background: Color) {
    Box(
        modifier = Modifier
            .clip(Tokens.radiusFull)
            .background(background),
    ) {
        SpinText(
            text,
            Tokens.TEXT_XS,
            modifier = Modifier.padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceXs),
            color = color,
            weight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}
