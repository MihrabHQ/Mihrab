/**
 * Which source covers where, as a table rather than a chain of ifs.
 *
 * `getEffectiveDataProvider` used to hardcode Sweden twice — once in the
 * automatic branch and once in the manual-pin guard — which was fine while
 * Sweden was the only country-specific source and would have needed editing
 * in step for every one added after. These tests pin the behaviour that
 * matters so the table can grow without the logic being rewritten.
 */
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import {
  REGIONAL_PROVIDER_REGIONS,
  isRegionalProvider,
  regionalProviderCovers,
  regionalProviderForCoords,
} from '../src/settings/regionalProviders';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };
const LONDON = { latitude: 51.5072, longitude: -0.1276 };

/**
 * Where each national table is recommended, and where it is not: the
 * capitals and a few border towns, each with the source Automatic should
 * pick there — or null for a place no table covers, where the global
 * default answers. The neighbours matter most: a reader in Brunei, Dili,
 * southern Thailand or Papua New Guinea must not be handed the table of
 * the country next door.
 */
const PLACES: [string, number, number, string | null][] = [
  ['Singapore', 1.3521, 103.8198, 'muis'],
  ['Sentosa', 1.25, 103.83, 'muis'],
  ['Johor Bahru, across the causeway', 1.4927, 103.7414, 'jakim'],
  ['Kuala Lumpur', 3.139, 101.6869, 'jakim'],
  ['Kota Kinabalu', 5.9804, 116.0735, 'jakim'],
  ['Kuching', 1.5533, 110.3592, 'jakim'],
  ['Langkawi', 6.35, 99.8, 'jakim'],
  ['Tawau', 4.25, 117.89, 'jakim'],
  ['Nunukan, twenty kilometres from Tawau', 4.13, 117.66, 'kemenag'],
  ['Tarakan', 3.3, 117.63, 'kemenag'],
  ['Jakarta', -6.2088, 106.8456, 'kemenag'],
  ['Medan', 3.5952, 98.6722, 'kemenag'],
  ['Batam, across the strait from Singapore', 1.1, 104.05, 'kemenag'],
  ['Pontianak', -0.03, 109.33, 'kemenag'],
  ['Jayapura', -2.53, 140.72, 'kemenag'],
  ['Bandar Seri Begawan', 4.9031, 114.9398, null],
  ['Dili', -8.556, 125.56, null],
  ['Hat Yai', 7.0, 100.47, null],
  ['Pattani', 6.87, 101.25, null],
  ['Port Moresby', -9.44, 147.18, null],
  ['Manila', 14.6, 120.98, null],
  ['Darwin', -12.46, 130.84, null],
  ['Stockholm', 59.3293, 18.0686, 'islamiska_forbundet'],
  ['Casablanca', 33.5731, -7.5898, 'habous'],
  ['Algiers', 36.75, 3.06, 'marw'],
  ['London', 51.5072, -0.1276, null],
];

describe('each national table is recommended where it covers, and nowhere else', () => {
  it.each(PLACES)('%s', (_name, latitude, longitude, want) => {
    const coords = { latitude, longitude };
    expect(regionalProviderForCoords(coords)).toBe(want);
    // Automatic picks it there; pinned elsewhere, the pick gives way to what
    // Automatic picks there.
    expect(getEffectiveDataProvider(true, 'aladhan', coords)).toBe(want ?? 'aladhan');
    for (const id of REGIONAL_PROVIDER_REGIONS.map(r => r.id)) {
      expect(`${id} covers: ${regionalProviderCovers(id, coords)}`).toBe(`${id} covers: ${id === want}`);
      expect(getEffectiveDataProvider(false, id, coords)).toBe(id === want ? id : (want ?? 'aladhan'));
    }
  });
});

