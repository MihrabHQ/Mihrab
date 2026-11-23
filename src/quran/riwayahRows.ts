/**
 * The reader's riwayah, laid along the Ḥafṣ ayahs of the translation view.
 *
 * ── WHY NOT `riwayahAyahText(riwayah, surah, n)` FOR ROW n ────────────
 *
 * The translation view — and with it the Hifz revision cards (#138) — is
 * built on the Ḥafṣ count: its rows are Ḥafṣ ayahs, and the translation,
 * the tafsir, the recordings and a Hifz portion's range all speak it.
 * Warsh and Qālūn divide the same text by the Madani count and key their
 * text in it, so "ayah n" of theirs is not row n: al-Fātiḥah's first Warsh
 * ayah is Ḥafṣ 2 (the basmalah is not counted), and al-Baqarah's is Ḥafṣ
 * 1 and 2 (الٓمٓ is not an ayah of its own). Asking for ayah n by row n put
 * the wrong ayah on nearly every card from the first difference on.
 *
 * So each riwayah ayah is placed by the Ḥafṣ ayahs it is recited in
 * (`hafsSpan`, the same correspondence the recitations use):
 *   - one to one: its text on that row;
 *   - a MERGE (one ayah standing for Ḥafṣ n and n+1): the whole ayah on
 *     row n, and row n+1 marked as joined to it;
 *   - a SPLIT (two ayahs sharing Ḥafṣ n): both on row n, one after the
 *     other.
 * No row is ever given words that are not its own, and none is left with
 * Ḥafṣ wording in a riwayah reader's revision — but one: al-Fātiḥah's
 * basmalah, which the Madani count does not number (its first ayah is
 * claimed for Ḥafṣ 1 and 2 and holds only الْحَمْدُ). That row keeps the
 * bundled basmalah, the same words, and the ayah goes on row 2 where its
 * translation is.
 *
 * Null when the riwayah has no text of its own on this device (Ḥafṣ, an
 * image riwayah, a dataset not yet hydrated) — or when any row would be
 * left empty: then the caller shows the bundled text, whole, rather than
 * a surah half in one reading and half in another.
 */
import { hafsSpan } from './riwayahAudio';
import { riwayahAyahText } from './riwayahData';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';

export type RiwayahRow =
  /** The riwayah's own ayah(s) on this Ḥafṣ row, in its own numbering. */
  | { kind: 'text'; text: string; ayahs: number[]; parts: string[] }
  /** Al-Fātiḥah's basmalah, not an ayah in this count: the bundled text. */
  | { kind: 'basmalah' }
  /** This Ḥafṣ ayah is part of the riwayah ayah on row `into`. */
  | { kind: 'joined'; into: number };

/** A safety bound: no riwayah's count runs more than this past Ḥafṣ in a surah. */
const MAX_AHEAD = 12;

export function riwayahRows(
  riwayah: RiwayahId,
  surah: number,
  hafsCount: number,
): RiwayahRow[] | null {
  if (riwayah === DEFAULT_RIWAYAH || hafsCount < 1) return null;
  const rows: Array<RiwayahRow | undefined> = new Array(hafsCount);
  let prevLast = 0;
  for (let a = 1; a <= hafsCount + MAX_AHEAD; a++) {
    let [first, last] = hafsSpan(riwayah, surah, a);
    if (surah === 1 && a === 1 && first === 1 && last === 2) {
      rows[0] = { kind: 'basmalah' };
      first = 2;
    }
    if (first > hafsCount) break;
    const text = riwayahAyahText(riwayah, surah, a);
    if (!text) {
      // Past the riwayah's last ayah (the identity map runs on for ever).
      if (a > 1 && prevLast >= hafsCount) break;
      return null;
    }
    const at = rows[first - 1];
    if (first === prevLast && at && at.kind === 'text') {
      // A split: the second half shares the row of the first.
      at.text = `${at.text} ${text}`;
      at.ayahs.push(a);
      at.parts.push(text);
    } else {
      rows[first - 1] = { kind: 'text', text, ayahs: [a], parts: [text] };
    }
    for (let h = first + 1; h <= Math.min(last, hafsCount); h++) {
      rows[h - 1] = { kind: 'joined', into: first };
    }
    prevLast = last;
    if (last >= hafsCount && riwayahAyahText(riwayah, surah, a + 1) == null) break;
  }
  for (let i = 0; i < hafsCount; i++) if (!rows[i]) return null;
  return rows as RiwayahRow[];
}
