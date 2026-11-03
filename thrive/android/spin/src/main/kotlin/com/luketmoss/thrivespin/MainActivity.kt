package com.luketmoss.thrivespin

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.ActivityNotFoundException
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.luketmoss.thrivespin.ble.BleEnvironment
import com.luketmoss.thrivespin.ble.DeviceHub
import com.luketmoss.thrivespin.ble.DeviceScanner
import com.luketmoss.thrivespin.core.AppTab
import com.luketmoss.thrivespin.core.ConnectionTest
import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.DeviceStore
import com.luketmoss.thrivespin.core.Route
import com.luketmoss.thrivespin.core.Routes
import com.luketmoss.thrivespin.core.SavedDevice
import com.luketmoss.thrivespin.core.SpinJson
import com.luketmoss.thrivespin.core.TestResult
import com.luketmoss.thrivespin.core.ftp.CurrentFtp
import com.luketmoss.thrivespin.core.ftp.FtpDates
import com.luketmoss.thrivespin.core.ftp.FtpNow
import com.luketmoss.thrivespin.core.ftp.FtpRecord
import com.luketmoss.thrivespin.core.ftp.FtpStage
import com.luketmoss.thrivespin.core.ftp.FtpText
import com.luketmoss.thrivespin.core.ftp.PendingFtp
import com.luketmoss.thrivespin.core.library.DeleteOutcome
import com.luketmoss.thrivespin.core.library.LibraryInputs
import com.luketmoss.thrivespin.core.library.LibraryModel
import com.luketmoss.thrivespin.core.library.LibraryStates
import com.luketmoss.thrivespin.core.library.LibraryView
import com.luketmoss.thrivespin.core.library.SaveOutcome
import com.luketmoss.thrivespin.core.ramp.BestMinute
import com.luketmoss.thrivespin.core.ramp.FtpStepper
import com.luketmoss.thrivespin.core.ramp.RampDecisions
import com.luketmoss.thrivespin.core.ramp.RampFile
import com.luketmoss.thrivespin.core.ramp.RampLauncher
import com.luketmoss.thrivespin.core.ramp.RampOutcome
import com.luketmoss.thrivespin.core.ramp.RampPhase
import com.luketmoss.thrivespin.core.ramp.RampResult
import com.luketmoss.thrivespin.core.ramp.RampScreenStates
import com.luketmoss.thrivespin.core.ramp.RampTest
import com.luketmoss.thrivespin.core.ramp.ResultAction
import com.luketmoss.thrivespin.core.ramp.ResultInputs
import com.luketmoss.thrivespin.core.ramp.ResultStates
import com.luketmoss.thrivespin.core.ride.RideEngine
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RideLauncher
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RideProfile
import com.luketmoss.thrivespin.core.ride.RideSession
import com.luketmoss.thrivespin.core.ride.RideState
import com.luketmoss.thrivespin.core.ride.RideText
import com.luketmoss.thrivespin.core.ride.StartOutcome
import com.luketmoss.thrivespin.core.ride.recording.RecoveryOutcome
import com.luketmoss.thrivespin.core.ride.recording.RideRecording
import com.luketmoss.thrivespin.core.ride.recording.RideRecovery
import com.luketmoss.thrivespin.core.summary.SummaryStates
import com.luketmoss.thrivespin.core.upload.Effort
import com.luketmoss.thrivespin.core.upload.PendingBanner
import com.luketmoss.thrivespin.core.upload.PendingRides
import com.luketmoss.thrivespin.core.upload.Preparation
import com.luketmoss.thrivespin.core.upload.SaveResult
import com.luketmoss.thrivespin.core.upload.UploadStage
import com.luketmoss.thrivespin.core.workout.DetailState
import com.luketmoss.thrivespin.core.workout.Draft
import com.luketmoss.thrivespin.core.workout.RideStarter
import com.luketmoss.thrivespin.data.OkHttpTransport
import com.luketmoss.thrivespin.ftp.FtpRuntime
import com.luketmoss.thrivespin.ftp.LibraryRuntime
import com.luketmoss.thrivespin.data.SpinStore
import com.luketmoss.thrivespin.ride.RampRuntime
import com.luketmoss.thrivespin.ride.RideRuntime
import com.luketmoss.thrivespin.ride.RideService
import com.luketmoss.thrivespin.ui.BuilderActions
import com.luketmoss.thrivespin.ui.BuilderContent
import com.luketmoss.thrivespin.ui.DetailActions
import com.luketmoss.thrivespin.ui.DetailContent
import com.luketmoss.thrivespin.ui.DevicesActions
import com.luketmoss.thrivespin.ui.DevicesScreen
import com.luketmoss.thrivespin.ui.FtpSheet
import com.luketmoss.thrivespin.ui.FtpSheetActions
import com.luketmoss.thrivespin.ui.LibraryActions
import com.luketmoss.thrivespin.ui.LibraryContent
import com.luketmoss.thrivespin.ui.RampActions
import com.luketmoss.thrivespin.ui.RampIntroScreen
import com.luketmoss.thrivespin.ui.RampResultScreen
import com.luketmoss.thrivespin.ui.RampScreen
import com.luketmoss.thrivespin.ui.ResultActions
import com.luketmoss.thrivespin.ui.RideActions
import com.luketmoss.thrivespin.ui.RideSummaryScreen
import com.luketmoss.thrivespin.ui.RideScreen
import com.luketmoss.thrivespin.ui.ScanSheet
import com.luketmoss.thrivespin.ui.SettingsScreen
import com.luketmoss.thrivespin.ui.SpinDownSheet
import com.luketmoss.thrivespin.ui.SpinShell
import com.luketmoss.thrivespin.ui.SpinTheme
import com.luketmoss.thrivespin.ui.SummaryActions
import com.luketmoss.thrivespin.upload.UploadRuntime
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.SerializationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The app's one activity: Library, Devices (with Settings behind its gear), the workout detail and the
 * builder. It opens on Library. Connections run only while Devices is on screen and the app is in the
 * foreground; the sheets do not survive the screen going away (a scan or spin-down in progress ends).
 */
