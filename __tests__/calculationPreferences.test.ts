/**
 * The high-latitude rule and the Custom method: the same answer online
 * (what AlAdhan is asked for) and on the phone (what adhan.js computes).
 *
 * The readings are AlAdhan's, taken 14 Oct 2026, for Stockholm on
 * midsummer night under MWL with each of its three rules, and for Paris
 * with custom angles 16° / 14° on 30 Aug 2026.
 */
jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { fetchAladhanTimes } from '../src/providers/aladhan';
import {
  _resetCalculationPreferencesForTests,
  calculationPreferencesKey,
  coerceCustomAngle,
  coerceHighLatitudeRule,
  CUSTOM_METHOD_ID,
  setCalculationPreferences,
} from '../src/prayer/calculationPreferences';
import { CALCULATION_METHODS } from '../src/settings/methods';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const MIDSUMMER = new Date(2026, 5, 21);

function wall(date: Date, hhmm: string, timeZone: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  return local.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const within = (a: string, b: string, tol: number) => Math.abs(minutes(a) - minutes(b)) <= tol;

beforeEach(() => {
  _resetCalculationPreferencesForTests();
  (fetchWithRetry as jest.Mock).mockReset();
});

describe('the summer-night rule', () => {
  const read = () => {
    const t = computeLocalAdhanTimes({ ...STOCKHOLM, date: MIDSUMMER, calculationMethod: 3, school: 0 }).timings;
    return [wall(MIDSUMMER, t.Fajr, 'Europe/Stockholm'), wall(MIDSUMMER, t.Isha, 'Europe/Stockholm')];
  };

  it('is angle-based by default, as AlAdhan’s is — not the library’s middle of the night', () => {
    expect(DEFAULT_SETTINGS.highLatitudeRule).toBe('angle_based');
    const [fajr, isha] = read();
    expect(within(fajr, '01:54', 1)).toBe(true);
    expect(within(isha, '23:40', 1)).toBe(true);
  });

  it('computes the other two rules as AlAdhan does', () => {
    setCalculationPreferences({ highLatitudeRule: 'middle_of_night' });
    let [fajr, isha] = read();
    expect(within(fajr, '00:50', 1)).toBe(true);
    expect(within(isha, '00:50', 1)).toBe(true);
    setCalculationPreferences({ highLatitudeRule: 'seventh_of_night' });
    [fajr, isha] = read();
    expect(within(fajr, '02:45', 1)).toBe(true);
    expect(within(isha, '22:54', 1)).toBe(true);
  });

  it('is sent to AlAdhan by its number', async () => {
    (fetchWithRetry as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { timings: { Fajr: '01:00', Sunrise: '03:00', Dhuhr: '12:00', Asr: '16:00', Maghrib: '22:00', Isha: '23:00' } } }),
    });
    await fetchAladhanTimes({ ...STOCKHOLM, date: MIDSUMMER, method: 3, school: 0 });
    expect(String((fetchWithRetry as jest.Mock).mock.calls[0][0])).toContain('latitudeAdjustmentMethod=3');
    setCalculationPreferences({ highLatitudeRule: 'seventh_of_night' });
    await fetchAladhanTimes({ ...STOCKHOLM, date: MIDSUMMER, method: 3, school: 0 });
    expect(String((fetchWithRetry as jest.Mock).mock.calls[1][0])).toContain('latitudeAdjustmentMethod=2');
  });

  it('leaves Moonsighting Committee’s own seasonal rule alone', () => {
    const before = computeLocalAdhanTimes({ ...STOCKHOLM, date: MIDSUMMER, calculationMethod: 15, school: 0 }).timings;
    setCalculationPreferences({ highLatitudeRule: 'seventh_of_night' });
    const after = computeLocalAdhanTimes({ ...STOCKHOLM, date: MIDSUMMER, calculationMethod: 15, school: 0 }).timings;
    expect(after).toEqual(before);
  });
});

describe('custom angles', () => {
  const PARIS = { latitude: 48.8566, longitude: 2.3522 };
  const DATE = new Date(2026, 7, 30);

  it('is in the picker, and computes AlAdhan’s method 99 reading for 16° / 14°', () => {
    expect(CALCULATION_METHODS.find(m => m.id === CUSTOM_METHOD_ID)?.nameKey).toBe('methods.99');
    setCalculationPreferences({ customFajrAngle: 16, customIshaAngle: 14 });
    const t = computeLocalAdhanTimes({ ...PARIS, date: DATE, calculationMethod: CUSTOM_METHOD_ID, school: 0 }).timings;
    expect(within(wall(DATE, t.Fajr, 'Europe/Paris'), '05:22', 1)).toBe(true);
    expect(within(wall(DATE, t.Isha, 'Europe/Paris'), '22:04', 1)).toBe(true);
  });

  it('asks AlAdhan with method 99 and the angles', async () => {
    (fetchWithRetry as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { timings: { Fajr: '05:00', Sunrise: '07:00', Dhuhr: '13:00', Asr: '17:00', Maghrib: '20:00', Isha: '22:00' } } }),
    });
    setCalculationPreferences({ customFajrAngle: 16, customIshaAngle: 14 });
    await fetchAladhanTimes({ ...PARIS, date: DATE, method: CUSTOM_METHOD_ID, school: 0 });
    const url = String((fetchWithRetry as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('method=99');
    expect(url).toContain('methodSettings=16%2Cnull%2C14');
  });

  it('keeps an angle within the twilight range, to a tenth', () => {
    expect(coerceCustomAngle('16.25', 18)).toBe(16.3);
    expect(coerceCustomAngle(3, 18)).toBe(10);
    expect(coerceCustomAngle(40, 18)).toBe(24);
    expect(coerceCustomAngle('x', 18)).toBe(18);
    expect(coerceHighLatitudeRule('nonsense')).toBe('angle_based');
  });
});

describe('the cache key', () => {
  it('is unchanged at the defaults, so nothing cached before is lost', () => {
    expect(calculationPreferencesKey(3)).toBe('');
    expect(calculationPreferencesKey(CUSTOM_METHOD_ID)).toBe('ca=18/17');
    setCalculationPreferences({ highLatitudeRule: 'middle_of_night', customFajrAngle: 16 });
    expect(calculationPreferencesKey(3)).toBe('hl=middle_of_night');
    expect(calculationPreferencesKey(CUSTOM_METHOD_ID)).toBe('hl=middle_of_night;ca=16/17');
  });
});
