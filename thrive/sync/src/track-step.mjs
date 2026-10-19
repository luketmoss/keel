// The run's track step (#432): for every outdoor activity whose FIT is stored,
// build its simplified GPS track, keep it in Drive and hand the row its
// `track_ref`.
//
// No COROS request is ever made here, so the FIT allowance is untouched. The
// FIT comes from the bytes the run just downloaded, otherwise from Drive by its
// `fit_ref`. A track is rebuilt only when its FIT changed (`fit_fetched_at`
// differs from the one the track was built from) or the format `version` went
// up; a run with nothing changed downloads nothing and writes nothing.
//
// `track_ref` is blank for every case without a map: no coordinates, fewer
// than two valid positions, an unreadable FIT, a FIT not fetched yet. The app
// does not need to know why.
//
// No coordinate appears in a log line, a note or an error: the messages here
// name the activity ID only.

import { DriveError } from './drive.mjs';
import { DriveAuthError } from './errors.mjs';
import { hasStartCoordinates } from './normalize-activity.mjs';
import { redact } from './redact.mjs';
import { buildTrack, TRACK_VERSION, TrackUnreadableError } from './track.mjs';

/** What the row holds for an archive `track` record: sync-owned AC. */
export const trackSheetFields = (record) => ({ track_ref: record?.status === 'stored' ? record.file_id : '' });

/** The track needs no work: built from this FIT, by this format version. */
const settled = (record, fitFetchedAt) =>
  !!record && record.version === TRACK_VERSION && record.fit_fetched_at === fitFetchedAt;

/** The track step's account, counts only, so it is safe in a summary-mode log. */
export function trackSummary(step) {
  const c = step.counts;
  return (
    `Tracks: ${c.built} built, ${c.rebuilt} rebuilt, ${c.none} none, ${c.unreadable} unreadable, ${c.failed} failed.`
  );
}

/**
 * @param {{ archive: object, startedAt: string, log?: (line: string) => void }} opts
 */
export function createTrackStep({ archive, startedAt, log = console.log }) {
  const counts = { built: 0, rebuilt: 0, none: 0, unreadable: 0, failed: 0 };
  const failures = [];
  const notes = [];

  const fail = (message) => {
    counts.failed += 1;
    failures.push(message);
    log(`  FAILED ${message}`);
  };

  /** Record the outcome in the archive file; false (and a failure) when that cannot be done. */
  async function record(fileId, activityId, track) {
    try {
      await archive.writeTrack(fileId, track);
      return true;
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      fail(`activity ${activityId}: track not recorded in the archive: ${redact(err.message || String(err))}`);
      return false;
    }
  }

  /**
   * @param {{ activityId: string, fileId: string, record: object | undefined,
   *   fitRef: string, fitFetchedAt: string, listEntry: object, localDate: string,
   *   bytes?: Buffer }} activity
   *   `fitRef` and `fitFetchedAt` are what the row holds for the FIT after this
   *   run's FIT step, which is the FIT this track is built from.
   * @returns {Promise<{ track_ref: string }>}
   */
  async function ensure({ activityId, fileId, record: current, fitRef, fitFetchedAt, listEntry, localDate, bytes }) {
    // The FIT is not stored (budget, unavailable, not fetched): the track follows on the run that stores it.
    if (!fitRef || !fitFetchedAt) return trackSheetFields(current);
    if (settled(current, fitFetchedAt)) return trackSheetFields(current);

    const base = { fit_fetched_at: fitFetchedAt, version: TRACK_VERSION, built_at: startedAt };

    // An indoor session: no download, no file.
    if (!hasStartCoordinates(listEntry)) {
      counts.none += 1;
      await record(fileId, activityId, { status: 'none', ...base });
      return { track_ref: '' };
    }

    let fitBytes = bytes;
    if (!fitBytes) {
      try {
        fitBytes = await archive.readFit(fitRef);
      } catch (err) {
        if (err instanceof DriveAuthError) throw err;
        fail(`activity ${activityId}: its FIT could not be read from Drive, so no track was built: ${redact(err.message || String(err))}`);
        return trackSheetFields(current);
      }
    }

    let built;
    try {
      built = buildTrack(fitBytes, activityId);
    } catch (err) {
      if (!(err instanceof TrackUnreadableError)) throw err;
      counts.unreadable += 1;
      // Not a failure: the FIT and the row are fine. Not retried until the FIT or the format changes.
      notes.push(`track ${activityId}: the FIT could not be decoded, so no track was built`);
      log(`  activity ${activityId}: the FIT could not be decoded, so no track was built`);
      await record(fileId, activityId, { status: 'unreadable', ...base });
      return { track_ref: '' };
    }

    if (built.status === 'none') {
      counts.none += 1;
      await record(fileId, activityId, { status: 'none', ...base });
      return { track_ref: '' };
    }

    // Replace in place when a track exists, so its Drive ID, and the row's track_ref, never change.
    const wasStored = current?.status === 'stored';
    let trackId = wasStored ? current.file_id : null;
    try {
      if (trackId) {
        try {
          await archive.replaceTrack(trackId, built.feature);
        } catch (err) {
          if (!(err instanceof DriveError) || err.status !== 404) throw err;
          trackId = null; // the file is gone: find or re-create it, as #310 does for FITs
        }
      }
      if (!trackId) {
        const live = await archive.findTrack(activityId);
        if (live) {
          await archive.replaceTrack(live.id, built.feature);
          trackId = live.id;
        } else {
          trackId = await archive.storeTrack({ activityId, localDate, feature: built.feature });
        }
      }
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      fail(`activity ${activityId}: track built but not stored in Drive: ${redact(err.message || String(err))}`);
      return trackSheetFields(current);
    }

    const stored = { status: 'stored', file_id: trackId, ...base, points: built.points };
    if (!(await record(fileId, activityId, stored))) return trackSheetFields(current);
    counts[wasStored ? 'rebuilt' : 'built'] += 1;
    log(`  activity ${activityId}: track ${wasStored ? 'rebuilt' : 'built'} (${built.points} points) as ${trackId}`);
    return trackSheetFields(stored);
  }

  return { ensure, counts, failures, notes };
}
