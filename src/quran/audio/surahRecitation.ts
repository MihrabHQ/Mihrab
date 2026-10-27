/**
 * Where each ayah is inside a whole-surah recording.
 *
 * The mp3quran.net recitations (SURAH_FILE_RECITERS) come as one file per
 * surah. An ayah is played as a CLIP of that file — a track that starts at
 * the ayah's beginning (`trimStart`) and ends at its end (`clipEnd`), which
 * the player honours natively on Android and from `seams.ts` elsewhere —
 * so the queue, the repeats, the drill's rests, the highlight and the
 * listening page all work exactly as they do for a file per ayah.
 *
 * The boundaries are bundled, one small table per reciter, written by
 * `tools/surah-audio/align.py`: the publisher's own timings, each moved
 * onto the pause nearest it in the decoded audio. A best attempt — see
 * SURAH_FILE_RECITERS for what that does and does not promise.
 *
 * Table format (v2):
 *   n  ayahs per surah, ×114 — the reading's own count
 *   b  base64, big-endian uint24, 10 ms units: per surah, its ayahs'
 *      starts and then the last ayah's end (n + 1 values), surah by surah
 *   d  base64, big-endian uint24, 10 ms units: each surah file's length
 *   z  base64, big-endian uint32: each surah file's size in bytes
 *   bytes  the whole recitation on disk — the sum of `z`
 *   c  (v3) base64 bitset, one bit per boundary in `b`'s order, most
 *      significant first: set when that boundary was CONFIRMED — the
 *      text alignment, the pause in the audio and a check of the words
 *      either side all agree (tools/surah-audio/textalign.py)
 *
 * v2 tables have no `c` and every boundary counts as a best attempt.
 *
 * ── THE SIZES ARE THE SAFETY ──────────────────────────────────────────
 *
 * The boundaries fit ONE recording, byte for byte. A file of any other size
 * — cut short, damaged on the device, or replaced at the source — would be
 * cut in the wrong places, and a reader repeating an ayah to memorise it
 * would be repeating the wrong words. So a surah file is used only when its
 * size is exactly the one here (audioStore), and a table without sizes
 * (v1) is not used at all.
 */

type Table = {
  v: number;
  n: number[];
  b: string;
  d: string;
  z: string;
  bytes: number;
  c?: string;
};

