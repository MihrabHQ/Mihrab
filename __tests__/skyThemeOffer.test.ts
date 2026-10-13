/**
 * The home screen's one-time offer of the Sky theme to people who were
 * here before it: who is asked, who is not, and in what order.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SKY_ASKED_KEY, markWalkthroughFinished } from '../src/home/HomeFeaturesOffer';
import { SKY_OFFER_KEY, skyOfferDue } from '../src/home/SkyThemeOffer';

const ASK = {
  answered: false,
  walkthroughShowedSky: false,
  featuresOfferAnswered: true,
  skyOn: false,
  heldBack: false,
};

describe('skyOfferDue', () => {
  it('asks somebody from before Sky, once the alerts offer is answered', () => {
    expect(skyOfferDue(ASK)).toBe('ask');
  });
  it('never asks again', () => {
    expect(skyOfferDue({ ...ASK, answered: true })).toBe('never');
  });
  it('never asks somebody the walkthrough showed Sky', () => {
    expect(skyOfferDue({ ...ASK, walkthroughShowedSky: true })).toBe('never');
  });
  it('never asks somebody who already chose Sky', () => {
    expect(skyOfferDue({ ...ASK, skyOn: true })).toBe('never');
  });
  it('waits for the alerts offer, and for the hold after the walkthrough', () => {
    expect(skyOfferDue({ ...ASK, featuresOfferAnswered: false })).toBe('later');
    expect(skyOfferDue({ ...ASK, heldBack: true })).toBe('later');
  });
  it('keys are distinct from the alerts offer', () => {
    expect(SKY_OFFER_KEY).not.toBe(SKY_ASKED_KEY);
    expect(SKY_OFFER_KEY).toMatch(/^mihrab\./);
  });
});

describe('the walkthrough marks that it showed Sky', () => {
  beforeEach(() => AsyncStorage.clear());
  it('writes the marker when the walkthrough finishes', async () => {
    markWalkthroughFinished(1_000);
    await new Promise(r => setImmediate(r));
    expect(await AsyncStorage.getItem(SKY_ASKED_KEY)).toBe('1');
  });
});

describe('wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  it('is mounted on the home screen behind the same gate as the alerts offer', () => {
    const src = read('src/screens/HomeScreen.tsx');
    expect(src).toMatch(/<SkyThemeOffer\s+ready=\{\s*hydrated &&\s*settings\.onboardingComplete &&\s*changelogSince === null &&\s*!changelogShown\.current\s*\}/);
  });

  it('shows the strip and turns Sky on from it or the button', () => {
    const src = read('src/home/SkyThemeOffer.tsx');
    expect(src).toMatch(/<SkyMoodStrip[\s\S]*?onPress=\{trySky\}/);
    expect(src).toMatch(/updateSettings\(\{ appearance: 'sky' \}\)/);
    expect(src).toContain("t('onboarding.notNow')");
  });

  it('has its strings in every language', () => {
    const dir = path.join(__dirname, '..', 'src/i18n/locales');
    const langs = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(langs.length).toBe(13);
    for (const f of langs) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(Object.keys(j.skyOffer ?? {}).sort()).toEqual(['body', 'title', 'tryIt']);
      for (const v of Object.values(j.skyOffer) as string[]) expect(v.trim().length).toBeGreaterThan(0);
    }
  });
});
