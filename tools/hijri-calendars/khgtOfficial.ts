/**
 * Muhammadiyah's own KHGT calendar, read from khgt.muhammadiyah.or.id.
 *
 * The site publishes every year it has fixed (1447–1492 AH when written) as
 * a printed month grid, one page per Hijri year, with no machine-readable
 * feed. This reads the grid: for each month, the heading ("Safar 1448 H"),
 * its Gregorian range ("Juli 2026 - Agustus 2026"), and the cell holding
 * Hijri day ١, whose tooltip names the Gregorian day ("18 Jul").
 *
 * The page is HTML for people, so the reader is strict: every month must
 * be found, numbered in order, and 29 or 30 days long, or the build stops.
 */

export const KHGT_SITE = 'https://khgt.muhammadiyah.or.id/kalendar-hijriah';

const MONTHS_ID: Record<string, number> = {
  muharam: 1,
  muharram: 1,
  safar: 2,
  rabiulawal: 3,
  rabiulakhir: 4,
  jumadilawal: 5,
  jumadilakhir: 6,
  rajab: 7,
  syakban: 8,
  syaban: 8,
  ramadan: 9,
  ramadhan: 9,
  syawal: 10,
  zulkaidah: 11,
  zulkaedah: 11,
  zulhijah: 12,
  zulhijjah: 12,
};

/** Indonesian month names and their short forms, full and abbreviated. */
const GREG_MONTHS: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12,
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function arabicNumber(s: string): number | null {
  let out = '';
  for (const ch of s.trim()) {
    const i = ARABIC_DIGITS.indexOf(ch);
    if (i >= 0) out += String(i);
    else if (ch >= '0' && ch <= '9') out += ch;
    else return null;
  }
  return out ? Number(out) : null;
}

export type OfficialStart = {
  year: number;
  month: number;
  start: string;
  /** Days the page draws for the month: 1, 2, … in order, 29 or 30. */
  length: number;
};

/** A month the page shows without real dates — the site's own placeholder
 *  ("Januari 1970", the Unix epoch) where it has no data. */
export type MissingMonth = { year: number; month: number; missing: true };

/** Roughly the Gregorian year a Hijri year falls in. */
function gregorianYearNear(hijriYear: number): number {
  return Math.round(hijriYear * 0.970229 + 621.5643);
}

