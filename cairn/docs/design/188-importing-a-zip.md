# 188 — Importing a zip

Import pipeline, progress rows and failure rows from
[75-trip-import-feedback.md](75-trip-import-feedback.md). Drop overlay from
[4-file-import.md](4-file-import.md). Loose drops from
[81-drop-to-draft.md](81-drop-to-draft.md). Attaching a photo to an existing
cairn from [157-photo-onto-a-cairn.md](157-photo-onto-a-cairn.md). Tokens from
[design-language.md](design-language.md).

A zip introduces no new surface. It reuses the progress row and the failure row
exactly as they are, and every string below is written to sit in one of those
two. **No new tokens.**

## The idea

**A zip is a bag of files, and dropping the bag means dropping the files.**
Expansion happens at the doorway, before anything else looks at what arrived,
so every downstream behaviour — partitioning, EXIF, interpolation, the
placement queue, the draft trip, duplicate refusal — is reached in exactly the
state it would have been reached in had the user unzipped to disk and dragged
the folder.

That is the whole design. What follows is mostly the consequences of holding to
it, plus the two places it cannot be held to.

## The main path

1. User drops `photos.zip` on the trip, or picks it through **Import files**.
2. The archive's directory is read — this is instant, no decompression — and
   its importable entries counted.
3. A progress row appears: `photos.zip — 1 of 30`, advancing as each entry is
   decompressed.
4. The row disappears. The existing per-file import progress takes over:
   `IMG_1234.jpg — 1 of 30`, and the import proceeds exactly as a 30-photo
   drop does today.

Two consecutive progress runs both counting to 30 is intentional and reads
correctly, because the label differs: the unpacking row carries the archive's
name, the import rows carry each photo's. Suppressing the first would leave a
large archive looking like a drop the app ignored, which is the failure
[75-trip-import-feedback.md](75-trip-import-feedback.md) exists to prevent.

## What counts as an entry

| Entry | Outcome |
|---|---|
| `.jpg` `.jpeg` `.png` `.webp` | imported as a photo |
| `.kml` `.kmz` | imported as a track |
| `.heic` `.heif` | rejected, with #51's message — see below |
| `__MACOSX/…`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, any dot-prefixed name, any directory entry | skipped silently |
| a nested `.zip` | skipped, reported once |
| anything else | skipped silently |

**Silence is correct inside an archive, and wrong outside one.** A direct drop
names every unrecognised file because the user hand-picked each one, so a file
that does not import is a surprise worth reporting. Nobody hand-picks the
contents of a zip. Naming `notes.txt` and `receipt.pdf` from an archive the
user grabbed whole is noise about files they never claimed to be importing.

The `__MACOSX/` row is not tidiness. Every zip made on macOS carries
`__MACOSX/._IMG_1234.jpg` beside each photo — a name that ends in `.jpg`, that
`isPhotoFile` accepts, and that cannot decode. Without the filter, every macOS
zip produces one cairn and one failure per photo.

## States

### Unpacking

The existing progress row, same form as an import: `photos.zip — 12 of 30`.
Present only while entries are being decompressed; the directory read that
precedes it is fast enough to have no state of its own.

### Nothing importable

> **photos.zip** — no photos or tracks in this archive

One row. The archive is not a file the app "cannot identify" — it was read
fine, it simply held nothing cairn wants — so this does not reuse the
unrecognised-type copy, which would misdescribe what happened.

### Too many entries

> **photos.zip** — archives are limited to 100 files; this one has 340

Reported after the directory read and **before any decompression**, so an
oversized archive costs nothing to refuse. The number is named in both
directions because "too many" without the limit gives the user nothing to act
on — knowing it is 340 against 100 tells them to split it in four.

The cap exists because every entry is materialised in memory before the import
runs. It is a real constraint, not a policy, and the message does not pretend
otherwise by scolding.

### Corrupt or unreadable

> **photos.zip** — could not be read as a zip archive

