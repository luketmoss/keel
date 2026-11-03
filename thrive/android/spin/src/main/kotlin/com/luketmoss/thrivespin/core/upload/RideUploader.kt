package com.luketmoss.thrivespin.core.upload

import com.luketmoss.thrivespin.core.ConnectionTest
import com.luketmoss.thrivespin.core.Transport
import com.luketmoss.thrivespin.core.ride.recording.isoSeconds

/** What one pass over the queue leaves for the worker to do. */
enum class UploadRun {
    /** Nothing waits on a retry. */
    Done,

    /** At least one ride is queued after a network failure or a server error: run again on WorkManager's backoff. */
    Retry,
}

/**
 * The upload queue (#769). It runs the rides whose state is `queued`, oldest `saved_at_utc` first, one at a
 * time, with one rule for every answer:
 *
 * - `success: true` is done, whatever `status` says. The ride is recorded as sent, then deleted.
 * - `bad_request` is final: `rejected`, with the server's text. It is never sent again by itself.
 * - A refused key is `needs_key` and stops the run, spending no attempt.
 * - A network failure (no network, a timeout, a non-2xx, a body that is not the envelope) leaves the ride
 *   queued and never counts toward `stuck`.
 * - Any other `success: false` (`Lock timeout`) counts, and the 10th in a row is `stuck`.
 */
class RideUploader(
    private val uploads: FileRideUploads,
    private val transport: Transport,
    /** The API URL and the Spin key from Settings. */
    private val config: () -> Pair<String, String>,
    private val now: () -> Long,
) {
    suspend fun runOnce(): UploadRun {
        uploads.finishSent()
        val queued = uploads.queued()
        if (queued.isEmpty()) return UploadRun.Done
        val (url, key) = config()
        if (!ConnectionTest.isValidUrl(url) || key.isBlank()) {
            uploads.setStageForQueued(UploadStage.NeedsSetup)
            return UploadRun.Done
        }
        var retry = false
        for ((rideId, state) in queued) {
            val payload = state.payload
            val files = uploads.readFiles(rideId)
            if (payload == null || files == null) {
                uploads.update(rideId) { it.copy(state = UploadStage.Rejected, message = MISSING_FILES) }
                continue
            }
            uploads.sendingNow(rideId, true)
            val outcome = try {
                send(url, key, payload, files.first, files.second)
            } finally {
                uploads.sendingNow(rideId, false)
            }
            when (outcome) {
                is Answer.Success -> uploads.markSent(rideId, AnswerReader.read(outcome.data))
                is Answer.Refused -> uploads.update(rideId) {
                    it.copy(state = UploadStage.Rejected, message = outcome.text, serverErrors = 0, lastFailure = null)
                }
                Answer.KeyRefused -> {
                    uploads.setStageForQueued(UploadStage.NeedsKey)
                    return UploadRun.Done
                }
                Answer.Offline -> {
                    retry = true
                    uploads.update(rideId) {
                        it.copy(attempts = it.attempts + 1, lastTryUtc = isoSeconds(now()), lastFailure = Failure.Offline, serverErrors = 0)
                    }
                }
                Answer.ServerError -> uploads.update(rideId) {
                    val errors = it.serverErrors + 1
                    val stuck = errors >= STUCK_AFTER
                    if (!stuck) retry = true
                    it.copy(
                        state = if (stuck) UploadStage.Stuck else UploadStage.Queued,
                        attempts = it.attempts + 1,
                        serverErrors = errors,
                        lastTryUtc = isoSeconds(now()),
                        lastFailure = Failure.Server,
                    )
                }
            }
        }
        return if (retry) UploadRun.Retry else UploadRun.Done
    }

    private suspend fun send(url: String, key: String, payload: String, fit: ByteArray, streams: ByteArray): Answer =
        Answers.post(transport, url.trim(), SavePayload.form(payload, key, fit, streams), "Thrive refused this ride.")

    companion object {
        const val BAD_REQUEST = Answers.BAD_REQUEST
        const val STUCK_AFTER = 10
        const val MISSING_FILES = "The ride's files are missing from this phone."
    }
}
