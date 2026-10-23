/** A small watch outline; follows the text colour in both themes. */
export function WatchGlyph() {
  return (
    <svg
      class="provenance-glyph"
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="2.75" width="7" height="6.5" rx="1.75" stroke="currentColor" stroke-width="1.25" />
      <path
        d="M4.25 2.75V1h3.5v1.75M4.25 9.25V11h3.5V9.25M6 4.5V6l1 .75"
        stroke="currentColor"
        stroke-width="1.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
