package com.luketmoss.thrivespin

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.net.Uri
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
import com.luketmoss.thrivespin.core.library.DeleteOutcome
import com.luketmoss.thrivespin.core.library.LibraryInputs
import com.luketmoss.thrivespin.core.library.LibraryModel
import com.luketmoss.thrivespin.core.library.LibraryStates
import com.luketmoss.thrivespin.core.library.LibraryView
import com.luketmoss.thrivespin.core.library.SaveOutcome
import com.luketmoss.thrivespin.core.workout.DetailState
import com.luketmoss.thrivespin.core.workout.Draft
import com.luketmoss.thrivespin.core.workout.PlaceholderRideStarter
import com.luketmoss.thrivespin.data.OkHttpTransport
import com.luketmoss.thrivespin.data.SpinStore
import com.luketmoss.thrivespin.ui.BuilderActions
import com.luketmoss.thrivespin.ui.BuilderContent
import com.luketmoss.thrivespin.ui.DetailActions
import com.luketmoss.thrivespin.ui.DetailContent
import com.luketmoss.thrivespin.ui.DevicesActions
import com.luketmoss.thrivespin.ui.DevicesScreen
import com.luketmoss.thrivespin.ui.LibraryActions
import com.luketmoss.thrivespin.ui.LibraryContent
import com.luketmoss.thrivespin.ui.ScanSheet
import com.luketmoss.thrivespin.ui.SettingsScreen
import com.luketmoss.thrivespin.ui.SpinDownSheet
import com.luketmoss.thrivespin.ui.SpinShell
import com.luketmoss.thrivespin.ui.SpinTheme
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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

    private var devices by mutableStateOf(DeviceState())
    private var scanOpen by mutableStateOf(false)
    private var spinDownOpen by mutableStateOf(false)

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
        library = LibraryModel(
            persistence = store.libraryCache,
            transport = OkHttpTransport,
            config = { store.savedUrl() to store.savedKey() },
        )

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

    @Composable
    private fun SpinApp() {
        var encoded by rememberSaveable { mutableStateOf(Routes.encode(Routes.START)) }
        val route = Routes.decode(encoded)
        val go: (Route) -> Unit = { encoded = Routes.encode(it) }
        var search by rememberSaveable { mutableStateOf("") }
        var category by rememberSaveable { mutableStateOf<String?>(null) }
        val snackbar = remember { SnackbarHostState() }
        val scope = rememberCoroutineScope()
        val starter = remember { PlaceholderRideStarter { message -> scope.launch { snackbar.showSnackbar(message) } } }

        Box(modifier = Modifier.fillMaxSize()) {
            when (route) {
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
                        )
                        AppTab.Devices -> DevicesHost(onSettings = {
                            scanOpen = false
                            spinDownOpen = false
                            go(Route.Settings(AppTab.Devices))
                        })
                    }
                }
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
    ) {
        val cache by library.cache.collectAsState()
        val refreshing by library.refreshing.collectAsState()
        val failure by library.failure.collectAsState()
        var pulling by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        // Whenever Library is shown, at most once a minute, and on a pull.
        LaunchedEffect(Unit) { library.refresh(force = false) }

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
        )
    }

    @Composable
    private fun DetailHost(route: Route.Detail, starter: PlaceholderRideStarter, go: (Route) -> Unit) {
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
        val ftpW = cache?.ftpW
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
            ftpW = cache?.ftpW,
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
