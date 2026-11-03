// The "Time in power zones" card of a Spin ride (#771): Z1 to Z6 at the FTP the ride was ridden at, each
// with its watt range, the time spent and its share of the seconds that had a power reading. Always all
// six; a zone with no time shows a measured zero.

import type { RideDerived } from '../../api/spin-streams';
import { ZONE_NAMES, zoneRange, zoneVar } from '../../spin/zones';
import { formatClock } from './activities-helpers';

/** "< 140 W" -> "under 140 watts", "140–189 W" -> "140 to 189 watts", "≥ 303 W" -> "303 watts or more". */
export function spokenRange(range: string): string {
  if (range.startsWith('<')) return `under ${range.slice(1).trim().replace(/ W$/, '')} watts`;
  if (range.startsWith('≥')) return `${range.slice(1).trim().replace(/ W$/, '')} watts or more`;
  return `${range.replace(/ W$/, '').replace('–', ' to ')} watts`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 722 -> "12 minutes 2 seconds". */
export function spokenDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(plural(h, 'hour'));
  if (m > 0) parts.push(plural(m, 'minute'));
  if (s > 0 || parts.length === 0) parts.push(plural(s, 'second'));
  return parts.join(' ');
}

export function RideZones({ ride }: { ride: RideDerived }) {
  const { ftp, zones, powerSeconds } = ride;
  let body;
  if (!ftp || !zones) {
    body = <p class="ride-zones-note">No FTP for this ride, so there are no zones.</p>;
  } else if (!ride.hasPower) {
    body = <p class="ride-zones-note">No power was recorded on this ride.</p>;
  } else {
    const most = Math.max(...zones);
    body = (
      <ul class="ride-zones">
        {zones.map((secs, i) => {
          const zone = i + 1;
          const name = ZONE_NAMES[i];
          const range = zoneRange(zone, ftp);
          const share = Math.floor((secs * 100) / powerSeconds + 0.5);
          const width = most > 0 ? (secs / most) * 100 : 0;
          return (
            <li key={zone}>
              <div
                class="ride-zone-row"
                role="img"
                aria-label={`Z${zone} ${name}, ${spokenRange(range)}, ${spokenDuration(secs)}, ${share} percent`}
              >
                <span class="ride-zone-label">
                  <span class="ride-zone-name">
                    Z{zone} {name}
                  </span>
                  <span class="ride-zone-range">{range}</span>
                </span>
                <span class="ride-zone-track">
                  <span class="ride-zone-fill" style={{ width: `${width.toFixed(2)}%`, background: zoneVar(zone) }} />
                </span>
                <span class="ride-zone-figures">
                  <span class="ride-zone-time">{formatClock(secs)}</span>
                  <span class="ride-zone-share">{share}%</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <section class="detail-card ride-zones-card">
      <h2 class="detail-card-heading">Time in power zones</h2>
      {body}
    </section>
  );
}
