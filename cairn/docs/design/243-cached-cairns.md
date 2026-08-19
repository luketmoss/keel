# 243 — Cached cairns on a trip

Tokens from [design-language.md](design-language.md). The cairn model is
normative in [cairns.md](cairns.md); ownership in
[shell-and-content-model.md](shell-and-content-model.md). This note extends
the cache stance set by
[59-drive-backed-trip-storage.md](59-drive-backed-trip-storage.md) and the
load states set by [35-trip-detail-view.md](35-trip-detail-view.md), and
inherits [73-disconnected-read-only.md](73-disconnected-read-only.md)
unchanged.

## The rule

**A cairn read from cache is a cairn. It is not a preview of one.**

There is no "refreshing", no shimmer, no stale badge, no toast when the
revalidation lands. #59 already made this call for trip metadata — cached
data renders normally and Drive catches up in the background — and cairns
gaining a cache is that stance covering one more thing, not a new state.

The reason to restate it here is that cairns are the surface where the
temptation is strongest: fifty markers appearing instantly *feels* like it
should be announced. It should not. The user opened a trip they were looking
at ninety seconds ago; the correct acknowledgement of that is speed and
silence.

## Main path

1. Open a trip whose cairns are cached.
2. Markers, clusters, list rows and facet chips render immediately from the
   cache — full opacity, fully interactive, indistinguishable from a
   Drive-loaded trip. Thumbnails resolve from `photoImageCache` as they
   always have.
3. The Drive read runs behind them, invisibly.
4. It settles. In the overwhelmingly common case nothing on screen changes.
   Where it does, see **Reconciliation**.

## States

**Cached** — the main path above. Nothing distinguishes it visually from a
trip that just finished loading from Drive, and nothing should.

**Cold (no cache for this trip)** — unchanged from today, which is #35's
**Fetching**: no markers, no list rows, no placeholder rows reserved. The
first-ever open of a trip on a device still waits, and that is correct — it
has nothing truthful to show.

**Cached-empty is not cold.** A trip whose cached set is legitimately empty
renders the existing "no cairns" empty state immediately, rather than sitting
in Fetching until the Drive read confirms it. The two are different facts and
the cache knows which one it holds; conflating them would make an empty trip
the slowest thing in the app.

**Revalidating** — has no appearance. Named here only so it is clear it was
considered and deliberately given none.

**Revalidation failed** — the cached cairns stay exactly as they are, no
message. Consistent with #35's "leave whatever was already rendered in
place", and with the fact that the user has lost nothing: what they are
looking at is what the last successful read said. A Drive failure that
matters — an expired token — already surfaces through #72's `Reconnect`
affordance, and does not need a second voice down here.

**Disconnected** — cached cairns render and are readable, thumbnails included
where their bytes are already in `photoImageCache`; those that are not show
the existing `--surface-lift` fallback fill, the same one used today for a
thumbnail that is still loading or has failed. Every mutating affordance is
already disabled by #73, and its `Sign in to edit this trip.` in the metadata
header remains the single explanation for the surface. **No new copy.** The
alternative — hiding cached cairns when signed out — is rejected for the same
reason #73 rejects clearing the cache on sign-out: it makes the user's own
data vanish to protect them from nothing.

## Reconciliation

What happens when the Drive read disagrees with the cache, while the user is
looking at it.

**A cairn appeared** (added on another device) — it is simply there, with no
entrance animation. Cairn markers have none today: the only animation in
`CairnLayer.css` is the cluster fan-out's `cairn-layer-fan-in`, and an
imported cairn appears without one. Inventing an entrance here would make
the rare cross-device case more conspicuous than the normal one, which is
backwards. No count animation, no scroll, no map movement.

**A cairn changed** (name, icon, position, image) — it updates in place,
without animation, including position. #158 animates a *revert* over
`--motion-base` because there the user made the move and needs to see it
undone; nobody performed this move on this device, so there is no gesture to
answer.

**A cairn is gone** (deleted on another device) — it is removed. Silently,
with no tombstone row and no message. This is deliberately *not* #35's
missing-file treatment: that state exists because the trip's own index still
claims the file, so the discrepancy is real and worth showing. Here Drive is
the index, and Drive says the cairn does not exist — there is nothing
inconsistent to report, only a cache that was briefly behind.

Two cases where a removal touches something the user is holding:

- **The removed cairn was selected.** Selection clears. The map does not
  move, re-fit, or re-cluster around the gap beyond the ordinary re-cluster.
- **The removed cairn was open in the lightbox.** The lightbox closes and
  focus returns to the element that opened it — the existing
  `returnFocusRef` path, identical to dismissing it with Escape. No error
  copy. A photo the user deleted elsewhere closing quietly is a smaller
  surprise than an explanation of a thing they already know.

**Bounds are not re-fit by reconciliation.** The map's bounds-fit is driven
by tracks and settles once per load (#35); cairns arriving from cache, or
changing under revalidation, never move the camera. A trip that visibly
re-framed itself a second after opening would undo everything the cache
bought.

## Edge cases

- **Rapid in-and-out.** Leaving and reopening a trip repeatedly renders from
  cache each time and issues a revalidation each time. Nothing is queued,
  debounced, or skipped; the reads are cheap after #242 and correctness
  beats cleverness here.
- **The cache is wrong about everything.** A cached set with no overlap with
  Drive's resolves to Drive's, in one replacement, not as fifty removals and
  fifty additions animating past each other. The reconciliation is a set
  replacement that happens to animate the differences.
- **A trip deleted while its cairns are cached.** The cache entry goes with
  the trip. Nothing renders a cairn belonging to a trip that no longer
  exists.
- **Fifty cairns from cache.** Clustering runs on the cached set exactly as
  it runs on a loaded one; the user should not be able to tell which they are
  looking at. This is the criterion the whole note serves.

## New tokens

None.
