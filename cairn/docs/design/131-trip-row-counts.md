# 131 — counts on the trip row

The row's anatomy, its glyph and its meta line are normative in
[shell-and-content-model.md](shell-and-content-model.md); the `null`-versus-zero
rule for a photo count is settled in
[121-picker-photo-counts.md](121-picker-photo-counts.md); tokens are in
[design-language.md](design-language.md).

This note decides one thing the standing document leaves implicit: **what the
meta line says when a number is missing, and where the status goes once it is no
longer a word.**

## The main path

```
● Larapinta Trail                             ⋮
  12 – 19 Jun 2023 · 4 tracks · 128 photos

○ Kokoda Track                                ⋮
  Sep 1 – 10 · 1 track
```

Name at `--text-base`, meta line beneath it at `--text-sm` in `--text-muted`,
unchanged. The numerals are in the monospace face with `font-variant-numeric:
tabular-nums`, per the language's rule for every numeral in the app — a count
that changes must not shift the row's width.

The separator is ` · ` — the same middot the line already uses between the date
range and the status, and the same one `looseMetaLine` uses.

## The three parts

| Part | Source | Missing when |
|---|---|---|
| Date range | `formatTripDateRange(startDate, endDate)` | never — it has its own copy for no dates |
| Track count | `getOverview(id)?.features.length ?? 0` | never |
| Photo count | the index entry's cached `photoCount` | it is `null` — nobody has counted |

**Only the photo half can go missing, and when it does the whole segment goes,
separator included.** `Sep 1 – 10 · 1 track`, not `Sep 1 – 10 · 1 track · `. This
is the picker's rule from #121 restated for a wider row: the row shows the
numbers it knows and says nothing about the ones it does not.

`— photos`, `? photos` and `0 photos` were all considered and all rejected for
#121's reasons. `0 photos` is the original bug; the other two spend words on the
app's bookkeeping, which is neither something the user asked about nor something
they can act on.

## Words here, letters in the picker

The picker reads `4T · 128P`; the row reads `4 tracks · 128 photos`. They differ
deliberately and the standing document specifies both.

A picker option is one line inside a bounded `--panel-width` column, sits in a
stack of near-identical options, and is scanned as a column of numbers — the
shorthand is what makes that column readable. A list row has the width, is read
once, and is the home screen. It gets the words.

Both spell themselves out for a screen reader (below), so the shorthand costs
nothing there either.

## Status is the dot, not a word

The word `planned` / `completed` leaves the line.

The standing document already says the row's glyph is the marker — same shape,
same colour, same status treatment, drawn smaller — and the marker's status
treatment is filled `--accent` for completed, hollow for planned. A row that
draws the status and then also writes it is spending the width the counts need
to say something it has already said.

| Status | Dot |
|---|---|
| Completed | Filled `--accent`, `--dot-ring` |
| Planned | Hollow — `--dot-ring` in `--accent`, no fill |

Unchanged from what ships today; only the word goes.

### The accessible name carries it instead

The dot is `aria-hidden`, so dropping the word would drop the status entirely
for anyone not looking at the dot. The row's link takes an explicit accessible
name, the way `tripChoiceLabel` does for the picker:

> `Larapinta Trail, completed, 12 – 19 Jun 2023, 4 tracks, 128 photos`

Commas rather than middots — a middot read aloud is noise. The parts that are
absent visually are absent here too: an uncounted trip's name ends after its
track count.

## States

| State | Meta line |
|---|---|
| Full | `12 – 19 Jun 2023 · 4 tracks · 128 photos` |
| Photos never counted | `12 – 19 Jun 2023 · 4 tracks` |
| Genuinely no photos | `12 – 19 Jun 2023 · 4 tracks · 0 photos` |
| No tracks yet | `12 – 19 Jun 2023 · 0 tracks · 0 photos` |
| No dates set | `No dates set · 4 tracks · 128 photos` |
| One of each | `12 Jun 2023 · 1 track · 1 photo` |
| Hydrating | Whatever the index holds; rows fade in, no spinner |
| Disconnected | No rows at all — #95 withholds the list |

**Singulars at one.** `1 track`, `1 photo`. Same rule the picker's accessible
name already follows.

**An empty trip reads `0 tracks · 0 photos`, not a special empty state.** An
empty trip is a plan, not a mistake — #110 already settled that — and a row that
switched to `Nothing in it yet` would be a third convention for the same fact.

## Edge cases

**A trip that has never been opened, on a fresh device.** Its overview hydrates
with every other trip on `connect()`, so the track count is real from first
paint. Its photo count does not — `photos.json` is only read when the trip is
opened — so the row shows a track count and no photo count until then, and
fills in through ordinary use. This asymmetry is the reason #121's cache exists
for photos and not for tracks, and the row inherits it rather than papering over
it.

**The first paint before `connect()` resolves.** Rows render from the local
index with whatever counts it holds — the previous session's, or none. They do
not render a placeholder and then swap: a number that appears and then changes
is worse than a number that appears late, and the standing document's loading
state is already "rows fade in as the index hydrates; no spinner".

**A count that is wrong.** #130 covers the one way it goes wrong on purpose (a
photo moved into a closed trip). Beyond that, the count is a cache and is
allowed to be behind, exactly as `origin` is. It gets no freshness indicator —
a number with an asterisk is harder to read than a number.

**A very long name.** Unchanged: the name truncates with an ellipsis and carries
a `title`. The meta line is short by construction and does not compete with it.

**A trip mid-import.** The counts update when the underlying data does, with no
intermediate "importing…" line. The trip face is where import progress lives,
and #75 already owns that surface.

## Copy

| Case | Visible | Accessible name |
|---|---|---|
| Full | `12 – 19 Jun 2023 · 4 tracks · 128 photos` | `<name>, completed, 12 – 19 Jun 2023, 4 tracks, 128 photos` |
| Photos uncounted | `12 – 19 Jun 2023 · 4 tracks` | `<name>, planned, 12 – 19 Jun 2023, 4 tracks` |
| No photos | `12 – 19 Jun 2023 · 4 tracks · 0 photos` | `<name>, planned, 12 – 19 Jun 2023, 4 tracks, no photos` |
| Singulars | `12 Jun 2023 · 1 track · 1 photo` | `<name>, planned, 12 Jun 2023, 1 track, 1 photo` |
| No dates | `No dates set · 4 tracks · 128 photos` | `<name>, completed, no dates set, 4 tracks, 128 photos` |

`no photos` rather than `0 photos` in the accessible name, matching
`tripChoiceLabel`'s existing wording for the same case.

## Transitions

None. The meta line is text that changes when its data changes; there is no
animation on a count, and `--motion-fast` colour transitions on the row's hover
state are untouched.

## New tokens

None.
