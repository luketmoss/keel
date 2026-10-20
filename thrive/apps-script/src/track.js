// A synced activity's simplified GPS track, read from the bot's Drive (#432).
//
// The sync builds it from the activity's FIT (sync/src/track.mjs) and stores it
// as `Thrive COROS/tracks/<YYYY>/<MM>/<activityId>.json`. This script runs as
// the bot, so it can read those files. The app cannot: the sync holds only
// `drive.file`, which hides them from every other client.
//
// Like getWorkoutPayload (payload.js, whose file checks it follows), the caller
// names a **workout**, never a Drive file. `track_ref` is an ordinary column
// that `updateWorkout` can set, and the same Drive holds `coros-token.json`, so
// before a single byte goes back the file must be, by name, place, size and
// content, that activity's track. Every refusal is fixed text that quotes
// nothing from the file, and nothing here logs: a track shows where the user
// lives and rides.

/** A track is about 15-175 KB. Anything near a megabyte is not one. */
var TRACK_FILE_MAX_BYTES = 1024 * 1024;

var ARCHIVE_TRACKS_FOLDER = 'tracks';
var TRACK_FORMAT = 'thrive-track';

/** The one message for "track_ref on this workout does not name this activity's track". */
var NOT_A_TRACK_FILE =
  'track_ref on this workout does not name its GPS track, so nothing was read from it. ' +
  'The next sync run rewrites track_ref.';

/**
 * A workout's track: `{ workout_id, source_activity_id, track_ref, track }`,
 * `track` being the stored GeoJSON Feature unchanged. Throws, with fixed text,
 * for a workout with no track and for a file that is not its track.
 */
function getWorkoutTrack(id) {
  var workout = getWorkout(id);
  if (!workout) throw new Error('Workout "' + id + '" not found');
  if (!workout.track_ref) {
    throw new Error('Workout "' + id + '" has no GPS track (track_ref is blank): it is indoors, logged by hand, or has not been processed yet.');
  }
  if (!workout.source_activity_id) {
    throw new Error('Workout "' + id + '" has a track_ref but no source_activity_id, so its track cannot be confirmed. Nothing was read.');
  }
  var track = readTrackFile(workout.track_ref, workout.source_activity_id);
  return {
    workout_id: workout.id,
    source_activity_id: workout.source_activity_id,
    track_ref: workout.track_ref,
    track: track,
  };
}

/**
 * The Feature at `fileId`, confirmed to be `activityId`'s track: named
 * `<activityId>.json`, the only file at `Thrive COROS/tracks/<YYYY>/<MM>/`, at
 * most 1 MB, `format: "thrive-track"` and an `activity_id` equal to the row's.
 * Throws NOT_A_TRACK_FILE for anything else, and DRIVE_UNAUTHORIZED while the
 * owner has not granted the scope.
 */
function readTrackFile(fileId, activityId) {
  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (err) {
    // Drive's own message is not passed on: it can name the file.
    if (isDrivePermissionError(err)) throw new Error(DRIVE_UNAUTHORIZED);
    throw new Error(NOT_A_TRACK_FILE);
  }

  var feature;
  try {
    if (file.isTrashed()) throw new Error('trashed');
    if (file.getName() !== activityId + '.json') throw new Error('name');
    if (file.getSize() > TRACK_FILE_MAX_BYTES) throw new Error('size');
    if (!isInTrackArchive(file)) throw new Error('place');
    feature = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  } catch (err) {
    if (isDrivePermissionError(err)) throw new Error(DRIVE_UNAUTHORIZED);
    throw new Error(NOT_A_TRACK_FILE);
  }

  var props = feature && feature.properties;
  if (!feature || typeof feature !== 'object' || Array.isArray(feature) ||
      feature.type !== 'Feature' || !props || typeof props !== 'object' ||
      props.format !== TRACK_FORMAT || String(props.activity_id) !== String(activityId)) {
    throw new Error(NOT_A_TRACK_FILE);
  }
  return feature;
}

/**
 * Whether the file sits at `Thrive COROS/tracks/<YYYY>/<MM>/`. Each folder
 * must be the only parent at its level, as the sync makes them.
 */
function isInTrackArchive(file) {
  var month = onlyParent(file);
  if (!month || !/^\d{2}$/.test(month.getName())) return false;
  var year = onlyParent(month);
  if (!year || !/^\d{4}$/.test(year.getName())) return false;
  var tracks = onlyParent(year);
  if (!tracks || tracks.getName() !== ARCHIVE_TRACKS_FOLDER) return false;
  var root = onlyParent(tracks);
  return !!root && root.getName() === ARCHIVE_ROOT_FOLDER;
}
