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
  s = pick(s, 'local_adhan');
  s = usePreset(s, rabat);
  s = pick(s, 'aladhan');
  s = useMyLocation(s);
  expect(s.dataProviderAuto).toBe(true); // "My location" untouched
  expect(providerChoiceForPreset(s, cairo)).toEqual({ auto: false, provider: 'local_adhan' });
  expect(providerChoiceForPreset(s, rabat)).toEqual({ auto: false, provider: 'aladhan' });
  s = usePreset(s, cairo);
  expect(s.dataProvider).toBe('local_adhan');
  expect(s.dataProviderAuto).toBe(false);
});

it('changing "My location"’s source changes nothing for the others', () => {
  let s = usePreset(start(), cairo);
  s = pick(s, 'local_adhan');
  s = useMyLocation(s);
  s = pick(s, 'diyanet');
  expect(providerChoiceForPreset(s, cairo)).toEqual({ auto: false, provider: 'local_adhan' });
  expect(providerChoiceForPreset(s, rabat).auto).toBe(true);
});

it('turns "My location" back to Automatic when it travels out of its source’s country', () => {
  let s = pick(start(), 'islamiska_forbundet');
  s = apply(s, { lastFetchedLatitude: ISTANBUL.latitude, lastFetchedLongitude: ISTANBUL.longitude });
  expect(s.dataProviderAuto).toBe(true);
  expect(getEffectiveDataProvider(s.dataProviderAuto, s.dataProvider, ISTANBUL, 'auto')).toBe('diyanet');
});

it('keeps it while it still covers where the phone is', () => {
  let s = pick(start(), 'islamiska_forbundet');
  s = apply(s, { lastFetchedLatitude: 63.83, lastFetchedLongitude: 20.26 }); // Umeå
  expect(s.dataProviderAuto).toBe(false);
  expect(s.dataProvider).toBe('islamiska_forbundet');
});

it('a source that works everywhere is kept everywhere', () => {
  let s = pick(start(), 'local_adhan');
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
  expect(getEffectiveDataProvider(false, 'islamiska_forbundet', RABAT, 'auto')).toBe('habous');
  expect(getEffectiveDataProvider(false, 'islamiska_forbundet', LONDON, 'auto')).toBe('diyanet'); // a place Diyanet lists
  expect(getEffectiveDataProvider(false, 'islamiska_forbundet', { latitude: -23.7, longitude: 133.88 }, 'auto')).toBe('aladhan');
});

it('a deleted saved location takes its choice with it', () => {
  let s = usePreset(start(), cairo);
  s = pick(s, 'local_adhan');
  s = useMyLocation(s);
  s = apply(s, { locationPresets: [rabat] });
  expect(s.locationProviders?.[cairo.id]).toBeUndefined();
});

it('settings from before start every location on the choice they shared', () => {
  const old = { ...start(), dataProviderAuto: false, dataProvider: 'local_adhan' as const, locationProviders: undefined };
  const s = seedLocationProviders(old);
  expect(providerChoiceForPreset(useMyLocation(s), cairo)).toEqual({ auto: false, provider: 'local_adhan' });
  expect(usePreset(s, rabat).dataProvider).toBe('local_adhan');
});

it('crossing the Torne mid-session: Haparanda’s pin goes back to Automatic in Tornio, and stays there', () => {
  let s = pick(apply(start(), { lastFetchedLatitude: 65.8355, lastFetchedLongitude: 24.1368 }), 'islamiska_forbundet');
  expect(s.dataProviderAuto).toBe(false); // Haparanda, Sweden
  s = apply(s, { lastFetchedLatitude: 65.8481, lastFetchedLongitude: 24.1466 }); // Tornio, Finland
  expect(s.dataProviderAuto).toBe(true);
  // Finland has no source or method of its own: the Diyanet place there.
  expect(getEffectiveDataProvider(s.dataProviderAuto, s.dataProvider, { latitude: 65.8481, longitude: 24.1466 }, 'auto')).toBe('diyanet');
  s = apply(s, { lastFetchedLatitude: 65.8355, lastFetchedLongitude: 24.1368 }); // back
  expect(s.dataProviderAuto).toBe(true);
  expect(getEffectiveDataProvider(s.dataProviderAuto, s.dataProvider, { latitude: 65.8355, longitude: 24.1368 }, 'auto')).toBe('islamiska_forbundet');
});

it('switching between saved places either side of a strait keeps each one’s choice', () => {
  const sg = { id: 'loc_sg', name: 'Singapore', latitude: 1.3521, longitude: 103.8198 };
  const jb = { id: 'loc_jb', name: 'Johor Bahru', latitude: 1.4927, longitude: 103.7414 };
  let s = { ...start(), locationPresets: [sg, jb] };
  s = pick(usePreset(s, sg), 'muis');
  s = pick(usePreset(s, jb), 'local_adhan');
  s = usePreset(s, sg);
  expect([s.dataProviderAuto, s.dataProvider]).toEqual([false, 'muis']);
  s = usePreset(s, jb);
  expect([s.dataProviderAuto, s.dataProvider]).toEqual([false, 'local_adhan']);
  // MUIS picked for Johor Bahru: not Singapore — Automatic, which is JAKIM there.
  s = pick(s, 'muis');
  expect(s.dataProviderAuto).toBe(true);
  expect(getEffectiveDataProvider(s.dataProviderAuto, s.dataProvider, jb, 'auto')).toBe('jakim');
});

it('a location not yet set — (0, 0) — does not turn a pin to Automatic', () => {
  // The settings hold (0, 0) before a place is chosen, and while the
  // location store cannot be read at launch: no country, so no verdict.
  let s = usePreset(start(), rabat);
  s = pick(s, 'habous');
  expect(s.dataProviderAuto).toBe(false);
  s = apply(s, { manualLatitude: 0, manualLongitude: 0 });
  expect([s.dataProviderAuto, s.dataProvider]).toEqual([false, 'habous']);
  s = apply(s, { manualLatitude: Number.NaN, manualLongitude: Number.NaN });
  expect([s.dataProviderAuto, s.dataProvider]).toEqual([false, 'habous']);
  // "My location" before the first fix.
  let m = pick(start(), 'islamiska_forbundet');
  m = apply(m, { lastFetchedLatitude: 0, lastFetchedLongitude: 0 });
  expect([m.dataProviderAuto, m.dataProvider]).toEqual([false, 'islamiska_forbundet']);
});
