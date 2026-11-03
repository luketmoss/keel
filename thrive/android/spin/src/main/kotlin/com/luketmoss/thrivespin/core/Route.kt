package com.luketmoss.thrivespin.core

/** The two tabs that have a bottom bar. Build is an action, not a tab: it opens the builder. */
enum class AppTab(val wire: String) {
    Library("library"),
    Devices("devices"),
}

/**
 * Where the app is, as a value that survives rotation and a killed process by being one string
 * ([Routes.encode]). The bar shows on the tabs only; detail, the builder and Settings are full screen.
 */
sealed interface Route {
    data class Tab(val tab: AppTab) : Route

    /** [from] is the tab Settings was opened from, which back returns to. */
    data class Settings(val from: AppTab) : Route

    data class Detail(val workoutId: String) : Route

    /** #770: the ramp test's intro. Back returns to Library. */
    data object RampIntro : Route

    /** [editId] is null for a new workout. [from] is where closing returns to. */
    data class Builder(val editId: String?, val from: Route) : Route
}

object Routes {
    val START: Route = Route.Tab(AppTab.Library)

    fun encode(route: Route): String = when (route) {
        is Route.Tab -> "tab:${route.tab.wire}"
        is Route.Settings -> "settings:${route.from.wire}"
        is Route.Detail -> "detail:${route.workoutId}"
        Route.RampIntro -> "ramp"
        is Route.Builder -> "builder:${route.editId.orEmpty()}|${encode(route.from)}"
    }

    /** Anything it cannot read is the start screen. */
    fun decode(text: String?): Route {
        if (text == null) return START
        return when {
            text.startsWith("tab:") -> tab(text.removePrefix("tab:"))?.let { Route.Tab(it) } ?: START
            text.startsWith("settings:") -> tab(text.removePrefix("settings:"))?.let { Route.Settings(it) } ?: START
            text == "ramp" -> Route.RampIntro
            text.startsWith("detail:") -> text.removePrefix("detail:").takeIf { it.isNotEmpty() }?.let { Route.Detail(it) } ?: START
            text.startsWith("builder:") -> {
                val rest = text.removePrefix("builder:")
                val bar = rest.indexOf('|')
                if (bar < 0) {
                    START
                } else {
                    val from = decode(rest.substring(bar + 1))
                    Route.Builder(rest.substring(0, bar).ifEmpty { null }, if (from is Route.Builder) START else from)
                }
            }
            else -> START
        }
    }

    private fun tab(wire: String): AppTab? = AppTab.entries.firstOrNull { it.wire == wire }
}
