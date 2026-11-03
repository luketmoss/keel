package com.luketmoss.thrivespin.ride

import android.content.Context
import android.os.SystemClock
import com.luketmoss.thrivespin.core.ride.RideClock
import com.luketmoss.thrivespin.core.ride.RideEngine
import com.luketmoss.thrivespin.core.ride.RideFinishedHandler
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RideSession
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object AndroidRideClock : RideClock {
    override fun monotonicMs(): Long = SystemClock.elapsedRealtime()

    override fun wallMs(): Long = System.currentTimeMillis()
}

/**
 * What the activity and the ride's service share inside the one process (#768): the running engine, a
 * ride waiting to be started, and the finished rides waiting for the "Ride recorded" screen. The service
 * owns the engine; the screen only reads its state and calls its controls. Everything is on the main thread.
 */
object RideRuntime {
    /** A ride to start: a new [session], or a [restore]d recording that comes back paused. */
    class Launch(val session: RideSession, val restore: RideRecording?)

    private val _engine = MutableStateFlow<RideEngine?>(null)
    val engine: StateFlow<RideEngine?> get() = _engine

    private val _handOffs = MutableStateFlow<List<String>>(emptyList())

    /** Finished rides not yet handed off, oldest first. The head is the one on screen. */
    val handOffs: StateFlow<List<String>> get() = _handOffs

    private var launch: Launch? = null
    private var launching = false

    /** Recovery has run in this process: it runs once, when the app first opens. */
    var recovered = false

    fun store(context: Context): FileRideStore = FileRideStore(File(context.applicationContext.filesDir, "rides"))

    /** A ride is starting, getting ready, running or paused. */
    fun active(): Boolean {
        if (launching) return true
        val phase = _engine.value?.state?.value?.phase ?: return false
        return phase != RidePhase.Finished
    }

    fun queue(next: Launch) {
        launch = next
        launching = true
    }

    fun take(): Launch? = launch.also { launch = null }

    fun attach(engine: RideEngine) {
        _engine.value = engine
        launching = false
    }

    fun detach() {
        _engine.value = null
        launching = false
    }

    private val storageFullAt = HashMap<String, Int>()

    /** The second a ride was ended at for want of space, so the "Ride recorded" screen can say so. */
    fun storageFullAt(rideId: String): Int? = storageFullAt[rideId]

    /** The handler #769 replaces: a finished ride goes to the "Ride recorded" screen. */
    val handler: RideFinishedHandler = object : RideFinishedHandler {
        override fun onFinished(rideId: String) {
            val running = _engine.value
            if (running != null && running.endedForSpace) storageFullAt[rideId] = running.elapsedS
            enqueue(rideId)
        }
    }

    fun enqueue(rideId: String) {
        if (rideId !in _handOffs.value) _handOffs.value = _handOffs.value + rideId
    }

    fun handedOff(rideId: String) {
        _handOffs.value = _handOffs.value - rideId
    }
}
