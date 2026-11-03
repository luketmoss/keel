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
import com.luketmoss.thrivespin.core.ramp.RampDecider
import com.luketmoss.thrivespin.core.ramp.RampFiles
import com.luketmoss.thrivespin.core.upload.SummaryHandler
import com.luketmoss.thrivespin.core.upload.SummaryQueue
import com.luketmoss.thrivespin.ftp.FtpRuntime
import java.io.IOException
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

    /** The summaries to show (#769), oldest first, one at a time. The head is the one on screen. */
    val summaries = SummaryQueue()

    val handOffs: StateFlow<List<String>> get() = summaries.ids

    /** The ramp tests whose result screen is to be shown (#770), oldest first, one at a time. Later takes the head off; Continue hands the test off. */
    val results = SummaryQueue()

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

    /** The second a ride was ended at for want of space, so its summary can say so. */
    fun storageFullAt(rideId: String): Int? = storageFullAt[rideId]

    /**
     * The hand-off (#769): a finished workout opens its summary and is marked handed off at once; a ramp
     * test (#770) opens its result and stays un-handed-off until Continue. The service and the app's recovery
     * both call it.
     */
    fun handler(context: Context): RideFinishedHandler {
        val rides = store(context)
        val summary = SummaryHandler(
            kindOf = { id -> rides.list().firstOrNull { it.id == id }?.kind },
            markHandedOff = { id ->
                try {
                    rides.markHandedOff(id)
                } catch (e: IOException) {
                    // Not marked: the ride comes back on the next open, which is the safe way round.
                }
            },
            show = { id -> enqueue(id) },
            showResult = { id -> results.add(id) },
            isHandedOff = { id -> rides.list().firstOrNull { it.id == id }?.handedOff == true },
        )
        return object : RideFinishedHandler {
            override fun onFinished(rideId: String) {
                val running = _engine.value
                if (running != null && running.endedForSpace) storageFullAt[rideId] = running.elapsedS
                summary.onFinished(rideId)
            }
        }
    }

    fun enqueue(rideId: String) = summaries.add(rideId)

    /** A banner tap: this ride's summary next. */
    fun show(rideId: String) = summaries.showNow(rideId)

    fun handedOff(rideId: String) = summaries.remove(rideId)

    /** "See your result" on the ramp screen: this test's result opens above it. */
    fun showResult(rideId: String) = results.showNow(rideId)
}

/** The ramp test's files and decisions on this phone (#770). */
object RampRuntime {
    fun files(context: Context): RampFiles = RampFiles(RideRuntime.store(context))

    fun decider(context: Context): RampDecider = RampDecider(
        store = RideRuntime.store(context),
        files = files(context),
        queue = FtpRuntime.queue(context),
    )
}
