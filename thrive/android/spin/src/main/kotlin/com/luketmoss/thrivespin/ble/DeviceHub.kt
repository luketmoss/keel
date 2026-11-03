package com.luketmoss.thrivespin.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.luketmoss.thrivespin.core.DeviceKind
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.Ftms
import com.luketmoss.thrivespin.core.FtmsFeatures
import com.luketmoss.thrivespin.core.GattQueue
import com.luketmoss.thrivespin.core.HeartRate
import com.luketmoss.thrivespin.core.HeartRateReading
import com.luketmoss.thrivespin.core.SavedDevice
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** What the Devices screen needs to know about one saved device. Times are [SystemClock.elapsedRealtime]. */
data class DeviceLive(
    /** Connected and subscribed. */
    val connected: Boolean,
    /** When it was last lost, or first looked for. */
    val lookingSinceMs: Long,
    /** A heart rate monitor's latest reading. */
    val reading: HeartRateReading? = null,
)

data class HubState(
    val permitted: Boolean = false,
    val bluetoothOn: Boolean = false,
    val live: Map<String, DeviceLive> = emptyMap(),
) {
    /** Connections can run: permission granted and Bluetooth on. */
    val ready: Boolean get() = permitted && bluetoothOn
}

/** What the trainer sends back while a procedure runs; set by the spin-down sheet and cleared when it closes. */
interface TrainerListener {
    fun onControlResponse(bytes: ByteArray)
    fun onStatus(bytes: ByteArray)
    fun onSpeed(kmh: Double?)
    fun onDisconnect()
}

/**
 * Looks for every saved device and keeps a connection to each, only while Devices is on screen
 * and the app is in the foreground: [setAttached] and [setForeground] say when. No system pairing
 * and no foreground service (the ride's is #768). Everything runs on the main thread: GATT
 * callbacks hop to it first, and each connection has one [GattQueue].
 *
 * The permission is checked before anything is started, so the calls below are safe.
 */
