package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.ftp.FtpBanner
import com.luketmoss.thrivespin.core.library.LibraryScreen
import com.luketmoss.thrivespin.core.library.LibraryView
import com.luketmoss.thrivespin.core.library.PlannedCard
import com.luketmoss.thrivespin.core.library.RideWorkout
import com.luketmoss.thrivespin.core.upload.PendingBanner
import com.luketmoss.thrivespin.core.workout.WorkoutText
import com.luketmoss.thrivespin.core.workout.Zone
import java.time.LocalDate

class LibraryActions(
    val onOpenWorkout: (id: String) -> Unit,
    val onOpenSettings: () -> Unit,
    val onRetry: () -> Unit,
    val onPullRefresh: () -> Unit,
    val onSearch: (String) -> Unit,
    val onCategory: (String?) -> Unit,
)

/**
 * The Library tab: title, search, category chips, today's planned Spin workouts, the list, and the
 * states of the design note's table. [pulling] shows the pull-to-refresh indicator, only when the
 * person pulled.
 */
@Composable
fun LibraryContent(
    state: LibraryScreen,
    search: String,
    category: String?,
    today: LocalDate,
    pulling: Boolean,
    actions: LibraryActions,
    /** #769: the rides that are not finished with, under the title and above the search. */
    banner: PendingBanner? = null,
    onBanner: () -> Unit = {},
    /** #770: the FTP changes not yet in Thrive, above the rides' banner. */
    ftpBanner: FtpBanner? = null,
    onFtpBanner: () -> Unit = {},
    /** #770: the ramp test card's line ("FTP 262 W · set 7 Nov by a ramp test"), and what a tap does. */
    rampCardLine: String = "",
    onRampTest: () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg),
    ) {
        SpinText(
            "Library",
            Tokens.TEXT_2XL,
            modifier = Modifier.padding(start = Tokens.spaceMd, end = Tokens.spaceMd, top = Tokens.spaceMd, bottom = Tokens.spaceSm),
            color = spin.text,
            weight = FontWeight.Bold,
        )
        PendingFtpBanner(ftpBanner, onFtpBanner)
        PendingRidesBanner(banner, onBanner)
        when (state) {
            LibraryScreen.NotSetUp -> MessageBlock(
                "Set up Spin first",
                "Add the API URL and key in Settings.",
                action = { FilledAction("Open settings", actions.onOpenSettings) },
            )
            LibraryScreen.Loading -> Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Tokens.spaceLg),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
            ) {
                CircularProgressIndicator(color = spin.primary)
                SpinText("Loading the library…", Tokens.TEXT_SM, color = spin.textSecondary)
            }
            is LibraryScreen.Failed -> MessageBlock(
                "Couldn't load the library.",
                state.reason.text,
                action = { FilledAction("Try again", actions.onRetry) },
            )
            is LibraryScreen.Ready -> ReadyContent(state, search, category, today, pulling, actions, rampCardLine, onRampTest)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReadyContent(
    state: LibraryScreen.Ready,
    search: String,
    category: String?,
    today: LocalDate,
    pulling: Boolean,
    actions: LibraryActions,
    rampCardLine: String,
    onRampTest: () -> Unit,
) {
    if (state.notice != null) {
        SpinText(
            state.notice,
            Tokens.TEXT_XS,
            modifier = Modifier.padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceXs),
            color = spin.textSecondary,
        )
    }
    if (state.empty != LibraryScreen.Empty.NoWorkouts) {
        SearchField(search, state.placeholder, actions.onSearch)
        Spacer(Modifier.size(Tokens.spaceSm))
        CategoryChips(category, actions.onCategory)
    }
    PullToRefreshBox(
        isRefreshing = pulling,
        onRefresh = actions.onPullRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Tokens.spaceMd, end = Tokens.spaceMd, top = Tokens.spaceSm, bottom = Tokens.spaceLg),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            items(state.planned) { card ->
                PlannedCardView(card, actions.onOpenWorkout)
            }
            item { RampTestCard(rampCardLine, onRampTest) }
            when (state.empty) {
                LibraryScreen.Empty.NoWorkouts -> item {
                    MessageBlock("No workouts yet", "Build one with the Build tab.")
                }
                LibraryScreen.Empty.NothingMatches -> item {
                    MessageBlock(
                        "No workouts match.",
                        null,
                        action = {
                            TextAction("Clear filters", {
                                actions.onSearch("")
                                actions.onCategory(null)
                            })
                        },
                    )
                }
                null -> {
                    item {
                        SpinText(state.heading, Tokens.TEXT_BASE, color = spin.text, weight = FontWeight.Bold)
                    }
                    items(state.cards, key = { it.id }) { w ->
                        WorkoutCardView(w, today) { actions.onOpenWorkout(w.id) }
                    }
                }
            }
            if (state.unreadable != null) {
                item {
                    SpinText(state.unreadable, Tokens.TEXT_XS, color = spin.textSecondary)
                }
            }
        }
    }
}

