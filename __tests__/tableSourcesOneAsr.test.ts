/**
 * Sweden's, Morocco's and Algeria's sources are each a ministry's table,
 * computed on the phone, and each ministry prints ONE Asr — the standard
 * shadow. The rule the app keeps for a source that prints one Asr: the
 * Hanafi toggle is hidden, Settings says so to a Hanafi reader, and every
 * path of the source gives the printed Asr. Kemenag takes the Hanafi shadow
 * (its toggle is shown); these three do not, on purpose, and say so.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { providerHidesHanafiAsr } from '../src/settings/providerUi';

const mockCompute = jest.fn();
jest.mock('../src/providers/localAdhan', () => {
  const actual = jest.requireActual('../src/providers/localAdhan');
  return {
    ...actual,
    computeLocalAdhanTimes: (...a: unknown[]) => {
      mockCompute(...a);
      return actual.computeLocalAdhanTimes(...a);
    },
  };
});

// eslint-disable-next-line import/first
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';

const read = (...p: string[]) =>
  readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const BERLIN = { latitude: 52.52, longitude: 13.405 }; // past every Swedish city's reach
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const RABAT = { latitude: 34.0209, longitude: -6.8416 };
const ALGIERS = { latitude: 36.7538, longitude: 3.0588 };

beforeEach(() => mockCompute.mockClear());

describe('one printed Asr: toggle hidden, note shown', () => {
  it.each(['islamiska_forbundet', 'habous', 'marw'] as const)(
    '%s hides the Hanafi toggle',
    id => {
      expect(providerHidesHanafiAsr(id)).toBe(true);
    },
  );

  it('Settings shows the note to a Hanafi reader of such a source', () => {
    const card = read('src', 'screens', 'settings', 'CalculationCard.tsx');
    expect(card).toMatch(
      /providerHidesHanafiAsr\(effectiveProvider\) \?[\s\S]{0,200}settings\.school === 1[\s\S]{0,200}settings\.hanafiAsrPublished/,
    );
  });
});

describe('every path of the source computes the standard Asr', () => {
  const schoolsAsked = () =>
    mockCompute.mock.calls.map(c => (c[0] as { school?: number }).school);

  it.each([
    ['islamiska_forbundet', STOCKHOLM],
    ['islamiska_forbundet', BERLIN], // the stand-in beyond the listed cities
    ['habous', RABAT],
    ['marw', ALGIERS],
  ] as const)('%s at %o, with Hanafi set', async (provider, at) => {
    await fetchPrayerTimesUnified({
      provider,
      ...at,
      date: new Date(2026, 9, 17, 12),
      calculationMethod: 'auto',
      school: 1,
      offline: true,
    });
    expect(mockCompute).toHaveBeenCalled();
    expect(schoolsAsked().every(s => s === 0)).toBe(true);
  });
});
