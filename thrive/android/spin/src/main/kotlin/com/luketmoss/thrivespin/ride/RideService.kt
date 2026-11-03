package com.luketmoss.thrivespin.ride

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import com.luketmoss.thrivespin.MainActivity
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.DeviceStore
import com.luketmoss.thrivespin.core.ride.RestoreData
import com.luketmoss.thrivespin.core.ride.RideEngine
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RideState
import com.luketmoss.thrivespin.core.ride.RideText
import com.luketmoss.thrivespin.data.SpinStore

/**
 * The ride's foreground service (#768), type `connectedDevice`: it holds the engine, its own Bluetooth
 * connections, the recording and a partial wake lock for as long as a ride is getting ready, running or
 * paused, so the ride goes on with the screen off. It is not sticky: a killed ride is recovered when the
 * app next opens, never restarted behind the rider's back.
 */
@SuppressLint("MissingPermission")
class RideService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var engine: RideEngine? = null
    private var connections: RideConnections? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var finishedAtMs = -1L
    private var lastText: String? = null
    private var lastPaused: Boolean? = null
    private var lastReady: Boolean? = null

    private val tick = object : Runnable {
        override fun run() {
            val current = engine ?: return
            current.tick()
            val state = current.state.value
            if (state.phase == RidePhase.Finished) {
                if (finishedAtMs < 0) finishedAtMs = System.currentTimeMillis()
                // The flat road goes out first, then the connections close: once it is answered or 3 s have passed.
                if (current.trainerSettled || System.currentTimeMillis() - finishedAtMs >= RELEASE_WAIT_MS) {
                    shutDown()
                    return
                }
            } else {
                refreshNotification(state)
            }
            main.postDelayed(this, TICK_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_TOGGLE) {
            val current = engine
            if (current != null) {
                val phase = current.state.value.phase
                if (phase == RidePhase.Running) current.pause() else if (phase == RidePhase.Paused) current.resume()
            }
            return START_NOT_STICKY
        }
        val old = engine
        if (old != null) {
            // A ride that has just ended is still letting the trainer go: a new one does not wait for it.
            if (old.state.value.phase != RidePhase.Finished) return START_NOT_STICKY
            release()
        }

        createChannel()
        val launch = RideRuntime.take()
        // startForegroundService promises a notification within seconds, so it goes up even when there is nothing to run.
        try {
            startForeground(
                NOTIFICATION_ID,
                build(launch?.session?.name ?: getString(R.string.app_name), "Connecting to the trainer…", null),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } catch (e: SecurityException) {
            // Nearby devices was revoked between the tap and here: there is no ride to run.
            RideRuntime.detach()
            stopSelf()
            return START_NOT_STICKY
        } catch (e: IllegalStateException) {
            RideRuntime.detach()
            stopSelf()
            return START_NOT_STICKY
        }
        if (launch == null) {
            RideRuntime.detach()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        wakeLock = getSystemService(PowerManager::class.java)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "thrivespin:ride")
            ?.also { it.acquire(WAKE_LOCK_MS) }

        val store = RideRuntime.store(this)
        val devices = DeviceStore(SpinStore(this)).state
        val link = RideConnections(this, devices)
        val restore = launch.restore
        val created = if (restore != null) {
            RideEngine(
                session = restore.meta.session,
                clock = AndroidRideClock,
                sink = store.reopen(restore.meta.rideId),
                port = link,
                devices = { devices },
                handler = RideRuntime.handler(this),
                restore = RestoreData.from(restore, startedAtMs = restore.samples.first().epochMs),
            )
        } else {
            RideEngine(
                session = launch.session,
                clock = AndroidRideClock,
                sink = store.recorder(launch.session.rideId),
                port = link,
                devices = { devices },
                handler = RideRuntime.handler(this),
            )
        }
        engine = created
        connections = link
        link.attach(created)
        RideRuntime.attach(created)
        link.start()
        refreshNotification(created.state.value)
        main.postDelayed(tick, TICK_MS)
        return START_NOT_STICKY
    }

    /** Closes every connection and lets go of the engine and the wake lock. */
    private fun release() {
        main.removeCallbacks(tick)
        connections?.stop()
        connections = null
        engine = null
        finishedAtMs = -1L
        lastText = null
        lastPaused = null
        lastReady = null
        releaseWakeLock()
        RideRuntime.detach()
    }

    private fun shutDown() {
        release()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        release()
        super.onDestroy()
    }

    private fun releaseWakeLock() {
        val lock = wakeLock ?: return
        wakeLock = null
        if (lock.isHeld) lock.release()
    }

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "Ride in progress", NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    /** Updated once a second, and only when its text or its action changed. */
    private fun refreshNotification(state: RideState) {
        val text = RideText.notification(state)
        val ready = state.phase == RidePhase.GettingReady
        val paused = state.phase == RidePhase.Paused
        if (text == lastText && paused == lastPaused && ready == lastReady) return
        lastText = text
        lastPaused = paused
        lastReady = ready
        val action = when {
            ready -> null
            paused -> "Resume"
            else -> "Pause"
        }
        try {
            getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, build(state.name, text, action))
        } catch (e: SecurityException) {
            // Notifications are only a convenience: the ride goes on without one.
        }
    }

    private fun build(title: String, text: String, actionLabel: String?): Notification {
        val open = PendingIntent.getActivity(
            this,
            1,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_trainer)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
        if (actionLabel != null) {
            val toggle = PendingIntent.getService(
                this,
                2,
                Intent(this, RideService::class.java).setAction(ACTION_TOGGLE),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val icon = Icon.createWithResource(this, R.drawable.ic_play)
            builder.addAction(Notification.Action.Builder(icon, actionLabel, toggle).build())
        }
        return builder.build()
    }

    companion object {
        const val ACTION_TOGGLE = "com.luketmoss.thrivespin.ride.TOGGLE"
        private const val CHANNEL_ID = "ride"
        private const val NOTIFICATION_ID = 768
        private const val TICK_MS = 250L
        private const val RELEASE_WAIT_MS = 3_000L

        /** 12 h of ride time plus the 60 minute pause limit, as a backstop. */
        private const val WAKE_LOCK_MS = 13L * 60 * 60 * 1000
    }
}