Other files in the same drop still import. An archive that fails to open takes
nothing down with it.

### A nested archive

> **inner.zip** — archives inside archives aren't unpacked

One row, only when a nested archive is present. Recursion is not supported and
silence here would look like a successful import of files that never arrived.

### HEIC inside a zip

Keeps #51's message, which tells the user how to fix it:

> **IMG_4021.HEIC** — iPhone HEIC photos aren't supported. In iOS, Settings →
> Camera → Formats → Most Compatible.

**This is the one place the design knowingly leaves a rough edge.** A zip
straight off an iPhone produces that row once per photo — a hundred identical
messages from one gesture. Collapsing a uniformly-failing batch into a single
row is the right answer and belongs to the per-file failure model rather than
here; this note flags it because a zip is the input most likely to expose it,
and records that the rough edge was seen rather than missed.

### Signed out

Unchanged from [75-trip-import-feedback.md](75-trip-import-feedback.md): no
overlay while disconnected, and a drop that lands anyway produces one batch
row. **The archive is not opened** — the connection is checked first, so a
refused drop costs no decompression, and the count in the row is the archive
itself:

> **1 file** — sign in to add files to this trip

## Edge cases

**A zip dropped while a cairn's detail is open.** The drop is aimed at that
cairn, so it attaches rather than imports — but a cairn takes one photo, and
today each extra file emits its own toast. Thirty toasts from one drop is not
acceptable, so the archive case collapses them:

> photos.zip — a cairn takes one photo; the other 29 weren't added

The first photo in directory order is attached. Directory order rather than
name order, because a zip records the order files were added and that is
usually the order they were selected; sorting would be a second opinion the
user did not ask for.

**A zip of tracks dropped outside a trip.** Opens the draft trip, exactly as
dropping those KMLs would. The bag-of-files rule holds and there is nothing to
special-case.

**A zip of photos and tracks together, outside a trip.** Photos import loose,
tracks open the draft. Same split as a mixed direct drop, reached by the same
code.

**A `.kmz`.** Still a track, never expanded. A KMZ *is* a zip, so expansion
keys on the `.zip` extension by name and never on the bytes — otherwise every
KMZ drop would be flattened into its inner KML and its own parser would never
see it.

**Two zips in one drop.** Both expand, both contribute to one import. The
unpacking rows appear one per archive.

**A zip whose photos duplicate the trip's.** Refused by name, per
[75-trip-import-feedback.md](75-trip-import-feedback.md)'s duplicate rule,
which the expanded files reach unchanged. A zip dragged in twice does not
double the trip.

**Folder structure inside the zip.** Flattened. Cairns have no folder concept,
so nothing could be done with it. Two photos with the same name in different
folders both import — ids are generated, and the name is only a row label.

## Copy changes

The unrecognised-file lines name the archive now, so a user who drops a `.zip`
before knowing it works learns it from the same place they learn about `.kml`:

Loose, in `useLooseImport.ts`:

> cairn takes .kml or .kmz tracks, JPEG, PNG or WebP photos, and .zip archives

In a trip, per [75-trip-import-feedback.md](75-trip-import-feedback.md):

> trips take .kml or .kmz tracks, JPEG, PNG or WebP photos, and .zip archives

The file input's `accept` gains `.zip`.

## What deliberately does not change

**The drop overlay's copy.** It still reads `Drop tracks or photos`. The
overlay is a moment of action, not a place to teach file formats, and
`Drop tracks, photos or archives` spends the user's attention mid-gesture on
something they either already know or will learn from the rejection row. The
empty-state line — `Drop tracks or photos anywhere, or use Import files above.`
— is unchanged for the same reason.

**Everything after the doorway.** No new progress model, no new failure model,
no archive-shaped grouping in the list. An imported zip leaves no trace: the
cairns it produced are indistinguishable from the same photos dropped loose,
which is the point of expanding at the doorway rather than carrying the
archive further in.
