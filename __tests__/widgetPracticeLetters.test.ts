/**
 * The widget's strip draws the record BY PRAYER from `p`, the five letters
 * a day is sent as. The v1→v2 conversion dropped the field once, and the
 * strip fell back to the day's summary in every row — a prayer marked
 * missed on the Log screen coloured nothing red on the home screen. Both
 * directions must carry it.
 */
import { readWidgetContractPayload } from '../src/widget/contract.generated';
import {
  widgetPayloadV1FromV2,
  widgetPayloadV2FromV1,
} from '../src/widget/widgetPayloadV2';
import type { WidgetPrayerPayload } from '../src/widget/buildWidgetPayload';

const wire = <T>(v: T): any => JSON.parse(JSON.stringify(v));

const now = new Date(2026, 9, 26, 12, 0, 0);
const at = { todayKey: '2026-10-26', nowMinutes: 12 * 60 };

const v1: WidgetPrayerPayload = {
  dayLabel: 'Mon 26 Oct',
  rows: [{ key: 'Fajr', name: 'Fajr', time: '05:30' }],
  nextKey: null,
  days: [
    {
      dateKey: '2026-10-26',
      dayLabel: 'Mon 26 Oct',
      rows: [{ key: 'Fajr', name: 'Fajr', time: '05:30' }],
    },
  ],
  practice: {
    streak: 1,
    bestStreak: 3,
    loggedToday: 5,
    owed: 1,
    sunnahRate: null,
    fastsThisMonth: 0,
    days: [{ d: '2026-10-26', k: 4, kw: 400, l: 5, m: true, p: 'ooomo' }],
  },
} as WidgetPrayerPayload;

describe('the practice letters cross to the widgets', () => {
  it('are carried into v2', () => {
    const v2 = widgetPayloadV2FromV1(v1, { clock: { hour12: false }, now });
    expect(v2.practice?.days?.[0].p).toBe('ooomo');
  });

  it('and back into the v1 the renderers draw', () => {
    const v2 = widgetPayloadV2FromV1(v1, { clock: { hour12: false }, now });
    const read = readWidgetContractPayload(wire(v2));
    expect(read).not.toBeNull();
    const back = widgetPayloadV1FromV2(read!, at)!;
    expect(back.practice?.days[0].p).toBe('ooomo');
    expect(back.practice?.days[0].m).toBe(true);
  });
});
