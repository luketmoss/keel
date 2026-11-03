package com.luketmoss.thrivespin.ride

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
import com.luketmoss.thrivespin.ble.BleEnvironment
import com.luketmoss.thrivespin.core.DeviceKind
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.Ftms
import com.luketmoss.thrivespin.core.GattQueue
import com.luketmoss.thrivespin.core.HeartRate
import com.luketmoss.thrivespin.core.SavedDevice
import com.luketmoss.thrivespin.core.ble.FtmsControl
import com.luketmoss.thrivespin.core.ble.TargetSupport
import com.luketmoss.thrivespin.core.ble.ValueRange
import com.luketmoss.thrivespin.core.ride.RideEngine
import com.luketmoss.thrivespin.core.ride.TrainerPort
import com.luketmoss.thrivespin.core.ride.TrainerSetup
import java.util.UUID

/**
 * The ride's own Bluetooth connections (#768), separate from Devices' (#766 connects only while Devices
 * is on screen, and Devices is not reachable during a ride). It looks for the saved trainer and the saved
 * monitors by address, connects each, subscribes, and feeds what arrives to the engine; it is also the
 * engine's [TrainerPort]. With the fallback toggle off only the picked monitor is looked for; with it on,
 * every saved monitor is, and all stay connected so a fallback is instant. Everything runs on the main
 * thread: GATT callbacks hop to it first, and each connection has one [GattQueue].
 */
@SuppressLint("MissingPermission")
@Suppress("DEPRECATION")
class RideConnections(context: Context, private val devices: DeviceState) : TrainerPort {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val links = LinkedHashMap<String, Link>()
    private var engine: RideEngine? = null
    private var started = false
    private var receiverRegistered = false
    private var scanCallback: ScanCallback? = null
    private var scanning: Set<String> = emptySet()

