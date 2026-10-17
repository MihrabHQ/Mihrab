/**
 * THE DRILL'S REST IS SILENCE PLAYED, NOT A PAUSED PLAYER.
 *
 * "Pause between repeats" is the hifz drill: hear the ayah, recite it back
 * in the gap, hear it again. The gap used to be a paused player and a timer
 * to start it again, and a paused app is one iOS suspends and Android stops
 * waking — with the screen off the drill stopped after its first ayah, and
 * so the setting was taken out of the player altogether.
 *
 * So the gap is in the QUEUE: after each ayah of a drill, silent tracks
 * as long as the rest (`assets/audio/silence-*.mp3`, made by
 * `tools/silence/make.py`). The player never stops playing, so the
 * foreground service on Android and the audio session on iOS stay alive
 * exactly as they do between two ayahs, and the rest takes nothing from
 * JS to end.
 *
 * A rest track is not an ayah: its id is `rest:…`, which `parseTrackId`
 * does not read as one, and everything that walks the queue steps over it
 * (playback.ts). The highlight stays on the ayah just heard.
 *
 * ── HOW LONG ─────────────────────────────────────────────────────────
 *
 * The ayah's recited length × the setting's factor, at most 30 s. The
 * recited length is the file's length less the silence at its ends,
 * measured by `tools/recitation-edges/edges.py` (recitationEdges.ts
 * `spokenSecondsOf`). Where a file's length was not measured — every
 * reciter until the tool is run again, and every reciter it does not
 * cover — it is ESTIMATED from the ayah's words and the reciter's pace
 * (`secondsPerWord`, reciters.ts). An estimate is a fallback; the
 * measured length replaces it file by file as the tables are remeasured.
 */
import { loadSurah } from '../quran';
import { spokenSecondsOf } from './recitationEdges';
import { DEFAULT_SECONDS_PER_WORD, type Reciter } from './reciters';

/** The longest rest, in seconds. */
export const MAX_REST_SECONDS = 30;

/**
 * The silent files, longest first, with their length in ms.
 * Keep in step with LENGTHS_MS in tools/silence/make.py.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
export const REST_PIECES: ReadonlyArray<{ ms: number; asset: number }> = [
  { ms: 8000, asset: require('../../../assets/audio/silence-8000ms.mp3') },
  { ms: 4000, asset: require('../../../assets/audio/silence-4000ms.mp3') },
  { ms: 2000, asset: require('../../../assets/audio/silence-2000ms.mp3') },
  { ms: 1000, asset: require('../../../assets/audio/silence-1000ms.mp3') },
  { ms: 500, asset: require('../../../assets/audio/silence-500ms.mp3') },
];
/* eslint-enable @typescript-eslint/no-require-imports */

const SHORTEST_MS = REST_PIECES[REST_PIECES.length - 1].ms;

/**
 * The silent pieces a rest is made of, longest first, in ms: the rest to
 * the nearest half second, capped at `MAX_REST_SECONDS`. Nothing for a
 * rest shorter than a quarter of a second.
 */
export function restPieces(seconds: number): number[] {
  if (!(seconds > 0)) return [];
  const capped = Math.min(MAX_REST_SECONDS, seconds) * 1000;
  let left = Math.round(capped / SHORTEST_MS) * SHORTEST_MS;
  const out: number[] = [];
  for (const { ms } of REST_PIECES) {
    while (left >= ms) {
      out.push(ms);
      left -= ms;
    }
  }
  return out;
}

/** The bundled file for a piece. */
export function restAsset(ms: number): number {
  return (REST_PIECES.find(p => p.ms === ms) ?? REST_PIECES[0]).asset;
}

/** A rest track's id: never one `parseTrackId` reads as an ayah. */
export function restTrackId(
  surah: number,
  ayah: number,
  index: number,
): string {
  return `rest:${surah}:${ayah}:${index}`;
}

/** Is this a rest track, not an ayah? */
export function isRestTrack(track: object | null | undefined): boolean {
  const id = (track as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' && id.startsWith('rest:');
}

/** The basmalah the bundled text puts before every surah's first ayah but 1 and 9. */
const BASMALAH = /^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\s+/;

/** Words in an ayah of the bundled Ḥafṣ text, which is how the files are cut. */
export function wordsOf(text: string, surah: number, ayah: number): number {
  let t = text.trim();
  // The files of a surah's first ayah do not recite the basmalah: it is a
  // file of its own (1:1), played before the surah if at all.
  if (ayah === 1 && surah !== 1) t = t.replace(BASMALAH, '');
  // Pause marks (ۖ ۗ ۚ …) stand on their own between words; they are not words.
  return t.split(/\s+/).filter(w => /[ء-يٱ-ۓ]/.test(w)).length;
}

/**
 * How long the files of one ayah are recited for, in seconds: measured
 * where it was, estimated from the words where it was not. Undefined only
 * when neither is known (the text could not be read).
 */
export async function spokenSeconds(
  reciter: Reciter,
  surah: number,
  files: readonly number[],
): Promise<number | undefined> {
  let total = 0;
  let text: ReadonlyArray<string> | null = null;
  for (const file of files) {
    const measured = spokenSecondsOf(reciter.folder, surah, file);
    if (measured != null) {
      total += measured;
      continue;
    }
    if (!text) text = (await loadSurah(surah))?.arabic ?? [];
    const ayahText = text[file - 1];
    if (!ayahText) return undefined;
    const pace = reciter.secondsPerWord ?? DEFAULT_SECONDS_PER_WORD;
    total += wordsOf(ayahText, surah, file) * pace;
  }
  return total;
}
