package com.luketmoss.thrivespin.core.ftp

import com.luketmoss.thrivespin.core.workout.Maths
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/** One `FtpHistory` row as the API answers it: `getFtp`'s `current`, or the row `addFtp` returns. */
data class FtpRow(
    val id: String,
    /** The local `YYYY-MM-DD` the FTP took effect. */
    val date: String,
    val ftpW: Int,
    /** `ramp_test` or `manual`. */
    val source: String,
    /** The server's clock, ISO 8601 UTC; it breaks a tie between two rows of one date. */
    val created: String,
) {
    companion object {
        /** Null for anything that is not a row with a whole-watt FTP. */
        fun read(element: JsonElement?): FtpRow? {
            val obj = element as? JsonObject ?: return null
            val ftp = (obj["ftp_w"] as? JsonPrimitive)?.doubleOrNull ?: return null
            fun text(key: String) = (obj[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
            return FtpRow(
                id = text("id"),
                date = text("date"),
                ftpW = Maths.roundHalfUp(ftp),
                source = text("source"),
                created = text("created"),
            )
        }
    }
}
