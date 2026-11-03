package com.luketmoss.thrivespin.upload

import android.content.Context
import android.content.pm.PackageManager
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.luketmoss.thrivespin.core.upload.FileRideUploads
import com.luketmoss.thrivespin.core.upload.RideUploader
import com.luketmoss.thrivespin.core.upload.UploadRun
import com.luketmoss.thrivespin.data.OkHttpUploadTransport
import com.luketmoss.thrivespin.data.SpinStore
import com.luketmoss.thrivespin.ride.RideRuntime
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * What the activity and [UploadWorker] share (#769): the one [FileRideUploads] of the process, and the one
 * lock that lets a single run of the queue go at a time, whoever started it.
 */
object UploadRuntime {
    private const val WORK_NAME = "spin-upload"

    @Volatile
    private var instance: FileRideUploads? = null

    private val runLock = Mutex()

    /** A run started from the app is not tied to the screen that asked for it. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun uploads(context: Context): FileRideUploads {
        instance?.let { return it }
        return synchronized(this) {
            instance ?: FileRideUploads(
                store = RideRuntime.store(context),
                now = { System.currentTimeMillis() },
                appVersion = versionName(context),
                zoneOffsetS = { unix -> ZoneId.systemDefault().rules.getOffset(Instant.ofEpochSecond(unix)).totalSeconds },
            ).also { instance = it }
        }
    }

    private fun versionName(context: Context): String = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0.0"
    } catch (e: PackageManager.NameNotFoundException) {
        "0.0"
    }

    /** One pass over the queue, alone: a second caller waits for the first. */
    suspend fun run(context: Context): UploadRun {
        val store = SpinStore(context)
        val uploader = RideUploader(
            uploads = uploads(context),
            transport = OkHttpUploadTransport,
            config = { store.savedUrl() to store.savedKey() },
            now = { System.currentTimeMillis() },
        )
        return runLock.withLock { uploader.runOnce() }
    }

    /**
     * Sends now, in the app, and hands the same job to WorkManager for when there is no connection or the app
     * is closed. "Send now" cannot wait out a backoff, so the in-process run does not go through WorkManager.
     */
    fun kick(context: Context) {
        val app = context.applicationContext
        enqueue(app)
        scope.launch { run(app) }
    }

    /**
     * Unique work named `spin-upload`, appended and not replaced, on a connected network with exponential
     * backoff from 30 s. Nudged on Save, on app open when anything is queued, after Settings is saved and by
     * "Send now" and "Try again".
     */
    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
}
