/**
 * Is "My location" where the phone is now? (src/prayer/locationFreshness.ts)
 *
 * The decisions: which position counts as fresh, what counts as a journey,
 * and when Today says so.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ANCHOR_KEY,
  FRESH_FIX_MS,
  _resetLocationFreshnessForTests,
  getLocationFreshness,
  hasTravelled,
  isFreshFix,
  recordFreshFix,
  seemsToHaveTravelled,
  setLocationFreshness,
  showsTravelNotice,
  type TravelAnchor,
} from '../src/prayer/locationFreshness';

const STOCKHOLM: TravelAnchor = { zone: 'Europe/Stockholm', offset: 60, country: 'SE' };

describe('a fresh position', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  it('is one measured within the last quarter of an hour', () => {
    expect(isFreshFix(now - 5_000, now)).toBe(true);
    expect(isFreshFix(now - FRESH_FIX_MS, now)).toBe(true);
    // The phone's last position, handed back when the wait ran out: hours old.
    expect(isFreshFix(now - 3 * 3_600_000, now)).toBe(false);
  });
  it('or one the platform gives no time for', () => {
    expect(isFreshFix(null, now)).toBe(true);
    expect(isFreshFix(undefined, now)).toBe(true);
  });
});

describe('a journey', () => {
  it('is another network country — Sweden to Germany, in one time zone', () => {
    expect(hasTravelled(STOCKHOLM, { zone: 'Europe/Stockholm', offset: 60, country: 'DE' })).toBe(true);
  });
  it('or another time zone, with no SIM to ask', () => {
    const noSim = { ...STOCKHOLM, country: null };
    expect(hasTravelled(noSim, { zone: 'Europe/London', offset: 0, country: null })).toBe(true);
  });
  it('not the clocks changing at home, nor a zone only renamed', () => {
    expect(hasTravelled(STOCKHOLM, { zone: 'Europe/Stockholm', offset: 120, country: 'SE' })).toBe(false);
    expect(hasTravelled(STOCKHOLM, { zone: 'Europe/Berlin', offset: 60, country: 'SE' })).toBe(false);
  });
  it('not when there is nothing to compare', () => {
    expect(hasTravelled(null, STOCKHOLM)).toBe(false);
    expect(hasTravelled({ ...STOCKHOLM, country: null }, { ...STOCKHOLM, country: 'DE' })).toBe(false);
    expect(hasTravelled(STOCKHOLM, { ...STOCKHOLM, country: null })).toBe(false);
  });
});

describe('Today’s notice', () => {
  it('is up once the quick request has ended with nothing fresh, on a journey only', () => {
    expect(showsTravelNotice({ status: 'searching', moved: true })).toBe(false);
    expect(showsTravelNotice({ status: 'slow', moved: true })).toBe(true);
    expect(showsTravelNotice({ status: 'notUpdated', moved: true })).toBe(true);
    expect(showsTravelNotice({ status: 'notUpdated', moved: false })).toBe(false);
    expect(showsTravelNotice({ status: 'ok', moved: false })).toBe(false);
  });
});

describe('the anchor', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    _resetLocationFreshnessForTests();
  });
  it('with none kept there is no sign of travel', async () => {
    expect(await seemsToHaveTravelled()).toBe(false);
  });
  it('a fresh fix keeps the surroundings, and the same surroundings are no journey', async () => {
    await recordFreshFix();
    const kept = JSON.parse((await AsyncStorage.getItem(ANCHOR_KEY))!) as TravelAnchor;
    expect(typeof kept.offset).toBe('number');
    expect(await seemsToHaveTravelled()).toBe(false);
  });
  it('a kept anchor in another zone and offset is one', async () => {
    const here = -new Date().getTimezoneOffset();
    await AsyncStorage.setItem(ANCHOR_KEY, JSON.stringify({ zone: 'Pacific/Kiritimati', offset: here + 300, country: null }));
    expect(await seemsToHaveTravelled()).toBe(true);
  });
  it('a damaged anchor is none', async () => {
    await AsyncStorage.setItem(ANCHOR_KEY, '{nonsense');
    expect(await seemsToHaveTravelled()).toBe(false);
  });
  it('the store only tells its listeners of a change', () => {
    setLocationFreshness({ status: 'slow', moved: true });
    expect(getLocationFreshness()).toEqual({ status: 'slow', moved: true });
    const same = getLocationFreshness();
    setLocationFreshness({ status: 'slow' });
    expect(getLocationFreshness()).toBe(same);
  });
});
