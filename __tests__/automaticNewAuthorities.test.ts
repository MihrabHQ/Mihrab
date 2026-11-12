/**
 * Automatic and the authorities added in November 2026 — Pakistan's Jamia
 * Banuri Town, the United Arab Emirates, Iran, Wifaqul Ulama's towns,
 * Tunisia: every listed place lands on its own authority and is computed
 * on the phone, and the borders between them and their neighbours hold.
 */
jest.unmock('adhan');

import banuri from '../src/providers/data/banuriCities.json';
import tehran from '../src/providers/data/tehranCities.json';
import tunisia from '../src/providers/data/tunisiaPlaces.json';
import wifaq from '../src/providers/data/wifaqTowns.json';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isCoordinateInLondon } from '../src/utils/londonRegion';

type Spot = { name: string; lat: number; lon: number };
const auto = (latitude: number, longitude: number) => getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto');
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe('Automatic at every listed place', () => {
  it.each([
    ['banuri', banuri as Spot[], 100],
    ['tehran', tehran as Spot[], 31],
    ['tunisia', tunisia as Spot[], 26],
  ] as const)('%s: each of its places is its own', (id, places, count) => {
    expect(places).toHaveLength(count);
    for (const p of places) expect([p.name, auto(p.lat, p.lon)]).toEqual([p.name, id]);
  });

  it('wifaq: each town outside London is its own; inside London the city’s unified timetable keeps it', () => {
    const towns = wifaq as Spot[];
    expect(towns).toHaveLength(81);
    let own = 0;
    for (const t of towns) {
      const got = auto(t.lat, t.lon);
      if (isCoordinateInLondon(t.lat, t.lon)) expect([t.name, got]).toEqual([t.name, 'london']);
      else {
        expect([t.name, got]).toEqual([t.name, 'wifaq']);
        own++;
      }
    }
    expect(own).toBeGreaterThanOrEqual(65);
  });

  it('a listed place is computed on the phone, six times in the order of the day', async () => {
    const picks: [string, Spot][] = [
      ['banuri', (banuri as Spot[])[0]],
      ['tehran', (tehran as Spot[])[0]],
      ['tunisia', (tunisia as Spot[])[15]],
      ['wifaq', (wifaq as Spot[]).find(t => t.name === 'Bradford')!],
      ['uae', { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773 }],
    ];
    for (const [provider, p] of picks) {
      const r = await fetchPrayerTimesUnified({ latitude: p.lat, longitude: p.lon, date: new Date(2026, 10, 20, 12), provider, calculationMethod: 'auto', school: 0 } as never);
      expect([provider, r.source]).toEqual([provider, 'local']);
      const m = (['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const).map(k => minutes(r.timings[k]));
      expect(m).toEqual([...m].sort((a, b) => a - b));
    }
  });
});

describe('where they meet their neighbours', () => {
  it.each([
    // the Emirates: cities, an island, the mountain exclave; Oman's town across the street is not theirs
    ['Abu Dhabi', 24.4539, 54.3773, 'uae'],
    ['Dubai', 25.2048, 55.2708, 'uae'],
    ['Al Ain', 24.207, 55.745, 'uae'],
    ['Hatta', 24.797, 56.117, 'uae'],
    ['Das Island', 25.152, 52.873, 'uae'],
    ['Dibba Al-Fujairah', 25.592, 56.262, 'uae'],
    // Pakistan to its edges; Iran to its
    ['Gwadar', 25.126, 62.325, 'banuri'],
    ['Gilgit', 35.92, 74.31, 'banuri'],
    ['Zahedan', 29.5, 60.86, 'tehran'],
    ['Kish Island', 26.54, 53.98, 'tehran'],
    // Wifaqul Ulama's towns off the island of Britain
    ['St Helier, Jersey', 49.187, -2.107, 'wifaq'],
    ['Longford, Ireland', 53.727, -7.8, 'wifaq'],
    // Tunisia's listed places by the Algerian border are Tunisia's, not Algeria's ministry's
    ['Aïn Draham', 36.776, 8.686, 'tunisia'],
    ['Rjim Maatoug', 33.325, 8.014, 'tunisia'],
    // …and its neighbours' are theirs
    ['Sidi Barrani', 31.61, 25.93, 'egypt'],
    ['Failaka', 29.44, 48.33, 'kuwait'],
    ['Bangar, Temburong', 4.708, 115.074, 'brunei'],
  ] as const)('%s', (_name, latitude, longitude, want) => {
    expect(auto(latitude, longitude)).toBe(want);
  });

  it.each([
    ['Al Buraimi, Oman', 24.251, 55.793],
    ['Djerba, a Tunisian delegation not read', 33.876, 10.858],
    ['Ghardimaou, Tunisia, by the border', 36.45, 8.44],
  ] as const)('%s is none of the new ones', (_name, latitude, longitude) => {
    expect(['uae', 'tunisia', 'banuri', 'tehran', 'wifaq', 'marw']).not.toContain(auto(latitude, longitude));
  });

  it('a method chosen by hand is kept in all five', () => {
    for (const [latitude, longitude] of [[24.4539, 54.3773], [24.86, 67.0], [35.69, 51.39], [53.795, -1.759], [36.8, 10.183]] as const) {
      expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
    }
  });
});
