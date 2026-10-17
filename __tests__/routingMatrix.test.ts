/**
 * WHICH SOURCE AND METHOD A PLACE GETS, OVER 206 REAL PLACES.
 *
 * Every row is a real place — capitals, and the border towns, straits,
 * islands and enclaves where a rectangle or a reach of a few kilometres
 * could hand a place its neighbour's source (`fixtures/routingPlaces.ts`).
 * For each, the expected answer is derived from the app's own stated rules
 * (CHANGELOG, `regionalProviders.ts`, `autoMethod.ts`) and the country the
 * place is in — never from the code under test:
 *
 *  - a country with a source of its own gets it under Automatic: Sweden
 *    Islamiska Förbundet, Algeria the Ministry (marw), Morocco with Western
 *    Sahara, Ceuta and Melilla the Habous ministry, Singapore MUIS, Malaysia
 *    JAKIM, Indonesia Kemenag, Türkiye and Northern Cyprus Diyanet;
 *  - with a method chosen by hand, MUIS, JAKIM, Kemenag and Diyanet give
 *    way to AlAdhan with that method; Sweden's, Algeria's and Morocco's
 *    sources do not;
 *  - a country with a calculation method of its own gets AlAdhan (its
 *    method), never Diyanet for a place Diyanet lists nearby;
 *  - anywhere else, Diyanet where it lists a place within 25 km, else
 *    AlAdhan;
 *  - offline, Automatic's method is the country's own where it has one.
 *
 * `ROUTING_MATRIX=1 npx jest __tests__/routingMatrix.test.ts` prints the table.
 */
import { ROUTING_PLACES } from './fixtures/routingPlaces';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { autoMethodForCoords } from '../src/providers/autoMethod';
import {
  countryAt,
  NATIONAL_METHOD_COUNTRIES,
  nationalMethodCountryAt,
} from '../src/utils/countryAt';
import { nearestDiyanetPlace } from '../src/providers/diyanetMethod';
import { providerHidesHanafiAsr } from '../src/settings/providerUi';
import { CALCULATION_METHODS } from '../src/settings/methods';
import type { PrayerDataProviderId } from '../src/settings/types';

const OWN_SOURCE: Record<
  string,
  { source: PrayerDataProviderId; method: number; yields: boolean }
> = {
  SE: { source: 'islamiska_forbundet', method: 24, yields: false },
  DZ: { source: 'marw', method: 19, yields: false },
  MA: { source: 'habous', method: 21, yields: false },
  'ES-MA': { source: 'habous', method: 21, yields: false },
  SG: { source: 'muis', method: 11, yields: true },
  MY: { source: 'jakim', method: 17, yields: true },
  ID: { source: 'kemenag', method: 20, yields: true },
  TR: { source: 'diyanet', method: 13, yields: true },
  'TR-CY': { source: 'diyanet', method: 13, yields: true },
};

/** The country's own method, as listed under Calculation method (Bahrain, Oman, Iraq: not read off anything, MWL). */
const NATIONAL_METHOD: Record<string, number> = {
  SA: 4,
  EG: 5,
  PK: 1,
  IN: 1,
  BD: 1,
  IR: 7,
  KW: 9,
  QA: 10,
  AE: 16,
  RU: 14,
  TN: 18,
  PT: 22,
  JO: 23,
  BH: 3,
  OM: 3,
  IQ: 3,
};

const SNAP_KM_ABROAD = 25;
const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180;
  return (
    6371 *
    Math.hypot(
      (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r),
      (bLat - aLat) * r,
    )
  );
};

type Row = {
  name: string;
  country: string;
  auto: PrayerDataProviderId;
  method: number;
  chosen3: PrayerDataProviderId;
  hanafi: boolean;
  near: string;
};

const rows: Row[] = ROUTING_PLACES.map(
  ([name, latitude, longitude, country]) => {
    const at = { latitude, longitude };
    const p = nearestDiyanetPlace(latitude, longitude);
    const auto = getEffectiveDataProvider(true, 'aladhan', at, 'auto');
    return {
      name,
      country,
      auto,
      method: autoMethodForCoords(latitude, longitude),
      chosen3: getEffectiveDataProvider(true, 'aladhan', at, 3),
      hanafi: !providerHidesHanafiAsr(auto),
      near: p
        ? `${p.name}${p.years ? ' (district)' : ''} ${km(
            latitude,
            longitude,
            p.lat,
            p.lon,
          ).toFixed(1)} km`
        : '',
    };
  },
);

