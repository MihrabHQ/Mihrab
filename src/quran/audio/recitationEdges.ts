/**
 * THE JOINS BETWEEN AYAHS.
 *
 * EveryAyah cuts one file per ayah, and some reciters' cuts leave silence
 * at both ends of every file: about two seconds at each join for Husary —
 * the default reciter — two and a half for Abdul Basit's mujawwad, three
 * and a half for Husary's. Played back to back, that is the recitation stopping
 * between every ayah, which a continuous listen in Tilawah makes plain.
 *
 * `tools/recitation-edges/edges.py` measured the silence at each end of
 * every file for the eighteen reciters who have it
 * (`data/recitationEdges/`), and
 * the player starts each file just before its first sound and moves on
 * just after its last, keeping a breath either side: `LEAD_KEEP` before,
 * `TAIL_KEEP` after. Silence INSIDE an ayah — a waqf, a breath — is the
 * recitation and is never touched; only the two ends of the file are.
 *
 * Measured from the sound, not from the quran-align word timings: those end
 * before the sound does in most of Husary's files (median 0.8 s, up to
 * 3 s), and a cut there would clip the end of the ayah. A file the tool
 * could not read is not trimmed, and neither is any reciter not listed —
 * most cut their files tight already. Husary's Muʿallim is left out on
 * purpose: its long tail is the gap the learner recites back in.
 *
 * The trims ride on the track (`trimStart`, `trimEnd`, in seconds), and
 * the player honours them: natively on Android, where JS timers stop in a
 * pocket, and from `seams.ts` elsewhere.
 */
import { ayahIndexOf } from '../ayahIndex';

/** Silence kept before the first sound of an ayah, in seconds. */
export const LEAD_KEEP = 0.1;
/** Silence kept after the last sound, in seconds: the breath between ayahs. */
export const TAIL_KEEP = 0.25;
/** Less than this is not worth a seek. */
export const MIN_TRIM = 0.15;

/**
 * `e`: two bytes per ayah in mushaf order, the silence before and after,
 * in 20 ms. `d` (format 3 on): two more per ayah, the file's whole length
 * in tenths of a second, big-endian, 0 where it was not measured. A
 * format-2 table has no `d`: the lengths came with the tool's third run,
 * and a table measured before it still trims as it did.
 */
type Table = { v: number; e: string; d?: string };

