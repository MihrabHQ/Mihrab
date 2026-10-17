/**
 * namazvakti.com (Türkiye Takvimi): the server-side city index, the year
 * file the phone fetches, and the method the phone computes without one.
 *
 * Fixtures are the site's own: two cities' yearly XML (Cologne 5887,
 * Istanbul 16741, fetched 14 October 2026) and slices of its list pages.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The method is checked against the site's tables, so the real arithmetic.
jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for the Türkiye Takvimi');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import {
  clockOf,
  nearestNvCity,
  nvTileKey,
  nvTilesAround,
  parseNamazvaktiXml,
  timingsFromRow,
} from '../src/providers/namazvaktiParser';
import {
  _resetNamazvaktiForTests,
  namazvaktiCoverage,
  namazvaktiHeld,
  pollNamazvaktiIndexNow,
  computeNamazvaktiMethodTimes,
  fitNamazvaktiPoint,
  getNamazvaktiTimes,
  temkinMinutes,
} from '../src/providers/namazvakti';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { namazvaktiBucketAsset, NV_PACK_BUCKETS, packYear } from '../src/providers/namazvaktiPack';
import { validateTimings } from '../src/providers/validateTimings';
import { placeCivilDay } from '../src/providers/locationClock';
import { placeZoneFor } from '../src/providers/placeZone';
import {
  parseCityInfo,
  parseCityList,
  parseCountryList,
  parseStateList,
  tileKey,
} from '../tools/namazvakti-dataset/parse';
import { providerHidesCalculationMethod, providerHidesHanafiAsr } from '../src/settings/providerUi';
import { MAINSTREAM_PRAYER_PROVIDERS } from '../src/settings/providersCatalog';

const FIX = path.join(__dirname, 'fixtures/namazvakti');
const fixture = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const COLOGNE = fixture('cologne-5887.xml');
const ISTANBUL = fixture('istanbul-16741.xml');
const STOCKHOLM = fixture('stockholm-16258.xml');
const UMEA_NO_TABLE = fixture('umea-16347.xml');
const mockFetch = fetchWithRetry as jest.Mock;

function response(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

describe('the year file', () => {
  const year = parseNamazvaktiXml(COLOGNE, 2026);

  it('reads a city and its days, 31 December before to 2 January after', () => {
    expect(year.cityId).toBe(5887);
    expect(year.city).toBe('Köln');
    expect(Object.keys(year.days)).toHaveLength(368);
    expect(year.days['2025-12-31']).toBeDefined();
    expect(year.days['2026-02-28']).toBeDefined();
    expect(year.days['2027-01-02']).toBeDefined();
    expect(year.days['2026-10-14']).toHaveLength(14);
  });

  it('gives the calendar\'s printed columns: İmsâk, Sabâh for Fajr, Yatsı for Isha', () => {
    // The site's own page for Köln, 14 October 2026.
    expect(timingsFromRow(year.days['2026-10-14'], 0)).toEqual({
      Imsak: '05:45',
      Fajr: '06:04',
      Sunrise: '07:45',
      Dhuhr: '13:31',
      Asr: '16:20',
      Maghrib: '18:51',
      Isha: '20:38',
    });
  });

  it('gives the Asr-ı sânî to a reader who chose the Hanafi Asr', () => {
    expect(timingsFromRow(year.days['2026-10-14'], 1)?.Asr).toBe('17:03');
  });

  it('serves the site\'s held summer times, and every day of the year passes the app\'s checks', () => {
    // From late May to late July the sun does not reach 19° at Cologne; the
    // site holds the night times and marks them with a `*`.
    expect(year.days['2026-07-01'][0]).toBe('*1:35');
    const july = timingsFromRow(year.days['2026-07-01'], 0)!;
    expect(july.Imsak).toBe('01:35');
    expect(july.Isha).toBe('00:22');
    for (const parsed of [year, parseNamazvaktiXml(ISTANBUL, 2026)]) {
      for (const row of Object.values(parsed.days)) {
        expect(() => validateTimings(timingsFromRow(row, 0)!)).not.toThrow();
        expect(() => validateTimings(timingsFromRow(row, 1)!)).not.toThrow();
      }
    }
  });

  it('refuses what is not a year — an error page, a truncated file', () => {
    expect(() => parseNamazvaktiXml('<html>Hata</html>', 2026)).toThrow(/cityinfo/);
    expect(() => parseNamazvaktiXml(COLOGNE.slice(0, 20_000), 2026)).toThrow(/only \d+ days/);
  });

  it('reads the site\'s clock forms', () => {
    expect(clockOf('6:04')).toBe('06:04');
    expect(clockOf('*0:22')).toBe('00:22');
    expect(clockOf('-')).toBeNull();
    expect(clockOf('25:00')).toBeNull();
  });

  it('treats a day missing a needed time as missing', () => {
    const row = [...year.days['2026-10-14']];
    row[11] = '-';
    expect(timingsFromRow(row, 0)).toBeNull();
  });
});

describe('the city index the server builds', () => {
  it('reads the country list', () => {
    const countries = parseCountryList(fixture('countrylist.html'));
    expect(countries.length).toBeGreaterThanOrEqual(3);
    expect(countries).toEqual(expect.arrayContaining([{ id: 1, name: 'Afganistan' }, { id: 69, name: 'Almanya' }]));
  });

  it('reads a country\'s states, spelt as the site spells them', () => {
    const states = parseStateList(fixture('statelist-turkey.html'), 200);
    expect(states).toEqual(expect.arrayContaining(['Adana', 'Adıyaman']));
  });

  it('reads a state\'s cities and not the header\'s most-viewed links', () => {
    const cities = parseCityList(fixture('citylist-bayern.html'));
    const ids = cities.map(c => c.id);
    expect(cities).toEqual(expect.arrayContaining([{ id: 60853, name: 'Aichach' }, { id: 101446, name: 'Albaching' }]));
    expect(ids).not.toContain(16741); // İstanbul, in the header of every page
    expect(ids).not.toContain(5887);
  });

  it('reads a city\'s coordinates and height from the head of its XML', () => {
    expect(parseCityInfo(COLOGNE.slice(0, 600))).toEqual({
      id: 5887,
      countryId: 69,
      name: 'Köln',
      nameEn: 'Cologne',
      state: 'Nordrhein-Westfalen',
      lat: 50.9333,
      lon: 6.95,
      height: 250,
    });
    expect(parseCityInfo('<cityinfo ID="1">')).toBeNull();
  });

  it('cuts the world into the same tiles on the server and on the phone', () => {
    for (const [lat, lon] of [
      [50.93, 6.95],
      [41, 29],
      [-33.87, 151.2],
      [40.7, -74],
      [0, 0],
      [-0.01, -0.01],
      [64.1, -21.9],
      [-54.8, -68.3],
      [21.4, 179.99],
    ]) {
      expect(nvTileKey(lat, lon)).toBe(tileKey(lat, lon));
    }
    expect(nvTileKey(50.93, 6.95)).toBe('50_5');
    expect(nvTileKey(-33.87, 151.2)).toBe('-35_150');
  });

  it('looks across a tile edge for a nearer city', () => {
    // Just south of 50°N: its own tile is 45_5, but 50_5 is within reach.
    expect(nvTilesAround(49.9, 6.9, 0.7)).toEqual(expect.arrayContaining(['45_5', '50_5']));
    const near = nearestNvCity(49.9, 6.9, [
      [1, 49.0, 6.9, 'south'],
      [2, 50.05, 6.9, 'north'],
    ]);
    expect(near?.id).toBe(2);
    expect(near?.distanceKm).toBeGreaterThan(15);
    expect(near?.distanceKm).toBeLessThan(18);
  });
});

describe('on the phone, without the site', () => {
  // The method, against the site's whole published year for two cities.
  const compare = (xml: string, lat: number, lon: number, tz: string, heightM: number, tolerance: number, temkin?: number) => {
    const year = parseNamazvaktiXml(xml, 2026);
    const keys = ['Imsak', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
    const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    let within = 0;
    let total = 0;
    for (const [date, row] of Object.entries(year.days)) {
      if (!date.startsWith('2026')) continue;
      const site = timingsFromRow(row, 0)!;
      const [y, m, d] = date.split('-').map(Number);
      // The method formats in the test machine's zone; move each clock into
      // the city's zone, as it would read on a phone there.
      const calc = computeNamazvaktiMethodTimes({ latitude: lat, longitude: lon, date: new Date(y, m - 1, d), school: 0, heightM, temkin }).timings;
      const shift = zoneOffsetMin(tz, new Date(Date.UTC(y, m - 1, d, 12))) + new Date(y, m - 1, d, 12).getTimezoneOffset();
      for (const k of keys) {
        let diff = Math.abs(((min(calc[k]) + shift + 1440) % 1440) - min(site[k]));
        if (diff > 720) diff = 1440 - diff;
        total++;
        if (diff <= tolerance) within++;
      }
    }
    return within / total;
  };

  it('computes the calendar on the site’s minute, from Istanbul to Stockholm', () => {
    // Istanbul's 41° and 500 m, Cologne's 51°, Stockholm's 59° — the
    // temkin grows from 10.8 to 19.1 minutes across them. The rest are a
    // minute off: the site's files give a city's point to the arc-minute
    // and it computes with a finer one.
    expect(compare(ISTANBUL, 41, 29, 'Europe/Istanbul', 500, 0)).toBeGreaterThan(0.99);
    expect(compare(ISTANBUL, 41, 29, 'Europe/Istanbul', 500, 1)).toBe(1);
    expect(compare(COLOGNE, 50.9333, 6.95, 'Europe/Berlin', 250, 0)).toBeGreaterThan(0.88);
    expect(compare(COLOGNE, 50.9333, 6.95, 'Europe/Berlin', 250, 1)).toBe(1);
    expect(compare(STOCKHOLM, 59.3167, 18.0667, 'Europe/Stockholm', 250, 0)).toBeGreaterThan(0.95);
    // The truncated point puts one night Stockholm stops holding a day out.
    expect(compare(STOCKHOLM, 59.3167, 18.0667, 'Europe/Stockholm', 250, 1)).toBeGreaterThan(0.998);
  });

  it('is on the site’s minute at the city’s own point, fitted from a year it published', () => {
    // The files truncate a city's point to the arc-minute; the year itself
    // gives the finer one (and the city's temkin to a hundredth of a minute).
    const exact = (xml: string, lat: number, lon: number, tz: string, heightM: number) => {
      const p = fitNamazvaktiPoint(parseNamazvaktiXml(xml, 2026), { lat, lon, heightM })!;
      expect(Math.abs(p.lat - lat)).toBeLessThan(1.2 / 60);
      expect(Math.abs(p.lon - lon)).toBeLessThan(1.2 / 60);
      return compare(xml, p.lat, p.lon, tz, heightM, 0, p.temkin);
    };
    // Stockholm and Cologne every time of 2026, held summer nights and all;
    // Istanbul all but a few around the December solstice.
    expect(exact(STOCKHOLM, 59.3167, 18.0667, 'Europe/Stockholm', 250)).toBe(1);
    expect(exact(COLOGNE, 50.9333, 6.95, 'Europe/Berlin', 250)).toBeGreaterThan(0.999);
    expect(exact(ISTANBUL, 41, 29, 'Europe/Istanbul', 500)).toBeGreaterThan(0.995);
  });

  it('takes the temkin from the latitude and the city height, as the site does', () => {
    expect(temkinMinutes(30)).toBe(8);
    expect(temkinMinutes(41, 500)).toBe(11);
    expect(temkinMinutes(51)).toBe(13);
    expect(temkinMinutes(-51)).toBe(13);
    expect(temkinMinutes(59.3)).toBe(20);
    expect(Number.isFinite(temkinMinutes(78))).toBe(true);
  });
});

/** Minutes east of UTC for a named zone at an instant (Jest can't switch process TZ). */
function zoneOffsetMin(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((wall - at.getTime()) / 60000);
}

