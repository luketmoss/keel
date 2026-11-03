package com.luketmoss.thrivespin.ftp

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.luketmoss.thrivespin.core.upload.UploadRun

/**
 * Sends the confirmed FTP records (#770). It is thin: the queue and its rules are `core/ftp/FtpUploader`.
 * WorkManager's retry with backoff is how a record waits for a connection, whether or not the app is open.
 */
class FtpWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = when (FtpRuntime.run(applicationContext)) {
        UploadRun.Done -> Result.success()
        UploadRun.Retry -> Result.retry()
    }
}
