/**
 * The home screen's one-time offer of the full-screen alert, silencing the
 * phone and the Live Activity: who is offered what, and who is not asked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AFTER_WALKTHROUGH_MS,
  FULL_SCREEN_ASKED_KEY,
  NOT_BEFORE_KEY,
  markWalkthroughFinished,
  offerHeldBack,
  offerableHomeFeatures,
} from '../src/home/HomeFeaturesOffer';

const ALL = {
  fullScreenOffered: true,
  fullScreenOn: false,
  fullScreenAsked: false,
  silenceAvailable: true,
  silenceOn: false,
  liveActivityAvailable: true,
  liveActivityOn: false,
};

describe('offerableHomeFeatures', () => {
  it('offers all three to somebody who was asked about none', () => {
    expect(offerableHomeFeatures(ALL)).toEqual(['fullScreen', 'silence', 'liveActivity']);
  });
  it('leaves the full-screen alert out for somebody the walkthrough asked', () => {
    expect(offerableHomeFeatures({ ...ALL, fullScreenAsked: true })).toEqual(['silence', 'liveActivity']);
  });
  it('offers only what is off', () => {
    expect(
      offerableHomeFeatures({ ...ALL, fullScreenOn: true, silenceOn: true }),
    ).toEqual(['liveActivity']);
  });
  it('offers only what the phone can do', () => {
    // iPhone: no silence. Mac: no Live Activity and no alarm screen.
    expect(offerableHomeFeatures({ ...ALL, silenceAvailable: false })).toEqual(['fullScreen', 'liveActivity']);
    expect(
      offerableHomeFeatures({ ...ALL, fullScreenOffered: false, silenceAvailable: false, liveActivityAvailable: false }),
    ).toEqual([]);
  });
});

describe('the hold after the walkthrough', () => {
  beforeEach(() => AsyncStorage.clear());

  it('writes that the walkthrough asked, and holds the offer back a day', async () => {
    markWalkthroughFinished(1_000);
    await new Promise(r => setImmediate(r));
    expect(await AsyncStorage.getItem(FULL_SCREEN_ASKED_KEY)).toBe('1');
    expect(await AsyncStorage.getItem(NOT_BEFORE_KEY)).toBe(String(1_000 + AFTER_WALKTHROUGH_MS));
  });
  it('holds back until the time, and not when there is no hold', () => {
    expect(offerHeldBack(String(5_000), 4_999)).toBe(true);
    expect(offerHeldBack(String(5_000), 5_000)).toBe(false);
    expect(offerHeldBack(null, 0)).toBe(false);
    expect(offerHeldBack('junk', 0)).toBe(false);
  });
});
