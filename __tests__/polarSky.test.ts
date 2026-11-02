/**
 * The sky where the sun does not rise, or does not set: Tromsø (69.65° N)
 * in December and in June. The passages come from the tables' times as
 * anywhere; the colours and the bodies follow the real sun.
 */
import { skyFrame, skyMoment } from '../src/screens/home/skyModel';
import { PALETTE_STEPS, POLAR_UNDER, nominalSkyLight, skyMoodFor, skyMoodOf } from '../src/theme/skyMoods';

const TROMSO = { latitude: 69.65, longitude: 18.96 };
const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };

describe('the polar day', () => {
  const times = { Fajr: '07:30', Sunrise: '10:30', Dhuhr: '11:50', Asr: '12:40', Maghrib: '13:10', Isha: '15:30' };
  const at = (h: number, m = 0) => new Date(2026, 11, 20, h, m);

  it('wears the twilight, not the sunrise\'s light page, through a "day" the sun spends under the horizon', () => {
    for (const [h, passage] of [[11, 'day'], [12, 'day'], [13, 'sunset']] as const) {
      const m = skyMoment(times, at(h));
      expect(m.passage).toBe(passage);
      const f = skyFrame(m, at(h), TROMSO);
      expect(f.light.sun).toBeLessThan(-POLAR_UNDER);
      for (const variant of ['realistic', 'vibrant'] as const) {
        const mood = skyMoodFor(m.passage, m.t, PALETTE_STEPS, variant, f.light);
        expect(mood.isDark).toBe(true);
        // The colours the dawn or the dusk at that depth wears, to the
        // quantisation's rounding.
        const twin = skyMoodFor(h < 12 ? 'dawn' : 'dusk', h < 12 ? 1 : 0, PALETTE_STEPS, variant, f.light);
        const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
        rgb(mood.heroTop).forEach((c, i) => expect(Math.abs(c - rgb(twin.heroTop)[i])).toBeLessThanOrEqual(4));
      }
      // No sun on the arc: it is under the horizon.
      expect(f.body.kind).toBe('sun');
      if (f.body.kind === 'sun') expect(f.body.below).toBe(1);
      // The frame's own gradient is dark too (the alarm, the launch).
      expect(f.top).toBe(skyMoodFor(m.passage, m.t, undefined, 'realistic', f.light).heroTop);
    }
  });

  it('is the morning\'s limb before solar noon and the evening\'s after', () => {
    const light = (daylight: number) => ({ sun: -3, daylight });
    const am = skyMoodOf('day', 0.2, light(0.2), 'realistic');
    const pm = skyMoodOf('day', 0.9, light(0.9), 'realistic');
    expect(am.heroTop).toBe(skyMoodOf('dawn', 1, light(0.2), 'realistic').heroTop);
    expect(pm.heroTop).toBe(skyMoodOf('dusk', 0, light(0.9), 'realistic').heroTop);
  });

  it('leaves the ordinary day alone — refraction\'s margin at sunrise and sunset is clamped, not switched', () => {
    for (const sun of [-1.4, -0.83, -0.2, 0]) {
      const l = { ...nominalSkyLight('day', 0.02), sun };
      expect(skyMoodOf('day', 0.02, l, 'realistic').isDark).toBe(false);
      expect(skyMoodOf('day', 0.02, l, 'realistic').heroTop).toBe(skyMoodOf('day', 0.02, { ...l, sun: 0 }, 'realistic').heroTop);
    }
    // A Stockholm December noon: seven degrees up, and the day's.
    const noon = new Date(2026, 11, 15, 11, 45);
    const m = skyMoment({ Fajr: '06:10', Sunrise: '08:35', Dhuhr: '11:45', Asr: '12:50', Maghrib: '14:50', Isha: '16:45' }, noon);
    const f = skyFrame(m, noon, STOCKHOLM);
    expect(f.light.sun).toBeGreaterThan(5);
    expect(skyMoodFor('day', m.t, PALETTE_STEPS, 'realistic', f.light).isDark).toBe(false);
    if (f.body.kind === 'sun') expect(f.body.below).toBe(0);
    // And the nominal day, with no coordinates, is what it was.
    const n = skyFrame(skyMoment(times, at(12)), at(12));
    expect(n.light.sun).toBeGreaterThan(0);
    if (n.body.kind === 'sun') expect(n.body.below).toBe(0);
  });
});

describe('the midnight sun', () => {
  const times = { Fajr: '01:30', Sunrise: '02:30', Dhuhr: '12:30', Asr: '17:00', Maghrib: '22:30', Isha: '23:30' };
  const at = (h: number) => new Date(2026, 5, 20, h, 0);

  it('wears the day through a "night" the sun stays up for, with no stars and no moon', () => {
    for (const [h, passage] of [[0, 'night'], [1, 'night'], [2, 'dawn'], [23, 'dusk']] as const) {
      const m = skyMoment(times, at(h), '01:30');
      expect(m.passage).toBe(passage);
      const f = skyFrame(m, at(h), TROMSO);
      expect(f.light.sun).toBeGreaterThan(POLAR_UNDER);
      const mood = skyMoodFor(m.passage, m.t, PALETTE_STEPS, 'realistic', f.light);
      expect(mood.isDark).toBe(false);
      expect(f.stars).toBe(0);
      expect(f.body.kind).not.toBe('moon');
    }
    // The ordinary night keeps its stars and its moon.
    const night = new Date(2026, 11, 20, 3, 0);
    const m = skyMoment({ Fajr: '07:30', Sunrise: '10:30', Dhuhr: '11:50', Asr: '12:40', Maghrib: '13:10', Isha: '15:30' }, night);
    const f = skyFrame(m, night, TROMSO);
    expect(m.passage).toBe('night');
    expect(f.stars).toBeGreaterThan(0.5);
  });

  it('a night that stays within the twilight — Stockholm in June — is still the night\'s own', () => {
    const l = { sun: -8, daylight: 1.5 };
    expect(skyMoodOf('night', 0.5, l, 'realistic').isDark).toBe(true);
    expect(skyMoodOf('night', 0.5, { sun: 1, daylight: 1.5 }, 'realistic').isDark).toBe(true);
    expect(skyMoodOf('night', 0.5, { sun: 2, daylight: 1.5 }, 'realistic').isDark).toBe(false);
  });
});