    private val wanted: List<SavedDevice> = listOfNotNull(devices.trainer) +
        devices.monitors.filter { devices.fallback || it.address == devices.picked }

    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            recheck()
        }
    }

    private val refreshScanRunnable = Runnable { refreshScan() }

    fun attach(target: RideEngine) {
        engine = target
    }

    fun start() {
        started = true
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
    }

    /** Lets go of every device: the ride is over. */
    fun stop() {
        started = false
        main.removeCallbacksAndMessages(null)
        if (receiverRegistered) {
            try {
                appContext.unregisterReceiver(bluetoothReceiver)
            } catch (e: IllegalArgumentException) {
                // Already gone.
            }
            receiverRegistered = false
        }
        closeAll()
    }

    /** Re-reads the permission and the adapter, after a Bluetooth change. */
    private fun recheck() {
        if (!started) return
        val permitted = BleEnvironment.permitted(appContext)
        val on = BleEnvironment.bluetoothOn(appContext)
        engine?.onBluetooth(on, permitted)
        if (!permitted || !on) {
            closeAll()
            return
        }
        syncLinks()
    }

    private fun syncLinks() {
        wanted.forEach { saved ->
            val address = saved.address.uppercase()
            if (address !in links) links[address] = Link(saved)
        }
        scheduleScanRefresh()
    }

    private fun closeAll() {
        main.removeCallbacks(refreshScanRunnable)
        stopScan()
        val all = links.values.toList()
        links.clear()
        all.forEach { it.close() }
    }

    // ---- The engine writes to the trainer ----

    override fun write(bytes: ByteArray) {
        val link = links.values.firstOrNull { it.saved.kind == DeviceKind.Trainer && it.connected } ?: return
        val gatt = link.gatt ?: return
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
    }

    // ---- Scanning for the saved devices that are not connected ----

    private fun scheduleScanRefresh() {
        main.removeCallbacks(refreshScanRunnable)
        main.postDelayed(refreshScanRunnable, SCAN_DEBOUNCE_MS)
    }

    private fun refreshScan() {
        if (!started) return
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

    private inner class Link(val saved: SavedDevice) {
        var gatt: BluetoothGatt? = null
        var connected = false
        var retryPending = false
        val queue = GattQueue()
        private var closed = false

        private var support: TargetSupport? = null
        private var powerRange: ValueRange? = null
        private var resistanceRange: ValueRange? = null

        fun connect(device: BluetoothDevice) {
            gatt = device.connectGatt(appContext, false, callback, BluetoothDevice.TRANSPORT_LE)
        }

        /** The ride is done with it. */
        fun close() {
            closed = true
            queue.clear()
            val wasConnected = connected
            connected = false
            val g = gatt
            gatt = null
            try {
                g?.disconnect()
                g?.close()
            } catch (e: SecurityException) {
                // Permission revoked: the connection dies with the process anyway.
            }
            if (wasConnected && saved.kind == DeviceKind.Trainer) engine?.onTrainerDisconnected()
        }

        fun dropped() {
            if (closed) return
            val wasTrainer = saved.kind == DeviceKind.Trainer
            val wasConnected = connected
            val g = gatt
            gatt = null
            queue.clear()
            connected = false
            try {
                g?.close()
            } catch (e: SecurityException) {
                // Nothing to close.
            }
            if (wasTrainer && wasConnected) engine?.onTrainerDisconnected()
            // Wait a moment before looking again so a device that refuses us does not spin the scan.
            retryPending = true
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

        private fun read(g: BluetoothGatt, characteristic: String): Boolean {
            val c = g.getService(UUID.fromString(Ftms.FTMS_SERVICE))?.getCharacteristic(UUID.fromString(characteristic))
                ?: return false
            return g.readCharacteristic(c)
        }

        private fun setUp(g: BluetoothGatt) {
            when (saved.kind) {
                DeviceKind.Trainer -> {
                    // Subscriptions first, then what the trainer can do, then the engine takes over.
                    queue.add { enable(g, Ftms.FTMS_SERVICE, Ftms.INDOOR_BIKE_DATA, indicate = false) }
                    queue.add { enable(g, Ftms.FTMS_SERVICE, Ftms.MACHINE_STATUS, indicate = false) }
                    queue.add { enable(g, Ftms.FTMS_SERVICE, Ftms.CONTROL_POINT, indicate = true) }
                    queue.add { read(g, Ftms.FEATURE) }
                    queue.add { read(g, FtmsControl.POWER_RANGE) }
                    queue.add { read(g, FtmsControl.RESISTANCE_RANGE) }
                    queue.add {
                        main.post {
                            if (!closed && gatt === g) {
                                connected = true
                                engine?.onTrainerConnected(TrainerSetup(support, powerRange, resistanceRange))
                            }
                        }
                        false
                    }
                }
                DeviceKind.HeartRate -> {
                    queue.add { enable(g, HeartRate.HEART_RATE_SERVICE, HeartRate.MEASUREMENT, indicate = false) }
                    queue.add {
                        main.post { if (!closed && gatt === g) connected = true }
                        false
                    }
                }
            }
        }

        private fun onValue(uuid: UUID, value: ByteArray) {
            when (uuid.toString()) {
                Ftms.FEATURE -> support = FtmsControl.parseTargetSupport(value)
                FtmsControl.POWER_RANGE -> powerRange = FtmsControl.parsePowerRange(value)
                FtmsControl.RESISTANCE_RANGE -> resistanceRange = FtmsControl.parseResistanceRange(value)
                Ftms.INDOOR_BIKE_DATA -> Ftms.parseIndoorBikeData(value)?.let { engine?.onBikeData(it) }
                Ftms.MACHINE_STATUS -> engine?.onMachineStatus(value)
                Ftms.CONTROL_POINT -> engine?.onControlResponse(value)
                HeartRate.MEASUREMENT ->
                    HeartRate.parse(value, SystemClock.elapsedRealtime())?.let { engine?.onHeartRate(saved.address, it) }
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
                finishRead(g, characteristic.uuid, value, status)
            }

            override fun onCharacteristicRead(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray,
                status: Int,
            ) {
                finishRead(g, characteristic.uuid, value, status)
            }

            private fun finishRead(g: BluetoothGatt, uuid: UUID, value: ByteArray, status: Int) {
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
