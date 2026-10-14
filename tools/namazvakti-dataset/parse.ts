/**
 * The pure half of the namazvakti.com city-index builder: pages in, records
 * out. No network, no files — `build.ts` does those — so every parser can
 * be tested on a saved page (`__tests__/namazvaktiBuilder.test.ts`).
 *
 * The site has no API. What it has, and what this reads:
 *
 *   CountryList.php                       every country, as StateList links
 *   StateList.php?countryID=N             the country's states / provinces
 *   CityList.php?countryID=N&state=S      every city in one state
 *   XML.php?cityID=N                      the city's year; its root element
 *                                         carries the coordinates
 *
 * Only the root element of the XML is needed here (the times are fetched by
 * the phone itself, a year at a time — see src/providers/namazvakti.ts), so
 * the builder stops reading each file once it has it.
 */

export type CountryRef = { id: number; name: string };
export type CityRef = { id: number; name: string };
export type CityInfo = {
  id: number;
  countryId: number;
  name: string;
  nameEn: string;
  state: string;
  lat: number;
  lon: number;
  /** Metres — the height the site's temkin is worked out for. */
  height: number;
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim();
}

/** `CountryList.php`: every country the site lists. */
export function parseCountryList(html: string): CountryRef[] {
  const out = new Map<number, string>();
  const re =
    /href="\/?StateList\.php\?countryID=(\d+)"[^>]*>(?:\s*<span[^>]*>[^<]*<\/span>)?([^<]+)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    const name = decodeHtml(m[2]);
    if (id > 0 && name && !out.has(id)) out.set(id, name);
  }
  return [...out].map(([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id);
}

/** `StateList.php?countryID=N`: the country's states, as the site spells them. */
export function parseStateList(html: string, countryId: number): string[] {
  const out = new Set<string>();
  const re = new RegExp(
    `href="\\/?CityList\\.php\\?countryID=${countryId}&(?:amp;)?state=([^"]+)"`,
    'g',
  );
  for (const m of html.matchAll(re)) {
    const state = decodeHtml(m[1]);
    if (state) out.add(state);
  }
  return [...out];
}

/**
 * `CityList.php?countryID=N&state=S`: the cities of one state.
 *
 * Only the list itself — `countryListElement` rows — and not the header's
 * "most viewed" links, which are the same handful of cities on every page.
 */
export function parseCityList(html: string): CityRef[] {
  const out = new Map<number, string>();
  const re =
    /class="countryListElement"><a href="\/?Main\.php\?cityID=(\d+)"[^>]*>(?:\s*<span[^>]*>[^<]*<\/span>)?([^<]+)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    const name = decodeHtml(m[2]);
    if (id > 0 && name && !out.has(id)) out.set(id, name);
  }
  return [...out].map(([id, name]) => ({ id, name }));
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeHtml(m[1]) : undefined;
}

/** Degrees, minutes and a hemisphere letter as the site writes them. */
export function dms(deg?: string, min?: string, dir?: string): number {
  const d = Number(deg);
  const m = Number(min ?? 0);
  if (deg == null || deg === '' || !Number.isFinite(d) || !Number.isFinite(m) || !dir) return NaN;
  const v = d + m / 60;
  return /^[SW]$/i.test(dir) ? -v : v;
}

/** The `<cityinfo …>` element of `XML.php`, or null if it is not there or not whole. */
export function parseCityInfo(xmlHead: string): CityInfo | null {
  const m = /<cityinfo\b[^>]*>/.exec(xmlHead);
  if (!m) return null;
  const tag = m[0];
  const id = Number(attr(tag, 'ID'));
  const lat = dms(attr(tag, 'arzDer'), attr(tag, 'arzDak'), attr(tag, 'arzYon'));
  const lon = dms(attr(tag, 'tulDer'), attr(tag, 'tulDak'), attr(tag, 'tulYon'));
  if (!(id > 0) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    id,
    countryId: Number(attr(tag, 'countryID')) || 0,
    name: attr(tag, 'cityNameTR') ?? '',
    nameEn: attr(tag, 'cityNameEN') ?? attr(tag, 'cityNameTR') ?? '',
    state: attr(tag, 'cityStateEN') ?? attr(tag, 'cityStateTR') ?? '',
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    height: Number(attr(tag, 'height')) || 0,
  };
}

/**
 * The tile a point falls in. Tiles are TILE_DEG on a side, keyed by their
 * south-west corner — "35_25" holds 35..40°N, 25..30°E — so a phone can
 * work out which file to ask for from its own coordinates alone. The same
 * function is in the app (src/providers/namazvaktiCities.ts) and a test
 * holds the two equal.
 */
export const TILE_DEG = 5;
export function tileKey(lat: number, lon: number): string {
  const la = Math.floor(Math.max(-90, Math.min(89.999, lat)) / TILE_DEG) * TILE_DEG;
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  const lo = Math.floor(wrapped / TILE_DEG) * TILE_DEG;
  return `${la}_${lo}`;
}
