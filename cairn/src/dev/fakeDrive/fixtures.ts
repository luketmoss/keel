/* Seed data for the fake Drive (#93): a `/Cairn/` folder containing two
   trip folders, each with the two files `DriveTripStore#hydrateTrip`
   actually reads — `trip.json` and `overview.geojson` — built the same way
   `saveOverview` builds them for a real trip, so hydration can't tell the
   difference. One `planned`, one `completed`, with distinct dates and
   origins, per #93's acceptance criterion 3. */

import type { TripRecord } from '../../store/tripStore'
import { buildOverviewGeoJSON, computeTripOrigin } from '../../geo/overview'
import type { Track } from '../../kml/parse'
import type { FakeFile } from './store'

export const FAKE_ACCOUNT = {
  emailAddress: 'fake.explorer@example.com',
  displayName: 'Fake Explorer',
}

export const CAIRN_FOLDER_ID = 'fake-cairn-folder'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

function folder(id: string, name: string, parents: string[], createdTime: string): FakeFile {
  return { id, name, mimeType: FOLDER_MIME_TYPE, parents, trashed: false, version: 1, createdTime, content: null }
}

function jsonFile(id: string, name: string, parents: string[], content: unknown, createdTime: string): FakeFile {
  return { id, name, mimeType: 'application/json', parents, trashed: false, version: 1, createdTime, content }
}

function track(name: string, points: [number, number][]): Track {
  return { name, points: points.map(([lat, lon]) => ({ lat, lon })) }
}

interface FixtureTripDef {
  id: string
  name: string
  status: 'planned' | 'completed'
  startDate: string | null
  endDate: string | null
  notes: string
  createdAt: string
  tracks: Track[]
}

const FIXTURE_TRIPS: FixtureTripDef[] = [
  {
    id: 'trip-fake-pacific-coast',
    name: 'Pacific Coast Run',
    status: 'completed',
    startDate: '2025-06-02',
    endDate: '2025-06-09',
    notes: 'Fixture trip seeded by the fake Drive (#93) — Highway 1 from the Bay to Big Sur.',
    createdAt: '2025-06-01T12:00:00.000Z',
    tracks: [
      track('Highway 1', [
        [37.7749, -122.4194],
        [37.4, -122.3],
        [36.6, -121.9],
        [36.27, -121.81],
      ]),
    ],
  },
  {
    id: 'trip-fake-dolomites',
    name: 'Dolomites Loop',
    status: 'planned',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    notes: 'Fixture trip seeded by the fake Drive (#93) — a planned loop through the Dolomites.',
    createdAt: '2025-11-15T09:30:00.000Z',
    tracks: [
      track('Cortina Loop', [
        [46.5405, 12.1357],
        [46.49, 12.03],
        [46.42, 11.87],
        [46.5405, 12.1357],
      ]),
    ],
  },
]

export function buildFixtureFiles(): FakeFile[] {
  const files: FakeFile[] = [folder(CAIRN_FOLDER_ID, 'Cairn', ['root'], '2025-01-01T00:00:00.000Z')]

  for (const trip of FIXTURE_TRIPS) {
    const tripFolderId = `${trip.id}-folder`
    files.push(folder(tripFolderId, trip.id, [CAIRN_FOLDER_ID], trip.createdAt))

    const record: TripRecord = {
      id: trip.id,
      photoCount: null,
      name: trip.name,
      status: trip.status,
      startDate: trip.startDate,
      endDate: trip.endDate,
      notes: trip.notes,
      createdAt: trip.createdAt,
      origin: computeTripOrigin(trip.tracks),
    }
    files.push(jsonFile(`${trip.id}-trip-json`, 'trip.json', [tripFolderId], record, trip.createdAt))
    files.push(
      jsonFile(
        `${trip.id}-overview-json`,
        'overview.geojson',
        [tripFolderId],
        buildOverviewGeoJSON(trip.tracks),
        trip.createdAt,
      ),
    )
  }

  return files
}
