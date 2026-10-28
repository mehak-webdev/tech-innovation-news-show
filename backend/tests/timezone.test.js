import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getISTDateString,
  getISTFormattedDate,
  getISTTimeString,
  isSameISTDay,
  calculateUTCCronForIST
} from '../src/utils/timezone.js';

describe('Timezone Utilities (Asia/Kolkata / IST)', () => {
  it('correctly maps late UTC timestamp to the next calendar day in India', () => {
    // 2026-10-28 19:00:00 UTC is 2026-10-29 00:30:00 IST (+5:30)
    const lateUtc = new Date('2026-10-28T19:00:00.000Z');
    assert.strictEqual(getISTDateString(lateUtc), '2026-10-29');
    assert.strictEqual(getISTFormattedDate(lateUtc), 'Thursday, October 29, 2026');
  });

  it('correctly maps timestamp shortly after midnight IST', () => {
    // 2026-10-28 18:31:00 UTC is 2026-10-29 00:01:00 IST
    const shortlyAfterMidnight = new Date('2026-10-28T18:31:00.000Z');
    assert.strictEqual(getISTDateString(shortlyAfterMidnight), '2026-10-29');
    assert.strictEqual(getISTTimeString(shortlyAfterMidnight), '00:01:00');
  });

  it('correctly handles boundary 1 second before midnight IST', () => {
    // 2026-10-28 18:29:59 UTC is 2026-10-28 23:59:59 IST
    const justBeforeMidnight = new Date('2026-10-28T18:29:59.000Z');
    assert.strictEqual(getISTDateString(justBeforeMidnight), '2026-10-28');
    assert.strictEqual(getISTTimeString(justBeforeMidnight), '23:59:59');
  });

  it('identifies same IST calendar day across UTC boundary transitions', () => {
    // 2026-10-28 01:00:00 UTC (06:30 IST) vs 2026-10-28 17:00:00 UTC (22:30 IST)
    const morning = new Date('2026-10-28T01:00:00.000Z');
    const evening = new Date('2026-10-28T17:00:00.000Z');
    assert.strictEqual(isSameISTDay(morning, evening), true);

    // 2026-10-28 19:00:00 UTC is already 2026-10-29 in India
    const nextDayIst = new Date('2026-10-28T19:00:00.000Z');
    assert.strictEqual(isSameISTDay(evening, nextDayIst), false);
  });

  it('correctly calculates UTC cron expression for 6:00 PM IST', () => {
    // 18:00 IST (6:00 PM) should correspond to 12:30 UTC
    const schedule = calculateUTCCronForIST(18, 0);
    assert.strictEqual(schedule.utcHour, 12);
    assert.strictEqual(schedule.utcMinute, 30);
    assert.strictEqual(schedule.utcCronString, '30 12 * * *');
  });
});

