package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.workout.WorkoutText

/** Every line of copy the ride shows that depends on its state, from the design note's §Copy. Plain Kotlin, so the JVM tests pin the words. */
object RideText {
    const val NO_HEART_RATE = "No heart rate"

    fun banner(banner: RideBanner): String = when (banner) {
        is RideBanner.Interrupted -> "The ride stopped at ${RideTime.clock(banner.atS)} when the app was closed. It's paused."
        RideBanner.TrainerLost -> "Lost the trainer. Reconnecting… The clock keeps running."
        RideBanner.BluetoothOff -> "Bluetooth is off. Turn it on to reconnect."
        RideBanner.NoControl ->
            "The trainer isn't taking commands. Close other apps connected to it. Targets are a guide until it does."
        RideBanner.PowerUnsupported -> "Your trainer can't hold a power target. Targets are a guide."
        RideBanner.ResistanceUnsupported -> "Your trainer can't set a resistance level. Ride it by feel."
        RideBanner.SlopeUnsupported -> "Your trainer can't simulate a slope. Ride it by feel."
        RideBanner.Refused -> "The trainer refused that target. It's a guide for now."
    }

    /** The step card's status line before the clock starts. */
    fun ready(status: ReadyStatus, trainerName: String): String = when (status) {
        ReadyStatus.Connecting -> "Connecting to $trainerName…"
        ReadyStatus.CantFind -> "Can't find $trainerName. Pedal to wake it, and close other apps connected to it."
        ReadyStatus.BluetoothOff -> "Bluetooth is off."
        ReadyStatus.PermissionMissing -> "Nearby devices is not allowed. Allow it in Devices."
        ReadyStatus.PedalToStart -> "Pedal to start"
    }

    fun trainerPill(state: RideState): String {
        val name = state.trainerName
        return when (val pill = state.pill) {
            TrainerPill.Connecting -> "Connecting…"
            TrainerPill.Reconnecting -> "Reconnecting…"
            TrainerPill.Erg -> "$name · ERG"
            is TrainerPill.Level -> "$name · Level ${pill.level}"
            is TrainerPill.Slope -> "$name · Slope ${WorkoutText.grade(pill.tenths)}"
            TrainerPill.Free -> "$name · Free"
            TrainerPill.Guide -> "$name · Guide"
        }
    }

    fun hrPill(state: RideState): String = when (state.hrStatus) {
        HrStatus.Connecting -> "HR · Connecting…"
        HrStatus.Reading -> "HR · ${state.hrName}"
        HrStatus.NoReading -> "HR · No reading"
        HrStatus.None -> NO_HEART_RATE
    }

    fun bandWord(band: Band): String = when (band) {
        Band.On -> "On target"
        Band.Below -> "Below target"
        Band.Above -> "Above target"
    }

    /** The target's unit line: "watts · 90% FTP", with " · guide" when it is not held. */
    fun targetCaption(state: RideState): String = when (val target = state.target) {
        is TargetView.Erg -> {
            val pct = target.pct
            val base = if (pct != null) "watts · $pct% FTP" else "watts"
            if (state.targetIsGuide) "$base · guide" else base
        }
        is TargetView.Level -> "resistance level"
        is TargetView.Grade -> "slope"
        TargetView.Free -> "no target"
    }

    fun targetFigure(state: RideState): String = when (val target = state.target) {
        is TargetView.Erg -> target.watts.toString()
        is TargetView.Level -> target.level.toString()
        is TargetView.Grade -> WorkoutText.grade(target.tenths)
        TargetView.Free -> "Free"
    }

    /** The step's target as the notification words it: "225 W", "Level 30", "Slope 4.5%", "Free". */
    fun notificationTarget(state: RideState): String = when (val target = state.target) {
        is TargetView.Erg -> "${target.watts} W"
        is TargetView.Level -> "Level ${target.level}"
        is TargetView.Grade -> "Slope ${WorkoutText.grade(target.tenths)}"
        TargetView.Free -> "Free"
    }

    /** The foreground notification's text, updated once a second. */
    fun notification(state: RideState): String = when {
        state.phase == RidePhase.GettingReady ->
            if (state.ready == ReadyStatus.PedalToStart) "Pedal to start" else "Connecting to the trainer…"
        state.phase == RidePhase.Paused -> "Paused at ${RideTime.clock(state.rideS)}"
        state.banner == RideBanner.TrainerLost || state.banner == RideBanner.BluetoothOff -> "Lost the trainer · reconnecting"
        else -> {
            val left = state.stepLeftS
            val time = if (left != null) "${RideTime.clock(left)} left" else RideTime.clock(state.stepSecond)
            "${state.stepLabel} · $time · ${notificationTarget(state)}"
        }
    }

    /** What a screen reader hears when the step changes. */
    fun stepAnnouncement(state: RideState): String {
        val dur = state.stepDurS?.let { RideTime.clock(it) }
        return listOfNotNull(state.stepLabel, dur, notificationTarget(state)).joinToString(", ")
    }

    fun endBody(state: RideState): String {
        val ridden = "You've ridden ${RideTime.clock(state.rideS)}."
        val total = state.totalS
        return if (state.stepIndex == state.stepCount - 1 || total == null) {
            ridden
        } else {
            "$ridden ${RideTime.clock(total - state.rideS)} of the workout is left."
        }
    }

    fun storageFull(atS: Int): String = "The phone ran out of space. The ride was ended at ${RideTime.clock(atS)}."

    /** "Next" line: the label, duration and scaled target, or "Finish" on the last step. */
    fun next(next: NextView?): Pair<String, String> {
        if (next == null) return "Next" to "Finish"
        val dur = next.durS?.let { " · ${WorkoutText.clock(it)}" }.orEmpty()
        return "Next" to "${next.label}$dur · ${next.target}"
    }
}