describe('the provider', () => {
  const COLOGNE_TILE = JSON.stringify({ v: 1, tile: '50_5', cities: [[5887, 50.9333, 6.95, 'Köln'], [5789, 52.5167, 13.4, 'Berlin']] });
  const coords = { latitude: 50.94, longitude: 6.96 };
  const day = new Date(2026, 9, 14);
  /**
   * The published Fajr of the city's own day for the phone's 14 October: on
   * a phone across the date line (Kiritimati) that is Köln's 13th
   * (`placeCivilDay`, as every source's day is read).
   */
  const fajrForDay = () => {
    const c = placeCivilDay(day, placeZoneFor(50.9333, 6.95, day));
    return c.d === 14 ? '06:04' : '06:03';
  };

  beforeEach(async () => {
    _resetNamazvaktiForTests();
    mockFetch.mockReset();
    await AsyncStorage.clear();
  });

  function serve(routes: Record<string, () => ReturnType<typeof response>>) {
    mockFetch.mockImplementation(async (url: string) => {
      for (const [part, answer] of Object.entries(routes)) if (url.includes(part)) return answer();
      return response(404, '');
    });
  }

  it('finds the nearest city in its tile and asks the site for that city\'s year — by id, not coordinates', async () => {
    serve({
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      'XML.php?cityID=5887': () => response(200, COLOGNE),
    });
    const r = await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
    expect(r.timings.Fajr).toBe(fajrForDay());
    expect(r.source).toBe('namazvakti');
    const urls = mockFetch.mock.calls.map(c => String(c[0]));
    const site = urls.filter(u => u.includes('namazvakti.com'));
    expect(site).toEqual(['https://www.namazvakti.com/XML.php?cityID=5887']);
    expect(urls.join(' ')).not.toMatch(/50\.94|6\.96|arz=|tul=/);
  });

  it('reads the year from Mihrab’s mirror first, and does not ask the site', async () => {
    const zlib = require('zlib') as typeof import('zlib');
    const year = parseNamazvaktiXml(COLOGNE, 2026);
    const bucket = { v: 1, bucket: 5887 % NV_PACK_BUCKETS, year: 2026, builtAt: 'x', cities: { '5887': packYear(year) } };
    const gz = zlib.gzipSync(JSON.stringify(bucket));
    serve({
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      [`/releases/download/data-namazvakti-2026/${namazvaktiBucketAsset(5887)}`]: () => ({
        ...response(200, ''),
        arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength),
      }),
      'XML.php?cityID=5887': () => {
        throw new Error('the site must not be asked when the mirror has the city');
      },
    });
    const r = await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
    expect(r.timings.Fajr).toBe(fajrForDay());
    expect(r.source).toBe('cdn');
    expect(mockFetch.mock.calls.map(c => String(c[0])).some(u => u.includes('namazvakti.com'))).toBe(false);
  });

  it('asks the site only when the mirror does not have the city', async () => {
    serve({
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      'XML.php?cityID=5887': () => response(200, COLOGNE),
    });
    const r = await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
    expect(r.source).toBe('namazvakti');
    const urls = mockFetch.mock.calls.map(c => String(c[0]));
    const mirrorAt = urls.findIndex(u => u.includes('/releases/download/data-namazvakti-2026/'));
    const siteAt = urls.findIndex(u => u.includes('namazvakti.com/XML.php'));
    expect(mirrorAt).toBeGreaterThanOrEqual(0);
    expect(siteAt).toBeGreaterThan(mirrorAt);
  });

  it('keeps the year: a second day and a second launch ask nothing', async () => {
    serve({
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      'XML.php?cityID=5887': () => response(200, COLOGNE),
    });
    await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
    const calls = mockFetch.mock.calls.length;
    await getNamazvaktiTimes({ ...coords, date: new Date(2026, 11, 1), school: 1 });
    _resetNamazvaktiForTests(); // a new process: memory gone, disk kept
    const r = await getNamazvaktiTimes({ ...coords, date: new Date(2026, 4, 2), school: 0 });
    expect(r.source).toBe('namazvakti');
    expect(mockFetch.mock.calls.length).toBe(calls);
  });

  it('answers from what the phone holds only, when told to stay offline', async () => {
    await expect(
      getNamazvaktiTimes({ ...coords, date: day, school: 0, offline: true }),
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses a place no listed city is near', async () => {
    serve({ '/tiles/': () => response(404, '') });
    await expect(getNamazvaktiTimes({ latitude: 0, longitude: -30, date: day, school: 0 })).rejects.toThrow(
      /No namazvakti\.com city/,
    );
  });

  it('asks again the next day for a square the index had not reached', async () => {
    const t0 = Date.now();
    serve({ '/tiles/': () => response(404, '') });
    await expect(getNamazvaktiTimes({ ...coords, date: day, school: 0 })).rejects.toThrow();
    serve({ '/tiles/50_5.json': () => response(200, COLOGNE_TILE), 'XML.php': () => response(200, COLOGNE) });
    const spy = jest.spyOn(Date, 'now').mockReturnValue(t0 + 25 * 60 * 60 * 1000);
    try {
      _resetNamazvaktiForTests();
      const r = await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
      expect(r.source).toBe('namazvakti');
    } finally {
      spy.mockRestore();
    }
  });

  it('says where it has no city, so Settings can warn as for the national sources', async () => {
    serve({ '/tiles/': () => response(404, '') });
    await expect(namazvaktiCoverage(0, -30)).resolves.toBe('no-city');
    serve({ '/tiles/50_5.json': () => response(200, COLOGNE_TILE), 'XML.php': () => response(200, COLOGNE) });
    _resetNamazvaktiForTests();
    await AsyncStorage.clear();
    await expect(namazvaktiCoverage(coords.latitude, coords.longitude, day)).resolves.toBe('site');
    mockFetch.mockRejectedValue(new Error('offline'));
    _resetNamazvaktiForTests();
    await AsyncStorage.clear();
    await expect(namazvaktiCoverage(coords.latitude, coords.longitude, day)).resolves.toBe('unknown');
  });

  it('passes over a listed city the site publishes no times for — north of 62°', async () => {
    const north = JSON.stringify({ v: 1, tile: '60_20', cities: [[16347, 63.8333, 20.25, 'Umea']] });
    serve({ '/tiles/60_20.json': () => response(200, north), 'cityID=16347': () => response(200, UMEA_NO_TABLE) });
    await expect(namazvaktiCoverage(63.83, 20.26, day)).resolves.toBe('no-city');
    await expect(getNamazvaktiTimes({ latitude: 63.83, longitude: 20.26, date: day, school: 0 })).rejects.toThrow();
    // Remembered: the site is not asked for that city again.
    const asked = mockFetch.mock.calls.filter(([u]) => String(u).includes('cityID=16347')).length;
    _resetNamazvaktiForTests();
    await getNamazvaktiTimes({ latitude: 63.83, longitude: 20.26, date: day, school: 0 }).catch(() => {});
    expect(mockFetch.mock.calls.filter(([u]) => String(u).includes('cityID=16347')).length).toBe(asked);
    // And a nearer one without times does not hide a farther one with them.
    const mixed = JSON.stringify({ v: 1, tile: '50_5', cities: [[16347, 50.94, 6.96, 'NoTimes'], [5887, 50.9333, 6.95, 'Köln']] });
    serve({ '/tiles/50_5.json': () => response(200, mixed), 'cityID=16347': () => response(200, UMEA_NO_TABLE), 'cityID=5887': () => response(200, COLOGNE) });
    await AsyncStorage.clear();
    _resetNamazvaktiForTests();
    const r = await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
    expect(r.source).toBe('namazvakti');
  });

  it('reports to the statistics panel like the other datasets', async () => {
    const { getDataStatus, _resetDataStatusMemoForTests } = require('../src/prayer/dataStatus');
    _resetDataStatusMemoForTests();
    serve({
      '/index.json': () =>
        response(200, JSON.stringify({ builtAt: '2026-10-14T01:37:00Z', serverStatus: 'ok', cities: 121776, located: 40000 })),
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      'XML.php': () => response(200, COLOGNE),
    });
    await pollNamazvaktiIndexNow(true);
    const s = (await getDataStatus()).servers.namazvakti;
    expect(s.builtAt).toBe('2026-10-14T01:37:00Z');
    expect(s.status).toBe('ok');
    expect(s.citiesListed).toBe(121776);
    expect(s.citiesLocated).toBe(40000);
    // Not asked again within six hours.
    const calls = mockFetch.mock.calls.length;
    await pollNamazvaktiIndexNow();
    expect(mockFetch.mock.calls.length).toBe(calls);
    // The city and its year, from what the phone holds.
    expect(await namazvaktiHeld(coords.latitude, coords.longitude)).toBeNull();
    await getNamazvaktiTimes({ ...coords, date: day, school: 0 });
    const held = await namazvaktiHeld(coords.latitude, coords.longitude);
    expect(held?.city.name).toBe('Köln');
    expect(held?.fetchedAt).toEqual(expect.any(String));
  });

  it('computes the calendar on the phone when the site cannot be reached — never AlAdhan', async () => {
    serve({
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      'XML.php': () => response(503, ''),
    });
    const r = await fetchPrayerTimesUnified({
      provider: 'namazvakti',
      ...coords,
      date: day,
      calculationMethod: 'auto',
      school: 0,
    });
    expect(r.source).toBe('local');
    expect(() => validateTimings(r.timings)).not.toThrow();
  });

  it('does not ask the site again straight after it failed', async () => {
    serve({
      '/tiles/50_5.json': () => response(200, COLOGNE_TILE),
      'XML.php': () => response(503, ''),
    });
    await expect(getNamazvaktiTimes({ ...coords, date: day, school: 0 })).rejects.toThrow();
    await expect(getNamazvaktiTimes({ ...coords, date: day, school: 0 })).rejects.toThrow();
    const site = mockFetch.mock.calls.filter(c => String(c[0]).includes('XML.php'));
    expect(site).toHaveLength(1);
  });
});

