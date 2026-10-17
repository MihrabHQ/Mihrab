/**
 * Automatic and the countries with a calculation method of their own.
 *
 * Diyanet lists places all over the world, Mecca and Tehran and Moscow among
 * them, and Automatic took its table within reach of any of them. Where the
 * country has a method of its own — the one AlAdhan's Automatic computes
 * there — that traded the country's method for Diyanet's, so Automatic now
 * takes Diyanet for being near only where the country has none. And where a
 * country's own source has a fixed method (Diyanet in Türkiye, MUIS, JAKIM,
 * Kemenag), a method the reader chose by hand is computed instead.
 */
import {
  getEffectiveDataProvider,
  isDiyanetByProximity,
} from '../src/settings/effectiveProvider';
import { regionalProviderForCoords } from '../src/settings/regionalProviders';
import { nearestDiyanetPlace } from '../src/providers/diyanetMethod';
import {
  NATIONAL_METHOD_COUNTRIES,
  nationalMethodCountryAt,
} from '../src/utils/countryAt';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

/** Places Diyanet lists nearby, in a country with a method of its own. */
const NATIONAL: [string, number, number, string][] = [
  ['Mecca', 21.4225, 39.8262, 'SA'],
  ['Riyadh', 24.7136, 46.6753, 'SA'],
  ['Medina', 24.4672, 39.6111, 'SA'],
  ['Tehran', 35.6892, 51.389, 'IR'],
  ['Najaf', 32.0, 44.33, 'IQ'],
  ['Baghdad', 33.3152, 44.3661, 'IQ'],
  ['Kuwait City', 29.3759, 47.9774, 'KW'],
  ['Doha', 25.2854, 51.531, 'QA'],
  ['Dubai', 25.2048, 55.2708, 'AE'],
  ['Manama', 26.2285, 50.586, 'BH'],
  ['Muscat', 23.588, 58.3829, 'OM'],
  ['Amman', 31.9539, 35.9106, 'JO'],
  ['Karachi', 24.8607, 67.0011, 'PK'],
  ['Lahore', 31.5204, 74.3587, 'PK'],
  ['Delhi', 28.6139, 77.209, 'IN'],
  ['Dhaka', 23.8103, 90.4125, 'BD'],
  ['Moscow', 55.7558, 37.6173, 'RU'],
  ['Cairo', 30.0444, 31.2357, 'EG'],
  ['Tunis', 36.8065, 10.1815, 'TN'],
  ['Lisbon', 38.7223, -9.1393, 'PT'],
];

/** Places Diyanet lists nearby, in a country with no method of its own. */
const NEAR_LISTED: [string, number, number][] = [
  ['London', 51.5072, -0.1276],
  ['Paris', 48.8566, 2.3522],
  ['Berlin', 52.52, 13.405],
  ['New York', 40.7128, -74.006],
  ['Vienna', 48.2082, 16.3738],
  ['Amsterdam', 52.3676, 4.9041],
  ['Damascus', 33.5138, 36.2765],
  ['Sarajevo', 43.8563, 18.4131],
];

describe('Automatic and a country with a method of its own', () => {
  it.each(NATIONAL)(
    '%s keeps AlAdhan (its country’s method), though Diyanet lists a place there',
    (_name, latitude, longitude, country) => {
      expect(nearestDiyanetPlace(latitude, longitude)).not.toBeNull();
      expect(nationalMethodCountryAt(latitude, longitude)).toBe(country);
      expect(regionalProviderForCoords(at(latitude, longitude))).toBeNull();
      expect(
        getEffectiveDataProvider(
          true,
          'aladhan',
          at(latitude, longitude),
          'auto',
        ),
      ).toBe('aladhan');
    },
  );

  it.each(NEAR_LISTED)(
    '%s takes Diyanet, near a place it lists',
    (_name, latitude, longitude) => {
      expect(nationalMethodCountryAt(latitude, longitude)).toBeNull();
      expect(
        getEffectiveDataProvider(
          true,
          'aladhan',
          at(latitude, longitude),
          'auto',
        ),
      ).toBe('diyanet');
    },
  );

  it('Istanbul takes Diyanet, its own country’s', () => {
    expect(
      getEffectiveDataProvider(true, 'aladhan', at(41.0082, 28.9784), 'auto'),
    ).toBe('diyanet');
  });

  it('leaves a pinned Diyanet alone in those countries', () => {
    expect(
      getEffectiveDataProvider(false, 'diyanet', at(21.4225, 39.8262), 'auto'),
    ).toBe('diyanet');
  });

  it('knows every country whose method is listed', () => {
    expect(NATIONAL_METHOD_COUNTRIES).toEqual(
      [
        'AE',
        'BD',
        'BH',
        'EG',
        'IN',
        'IQ',
        'IR',
        'JO',
        'KW',
        'OM',
        'PK',
        'PT',
        'QA',
        'RU',
        'SA',
        'TN',
      ].sort(),
    );
  });

  it('answers by the precise outline where it reaches, and the rough one elsewhere', () => {
    // Kaliningrad is in the precise outlines (near Sweden); Vladivostok only in the rough one.
    expect(nationalMethodCountryAt(54.71, 20.51)).toBe('RU');
    expect(nationalMethodCountryAt(43.1155, 131.8855)).toBe('RU');
    // Gibraltar and Tangier are known precisely, and neither has a method of its own here.
    expect(nationalMethodCountryAt(36.14, -5.35)).toBeNull();
    expect(nationalMethodCountryAt(35.7595, -5.834)).toBeNull();
    // Offshore near Dubai: within reach of the coast.
    expect(nationalMethodCountryAt(25.13, 55.12)).toBe('AE');
    // Mid-Atlantic and Alice Springs: no country at all.
    expect(nationalMethodCountryAt(30, -40)).toBeNull();
    expect(nationalMethodCountryAt(-23.7, 133.88)).toBeNull();
  });
});

