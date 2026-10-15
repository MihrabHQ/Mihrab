/**
 * Each location keeps its own prayer-time source: "My location", every
 * saved location, and an unsaved picked place. A source picked by hand is
 * kept while it covers the location; past that, the location goes back to
 * Automatic, which picks what fits best there.
 */
import { DEFAULT_SETTINGS, type PrayerAppSettings } from '../src/settings/types';
import {
  applyLocationProviders,
  locationKeyOf,
  MY_LOCATION_KEY,
  providerChoiceForPreset,
  seedLocationProviders,
  UNSAVED_PLACE_KEY,
} from '../src/settings/locationProviders';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const ISTANBUL = { latitude: 41.01, longitude: 28.98 };
const RABAT = { latitude: 34.02, longitude: -6.84 };
const LONDON = { latitude: 51.5, longitude: -0.12 };

const cairo = { id: 'loc_cairo', name: 'Cairo', latitude: 30.04, longitude: 31.24 };
const rabat = { id: 'loc_rabat', name: 'Rabat', ...RABAT };

/** The app on "My location" in Stockholm, on Automatic, with two saved places. */
function start(): PrayerAppSettings {
  return {
    ...DEFAULT_SETTINGS,
    locationMode: 'automatic',
    lastFetchedLatitude: STOCKHOLM.latitude,
    lastFetchedLongitude: STOCKHOLM.longitude,
    locationPresets: [cairo, rabat],
    dataProviderAuto: true,
    dataProvider: 'aladhan',
  };
}
const apply = (s: PrayerAppSettings, patch: Partial<PrayerAppSettings>) => applyLocationProviders(s, patch);
const usePreset = (s: PrayerAppSettings, p: typeof cairo) =>
  apply(s, { locationMode: 'manual', manualLatitude: p.latitude, manualLongitude: p.longitude, activeLocationPresetId: p.id });
const useMyLocation = (s: PrayerAppSettings) => apply(s, { locationMode: 'automatic', activeLocationPresetId: undefined });
const pick = (s: PrayerAppSettings, provider: PrayerAppSettings['dataProvider']) => apply(s, { dataProvider: provider, dataProviderAuto: false });

it('knows which location the app is on', () => {
  expect(locationKeyOf({ locationMode: 'automatic', activeLocationPresetId: 'x' })).toBe(MY_LOCATION_KEY);
  expect(locationKeyOf({ locationMode: 'manual', activeLocationPresetId: 'x' })).toBe('x');
  expect(locationKeyOf({ locationMode: 'manual', activeLocationPresetId: undefined })).toBe(UNSAVED_PLACE_KEY);
});

it('keeps a source picked for "My location" to "My location"', () => {
  let s = pick(start(), 'islamiska_forbundet');
  s = usePreset(s, cairo);
  expect(s.dataProviderAuto).toBe(true); // Cairo has no choice of its own: Automatic
  s = useMyLocation(s);
  expect(s.dataProviderAuto).toBe(false);
  expect(s.dataProvider).toBe('islamiska_forbundet');
});

it('keeps each saved location’s source to itself', () => {
  let s = usePreset(start(), cairo);
  s = pick(s, 'prayertimes_dev');
  s = usePreset(s, rabat);
  s = pick(s, 'aladhan');
  s = useMyLocation(s);
  expect(s.dataProviderAuto).toBe(true); // "My location" untouched
  expect(providerChoiceForPreset(s, cairo)).toEqual({ auto: false, provider: 'prayertimes_dev' });
  expect(providerChoiceForPreset(s, rabat)).toEqual({ auto: false, provider: 'aladhan' });
  s = usePreset(s, cairo);
  expect(s.dataProvider).toBe('prayertimes_dev');
  expect(s.dataProviderAuto).toBe(false);
});

it('changing "My location"’s source changes nothing for the others', () => {
  let s = usePreset(start(), cairo);
  s = pick(s, 'prayertimes_dev');
  s = useMyLocation(s);
  s = pick(s, 'diyanet');
  expect(providerChoiceForPreset(s, cairo)).toEqual({ auto: false, provider: 'prayertimes_dev' });
  expect(providerChoiceForPreset(s, rabat).auto).toBe(true);
});

it('turns "My location" back to Automatic when it travels out of its source’s country', () => {
  let s = pick(start(), 'islamiska_forbundet');
  s = apply(s, { lastFetchedLatitude: ISTANBUL.latitude, lastFetchedLongitude: ISTANBUL.longitude });
  expect(s.dataProviderAuto).toBe(true);
  expect(getEffectiveDataProvider(s.dataProviderAuto, s.dataProvider, ISTANBUL)).toBe('diyanet');
});

it('keeps it while it still covers where the phone is', () => {
  let s = pick(start(), 'islamiska_forbundet');
  s = apply(s, { lastFetchedLatitude: 63.83, lastFetchedLongitude: 20.26 }); // Umeå
  expect(s.dataProviderAuto).toBe(false);
  expect(s.dataProvider).toBe('islamiska_forbundet');
});

it('a source that works everywhere is kept everywhere', () => {
  let s = pick(start(), 'prayertimes_dev');
  s = apply(s, { lastFetchedLatitude: LONDON.latitude, lastFetchedLongitude: LONDON.longitude });
  expect(s.dataProviderAuto).toBe(false);
});

it('a regional source picked where it does not answer is not kept', () => {
  let s = usePreset(start(), cairo);
  s = pick(s, 'habous');
  expect(s.dataProviderAuto).toBe(true);
  expect(providerChoiceForPreset(s, cairo).auto).toBe(true);
});

it('Automatic outside a pinned source’s country picks what fits best there, not the global default', () => {
  expect(getEffectiveDataProvider(false, 'islamiska_forbundet', RABAT)).toBe('habous');
  expect(getEffectiveDataProvider(false, 'islamiska_forbundet', LONDON)).toBe('aladhan');
});

it('a deleted saved location takes its choice with it', () => {
  let s = usePreset(start(), cairo);
  s = pick(s, 'prayertimes_dev');
  s = useMyLocation(s);
  s = apply(s, { locationPresets: [rabat] });
  expect(s.locationProviders?.[cairo.id]).toBeUndefined();
});

it('settings from before start every location on the choice they shared', () => {
  const old = { ...start(), dataProviderAuto: false, dataProvider: 'prayertimes_dev' as const, locationProviders: undefined };
  const s = seedLocationProviders(old);
  expect(providerChoiceForPreset(useMyLocation(s), cairo)).toEqual({ auto: false, provider: 'prayertimes_dev' });
  expect(usePreset(s, rabat).dataProvider).toBe('prayertimes_dev');
});
