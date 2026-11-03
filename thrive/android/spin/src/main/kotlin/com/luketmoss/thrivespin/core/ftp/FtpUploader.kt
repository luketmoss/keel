package com.luketmoss.thrivespin.core.ftp

import com.luketmoss.thrivespin.core.ConnectionTest
import com.luketmoss.thrivespin.core.Transport
import com.luketmoss.thrivespin.core.ride.recording.isoSeconds
import com.luketmoss.thrivespin.core.upload.Answer
import com.luketmoss.thrivespin.core.upload.Answers
import com.luketmoss.thrivespin.core.upload.UploadRun
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The FTP queue's run (#770). The answers are classified by the one function the ride queue uses
 * ([Answers]), so the two agree on every rule:
 *
 * - `success: true` is done: the cache takes the row Thrive returned ([onSent]), then the record is deleted.
 * - `bad_request` is final: `rejected`, with the server's text, never sent again by itself.
 * - A refused key is `needs_key` and stops the run; no URL or key is `needs_setup`.
 * - A network failure leaves the record queued and never counts toward `stuck`.
 * - Any other `success: false` counts, and the 10th in a row is `stuck`.
 *
 * Records go oldest first, one at a time.
 */
class FtpUploader(
    private val queue: FtpQueue,
    private val transport: Transport,
    /** The API URL and the Spin key from Settings. */
    private val config: () -> Pair<String, String>,
    private val now: () -> Long,
    /** Called with the row `addFtp` returned, before the record is deleted. */
    private val onSent: (FtpRow) -> Unit,
) {
    suspend fun runOnce(): UploadRun {
        val queued = queue.queued()
        if (queued.isEmpty()) return UploadRun.Done
        val (url, key) = config()
        if (!ConnectionTest.isValidUrl(url) || key.isBlank()) {
            queue.setStageForQueued(FtpStage.NeedsSetup)
            return UploadRun.Done
        }
        var retry = false
        for (record in queued) {
            when (val answer = Answers.post(transport, url.trim(), form(record, key), REFUSED)) {
                is Answer.Success -> {
                    onSent(FtpRow.read(answer.data) ?: FtpRow(record.id, record.date, record.ftpW, record.source, record.createdAtUtc))
                    queue.remove(record.id)
                }
                is Answer.Refused -> queue.update(record.id) {
                    it.copy(state = FtpStage.Rejected, message = answer.text, serverErrors = 0)
                }
                Answer.KeyRefused -> {
                    queue.setStageForQueued(FtpStage.NeedsKey)
                    return UploadRun.Done
                }
                Answer.Offline -> {
                    retry = true
                    queue.update(record.id) { it.copy(attempts = it.attempts + 1, lastTryUtc = isoSeconds(now()), serverErrors = 0) }
                }
                Answer.ServerError -> queue.update(record.id) {
                    val errors = it.serverErrors + 1
                    val stuck = errors >= STUCK_AFTER
                    if (!stuck) retry = true
                    it.copy(
                        state = if (stuck) FtpStage.Stuck else FtpStage.Queued,
                        attempts = it.attempts + 1,
                        serverErrors = errors,
                        lastTryUtc = isoSeconds(now()),
                    )
                }
            }
        }
        return if (retry) UploadRun.Retry else UploadRun.Done
    }

    /** The key travels in the body, never the URL. */
    private fun form(record: FtpRecord, key: String): Map<String, String> {
        val payload = buildJsonObject {
            put("id", record.id)
            put("date", record.date)
            put("ftp_w", record.ftpW)
            put("source", record.source)
            put("ride_id", record.rideId)
        }
        return linkedMapOf("action" to ACTION, "key" to key.trim(), "payload" to payload.toString())
    }

    companion object {
        const val ACTION = "addFtp"
        const val STUCK_AFTER = 10
        const val REFUSED = "Thrive refused this change."
    }
}