describe('a method chosen by hand, in a country whose own source has a fixed method', () => {
  const PLACES: [string, number, number, string][] = [
    ['Istanbul', 41.0082, 28.9784, 'diyanet'],
    ['Kuala Lumpur', 3.139, 101.6869, 'jakim'],
    ['Singapore', 1.3521, 103.8198, 'muis'],
    ['Jakarta', -6.2088, 106.8456, 'kemenag'],
  ];

  it.each(PLACES)(
    '%s: Automatic computes the chosen method with AlAdhan',
    (_name, latitude, longitude, own) => {
      const coords = at(latitude, longitude);
      expect(getEffectiveDataProvider(true, 'aladhan', coords, 'auto')).toBe(
        own,
      );
      expect(getEffectiveDataProvider(true, 'aladhan', coords, 3)).toBe(
        'aladhan',
      );
      // A source pinned there by hand is kept.
      expect(getEffectiveDataProvider(false, own as never, coords, 3)).toBe(
        own,
      );
    },
  );

  it('keeps the sources that compute the authority’s own method in their countries', () => {
    expect(
      getEffectiveDataProvider(true, 'aladhan', at(59.3293, 18.0686), 3),
    ).toBe('islamiska_forbundet');
    expect(
      getEffectiveDataProvider(true, 'aladhan', at(33.5731, -7.5898), 3),
    ).toBe('habous');
    expect(getEffectiveDataProvider(true, 'aladhan', at(36.75, 3.06), 3)).toBe(
      'marw',
    );
  });

  it('does not fall through to Diyanet near a listed place in those countries', () => {
    // Kuala Lumpur and Singapore are places Diyanet lists.
    expect(
      getEffectiveDataProvider(true, 'aladhan', at(3.139, 101.6869), 2),
    ).toBe('aladhan');
    expect(
      getEffectiveDataProvider(true, 'aladhan', at(1.3521, 103.8198), 2),
    ).toBe('aladhan');
  });
});

describe('the method picker under Diyanet by proximity', () => {
  const LONDON = at(51.5072, -0.1276);
  const ISTANBUL = at(41.0082, 28.9784);

  it('is offered when Diyanet is only Automatic’s pick for a place nearby', () => {
    expect(isDiyanetByProximity(true, 'aladhan', LONDON, 'auto')).toBe(true);
    // A national source pinned out of its country, redirected to Diyanet nearby.
    expect(isDiyanetByProximity(false, 'habous', LONDON, 'auto')).toBe(true);
  });

  it('is not offered for Türkiye’s own, a pinned Diyanet, or another source', () => {
    expect(isDiyanetByProximity(true, 'aladhan', ISTANBUL, 'auto')).toBe(false);
    expect(isDiyanetByProximity(false, 'diyanet', LONDON, 'auto')).toBe(false);
    expect(
      isDiyanetByProximity(true, 'aladhan', at(21.4225, 39.8262), 'auto'),
    ).toBe(false); // Mecca: AlAdhan
    expect(isDiyanetByProximity(true, 'aladhan', null, 'auto')).toBe(false);
  });

  it('choosing a method there takes Automatic to AlAdhan with it, and back with Automatic', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', LONDON, 'auto')).toBe(
      'diyanet',
    );
    // The reader picks Muslim World League in the now-visible picker.
    expect(getEffectiveDataProvider(true, 'aladhan', LONDON, 3)).toBe(
      'aladhan',
    );
    expect(isDiyanetByProximity(true, 'aladhan', LONDON, 3)).toBe(false);
    // And Automatic again under Calculation method.
    expect(getEffectiveDataProvider(true, 'aladhan', LONDON, 'auto')).toBe(
      'diyanet',
    );
  });
});
