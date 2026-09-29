/**
 * Payload v2 stands for exactly the v1 payload it was derived from.
 *
 * While both are written (docs/rewrite-plan.md, step 1.4) the widgets draw
 * v2 through an adapter that gives their renderers the v1 shape. So the
 * test that matters is the round trip: the app's own v1, turned into v2,
 * read the way a native reader reads it, and turned back at the same
 * moment, must be the v1 the app built — for every scenario that has ever
 * needed special handling. Two fields are not carried, on purpose, and are
 * set aside here: `tomorrowEstimated`, which nothing reads, and the
 * practice grid's legacy `k`, which `kw` replaced.
 */
import { readWidgetContractPayload } from '../src/widget/contract.generated';
import { widgetPayloadV1FromV2 } from '../src/widget/widgetPayloadV2';
import {
  widgetScenarios,
  type WidgetScenario,
} from '../contract-tests/scenarios';

/** What crosses the bridge: JSON, so `undefined` keys are gone. */
const wire = <T>(v: T): any => JSON.parse(JSON.stringify(v));

function withoutUncarried(v1: any): any {
  const out = wire(v1);
  delete out.tomorrowEstimated;
  for (const d of out.practice?.days ?? []) delete d.k;
  return out;
}

describe('widget payload v2', () => {
  let scenarios: WidgetScenario[] = [];
  beforeAll(async () => {
    scenarios = await widgetScenarios();
  });

  it('covers the scenarios it claims to', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
  });

  it('turns back into the v1 the app built, at the moment it was built', () => {
    for (const s of scenarios) {
      const read = readWidgetContractPayload(wire(s.v2));
      expect({ name: s.name, readable: read != null }).toEqual({
        name: s.name,
        readable: true,
      });
      const back = withoutUncarried(widgetPayloadV1FromV2(read!, s.now));
      const want = withoutUncarried(s.v1);
      // The one addition: a tomorrow the app showed only at the top level
      // (known, but outside the window) comes back in `days` as well —
      // v2 has to carry it for a reader to have anything ahead.
      if (s.name === 'after ʿIshāʾ, tomorrow known but outside the window') {
        expect(back.days.map((d: { dateKey: string }) => d.dateKey)).toEqual([
          ...want.days.map((d: { dateKey: string }) => d.dateKey),
          '2026-04-10',
        ]);
        expect(back.days[back.days.length - 1].rows).toEqual(want.rows);
        back.days.pop();
      }
      expect({ name: s.name, payload: back }).toEqual({
        name: s.name,
        payload: want,
      });
    }
  });

  it('carries a known tomorrow that was outside the window, so ʿIshāʾ has a next', () => {
    const s = scenarios.find(
      x => x.name === 'after ʿIshāʾ, tomorrow known but outside the window',
    )!;
    const last = s.v2.days[s.v2.days.length - 1];
    expect(last.dateKey).toBe('2026-04-10');
    expect(last.estimated ?? false).toBe(false);
    const back = widgetPayloadV1FromV2(readWidgetContractPayload(wire(s.v2))!, s.now)!;
    expect(back.nextKey).toBe('Fajr');
    expect(back.nextPrayerTime).toBe(s.v1.nextPrayerTime);
  });

  it('carries an estimated day when tomorrow is unknown, and offers only its Fajr', () => {
    const s = scenarios.find(x => x.name === 'after ʿIshāʾ, tomorrow unknown')!;
    const last = s.v2.days[s.v2.days.length - 1];
    expect(last.estimated).toBe(true);
    expect(last.dateKey).toBe('2026-04-10');
    expect(s.v1.nextKey).toBe('Fajr');
  });

  it('keeps a First Third after midnight on its own day, past 1440', () => {
    const s = scenarios.find(
      x => x.name === 'late evening, the First Third after midnight is next',
    )!;
    const first = s.v2.days[0].extras!.find(r => r.key === 'Firstthird')!;
    expect(first.minutes).toBe(1440 + 5);
    expect(s.v1.nextKey).toBe('Firstthird');
  });

  it('writes a time that does not occur as no minutes, and the adapter draws the dash', () => {
    const s = scenarios.find(x => x.name === 'ʿIshāʾ does not occur here')!;
    const isha = s.v2.days[0].prayers.find(r => r.key === 'Isha')!;
    expect(isha.minutes).toBeUndefined();
    const back = widgetPayloadV1FromV2(
      readWidgetContractPayload(wire(s.v2))!,
      s.now,
    )!;
    expect(back.days![0].rows.find(r => r.key === 'Isha')!.time).toBe('—');
  });

  it('records the clock the app draws with', () => {
    const twelve = scenarios.find(
      x => x.name === 'midday, 12-hour, every block',
    )!;
    expect(twelve.v2.clock).toEqual({
      hour12: true,
      am: 'AM',
      pm: 'PM',
      periodFirst: false,
    });
    const twentyFour = scenarios.find(x => x.name === 'midday, 24-hour')!;
    expect(twentyFour.v2.clock).toEqual({ hour12: false });
  });

  it('records each day under the offset the device had for it', () => {
    const s = scenarios[0];
    const noon = new Date(2026, 3, 9, 12, 0, 0, 0);
    expect(s.v2.days[0].utcOffsetMinutes).toBe(-noon.getTimezoneOffset() || 0);
  });

  it('has nothing to say without days, so the widget reads v1', () => {
    const read = readWidgetContractPayload({ schemaVersion: 2, days: [] })!;
    expect(
      widgetPayloadV1FromV2(read, { todayKey: '2026-04-09', nowMinutes: 0 }),
    ).toBeNull();
  });

  it('when the app has not run since, draws the first day not yet past', () => {
    const s = scenarios.find(x => x.name === 'midday, 24-hour')!;
    const read = readWidgetContractPayload(wire(s.v2))!;
    // Two days on: the window's third day is today now.
    const later = widgetPayloadV1FromV2(read, {
      todayKey: '2026-04-11',
      nowMinutes: 13 * 60,
    })!;
    expect(later.dayLabel).toBe(s.v1.days![2].dayLabel);
    expect(later.nextKey).toBe('Asr');
    // A week on: nothing left but the last day, drawn as it was.
    const stale = widgetPayloadV1FromV2(read, {
      todayKey: '2026-04-20',
      nowMinutes: 0,
    })!;
    expect(stale.dayLabel).toBe(s.v1.days![2].dayLabel);
  });
});
