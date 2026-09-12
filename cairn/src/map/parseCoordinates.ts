import type { LatLng } from './geo'

/** cairn/docs/design/337-pasting-a-coordinate.md — reading a longitude/
    latitude pair out of the search field.
 *
 * The whole of this module is string → point. It knows nothing about the
 * map, the row that offers the result or the cairn that follows, which is
 * what lets the note's parsing table be a unit test rather than a UI one. */

/** The numeric half of a component: a signed decimal degree, and optional
    minutes and seconds. Four groups, and it appears twice in `COMPONENT`
    below — once either side of the alternation. */
const NUMBER = String.raw`([-+])?(\d+(?:\.\d+)?)\s*[°º]?(?:\s*(\d+(?:\.\d+)?)\s*['′])?(?:\s*(\d+(?:\.\d+)?)\s*(?:["″]|''))?`

/** One component of a pair, with its hemisphere letter on whichever side it
    was written — `N 47.6205` or `47.6205 N`.
 *
 * **An alternation rather than two optional groups**, because the two
 * optional groups parse `N 47.6205 W 122.3493` wrongly and cannot be talked
 * out of it: the first component's trailing letter matches the `W` that
 * belongs to the second, the overall match succeeds, and there is no
 * failure for the engine to backtrack out of. Making the branches exclusive
 * is what forces the `W` to be read as the second component's own. */
const COMPONENT = String.raw`(?:([NSEWnsew])\s*${NUMBER}|${NUMBER}\s*([NSEWnsew])?)`

/** Capture groups per `COMPONENT`: the leading letter, four for the leading
    form's number, four for the trailing form's, and the trailing letter. */
const COMPONENT_GROUPS = 10

/** Comma, whitespace, or a comma with whitespace either side. A coordinate
    copied off a web page routinely arrives with a newline in it, which
    `\s` covers. */
const SEPARATOR = String.raw`(?:\s*,\s*|\s+)`

/** A third value — an altitude, from a GPX or a KML `<coordinates>` — is
    matched so the pair still parses, and then ignored. cairn has nowhere to
    put it. */
const ALTITUDE = String.raw`(?:${SEPARATOR}[-+]?\d+(?:\.\d+)?)?`

const PAIR = new RegExp(`^${COMPONENT}${SEPARATOR}${COMPONENT}${ALTITUDE}$`)

const LAT_LETTERS = 'NS'

interface Component {
  /** Decimal degrees, sign applied. */
  value: number
  /** `'lat'`, `'lng'`, or `null` when no hemisphere letter said which. */
  axis: 'lat' | 'lng' | null
}

/** The point a query describes, or `null` if it does not describe one.
 *
 * `null` is the ordinary answer — most queries are names — so this is a
 * predicate as much as a parser, and it never throws or reports *why* a
 * string failed. There is nowhere to show that: the note's design is that a
 * query which is not a coordinate simply has no coordinate row, because a
 * row that explained itself would be a parse error in a search field. */
export function parseCoordinate(query: string): LatLng | null {
  const match = PAIR.exec(query.trim())
  if (!match) return null

  const first = component(match, 0)
  const second = component(match, COMPONENT_GROUPS)
  if (!first || !second) return null

  const pair = orient(first, second)
  if (!pair) return null

  // The range check is last because `orient` may have swapped the pair to
  // reach it — the whole point of the swap rule is that `-122, 47` is in
  // range once read the way its own magnitudes say it must be.
  if (Math.abs(pair.lat) > 90 || Math.abs(pair.lng) > 180) return null
  return pair
}

/** Which value is the latitude.
 *
 * Hemisphere letters answer it outright when they are there. When they are
 * not, latitude comes first — every source a coordinate is copied *from*
 * writes it that way — except where the first value's magnitude exceeds 90,
 * which a latitude cannot do. That one case catches the genuinely
 * longitude-first paste (GeoJSON, a KML `<coordinates>`, a PostGIS query)
 * without a setting and without asking.
 *
 * A pair inside ±90 both ways is ambiguous and is read latitude first.
 * There is no fix for that available from the string, which is why the
 * result row shows the parse back to the user. */
function orient(first: Component, second: Component): LatLng | null {
  if (first.axis && second.axis) {
    // Two letters that name the same axis — `N … S`, `E … W` — is not a
    // pair, whichever order they came in.
    if (first.axis === second.axis) return null
    return first.axis === 'lat'
      ? { lat: first.value, lng: second.value }
      : { lat: second.value, lng: first.value }
  }

  // One letter is enough: it names its own component, and the other is
  // whatever is left.
  if (first.axis) {
    return first.axis === 'lat'
      ? { lat: first.value, lng: second.value }
      : { lat: second.value, lng: first.value }
  }
  if (second.axis) {
    return second.axis === 'lat'
      ? { lat: second.value, lng: first.value }
      : { lat: first.value, lng: second.value }
  }

  if (Math.abs(first.value) > 90 && Math.abs(second.value) <= 90) {
    return { lat: second.value, lng: first.value }
  }
  return { lat: first.value, lng: second.value }
}

/** One matched component as a signed decimal degree, or `null` if its parts
    contradict each other.
 *
 * Reads the match by offset rather than by named arguments: the two
 * components are the same ten groups twice over, and passing ten positional
 * strings per side was its own kind of bug. */
function component(match: RegExpExecArray, offset: number): Component | null {
  const leading = match[offset + 1]
  // Which branch of `COMPONENT`'s alternation matched decides where the
  // number is. Exactly one of them did.
  const inLeadingForm = leading !== undefined
  const base = offset + (inLeadingForm ? 2 : 6)
  const letter = (leading ?? match[offset + 10])?.toUpperCase()

  const sign = match[base]
  const degrees = match[base + 1]
  const minutes = match[base + 2]
  const seconds = match[base + 3]

  // "A hemisphere letter and a sign that disagree — `N -47.6205` — is not a
  // coordinate. Two statements of the sign that contradict each other have
  // no correct reading, and guessing one is how a cairn ends up in the
  // wrong hemisphere." A `+` is not a disagreement; only a `-` is.
  if (letter && sign === '-') return null

  const minutesValue = minutes === undefined ? 0 : Number(minutes)
  const secondsValue = seconds === undefined ? 0 : Number(seconds)
  // Sixty minutes is a degree. A component that states otherwise is not a
  // coordinate written badly, it is something else being read as one.
  if (minutesValue >= 60 || secondsValue >= 60) return null
  // Seconds without minutes is not a notation anyone writes; the regex can
  // match it only from a string that meant something else.
  if (seconds !== undefined && minutes === undefined) return null

  const magnitude = Number(degrees) + minutesValue / 60 + secondsValue / 3600
  const negative = sign === '-' || letter === 'S' || letter === 'W'

  return {
    value: negative ? -magnitude : magnitude,
    axis: letter === undefined ? null : LAT_LETTERS.includes(letter) ? 'lat' : 'lng',
  }
}

/** How a parsed point is written back to the user.
 *
 * "Five decimal places, always, including trailing zeros." That is ~1.1 m —
 * finer than any paste is honest about and coarse enough to stay on one
 * line. Fixed width matters more than brevity: the label's job is to let
 * the user check at a glance that the pair was read the way they meant, and
 * a number whose length changes is harder to scan than one whose length
 * does not. */
export function formatCoordinate(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
}