@SuppressLint("MissingPermission")
class MainActivity : ComponentActivity() {
    private lateinit var store: SpinStore
    private lateinit var deviceStore: DeviceStore
    private lateinit var hub: DeviceHub
    private lateinit var scanner: DeviceScanner
    private lateinit var library: LibraryModel

    private lateinit var rideStarter: RideStarter
    private lateinit var rampLauncher: RampLauncher

    private var devices by mutableStateOf(DeviceState())
    private var scanOpen by mutableStateOf(false)
    private var spinDownOpen by mutableStateOf(false)

    /** A line for the snackbar: set from anywhere, shown and cleared by [SpinApp]. */
    private var snackMessage by mutableStateOf<String?>(null)

    /** The ride waiting on the permission prompt it started. */
    private var pendingRide: RideSession? = null

    private val ridePermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val session = pendingRide
        pendingRide = null
        if (session != null) {
            // The notification is only a convenience, so the ride starts whatever its answer; Bluetooth is not.
            if (BleEnvironment.permitted(this)) {
                startRideService(RideRuntime.Launch(session, null))
            } else {
                snackMessage = "Allow Nearby devices in Devices first."
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = SpinStore(this)
        deviceStore = DeviceStore(store)
        devices = deviceStore.state
        hub = DeviceHub(this) { address, features ->
            deviceStore.setFeatures(address, features)
            devices = deviceStore.state
        }
        hub.setDevices(devices)
        scanner = DeviceScanner(this)
        // The process's one model (#770): the FTP worker puts a sent FTP into the same cache the screens read.
        library = LibraryRuntime.model(this)
        rideStarter = RideLauncher(
            devices = { devices },
            rideActive = { RideRuntime.active() },
            newRideId = { UUID.randomUUID().toString() },
            launch = { session -> launchRide(session) },
            outcome = { outcome ->
                when (outcome) {
                    StartOutcome.NoTrainer -> snackMessage = RideLauncher.NO_TRAINER
                    StartOutcome.AlreadyRiding -> snackMessage = RideLauncher.ALREADY_RIDING
                    is StartOutcome.Started -> Unit
                }
            },
        )
        rampLauncher = RampLauncher(
            devices = { devices },
            rideActive = { RideRuntime.active() },
            newRideId = { UUID.randomUUID().toString() },
            launch = { session -> launchRide(session) },
        )
        recoverRides()
        nudgeUploads()

        setContent {
            SpinTheme {
                SpinApp()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        hub.setForeground(true)
    }

    override fun onStop() {
        super.onStop()
        hub.setForeground(false)
        scanner.stop()
        scanOpen = false
        spinDownOpen = false
    }

    private fun devicesChanged() {
        devices = deviceStore.state
        hub.setDevices(devices)
    }

    /**
     * Once per process, before Library is shown: a ride the app was killed in comes back paused or is
     * finished, and every finished ride not yet handed off goes to its summary (#769).
     */
    private fun recoverRides() {
        if (RideRuntime.recovered) return
        RideRuntime.recovered = true
        val rideStore = RideRuntime.store(this)
        val outcome = try {
            RideRecovery.run(rideStore, System.currentTimeMillis())
        } catch (e: java.io.IOException) {
            RecoveryOutcome(null, emptyList())
        }
        val handler = RideRuntime.handler(this)
        val resume: RideRecording? = outcome.resume
        if (resume != null) {
            if (BleEnvironment.permitted(this)) {
                startRideService(RideRuntime.Launch(resume.meta.session, resume))
            } else {
                // The ride's service needs Nearby devices to run: without it the ride is kept as it stood.
                rideStore.finishInterrupted(resume.meta.rideId, resume)
                handler.onFinished(resume.meta.rideId)
            }
        }
        outcome.handOff.forEach { handler.onFinished(it) }
    }

    /** On app open, anything queued goes to WorkManager again. */
    private fun nudgeUploads() {
        Thread {
            val queued = UploadRuntime.uploads(this).pending().any { it.stage == UploadStage.Queued }
            if (queued) UploadRuntime.kick(this)
            // And any FTP change waiting to send (#770).
            if (FtpRuntime.queue(this).records.value.any { it.state == FtpStage.Queued }) FtpRuntime.kick(this)
        }.start()
    }

    /** Asks for what a ride needs on the phone, the first time, then starts it. */
    private fun launchRide(session: RideSession) {
        val missing = ArrayList<String>()
        BleEnvironment.PERMISSIONS.filterTo(missing) {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        val notifications = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !store.notificationAsked &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        if (notifications) missing += Manifest.permission.POST_NOTIFICATIONS
        if (missing.isEmpty()) {
            startRideService(RideRuntime.Launch(session, null))
        } else {
            if (notifications) store.notificationAsked = true
            pendingRide = session
            ridePermissions.launch(missing.toTypedArray())
        }
    }

    private fun startRideService(launch: RideRuntime.Launch) {
        RideRuntime.queue(launch)
        try {
            ContextCompat.startForegroundService(this, Intent(this, RideService::class.java))
        } catch (e: SecurityException) {
            RideRuntime.take()
            RideRuntime.detach()
            snackMessage = "Couldn't start the ride."
        } catch (e: IllegalStateException) {
            RideRuntime.take()
            RideRuntime.detach()
            snackMessage = "Couldn't start the ride."
        }
    }

    @Composable
    private fun SpinApp() {
        var encoded by rememberSaveable { mutableStateOf(Routes.encode(Routes.START)) }
        val route = Routes.decode(encoded)
        val go: (Route) -> Unit = { encoded = Routes.encode(it) }
        var search by rememberSaveable { mutableStateOf("") }
        var category by rememberSaveable { mutableStateOf<String?>(null) }
        val snackbar = remember { SnackbarHostState() }
        val scope = rememberCoroutineScope()
        val starter = rideStarter
        val engine by RideRuntime.engine.collectAsState()
        val handOffs by RideRuntime.handOffs.collectAsState()
        val results by RideRuntime.results.ids.collectAsState()
        val current = engine
        val ride: RideState? = if (current != null) current.state.collectAsState().value else null

        LaunchedEffect(snackMessage) {
            val message = snackMessage
            if (message != null) {
                snackbar.showSnackbar(message)
                snackMessage = null
            }
        }

        Box(modifier = Modifier.fillMaxSize()) {
            if (results.isNotEmpty()) {
                // A ramp test's result (#770), above the ramp screen when its cool-down still runs.
                RampResultHost(results.first(), go)
            } else if (current != null && ride != null && ride.phase != RidePhase.Finished) {
                // While a ride is active, opening the app always lands on it, and a ramp test on its own screen.
                if (current.session.kind == RideKind.RampTest) RampHost(current, ride) else RideHost(current, ride)
            } else if (handOffs.isNotEmpty() && route !is Route.Settings) {
                SummaryHost(handOffs.first(), go)
            } else when (route) {
                is Route.Settings -> {
                    BackHandler { go(Route.Tab(route.from)) }
                    SettingsScreen(
                        initialUrl = store.savedUrl(),
                        initialKey = store.savedKey(),
                        onBack = { go(Route.Tab(route.from)) },
                        onTest = { url, key -> ConnectionTest.run(url, key, OkHttpTransport) },
                        onSave = { url, key ->
                            if (!ConnectionTest.isValidUrl(url)) {
                                TestResult.BadUrl
                            } else {
                                store.saveConfig(url, key)
                                // And the FTP changes waiting on them (#770).
                                FtpRuntime.queue(this@MainActivity).settingsSaved()
                                FtpRuntime.kick(this@MainActivity)
                                // Rides waiting on the URL or key go back to the queue (#769).
                                UploadRuntime.uploads(this@MainActivity).settingsSaved()
                                UploadRuntime.kick(this@MainActivity)
                                // A corrected URL or key must not wait out the refresh throttle.
                                LibraryModel.lastAttemptMs = 0L
                                null
                            }
                        },
                    )
                }
                is Route.Tab -> SpinShell(
                    current = route.tab,
                    onTab = { go(Route.Tab(it)) },
                    onBuild = { go(Route.Builder(null, route)) },
                ) {
                    when (route.tab) {
                        AppTab.Library -> LibraryHost(
                            search = search,
                            category = category,
                            onSearch = { search = it },
                            onCategory = { category = it },
                            onOpen = { go(Route.Detail(it)) },
                            onSettings = { go(Route.Settings(AppTab.Library)) },
                            onRampTest = { go(Route.RampIntro) },
                        )
                        AppTab.Devices -> DevicesHost(onSettings = {
                            scanOpen = false
                            spinDownOpen = false
                            go(Route.Settings(AppTab.Devices))
                        })
                    }
                }
                Route.RampIntro -> RampIntroHost(go)
                is Route.Detail -> DetailHost(route, starter, go)
                is Route.Builder -> BuilderHost(route, go)
            }
            SnackbarHost(
                hostState = snackbar,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp),
            ) { data -> Snackbar(snackbarData = data) }
        }
    }

    @Composable
    private fun LibraryHost(
        search: String,
        category: String?,
        onSearch: (String) -> Unit,
        onCategory: (String?) -> Unit,
        onOpen: (String) -> Unit,
        onSettings: () -> Unit,
        onRampTest: () -> Unit,
    ) {
        val cache by library.cache.collectAsState()
        val refreshing by library.refreshing.collectAsState()
        val failure by library.failure.collectAsState()
        var pulling by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()
        // The rides that are not finished with (#769), re-read while Library is on screen.
        val banner by produceState<PendingBanner?>(null) {
            val uploads = UploadRuntime.uploads(this@MainActivity)
            while (true) {
                value = withContext(Dispatchers.IO) { PendingRides.banner(uploads.pending()) }
                delay(2000)
            }
        }

        // Whenever Library is shown, at most once a minute, and on a pull.
        LaunchedEffect(Unit) { library.refresh(force = false) }

        // The FTP Spin is using (#770): the cache's, or a change not yet in Thrive; and the changes still waiting.
        val ftpRecords by FtpRuntime.queue(this@MainActivity).records.collectAsState()
        val ftpNow = remember(cache, ftpRecords) { CurrentFtp.of(cache, ftpRecords) }
        val ftpBanner = remember(ftpRecords) { PendingFtp.banner(ftpRecords) }
        var sheetId by rememberSaveable { mutableStateOf<String?>(null) }
        val thisYear = LocalDate.now().year

        val today = LocalDate.now()
        val screen = LibraryStates.screen(
            LibraryInputs(
                configured = library.isConfigured,
                cache = cache,
                refreshing = refreshing,
                failure = failure,
                category = category,
                search = search,
                today = today,
                nowMs = System.currentTimeMillis(),
                zone = ZoneId.systemDefault(),
            ),
        )
        LibraryContent(
            state = screen,
            search = search,
            category = category,
            today = today,
            pulling = pulling && refreshing,
            actions = LibraryActions(
                onOpenWorkout = onOpen,
                onOpenSettings = onSettings,
                onRetry = { scope.launch { library.refresh(force = true) } },
                onPullRefresh = {
                    scope.launch {
                        pulling = true
                        library.refresh(force = true)
                        pulling = false
                    }
                },
                onSearch = onSearch,
                onCategory = onCategory,
            ),
            banner = banner,
            onBanner = { banner?.let { RideRuntime.show(it.rideId) } },
            ftpBanner = ftpBanner,
            onFtpBanner = { ftpBanner?.let { sheetId = it.recordId } },
            rampCardLine = FtpText.cardLine(ftpNow, thisYear),
            onRampTest = onRampTest,
        )
        val sheetRecord = ftpRecords.firstOrNull { it.id == sheetId }
        if (sheetRecord != null) {
            FtpSheet(
                record = sheetRecord,
                thisYear = thisYear,
                actions = FtpSheetActions(
                    onClose = { sheetId = null },
                    onSendNow = { FtpRuntime.kick(this@MainActivity) },
                    onOpenSettings = {
                        sheetId = null
                        onSettings()
                    },
                    onTryAgain = {
                        scope.launch {
                            withContext(Dispatchers.IO) { FtpRuntime.queue(this@MainActivity).retry(sheetRecord.id) }
                            FtpRuntime.kick(this@MainActivity)
                        }
                    },
                    onDrop = {
                        sheetId = null
                        FtpRuntime.queue(this@MainActivity).drop(sheetRecord.id)
                    },
                ),
            )
        } else if (sheetId != null) {
            // The record went (Thrive took it, or it was dropped) while its sheet was open.
            LaunchedEffect(sheetId) { sheetId = null }
        }
    }

    /** The FTP Spin is using now: the library's cached `current`, or a confirmed change not yet in Thrive (#770). */
    @Composable
    private fun currentFtp(): FtpNow? {
        val cache by library.cache.collectAsState()
        val records by FtpRuntime.queue(this).records.collectAsState()
        return remember(cache, records) { CurrentFtp.of(cache, records) }
    }

    @Composable
    private fun DetailHost(route: Route.Detail, starter: RideStarter, go: (Route) -> Unit) {
        val cache by library.cache.collectAsState()
        val workout = cache?.workouts?.firstOrNull { it.id == route.workoutId }
        BackHandler { go(Routes.START) }
        if (workout == null) {
            LaunchedEffect(route) { go(Routes.START) }
            return
        }
        val trainer = devices.trainer?.features
        // Made afresh each time the screen opens, so intensity is 100% every time; kept across rotation.
        var stateJson by rememberSaveable(route.workoutId) {
            mutableStateOf(SpinJson.encodeToString(DetailState.serializer(), DetailState.open(route.workoutId, trainer)))
        }
        val state = remember(stateJson) { SpinJson.decodeFromString(DetailState.serializer(), stateJson) }
        val ftpW = currentFtp()?.ftpW
        DetailContent(
            workout = workout,
            state = state,
            ftpW = ftpW,
            plannedToday = LibraryView.isPlannedToday(cache, workout.id, LocalDate.now()),
            trainer = trainer,
            actions = DetailActions(
                onBack = { go(Routes.START) },
                onEdit = { go(Route.Builder(workout.id, route)) },
                onState = { stateJson = SpinJson.encodeToString(DetailState.serializer(), it) },
                onStart = {
                    val request = state.request(workout.name, workout.steps, ftpW)
                    if (request != null) starter.start(request)
                },
            ),
        )
    }

    @Composable
    private fun RideHost(engine: RideEngine, state: RideState) {
        BackHandler { snackMessage = "The ride keeps going. Use End to stop." }
        val profile = remember(engine, state.intensityPct) { RideProfile.model(engine.session, state.intensityPct) }
        val enableBluetooth = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { }
        RideScreen(
            state = state,
            profile = profile,
            actions = RideActions(
                onPause = { engine.pause() },
                onResume = { engine.resume() },
                onSkip = { engine.skipStep() },
                onIntensity = { engine.adjustIntensity(it) },
                onTrainerStep = { engine.adjustModeSetting(it) },
                onEnd = { engine.end() },
                onDiscard = { engine.discard() },
                onCancel = { engine.cancel() },
                onTurnOnBluetooth = { enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) },
            ),
        )
    }

    /** A finished ride's summary (#769): its figures, whether Thrive has it, and effort and notes to send with it. */
    @Composable
    private fun SummaryHost(rideId: String, go: (Route) -> Unit) {
        val uploads = remember { UploadRuntime.uploads(this@MainActivity) }
        val scope = rememberCoroutineScope()
        val zone = remember { ZoneId.systemDefault() }
        var prep by remember(rideId) { mutableStateOf<Preparation?>(null) }
        // A ramp test is scored at the FTP in force after its decision, however its summary was reached (#770).
        val decider = remember { RampRuntime.decider(this@MainActivity) }
        LaunchedEffect(rideId) {
            prep = withContext(Dispatchers.IO) { uploads.prepare(rideId, decider.finalFtp(rideId)) }
        }
        val upload by uploads.state(rideId).collectAsState()
        val sendingIds by uploads.sending.collectAsState()

        // Effort and notes start from what the draft already holds, and are kept as they change.
        var effortWire by rememberSaveable(rideId) { mutableStateOf("") }
        var notes by rememberSaveable(rideId) { mutableStateOf("") }
        var loaded by rememberSaveable(rideId) { mutableStateOf(false) }
        LaunchedEffect(upload != null) {
            val u = upload
            if (!loaded && u != null) {
                effortWire = u.effort
                notes = u.notes
                loaded = true
            }
        }
        LaunchedEffect(effortWire, notes, loaded) {
            if (loaded) {
                delay(300)
                withContext(Dispatchers.IO) { uploads.setDraft(rideId, Effort.fromWire(effortWire), notes) }
            }
        }

        val view = SummaryStates.of(prep, upload, rideId in sendingIds, System.currentTimeMillis(), zone)
        val summary = (prep as? Preparation.Ready)?.summary
        val shownEffort = if (view.fieldsEditable) Effort.fromWire(effortWire) else Effort.fromWire(upload?.effort.orEmpty())
        val shownNotes = if (view.fieldsEditable) notes else upload?.notes.orEmpty()

        // Later, Done and back all leave the screen: a draft stays a draft, and the Library banner counts it.
        val leave: () -> Unit = {
            uploads.setDraft(rideId, Effort.fromWire(effortWire), notes)
            RideRuntime.handedOff(rideId)
            go(Routes.START)
        }
        BackHandler { leave() }
        RideSummaryScreen(
            summary = summary,
            view = view,
            effort = shownEffort,
            notes = shownNotes,
            zone = zone,
            storageNote = RideRuntime.storageFullAt(rideId)?.let { RideText.storageFull(it) },
            actions = SummaryActions(
                onBack = leave,
                onLater = leave,
                onDone = leave,
                onSave = {
                    scope.launch {
                        val result = withContext(Dispatchers.IO) { uploads.save(rideId, Effort.fromWire(effortWire), notes) }
                        if (result == SaveResult.Queued) UploadRuntime.kick(this@MainActivity)
                    }
                },
                onOpenInThrive = {
                    val url = view.openUrl
                    if (url != null) {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        } catch (e: ActivityNotFoundException) {
                            snackMessage = "Couldn't open Thrive."
                        }
                    }
                },
                onSendNow = {
                    scope.launch {
                        withContext(Dispatchers.IO) { uploads.retry(rideId) }
                        UploadRuntime.kick(this@MainActivity)
                    }
                },
                onTryAgain = {
                    scope.launch {
                        withContext(Dispatchers.IO) { uploads.retry(rideId) }
                        UploadRuntime.kick(this@MainActivity)
                    }
                },
                onDeleteFromPhone = {
                    scope.launch {
                        if (withContext(Dispatchers.IO) { uploads.deleteFromPhone(rideId) }) {
                            RideRuntime.handedOff(rideId)
                            go(Routes.START)
                        }
                    }
                },
                onDiscard = {
                    scope.launch {
                        if (withContext(Dispatchers.IO) { uploads.discard(rideId) }) {
                            RideRuntime.handedOff(rideId)
                            go(Routes.START)
                        }
                    }
                },
                onOpenSettings = { go(Route.Settings(AppTab.Library)) },
                onEffort = { effortWire = it?.wire.orEmpty() },
                onNotes = { notes = it },
            ),
        )
    }

    /** The ramp test's intro (#770): what it is, and Start. */
    @Composable
    private fun RampIntroHost(go: (Route) -> Unit) {
        BackHandler { go(Routes.START) }
        RampIntroScreen(
            current = currentFtp(),
            canRun = RampTest.canRun(devices.trainer?.features),
            thisYear = LocalDate.now().year,
            onBack = { go(Routes.START) },
            onStart = {
                when (rampLauncher.start()) {
                    StartOutcome.NoTrainer -> snackMessage = RideLauncher.NO_TRAINER
                    StartOutcome.AlreadyRiding -> snackMessage = RideLauncher.ALREADY_RIDING
                    is StartOutcome.Started -> Unit
                }
            },
        )
    }

    /** The ramp test's own ride screen (#770): the warm-up, the ramp, "Test over" and a recovered test. */
    @Composable
    private fun RampHost(engine: RideEngine, state: RideState) {
        val rides = remember { RideRuntime.store(this@MainActivity) }
        val files = remember { RampRuntime.files(this@MainActivity) }
        val rideId = state.rideId
        // The tap is remembered in memory only, to word the reason until the result is frozen from the recording.
        var tapped by remember(rideId) { mutableStateOf(false) }
        var outcome by remember(rideId) { mutableStateOf<RampOutcome?>(null) }
        var best by remember(rideId) { mutableStateOf<BestMinute?>(null) }
        val past = state.stepIndex >= RampTest.COOLDOWN
        // The ramp's end freezes the result at once, into ramp.json.
        LaunchedEffect(rideId, past) {
            if (past) outcome = withContext(Dispatchers.IO) { files.ensure(rideId)?.outcome() }
        }
        // The best minute so far, from the ramp's samples, once a second.
        LaunchedEffect(rideId, state.rideS) {
            if (state.stepIndex == RampTest.RAMP && state.phase == RidePhase.Running) {
                best = withContext(Dispatchers.IO) {
                    try {
                        RampResult.soFar(rides.open(rideId).samples)
                    } catch (e: java.io.IOException) {
                        null
                    } catch (e: SerializationException) {
                        null
                    } catch (e: IllegalArgumentException) {
                        null
                    }
                }
            }
        }
        val view = RampScreenStates.of(state, outcome, best, tapped)
        BackHandler { snackMessage = view.backMessage }
        val enableBluetooth = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { }
        RampScreen(
            state = state,
            view = view,
            actions = RampActions(
                onSkip = {
                    if (view.phase == RampPhase.Ramp) tapped = true
                    engine.skipStep()
                },
                onCancel = { engine.cancel() },
                onDiscard = { engine.discard() },
                onSeeResult = { RideRuntime.showResult(rideId) },
                onEndForResult = { engine.end() },
                onStopCooldown = { engine.end() },
                onTurnOnBluetooth = { enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) },
            ),
        )
    }

