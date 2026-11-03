package com.luketmoss.thrivespin.upload

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.luketmoss.thrivespin.core.upload.UploadRun

/**
 * Sends the queued rides (#769). It is thin: the queue and its rules are `core/upload/RideUploader`.
 * WorkManager's retry with backoff is how a ride waits for a connection, whether or not the app is open.
 */
class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = when (UploadRuntime.run(applicationContext)) {
        UploadRun.Done -> Result.success()
        UploadRun.Retry -> Result.retry()
    }
}
