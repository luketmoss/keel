# 344 — An HEIC photo is refused when it is chosen, not after it is placed

cairn never decodes HEIC (a recorded decision in `CLAUDE.md`), and it already
refuses one with a good message. This note moves the moment of refusal to the
earliest one there is, so the user is never asked to place a photo that will be
thrown away.

Standing documents this answers to: [`cairns.md`](cairns.md) (a cairn with no
position is never written, which is why an un-placed photo waits in a queue),
and the failure-row rule from [75](75-trip-import-feedback.md): every chosen or
dropped file produces a visible outcome. Specified against cairn as it stands on
`main` (after #338 and #339).

## The rule

**A file cairn cannot read is refused before anything is asked of the user for
it.** Position resolution and the placement queue come after the refusal, never
before.

## What changes, by path

| Path | Where the refusal shows | Today |
|---|---|---|
| A drop or pick into an open trip | a failure row for the file, in the import panel's list, with the message | the file waits in the placement queue and is refused after it is placed |
| A drop or pick with no trip open | a toast, with the message | the same wait, then the refusal |
| A photo inside a zip, on either path | as the path above (the archive is expanded first) | as above |
| A photo chosen on a cairn's own face | its error line, immediately | already correct (#339), unchanged |

Per file or once per batch: each surface keeps what it already does for a
refused photo. The trip path has one failure row per file and the loose path one
toast per file, so several HEIC files give several rows or toasts. No new
batching is designed here; it would be a third rule beside #75's and #120's.

## States

| Batch | Result |
|---|---|
| Only HEIC files | each refused with the message; nothing placed, nothing queued, no upload |
| HEIC plus a JPEG with EXIF GPS | the JPEG imports and is placed; the HEIC is refused |
| HEIC plus a JPEG with no GPS | the JPEG waits in the placement queue as today; the HEIC is refused and is not in the queue |
| HEIC plus tracks | the tracks import; the HEIC is refused |
| Signed out, loose path | unchanged: the signed-out message (#120), once; the files are not looked at |

## Edge cases

- **Case.** `IMG_4423.HEIC` and `.HeIf` are refused the same way (`isPhotoFile`
  already lowercases).
- **A renamed file.** A `.jpg` that is really HEIC is not detected; the check is
  by name, as `validateImageFile` is. Out of scope.
- **The progress line.** A refused file is not counted as "placed" or "needs a
  location", so the summary line reads only about files cairn accepted.
- **Rapid repeat.** Dropping the same HEIC twice gives two refusals, as two
  drops of any refused file do.

## Copy

Unchanged, from `validateImageFile`:

> iPhone HEIC photos aren't supported. In iOS, Settings → Camera → Formats →
> Most Compatible.

The failure row reads `<file name>` then this message, as other failure rows do.
No new strings.

## New tokens

None.