@Composable
private fun SearchField(value: String, placeholder: String, onChange: (String) -> Unit) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        textStyle = TextStyle(color = spin.text, fontSize = Tokens.TEXT_BASE.sp),
        cursorBrush = SolidColor(spin.primary),
        modifier = Modifier
            .padding(horizontal = Tokens.spaceMd)
            .fillMaxWidth()
            .heightIn(min = SpinSizes.TAP_TARGET.dp)
            .clip(Tokens.radiusLg)
            .background(spin.surface)
            .border(1.dp, spin.border, Tokens.radiusLg),
        decorationBox = { inner ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = SpinSizes.TAP_TARGET.dp)
                    .padding(start = Tokens.spaceMd),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painterResource(R.drawable.ic_search),
                    contentDescription = null,
                    tint = spin.textSecondary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(Tokens.spaceSm))
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        SpinText(placeholder, Tokens.TEXT_BASE, color = spin.textSecondary, maxLines = 1)
                    }
                    inner()
                }
                if (value.isNotEmpty()) {
                    IconButton(onClick = { onChange("") }, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                        Icon(
                            painterResource(R.drawable.ic_close),
                            contentDescription = "Clear search",
                            tint = spin.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                } else {
                    Spacer(Modifier.width(Tokens.spaceMd))
                }
            }
        },
    )
}

@Composable
private fun CategoryChips(selected: String?, onSelect: (String?) -> Unit) {
    val options: List<String?> = listOf<String?>(null) + LibraryView.CATEGORIES
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .selectableGroup()
            .semantics { contentDescription = "Category" },
        contentPadding = PaddingValues(horizontal = Tokens.spaceMd),
        horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items(options) { option ->
            Chip(option ?: "All", option == selected, { onSelect(option) })
        }
    }
}

@Composable
private fun PlannedCardView(card: PlannedCard, onOpen: (String) -> Unit) {
    val onFill = spin.onFill
    val workout = card.workout
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Tokens.radiusLg)
            .background(spin.primaryFill)
            .then(
                if (workout != null) {
                    Modifier.clickable(role = Role.Button, onClick = { onOpen(workout.id) })
                } else {
                    Modifier
                },
            )
            .padding(Tokens.spaceMd),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SpinText(
                "PLANNED TODAY · FROM THRIVE",
                Tokens.TEXT_XS,
                modifier = Modifier.weight(1f),
                color = onFill,
                weight = FontWeight.Bold,
            )
            if (workout != null) {
                Icon(painterResource(R.drawable.ic_chevron), contentDescription = null, tint = onFill, modifier = Modifier.size(20.dp))
            }
        }
        if (workout == null) {
            SpinText(card.planName, Tokens.TEXT_XL, color = onFill, weight = FontWeight.Bold)
            SpinText("This workout isn't in the library.", Tokens.TEXT_SM, color = onFill)
        } else {
            SpinText(workout.name, Tokens.TEXT_XL, color = onFill, weight = FontWeight.Bold)
            WorkoutProfile(
                steps = workout.steps,
                intensityPct = 100,
                height = SpinSizes.PROFILE_SM,
                paint = { zone: Zone? ->
                    if (zone != null && zone.ordinal >= Zone.Z4.ordinal) onFill else onFill.copy(alpha = SpinSizes.OPACITY_DISABLED)
                },
            )
            val e = workout.estimates
            SpinText(
                "${WorkoutText.total(workout.totalS)}   TSS ${e.tss}   IF ${e.ifText}",
                Tokens.TEXT_SM,
                color = onFill,
            )
        }
    }
}

@Composable
private fun WorkoutCardView(w: RideWorkout, today: LocalDate, onClick: () -> Unit) {
    val e = w.estimates
    val total = WorkoutText.total(w.totalS)
    val description = "${w.name}, ${w.category}, $total, TSS ${e.tss}"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Tokens.radiusLg)
            .background(spin.surface)
            .border(1.dp, spin.borderSoft, Tokens.radiusLg)
            .semantics(mergeDescendants = true) { contentDescription = description }
            .clickable(role = Role.Button, onClick = onClick)
            .padding(Tokens.spaceMd),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SpinText(w.name, Tokens.TEXT_BASE, modifier = Modifier.weight(1f), color = spin.text, weight = FontWeight.Bold, maxLines = 2)
            Spacer(Modifier.width(Tokens.spaceSm))
            SpinText(total, Tokens.TEXT_SM, color = spin.textSecondary, weight = FontWeight.SemiBold, maxLines = 1)
        }
        WorkoutProfile(steps = w.steps, intensityPct = 100, height = SpinSizes.PROFILE_SM)
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm), verticalAlignment = Alignment.CenterVertically) {
            SpinText(w.category, Tokens.TEXT_XS, color = spin.primaryText, weight = FontWeight.SemiBold, maxLines = 1)
            SpinText("TSS ${e.tss}", Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 1)
            SpinText("IF ${e.ifText}", Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 1)
            SpinText(LibraryView.lastRidden(w.lastRiddenDate, today), Tokens.TEXT_XS, color = spin.textSecondary, maxLines = 1)
        }
    }
}
