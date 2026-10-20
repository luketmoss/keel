// #504 — a Day card that opens its Trends group: `#/trends/<group>?date=<the day shown>`.
//
// The link is an empty-looking `<a>` stretched over the card (the card is
// `position: relative`), so the card keeps its `section`, its `h2` and its text as
// they were (#485) and the whole card is the target. Its words are for screen
// readers only, built from the card's own title and value so the two cannot
// disagree: "Resting HR 53 bpm. Open Recovery trends". The `›` is the only visible mark.

import { TREND_GROUPS } from '../trends/metrics';

export type TrendsLinkGroup = 'recovery' | 'sleep' | 'activity' | 'body' | 'blood_pressure';

/** Where a card goes: Trends on `group`, with `date` selected. */
export function trendsHref(group: TrendsLinkGroup, date: string): string {
  return `#/trends/${group}?date=${date}`;
}

/** The group's label as the Trends registry has it: "Recovery", "Blood Pressure". */
function groupLabel(group: TrendsLinkGroup): string {
  return TREND_GROUPS.find((g) => g.id === group)?.label ?? group;
}

/**
 * What a card says for its link: its title and value, or "<title>, no reading"
 * when it has none. `value` is the text as shown ("53 bpm", "7h 12m").
 */
export function cardLinkName(title: string, value: string | null): string {
  return value === null || value === '' ? `${title}, no reading` : `${title} ${value}`;
}

interface CardLinkProps {
  group: TrendsLinkGroup;
  date: string;
  /** The card's title and value, from `cardLinkName`. */
  name: string;
  /** Lets Back find this link again when Day returns (#256); unique on the screen. */
  focusKey: string;
}

export function CardLink({ group, date, name, focusKey }: CardLinkProps) {
  return (
    <a class="day-card-link" href={trendsHref(group, date)} data-focus-key={focusKey}>
      <span class="sr-only">{`${name}. Open ${groupLabel(group)} trends`}</span>
    </a>
  );
}

/** The `›` at the right of a linked card's title row. Decoration: the link carries the words. */
export function CardChevron() {
  return (
    <span class="day-card-chevron" aria-hidden="true">
      ›
    </span>
  );
}
