/**
 * Northern Cyprus gets Diyanet, which lists its districts; the Republic of
 * Cyprus does not (CHANGELOG). The rule that gives Diyanet to a place near
 * one it lists reached over the line: Nicosia south of it and Limassol were
 * within 25 km of a northern district and were given Diyanet's table.
 */
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { countryAt } from '../src/utils/countryAt';

const NICOSIA_SOUTH = { latitude: 35.1667, longitude: 33.3667 };
const LIMASSOL = { latitude: 34.6786, longitude: 33.0413 };
const LARNACA = { latitude: 34.9229, longitude: 33.6233 };
const KYRENIA = { latitude: 35.3364, longitude: 33.3182 };
const NORTH_NICOSIA = { latitude: 35.1856, longitude: 33.3637 };

const auto = (at: { latitude: number; longitude: number }) =>
  getEffectiveDataProvider(true, 'aladhan', at, 'auto');

it.each([
  ['Nicosia (south)', NICOSIA_SOUTH],
  ['Limassol', LIMASSOL],
  ['Larnaca', LARNACA],
])('%s, in the Republic: AlAdhan', (_n, at) => {
  expect(countryAt(at.latitude, at.longitude)).toBe('CY');
  expect(auto(at)).toBe('aladhan');
});

it.each([
  ['Kyrenia', KYRENIA],
  ['North Nicosia', NORTH_NICOSIA],
])('%s, in Northern Cyprus: Diyanet', (_n, at) => {
  expect(auto(at)).toBe('diyanet');
});

it('a Diyanet picked by hand in the Republic is kept', () => {
  expect(
    getEffectiveDataProvider(false, 'diyanet', NICOSIA_SOUTH, 'auto'),
  ).toBe('diyanet');
});
