// The route thumbnail on a tracked activity's card (#530): the stored track as a
// plain SVG line on a tile, in the route's --map-* colours with a start dot.
// No basemap and no Google Maps request, so the list still asks Maps for nothing
// (#407). Geometry comes from @keel/geo through routePoints, as the detail map's
// does.
//
// A card asks for its track when it comes within a screen height of the
// viewport, through the shared queue (two at a time) and session cache in
// maps/track-cache.ts. Until the line is ready, and on any failure, the card
// keeps its type tile: there is no spinner, no error text and no retry control.

import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { useAuth } from '../../auth/auth-context';
import { DEMO_TRACKS } from '../../api/demo-track';
import { isDemo } from '../../api/demo-data';
import type { Workout, WorkoutTrack } from '../../api/types';
import { routePoints } from '../../maps/draw-route';
import { getCachedTrack, requestTrack, type TrackRequest } from '../../maps/track-cache';

/** The tile's content box: the 92x80 visual slot less --space-sm (8px) of padding all round. */
export const THUMB_WIDTH = 76;
export const THUMB_HEIGHT = 64;

/**
 * Whether this card asks for a track at all. A workout with no `track_ref` never
 * does, and neither does a planned or active one. Unlike the detail screen's
 * Route section this needs no Maps key; it needs a build that can read tracks.
 */
export function thumbnailAvailable(workout: Pick<Workout, 'id' | 'track_ref' | 'status'>): boolean {
  if (!workout.track_ref || workout.status === 'planned' || workout.status === 'active') return false;
  if (isDemo()) return workout.id in DEMO_TRACKS;
  return Boolean((import.meta.env.VITE_THRIVE_API_URL ?? '').trim());
}

/**
 * The route fitted inside the tile: bad latitudes dropped and the date line
 * unwrapped (routePoints), projected equirectangularly with longitude scaled by
 * the cosine of the mean latitude, then scaled to fit with the aspect ratio kept
 * and centred. Null when fewer than two usable points remain, or they all sit in
 * one place.
 */
export function fitThumbnail(track: WorkoutTrack): [number, number][] | null {
  const points = routePoints(track);
  if (points.length < 2) return null;
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xy = points.map((p) => [p.lng * k, -p.lat] as const);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  if (width === 0 && height === 0) return null;
  const scale = Math.min(THUMB_WIDTH / width, THUMB_HEIGHT / height);
  const offsetX = (THUMB_WIDTH - width * scale) / 2;
  const offsetY = (THUMB_HEIGHT - height * scale) / 2;
  return xy.map(([x, y]) => [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale]);
}

/**
 * The fitted route of this activity once its track is in, else null. `cardRef`
 * is the card: the track is requested the first time it is within one viewport
 * height of the screen, and a request still queued when it scrolls away is dropped.
 */
export function useRouteThumbnail(
  workout: Pick<Workout, 'id' | 'track_ref' | 'status'>,
  cardRef: RefObject<Element>,
): [number, number][] | null {
  const { token } = useAuth();
  const available = thumbnailAvailable(workout);
  const [fitted, setFitted] = useState<[number, number][] | null>(() => {
    const cached = available ? getCachedTrack(workout.id) : undefined;
    return cached ? fitThumbnail(cached) : null;
  });

  useEffect(() => {
    if (!available) {
      setFitted(null);
      return;
    }
    const cached = getCachedTrack(workout.id);
    if (cached) {
      setFitted(fitThumbnail(cached));
      return;
    }
    setFitted(null);

    let alive = true;
    let request: TrackRequest | null = null;
    let observer: IntersectionObserver | null = null;

    const start = () => {
      if (request) return;
      const mine = requestTrack(workout.id, token);
      request = mine;
      mine.promise.then(
        (track) => {
          if (!alive) return;
          observer?.disconnect();
          setFitted(fitThumbnail(track));
        },
        (err: unknown) => {
          if (!alive) return;
          observer?.disconnect();
          // The kind only, never a token, a body or a coordinate. The card keeps its tile.
          console.warn('route thumbnail:', err instanceof Error ? err.message : 'failed');
        },
      );
    };
    const stop = () => {
      request?.cancel();
      request = null;
    };

    if (typeof IntersectionObserver === 'undefined' || !cardRef.current) {
      start();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          const last = entries[entries.length - 1];
          if (!last) return;
          if (last.isIntersecting) start();
          else stop();
        },
        { rootMargin: `${window.innerHeight}px 0px` },
      );
      observer.observe(cardRef.current);
    }

    return () => {
      alive = false;
      observer?.disconnect();
      stop();
    };
  }, [workout.id, available, token]);

  return fitted;
}

/** The thumbnail itself, hidden from assistive technology: the card's name is unchanged. */
export function RouteThumbnail({ points }: { points: [number, number][] }) {
  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [startX, startY] = points[0];
  return (
    <span class="activity-visual activity-route" aria-hidden="true">
      <svg
        class="activity-route-svg"
        viewBox={`0 0 ${THUMB_WIDTH} ${THUMB_HEIGHT}`}
        width={THUMB_WIDTH}
        height={THUMB_HEIGHT}
        focusable="false"
      >
        <polyline class="activity-route-casing" points={path} />
        <polyline class="activity-route-line" points={path} />
        <circle class="activity-route-dot" cx={startX.toFixed(1)} cy={startY.toFixed(1)} r="3" />
      </svg>
    </span>
  );
}
