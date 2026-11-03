package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.workout.RideRequest
import com.luketmoss.thrivespin.core.workout.RideStarter

/** What Start did, for the screen to say. */
sealed interface StartOutcome {
    /** No trainer is saved: "Add your trainer in Devices first." */
    data object NoTrainer : StartOutcome

    /** A ride is already going: its screen opens, with "A ride is already going. End it first." */
    data object AlreadyRiding : StartOutcome

    data class Started(val session: RideSession) : StartOutcome
}

/**
 * #767's `RideStarter`, replaced (#768): nothing starts without a saved trainer or while a ride is
 * going; otherwise the request becomes a [RideSession] with a new ride id, made once here.
 */
class RideLauncher(
    private val devices: () -> DeviceState,
    /** A ride is getting ready, running or paused. */
    private val rideActive: () -> Boolean,
    private val newRideId: () -> String,
    /** Starts the service and opens the ride screen. */
    private val launch: (RideSession) -> Unit,
    private val outcome: (StartOutcome) -> Unit,
) : RideStarter {
    override fun start(request: RideRequest) {
        if (devices().trainer == null) {
            outcome(StartOutcome.NoTrainer)
            return
        }
        if (rideActive()) {
            outcome(StartOutcome.AlreadyRiding)
            return
        }
        val session = RideSessions.fromRequest(request, newRideId())
        launch(session)
        outcome(StartOutcome.Started(session))
    }

    companion object {
        const val NO_TRAINER = "Add your trainer in Devices first."
        const val ALREADY_RIDING = "A ride is already going. End it first."
    }
}
