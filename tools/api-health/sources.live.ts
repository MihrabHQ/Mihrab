/**
 * Live check of every source the app reads, through the app's own code.
 *   npx jest -c tools/api-health/jest.live.config.js
 * Not part of the unit suite (it needs the network).
 */
jest.unmock('adhan');

const real = (global as any).__realFetch as typeof fetch;
const calls: { url: string; status: number | string; ms: number }[] = [];
(global as any).fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const t = Date.now();
  try {
    const r = await real(input, init);
    calls.push({ url, status: r.status, ms: Date.now() - t });
    return r;
  } catch (e) {
    calls.push({ url, status: `ERR ${(e as Error).message}`, ms: Date.now() - t });
    throw e;
  }
};

import { fetchPrayerTimesUnified } from '../../src/providers/fetchPrayerTimes';
import { refreshMethodCurrency, methodCurrency } from '../../src/providers/methodCurrency';
import { CORRECTION_AUTHORITIES, correctionsInForce } from '../../src/providers/swedenCorrections';
import { METHODS_CERTIFICATION_URL, HIJRI_OVERRIDES_URL } from '../../src/config/datasets';
import type { PrayerDataProviderId } from '../../src/settings/types';

const today = new Date();
const CASES: [PrayerDataProviderId, string, number, number, number | 'auto', string[]][] = [
  ['aladhan', 'London (MWL)', 51.5074, -0.1278, 3, ['aladhan']],
  ['aladhan', 'London (auto)', 51.5074, -0.1278, 'auto', ['local']],
  ['aladhan', 'Cairo (auto)', 30.0444, 31.2357, 'auto', ['local', 'aladhan']],
  ['aladhan', 'Mecca (auto)', 21.4225, 39.8262, 'auto', ['aladhan']],
  ['islamiska_forbundet', 'Stockholm', 59.3293, 18.0686, 'auto', []],
  ['habous', 'Casablanca', 33.5945, -7.62, 'auto', []],
  ['marw', 'Algiers', 36.7538, 3.0588, 'auto', []],
  ['kemenag', 'Jakarta', -6.2088, 106.8456, 'auto', []],
  ['muis', 'Singapore', 1.3521, 103.8198, 'auto', []],
  ['jakim', 'Kuala Lumpur', 3.139, 101.6869, 'auto', []],
  ['namazvakti', 'Istanbul', 41.0082, 28.9784, 'auto', []],
  ['namazvakti', 'Cologne', 50.9375, 6.9603, 'auto', []],
  ['diyanet', 'Ankara', 39.9334, 32.8597, 'auto', []],
  ['diyanet', 'New York', 40.7128, -74.006, 'auto', []],
  ['diyanet', 'Tromsø', 69.6492, 18.9553, 'auto', []],
  ['local_adhan', 'Sydney', -33.8688, 151.2093, 'auto', ['local']],
];

const report: string[] = [];
afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(report.join('\n') + '\n\nREQUESTS\n' + calls.map(c => `${c.status} ${c.ms}ms ${c.url}`).join('\n'));
});

describe('prayer-time sources, live', () => {
  it.each(CASES)('%s — %s', async (provider, label, latitude, longitude, calculationMethod) => {
    const n0 = calls.length;
    const t = Date.now();
    const r = await fetchPrayerTimesUnified({ provider, latitude, longitude, date: today, calculationMethod, school: 0 });
    const tm = r.timings as Record<string, string>;
    report.push(
      `${provider.padEnd(20)} ${label.padEnd(16)} source=${String(r.source).padEnd(16)} ${Date.now() - t}ms ` +
        `F ${tm.Fajr} S ${tm.Sunrise} D ${tm.Dhuhr} A ${tm.Asr} M ${tm.Maghrib} I ${tm.Isha} ` +
        `req=${calls.slice(n0).map(c => `${c.status}`).join(',') || 'none'}`,
    );
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(tm[k]).toMatch(/^\d{1,2}:\d{2}/);
    }
    // In order around the clock (times are written on the runner's clock, so
    // a far place's day can straddle midnight): one wrap at most.
    const mins = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => {
      const [h, m] = tm[k].split(':').map(Number);
      return h * 60 + m;
    });
    let wraps = 0;
    for (let i = 1; i < 6; i++) if (mins[i] <= mins[i - 1]) wraps++;
    if (mins[0] < mins[5]) wraps++; // Isha back round to Fajr
    expect(wraps).toBe(1);
  });
});

describe('the methods repo', () => {
  it('certification and correction lists are current for this build', async () => {
    await refreshMethodCurrency(true);
    const res = await real(METHODS_CERTIFICATION_URL);
    const cert = await res.json();
    for (const a of CORRECTION_AUTHORITIES) {
      const c = methodCurrency(a, today);
      const inForce = correctionsInForce(a);
      report.push(`method ${a.padEnd(10)} ${JSON.stringify(c)} inForce=${inForce.from}..${inForce.to} (${inForce.entries}) cert=${JSON.stringify(cert[a])}`);
      expect(c.state).toBe('current');
    }
  });
  it('hijri overrides parse', async () => {
    const r = await real(HIJRI_OVERRIDES_URL);
    expect(r.status).toBe(200);
    await r.json();
  });
});
