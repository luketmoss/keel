package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.ftp.FtpBanner
import com.luketmoss.thrivespin.core.ftp.FtpRecord
import com.luketmoss.thrivespin.core.ftp.FtpSheetAction
import com.luketmoss.thrivespin.core.ftp.FtpText

/** The Library's ramp test card (#770): where the test is started, and the FTP Spin is using. */
@Composable
fun RampTestCard(line: String, onClick: () -> Unit) {
    val shape = Tokens.radiusLg
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(spin.surface)
            .border(1.dp, spin.borderSoft, shape)
            .semantics(mergeDescendants = true) { contentDescription = "Ramp test. $line" }
            .clickable(role = Role.Button, onClick = onClick)
            .padding(Tokens.spaceMd),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            SpinText("FTP TEST", Tokens.TEXT_XS, color = spin.primaryText, weight = FontWeight.Bold)
            SpinText("Ramp test", Tokens.TEXT_BASE, weight = FontWeight.Bold)
            SpinText(line, Tokens.TEXT_SM, color = spin.textSecondary)
        }
        Spacer(Modifier.width(Tokens.spaceSm))
        Icon(painterResource(R.drawable.ic_chevron), contentDescription = null, tint = spin.textSecondary, modifier = Modifier.size(20.dp))
    }
}

/**
 * The Library banner for FTP changes not yet in Thrive (#770), drawn as #769's rides banner is. Tapping opens
 * the FTP sheet for the oldest record of the most urgent state.
 */
@Composable
fun PendingFtpBanner(banner: FtpBanner?, onClick: () -> Unit) {
    if (banner == null) return
    val shape = Tokens.radiusLg
    Row(
        modifier = Modifier
            .padding(horizontal = Tokens.spaceMd)
            .padding(bottom = Tokens.spaceSm)
            .fillMaxWidth()
            .clip(shape)
            .background(if (banner.urgent) spin.warningBg else spin.surface)
            .then(if (banner.urgent) Modifier else Modifier.border(1.dp, spin.borderSoft, shape))
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

class FtpSheetActions(
    val onClose: () -> Unit,
    val onSendNow: () -> Unit,
    val onOpenSettings: () -> Unit,
    val onTryAgain: () -> Unit,
    /** After the "Drop this FTP change?" dialog is confirmed. */
    val onDrop: () -> Unit,
)

/** The FTP sheet (#770): one record, what state it is in, and the one thing to do about it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FtpSheet(record: FtpRecord, thisYear: Int, actions: FtpSheetActions) {
    val view = FtpText.sheet(record, thisYear)
    var confirmDrop by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = actions.onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = spin.surface,
        scrimColor = spin.scrim,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = Tokens.spaceMd, end = Tokens.spaceSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SpinText(view.title, Tokens.TEXT_LG, modifier = Modifier.weight(1f), weight = FontWeight.Bold)
                IconButton(onClick = actions.onClose, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                    Icon(painterResource(R.drawable.ic_close), contentDescription = "Close", tint = spin.text)
                }
            }
            Column(
                modifier = Modifier.padding(horizontal = Tokens.spaceMd),
                verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs),
            ) {
                SpinText(view.line, Tokens.TEXT_SM, color = spin.textSecondary)
                SpinText(view.status, Tokens.TEXT_SM)
            }
            Box(modifier = Modifier.padding(horizontal = Tokens.spaceMd)) {
                FilledAction(
                    view.action.label,
                    onClick = when (view.action) {
                        FtpSheetAction.SendNow -> actions.onSendNow
                        FtpSheetAction.OpenSettings -> actions.onOpenSettings
                        FtpSheetAction.TryAgain -> actions.onTryAgain
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Box(modifier = Modifier.padding(horizontal = Tokens.spaceSm)) {
                TextAction(FtpText.DROP_CHANGE, onClick = { confirmDrop = true }, color = spin.dangerText)
            }
        }
    }
    if (confirmDrop) {
        AlertDialog(
            onDismissRequest = { confirmDrop = false },
            title = { Text(view.dropTitle) },
            text = { Text(view.dropBody) },
            confirmButton = {
                TextAction(FtpText.DROP_CHANGE, onClick = {
                    confirmDrop = false
                    actions.onDrop()
                }, color = spin.dangerText)
            },
            dismissButton = { TextAction(FtpText.KEEP_IT, onClick = { confirmDrop = false }) },
        )
    }
}
