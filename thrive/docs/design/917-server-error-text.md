# #917 — Spin shows Thrive's error text

Amends the answer table in `769-spin-save.md` for the two server-error rows, and only those. Every other state, string
and layout there stands.

## What changes

The ride summary's status card already draws `extraLines` as wrapped `--text-sm` lines in `textSecondary` under the
three steps (`RideSummaryScreen`). The server's text goes there, as the **first** extra line, so it is never truncated:
the step 3 note stays one short line.

| State | Step 3 label · note (unchanged) | Extra lines, in order |
|---|---|---|
| `queued`, `last_failure: server`, text stored | "Waiting to send to Thrive" · "Thrive answered with an error · trying again" | "Thrive said: <text>" · "Last try <time>. It sends by itself when there's a connection." |
| `stuck`, text stored | "Thrive keeps answering with an error" | "Thrive said: <text>" · "It stopped trying." |
| either, no text stored | as today | as today |
| `queued`, `last_failure: offline` | as today | as today (no "Thrive said") |
| while sending | as today: no extra lines | — |

`<text>` is the stored `message` verbatim, with no quoting, trimming or ellipsis beyond the cap below. Choosing
"Thrive said:" over bare text keeps it clear whose words these are: Spin's own lines are advice, and this is a quote.

## Storage

- `message` holds the server's `error` from the latest server error, trimmed, capped at **500** characters (a cut
  ends at 500 with no ellipsis). Thrive's texts are fixed sentences well under that, and the cap only guards the
  card against something unexpected.
- A server error with a blank or missing `error` clears `message`, so an older text is never shown for a newer
  failure.
- A network failure clears it: the card then says "sends when online", and an old server text beside that would
  mislead.
- Success deletes the ride as today. A refusal writes its own text, as today.
- "Send now" leaves it in place until the next answer replaces or clears it. "Try again" on a `stuck` ride already
  resets its counters and `last_failure` (#769), and clears it with them, so the card reads as a fresh queue.

## Edge cases

- **Very long text**: wraps over as many lines as it needs. The card grows, and the summary already scrolls.
- **An old `upload.json`** from before this change, with `last_failure: server` and no `message`, reads as today.
- **The FTP sheet** is untouched (#917's Out of Scope).

## New tokens

None.
