package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.ftp.FtpRecord
import com.luketmoss.thrivespin.core.ride.recording.FileRideStore
import com.luketmoss.thrivespin.core.ride.recording.RideJson
import com.luketmoss.thrivespin.core.upload.UploadFiles
import java.io.File
import java.io.IOException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

/** `result` of `ramp.json`: [RampOutcome.Measured] as it is stored. */
@Serializable
data class RampResultJson(
    @SerialName("best_minute_w") val bestMinuteW: Int,
    @SerialName("computed_ftp_w") val computedFtpW: Int,
    @SerialName("lasted_s") val lastedS: Int,
    @SerialName("last_step_w") val lastStepW: Int?,
    @SerialName("max_hr") val maxHr: Int?,
    val end: RampEnd,
    @SerialName("null_power_s") val nullPowerS: Int,
)

/**
 * `ramp.json`, #770's one file in a ride's folder: written when the ramp ends (the result frozen) and rewritten
 * whole as it changes. `result` is null for a test too short to measure.
 */
@Serializable
data class RampFile(
    val v: Int = 1,
    val result: RampResultJson? = null,
    /** True when the ramp ran a full minute but the readings were missing (a too-short test's wording). */
    @SerialName("no_readings") val noReadings: Boolean = false,
    /** How long a too-short test's ramp lasted; a measured one has it in `result`. */
    @SerialName("short_lasted_s") val shortLastedS: Int = 0,
    @SerialName("adjusted_ftp_w") val adjustedFtpW: Int? = null,
    val kept: Boolean = false,
    /** True once "Set FTP to N W" wrote its record. The record is deleted when Thrive has it, so this is what remembers. */
    val set: Boolean = false,
    /** The decided FTP: the value set, or the one kept. */
    @SerialName("final_ftp_w") val finalFtpW: Int? = null,
) {
    fun outcome(): RampOutcome = if (result == null) {
        RampOutcome.TooShort(noReadings, shortLastedS)
    } else {
        RampOutcome.Measured(
            bestMinuteW = result.bestMinuteW,
            computedFtpW = result.computedFtpW,
            lastedS = result.lastedS,
            lastStepW = result.lastStepW,
            maxHr = result.maxHr,
            end = result.end,
            nullPowerS = result.nullPowerS,
        )
    }

    companion object {
        const val NAME = "ramp.json"

        fun of(outcome: RampOutcome): RampFile = when (outcome) {
            is RampOutcome.TooShort -> RampFile(result = null, noReadings = outcome.noReadings, shortLastedS = outcome.lastedS)
            is RampOutcome.Measured -> RampFile(
                result = RampResultJson(
                    bestMinuteW = outcome.bestMinuteW,
                    computedFtpW = outcome.computedFtpW,
                    lastedS = outcome.lastedS,
                    lastStepW = outcome.lastStepW,
                    maxHr = outcome.maxHr,
                    end = outcome.end,
                    nullPowerS = outcome.nullPowerS,
                ),
            )
        }
    }
}

/** Where a test's FTP decision stands. */
sealed interface RampDecision {
    data object Pending : RampDecision

    /** The FTP was set. [record] is null once Thrive has it. */
    data class Set(val ftpW: Int, val record: FtpRecord?) : RampDecision

    data class Kept(val ftpW: Int) : RampDecision
}

object RampDecisions {
    /** The record is the commit: its existence means the decision was made, even if the process died before `ramp.json` heard of it. */
    fun of(file: RampFile?, record: FtpRecord?): RampDecision = when {
        record != null -> RampDecision.Set(record.ftpW, record)
        file != null && file.set && file.finalFtpW != null -> RampDecision.Set(file.finalFtpW, null)
        file != null && file.kept && file.finalFtpW != null -> RampDecision.Kept(file.finalFtpW)
        else -> RampDecision.Pending
    }

    /** The FTP the ride is scored at, or null while the decision is pending. */
    fun finalFtp(decision: RampDecision): Int? = when (decision) {
        RampDecision.Pending -> null
        is RampDecision.Set -> decision.ftpW
        is RampDecision.Kept -> decision.ftpW
    }
}

/** The `ramp.json` files of the rides in [store]. */
class RampFiles(private val store: FileRideStore) {
    private fun dir(rideId: String): File = store.dir(rideId)

    fun read(rideId: String): RampFile? {
        val file = File(dir(rideId), RampFile.NAME)
        if (!file.exists()) return null
        return try {
            RideJson.decodeFromString(RampFile.serializer(), file.readText())
        } catch (e: IOException) {
            null
        } catch (e: SerializationException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    /** Whole, through a temp file and a rename. False when the phone cannot hold it. */
    fun write(rideId: String, file: RampFile): Boolean = try {
        UploadFiles.writeBytes(dir(rideId), RampFile.NAME, RideJson.encodeToString(RampFile.serializer(), file).toByteArray())
        true
    } catch (e: IOException) {
        false
    }

    /**
     * The frozen result: `ramp.json` as it stands, or, once the ramp is over, made from the recording and written.
     * Null when the recording cannot be read or the ramp is not over yet. Run again after a restart it gives the
     * same answer, because the reason and the figures all come from the recording.
     */
    fun ensure(rideId: String): RampFile? {
        read(rideId)?.let { return it }
        val recording = try {
            store.open(rideId)
        } catch (e: IOException) {
            return null
        } catch (e: SerializationException) {
            return null
        } catch (e: IllegalArgumentException) {
            return null
        }
        if (!RampResult.over(recording)) return null
        val file = RampFile.of(RampResult.from(recording))
        write(rideId, file)
        return file
    }

    /** The stepper's value, kept as it changes. */
    fun adjust(rideId: String, ftpW: Int) {
        val file = ensure(rideId) ?: return
        if (file.adjustedFtpW != ftpW) write(rideId, file.copy(adjustedFtpW = ftpW))
    }

    /** "Keep n W": nothing is sent. */
    fun keep(rideId: String, ftpW: Int): Boolean {
        val file = ensure(rideId) ?: return false
        return write(rideId, file.copy(kept = true, adjustedFtpW = ftpW, finalFtpW = ftpW))
    }

    /** After the record was written: the decision is remembered here, for when the record has gone. */
    fun markSet(rideId: String, ftpW: Int): Boolean {
        val file = ensure(rideId) ?: return false
        return write(rideId, file.copy(set = true, adjustedFtpW = ftpW, finalFtpW = ftpW))
    }
}
