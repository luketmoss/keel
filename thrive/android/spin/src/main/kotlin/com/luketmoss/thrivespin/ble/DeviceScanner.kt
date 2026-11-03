package com.luketmoss.thrivespin.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import com.luketmoss.thrivespin.core.Ftms
import com.luketmoss.thrivespin.core.HeartRate
import com.luketmoss.thrivespin.core.ScanHit
import java.util.UUID

/**
 * The add-a-device scan, filtered on the FTMS (0x1826) and Heart Rate (0x180D)
 * services. The caller owns the 30 s: it starts, waits and stops. Results arrive
 * on the main thread. The permission is checked by the screen before it is offered.
 */
@SuppressLint("MissingPermission")
class DeviceScanner(context: Context) {
    private val appContext = context.applicationContext
    private var callback: ScanCallback? = null

    /** Returns false when the adapter has no scanner (Bluetooth off). */
    fun start(onHit: (ScanHit) -> Unit): Boolean {
        stop()
        val scanner = appContext.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
            ?: return false
        val filters = listOf(Ftms.FTMS_SERVICE, HeartRate.HEART_RATE_SERVICE).map {
            ScanFilter.Builder().setServiceUuid(ParcelUuid(UUID.fromString(it))).build()
        }
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        val next = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val uuids = result.scanRecord?.serviceUuids.orEmpty().map { it.uuid }
                onHit(
                    ScanHit(
                        address = result.device.address,
                        name = result.scanRecord?.deviceName ?: result.device.name,
                        advertisesFtms = uuids.contains(UUID.fromString(Ftms.FTMS_SERVICE)),
                        advertisesHeartRate = uuids.contains(UUID.fromString(HeartRate.HEART_RATE_SERVICE)),
                    ),
                )
            }
        }
        return try {
            scanner.startScan(filters, settings, next)
            callback = next
            true
        } catch (e: SecurityException) {
            false
        } catch (e: IllegalStateException) {
            false
        }
    }

    fun stop() {
        val running = callback ?: return
        callback = null
        try {
            appContext.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(running)
        } catch (e: SecurityException) {
            // The permission went away mid-scan: there is nothing left to stop.
        } catch (e: IllegalStateException) {
            // Bluetooth turned off: the scan ended with it.
        }
    }
}
