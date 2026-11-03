package com.luketmoss.thrivespin

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.luketmoss.thrivespin.ble.BleEnvironment
import com.luketmoss.thrivespin.ble.DeviceHub
import com.luketmoss.thrivespin.ble.DeviceScanner
import com.luketmoss.thrivespin.core.ConnectionTest
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.DeviceStore
import com.luketmoss.thrivespin.core.SavedDevice
import com.luketmoss.thrivespin.core.TestResult
import com.luketmoss.thrivespin.data.OkHttpTransport
import com.luketmoss.thrivespin.data.SpinStore
import com.luketmoss.thrivespin.ui.DevicesActions
import com.luketmoss.thrivespin.ui.DevicesScreen
import com.luketmoss.thrivespin.ui.ScanSheet
import com.luketmoss.thrivespin.ui.SettingsScreen
import com.luketmoss.thrivespin.ui.SpinDownSheet
import com.luketmoss.thrivespin.ui.SpinTheme
import kotlinx.coroutines.delay

/**
 * The app's one activity: Devices, and Settings behind its gear. It opens on Devices. Connections
 * run only while Devices is on screen and the app is in the foreground; the sheets do not survive
 * the screen going away (a scan or spin-down in progress ends).
 */
@SuppressLint("MissingPermission")
class MainActivity : ComponentActivity() {
    private lateinit var store: SpinStore
    private lateinit var deviceStore: DeviceStore
    private lateinit var hub: DeviceHub
    private lateinit var scanner: DeviceScanner

    private var devices by mutableStateOf(DeviceState())
    private var scanOpen by mutableStateOf(false)
    private var spinDownOpen by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = SpinStore(this)
        deviceStore = DeviceStore(store)
        devices = deviceStore.state
        hub = DeviceHub(this) { address, features ->
            deviceStore.setFeatures(address, features)
            devices = deviceStore.state
        }
        hub.setDevices(devices)
        scanner = DeviceScanner(this)

        setContent {
            SpinTheme {
                SpinApp()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        hub.setForeground(true)
    }

    override fun onStop() {
        super.onStop()
        hub.setForeground(false)
        scanner.stop()
        scanOpen = false
        spinDownOpen = false
    }

    private fun devicesChanged() {
        devices = deviceStore.state
        hub.setDevices(devices)
    }

    @Composable
    private fun SpinApp() {
        var screen by rememberSaveable { mutableStateOf(SCREEN_DEVICES) }
        if (screen == SCREEN_SETTINGS) {
            BackHandler { screen = SCREEN_DEVICES }
            SettingsScreen(
                initialUrl = store.savedUrl(),
                initialKey = store.savedKey(),
                onBack = { screen = SCREEN_DEVICES },
                onTest = { url, key -> ConnectionTest.run(url, key, OkHttpTransport) },
                onSave = { url, key ->
                    if (!ConnectionTest.isValidUrl(url)) {
                        TestResult.BadUrl
                    } else {
                        store.saveConfig(url, key)
                        null
                    }
                },
            )
        } else {
            DevicesHost(onSettings = {
                scanOpen = false
                spinDownOpen = false
                screen = SCREEN_SETTINGS
            })
        }
    }

    @Composable
    private fun DevicesHost(onSettings: () -> Unit) {
        val hubState by hub.state.collectAsState()
        var nowMs by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
        var permissionTick by remember { mutableIntStateOf(0) }

        LaunchedEffect(Unit) {
            while (true) {
                delay(1000)
                nowMs = SystemClock.elapsedRealtime()
            }
        }
        // Devices on screen is what opens connections; leaving it closes them.
        DisposableEffect(Unit) {
            hub.setAttached(true)
            onDispose {
                hub.setAttached(false)
                scanOpen = false
                spinDownOpen = false
            }
        }

        val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            hub.recheck()
            permissionTick++
        }
        val enableBluetooth = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            hub.recheck()
        }

        // The app asks on its own once, the first time Devices opens.
        LaunchedEffect(Unit) {
            if (!BleEnvironment.permitted(this@MainActivity) && !store.autoAsked) {
                store.autoAsked = true
                store.permissionAsked = true
                permissionLauncher.launch(BleEnvironment.PERMISSIONS)
            }
        }

        // The system stops prompting after two denials; its rationale flag going false after we asked is how we tell.
        val canAsk = remember(hubState.permitted, permissionTick) {
            !store.permissionAsked || BleEnvironment.PERMISSIONS.any { shouldShowRequestPermissionRationale(it) }
        }

        DevicesScreen(
            devices = devices,
            hub = hubState,
            nowMs = nowMs,
            permissionCanAsk = canAsk,
            actions = DevicesActions(
                onSettings = onSettings,
                onAddDevice = { scanOpen = true },
                onSpinDown = { spinDownOpen = true },
                onForget = { address ->
                    deviceStore.forget(address)
                    devicesChanged()
                },
                onPick = { address ->
                    deviceStore.pick(address)
                    devicesChanged()
                },
                onMoveUp = { address ->
                    deviceStore.moveUp(address)
                    devicesChanged()
                },
                onMoveDown = { address ->
                    deviceStore.moveDown(address)
                    devicesChanged()
                },
                onFallback = { on ->
                    deviceStore.setFallback(on)
                    devicesChanged()
                },
                onAllow = {
                    store.permissionAsked = true
                    permissionLauncher.launch(BleEnvironment.PERMISSIONS)
                },
                onOpenAppSettings = {
                    startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
                    )
                },
                onTurnOnBluetooth = { enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) },
            ),
        )

        if (scanOpen) {
            ScanSheet(
                devices = devices,
                scanner = scanner,
                canScan = hubState.ready,
                onAdd = { row ->
                    deviceStore.add(SavedDevice(row.address, row.name, row.kind))
                    devicesChanged()
                    scanOpen = false
                },
                onDismiss = { scanOpen = false },
            )
        }
        if (spinDownOpen) {
            SpinDownSheet(hub = hub, onDismiss = { spinDownOpen = false })
        }
    }

    private companion object {
        const val SCREEN_DEVICES = "devices"
        const val SCREEN_SETTINGS = "settings"
    }
}
