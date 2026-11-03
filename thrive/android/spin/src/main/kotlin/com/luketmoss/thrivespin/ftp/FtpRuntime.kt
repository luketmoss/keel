package com.luketmoss.thrivespin.ftp

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.luketmoss.thrivespin.core.ftp.FtpQueue
import com.luketmoss.thrivespin.core.ftp.FtpStore
import com.luketmoss.thrivespin.core.ftp.FtpUploader
import com.luketmoss.thrivespin.core.library.LibraryModel
import com.luketmoss.thrivespin.core.upload.UploadRun
import com.luketmoss.thrivespin.data.OkHttpTransport
import com.luketmoss.thrivespin.data.OkHttpUploadTransport
import com.luketmoss.thrivespin.data.SpinStore
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The library's one model for the process (#770). The activity and the FTP worker share it, so a confirmed FTP
 * that reaches Thrive from the worker is in the cache the screens read, not only on disk.
 */
object LibraryRuntime {
    @Volatile
    private var instance: LibraryModel? = null

    fun model(context: Context): LibraryModel {
        instance?.let { return it }
        return synchronized(this) {
            instance ?: run {
                val store = SpinStore(context)
                LibraryModel(
                    persistence = store.libraryCache,
                    transport = OkHttpTransport,
                    config = { store.savedUrl() to store.savedKey() },
                )
            }.also { instance = it }
        }
    }
}

/**
 * What the activity and [FtpWorker] share (#770): the one [FtpQueue] of the process, and the one lock that lets
 * a single run of the queue go at a time, whoever started it. It is [com.luketmoss.thrivespin.upload.UploadRuntime]'s
 * twin for the FTP write.
 */
object FtpRuntime {
    private const val WORK_NAME = "spin-ftp"

    @Volatile
    private var instance: FtpQueue? = null

    private val runLock = Mutex()

    /** A run started from the app is not tied to the screen that asked for it. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun queue(context: Context): FtpQueue {
        instance?.let { return it }
        return synchronized(this) {
            instance ?: FtpQueue(FtpStore(File(context.applicationContext.filesDir, "ftp")), { System.currentTimeMillis() })
                .also { instance = it }
        }
    }

    /** One pass over the queue, alone: a second caller waits for the first. */
    suspend fun run(context: Context): UploadRun {
        val app = context.applicationContext
        val store = SpinStore(app)
        val uploader = FtpUploader(
            queue = queue(app),
            transport = OkHttpUploadTransport,
            config = { store.savedUrl() to store.savedKey() },
            now = { System.currentTimeMillis() },
            onSent = { row -> LibraryRuntime.model(app).setCurrentFtp(row) },
        )
        return runLock.withLock { uploader.runOnce() }
    }

    /** Sends now, in the app, and hands the same job to WorkManager for when there is no connection or the app is closed. */
    fun kick(context: Context) {
        val app = context.applicationContext
        enqueue(app)
        scope.launch { run(app) }
    }

    /**
     * Unique work named `spin-ftp`, appended and not replaced, on a connected network with exponential backoff
     * from 30 s. Nudged on confirm, on app open when anything is queued, after Settings is saved and by "Send now"
     * and "Try again".
     */
    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<FtpWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
}