describe('wiring', () => {
  it('is offered beside the global sources, with its own method and the Hanafi Asr choice', () => {
    expect(MAINSTREAM_PRAYER_PROVIDERS.map(p => p.id)).toContain('namazvakti');
    expect(providerHidesCalculationMethod('namazvakti')).toBe(true);
    expect(providerHidesHanafiAsr('namazvakti')).toBe(false);
  });

  it('reads the held year first, so a day cached from the fallback is overtaken', () => {
    const storage = read('src/prayer/prayerStorage.ts');
    expect(storage).toMatch(/provider === 'namazvakti'\s*\n?\s*\);/);
    expect(storage).toMatch(/getNamazvaktiTimes\(\{ \.\.\.q, school: params\.school, offline \}\)/);
    // The cache-only reader never reaches the network.
    expect(storage).toMatch(/datasetTimesFor\(params\.provider, params, true\)/);
  });

  it('is named in the privacy policy, in both languages', () => {
    const policy = read('PRIVACY_POLICY.md');
    expect(policy.match(/namazvakti\.com/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('has a server job that keeps the city index current', () => {
    const wf = read('.github/workflows/namazvakti-dataset.yml');
    expect(wf).toMatch(/tools\/namazvakti-dataset\/build\.ts/);
    expect(wf).toMatch(/data\/prayer-times\/namazvakti/);
  });
});

describe('the year a site file is for', () => {
  it('is the one the file names, not the phone’s', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const xml: string = require('fs').readFileSync(
      require('path').join(__dirname, 'fixtures/namazvakti/istanbul-16741.xml'),
      'utf8',
    );
    // Fetched on 31 December 2025 for the year about to begin.
    const parsed = parseNamazvaktiXml(xml, 2025);
    expect(parsed.year).toBe(2026);
    expect(parsed.days['2026-06-15']).toBeDefined();
    expect(parsed.days['2025-12-31']).toBeDefined();
  });
});
