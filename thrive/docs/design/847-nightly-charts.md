# 847 — The nightly brief's charts at any width

Specifies [#847](https://github.com/luketmoss/keel/issues/847), a fix to the page in
[829-nightly-brief.md](829-nightly-brief.md). That note still holds for what the page says; this one covers how its
charts are drawn. There are no new tokens, and the page's JSON does not change.

## Width

Every chart draws to `CW`, the cards' inner width in CSS pixels at load, worked out as the morning brief's timeline
does: the window's width, capped at 960, less 64 for the page and card padding, and at least 300. One drawing unit is
then about one pixel, so 10px text stays 10px on a phone and on a desktop. A window resized after load scales the
drawing, as the morning brief's does.

## Tonight timeline

The drawing gets 10 units taller and the hour labels move under the axis line, clear of it.

## The day ribbon

Top to bottom:

1. **`now` and `bed`.** With both, the earlier one's label sits left of its line and the later one's right of its line,
   so they cannot overlap, whichever comes first. With only `now`, it stays centred. With only `bed`, it stays left of
   its line.
2. **Labels.** Each session and timed event is named over the start of its bar, in time order. A label that would touch
   the one before it, or run past the ribbon's right end, is left out. The Training card and the key still say what it
   was. This is #829's "labelled where they fit": a bar is often too narrow to hold its label on a phone, so the labels
   sit in their own row rather than inside the bars.
3. **The two lanes,** unchanged.
4. **The hours:** 6a, 9a, 12p, 3p, 6p and 9p, centred under their place on the lanes.
5. **The dry stretch,** when there is one, below the hours.

## Next 5 days

Each strip draws to its row's width, inside the day's 12px padding. The hour labels above are drawn on the same scale,
so 5a and 9p sit over those marks on the strip.
