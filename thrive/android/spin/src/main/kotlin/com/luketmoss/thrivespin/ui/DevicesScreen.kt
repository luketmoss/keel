package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.ble.DeviceLive
import com.luketmoss.thrivespin.ble.HubState
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.DeviceStatus
import com.luketmoss.thrivespin.core.Ftms
import com.luketmoss.thrivespin.core.HeartRate
import com.luketmoss.thrivespin.core.SavedDevice
import com.luketmoss.thrivespin.core.SpinSizes

/** The one banner that may show above the devices, in the order the design note gives. */
sealed interface Banner {
    /** Nearby devices permission not granted; [canAsk] is false once the system will no longer prompt. */
    data class Permission(val canAsk: Boolean) : Banner
    data object BluetoothOff : Banner
}

class DevicesActions(
    val onSettings: () -> Unit,
    val onAddDevice: () -> Unit,
    val onSpinDown: () -> Unit,
    val onForget: (address: String) -> Unit,
    val onPick: (address: String) -> Unit,
    val onMoveUp: (address: String) -> Unit,
    val onMoveDown: (address: String) -> Unit,
    val onFallback: (Boolean) -> Unit,
    val onAllow: () -> Unit,
    val onOpenAppSettings: () -> Unit,
    val onTurnOnBluetooth: () -> Unit,
)

@Composable
fun DevicesScreen(
    devices: DeviceState,
    hub: HubState,
    nowMs: Long,
    permissionCanAsk: Boolean,
    actions: DevicesActions,
) {
    val banner: Banner? = when {
        !hub.permitted -> Banner.Permission(canAsk = permissionCanAsk)
        !hub.bluetoothOn -> Banner.BluetoothOff
        else -> null
    }
    DevicesContent(devices, hub, nowMs, banner, actions)
}

@Composable
fun DevicesContent(devices: DeviceState, hub: HubState, nowMs: Long, banner: Banner?, actions: DevicesActions) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg)
            .safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = Tokens.spaceMd, end = Tokens.spaceSm, top = Tokens.spaceSm, bottom = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SpinText(
                "Devices",
                Tokens.TEXT_2XL,
                modifier = Modifier.weight(1f),
                color = spin.text,
                weight = FontWeight.Bold,
            )
            IconButton(onClick = actions.onSettings, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                Icon(painterResource(R.drawable.ic_gear), contentDescription = "Settings", tint = spin.text)
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Tokens.spaceMd)
                .padding(bottom = Tokens.spaceLg),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceLg),
        ) {
            if (banner != null) BannerCard(banner, actions)

            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                SectionHeading("Trainer")
                TrainerCard(devices.trainer, hub, nowMs, actions)
            }

            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                SectionHeading("Heart rate · use for rides")
                HeartRateList(devices, hub, nowMs, actions)
            }

            AddDeviceButton(enabled = banner == null, onClick = actions.onAddDevice)
        }
    }
}

// ---- Banner ----

@Composable
private fun BannerCard(banner: Banner, actions: DevicesActions) {
    val (text, button, onClick) = when (banner) {
        is Banner.Permission ->
            if (banner.canAsk) {
                Triple(
                    "Spin needs the Nearby devices permission to find your trainer and heart rate straps.",
                    "Allow",
                    actions.onAllow,
                )
            } else {
                Triple(
                    "Spin needs the Nearby devices permission to find your trainer and heart rate straps.",
                    "Open settings",
                    actions.onOpenAppSettings,
                )
            }
        Banner.BluetoothOff -> Triple("Bluetooth is off.", "Turn on", actions.onTurnOnBluetooth)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Tokens.radiusLg)
            .background(spin.warningBg)
            .padding(start = Tokens.spaceMd, top = Tokens.spaceSm, bottom = Tokens.spaceSm, end = Tokens.spaceSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpinText(text, Tokens.TEXT_SM, modifier = Modifier.weight(1f), color = spin.text)
        TextButton(onClick = onClick, modifier = Modifier.heightIn(min = SpinSizes.TAP_TARGET.dp)) {
            Text(button, color = spin.primaryText, fontWeight = FontWeight.Bold)
        }
    }
}

// ---- Trainer ----