if (process.env.ROUTING_MATRIX) {
  const pad = (s: string | number | boolean, n: number) => String(s).padEnd(n);
  console.log(
    [
      `${pad('place', 26)}${pad('in', 7)}${pad('Automatic', 21)}${pad(
        'method',
        7,
      )}${pad('with MWL chosen', 21)}${pad('Hanafi', 7)}nearest Diyanet place`,
      ...rows.map(
        r =>
          `${pad(r.name, 26)}${pad(r.country, 7)}${pad(r.auto, 21)}${pad(
            r.method,
            7,
          )}${pad(r.chosen3, 21)}${pad(r.hanafi ? 'yes' : 'no', 7)}${r.near}`,
      ),
    ].join('\n'),
  );
}

describe('the routing matrix', () => {
  it.each(ROUTING_PLACES.map((p, i) => [p[0], p[3], i] as const))(
    '%s (%s)',
    (_name, country, i) => {
      const [, latitude, longitude] = ROUTING_PLACES[i];
      const row = rows[i];
      const own = OWN_SOURCE[country];
      if (own) {
        expect(row.auto).toBe(own.source);
        expect(row.method).toBe(own.method);
        expect(row.chosen3).toBe(own.yields ? 'aladhan' : own.source);
      } else if (country in NATIONAL_METHOD) {
        // Its own method, by AlAdhan: never Diyanet for a listed place nearby.
        expect(nationalMethodCountryAt(latitude, longitude)).toBe(country);
        expect(row.auto).toBe('aladhan');
        expect(row.method).toBe(NATIONAL_METHOD[country]);
        expect(row.chosen3).toBe('aladhan');
      } else {
        expect(nationalMethodCountryAt(latitude, longitude)).toBeNull();
        const p = nearestDiyanetPlace(latitude, longitude);
        // Abroad a listed place stands in only within 25 km — a district in
        // Türkiye too (Kastellorizo's Kaş is 6 km off; Svilengrad's Edirne 30).
        if (p)
          expect(km(latitude, longitude, p.lat, p.lon)).toBeLessThanOrEqual(
            SNAP_KM_ABROAD,
          );
        expect(row.auto).toBe(p ? 'diyanet' : 'aladhan');
        expect(row.method).toBe(3);
        expect(row.chosen3).toBe('aladhan');
      }
      // The Hanafi switch is offered wherever the source computes or serves
      // a Hanafi Asr; the national tables that print one Asr say so instead.
      expect(row.hanafi).toBe(
        !['islamiska_forbundet', 'habous', 'marw', 'muis', 'jakim'].includes(
          row.auto,
        ),
      );
    },
  );

  it('covers every country with a method of its own, and each one in the table', () => {
    const seen = new Set(ROUTING_PLACES.map(p => p[3]));
    for (const c of NATIONAL_METHOD_COUNTRIES) expect(seen.has(c)).toBe(true);
    expect(Object.keys(NATIONAL_METHOD).sort()).toEqual([
      ...NATIONAL_METHOD_COUNTRIES,
    ]);
  });

  it('has a place for every country whose method is listed', () => {
    // Every listed method that is a country's own, and where Automatic sends
    // that country: France's (12) is the one without — France has no source
    // of its own and AlAdhan is not asked for it by Automatic, so Paris is
    // Diyanet's for a listed place, as any other European capital.
    const country: Record<number, string | null> = {
      0: null,
      1: 'PK',
      2: null,
      3: null,
      4: 'SA',
      5: 'EG',
      7: 'IR',
      8: null,
      9: 'KW',
      10: 'QA',
      11: 'SG',
      12: null,
      13: 'TR',
      14: 'RU',
      15: null,
      16: 'AE',
      17: 'MY',
      18: 'TN',
      19: 'DZ',
      20: 'ID',
      21: 'MA',
      22: 'PT',
      23: 'JO',
      24: 'SE',
      99: null,
    };
    for (const m of CALCULATION_METHODS) {
      if (m.id === 'auto') continue;
      expect(m.id in country).toBe(true);
      const c = country[m.id];
      if (!c) continue;
      const place = ROUTING_PLACES.find(p => p[3] === c);
      expect(place).toBeDefined();
      expect(autoMethodForCoords(place![1], place![2])).toBe(m.id);
    }
  });
});

