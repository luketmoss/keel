package com.luketmoss.thrivespin.core

/** What a saved device's pill or live value says, from where the connection is. */
enum class DeviceStatus {
    /** Connected and subscribed. */
    Connected,

    /** Looking for it, under [LOOK_MS]. */
    Connecting,

    /** Not seen for [LOOK_MS] while looking. */
    NotFound,

    /** Bluetooth is off or the permission is missing. */
    Unavailable,
    ;

    companion object {
        const val LOOK_MS = 10_000L

        fun of(ready: Boolean, connected: Boolean, lookingSinceMs: Long, nowMs: Long): DeviceStatus = when {
            !ready -> Unavailable
            connected -> Connected
            nowMs - lookingSinceMs >= LOOK_MS -> NotFound
            else -> Connecting
        }
    }
}