/* eslint-disable @typescript-eslint/no-require-imports */
const TABLES: Record<string, () => Table> = {
  Husary_64kbps: () => require('../data/recitationEdges/Husary_64kbps.json'),
  Husary_Mujawwad_64kbps: () =>
    require('../data/recitationEdges/Husary_Mujawwad_64kbps.json'),
  Karim_Mansoori_40kbps: () =>
    require('../data/recitationEdges/Karim_Mansoori_40kbps.json'),
  Abdul_Basit_Mujawwad_128kbps: () =>
    require('../data/recitationEdges/Abdul_Basit_Mujawwad_128kbps.json'),
  Minshawy_Mujawwad_192kbps: () =>
    require('../data/recitationEdges/Minshawy_Mujawwad_192kbps.json'),
  Ayman_Sowaid_64kbps: () =>
    require('../data/recitationEdges/Ayman_Sowaid_64kbps.json'),
  Abdul_Basit_Murattal_64kbps: () =>
    require('../data/recitationEdges/Abdul_Basit_Murattal_64kbps.json'),
  Hudhaify_128kbps: () =>
    require('../data/recitationEdges/Hudhaify_128kbps.json'),
  Ibrahim_Akhdar_32kbps: () =>
    require('../data/recitationEdges/Ibrahim_Akhdar_32kbps.json'),
  Ali_Jaber_64kbps: () =>
    require('../data/recitationEdges/Ali_Jaber_64kbps.json'),
  Mahmoud_Ali_Al_Banna_32kbps: () =>
    require('../data/recitationEdges/Mahmoud_Ali_Al_Banna_32kbps.json'),
  'warsh/warsh_ibrahim_aldosary_128kbps': () =>
    require('../data/recitationEdges/warsh_warsh_ibrahim_aldosary_128kbps.json'),
  Minshawy_Murattal_128kbps: () =>
    require('../data/recitationEdges/Minshawy_Murattal_128kbps.json'),
  Abdullah_Basfar_64kbps: () =>
    require('../data/recitationEdges/Abdullah_Basfar_64kbps.json'),
  Muhammad_Ayyoub_128kbps: () =>
    require('../data/recitationEdges/Muhammad_Ayyoub_128kbps.json'),
  Muhammad_Jibreel_128kbps: () =>
    require('../data/recitationEdges/Muhammad_Jibreel_128kbps.json'),
  Ahmed_Neana_128kbps: () =>
    require('../data/recitationEdges/Ahmed_Neana_128kbps.json'),
  'warsh/warsh_yassin_al_jazaery_64kbps': () =>
    require('../data/recitationEdges/warsh_warsh_yassin_al_jazaery_64kbps.json'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decode(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    value = (value << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

type Decoded = { edges: Uint8Array; lengths: Uint8Array | null };

const decoded = new Map<string, Decoded | null>();
const testTables = new Map<string, Table>();

function tableOf(folder: string): Decoded | null {
  if (decoded.has(folder)) return decoded.get(folder)!;
  const given = testTables.get(folder);
  const load = given ? () => given : TABLES[folder];
  let out: Decoded | null = null;
  if (load) {
    try {
      const table = load();
      if (table.v === 2 || table.v === 3) {
        const edges = decode(table.e);
        const lengths =
          table.v === 3 && typeof table.d === 'string' ? decode(table.d) : null;
        if (edges.length === 6236 * 2) {
          out = {
            edges,
            lengths: lengths && lengths.length === 6236 * 2 ? lengths : null,
          };
        }
      }
    } catch {
      out = null;
    }
  }
  decoded.set(folder, out);
  return out;
}

function edgesOf(folder: string): Uint8Array | null {
  return tableOf(folder)?.edges ?? null;
}

export type Trim = { trimStart?: number; trimEnd?: number };

/**
 * How much of a file to skip at each end, in seconds — or nothing.
 *
 * `fileAyah` is the recording's own number, the Ḥafṣ one (riwayahAudio.ts).
 */
export function trimFor(folder: string, surah: number, fileAyah: number): Trim {
  const bytes = edgesOf(folder);
  if (!bytes) return {};
  const i = (ayahIndexOf(surah, fileAyah) - 1) * 2;
  const lead = bytes[i];
  const tail = bytes[i + 1];
  if (lead === 255 && tail === 255) return {}; // not measured
  const out: Trim = {};
  const start = lead / 50 - LEAD_KEEP;
  const end = tail / 50 - TAIL_KEEP;
  if (start >= MIN_TRIM) out.trimStart = Math.round(start * 100) / 100;
  if (end >= MIN_TRIM) out.trimEnd = Math.round(end * 100) / 100;
  return out;
}

/**
 * How long the recitation in a file lasts, in seconds — its whole length
 * less the silence measured at its two ends — or undefined when the file's
 * length was not measured.
 *
 * What the drill's "pause between repeats" rests for (rest.ts). A file's
 * length is not known before it plays, so it is measured with the edges
 * (`tools/recitation-edges/edges.py`, format 3). Tables measured before
 * the lengths were added have none, and the drill then estimates from the
 * ayah's words.
 */
export function spokenSecondsOf(
  folder: string,
  surah: number,
  fileAyah: number,
): number | undefined {
  const table = tableOf(folder);
  if (!table?.lengths) return undefined;
  const n = ayahIndexOf(surah, fileAyah) - 1;
  if (!(n >= 0 && n < 6236)) return undefined;
  const length = ((table.lengths[n * 2] << 8) | table.lengths[n * 2 + 1]) / 10;
  if (!(length > 0)) return undefined;
  const lead = table.edges[n * 2];
  const tail = table.edges[n * 2 + 1];
  const silence = lead === 255 && tail === 255 ? 0 : (lead + tail) / 50;
  return Math.max(0, Math.round((length - silence) * 100) / 100);
}

/** For tests: a table as if it had been read from a file. */
export function _setRecitationTableForTests(
  folder: string,
  table: Table,
): void {
  decoded.delete(folder);
  testTables.set(folder, table);
}

/** Which reciters have measured joins. */
export function hasEdges(folder: string): boolean {
  return folder in TABLES;
}

/** For tests. */
export function _resetRecitationEdgesForTests(): void {
  decoded.clear();
  testTables.clear();
}
