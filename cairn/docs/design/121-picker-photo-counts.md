# 121 — the picker's photo counts

The picker's shape, position and purpose are normative in
[shell-and-content-model.md](shell-and-content-model.md); its states and copy
are in [110-loose-tracks-and-photos.md](110-loose-tracks-and-photos.md); tokens
are in [design-language.md](design-language.md).

Nothing here changes the picker's layout. This note decides one thing: **what a
count says when it does not know the answer.**

## The counts

Right-aligned in each option, monospace face, `--text-xs`, `--text-muted`, as
the standing document already specifies.

```
Add to a trip                    Cancel
＋ New trip…
─────────────────────────────────────
● Larapinta Trail            4T · 128P
● Overland Track               3T · 0P
○ Kokoda Track                      1T
```

Three rows, three different facts:

| Row | Reads | Means |
|---|---|---|
| Larapinta Trail | `4T · 128P` | 4 tracks, 128 photos |
| Overland Track | `3T · 0P` | 3 tracks, and genuinely no photos |
| Kokoda Track | `1T` | 1 track; nobody has counted its photos |

**The photo half is omitted, not filled with a placeholder.** `0P`, `—P` and
`?P` were all considered. `0P` is the bug. `—P` and `?P` both spend a glyph
telling the user about the app's bookkeeping, which is not a thing they can act
on and not a thing they asked about. Omitting it says the same thing quietly:
this row knows one number and shows one number.

Ragged is not a concern — the counts are right-aligned, so a short one still
ends flush with the rest.

## It heals by being used

A trip's photos are counted when its detail is opened, so an unknown count
becomes known the first time the user visits that trip. The picker is not where
counts are gathered, and never blocks on gathering one.

That means a fresh install shows `nT` for every trip until each is opened, and
converges on full counts through ordinary use. **This is deliberate rather than
tolerated:** the alternative — counting every trip up front — costs one Drive
round trip per trip at exactly the moment the app is trying to become usable.

There is no loading state in the picker and no count that changes while it is
open. Whatever the index holds when the picker opens is what it shows.

## Edge cases

**A trip whose count is stale.** Photos added on another device are not
reflected until this device opens the trip. The count is a cache and is allowed
to be behind; `origin` already is, for the same reason. It does not get a
freshness indicator — a number with an asterisk is harder to read than a number.

**A count of zero on a trip that has never held photos.** Reads `0P`, correctly.
The distinction from an uncounted trip is invisible to the user by design: one
says "no photos", the other says nothing, and both are true.

**A trip created from the picker's `New trip…`.** It goes straight into the
move, so it is never rendered as a row here. Nothing to count.

**A trip whose photo index fails to read.** The count stays whatever it already
was, including unknown. A failed read is not evidence of zero photos, and
writing one would be the original bug with extra steps.

**Screen readers.** The count is decorative shorthand and its meaning is not
recoverable from `4T · 128P` read aloud. Each option's accessible name spells it
out: `Larapinta Trail, 4 tracks, 128 photos`, or `Kokoda Track, 1 track` when
the photo count is unknown. Singulars are used at one — `1 track`, `1 photo`.

## Copy

| Case | Visible | Accessible name |
|---|---|---|
| Both counts known | `4T · 128P` | `<name>, 4 tracks, 128 photos` |
| No photos | `3T · 0P` | `<name>, 3 tracks, no photos` |
| Photos not counted | `1T` | `<name>, 1 track` |

## New tokens

None.
