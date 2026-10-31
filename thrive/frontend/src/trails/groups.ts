// Trail groups (#682): OpenStreetMap names one trail several ways (#681), and
// these rules fold the variants into one group. Pure, no view library.

import type { GroupPass, TrailActivity, TrailGroup, TrailIndex, TrailPass, TrailVisit } from './types';

/** "Fox Hollow / Kestrel Connector" → both names. Split on `;` and on " / "; parts trimmed, empties dropped. */
export function splitTrailName(name: string): string[] {
  return name
    .split(/;| \/ /)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** The grouping key: lowercase, whitespace collapsed, a trailing " trail" dropped when something is left. */
export function trailKey(variant: string): string {
  const key = variant.toLowerCase().replace(/\s+/g, ' ').trim();
  const stripped = key.replace(/ trail$/, '');
  return stripped === '' ? key : stripped;
}

/** `#/trail/<key>`'s path. */
export function trailPath(key: string): string {
  return `/trail/${encodeURIComponent(key)}`;
}

/** Oldest first: by date, then time, then id so the order is total. */
function chronological(a: TrailActivity, b: TrailActivity): number {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);
}

/** A pass's place in its activity: by entry offset, the listed order breaking ties and standing in for unknowns. */
function passOrder(passes: TrailPass[]): TrailPass[] {
  return passes
    .map((pass, i) => ({ pass, i }))
    .sort((a, b) => {
      const ao = a.pass.entryOffsetS;
      const bo = b.pass.entryOffsetS;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      return a.i - b.i;
    })
    .map((x) => x.pass);
}

interface Building {
  key: string;
  /** Variant → pass count, in first-seen order. */
  counts: Map<string, number>;
  /** Variant → position of its most recent pass, for the tie-break. */
  latest: Map<string, number>;
  visits: TrailVisit[];
}

/** Every activity's passes folded into trail groups. */
export function buildTrailIndex(activities: TrailActivity[]): TrailIndex {
  const building = new Map<string, Building>();
  const byActivity = new Map<string, { key: string; visit: TrailVisit }[]>();
  const unmatchedM = new Map<string, number | null>();
  let seen = 0;

  for (const activity of [...activities].sort(chronological)) {
    unmatchedM.set(activity.id, activity.unmatchedM);
    const visits = new Map<string, TrailVisit>();
    const order: { key: string; visit: TrailVisit }[] = [];
    for (const pass of passOrder(activity.passes)) {
      // A name with two parts that share a key counts once for that group.
      const keysThisPass = new Set<string>();
      for (const variant of splitTrailName(pass.trail)) {
        const key = trailKey(variant);
        if (keysThisPass.has(key)) continue;
        keysThisPass.add(key);
        let group = building.get(key);
        if (!group) {
          group = { key, counts: new Map(), latest: new Map(), visits: [] };
          building.set(key, group);
        }
        group.counts.set(variant, (group.counts.get(variant) ?? 0) + 1);
        group.latest.set(variant, seen++);
        let visit = visits.get(key);
        if (!visit) {
          visit = { activityId: activity.id, date: activity.date, time: activity.time, passes: [] };
          visits.set(key, visit);
          group.visits.push(visit);
          order.push({ key, visit });
        }
        const gp: GroupPass = { activityId: activity.id, date: activity.date, time: activity.time, variant, pass };
        visit.passes.push(gp);
      }
    }
    if (order.length > 0) byActivity.set(activity.id, order);
  }

  const groups = new Map<string, TrailGroup>();
  for (const b of building.values()) {
    const variants = [...b.counts.keys()];
    const name = variants.reduce((best, v) => {
      const dc = b.counts.get(v)! - b.counts.get(best)!;
      return dc > 0 || (dc === 0 && b.latest.get(v)! > b.latest.get(best)!) ? v : best;
    });
    groups.set(b.key, { key: b.key, name, otherNames: variants.filter((v) => v !== name), visits: b.visits });
  }

  return {
    groups,
    byActivity: new Map(
      [...byActivity].map(([id, list]) => [id, list.map(({ key, visit }) => ({ group: groups.get(key)!, visit }))]),
    ),
    unmatchedM,
  };
}