private fun statusOf(hub: HubState, live: DeviceLive?, nowMs: Long): DeviceStatus =
    DeviceStatus.of(
        ready = hub.ready,
        connected = live?.connected == true,
        lookingSinceMs = live?.lookingSinceMs ?: nowMs,
        nowMs = nowMs,
    )

@Composable
private fun TrainerCard(trainer: SavedDevice?, hub: HubState, nowMs: Long, actions: DevicesActions) {
    SpinCard {
        if (trainer == null) {
            Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
                SpinText("No trainer yet", Tokens.TEXT_BASE, weight = FontWeight.Bold)
                SpinText("Add your KICKR with + Add a device.", Tokens.TEXT_SM, color = spin.textSecondary)
            }
            return@SpinCard
        }
        val status = statusOf(hub, hub.live[trainer.address], nowMs)
        Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(Tokens.radiusMd)
                        .background(spin.primaryBg),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painterResource(R.drawable.ic_trainer),
                        contentDescription = null,
                        tint = spin.primary,
                        modifier = Modifier.size(24.dp),
                    )
                }
                Spacer(Modifier.width(Tokens.spaceMd))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    SpinText(trainer.name, Tokens.TEXT_BASE, weight = FontWeight.Bold)
                    SpinText(Ftms.detailLine(trainer.features), Tokens.TEXT_XS, color = spin.textSecondary)
                }
                Spacer(Modifier.width(Tokens.spaceSm))
                StatusPill(status)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm), verticalAlignment = Alignment.CenterVertically) {
                if (trainer.features?.spinDown == true) {
                    CardButton(
                        text = "Spin-down calibration",
                        color = spin.primaryText,
                        enabled = status == DeviceStatus.Connected,
                        onClick = actions.onSpinDown,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    SpinText(
                        "Calibrates itself",
                        Tokens.TEXT_SM,
                        modifier = Modifier.weight(1f),
                        color = spin.textMuted,
                    )
                }
                CardButton(
                    text = "Forget",
                    color = spin.text,
                    enabled = true,
                    onClick = { actions.onForget(trainer.address) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun CardButton(text: String, color: Color, enabled: Boolean, onClick: () -> Unit, modifier: Modifier) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = SpinSizes.TAP_TARGET.dp),
        shape = Tokens.radiusMd,
        border = BorderStroke(1.dp, spin.border.copy(alpha = if (enabled) 1f else SpinSizes.OPACITY_DISABLED)),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = color,
            disabledContentColor = color.copy(alpha = SpinSizes.OPACITY_DISABLED),
        ),
    ) {
        Text(text, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

@Composable
private fun StatusPill(status: DeviceStatus) {
    when (status) {
        DeviceStatus.Connected -> Pill("● Connected", spin.success, spin.successBg)
        DeviceStatus.Connecting -> Pill("Connecting…", spin.textSecondary, spin.overlayXs)
        DeviceStatus.NotFound -> Pill("Not found", spin.textSecondary, spin.overlayXs)
        DeviceStatus.Unavailable ->
            SpinText("—", Tokens.TEXT_XS, color = spin.textMuted, weight = FontWeight.Bold)
    }
}

// ---- Heart rate ----

@Composable
private fun HeartRateList(devices: DeviceState, hub: HubState, nowMs: Long, actions: DevicesActions) {
    val monitors = devices.monitors
    SpinCard {
        if (monitors.isEmpty()) {
            Column(modifier = Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
                SpinText("No heart rate monitor yet", Tokens.TEXT_BASE, weight = FontWeight.Bold)
                SpinText("Ride without one, or add a strap with + Add a device.", Tokens.TEXT_SM, color = spin.textSecondary)
            }
            return@SpinCard
        }
        Column(
            modifier = Modifier
                .selectableGroup()
                .semantics { contentDescription = "Heart rate monitor for rides" },
        ) {
            monitors.forEachIndexed { index, monitor ->
                if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(spin.borderSoft))
                MonitorRow(
                    monitor = monitor,
                    selected = devices.picked == monitor.address,
                    first = index == 0,
                    last = index == monitors.lastIndex,
                    live = hub.live[monitor.address],
                    hub = hub,
                    nowMs = nowMs,
                    actions = actions,
                )
            }
        }
    }
    if (monitors.size >= 2) FallbackToggle(devices.fallback, actions.onFallback)
    if (monitors.isNotEmpty()) {
        SpinText(
            "Only a strap you're wearing sends a heart rate. The live bpm is how you tell which strap is which.",
            Tokens.TEXT_XS,
            color = spin.textSecondary,
        )
    }
}

@Composable
private fun MonitorRow(
    monitor: SavedDevice,
    selected: Boolean,
    first: Boolean,
    last: Boolean,
    live: DeviceLive?,
    hub: HubState,
    nowMs: Long,
    actions: DevicesActions,
) {
    val status = statusOf(hub, live, nowMs)
    val (value, valueColor) = when (status) {
        DeviceStatus.Connected ->
            if (HeartRate.hasReading(live?.reading, nowMs)) {
                HeartRate.liveText(live?.reading, nowMs) to spin.success
            } else {
                "No reading" to spin.textSecondary
            }
        DeviceStatus.Connecting -> "Connecting…" to spin.textSecondary
        DeviceStatus.NotFound -> "Not found" to spin.textSecondary
        DeviceStatus.Unavailable -> "—" to spin.textMuted
    }
    var menu by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = SpinSizes.ROW_HEIGHT.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = SpinSizes.ROW_HEIGHT.dp)
                .selectable(selected = selected, role = Role.RadioButton, onClick = { actions.onPick(monitor.address) })
                .padding(start = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RadioButton(
                selected = selected,
                onClick = null,
                modifier = Modifier.padding(Tokens.spaceSm),
                colors = RadioButtonDefaults.colors(
                    selectedColor = spin.primary,
                    unselectedColor = spin.borderStrong,
                ),
            )
            SpinText(
                monitor.name,
                Tokens.TEXT_BASE,
                modifier = Modifier.weight(1f).padding(horizontal = Tokens.spaceSm),
                weight = FontWeight.Bold,
                maxLines = 2,
            )
            SpinText(value, Tokens.TEXT_SM, color = valueColor, weight = FontWeight.Bold, maxLines = 1)
        }
        Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                Icon(
                    painterResource(R.drawable.ic_more),
                    contentDescription = "More for ${monitor.name}",
                    tint = spin.textSecondary,
                )
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                if (!first) {
                    DropdownMenuItem(
                        text = { Text("Move up") },
                        onClick = { menu = false; actions.onMoveUp(monitor.address) },
                    )
                }
                if (!last) {
                    DropdownMenuItem(
                        text = { Text("Move down") },
                        onClick = { menu = false; actions.onMoveDown(monitor.address) },
                    )
                }
                DropdownMenuItem(
                    text = { Text("Forget") },
                    onClick = { menu = false; actions.onForget(monitor.address) },
                )
            }
        }
    }
}

