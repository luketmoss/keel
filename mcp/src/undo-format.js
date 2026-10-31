// What thrive_undo and hive_undo print (#412). The apps do the undoing and the
// checking; this only words their answers, the same way for both.

const HOME_ZONE = 'America/Denver';

/** `YYYY-MM-DD HH:MM` in the home zone, from an ISO instant. */
export function denverStamp(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return String(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(when);
  const get = (type) => parts.find((p) => p.type === type).value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

/**
 * The newest `limit` calls as lines, one per call:
 * `<call_id> · <YYYY-MM-DD HH:MM America/Denver> · <actions> · <n> rows`.
 *
 * `entries` are the app's log rows, in any order, as `{ call_id, at, action }`.
 * A call's time is its first row's, and its rows are everything the call wrote,
 * so a call that touched forty set rows says so. Rows with no call id are left
 * out: nothing could be undone by naming them.
 */
export function listCalls(entries, limit = 20) {
  const calls = new Map();
  for (const e of entries) {
    if (!e.call_id) continue;
    let call = calls.get(e.call_id);
    if (!call) {
      call = { id: e.call_id, first: e.at, last: e.at, actions: [], rows: 0 };
      calls.set(e.call_id, call);
    }
    if (e.at < call.first) call.first = e.at;
    if (e.at > call.last) call.last = e.at;
    if (!call.actions.includes(e.action)) call.actions.push(e.action);
    call.rows += 1;
  }
  return [...calls.values()]
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .slice(0, limit)
    .map((c) => `${c.id} · ${denverStamp(c.first)} America/Denver · ${c.actions.join(', ')} · ${c.rows} rows`);
}

const show = (value) => (value === '' || value === undefined || value === null ? '(blank)' : JSON.stringify(value));

/**
 * Fields whose raw value no tool output may carry, shown as a placeholder.
 * Thrive's Workouts!AD `trails` (#688) holds trail names and passes: an undo
 * says only that it changed or that it is set.
 */
const MASKED = { trails: '(trail tags)' };

/** `row` with every MASKED field that holds a value replaced by its placeholder. */
export function maskRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const [f, label] of Object.entries(MASKED)) {
    if (out[f] !== undefined && out[f] !== null && out[f] !== '') out[f] = label;
  }
  return out;
}

/** `a=1, b=2` from a key object. */
export const keyText = (key) => Object.entries(key ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');

/** The fields that differ between two rows, as `field: "a" → "b"`. */
function differences(current, restore) {
  const fields = [...new Set([...Object.keys(current), ...Object.keys(restore)])];
  const [a, b] = [maskRow(current), maskRow(restore)];
  return fields
    .filter((f) => current[f] !== restore[f])
    .map((f) => (f in MASKED && a[f] === b[f] ? `${f}: changed` : `${f}: ${show(a[f])} → ${show(b[f])}`));
}

/** The first few set fields of a row, for a row that exists on only one side. */
function brief(row) {
  const set = Object.entries(maskRow(row)).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  return set.slice(0, 4).map(([k, v]) => `${k}=${show(v)}`).join(', ');
}

/** `current → restored` for one row of an undo: a field diff, or the row that appears or goes. */
export function describeRowChange(current, restore) {
  if (current && restore) return differences(current, restore).join('; ') || '(identical)';
  if (!current && restore) return `(missing) → ${brief(restore)}`;
  if (current && !restore) return `${brief(current)} → (removed)`;
  return '(nothing)';
}
