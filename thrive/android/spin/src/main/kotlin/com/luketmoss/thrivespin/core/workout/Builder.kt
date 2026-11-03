package com.luketmoss.thrivespin.core.workout

import kotlinx.serialization.Serializable

/** What is selected: a top-level block, or a step inside a repeat. [step] null means the block itself. */
@Serializable
data class Selection(val block: Int, val step: Int? = null)

/** What a draft holds that a save sends, and what "no change since it opened" compares. */
@Serializable
data class DraftContent(
    val name: String,
    val category: String?,
    val description: String,
    val blocks: List<Block>,
)

/** A problem a save stopped on, the words for it, and what to put the person's cursor on. */
data class SaveProblem(val text: String, val field: SaveField, val selection: Selection? = null)

enum class SaveField { Name, Category, Steps }

object Categories {
    val ALL = listOf("Endurance", "Sweet spot", "Threshold", "VO2", "Recovery")
}

/**
 * The builder's draft: plain Kotlin, no Android types, saved as one string across rotation and a
 * killed process. Every change is a new [Draft]. [id] is the workout's own when editing, or for a
 * new workout a UUID made once when the builder opened, so a retry replaces rather than duplicates.
 */
@Serializable
data class Draft(
    val id: String,
    val isNew: Boolean,
    val content: DraftContent,
    val initial: DraftContent,
    val selected: Selection? = null,
) {
    val blocks: List<Block> get() = content.blocks

    val dirty: Boolean get() = content != initial

    fun steps(): StepsV1 = StepsV1(content.blocks)

    // ---- details -------------------------------------------------------------------------------

    fun withName(name: String): Draft = copy(content = content.copy(name = name.take(MAX_NAME)))

    fun withCategory(category: String): Draft = copy(content = content.copy(category = category))

    fun withDescription(text: String): Draft = copy(content = content.copy(description = text.take(MAX_DESCRIPTION)))

    // ---- adding --------------------------------------------------------------------------------

    val canAddBlock: Boolean get() = blocks.size < StepsV1.MAX_BLOCKS

    fun canAddStepInRepeat(block: Int): Boolean {
        val r = blocks.getOrNull(block) as? Repeat ?: return false
        return r.steps.size < StepsV1.MAX_REPEAT_STEPS
    }

    /** "+ Step": "Endurance", 10:00, ERG 65%, at the top level, selected. */
    fun addStep(): Draft {
        if (!canAddBlock) return this
        return withBlocks(blocks + Step("Endurance", 600, StepMode.Erg, pct = 65), Selection(blocks.size))
    }

    /** "+ Repeat": a 4x repeat of "Work" 3:00 ERG 110% and "Recover" 3:00 ERG 50%, the repeat selected. */
    fun addRepeat(): Draft {
        if (!canAddBlock) return this
        val repeat = Repeat(
            4,
            listOf(
                Step("Work", 180, StepMode.Erg, pct = 110),
                Step("Recover", 180, StepMode.Erg, pct = 50),
            ),
        )
        return withBlocks(blocks + repeat, Selection(blocks.size))
    }

    /** "+ Step in repeat": "Recover", 3:00, ERG 50% inside the repeat at [block], selected. */
    fun addStepInRepeat(block: Int): Draft {
        if (!canAddStepInRepeat(block)) return this
        val r = blocks[block] as Repeat
        val next = r.copy(steps = r.steps + Step("Recover", 180, StepMode.Erg, pct = 50))
        return withBlocks(blocks.replaced(block, next), Selection(block, r.steps.size))
    }

    fun select(selection: Selection?): Draft = copy(selected = selection)

    // ---- moving and deleting -------------------------------------------------------------------

    fun canMoveUp(sel: Selection): Boolean = indexIn(sel) > 0

    fun canMoveDown(sel: Selection): Boolean = indexIn(sel) < listSizeFor(sel) - 1

    private fun indexIn(sel: Selection): Int = sel.step ?: sel.block

    private fun listSizeFor(sel: Selection): Int =
        if (sel.step == null) blocks.size else (blocks.getOrNull(sel.block) as? Repeat)?.steps?.size ?: 0

    fun moveUp(sel: Selection): Draft = move(sel, -1)

    fun moveDown(sel: Selection): Draft = move(sel, 1)

    /** Within the step's own list: the top level, or its repeat. A step never leaves or enters a repeat. */
    private fun move(sel: Selection, by: Int): Draft {
        val from = indexIn(sel)
        val to = from + by
        if (from < 0 || to < 0 || to >= listSizeFor(sel)) return this
        if (sel.step == null) {
            return withBlocks(blocks.swapped(from, to), Selection(to))
        }
        val r = blocks[sel.block] as Repeat
        return withBlocks(blocks.replaced(sel.block, r.copy(steps = r.steps.swapped(from, to))), Selection(sel.block, to))
    }

    /**
     * Removes the selected step or repeat. Deleting a repeat's last step removes the repeat. The
     * selection moves to the block before, else the one after, else nothing.
     */
    fun delete(sel: Selection): Draft {
        val block = blocks.getOrNull(sel.block) ?: return this
        if (sel.step != null && block is Repeat) {
            if (sel.step !in block.steps.indices) return this
            val remaining = block.steps.filterIndexed { i, _ -> i != sel.step }
            if (remaining.isNotEmpty()) {
                val next = if (sel.step > 0) sel.step - 1 else 0
                return withBlocks(blocks.replaced(sel.block, block.copy(steps = remaining)), Selection(sel.block, next))
            }
        }
        val remaining = blocks.filterIndexed { i, _ -> i != sel.block }
        val next = when {
            remaining.isEmpty() -> null
            sel.block > 0 -> Selection(sel.block - 1)
            else -> Selection(0)
        }
        return withBlocks(remaining, next)
    }

    // ---- editing the selection -----------------------------------------------------------------

    fun stepAt(sel: Selection?): Step? {
        sel ?: return null
        val block = blocks.getOrNull(sel.block) ?: return null
        return when {
            sel.step == null -> block as? Step
            block is Repeat -> block.steps.getOrNull(sel.step)
            else -> null
        }
    }

    fun repeatAt(sel: Selection?): Repeat? =
        if (sel != null && sel.step == null) blocks.getOrNull(sel.block) as? Repeat else null

    /** Replaces the selected step with [change] applied to it. */
    fun editStep(sel: Selection, change: (Step) -> Step): Draft {
        val current = stepAt(sel) ?: return this
        val updated = change(current)
        val block = blocks[sel.block]
        return if (sel.step == null) {
            withBlocks(blocks.replaced(sel.block, updated), selected)
        } else {
            val r = block as Repeat
            withBlocks(blocks.replaced(sel.block, r.copy(steps = r.steps.replaced(sel.step, updated))), selected)
        }
    }

    fun setLabel(sel: Selection, label: String): Draft =
        editStep(sel) { it.copy(label = label.take(StepsV1.MAX_LABEL)) }

    /** Keeps label, duration and cadence, and sets the new mode's default target. */
    fun setMode(sel: Selection, mode: StepMode): Draft = editStep(sel) { s ->
        when (mode) {
            StepMode.Erg -> s.copy(mode = mode, pct = 65, pctEnd = null, level = null, gradeTenths = null)
            StepMode.Resistance -> s.copy(mode = mode, pct = null, pctEnd = null, level = 30, gradeTenths = null)
            StepMode.Slope -> s.copy(mode = mode, pct = null, pctEnd = null, level = null, gradeTenths = 20)
            StepMode.Free -> s.copy(mode = mode, pct = null, pctEnd = null, level = null, gradeTenths = null)
        }
    }

    fun setDuration(sel: Selection, durS: Int): Draft =
        editStep(sel) { it.copy(durS = durS.coerceIn(1, MAX_DURATION_S)) }

    fun nudgeDuration(sel: Selection, up: Boolean): Draft = editStep(sel) {
        it.copy(durS = nextDuration(it.durS, up))
    }

    fun setPct(sel: Selection, pct: Int): Draft = editStep(sel) { it.copy(pct = pct.coerceIn(0, 300)) }

    fun nudgePct(sel: Selection, up: Boolean): Draft =
        editStep(sel) { it.copy(pct = ((it.pct ?: 65) + if (up) 5 else -5).coerceIn(0, 300)) }

    /** The "Ramp to" checkbox: on adds an end at the target + 20 (capped at 300), off removes `pct_end`. */
    fun setRamp(sel: Selection, on: Boolean): Draft = editStep(sel) {
        if (on) it.copy(pctEnd = ((it.pct ?: 65) + 20).coerceAtMost(300)) else it.copy(pctEnd = null)
    }

    fun setPctEnd(sel: Selection, pct: Int): Draft = editStep(sel) { it.copy(pctEnd = pct.coerceIn(0, 300)) }

    fun nudgePctEnd(sel: Selection, up: Boolean): Draft =
        editStep(sel) { it.copy(pctEnd = ((it.pctEnd ?: 65) + if (up) 5 else -5).coerceIn(0, 300)) }

    fun setLevel(sel: Selection, level: Int): Draft = editStep(sel) { it.copy(level = level.coerceIn(0, 100)) }

    fun nudgeLevel(sel: Selection, up: Boolean): Draft =
        editStep(sel) { it.copy(level = ((it.level ?: 30) + if (up) 5 else -5).coerceIn(0, 100)) }

    fun setGrade(sel: Selection, tenths: Int): Draft =
        editStep(sel) { it.copy(gradeTenths = tenths.coerceIn(-100, 200)) }

    fun nudgeGrade(sel: Selection, up: Boolean): Draft =
        editStep(sel) { it.copy(gradeTenths = ((it.gradeTenths ?: 20) + if (up) 5 else -5).coerceIn(-100, 200)) }

    /** The "Cadence target" checkbox: on is 90 rpm, off removes it. */
    fun setCadenceOn(sel: Selection, on: Boolean): Draft =
        editStep(sel) { it.copy(cadence = if (on) 90 else null) }

    fun setCadence(sel: Selection, rpm: Int): Draft = editStep(sel) { it.copy(cadence = rpm.coerceIn(40, 150)) }

    fun nudgeCadence(sel: Selection, up: Boolean): Draft =
        editStep(sel) { it.copy(cadence = ((it.cadence ?: 90) + if (up) 5 else -5).coerceIn(40, 150)) }

    fun setTimes(block: Int, times: Int): Draft {
        val r = blocks.getOrNull(block) as? Repeat ?: return this
        return withBlocks(blocks.replaced(block, r.copy(times = times.coerceIn(2, StepsV1.MAX_REPEAT))), selected)
    }

    fun nudgeTimes(block: Int, up: Boolean): Draft {
        val r = blocks.getOrNull(block) as? Repeat ?: return this
        return setTimes(block, r.times + if (up) 1 else -1)
    }

    // ---- saving --------------------------------------------------------------------------------

    /** The first thing a save would stop on, in the note's order, or null when it may go. */
    fun problem(): SaveProblem? {
        if (content.name.isBlank()) return SaveProblem("Give the workout a name.", SaveField.Name)
        if (content.category == null) return SaveProblem("Pick a category.", SaveField.Category)
        for (i in content.blocks.indices) {
            val b = content.blocks[i]
            if (b is Step) {
                if (b.label.isBlank()) return SaveProblem("Every step needs a name.", SaveField.Steps, Selection(i))
            } else if (b is Repeat) {
                for (j in b.steps.indices) {
                    if (b.steps[j].label.isBlank()) {
                        return SaveProblem("Every step needs a name.", SaveField.Steps, Selection(i, j))
                    }
                }
            }
        }
        return when (steps().problem()) {
            null -> null
            StepsProblem.TooLong -> SaveProblem("A workout can be at most 6 hours.", SaveField.Steps)
            StepsProblem.TooBig -> SaveProblem("This workout has too many steps to save.", SaveField.Steps)
            else -> SaveProblem("Thrive refused this workout.", SaveField.Steps)
        }
    }

    private fun withBlocks(next: List<Block>, selection: Selection?): Draft =
        copy(content = content.copy(blocks = next), selected = selection)

    companion object {
        const val MAX_NAME = 80
        const val MAX_DESCRIPTION = 1000
        const val MAX_DURATION_S = 14400

        /** A new workout: no name, no category, one "Warm-up" of 10:00 at ERG 55%, selected. */
        fun forNew(id: String): Draft {
            val content = DraftContent(
                name = "",
                category = null,
                description = "",
                blocks = listOf(Step("Warm-up", 600, StepMode.Erg, pct = 55)),
            )
            return Draft(id = id, isNew = true, content = content, initial = content, selected = Selection(0))
        }

        /** An existing workout, as loaded; saving it with no edits serializes equal to what was loaded. */
        fun forEdit(id: String, name: String, category: String, description: String, steps: StepsV1): Draft {
            val content = DraftContent(name, category, description, steps.blocks)
            return Draft(id = id, isNew = false, content = content, initial = content, selected = null)
        }

        /** 0:30 below 5:00 and 1:00 from 5:00, within 0:30 to 240:00. */
        fun nextDuration(durS: Int, up: Boolean): Int {
            val step = if (durS < 300) 30 else 60
            return (if (up) durS + step else durS - step).coerceIn(30, MAX_DURATION_S)
        }
    }
}

private fun <T> List<T>.replaced(index: Int, value: T): List<T> =
    mapIndexed { i, old -> if (i == index) value else old }

private fun <T> List<T>.swapped(a: Int, b: Int): List<T> {
    val out = toMutableList()
    val tmp = out[a]
    out[a] = out[b]
    out[b] = tmp
    return out
}
