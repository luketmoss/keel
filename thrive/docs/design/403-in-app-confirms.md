# 403 — In-app confirms that name what's destroyed

Every `window.confirm` in Thrive becomes Thrive's own `ConfirmModal`, asking
about the specific thing and labelling the button with the specific action.

Standing documents this answers to: the Keel-wide rules
(`ui/docs/design/keel-wide-rules.md`, #401) — destructive actions confirm and
say what they destroy in words, never through the browser's `confirm()` — and
the suite language (`ui/docs/design/suite-language.md`, #400) for tokens. Both
are cited as paths, not links, because neither exists until its issue merges.

## The dialog

`ConfirmModal` (`frontend/src/components/shared/confirm-modal.tsx`) already
does the hard parts, and they do not change:

- a bottom sheet on a phone, centred from 480px wide (`.modal-content`);
- `role="dialog"`, `aria-modal`, labelled by its title;
- focus moves to **Cancel** on open (the safe choice), Tab stays inside,
  Escape cancels, a tap on the overlay cancels, and focus returns to the
  control that opened it (`use-modal-focus.ts`, #319/#339).

Its anatomy, top to bottom:

1. **Title** — the question, naming the thing. `--text-lg`, bold.
2. **Message** — what goes with it, and whether it can be undone.
   `--color-text-secondary`.
3. **Actions** — `.form-actions`: **Cancel** (`.btn-secondary`) then the
   confirming button: `.btn-danger` for anything destructive, `.btn-primary`
   for the one that isn't.

Two changes to the component:

- `confirmLabel` becomes **required**. Its `'Delete'` default is how a bare
  "Delete" ends up on a dialog that should say "Delete Template".
- The title wraps rather than truncating, and an unbroken name breaks anywhere
  (`overflow-wrap: anywhere`). The name is the point of the dialog; an
  ellipsis would hide the part that tells two similar workouts apart.

Touch targets: `.btn` sets `min-height: 48px` (read from `global.css`, the
`.btn` rule), above the suite's 44px, so the buttons need nothing.

## Copy

Questions in sentence case; button labels in Title Case, which is Thrive's
existing button convention ("Delete Workout", "Discard Changes" are already
on screen). Names in straight double quotes, as the exercise confirm already
does. Dates through `shortDate` in `frontend/src/day/format.ts` ("Sat 12 Sep
2026").

**A workout's name.** Its `name` when not blank; otherwise its type's label
plus "workout" — "Bike workout". Never an empty pair of quotes; the fallback
is unquoted.

**Counts.** "1 logged set", "N logged sets". When the count is zero the clause
is left out entirely — never "0 logged sets go with it". A logged set is one
the tracker shows as logged, whether written to the sheet or waiting in the
offline queue.

### Destructive

| Site | Title | Message | Confirm |
|---|---|---|---|
| Delete a workout (`workout-detail.tsx`, `simple-workout.tsx`) | Delete "Push Day"? | Sat 12 Sep 2026 · its 18 logged sets go with it. This can't be undone. | Delete Workout |
| Delete a template (`template-detail.tsx`, `template-editor.tsx`) | Delete the template "Push Day"? | Its 6 exercises go with it. Workouts you've logged from it are kept. This can't be undone. | Delete Template |
| Delete an exercise (`exercises-screen.tsx`) | Delete "Bench Press" from your exercises? | This can't be undone. | Delete Exercise |
| Remove an exercise from the workout (`workout-tracker.tsx`) | Remove "Bench Press" from this workout? | Its 4 logged sets are deleted. | Remove Exercise |
| Discard the workout in progress (`workout-tracker.tsx`) | Discard this workout? | Its 12 logged sets are deleted, and it won't appear in your activities. | Discard Workout |
| Replace sets with last time (`workout-tracker.tsx`, only when last time has fewer) | Replace your 5 "Bench Press" sets with last time's 3? | 2 sets are removed, and the rest take last time's weights and reps. | Replace Sets |
| Discard unsaved edits (`workout-tracker.tsx` edit mode, `workout-planner.tsx` ×2, `template-editor.tsx`, `simple-workout.tsx`, `edit-workout-form.tsx`) | Discard your changes? | Your edits to this workout won't be saved. — or "this template", "this plan", matching what the screen edits | Discard Changes |
| Delete a label (`manage-labels-screen.tsx`, already a `ConfirmModal`) | Delete the label "Push"? | 7 exercises use it and will lose it. This can't be undone. | Delete Label |

The Cancel label is **Cancel** everywhere except Discard unsaved edits, where
it is **Keep Editing** — "Cancel" next to "Discard Changes" reads as two ways
of throwing the edits away.

With a zero count, the workout message is "Sat 12 Sep 2026. This can't be
undone.", the template message drops its first sentence, removing an exercise
drops its message (title and buttons only), and discarding a workout reads
"It won't appear in your activities."

### Not destructive

| Site | Title | Message | Confirm | Cancel |
|---|---|---|---|---|
| Finish with unsynced sets (`workout-tracker.tsx`) | Finish with 2 unsynced sets? | They're saved on this phone and will sync next time you open Thrive. | Finish Anyway | Not Yet |

`.btn-primary`, not `.btn-danger`: nothing is lost, and a red button would
teach that red means "fine, go ahead".

## The main path

1. The person taps a destructive control — Delete Workout, say.
2. The dialog opens with its title, message and buttons; focus is on Cancel.
3. They tap Delete Workout.
4. The dialog closes at once, and exactly what the browser confirm's "OK" used
   to trigger runs: the control's busy label ("Deleting..."), the write, the
   success or error toast, the navigation.

## States

| State | What is shown |
|---|---|
| Closed | Nothing. |
| Open | As above. The screen behind is unchanged and not interactive. |
| Confirmed | The dialog is gone; the screen's own busy state takes over. The dialog has no spinner of its own — it never waits on the network. |
| Cancelled (Cancel, Escape, overlay) | The dialog is gone; nothing was changed; focus is back on the opener. |
| The write fails | Unchanged from today: the action's existing error toast. The dialog does not reopen. |

## Edge cases

- **Rapid repeat.** A second tap on the opener while the dialog is open lands
  on the overlay and cancels — it does not stack a second dialog. A double tap
  on the confirming button runs the action once: the first tap unmounts the
  dialog, and every action already guards its own busy state.
- **The thing disappears while the dialog is open** (a sync replaced the
  workout list). Confirming runs the action as today, which already handles a
  missing row with its error toast.
- **Counts change while open** (a queued set flushes). The dialog shows the
  counts at the moment it opened; it does not live-update.
- **Very long names** wrap, as above.
- **Offline or an expired session.** No change: the action fails or queues
  exactly as it does after a browser confirm today.

## Transitions

The dialog uses `.modal-content`'s existing entrance. Nothing new animates.
Its behaviour under reduced motion is outside this issue (#404 and the
Keel-wide reduced-motion rule).

## New tokens

None.