/* eslint-disable @typescript-eslint/no-require-imports */
const TABLES: Record<string, () => Table> = {
  'husary-warsh': () => require('../data/surahRecitations/husary-warsh.json'),
  'warsh-koshi': () => require('../data/surahRecitations/warsh-koshi.json'),
  'husary-qalun': () => require('../data/surahRecitations/husary-qalun.json'),
  'qalun-hudhaify': () =>
    require('../data/surahRecitations/qalun-hudhaify.json'),
  'shubah-hudhaify': () =>
    require('../data/surahRecitations/shubah-hudhaify.json'),
  zahrani: () => require('../data/surahRecitations/zahrani.json'),
  maasaraawi: () => require('../data/surahRecitations/maasaraawi.json'),
  balilah: () => require('../data/surahRecitations/balilah.json'),
  'dosari-hafs': () => require('../data/surahRecitations/dosari-hafs.json'),
  'salah-hashim': () => require('../data/surahRecitations/salah-hashim.json'),
  tunaiji: () => require('../data/surahRecitations/tunaiji.json'),
  salemi: () => require('../data/surahRecitations/salemi.json'),
  buaijan: () => require('../data/surahRecitations/buaijan.json'),
  dukhain: () => require('../data/surahRecitations/dukhain.json'),
  'wadee-yamani': () => require('../data/surahRecitations/wadee-yamani.json'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/* eslint-disable no-bitwise -- base64 and packed integers are bit work. */
function bytesOf(b64: string): number[] {
  const clean = b64.replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < clean.length; i++) {
    value = ((value << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Big-endian uint24s in 10 ms units, as seconds. */
function uint24s(b64: string): number[] {
  const bytes = bytesOf(b64);
  const out: number[] = [];
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    out.push(((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]) / 100);
  }
  return out;
}

/** Big-endian uint32s. */
function uint32s(b64: string): number[] {
  const bytes = bytesOf(b64);
  const out: number[] = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    // `>>> 0`: a size over 2 GiB would otherwise read as negative.
    out.push(
      ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0,
    );
  }
  return out;
}
/* eslint-enable no-bitwise */

type Decoded = {
  /** Per surah (index surah − 1): its n + 1 boundaries, in seconds. */
  bounds: number[][];
  /** Per surah: the file's length in seconds. */
  lengths: number[];
  /** Per surah: the file's exact size in bytes. */
  sizes: number[];
  bytes: number;
  /** Per surah, per boundary: confirmed (v3), or null for a v2 table. */
  confirmed: boolean[][] | null;
};

const decoded = new Map<string, Decoded | null>();
const testTables = new Map<string, Table>();

function tableOf(reciterId: string): Decoded | null {
  if (decoded.has(reciterId)) return decoded.get(reciterId)!;
  const given = testTables.get(reciterId);
  const load = given ? () => given : TABLES[reciterId];
  let out: Decoded | null = null;
  try {
    const table = load?.();
    if (table && (table.v === 2 || table.v === 3) && table.n.length === 114) {
      const flat = uint24s(table.b);
      const lengths = uint24s(table.d);
      const sizes = uint32s(table.z);
      const bounds: number[][] = [];
      let at = 0;
      for (const n of table.n) {
        bounds.push(flat.slice(at, at + n + 1));
        at += n + 1;
      }
      // A table that does not add up is not used at all: half a surah cut
      // in the wrong places is worse than a recitation that will not play.
      const sizesAddUp =
        sizes.length === 114 &&
        sizes.every(z => z > 1000) &&
        sizes.reduce((a, z) => a + z, 0) === table.bytes;
      const inOrder = bounds.every(
        (b, i) =>
          b.length >= 2 &&
          b.every((t, k) => k === 0 || t > b[k - 1]) &&
          // The last ayah ends inside its file (a little slack for how the
          // length was rounded).
          b[b.length - 1] <= lengths[i] + 0.5,
      );
      let confirmed: boolean[][] | null = null;
      /* eslint-disable no-bitwise -- one bit per boundary */
      if (table.v === 3 && typeof table.c === 'string') {
        const bits = bytesOf(table.c);
        confirmed = [];
        let k = 0;
        for (const b of bounds) {
          const row: boolean[] = [];
          for (let i = 0; i < b.length; i++, k++) {
            row.push(((bits[k >> 3] ?? 0) & (0x80 >> (k & 7))) !== 0);
          }
          confirmed.push(row);
        }
      }
      /* eslint-enable no-bitwise */
      const confirmedAddsUp = table.v !== 3 || confirmed != null;
      if (at === flat.length && lengths.length === 114 && sizesAddUp && inOrder && confirmedAddsUp) {
        out = { bounds, lengths, sizes, bytes: table.bytes, confirmed };
      }
    }
  } catch {
    out = null;
  }
  decoded.set(reciterId, out);
  return out;
}

export type AyahClip = {
  /** Where the ayah starts in its surah's file, seconds. */
  start: number;
  /** Where it ends, seconds. */
  end: number;
};

/**
 * One ayah's place in its surah's file, or null when this recitation has
 * no table, or the ayah is not in it.
 *
 * `withOpening`: the first ayah from the very start of the file — the
 * taʿawwudh and basmalah the reciter opens the surah with, which belong to
 * hearing the surah begin and not to the ayah repeated on its own.
 */
export function ayahClip(
  reciterId: string,
  surah: number,
  ayah: number,
  withOpening = false,
): AyahClip | null {
  const bounds = tableOf(reciterId)?.bounds[surah - 1];
  if (!bounds || ayah < 1 || ayah >= bounds.length) return null;
  const start = ayah === 1 && withOpening ? 0 : bounds[ayah - 1];
  return { start, end: bounds[ayah] };
}

/** Ayahs per surah as this recitation counts them, or null. */
export function clipAyahCount(reciterId: string, surah: number): number | null {
  const bounds = tableOf(reciterId)?.bounds[surah - 1];
  return bounds ? bounds.length - 1 : null;
}

/** The whole recitation's size on disk, exactly, or null. */
export function surahRecitationBytes(reciterId: string): number | null {
  return tableOf(reciterId)?.bytes ?? null;
}

/** A surah file's exact size — the only size it is used at — or null. */
export function expectedSurahBytes(reciterId: string, surah: number): number | null {
  return tableOf(reciterId)?.sizes[surah - 1] ?? null;
}

/** A surah file's measured length in seconds, or null. */
export function surahFileSeconds(reciterId: string, surah: number): number | null {
  return tableOf(reciterId)?.lengths[surah - 1] ?? null;
}

/**
 * The ayah of this recitation's own count that holds a moment of a surah's
 * file — for a scrub on the lock screen, which moves through the whole
 * file. Null outside the recited ayahs (the opening, the tail).
 */
export function ayahAt(reciterId: string, surah: number, seconds: number): number | null {
  const bounds = tableOf(reciterId)?.bounds[surah - 1];
  if (!bounds) return null;
  for (let a = 1; a < bounds.length; a++) {
    if (seconds >= bounds[a - 1] && seconds < bounds[a]) return a;
  }
  return null;
}

/**
 * Whether EVERY boundary of this recitation was confirmed — the alignment
 * against the text, the pause in the audio and the words either side all
 * agreeing (textalign.py). Such a recitation is cut as exactly as a file
 * per ayah, and the app treats it so: no "best-effort" label, no report.
 */
export function isExactRecitation(reciterId: string): boolean {
  const confirmed = tableOf(reciterId)?.confirmed;
  return confirmed != null && confirmed.every(row => row.every(Boolean));
}

/** How many of a recitation's boundaries are confirmed, of how many. */
export function confirmedBoundaries(reciterId: string): { confirmed: number; total: number } | null {
  const table = tableOf(reciterId);
  if (!table) return null;
  let total = 0;
  let confirmed = 0;
  for (const row of table.confirmed ?? table.bounds.map(b => b.map(() => false))) {
    total += row.length;
    confirmed += row.filter(Boolean).length;
  }
  return { confirmed, total };
}

/** Whether a whole-surah recitation's boundaries are in the app. */
export function hasSurahTable(reciterId: string): boolean {
  return tableOf(reciterId) != null;
}

/** For tests: a table as if it had been read from a file. */
export function _setSurahTableForTests(reciterId: string, table: Table): void {
  decoded.delete(reciterId);
  testTables.set(reciterId, table);
}

/** For tests. */
export function _resetSurahTablesForTests(): void {
  decoded.clear();
  testTables.clear();
}
