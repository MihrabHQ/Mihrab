/**
 * Which recording files carry an ayah, in the riwayah the reader is in.
 *
 * ── EVERY RECORDING IS CUT BY THE ḤAFṢ COUNT ─────────────────────────
 *
 * EveryAyah numbers its files by the Kufan count Ḥafṣ uses, and so does
 * every folder the app streams — Warsh's too: there is a 079046.mp3 and
 * no 005121.mp3. Warsh and Qālūn divide the same text by the Madani
 * count, which merges some Ḥafṣ ayahs and splits others, so from the
 * first difference in a surah onwards "ayah n" and "file n" are different
 * sentences. In An-Nāziʿāt Warsh 79:37 is Ḥafṣ 37 and 38, and every ayah
 * after it is one file further on: playing file 38 for Warsh 79:38 read
 * the end of the ayah before the one lit on the page (issue #83).
 *
 * The playback queue therefore speaks the READER's numbering — that is
 * what it highlights and what it pages to — and this module turns each
 * ayah into the files it is heard in. `data/madaniAyahMap.json` is the
 * correspondence (`tools/qiraat/ayah_map.py` writes it from the
 * publisher's `number_in_hafs`); Shuʿbah counts as Ḥafṣ does.
 *
 * A split ayah has no file of its own: both halves are in one file. The
 * first ayah claims it, and the second is heard inside it — see `filesOf`.
 */
import MADANI from './data/madaniAyahMap.json';
import type { RiwayahId } from './riwayat';

/** The first and last Ḥafṣ ayah an ayah is recited in. */
export type HafsSpan = readonly [first: number, last: number];

type Events = Record<string, ReadonlyArray<ReadonlyArray<number>>>;

const COUNT: Partial<Record<RiwayahId, Events>> = {
  warsh: MADANI as Events,
  qalun: MADANI as Events,
};

/** Per riwayah, per surah: the span of every ayah, built once on demand. */
const cache = new Map<string, HafsSpan[]>();

function surahSpans(
  events: Events,
  key: string,
  surah: number,
): HafsSpan[] | null {
  const list = events[String(surah)];
  if (!list) return null;
  const cached = cache.get(key);
  if (cached) return cached;
  const given = new Map<number, ReadonlyArray<number>>();
  for (const e of list) given.set(e[0], e);
  const out: HafsSpan[] = [];
  let prev = 0;
  // The last listed ayah bounds the irregular part; past it every ayah is
  // one file on, which `hafsSpan` extends without storing.
  const lastListed = list[list.length - 1][0];
  for (let a = 1; a <= lastListed; a++) {
    const e = given.get(a);
    const span: HafsSpan = e ? [e[1], e[e.length - 1]] : [prev + 1, prev + 1];
    out.push(span);
    prev = span[1];
  }
  cache.set(key, out);
  return out;
}

/** The Ḥafṣ ayahs (= recording files) this ayah of this riwayah is recited in. */
export function hafsSpan(
  riwayah: RiwayahId,
  surah: number,
  ayah: number,
): HafsSpan {
  const events = COUNT[riwayah];
  if (!events) return [ayah, ayah];
  const spans = surahSpans(events, `${riwayah}:${surah}`, surah);
  if (!spans) return [ayah, ayah];
  if (ayah <= spans.length) return spans[ayah - 1];
  const shift = spans[spans.length - 1][1] - spans.length;
  return [ayah + shift, ayah + shift];
}

/**
 * The files to queue for an ayah.
 *
 * `afterPrevious` says the ayah before it in the surah was queued just
 * ahead of it. Then a file the two share — the one a split puts both
 * halves in — has already been heard, and is not played again: the
 * second half of a split adds nothing, and 11:82 adds only 83. Without
 * that, the shared file is where this ayah starts, and it is played.
 */
export function filesOf(
  riwayah: RiwayahId,
  surah: number,
  ayah: number,
  afterPrevious: boolean,
): number[] {
  const [first, last] = hafsSpan(riwayah, surah, ayah);
  let from = first;
  if (
    afterPrevious &&
    ayah > 1 &&
    hafsSpan(riwayah, surah, ayah - 1)[1] === first
  ) {
    from = first + 1;
  }
  const out: number[] = [];
  for (let h = from; h <= last; h++) out.push(h);
  return out;
}

/**
 * The ayah of this riwayah that holds a Ḥafṣ-numbered one.
 *
 * For anything written once in the Ḥafṣ count and offered to every reader —
 * "Al-Baqarah, the last two ayahs" is 2:285–286 in Ḥafṣ and 2:284–285 in
 * Warsh. Where two of this riwayah's ayahs share the Ḥafṣ one (a split),
 * `end` picks the later, so a passage ending there keeps its last words.
 */
export function riwayahAyahOf(
  riwayah: RiwayahId,
  surah: number,
  hafsAyah: number,
  end = false,
): number {
  if (!COUNT[riwayah]) return hafsAyah;
  let found = 0;
  // A riwayah's count can run ahead of Ḥafṣ by more than two: al-Wāqiʿah
  // is 99 Madani ayahs to 96. The walk stops at the first ayah past this
  // one anyway; the bound is only there so it cannot run for ever.
  for (let a = 1; a <= hafsAyah + 12; a++) {
    const [first, last] = hafsSpan(riwayah, surah, a);
    if (first > hafsAyah) break;
    if (last >= hafsAyah) {
      found = a;
      if (!end) break;
    }
  }
  return found || hafsAyah;
}

/** For tests. */
export function _resetRiwayahAudioCacheForTests(): void {
  cache.clear();
}