/** The month starts on one Hijri year's page. */
export function parseYearPage(html: string, hijriYear: number): (OfficialStart | MissingMonth)[] {
  const out: (OfficialStart | MissingMonth)[] = [];
  const heading = /<h2[^>]*>\s*([A-Za-z']+)\s+(\d{4})\s*H\s*<\/h2>/g;
  const marks: { name: string; year: number; at: number }[] = [];
  for (let m = heading.exec(html); m; m = heading.exec(html)) {
    marks.push({ name: m[1], year: Number(m[2]), at: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const { name, year, at } = marks[i];
    if (year !== hijriYear) continue;
    const month = MONTHS_ID[name.toLowerCase().replace(/'/g, '')];
    if (!month) throw new Error(`${hijriYear}: unknown month "${name}"`);
    const block = html.slice(at, i + 1 < marks.length ? marks[i + 1].at : html.length);

    // "Juli 2026 - Agustus 2026": the Gregorian years this month spans.
    const range = /<p[^>]*>\s*([A-Za-z]+)\s+(\d{4})\s*(?:-\s*([A-Za-z]+)\s+(\d{4}))?\s*<\/p>/.exec(block);
    if (!range) throw new Error(`${name} ${year}: no Gregorian range`);
    const firstMonth = GREG_MONTHS[range[1].toLowerCase()];
    const firstYear = Number(range[2]);
    const lastYear = range[4] ? Number(range[4]) : firstYear;
    if (Math.abs(firstYear - gregorianYearNear(year)) > 1) {
      out.push({ year, month, missing: true });
      continue;
    }

    // Each day: its tooltip ("<strong>18 Jul</strong>") and, after it, the
    // Hijri day in Arabic digits.
    const cell = /data-bs-title="([^"]*)"[\s\S]*?font-family:\s*amiri;?"\s*>\s*([^<\s]+)\s*</g;
    const cells: { title: string; day: number | null }[] = [];
    for (let c = cell.exec(block); c; c = cell.exec(block)) {
      cells.push({ title: decodeEntities(c[1]), day: arabicNumber(c[2]) });
    }
    const first = cells.findIndex(c => c.day === 1);
    let found: string | null = null;
    let length = 0;
    if (first >= 0) {
      const g = /<strong>\s*(\d{1,2})\s+([A-Za-z]+)\s*<\/strong>/.exec(cells[first].title);
      if (!g) throw new Error(`${name} ${year}: unreadable day "${cells[first].title}"`);
      const gm = GREG_MONTHS[g[2].toLowerCase()];
      if (!gm) throw new Error(`${name} ${year}: unknown Gregorian month "${g[2]}"`);
      // Day 1 falls in the range's first month or the one after it.
      const gy = gm >= firstMonth ? firstYear : lastYear;
      found = `${gy}-${String(gm).padStart(2, '0')}-${String(Number(g[1])).padStart(2, '0')}`;
      // The month's own days must follow on: 1, 2, 3 … to its last.
      length = 1;
      for (let k = first + 1; k < cells.length && cells[k].day === length + 1; k++) length++;
      if (length !== 29 && length !== 30) {
        throw new Error(`${name} ${year}: the page draws ${length} days`);
      }
    }
    if (!found) throw new Error(`${name} ${year}: no day 1`);
    out.push({ year, month, start: found, length });
  }
  return out;
}

/** The Hijri years the site offers, from its year picker. */
export function parseYears(html: string): number[] {
  const select = /<select[^>]*id="year-select"[\s\S]*?<\/select>/.exec(html);
  if (!select) throw new Error('no year picker');
  const years = [...select[0].matchAll(/<option value="(\d{4})"/g)].map(m => Number(m[1]));
  if (years.length === 0) throw new Error('empty year picker');
  return years;
}

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mihrab calendar build (github.com/MihrabHQ/Mihrab)' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Every month start the site publishes, in order and checked. */
export async function fetchOfficialKhgt(log: (s: string) => void = () => {}): Promise<OfficialStart[]> {
  const years = parseYears(await get(KHGT_SITE));
  const pages: (OfficialStart | MissingMonth)[] = [];
  for (const y of years) {
    const months = parseYearPage(await get(`${KHGT_SITE}?year=${y}`), y);
    if (months.length !== 12) throw new Error(`${y}: ${months.length} months on the page`);
    pages.push(...months);
    const shown = months.map(m => ('missing' in m ? '?' : m.start));
    log(`khgt official ${y}: ${shown[0]} … ${shown[11]}`);
    await new Promise(r => setTimeout(r, 500));
  }
  pages.sort((a, b) => a.year - b.year || a.month - b.month);
  // A month without dates is accepted only at the END (the site's last
  // published month has none); anywhere else the page is not what this
  // reader understands, and the build stops.
  while (pages.length && 'missing' in pages[pages.length - 1]) {
    const m = pages.pop()!;
    log(`khgt official ${m.year}-${m.month}: no dates on the site, left to the rule`);
  }
  const hole = pages.find(m => 'missing' in m);
  if (hole) throw new Error(`${hole.year}-${hole.month}: no dates on the site`);
  const all = pages as OfficialStart[];
  for (let i = 1; i < all.length; i++) {
    const p = all[i - 1];
    const c = all[i];
    const wantY = p.month === 12 ? p.year + 1 : p.year;
    const wantM = p.month === 12 ? 1 : p.month + 1;
    if (c.year !== wantY || c.month !== wantM) throw new Error(`gap after ${p.year}-${p.month}`);
    const days = (Date.parse(c.start) - Date.parse(p.start)) / 86_400_000;
    if (days !== 29 && days !== 30) throw new Error(`${p.year}-${p.month} is ${days} days`);
    // Two readings of the same month — the next one's start, and the days
    // drawn in its own grid — must agree.
    if (days !== p.length) {
      throw new Error(`${p.year}-${p.month}: ${days} days to the next month, but the page draws ${p.length}`);
    }
  }
  return all;
}
