// Trail search's data (#682): what a trail source gives the rules, and what the
// rules give the screens. Framework-free, so #680's build keeps it.

export type TrailDirection = 'forward' | 'reverse';

/** One pass over a trail, in the shape #681's matcher writes per pass. Unknown values are null. */
export interface TrailPass {
  /** The trail's name as OpenStreetMap writes it, before any split. */
  trail: string;
  metres: number | null;
  durationS: number | null;
  climbM: number | null;
  /** Where the pass started and ended along the trail, 0–100. */
  startPct: number;
  endPct: number;
  direction: TrailDirection;
  /** Seconds into the activity when the pass began. */
  entryOffsetS: number | null;
}

/** One activity's passes, with the date and time the rules order it by. */
export interface TrailActivity {
  id: string;
  date: string;
  time: string;
  passes: TrailPass[];
  /** Distance not on any named trail, in metres. */
  unmatchedM: number | null;
}

/** A pass as one trail group sees it: the part of the OSM name that put it in the group. */
export interface GroupPass {
  activityId: string;
  date: string;
  time: string;
  /** The variant (one part of the name, as written) that put this pass in the group. */
  variant: string;
  pass: TrailPass;
}

/** One activity on one trail group: the trail once, its passes under it in time order. */
export interface TrailVisit {
  activityId: string;
  date: string;
  time: string;
  passes: GroupPass[];
}

export interface TrailGroup {
  key: string;
  /** The variant carried by the most passes. */
  name: string;
  /** The other variants, in the order first seen. */
  otherNames: string[];
  /** Every activity on the trail, oldest first. */
  visits: TrailVisit[];
}

export interface TrailIndex {
  /** Every group, by key. */
  groups: Map<string, TrailGroup>;
  /** Each activity's trails, in the order of each group's first pass in it. */
  byActivity: Map<string, { group: TrailGroup; visit: TrailVisit }[]>;
  /** Each activity's distance not on a named trail. */
  unmatchedM: Map<string, number | null>;
}

/** What a pass compares with: the like-for-like pass before it, and the differences. */
export interface PassComparison {
  previous: GroupPass | null;
  /** This pass's duration minus the previous one's, when both are known. */
  timeDiffS: number | null;
  /** This pass's climb minus the previous one's, when both are known. */
  climbDiffM: number | null;
}
