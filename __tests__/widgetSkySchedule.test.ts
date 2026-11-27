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

describe('the Android card under Sky, through the whole day', () => {
  // The card is the app's own page (`appsOwn`), a different colour every
  // few minutes. Whatever the minute, the place or the season, the text the
  // widget falls back to reads on it, and so does the hour's accent — the
  // native side then only ever improves on this (cardfit/CardInk, swept
  // over every colour in CardInkTest).
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const days = [
    { name: 'Stockholm, November', day: '2026-11-27', times: { Fajr: '05:35', Sunrise: '08:01', Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' }, tomorrowFajr: '05:37', where: { latitude: 59.33, longitude: 18.07 } },
    { name: 'Stockholm, June', day: '2026-06-21', times: { Fajr: '02:11', Sunrise: '03:31', Dhuhr: '12:50', Asr: '17:25', Maghrib: '22:08', Isha: '23:28' }, tomorrowFajr: '02:11', where: { latitude: 59.33, longitude: 18.07 } },
    { name: 'Mecca', day: '2026-11-27', times: { Fajr: '05:19', Sunrise: '06:39', Dhuhr: '12:08', Asr: '15:16', Maghrib: '17:37', Isha: '19:07' }, tomorrowFajr: '05:20', where: { latitude: 21.42, longitude: 39.83 } },
    { name: 'Quito', day: '2026-11-27', times: { Fajr: '04:44', Sunrise: '05:56', Dhuhr: '12:01', Asr: '15:24', Maghrib: '18:05', Isha: '19:16' }, tomorrowFajr: '04:44', where: { latitude: -0.18, longitude: -78.47 } },
    { name: 'Cape Town', day: '2026-11-27', times: { Fajr: '03:49', Sunrise: '05:29', Dhuhr: '12:34', Asr: '16:18', Maghrib: '19:40', Isha: '21:14' }, tomorrowFajr: '03:48', where: { latitude: -33.92, longitude: 18.42 } },
    { name: 'no place known', day: '2026-11-27', times: { Fajr: '05:35', Sunrise: '08:01', Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' }, tomorrowFajr: '05:37' },
  ];

  it.each(days.flatMap(d => (['realistic', 'vibrant'] as const).map(v => [d.name, v, d] as const)))(
    '%s, %s: text and accent read on every segment',
    (_name, variant, day) => {
      const s = widgetSkySchedule(day, variant, true);
      expect(s.length).toBeGreaterThan(10);
      let light = 0;
      for (const [minute, bg, accent] of s) {
        const text = Math.max(contrast('#E8EAED', bg), contrast('#1C1C1E', bg));
        if (text < 7 || contrast(accent, bg) < 3) {
          throw new Error(`${minute}: card ${bg}, text ${text.toFixed(2)}, accent ${accent} ${contrast(accent, bg).toFixed(2)}`);
        }
        if (lum(bg) > 0.5) light++;
      }
      // The day is light and the night is dark: the card is the app's page, not one slab.
      expect(light).toBeGreaterThan(0);
      expect(light).toBeLessThan(s.length);
    },
  );

  it('is the app’s page and accent at each minute, not a card of its own', () => {
    const day = days[0];
    const s = widgetSkySchedule(day, 'realistic', true);
    for (let minute = 0; minute < 1440; minute += 35) {
      const at = new Date(2026, 10, 27, 0, minute);
      const m = skyMoment(day.times, at, day.tomorrowFajr);
      const mood = skyMoodFor(m.passage, m.t, PALETTE_STEPS, 'realistic', skyFrame(m, at, day.where!).light);
      const got = widgetSkyAt(s, minute);
      expect(got?.[1]).toBe(mood.bg);
      expect(got?.[2]).toBe(mood.accent);
    }
  });
});
