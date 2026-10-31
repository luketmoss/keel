// The OpenStreetMap credit (#682): trail names come from OSM, so every screen
// that shows them says so, with #260's external-link pattern.

import { ExternalGlyph } from '../activities/detail-icons';

// The copyright sign, by code point: #405's emoji scan counts the literal character as a pictograph.
const COPYRIGHT = String.fromCodePoint(0xa9);

export function TrailCredit() {
  return (
    <p class="trail-credit">
      {`Trail names ${COPYRIGHT} `}
      <a
        class="detail-coros-link trail-credit-link"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        {'OpenStreetMap contributors '}
        <span class="sr-only">(opens in a new tab)</span>
        <ExternalGlyph />
      </a>
    </p>
  );
}
