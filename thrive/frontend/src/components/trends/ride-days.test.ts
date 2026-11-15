// #891 — which DailySummary rows are ride days.

import { describe, it, expect } from 'vitest';
import { isRideDay, rideDays } from './ride-days';

describe('isRideDay', () => {
  it.each(['bike', 'bike:road', 'bike:indoor', 'weight,bike:mountain', 'bike:spin,weight', 'hike, bike'])(
    '%s is a ride',
    (v) => expect(isRideDay(v)).toBe(true),
  );
  it.each(['weight', 'run,hike,walk,stretch', '', undefined, 'ebike', 'bikeshare', 'mountain bike', 'weight:bike'])(
    '%s is not a ride',
    (v) => expect(isRideDay(v)).toBe(false),
  );
});

describe('rideDays', () => {
  it('collects the dates of rows with a ride, ignoring rows without a date', () => {
    const rows = [
      { date: '2026-09-24', activity_types: 'weight' },
      { date: '2026-09-25', activity_types: 'bike:road' },
      { date: '2026-09-26', activity_types: 'bike,weight' },
      { date: '', activity_types: 'bike' },
    ];
    expect([...rideDays(rows)]).toEqual(['2026-09-25', '2026-09-26']);
  });
  it('is empty for no rows', () => {
    expect(rideDays(null).size).toBe(0);
    expect(rideDays([]).size).toBe(0);
  });
});
