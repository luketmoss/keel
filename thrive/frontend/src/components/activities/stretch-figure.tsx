// The stretch figure (#529): one standing side bend, the same for every stretch
// session, in --type-stretch. It highlights nothing.

export function StretchFigure() {
  return (
    <svg
      class="activity-figure activity-figure-stretch"
      viewBox="0 0 92 80"
      width="92"
      height="80"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(46 77) scale(0.9) translate(-46 -76)">
        <g transform="translate(-2 2)">
          <rect class="fig-stretch" x="38.5" y="44" width="6.5" height="31" rx="3" transform="rotate(16 42 44)" />
          <rect class="fig-stretch" x="45" y="44" width="6.5" height="31" rx="3" transform="rotate(-16 48 44)" />
          <g transform="rotate(18 45 44)">
            <rect class="fig-stretch" x="37" y="16" width="16" height="12" rx="4" />
            <rect class="fig-stretch" x="38" y="29" width="14" height="13" rx="3" />
            <circle class="fig-stretch" cx="45" cy="9" r="5.5" />
            <rect class="fig-stretch" x="31" y="4" width="6" height="14" rx="3" transform="rotate(-8 34 18)" />
            <rect class="fig-stretch" x="33" y="-8" width="6" height="13" rx="3" transform="rotate(55 36 4)" />
            <rect class="fig-stretch" x="54" y="17" width="6" height="12" rx="3" transform="rotate(-8 57 17)" />
            <rect class="fig-stretch" x="54" y="30" width="6" height="12" rx="3" transform="rotate(-8 57 17)" />
          </g>
        </g>
      </g>
    </svg>
  );
}
