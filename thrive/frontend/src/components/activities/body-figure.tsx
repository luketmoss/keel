// The muscle figure on a weight card (#529): a front and a back view drawn from
// rounded blocks, with the regions a session worked in --type-weight.

import type { MuscleGroup } from './muscle-regions';

function cls(on: boolean): string {
  return on ? 'fig-on' : 'fig-off';
}

function View({ back, worked }: { back: boolean; worked: ReadonlySet<MuscleGroup> }) {
  const arms = cls(worked.has('arms'));
  const shoulders = cls(worked.has('shoulders'));
  const legs = cls(worked.has('legs'));
  return (
    <>
      <circle class="fig-off" cx="20" cy="7" r="6" />
      <rect class={arms} x="5" y="16" width="6" height="12" rx="3" />
      <rect class={arms} x="29" y="16" width="6" height="12" rx="3" />
      <rect class={arms} x="5" y="29" width="6" height="12" rx="3" />
      <rect class={arms} x="29" y="29" width="6" height="12" rx="3" />
      <circle class={shoulders} cx="8" cy="17" r="3.5" />
      <circle class={shoulders} cx="32" cy="17" r="3.5" />
      <rect class={cls(worked.has(back ? 'back' : 'chest'))} x="12" y="15" width="16" height="12" rx="4" />
      <rect class={cls(worked.has('core'))} x="13" y="28" width="14" height="13" rx="3" />
      <rect class={legs} x="13" y="43" width="6.5" height="31" rx="3" />
      <rect class={legs} x="20.5" y="43" width="6.5" height="31" rx="3" />
    </>
  );
}

/** Hidden from assistive technology: the card's name carries "worked ...". */
export function BodyFigure({ worked }: { worked: ReadonlySet<MuscleGroup> }) {
  return (
    <svg class="activity-figure" viewBox="0 0 92 80" width="92" height="80" aria-hidden="true" focusable="false">
      <g transform="translate(6 2)">
        <View back={false} worked={worked} />
      </g>
      <g transform="translate(46 2)">
        <View back worked={worked} />
      </g>
    </svg>
  );
}
