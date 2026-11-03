package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.ftp.FtpNow
import com.luketmoss.thrivespin.core.ramp.RampTest
import com.luketmoss.thrivespin.core.ramp.RampText

/**
 * The ramp test's intro (#770): what the test is, what it does to the FTP, and Start. A full screen in the
 * system theme with a back arrow and no bottom bar. [canRun] is false when the saved trainer's features are
 * known and lack power target setting: Start is then disabled, with the reason above it.
 */
@Composable
fun RampIntroScreen(
    current: FtpNow?,
    canRun: Boolean,
    thisYear: Int,
    onBack: () -> Unit,
    onStart: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg)
            .safeDrawingPadding(),
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
            Icon(painterResource(R.drawable.ic_back), contentDescription = "Back", tint = spin.text)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceLg),
        ) {
            SpinText(RampText.INTRO_TITLE, Tokens.TEXT_2XL, weight = FontWeight.Bold)
            SpinText(RampText.INTRO_BODY, Tokens.TEXT_BASE)
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                SpinText(RampText.HOW_IT_WORKS, Tokens.TEXT_LG, weight = FontWeight.Bold)
                for (line in RampText.INTRO_BULLETS) {
                    Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        SpinText("•", Tokens.TEXT_BASE)
                        SpinText(line, Tokens.TEXT_BASE, modifier = Modifier.weight(1f))
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
                SpinText(RampText.introLine(current, thisYear), Tokens.TEXT_SM, color = spin.textSecondary)
                SpinText(RampText.INTRO_NOTE, Tokens.TEXT_XS, color = spin.textSecondary)
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(spin.bg)
                .topRule(spin.borderSoft)
                .padding(Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            if (!canRun) SpinText(RampTest.CANT_RUN, Tokens.TEXT_XS, color = spin.textSecondary)
            FilledAction(
                text = RampText.START_TEST,
                onClick = onStart,
                modifier = Modifier.fillMaxWidth(),
                enabled = canRun,
                iconRes = R.drawable.ic_play,
                height = SpinSizes.CTA_HEIGHT,
                shape = Tokens.radiusLg,
            )
        }
    }
}