    /**
     * A ramp test's result (#770): the new FTP to adjust and confirm. The decision is the FTP record (the commit)
     * and `ramp.json`; this host only reads them and calls the decider. "Later" leaves it pending, and the test
     * comes back at the next app open.
     */
    @Composable
    private fun RampResultHost(rideId: String, go: (Route) -> Unit) {
        val rides = remember { RideRuntime.store(this@MainActivity) }
        val files = remember { RampRuntime.files(this@MainActivity) }
        val decider = remember { RampRuntime.decider(this@MainActivity) }
        val uploads = remember { UploadRuntime.uploads(this@MainActivity) }
        val queue = remember { FtpRuntime.queue(this@MainActivity) }
        val scope = rememberCoroutineScope()
        val zone = remember { ZoneId.systemDefault() }
        var file by remember(rideId) { mutableStateOf<RampFile?>(null) }
        var startedAt by remember(rideId) { mutableStateOf<String?>(null) }
        var adjusted by rememberSaveable(rideId) { mutableStateOf<Int?>(null) }
        var setting by remember(rideId) { mutableStateOf(false) }

        // The result is frozen from the recording; until it can be read the screen says it is measuring.
        LaunchedEffect(rideId) {
            startedAt = withContext(Dispatchers.IO) {
                try {
                    rides.readMeta(rideId).startedAtUtc
                } catch (e: java.io.IOException) {
                    null
                } catch (e: SerializationException) {
                    null
                }
            }
            while (file == null) {
                file = withContext(Dispatchers.IO) { files.ensure(rideId) }
                if (file == null) delay(1000)
            }
            if (adjusted == null) adjusted = file?.adjustedFtpW
        }
        // The stepper's value is kept as it changes.
        LaunchedEffect(adjusted) {
            val value = adjusted
            if (value != null) {
                delay(300)
                withContext(Dispatchers.IO) { files.adjust(rideId, value) }
            }
        }

        val records by queue.records.collectAsState()
        val cache by library.cache.collectAsState()
        val running by RideRuntime.engine.collectAsState()
        val engine = running?.takeIf { it.session.rideId == rideId }
        val ride: RideState? = if (engine != null) engine.state.collectAsState().value else null
        val coolLeft = if (ride != null && ride.phase != RidePhase.Finished && ride.stepIndex == RampTest.COOLDOWN) ride.stepLeftS else null
        val ownId = FtpRecord.idFor(rideId)
        val decision = RampDecisions.of(file, records.firstOrNull { it.id == ownId })
        val current = remember(cache, records) { CurrentFtp.of(cache, records.filter { it.id != ownId }) }
        val outcome = file?.outcome()
        val view = ResultStates.of(
            ResultInputs(
                outcome = outcome,
                adjustedFtpW = adjusted ?: file?.adjustedFtpW,
                decision = decision,
                current = current,
                coolDownLeftS = coolLeft,
                startedAtUtc = startedAt ?: "1970-01-01T00:00:00Z",
                zone = zone,
                thisYear = LocalDate.now().year,
                setting = setting,
            ),
        )

        val later: () -> Unit = {
            // Pending stays pending: the ride is not handed off, so the next app open presents it again.
            RideRuntime.results.remove(rideId)
            go(Routes.START)
        }
        BackHandler { later() }
        RampResultScreen(
            view = view,
            actions = ResultActions(
                onLater = later,
                onLower = { view.ftpW?.let { adjusted = FtpStepper.step(it, -1) } },
                onHigher = { view.ftpW?.let { adjusted = FtpStepper.step(it, 1) } },
                onReset = { view.resetTo?.let { adjusted = it } },
                onFooter = { action ->
                    when (action) {
                        ResultAction.SetFtp -> {
                            val measured = outcome as? RampOutcome.Measured
                            val value = view.ftpW
                            if (measured != null && value != null && !setting) {
                                setting = true
                                scope.launch {
                                    val set = withContext(Dispatchers.IO) { decider.setFtp(rideId, value, measured.computedFtpW, current) }
                                    if (set == null) {
                                        snackMessage = "Couldn't save the FTP on this phone."
                                    } else {
                                        file = withContext(Dispatchers.IO) { files.read(rideId) }
                                        FtpRuntime.kick(this@MainActivity)
                                    }
                                    setting = false
                                }
                            }
                        }
                        ResultAction.Keep -> {
                            val keep = current?.ftpW
                            if (keep != null) {
                                scope.launch {
                                    withContext(Dispatchers.IO) { decider.keep(rideId, keep) }
                                    file = withContext(Dispatchers.IO) { files.read(rideId) }
                                }
                            }
                        }
                        ResultAction.Continue -> {
                            // The cool-down is stopped first; the hand-off it causes is taken back below.
                            engine?.end()
                            scope.launch {
                                withContext(Dispatchers.IO) {
                                    uploads.prepare(rideId, decider.finalFtp(rideId))
                                    try {
                                        rides.markHandedOff(rideId)
                                    } catch (e: java.io.IOException) {
                                        // Not marked: the result comes back on the next open, which is the safe way round.
                                    }
                                }
                                RideRuntime.results.remove(rideId)
                                RideRuntime.enqueue(rideId)
                            }
                        }
                        ResultAction.DiscardTest -> Unit
                    }
                },
                onDiscard = {
                    if (engine != null) engine.discard()
                    scope.launch {
                        withContext(Dispatchers.IO) { rides.delete(rideId) }
                        RideRuntime.results.remove(rideId)
                        go(Routes.START)
                    }
                },
                onStopCooldown = { engine?.end() },
            ),
        )
    }

