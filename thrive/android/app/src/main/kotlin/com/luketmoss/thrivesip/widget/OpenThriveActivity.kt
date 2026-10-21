package com.luketmoss.thrivesip.widget

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log

private const val THRIVE_URL = "https://luketmoss.github.io/keel/thrive/"

/**
 * The widget body's target when the widget is set up (#555). It has no UI: it
 * schedules the re-reads, opens Thrive and finishes inside onCreate. The widget
 * starts it as a direct activity PendingIntent, which Android allows; starting
 * the browser from a Glance ActionCallback (a broadcast receiver) can be
 * blocked by background-launch limits. Not-configured and key-rejected widgets
 * open settings instead and never reach this.
 */
class OpenThriveActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            Scheduler.scheduleBodyTapReads(applicationContext)
        } catch (e: Exception) {
            Log.w("OpenThriveActivity", "could not schedule re-reads", e)
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(THRIVE_URL)))
        } catch (e: Exception) {
            Log.w("OpenThriveActivity", "could not open Thrive", e)
        }
        finish()
    }
}
