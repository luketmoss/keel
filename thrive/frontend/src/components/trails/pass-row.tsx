// One pass on a trail (#682): a position bar, then what it was, then how it
// compared. The same row on the Trails card, Last time and Every time.

import { compareWithEarlier } from '../../trails/compare';
import { comparisonLine, passLine } from '../../trails/format';
import type { GroupPass, TrailGroup } from '../../trails/types';

interface Props {
  group: TrailGroup;
  gp: GroupPass;
  /** "0:42 in" shows only when the trail has more than one pass in this activity. */
  withOffset: boolean;
  today: string;
}

export function PassRow({ group, gp, withOffset, today }: Props) {
  const { startPct, endPct, direction } = gp.pass;
  const lo = Math.max(0, Math.min(startPct, endPct, 100));
  const hi = Math.min(100, Math.max(startPct, endPct, 0));
  return (
    <div class="trail-pass">
      {/* The bar says what line 1 says, so it is hidden from assistive tech. */}
      <div class="trail-bar" aria-hidden="true">
        <span class="trail-bar-fill" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <span
          class={`trail-bar-arrow trail-bar-arrow-${direction}`}
          style={{ left: `${direction === 'forward' ? hi : lo}%` }}
        />
      </div>
      <p class="trail-pass-line">{passLine(gp.pass, withOffset)}</p>
      <p class="trail-pass-compare">{comparisonLine(compareWithEarlier(group, gp), today)}</p>
    </div>
  );
}
