package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.workout.Profile
import com.luketmoss.thrivespin.core.workout.StepsV1
import com.luketmoss.thrivespin.core.workout.Zone

/** The colour of a bar: [zone]'s token, or the neutral border colour for a step with no power target. */
typealias ZonePaint = (Zone?) -> Color

@Composable
fun defaultZonePaint(): ZonePaint {
    val zones = spin.zones
    val neutral = spin.border
    return { zone -> if (zone == null) neutral else zones[zone.ordinal] }
}

/**
 * The workout profile at one of its two sizes: a bar per step, wide in proportion to its duration,
 * high in proportion to its scaled target, a ramp a trapezoid. With [ftpLabel] (large size only) a
 * dashed line at 100% is labelled at its right end.
 */
@Composable
fun WorkoutProfile(
    steps: StepsV1,
    intensityPct: Int,
    height: Int,
    modifier: Modifier = Modifier,
    paint: ZonePaint = defaultZonePaint(),
    ftpLabel: String? = null,
) {
    val model = remember(steps, intensityPct) { Profile.model(steps, intensityPct) }
    val description = remember(steps) { Profile.description(steps) }
    val lineColor = spin.borderStrong
    val labelColor = spin.textSecondary
    val measurer = rememberTextMeasurer()
    val label = ftpLabel
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .semantics { contentDescription = description },
    ) {
        val gap = 2.dp.toPx()
        val corner = CornerRadius(4.dp.toPx())
        val total = model.totalS.coerceAtLeast(1).toFloat()
        val bars = model.bars
        val usable = (size.width - gap * (bars.size - 1)).coerceAtLeast(1f)
        var x = 0f
        for (bar in bars) {
            val w = usable * bar.durS / total
            val color = paint(bar.zone)
            val startH = size.height * bar.startFraction
            val endH = size.height * bar.endFraction
            if (bar.startFraction == bar.endFraction) {
                val path = Path().apply {
                    addRoundRect(
                        RoundRect(
                            left = x,
                            top = size.height - startH,
                            right = x + w,
                            bottom = size.height,
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
                    moveTo(x, size.height)
                    lineTo(x, size.height - startH)
                    lineTo(x + w, size.height - endH)
                    lineTo(x + w, size.height)
                    close()
                }
                drawPath(path, color)
            }
            x += w + gap
        }
        if (label != null) {
            val y = size.height * (1f - model.ftpFraction)
            drawLine(
                color = lineColor,
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 6.dp.toPx())),
            )
            val layout = measurer.measure(
                label,
                style = TextStyle(color = labelColor, fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
            )
            val top = (y - layout.size.height).coerceAtLeast(0f)
            drawText(layout, topLeft = Offset(size.width - layout.size.width, top))
        }
    }
}

/** Convenience for the two sizes. */
object ProfileSize {
    const val SMALL = SpinSizes.PROFILE_SM
    const val LARGE = SpinSizes.PROFILE_LG
}
