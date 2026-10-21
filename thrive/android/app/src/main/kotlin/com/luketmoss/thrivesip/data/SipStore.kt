package com.luketmoss.thrivesip.data

import android.content.Context
import com.luketmoss.thrivesip.core.PendingDrink
import com.luketmoss.thrivesip.core.QueueStore
import com.luketmoss.thrivesip.core.SipJson
import com.luketmoss.thrivesip.core.Snapshot
import com.luketmoss.thrivesip.core.Totals
import java.time.Instant
import kotlinx.serialization.builtins.ListSerializer

data class Config(val url: String, val key: String)

/**
 * Everything the app keeps, in its private SharedPreferences: the URL and key,
 * the last good read, whether the key was refused, and the queue of taps.
 *
 * Nothing here logs. The key is read into a [Config] and goes to the network
 * layer; it is not placed in any string that is printed.
 */
class SipStore(context: Context) : QueueStore {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun config(): Config? {
        val url = prefs.getString(URL, null)?.trim().orEmpty()
        val key = prefs.getString(KEY, null)?.trim().orEmpty()
        return if (url.isEmpty() || key.isEmpty()) null else Config(url, key)
    }

    /** The values as typed, for the settings screen to fill its fields. */
    fun savedUrl(): String = prefs.getString(URL, null).orEmpty()

    fun savedKey(): String = prefs.getString(KEY, null).orEmpty()

    /** A new key is a fresh start: the "rejected" mark belonged to the old one. */
    fun saveConfig(url: String, key: String) {
        prefs.edit().putString(URL, url.trim()).putString(KEY, key.trim()).putBoolean(KEY_REJECTED, false).commit()
    }

    fun keyRejected(): Boolean = prefs.getBoolean(KEY_REJECTED, false)

    fun setKeyRejected(rejected: Boolean) {
        prefs.edit().putBoolean(KEY_REJECTED, rejected).apply()
    }

    fun saveTotals(totals: Totals, at: Instant) {
        prefs.edit()
            .putString(TOTALS, SipJson.encodeToString(Totals.serializer(), totals))
            .putLong(READ_AT, at.toEpochMilli())
            .apply()
    }

    private fun totals(): Totals? =
        prefs.getString(TOTALS, null)?.let {
            runCatching { SipJson.decodeFromString(Totals.serializer(), it) }.getOrNull()
        }

    override fun load(): List<PendingDrink> =
        prefs.getString(QUEUE, null)?.let {
            runCatching { SipJson.decodeFromString(ListSerializer(PendingDrink.serializer()), it) }.getOrNull()
        } ?: emptyList()

    /** `commit`, not `apply`: a tap must survive the process being killed a moment later. */
    override fun save(drinks: List<PendingDrink>) {
        prefs.edit().putString(QUEUE, SipJson.encodeToString(ListSerializer(PendingDrink.serializer()), drinks)).commit()
    }

    fun snapshot(now: Instant): Snapshot = Snapshot(
        configured = config() != null,
        totals = totals(),
        readAt = if (prefs.contains(READ_AT)) Instant.ofEpochMilli(prefs.getLong(READ_AT, 0)) else null,
        keyRejected = keyRejected(),
        pending = load(),
        now = now,
    )

    private companion object {
        const val FILE = "thrive_sip"
        const val URL = "url"
        const val KEY = "key"
        const val KEY_REJECTED = "key_rejected"
        const val TOTALS = "totals"
        const val READ_AT = "read_at"
        const val QUEUE = "queue"
    }
}