@SuppressLint("MissingPermission")
@Suppress("DEPRECATION")
class DeviceHub(
    context: Context,
    private val onFeatures: (address: String, features: FtmsFeatures) -> Unit,
) {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val links = LinkedHashMap<String, Link>()
    private var devices: List<SavedDevice> = emptyList()
    private var attached = false
    private var foreground = false
    private var receiverRegistered = false
    private var scanCallback: ScanCallback? = null
    private var scanning: Set<String> = emptySet()

    private val _state = MutableStateFlow(HubState())
    val state: StateFlow<HubState> = _state

    var trainerListener: TrainerListener? = null

    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            recheck()
        }
    }

    private val refreshScanRunnable = Runnable { refreshScan() }

    fun setAttached(value: Boolean) {
        attached = value
        update()
    }

    fun setForeground(value: Boolean) {
        foreground = value
        update()
    }

    fun setDevices(state: DeviceState) {
        devices = listOfNotNull(state.trainer) + state.monitors
        if (running()) syncLinks()
    }

    /** Re-reads the permission and the adapter, after a prompt or a Bluetooth change. */
    fun recheck() {
        val ready = BleEnvironment.permitted(appContext) && BleEnvironment.bluetoothOn(appContext)
        if (!ready) closeAll()
        publish()
        if (running()) syncLinks()
    }

    /** Writes to the trainer's Control Point; false when there is no connected trainer to write to. */
    fun writeControl(bytes: ByteArray): Boolean {
        val link = links.values.firstOrNull { it.saved.kind == DeviceKind.Trainer && it.connected } ?: return false
        val gatt = link.gatt ?: return false
        link.queue.add {
            val characteristic = gatt.getService(UUID.fromString(Ftms.FTMS_SERVICE))
                ?.getCharacteristic(UUID.fromString(Ftms.CONTROL_POINT))
            if (characteristic == null) {
                false
            } else {
                characteristic.value = bytes
                characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                gatt.writeCharacteristic(characteristic)
            }
        }
        return true
    }

    private fun running() = attached && foreground

    private fun update() {
        if (running()) {
            if (!receiverRegistered) {
                ContextCompat.registerReceiver(
                    appContext,
                    bluetoothReceiver,
                    IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
                    ContextCompat.RECEIVER_NOT_EXPORTED,
                )
                receiverRegistered = true
            }
            recheck()
        } else {
            if (receiverRegistered) {
                appContext.unregisterReceiver(bluetoothReceiver)
                receiverRegistered = false
            }
            closeAll()
            publish()
        }
    }

    private fun ready() = BleEnvironment.permitted(appContext) && BleEnvironment.bluetoothOn(appContext)

    private fun syncLinks() {
        if (!ready()) return
        val wanted = devices.map { it.address.uppercase() to it }
        val wantedAddresses = wanted.map { it.first }.toSet()
        links.keys.toList().filter { it !in wantedAddresses }.forEach { address ->
            links.remove(address)?.close()
        }
        val now = SystemClock.elapsedRealtime()
        wanted.forEach { (address, saved) ->
            if (address !in links) links[address] = Link(saved, now)
        }
        publish()
        scheduleScanRefresh()
    }

    private fun closeAll() {
        main.removeCallbacks(refreshScanRunnable)
        stopScan()
        links.values.forEach { it.close() }
        links.clear()
    }

    private fun publish() {
        _state.value = HubState(
            permitted = BleEnvironment.permitted(appContext),
            bluetoothOn = BleEnvironment.bluetoothOn(appContext),
            live = links.values.associate { link ->
                link.saved.address to DeviceLive(link.connected, link.lookingSince, link.reading)
            },
        )
    }

    // ---- Scanning for the saved devices that are not connected ----

    private fun scheduleScanRefresh() {
        main.removeCallbacks(refreshScanRunnable)
        main.postDelayed(refreshScanRunnable, SCAN_DEBOUNCE_MS)
    }

    private fun refreshScan() {
        if (!running() || !ready()) return
        val missing = links.filter { it.value.gatt == null && !it.value.retryPending }.keys
        if (missing == scanning && (missing.isEmpty() || scanCallback != null)) return
        stopScan()
        if (missing.isEmpty()) return
        val scanner = appContext.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner ?: return
        val filters = missing.map { ScanFilter.Builder().setDeviceAddress(it).build() }
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val link = links[result.device.address.uppercase()] ?: return
                if (link.gatt == null) {
                    link.connect(result.device)
                    scheduleScanRefresh()
                }
            }
        }
        try {
            scanner.startScan(filters, settings, callback)
            scanCallback = callback
            scanning = missing.toSet()
        } catch (e: SecurityException) {
            // The permission went away between the check and the call: the next recheck sorts it out.
        } catch (e: IllegalStateException) {
            // Bluetooth turned off between the check and the call.
        }
    }

    private fun stopScan() {
        val callback = scanCallback
        scanCallback = null
        scanning = emptySet()
        if (callback == null) return
        try {
            appContext.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(callback)
        } catch (e: SecurityException) {
            // Nothing left to stop.
        } catch (e: IllegalStateException) {
            // Bluetooth turned off: the scan ended with it.
        }
    }

    // ---- One saved device ----

    private inner class Link(val saved: SavedDevice, since: Long) {
        var gatt: BluetoothGatt? = null
        var connected = false
        var lookingSince = since
        var reading: HeartRateReading? = null
        var retryPending = false
        val queue = GattQueue()
        private var closed = false

        fun connect(device: BluetoothDevice) {
            gatt = device.connectGatt(appContext, false, callback, BluetoothDevice.TRANSPORT_LE)
            publish()
        }

        /** The device stopped answering, or the screen is done with it. */
        fun close() {
            closed = true
            queue.clear()
            connected = false
            val g = gatt
            gatt = null
            try {
                g?.disconnect()
                g?.close()
            } catch (e: SecurityException) {
                // Permission revoked: the connection dies with the process anyway.
            }
        }

        fun dropped() {
            if (closed) return
            val wasTrainer = saved.kind == DeviceKind.Trainer
            val g = gatt
            gatt = null
            queue.clear()
            connected = false
            reading = null
            lookingSince = SystemClock.elapsedRealtime()
            try {
                g?.close()
            } catch (e: SecurityException) {
                // Nothing to close.
            }
            if (wasTrainer) trainerListener?.onDisconnect()
            // Wait a moment before looking again so a device that refuses us does not spin the scan.
            retryPending = true
            publish()
            main.postDelayed(
                {
                    retryPending = false
                    if (!closed) scheduleScanRefresh()
                },
                RETRY_MS,
            )
        }

        private fun enable(g: BluetoothGatt, service: String, characteristic: String, indicate: Boolean): Boolean {
            val c = g.getService(UUID.fromString(service))?.getCharacteristic(UUID.fromString(characteristic))
                ?: return false
            g.setCharacteristicNotification(c, true)
            val descriptor = c.getDescriptor(CCCD) ?: return false
            descriptor.value = if (indicate) {
                BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
            } else {
                BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            }
            return g.writeDescriptor(descriptor)
        }

        private fun setUp(g: BluetoothGatt) {
            when (saved.kind) {
                DeviceKind.Trainer -> {
                    queue.add {
                        val feature = g.getService(UUID.fromString(Ftms.FTMS_SERVICE))
                            ?.getCharacteristic(UUID.fromString(Ftms.FEATURE))
                        feature != null && g.readCharacteristic(feature)
                    }
                    queue.add { enable(g, Ftms.FTMS_SERVICE, Ftms.INDOOR_BIKE_DATA, indicate = false) }
                    queue.add { enable(g, Ftms.FTMS_SERVICE, Ftms.MACHINE_STATUS, indicate = false) }
                    queue.add { enable(g, Ftms.FTMS_SERVICE, Ftms.CONTROL_POINT, indicate = true) }
                }
                DeviceKind.HeartRate ->
                    queue.add { enable(g, HeartRate.HEART_RATE_SERVICE, HeartRate.MEASUREMENT, indicate = false) }
            }
            // Runs when everything before it has been answered: now the device counts as connected.
            queue.add {
                main.post {
                    if (!closed && gatt === g) {
                        connected = true
                        publish()
                    }
                }
                false
            }
        }

        private fun onValue(uuid: UUID, value: ByteArray) {
            when (uuid.toString()) {
                Ftms.FEATURE -> Ftms.parseFeature(value)?.let { onFeatures(saved.address, it) }
                Ftms.INDOOR_BIKE_DATA -> trainerListener?.onSpeed(Ftms.parseIndoorBikeData(value)?.speedKmh)
                Ftms.MACHINE_STATUS -> trainerListener?.onStatus(value)
                Ftms.CONTROL_POINT -> trainerListener?.onControlResponse(value)
                HeartRate.MEASUREMENT -> {
                    reading = HeartRate.parse(value, SystemClock.elapsedRealtime())
                    publish()
                }
            }
        }

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                main.post {
                    if (closed || gatt !== g) {
                        if (newState == BluetoothProfile.STATE_DISCONNECTED) g.close()
                        return@post
                    }
                    when {
                        newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS ->
                            g.discoverServices()
                        else -> dropped()
                    }
                }
            }

            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                main.post {
                    if (closed || gatt !== g) return@post
                    if (status != BluetoothGatt.GATT_SUCCESS) dropped() else setUp(g)
                }
            }

            override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
                main.post { if (!closed && gatt === g) queue.complete() }
            }

            @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
            override fun onCharacteristicRead(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                val value = characteristic.value ?: ByteArray(0)
                read(g, characteristic.uuid, value, status)
            }

            override fun onCharacteristicRead(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray,
                status: Int,
            ) {
                read(g, characteristic.uuid, value, status)
            }

            private fun read(g: BluetoothGatt, uuid: UUID, value: ByteArray, status: Int) {
                main.post {
                    if (closed || gatt !== g) return@post
                    if (status == BluetoothGatt.GATT_SUCCESS) onValue(uuid, value)
                    queue.complete()
                }
            }

            override fun onCharacteristicWrite(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                main.post { if (!closed && gatt === g) queue.complete() }
            }

            @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
            override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                val value = characteristic.value ?: return
                changed(g, characteristic.uuid, value.copyOf())
            }

            override fun onCharacteristicChanged(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray,
            ) {
                changed(g, characteristic.uuid, value)
            }

            private fun changed(g: BluetoothGatt, uuid: UUID, value: ByteArray) {
                main.post { if (!closed && gatt === g) onValue(uuid, value) }
            }
        }
    }

    private companion object {
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        const val SCAN_DEBOUNCE_MS = 300L
        const val RETRY_MS = 2_000L
    }
}
