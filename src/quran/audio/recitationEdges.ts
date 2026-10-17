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

/** Two bytes per ayah in mushaf order: the silence before and after, in 20 ms. */
type Table = { v: number; e: string };

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

const decoded = new Map<string, Uint8Array | null>();

function edgesOf(folder: string): Uint8Array | null {
  if (decoded.has(folder)) return decoded.get(folder)!;
  const load = TABLES[folder];
  let bytes: Uint8Array | null = null;
  if (load) {
    try {
      const table = load();
      if (table.v === 2) bytes = decode(table.e);
    } catch {
      bytes = null;
    }
  }
  decoded.set(folder, bytes && bytes.length === 6236 * 2 ? bytes : null);
  return decoded.get(folder)!;
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

/** Which reciters have measured joins. */
export function hasEdges(folder: string): boolean {
  return folder in TABLES;
}

/** For tests. */
export function _resetRecitationEdgesForTests(): void {
  decoded.clear();
}
