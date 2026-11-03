package com.luketmoss.thrivespin.core.ftp

import com.luketmoss.thrivespin.core.ride.recording.isoSeconds
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * The FTP write's own small queue (#770), independent of the ride's upload: one [FtpRecord] a confirmed test,
 * in `files/ftp/`, sent oldest first. Every read-modify-write is under one lock, and [records] always holds
 * what is on disk, for the Library banner, the sheet and `CurrentFtp`.
 */
class FtpQueue(private val store: FtpStore, private val now: () -> Long) {
    private val lock = Any()
    private val flow = MutableStateFlow(store.list())

    /** Every record that is not yet in Thrive, oldest first. */
    val records: StateFlow<List<FtpRecord>> get() = flow

    private fun refresh() {
        flow.value = store.list()
    }

    fun record(id: String): FtpRecord? = synchronized(lock) { store.read(id) }

    /**
     * Writes the record for a confirmed test: the commit. A second call for the same ride returns the first
     * record unchanged (a rapid second tap is one record). Null when the phone cannot hold it.
     */
    fun confirm(
        rideId: String,
        startedAtUtc: String,
        ftpW: Int,
        computedW: Int,
        previous: FtpNow?,
    ): FtpRecord? = synchronized(lock) {
        val id = FtpRecord.idFor(rideId)
        store.read(id)?.let { return@synchronized it }
        val record = FtpRecord(
            id = id,
            date = FtpDates.denverDate(startedAtUtc),
            ftpW = ftpW,
            rideId = rideId,
            computedW = computedW,
            previousW = previous?.ftpW,
            previousDate = previous?.date?.takeIf { it.isNotBlank() },
            createdAtUtc = isoSeconds(now()),
        )
        try {
            store.write(record)
        } catch (e: IOException) {
            return@synchronized null
        }
        refresh()
        record
    }

    /** "Try again": a rejected, stuck or waiting-on-Settings record goes back to the queue with its counters reset. */
    fun retry(id: String): Boolean = synchronized(lock) {
        val r = store.read(id) ?: return@synchronized false
        if (r.state == FtpStage.Queued) return@synchronized true
        write(r.copy(state = FtpStage.Queued, attempts = 0, serverErrors = 0, message = null))
    }

    /** "Drop change": deletes the record only. The ride is unaffected. */
    fun drop(id: String) = synchronized(lock) {
        store.delete(id)
        refresh()
    }

    /** Saving Settings takes the records that were waiting on them back to the queue. */
    fun settingsSaved(): Int = synchronized(lock) {
        var moved = 0
        for (r in store.list()) {
            if (r.state == FtpStage.NeedsKey || r.state == FtpStage.NeedsSetup) {
                if (write(r.copy(state = FtpStage.Queued, message = null))) moved++
            }
        }
        moved
    }

    // ---- For the uploader ----

    /** The queued records, oldest first. */
    internal fun queued(): List<FtpRecord> = synchronized(lock) { store.list().filter { it.state == FtpStage.Queued } }

    /** Applies [change] to a record that is still queued. */
    internal fun update(id: String, change: (FtpRecord) -> FtpRecord) = synchronized(lock) {
        val r = store.read(id) ?: return@synchronized
        if (r.state != FtpStage.Queued) return@synchronized
        write(change(r))
    }

    internal fun setStageForQueued(stage: FtpStage) = synchronized(lock) {
        for (r in store.list()) if (r.state == FtpStage.Queued) write(r.copy(state = stage))
    }

    /** Thrive has it: the record goes. */
    internal fun remove(id: String) = drop(id)

    private fun write(record: FtpRecord): Boolean = try {
        store.write(record)
        refresh()
        true
    } catch (e: IOException) {
        // The change is lost with the write; a queued record is simply tried again.
        false
    }
}
