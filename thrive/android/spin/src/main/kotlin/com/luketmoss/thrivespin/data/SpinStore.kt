package com.luketmoss.thrivespin.data

import android.content.Context
import com.luketmoss.thrivespin.core.DevicePersistence
import com.luketmoss.thrivespin.core.library.CachePersistence

/**
 * Everything the app keeps, in its private SharedPreferences: the API URL and
 * key, the saved devices, the library's cache, and whether the permission has been asked for.
 *
 * Nothing here logs. The key is read into a string for the settings field and
 * goes to the network layer in a POST body; it is in no message.
 */
class SpinStore(context: Context) : DevicePersistence {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun savedUrl(): String = prefs.getString(URL, null).orEmpty()

    fun savedKey(): String = prefs.getString(KEY, null).orEmpty()

    fun saveConfig(url: String, key: String) {
        prefs.edit().putString(URL, url.trim()).putString(KEY, key.trim()).commit()
    }

    override fun read(): String? = prefs.getString(DEVICES, null)

    override fun write(json: String) {
        prefs.edit().putString(DEVICES, json).commit()
    }

    /** The library's one cache (#767): the workouts, the FTP and today's plans, as one string. */
    val libraryCache: CachePersistence = object : CachePersistence {
        override fun read(): String? = prefs.getString(LIBRARY, null)

        override fun write(text: String) {
            prefs.edit().putString(LIBRARY, text).commit()
        }
    }

    /** Whether the system's Nearby devices prompt has ever been shown by this app. */
    var permissionAsked: Boolean
        get() = prefs.getBoolean(PERMISSION_ASKED, false)
        set(value) {
            prefs.edit().putBoolean(PERMISSION_ASKED, value).apply()
        }

    /** Whether the first-open ask has happened: the app asks on its own once. */
    var autoAsked: Boolean
        get() = prefs.getBoolean(AUTO_ASKED, false)
        set(value) {
            prefs.edit().putBoolean(AUTO_ASKED, value).apply()
        }

    /** Whether the first ride has asked for the notification permission: it is asked once. */
    var notificationAsked: Boolean
        get() = prefs.getBoolean(NOTIFICATION_ASKED, false)
        set(value) {
            prefs.edit().putBoolean(NOTIFICATION_ASKED, value).apply()
        }

    private companion object {
        const val FILE = "thrive_spin"
        const val URL = "url"
        const val KEY = "key"
        const val DEVICES = "devices"
        const val LIBRARY = "library_cache"
        const val PERMISSION_ASKED = "permission_asked"
        const val AUTO_ASKED = "auto_asked"
        const val NOTIFICATION_ASKED = "notification_asked"
    }
}
