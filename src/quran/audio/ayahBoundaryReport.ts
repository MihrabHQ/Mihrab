/**
 * "This ayah starts or ends in the wrong place" — for the whole-surah
 * recitations, whose ayah boundaries are a best attempt (surahRecitation).
 *
 * The app sends nothing anywhere by itself, so a misplaced boundary is
 * only ever known if somebody says so. This turns the saying into a tap:
 * a GitHub issue, opened in the browser, already holding everything a fix
 * needs — the recording, the ayah, where its boundaries are now — so the
 * reader adds only what they heard. Each one becomes a corrected table in
 * the next release; that is how "best attempt" gets better.
 *
 * Nothing personal goes in it, and nothing is sent until the reader
 * submits the issue themselves.
 */
import { MIHRAB_REPO } from '../../config/links';
import { getInstalledAppVersionLabel } from '../../appVersion';
import { findSurah } from '../quran';
import { RECITERS, reciterRiwayah } from './reciters';
import { ayahClip, isExactSurah } from './surahRecitation';
import { recordedAyahs } from './recordedAyahs';
import type { RiwayahId } from '../riwayat';

/** 754.32 → "12:34.3" — how the moment reads in a player's scrubber. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/**
 * The issue's address, or null for a reciter that is not a whole-surah
 * recitation (an EveryAyah ayah is its own file: there is no boundary of
 * ours to be wrong).
 *
 * `readerAyah` is the ayah as the muṣḥaf on screen counts it; the issue
 * names the recording's own ayah (and both, when they differ), because the
 * table is in the recording's count.
 */
export function ayahBoundaryReportUrl(
  reciterId: string,
  surah: number,
  readerAyah: number,
  readerRiwayah: RiwayahId,
): string | null {
  const reciter = RECITERS.find(r => r.id === reciterId);
  // An exact surah is cut like a file per ayah: nothing of ours to be wrong.
  if (!reciter?.surahFiles || isExactSurah(reciterId, surah)) return null;
  const span = recordedAyahs(readerRiwayah, reciterRiwayah(reciter), surah, readerAyah, false);
  const ayah = span?.[0] ?? readerAyah;
  const first = ayahClip(reciterId, surah, ayah);
  const last = span ? ayahClip(reciterId, surah, span[1]) : first;
  const clip = first && last ? { start: first.start, end: last.end } : null;
  const name = findSurah(surah)?.romanized ?? String(surah);
  const title = `Ayah boundary: ${reciter.name}, ${name} ${surah}:${ayah}`;
  const body = [
    'An ayah in a whole-surah recitation starts or ends in the wrong place.',
    '',
    `- Reciter: ${reciter.name} (\`${reciter.id}\`, mp3quran moshaf ${reciter.surahFiles.moshaf})`,
    `- Ayah: ${name} ${surah}:${ayah} in the recording's count` +
      (ayah !== readerAyah ? ` (${surah}:${readerAyah} on the ${readerRiwayah} page)` : ''),
    clip
      ? `- Now: starts at ${clock(clip.start)}, ends at ${clock(clip.end)} in ${reciter.surahFiles.server}${String(surah).padStart(3, '0')}.mp3`
      : '- Now: (no boundary found for this ayah)',
    `- App: ${getInstalledAppVersionLabel()}`,
    '',
    'What is off? (starts too early / starts too late / ends too early / ends too late, and roughly by how much)',
    '',
  ].join('\n');
  const q = (v: string) => encodeURIComponent(v);
  return `${MIHRAB_REPO}/issues/new?labels=ayah-boundary&title=${q(title)}&body=${q(body)}`;
}
