/**
 * What "Automatic" computes to when the network is not there to decide.
 *
 * The on-device rung is no longer a rarity — it sits underneath every
 * provider as the one that cannot fail — so "Automatic" answering MWL in a
 * country with its own published parameters is a visible error rather than a
 * theoretical one.
 */
jest.unmock('adhan');

import {
  DEFAULT_AUTO_METHOD,
  autoMethodForCoords,
} from '../src/providers/autoMethod';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';

describe('autoMethodForCoords', () => {
  test('Moroccan coordinates resolve to the Morocco method', () => {
    // Casablanca, Marrakech, Oujda, Dakhla — coast to desert, north to south.
    expect(autoMethodForCoords(33.5731, -7.5898)).toBe(21);
    expect(autoMethodForCoords(31.6295, -7.9811)).toBe(21);
    expect(autoMethodForCoords(34.6814, -1.9086)).toBe(21);
    expect(autoMethodForCoords(23.6848, -15.957)).toBe(21);
  });

  test('everywhere else stays on the global default', () => {
    expect(autoMethodForCoords(59.33, 18.07)).toBe(24); // Stockholm — Islamiska Förbundet's own (October 2026)
    expect(autoMethodForCoords(55.68, 12.57)).toBe(DEFAULT_AUTO_METHOD); // Copenhagen
    expect(autoMethodForCoords(0, 0)).toBe(DEFAULT_AUTO_METHOD);
    expect(autoMethodForCoords(51.5072, -0.1276)).toBe(DEFAULT_AUTO_METHOD); // London
    expect(autoMethodForCoords(NaN, NaN)).toBe(DEFAULT_AUTO_METHOD);
  });

  test('a country with a method of its own computes it offline, as AlAdhan does online', () => {
    // Automatic sends these countries to AlAdhan for its national method
    // (`regionalProviders.ts`); the phone answered MWL off the network.
    expect(autoMethodForCoords(21.4225, 39.8262)).toBe(4); // Makkah — Umm al-Qura
    expect(autoMethodForCoords(30.0444, 31.2357)).toBe(5); // Cairo
    expect(autoMethodForCoords(24.8607, 67.0011)).toBe(1); // Karachi
    expect(autoMethodForCoords(28.6139, 77.209)).toBe(1); // Delhi
    expect(autoMethodForCoords(35.6892, 51.389)).toBe(7); // Tehran
    expect(autoMethodForCoords(29.3759, 47.9774)).toBe(9); // Kuwait
    expect(autoMethodForCoords(25.2854, 51.531)).toBe(10); // Doha
    expect(autoMethodForCoords(25.2048, 55.2708)).toBe(16); // Dubai
    expect(autoMethodForCoords(55.7558, 37.6173)).toBe(14); // Moscow
    expect(autoMethodForCoords(36.8065, 10.1815)).toBe(18); // Tunis (Algiers is Algeria's own, #70)
    expect(autoMethodForCoords(38.7223, -9.1393)).toBe(22); // Lisbon
    expect(autoMethodForCoords(31.9539, 35.9106)).toBe(23); // Amman
    // Not read off anything: MWL, as before.
    expect(autoMethodForCoords(26.2285, 50.586)).toBe(DEFAULT_AUTO_METHOD); // Manama
    expect(autoMethodForCoords(33.3152, 44.3661)).toBe(DEFAULT_AUTO_METHOD); // Baghdad
    // Across the border it is not: Badajoz is Spain's, a few km from Portugal.
    expect(autoMethodForCoords(38.8794, -6.9707)).toBe(DEFAULT_AUTO_METHOD);
  });

  test("in Makkah, offline, Isha is Umm al-Qura's ninety minutes after Maghrib", () => {
    const t = computeLocalAdhanTimes({
      latitude: 21.4225,
      longitude: 39.8262,
      date: new Date(2026, 7, 30),
      calculationMethod: 'auto',
      school: 0,
    }).timings;
    const min = (s: string) =>
      Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    expect(min(t.Isha) - min(t.Maghrib)).toBe(90);
  });
});

describe('the computation actually uses it', () => {
  const DAY = new Date(2026, 7, 30);
  const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };

  test('"auto" in Morocco equals asking for method 21 by name', () => {
    const auto = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const explicit = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 21,
      school: 0,
    });
    expect(auto.timings).toEqual(explicit.timings);
  });

  test('and no longer equals MWL, which is what it used to answer', () => {
    const auto = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const mwl = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 3,
      school: 0,
    });
    expect(auto.timings).not.toEqual(mwl.timings);
  });

  test('outside the countries with a convention of their own, "auto" is still MWL', () => {
    const COPENHAGEN = { latitude: 55.68, longitude: 12.57 };
    const auto = computeLocalAdhanTimes({
      ...COPENHAGEN,
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const mwl = computeLocalAdhanTimes({
      ...COPENHAGEN,
      date: DAY,
      calculationMethod: 3,
      school: 0,
    });
    expect(auto.timings).toEqual(mwl.timings);
  });
});
