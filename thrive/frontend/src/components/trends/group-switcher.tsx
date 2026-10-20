// The Trends group switcher (#243 AC4): one row of tabs, one per registered
// group, in registry order, the current one underlined (#503). Still a row of
// aria-pressed buttons.
//
// It never wraps and never widens the page: it scrolls sideways inside its own
// focusable region, because three groups fit a 320px column and the eventual
// seven do not. The current tab is scrolled fully into view when it changes and
// on arrival, so a remembered one off to the right is not hidden. With fewer than
// two groups there is nothing to switch, so nothing renders.

import { useEffect, useRef } from 'preact/hooks';
import type { TrendGroup } from './metrics';

interface Props {
  groups: readonly TrendGroup[];
  value: string;
  onChange: (id: string) => void;
}

/** Scroll `scroller` sideways, by the least that brings `el` fully inside it. */
function reveal(scroller: HTMLElement, el: HTMLElement) {
  const box = scroller.getBoundingClientRect();
  const at = el.getBoundingClientRect();
  if (at.left < box.left) scroller.scrollLeft -= box.left - at.left;
  else if (at.right > box.right) scroller.scrollLeft += at.right - box.right;
}

export function GroupSwitcher({ groups, value, onChange }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (scroller.current && el) reveal(scroller.current, el);
  }, [value, groups.length]);
  if (groups.length < 2) return null;
  return (
    <div class="trends-group-scroll" role="region" tabIndex={0} aria-label="Metric group" ref={scroller}>
      <div class="trends-group-row" role="group" aria-label="Metric group">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            class={`trends-group-btn${g.id === value ? ' active' : ''}`}
            aria-pressed={g.id === value ? 'true' : 'false'}
            onClick={() => onChange(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
