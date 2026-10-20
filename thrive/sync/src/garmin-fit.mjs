// What the Garmin FIT import (#510) needs to know about one FIT file: is it an
// activity, when did it start, and does it hold a usable position. Nothing
// here returns or logs a coordinate.

import { Decoder, Stream } from '@garmin/fitsdk';
import { decodePositions, TrackUnreadableError } from './track.mjs';

/** A usable position count below this is no map (as buildTrack's own floor). */
export const MIN_POSITIONS = 2;

/**
 * @param {Buffer} bytes
 * @returns {{ kind: 'unreadable' } | { kind: 'other', type: string }
 *   | { kind: 'activity', startMs: number, positions: number }}
 *   `kind: 'other'` is every FIT that is not an activity (monitoring and
 *   wellness files: the export has ~28,000). `startMs` is the session start.
 */
export function inspectFit(bytes) {
  let messages;
  try {
    const decoder = new Decoder(Stream.fromBuffer(bytes));
    if (!decoder.isFIT()) return { kind: 'unreadable' };
    messages = decoder.read({ convertDateTimesToDates: true }).messages;
  } catch {
    return { kind: 'unreadable' };
  }
  const type = String(messages?.fileIdMesgs?.[0]?.type ?? '');
  if (type !== 'activity') return { kind: 'other', type };

  const start = messages.sessionMesgs?.[0]?.startTime ?? messages.fileIdMesgs[0].timeCreated;
  const startMs = start instanceof Date ? start.getTime() : NaN;
  if (!Number.isFinite(startMs)) return { kind: 'unreadable' };

  let positions = 0;
  try {
    positions = decodePositions(bytes).length;
  } catch (err) {
    if (!(err instanceof TrackUnreadableError)) throw err;
    return { kind: 'unreadable' };
  }
  return { kind: 'activity', startMs, positions };
}