@Composable
private fun FallbackToggle(checked: Boolean, onChange: (Boolean) -> Unit) {
    SpinCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = SpinSizes.CTA_HEIGHT.dp)
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange)
                .semantics { contentDescription = "Fall back to the next heart rate monitor" }
                .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SpinText(
                    "If it isn't found, use the next one",
                    Tokens.TEXT_SM,
                    weight = FontWeight.SemiBold,
                )
                SpinText("In the order above", Tokens.TEXT_XS, color = spin.textSecondary)
            }
            Checkbox(
                checked = checked,
                onCheckedChange = null,
                colors = CheckboxDefaults.colors(
                    checkedColor = spin.primaryFill,
                    checkmarkColor = spin.onFill,
                    uncheckedColor = spin.borderStrong,
                ),
            )
        }
    }
}

// ---- + Add a device ----

@Composable
private fun AddDeviceButton(enabled: Boolean, onClick: () -> Unit) {
    val stroke = spin.primary
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = SpinSizes.CTA_HEIGHT.dp)
            .alpha(if (enabled) 1f else SpinSizes.OPACITY_DISABLED)
            .clip(Tokens.radiusLg)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .drawBehind {
                drawRoundRect(
                    color = stroke,
                    cornerRadius = CornerRadius(16.dp.toPx()),
                    style = Stroke(
                        width = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(10.dp.toPx(), 6.dp.toPx())),
                    ),
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        SpinText("+ Add a device", Tokens.TEXT_BASE, color = spin.primaryText, weight = FontWeight.Bold)
    }
}