    @Composable
    private fun BuilderHost(route: Route.Builder, go: (Route) -> Unit) {
        val cache by library.cache.collectAsState()
        val existing = route.editId?.let { id -> cache?.workouts?.firstOrNull { it.id == id } }
        if (route.editId != null && existing == null) {
            LaunchedEffect(route) { go(route.from) }
            return
        }
        // The draft is one string in saved state, so rotation and a killed process keep it. A new
        // workout's id is made once, here, and every retry of its save sends the same one.
        var draftJson by rememberSaveable {
            val first = if (existing != null) {
                Draft.forEdit(existing.id, existing.name, existing.category, existing.description, existing.steps)
            } else {
                Draft.forNew(UUID.randomUUID().toString())
            }
            mutableStateOf(SpinJson.encodeToString(Draft.serializer(), first))
        }
        val draft = remember(draftJson) { SpinJson.decodeFromString(Draft.serializer(), draftJson) }
        var saving by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        val scope = rememberCoroutineScope()
        val put: (Draft) -> Unit = { draftJson = SpinJson.encodeToString(Draft.serializer(), it) }

        BuilderContent(
            draft = draft,
            ftpW = currentFtp()?.ftpW,
            saving = saving,
            error = error,
            actions = BuilderActions(
                onDraft = {
                    error = null
                    put(it)
                },
                onSave = {
                    val problem = draft.problem()
                    if (problem != null) {
                        error = problem.text
                        put(draft.select(problem.selection ?: draft.selected))
                    } else {
                        error = null
                        saving = true
                        scope.launch {
                            when (val outcome = library.save(draft)) {
                                is SaveOutcome.Saved -> go(Route.Detail(outcome.workout.id))
                                is SaveOutcome.Failed -> error = outcome.text
                            }
                            saving = false
                        }
                    }
                },
                onDiscard = { go(route.from) },
                onDelete = {
                    error = null
                    saving = true
                    scope.launch {
                        when (val outcome = library.delete(draft.id)) {
                            DeleteOutcome.Deleted -> go(Routes.START)
                            is DeleteOutcome.Failed -> error = outcome.text
                        }
                        saving = false
                    }
                },
            ),
        )
    }

