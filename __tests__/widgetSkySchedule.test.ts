import { widgetSkyAt, widgetSkySchedule } from '../src/widget/widgetSkySchedule';
import { skyFrame, skyMoment } from '../src/screens/home/skyModel';
import { PALETTE_STEPS, skyMoodFor, widgetSkyColors } from '../src/theme/skyMoods';

const stockholm = {
  day: '2026-11-02',
  times: { Fajr: '05:25', Sunrise: '07:20', Dhuhr: '11:40', Asr: '13:20', Maghrib: '15:55', Isha: '17:40' },
  tomorrowFajr: '05:27',
  where: { latitude: 59.33, longitude: 18.07 },
};

describe('widgetSkySchedule', () => {
  it('covers the day from its first minute, in order, with the theme\'s own colours', () => {
    const s = widgetSkySchedule(stockholm);
    expect(s.length).toBeGreaterThan(10);
    expect(s[0][0]).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i][0]).toBeGreaterThan(s[i - 1][0]);
    for (const [, bg, accent] of s) {
      expect(bg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    // A minute's segment is what the app itself would hand the widget then.
    for (const minute of [90, 6 * 60 + 10, 13 * 60, 15 * 60 + 50, 21 * 60]) {
      const at = new Date(2026, 10, 2, 0, minute);
      const m = skyMoment(stockholm.times, at, stockholm.tomorrowFajr);
      const light = skyFrame(m, at, stockholm.where).light;
      const want = widgetSkyColors(skyMoodFor(m.passage, m.t, PALETTE_STEPS, undefined, light));
      const got = widgetSkyAt(s, minute);
      expect(got?.[1]).toBe(want.bg);
      expect(got?.[2]).toBe(want.accent);
    }
  });

  it('changes with the variant and is empty for a day that cannot be placed', () => {
    const vibrant = widgetSkySchedule(stockholm, 'vibrant');
    const realistic = widgetSkySchedule(stockholm, 'realistic');
    expect(JSON.stringify(vibrant)).not.toBe(JSON.stringify(realistic));
    expect(widgetSkySchedule({ day: 'nope', times: {} })).toEqual([]);
  });

  it('widgetSkyAt takes the last segment that has begun, the day\'s last before the first', () => {
    const s: [number, string, string][] = [
      [10, '#000001', '#000002'],
      [600, '#000003', '#000004'],
    ];
    expect(widgetSkyAt(s, 5)?.[1]).toBe('#000003');
    expect(widgetSkyAt(s, 10)?.[1]).toBe('#000001');
    expect(widgetSkyAt(s, 599)?.[1]).toBe('#000001');
    expect(widgetSkyAt(s, 1439)?.[1]).toBe('#000003');
    expect(widgetSkyAt([], 0)).toBeNull();
  });
});
