// The raw Garmin import archive in the bot account's Drive (#159).
//
//   Thrive Garmin/activities/<YYYY>/<MM>/<activityId>.json   one per activity
//   Thrive Garmin/fit/<YYYY>/<MM>/<activityId>.fit           one per outdoor activity (#510)
//
// Built on archive.mjs's `createArchiveStore` like the Withings archive, with
// its own root and tags. Each file holds the export's activity object as
// exported; its Drive ID is `Workouts!raw_ref`. Found by tags, never by name.

import { createArchiveStore, sha256 } from './archive.mjs';

export const GARMIN_DRIVE_ROOT_FOLDER = 'Thrive Garmin';
export const GARMIN_APP_PROPERTY_ROOT = { kind: 'thrive-garmin-root' };
export const GARMIN_APP_PROPERTY_FOLDER_KIND = 'thrive-garmin-folder';

export const garminActivityProps = (activityId) => ({ source: 'garmin_import', activity_id: String(activityId) });

/**
 * A FIT file's tags (#510). Deliberately not `activity_id`, for the reason
 * archive.mjs's `fitProps` gives: the activity JSON's query would match it.
 */
export const garminFitProps = (activityId) => ({ source: 'garmin_import', kind: 'fit', fit_activity_id: String(activityId) });

/** @param {ReturnType<import('./drive.mjs').createDrive>} drive */
export function createGarminArchive(drive, { now = () => Date.now() } = {}) {
  const { folderFor, upsert } = createArchiveStore(drive, {
    rootName: GARMIN_DRIVE_ROOT_FOLDER,
    rootProps: GARMIN_APP_PROPERTY_ROOT,
    folderKind: GARMIN_APP_PROPERTY_FOLDER_KIND,
    now,
  });
  return {
    /** The activity's FIT file in Drive, or null. Found by tag, never by name. */
    findFit(activityId) {
      return drive.findOne(garminFitProps(activityId));
    },

    /**
     * Store an activity's FIT bytes, foldered by its local start date like its
     * JSON. Returns the Drive file ID, which is the row's `fit_ref`.
     */
    async storeFit({ activityId, localDate, bytes }) {
      const id = String(activityId);
      const [yyyy, mm] = localDate.split('-');
      const parentId = await folderFor(['fit', yyyy, mm]);
      return drive.createBinary({ name: `${id}.fit`, parentId, props: garminFitProps(id), bytes });
    },

    /** @param {string} date local YYYY-MM-DD, which folders the file */
    upsertActivity(activity, date) {
      const id = String(activity.activityId);
      const [yyyy, mm] = date.split('-');
      return upsert({
        props: garminActivityProps(id),
        name: `${id}.json`,
        segments: ['activities', yyyy, mm],
        record: { source: 'garmin_import', activity_id: id, payload: activity, payload_hash: sha256(JSON.stringify(activity)) },
      });
    },
  };
}