describe('the table', () => {
  it('covers every country that has a published source', () => {
    expect(REGIONAL_PROVIDER_REGIONS.map(r => r.id).sort()).toEqual([
      'habous',
      'islamiska_forbundet',
      'jakim',
      'kemenag',
      'marw',
      'muis',
    ]);
  });

  it('names the source for a coordinate, or nothing', () => {
    expect(regionalProviderForCoords(STOCKHOLM)).toBe('islamiska_forbundet');
    expect(regionalProviderForCoords(CASABLANCA)).toBe('habous');
    expect(regionalProviderForCoords(LONDON)).toBeNull();
    // Singapore sits inside the peninsula's box and must win there.
    expect(regionalProviderForCoords({ latitude: 1.3521, longitude: 103.8198 })).toBe('muis');
    expect(regionalProviderForCoords({ latitude: 1.4927, longitude: 103.7414 })).toBe('jakim'); // Johor Bahru
    expect(regionalProviderForCoords({ latitude: 5.9804, longitude: 116.0735 })).toBe('jakim'); // Kota Kinabalu
    expect(regionalProviderForCoords({ latitude: 4.9031, longitude: 114.9398 })).toBeNull(); // Bandar Seri Begawan
    expect(regionalProviderForCoords({ latitude: 1.1, longitude: 104.05 })).toBe('kemenag'); // Batam, across the strait
    expect(regionalProviderForCoords(null)).toBeNull();
  });

  it('knows which providers are country-specific', () => {
    expect(isRegionalProvider('habous')).toBe(true);
    expect(isRegionalProvider('islamiska_forbundet')).toBe(true);
    expect(isRegionalProvider('aladhan')).toBe(false);
    expect(isRegionalProvider('local_adhan')).toBe(false);
  });

  it('treats a global source as covering everywhere', () => {
    expect(regionalProviderCovers('aladhan', CASABLANCA)).toBe(true);
    expect(regionalProviderCovers('local_adhan', STOCKHOLM)).toBe(true);
  });

  it('leaves a pick alone when the location is unknown', () => {
    // No coordinate yet is not evidence of being out of region, and
    // redirecting on it would change the user's source on every cold start.
    expect(regionalProviderCovers('habous', null)).toBe(true);
    expect(regionalProviderCovers('islamiska_forbundet', null)).toBe(true);
  });
});

describe('automatic mode follows the user', () => {
  it.each([
    ['Sweden', STOCKHOLM, 'islamiska_forbundet'],
    ['Morocco', CASABLANCA, 'habous'],
    ['anywhere else', LONDON, 'aladhan'],
  ])('in %s', (_where, coords, expected) => {
    expect(getEffectiveDataProvider(true, 'aladhan', coords)).toBe(expected);
  });

  it('falls back to the global source with no location', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', null)).toBe('aladhan');
  });
});

describe('a manual pick is honoured, with one guard', () => {
  it('keeps a regional pick inside its own country', () => {
    expect(getEffectiveDataProvider(false, 'habous', CASABLANCA)).toBe('habous');
    expect(getEffectiveDataProvider(false, 'islamiska_forbundet', STOCKHOLM)).toBe(
      'islamiska_forbundet',
    );
  });

  it('redirects a regional pick once the user has left, to what Automatic picks there', () => {
    // The source only holds its own country's cities and maps anything else
    // to its nearest listed one, so a Moroccan table would otherwise be
    // presented as a Swedish user's own.
    expect(getEffectiveDataProvider(false, 'habous', STOCKHOLM)).toBe('islamiska_forbundet');
    expect(getEffectiveDataProvider(false, 'islamiska_forbundet', CASABLANCA)).toBe(
      'habous',
    );
    expect(getEffectiveDataProvider(false, 'habous', LONDON)).toBe('aladhan');
  });

  it('does not force a regional source on someone who chose otherwise', () => {
    // Being in Morocco does not overrule a deliberate pick of something
    // else. That direction is automatic mode's job.
    expect(getEffectiveDataProvider(false, 'aladhan', CASABLANCA)).toBe('aladhan');
    expect(getEffectiveDataProvider(false, 'local_adhan', CASABLANCA)).toBe('local_adhan');
  });

  it('leaves the pick untouched until a location is known', () => {
    expect(getEffectiveDataProvider(false, 'habous', null)).toBe('habous');
  });
});
