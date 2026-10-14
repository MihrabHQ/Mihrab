/**
 * One-off: list and locate a single country's cities now and write its tiles,
 * so the provider can be tried there before the full crawl reaches it.
 *   npx tsx tools/namazvakti-dataset/seed-country.ts Sweden
 * The full crawl's next publish rewrites the same tiles from its own table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseCityInfo, parseCityList, parseCountryList, parseStateList, tileKey } from './parse';

const ORIGIN = 'https://www.namazvakti.com';
const DIR = path.join(__dirname, '../../data/prayer-times/namazvakti/v1/tiles');
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get(url: string, until?: RegExp): Promise<string> {
  await sleep(300);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  const text = await res.text();
  if (until && !until.test(text)) throw new Error(`no match in ${url}`);
  return text;
}

(async () => {
  const want = process.argv[2] ?? 'Sweden';
  const country = parseCountryList(await get(`${ORIGIN}/CountryList.php?WSLanguage=EN`)).find(c => c.name === want);
  if (!country) throw new Error(`no country ${want}`);
  const page = await get(`${ORIGIN}/StateList.php?countryID=${country.id}&WSLanguage=EN`);
  const states = parseStateList(page, country.id);
  const refs = states.length ? [] : parseCityList(page);
  for (const s of states) {
    refs.push(...parseCityList(await get(`${ORIGIN}/CityList.php?countryID=${country.id}&state=${encodeURIComponent(s)}&WSLanguage=EN`)));
  }
  console.log(`${want}: ${states.length} states, ${refs.length} cities`);
  const tiles = new Map<string, [number, number, number, string][]>();
  for (const ref of refs) {
    const info = parseCityInfo(await get(`${ORIGIN}/XML.php?cityID=${ref.id}`));
    if (!info || !Number.isFinite(info.lat)) continue;
    const key = tileKey(info.lat, info.lon);
    tiles.set(key, [...(tiles.get(key) ?? []), [ref.id, info.lat, info.lon, ref.name]]);
  }
  fs.mkdirSync(DIR, { recursive: true });
  for (const [key, list] of tiles) {
    const file = path.join(DIR, `${key}.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).cities : [];
    const byId = new Map<number, [number, number, number, string]>(old.map((c: [number, number, number, string]) => [c[0], c]));
    for (const c of list) byId.set(c[0], c);
    const cities = [...byId.values()].sort((a, b) => a[0] - b[0]);
    fs.writeFileSync(file, `${JSON.stringify({ v: 1, tile: key, cities })}\n`, 'utf8');
    console.log(`  ${key}: ${cities.length}`);
  }
})();
