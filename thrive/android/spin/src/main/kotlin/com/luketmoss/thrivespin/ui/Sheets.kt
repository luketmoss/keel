package com.luketmoss.thrivespin.ui

import android.os.SystemClock
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.ble.DeviceHub
import com.luketmoss.thrivespin.ble.DeviceScanner
import com.luketmoss.thrivespin.ble.TrainerListener
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.ScanAction
import com.luketmoss.thrivespin.core.ScanList
import com.luketmoss.thrivespin.core.ScanRow
import com.luketmoss.thrivespin.core.SpinDown
import com.luketmoss.thrivespin.core.SpinDownState
import com.luketmoss.thrivespin.core.SpinSizes
import kotlinx.coroutines.delay

private const val SCAN_MS = 30_000L

@Composable
private fun SheetHeader(title: String, onClose: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = Tokens.spaceMd, end = Tokens.spaceSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpinText(title, Tokens.TEXT_LG, modifier = Modifier.weight(1f), weight = FontWeight.Bold)
        IconButton(onClick = onClose, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
            Icon(painterResource(R.drawable.ic_close), contentDescription = "Close", tint = spin.text)
        }
    }
}

// ---- Add a device ----

/**
 * The scan sheet. It scans for 30 s on its own and stops when it ends, when it is closed, or when
 * [canScan] goes false (Bluetooth off). Each device appears once, in the order found.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanSheet(
    devices: DeviceState,
    scanner: DeviceScanner,
    canScan: Boolean,
    onAdd: (ScanRow) -> Unit,
    onDismiss: () -> Unit,
) {
    val list = remember { ScanList() }
    var version by remember { mutableIntStateOf(0) }
    var round by remember { mutableIntStateOf(0) }
    var scanning by remember { mutableStateOf(true) }
    val canScanNow by rememberUpdatedState(canScan)

    LaunchedEffect(round) {
        scanning = true
        if (!canScanNow || !scanner.start { if (list.offer(it)) version++ }) {
            scanning = false
            return@LaunchedEffect
        }
        try {
            val end = SystemClock.elapsedRealtime() + SCAN_MS
            while (SystemClock.elapsedRealtime() < end && canScanNow) delay(250)
        } finally {
            scanner.stop()
            scanning = false
        }
    }

    val rows = remember(version, devices) { list.rows(devices) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
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
            SheetHeader(if (scanning) "Looking for devices…" else "Scan finished", onDismiss)
            SpinText(
                "Trainers and heart rate monitors nearby. Close other apps that might be connected to them.",
                Tokens.TEXT_SM,
                modifier = Modifier.padding(horizontal = Tokens.spaceMd),
                color = spin.textSecondary,
            )
            if (rows.isEmpty()) {
                SpinText(
                    if (scanning) {
                        "Pedal to wake the trainer, and put the strap on."
                    } else {
                        "Nothing found. Pedal to wake the trainer, and put the strap on."
                    },
                    Tokens.TEXT_SM,
                    modifier = Modifier.padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
                    color = spin.textSecondary,
                )
            }
            rows.forEach { row -> ScanRowView(row, onAdd) }
            if (!scanning && canScan) {
                TextButton(
                    onClick = { round++ },
                    modifier = Modifier
                        .padding(horizontal = Tokens.spaceSm)
                        .heightIn(min = SpinSizes.TAP_TARGET.dp),
                ) { Text("Scan again", color = spin.primaryText, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun ScanRowView(row: ScanRow, onAdd: (ScanRow) -> Unit) {
    Row(
        modifier = Modifier
            .padding(horizontal = Tokens.spaceMd)
            .fillMaxWidth()
            .heightIn(min = SpinSizes.ROW_HEIGHT.dp)
            .clip(Tokens.radiusMd)
            .border(1.dp, spin.borderSoft, Tokens.radiusMd)
            .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            SpinText(row.name, Tokens.TEXT_BASE, weight = FontWeight.Bold, maxLines = 2)
            SpinText(row.detail, Tokens.TEXT_XS, color = spin.textSecondary)
        }
        when (row.action) {
            ScanAction.Add -> Button(
                onClick = { onAdd(row) },
                modifier = Modifier.heightIn(min = SpinSizes.TAP_TARGET.dp),
                shape = Tokens.radiusMd,
                colors = ButtonDefaults.buttonColors(containerColor = spin.primaryFill, contentColor = spin.onFill),
            ) { Text("Add", fontWeight = FontWeight.Bold) }
            ScanAction.Saved -> SpinText("Saved", Tokens.TEXT_SM, color = spin.textSecondary)
            ScanAction.None -> Box {}
        }
    }
}

// ---- Spin-down ----

/**
 * The spin-down sheet. Opening it starts the procedure; "Try again" restarts it. Closing it mid-way
 * sends nothing more to the trainer: it just stops listening.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpinDownSheet(hub: DeviceHub, onDismiss: () -> Unit) {
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<SpinDownState>(SpinDownState.Starting) }
    var speedMph by remember { mutableStateOf<Double?>(null) }
    val spinDown = remember(attempt) {
        // A write the hub cannot make means the trainer is gone.
        lateinit var machine: SpinDown
        machine = SpinDown(
            write = { if (!hub.writeControl(it)) machine.onDisconnect() },
            nowMs = { SystemClock.elapsedRealtime() },
        )
        machine
    }

    fun sync() {
        state = spinDown.state
        speedMph = spinDown.speedMph
    }

    DisposableEffect(spinDown) {
        hub.trainerListener = object : TrainerListener {
            override fun onControlResponse(bytes: ByteArray) {
                spinDown.onControlResponse(bytes)
                sync()
            }

            override fun onStatus(bytes: ByteArray) {
                spinDown.onStatus(bytes)
                sync()
            }

            override fun onSpeed(kmh: Double?) {
                spinDown.onSpeed(kmh)
                sync()
            }

            override fun onDisconnect() {
                spinDown.onDisconnect()
                sync()
            }
        }
        onDispose { hub.trainerListener = null }
    }

    LaunchedEffect(spinDown) {
        spinDown.start()
        sync()
        while (!spinDown.finished) {
            delay(1000)
            spinDown.onTick()
            sync()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
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
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd),
        ) {
            SheetHeader("Spin-down calibration", onDismiss)
            Column(
                modifier = Modifier.padding(horizontal = Tokens.spaceMd),
                verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
            ) {
                val current = state
                when (current) {
                    SpinDownState.Done ->
                        SpinText(current.message, Tokens.TEXT_XL, color = spin.success, weight = FontWeight.Bold)
                    is SpinDownState.Failed ->
                        SpinText(current.message, Tokens.TEXT_BASE, color = spin.text)
                    SpinDownState.Starting ->
                        SpinText(current.message, Tokens.TEXT_BASE, color = spin.textSecondary)
                    else ->
                        SpinText(current.message, Tokens.TEXT_XL, weight = FontWeight.Bold)
                }
                if (current is SpinDownState.SpeedUp || current == SpinDownState.Coast) {
                    val speed = speedMph
                    SpinText(
                        if (speed == null) "— mph" else "${SpinDown.formatMph(speed)} mph",
                        Tokens.FIGURE_LG,
                        weight = FontWeight.Bold,
                    )
                }
            }
            when (state) {
                SpinDownState.Done -> SheetButton("Done", filled = true, onClick = onDismiss)
                is SpinDownState.Failed -> Row(
                    modifier = Modifier.padding(horizontal = Tokens.spaceMd),
                    horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
                ) {
                    Button(
                        onClick = { attempt++ },
                        modifier = Modifier.weight(1f).heightIn(min = SpinSizes.TAP_TARGET.dp),
                        shape = Tokens.radiusMd,
                        colors = ButtonDefaults.buttonColors(containerColor = spin.primaryFill, contentColor = spin.onFill),
                    ) { Text("Try again", fontWeight = FontWeight.Bold) }
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f).heightIn(min = SpinSizes.TAP_TARGET.dp),
                        shape = Tokens.radiusMd,
                        border = BorderStroke(1.dp, spin.border),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = spin.text),
                    ) { Text("Close") }
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun SheetButton(text: String, filled: Boolean, onClick: () -> Unit) {
    Box(modifier = Modifier.padding(horizontal = Tokens.spaceMd)) {
        Button(
            onClick = onClick,
            modifier = Modifier.fillMaxWidth().heightIn(min = SpinSizes.TAP_TARGET.dp),
            shape = Tokens.radiusMd,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (filled) spin.primaryFill else spin.surface,
                contentColor = spin.onFill,
            ),
        ) { Text(text, fontWeight = FontWeight.Bold) }
    }
}
