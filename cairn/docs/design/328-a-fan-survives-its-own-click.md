# 328 — a fan survives its own click

An expanded cluster is a way of browsing several cairns at one viewpoint. It
should last as long as the browsing does.

Standing documents: [cairns.md](cairns.md) (markers, selection),
[shell-and-content-model.md](shell-and-content-model.md) (selection dimming, the
column and the sheet), [design-language.md](design-language.md) (motion, the
reduced-motion rule). Prior notes:
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md) — **the
note this revises**; its geometry, its test and its zoom-to-fit branch all
stand — [302-revealing-a-cairn-closes-in.md](302-revealing-a-cairn-closes-in.md)
(the camera move a member click now causes),
[251-linked-hover.md](251-linked-hover.md) (what a fanned marker deliberately
does not do), [55-photo-list-lightbox.md](55-photo-list-lightbox.md) (Escape and
the close control).

## Why

> *"When expanding a group of cairns, clicking on 1 closes the grouping. It
> should stay open until the user does something else like zoom, move, etc at
> which time it should collapse."*

#194 collapsed the fan on a member click, reasoning that the detail face was
opening and the fan had done its job. It had not: a cluster is several photos
from one viewpoint, and looking at one is nearly always a prelude to looking at
the next. Every next one costs a re-expansion.

## What this revises in #194

Its **Collapsing** list, and only that. Two entries change:

> - ~~**Clicking one of its own markers.** The detail face is opening; the fan
>   has done its job.~~ **Withdrawn.**
> - **Any camera move** — now **any camera move the *user* made**.

Everything else in #194 is untouched: the test, zoom-to-fit, the ring geometry,
`--fan-radius`, the leader lines, the anchor at `opacity: 0.4`, the non-draggable
fanned marker, and every one of its edge cases.

## Whose camera move it was

#194's reason for collapsing on a camera move is exactly right and is not being
weakened: **a fan is arranged around the anchor's position on screen, and a fan
that lags the camera is worse than no fan.** What changes is that a fan is no
longer required to die of a move it caused.

```
user drags / scrolls / zooms / resets  ──→  collapse   (#194, unchanged)
the reveal a member click triggers     ──→  re-lay-out around the new anchor
```

The reveal is a move the app makes in response to a click inside the fan. It is
part of the same gesture, so the fan re-lays-out against the anchor's new screen
position rather than collapsing — the markers travel to their new spots over
`--motion-base`, the same motion the expansion itself uses, and the leader lines
follow.

**This is safe by construction, not by luck.** A fan only exists when #194's
test says its members do not separate at `CLUSTER_MAX_ZOOM`, and #302's reveal
closes in to exactly that zoom. The cluster still exists after the move, with
the same members, so there is always something to re-lay-out around.

## The main path

1. A cluster of four photos at one viewpoint. The user clicks the badge; it
   fans, per #194.
2. The user clicks the second marker. That cairn is selected and its detail face
   opens, per #194's one-click rule.
3. The camera closes in on that cairn, per #302. **The fan stays open** and
   re-lays-out around the anchor's new position.
4. The selected member takes its selected treatment; every other marker on the
   map dims, per `shell-and-content-model.md`. The other fanned members are part
   of the fan, not part of the dimming — they stay full strength, because they
   are the thing the user is browsing.
5. The user clicks a third marker. Same again, no re-expansion.
6. The user drags the map. The fan collapses.

## States

Extends #194's table; only the new and changed rows are given.

| State | Cluster badge | Members |
|---|---|---|
| Fanned, one member selected | `opacity: 0.4` | Selected member at its selected treatment; the fan's other members at full strength; every marker outside the fan dimmed |
| Fanned, a member's detail face open | `opacity: 0.4` | As above. The fan is drawn against the visible area, so on desktop it is not behind the column and on a phone not behind the sheet |
| Fanned, app-initiated camera move | `opacity: 0.4`, at its new position | Re-laid-out over `--motion-base` |
| Fanned, user camera move | Restored | Collapsed (#194, unchanged) |
| Fanned, detail face closed | `opacity: 0.4` | Still fanned; the last-opened member still reads as selected |

## Edge cases

- **The fan's new position puts a member under the column or the sheet.** The
  reveal centres the cairn in the visible area (#302, #312), so the anchor is
  already inside it; a member can still fall outside at the fan's radius.
  Accepted, exactly as #194 accepts a fan near the viewport edge — the camera is
  not moved to accommodate a fan, because moving the camera is what collapses
  one. This note does not create an exception to that.
- **The detail face is closed.** The fan is still open. Closing a face is not a
  camera move and not a decision to leave the viewpoint.
- **Escape while a member's detail face is open.** #55's rule wins first: the
  face closes. A second Escape collapses the fan. One key, one thing at a time,
  outermost last.
- **A member is opened, then the same member clicked again.** Selection does not
  change, so no reveal fires (#302) and nothing re-lays-out. The face stays open.
- **The reveal does not move the camera** — the map was already centred on that
  cairn and closer than the close-up zoom. Nothing re-lays-out either. The fan
  simply stays as it is.
- **A member is deleted, or filtered out by a facet, while the fan is open.**
  #194's rule, unchanged: re-space over `--motion-base`, and collapse when one
  member is left.
- **The cluster stops existing** because its members separated. The fan is gone
  and the markers are ordinary markers. Nothing needs to collapse — there is
  nothing left to collapse.
- **A flyover starts while a fan is open.** Collapse. A flyover is a camera the
  user handed over deliberately, which makes it their move, not the app's.
- **`Reset view`.** Collapse, for the same reason.
- **The map switches into 3D while a fan is open.** Collapse. #273 owns cairns
  in 3D and there is no fan there.
- **Reduced motion.** The re-layout is instant, matching #194's instant
  expansion and collapse.
- **Touch.** A tap is the click. Nothing about the rule differs on a phone; the
  sheet rising over the detail face is not a camera move.

## Copy

**None added.** The fanned badge's `aria-label` stays `n cairns, expanded`, and
each member keeps its cairn's name. A fan that persists needs no more explaining
than one that did not — if anything, less.

## New tokens

None. `--fan-radius` and `--motion-base` both already exist and both keep their
meaning.
