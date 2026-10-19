// A synthetic FIT file for the track tests (#432), written with Garmin's own
// encoder, so the decoder is tested against a real FIT's bytes. Every
// coordinate here is invented: the repo is public, and no real activity's
// location may appear in a fixture.

import { Encoder, Profile } from '@garmin/fitsdk';

const DEGREES_TO_SEMICIRCLES = 2 ** 31 / 180;

/** Whole degrees to the FIT's integer semicircles. */
export const semicircles = (degrees) => Math.round(degrees * DEGREES_TO_SEMICIRCLES);

/**
 * @param {{ lat?: number, lon?: number, ms: number, altitude?: number }[]} points
 *   `lat`/`lon` in degrees; a point with neither is a record with no position.
 * @returns {Buffer} one whole FIT file
 */
export function makeFit(points) {
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    manufacturer: 'development',
    product: 1,
    timeCreated: new Date(Date.UTC(2026, 0, 1)),
    type: 'activity',
  });
  for (const p of points) {
    const record = { timestamp: new Date(p.ms) };
    if (p.lat !== undefined) record.positionLat = semicircles(p.lat);
    if (p.lon !== undefined) record.positionLong = semicircles(p.lon);
    if (p.altitude !== undefined) record.enhancedAltitude = p.altitude;
    encoder.onMesg(Profile.MesgNum.RECORD, record);
  }
  return Buffer.from(encoder.close());
}

/** A straight east-west run of `n` points, one a second, around an invented spot. */
export function line(n, { lat = 45.0, lon0 = -100.0, stepDeg = 0.0001, ms0 = Date.UTC(2026, 5, 1, 14, 0, 0) } = {}) {
  return Array.from({ length: n }, (_, i) => ({ lat, lon: lon0 + i * stepDeg, ms: ms0 + i * 1000, altitude: 800 + i * 0.1 }));
}