describe('across a border, a strait or a sea', () => {
  const at = (latitude: number, longitude: number) => ({ latitude, longitude });
  const auto = (latitude: number, longitude: number) =>
    getEffectiveDataProvider(true, 'aladhan', at(latitude, longitude), 'auto');

  it('a national outline and its reach do not take in the neighbour’s border towns', () => {
    // These got the neighbour's method: the rough outline and its 10 km reach
    // ran over the border. Each is a place Diyanet lists, so Automatic is Diyanet.
    for (const [lat, lon] of [
      [38.8794, -6.9707], // Badajoz, by Portugal
      [61.1719, 28.7524], // Imatra, by Russia
      [31.8569, 35.4597], // Jericho, by Jordan
      [31.2969, 34.2455], // Rafah, by Egypt
      [42.0476, -8.6447], // Tui, by Portugal
      [30.96, 61.86], // Zaranj, by Iran
      [32.6189, 36.1021], // Daraa, by Jordan
      [38.4562, 48.875], // Astara, Azerbaijan, by Iran
      [29.5577, 34.9519], // Eilat, by Jordan and Egypt
    ] as const) {
      expect(nationalMethodCountryAt(lat, lon)).toBeNull();
      expect(auto(lat, lon)).toBe('diyanet');
      expect(autoMethodForCoords(lat, lon)).toBe(3);
    }
    // Narva, across the river from Ivangorod: Estonia's, which has no method
    // and no listed place within reach — and Ivangorod is Russia's.
    expect(nationalMethodCountryAt(59.3797, 28.1791)).toBeNull();
    expect(nationalMethodCountryAt(59.3766, 28.2116)).toBe('RU');
    expect(autoMethodForCoords(59.3766, 28.2116)).toBe(14);
  });

  it('and still answer for their own side of it', () => {
    expect(nationalMethodCountryAt(38.8807, -7.1628)).toBe('PT'); // Elvas
    expect(nationalMethodCountryAt(29.5321, 35.0063)).toBe('JO'); // Aqaba
    expect(nationalMethodCountryAt(29.4925, 34.8969)).toBe('EG'); // Taba
    expect(nationalMethodCountryAt(38.4258, 48.8725)).toBe('IR'); // Astara, Iran
    expect(nationalMethodCountryAt(42.2, 45.65)).toBe('RU'); // Dagestan, a few km from Georgia's outline
  });

  it('a district in Türkiye stands in for a place abroad only within 25 km', () => {
    // Svilengrad is 30 km from Edirne, Aleppo's countryside 30–40 km from Hatay's.
    expect(nearestDiyanetPlace(41.85, 26.25)).toBeNull();
    expect(nearestDiyanetPlace(35.65, 36.2)).toBeNull();
    // In Türkiye a district reaches 40 km.
    const inside = nearestDiyanetPlace(37.6, 44.0); // Hakkâri's mountains
    expect(inside?.years).toBeDefined();
  });

  it('the strait of Gibraltar, Ceuta and Melilla', () => {
    expect(auto(36.0143, -5.6044)).toBe('diyanet'); // Tarifa: Spain, Algeciras listed
    expect(auto(36.1408, -5.3536)).toBe('diyanet'); // Gibraltar
    expect(auto(35.8894, -5.3213)).toBe('habous'); // Ceuta
    expect(auto(35.2923, -2.9381)).toBe('habous'); // Melilla
    expect(countryAt(36.0, -5.45)).not.toBe('MA'); // mid-strait, nearer Spain
  });
});

describe('no place', () => {
  it('(0, 0), NaN and no coordinates are nobody’s country', () => {
    for (const [lat, lon] of [
      [0, 0],
      [NaN, NaN],
      [NaN, 18],
      [59.3, NaN],
      [Infinity, 0],
    ] as const) {
      expect(countryAt(lat, lon)).toBeNull();
      expect(nationalMethodCountryAt(lat, lon)).toBeNull();
      expect(autoMethodForCoords(lat, lon)).toBe(3);
      expect(
        getEffectiveDataProvider(
          true,
          'aladhan',
          { latitude: lat, longitude: lon },
          'auto',
        ),
      ).toBe('aladhan');
    }
    expect(getEffectiveDataProvider(true, 'aladhan', null, 'auto')).toBe(
      'aladhan',
    );
    // A pin with no location yet stands until one loads.
    expect(getEffectiveDataProvider(false, 'habous', null, 'auto')).toBe(
      'habous',
    );
  });

  it('asked again, the same answer (and asked in between, too)', () => {
    const a = countryAt(65.8481, 24.1466);
    countryAt(65.8355, 24.1368);
    expect(countryAt(65.8481, 24.1466)).toBe(a);
    for (let i = 0; i < 600; i++) countryAt(10 + i / 100, 10);
    expect(countryAt(65.8481, 24.1466)).toBe('FI');
    expect(countryAt(65.8355, 24.1368)).toBe('SE');
  });
});