    @Composable
    private fun DevicesHost(onSettings: () -> Unit) {
        val hubState by hub.state.collectAsState()
        var nowMs by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
        var permissionTick by remember { mutableIntStateOf(0) }

        LaunchedEffect(Unit) {
            while (true) {
                delay(1000)
                nowMs = SystemClock.elapsedRealtime()
            }
        }
        // Devices on screen is what opens connections; leaving it closes them.
        DisposableEffect(Unit) {
            hub.setAttached(true)
            onDispose {
                hub.setAttached(false)
                scanOpen = false
                spinDownOpen = false
            }
        }

        val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            hub.recheck()
            permissionTick++
        }
        val enableBluetooth = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            hub.recheck()
        }

        // The app asks on its own once, the first time Devices opens.
        LaunchedEffect(Unit) {
            if (!BleEnvironment.permitted(this@MainActivity) && !store.autoAsked) {
                store.autoAsked = true
                store.permissionAsked = true
                permissionLauncher.launch(BleEnvironment.PERMISSIONS)
            }
        }

        // The system stops prompting after two denials; its rationale flag going false after we asked is how we tell.
        val canAsk = remember(hubState.permitted, permissionTick) {
            !store.permissionAsked || BleEnvironment.PERMISSIONS.any { shouldShowRequestPermissionRationale(it) }
        }

        DevicesScreen(
            devices = devices,
            hub = hubState,
            nowMs = nowMs,
            permissionCanAsk = canAsk,
            actions = DevicesActions(
                onSettings = onSettings,
                onAddDevice = { scanOpen = true },
                onSpinDown = { spinDownOpen = true },
                onForget = { address ->
                    deviceStore.forget(address)
                    devicesChanged()
                },
                onPick = { address ->
                    deviceStore.pick(address)
                    devicesChanged()
                },
                onMoveUp = { address ->
                    deviceStore.moveUp(address)
                    devicesChanged()
                },
                onMoveDown = { address ->
                    deviceStore.moveDown(address)
                    devicesChanged()
                },
                onFallback = { on ->
                    deviceStore.setFallback(on)
                    devicesChanged()
                },
                onAllow = {
                    store.permissionAsked = true
                    permissionLauncher.launch(BleEnvironment.PERMISSIONS)
                },
                onOpenAppSettings = {
                    startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
                    )
                },
                onTurnOnBluetooth = { enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) },
            ),
        )

        if (scanOpen) {
            ScanSheet(
                devices = devices,
                scanner = scanner,
                canScan = hubState.ready,
                onAdd = { row ->
                    deviceStore.add(SavedDevice(row.address, row.name, row.kind))
                    devicesChanged()
                    scanOpen = false
                },
                onDismiss = { scanOpen = false },
            )
        }
        if (spinDownOpen) {
            SpinDownSheet(hub = hub, onDismiss = { spinDownOpen = false })
        }
    }

}
