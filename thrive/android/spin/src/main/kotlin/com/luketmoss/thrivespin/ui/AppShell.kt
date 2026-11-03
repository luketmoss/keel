package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.AppTab
import com.luketmoss.thrivespin.core.SpinSizes

/**
 * The shell of the two tab screens: the content, and the bottom bar under it, Library | Build | Devices.
 * Build is not a place: it opens the builder on a new workout. Detail, the builder and Settings do not
 * use this and show no bar.
 */
@Composable
fun SpinShell(
    current: AppTab,
    onTab: (AppTab) -> Unit,
    onBuild: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg)
            .safeDrawingPadding(),
    ) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) { content() }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(SpinSizes.NAV_HEIGHT.dp)
                .background(spin.surface)
                .topRule(spin.borderSoft)
                .selectableGroup(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            BarItem("Library", R.drawable.ic_library, current == AppTab.Library, Modifier.weight(1f)) {
                onTab(AppTab.Library)
            }
            BuildItem(Modifier.weight(1f), onBuild)
            BarItem("Devices", R.drawable.ic_trainer, current == AppTab.Devices, Modifier.weight(1f)) {
                onTab(AppTab.Devices)
            }
        }
    }
}

@Composable
private fun BarItem(label: String, icon: Int, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val color = if (selected) spin.primaryText else spin.textSecondary
    Column(
        modifier = modifier
            .fillMaxSize()
            .selectable(selected = selected, role = Role.Tab, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
        SpinText(label, Tokens.TEXT_XS, color = color, weight = if (selected) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
    }
}

@Composable
private fun BuildItem(modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(painterResource(R.drawable.ic_build), contentDescription = null, tint = spin.textSecondary, modifier = Modifier.size(24.dp))
        SpinText("Build", Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 1)
    }
}
