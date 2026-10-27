/**
 * Which ayahs of a RECORDING recite an ayah of the READER's count.
 *
 * Both counts divide the same text: the Kufan (Ḥafṣ, Shuʿbah, IndoPak)
 * and the Madani (Warsh, Qālūn). A whole-surah recording heard by a reader
 * on the other count needs its ayahs mapped through the Ḥafṣ numbering
 * that `riwayahAudio.ts` keeps for the EveryAyah Warsh files; between two
 * readings that count alike, an ayah is itself.
 *
 * Shared by playback, which cuts the clips, and the boundary report, which
 * has to name the recording's own ayah.
 */
import { filesOf, riwayahAyahOf } from '../riwayahAudio';
import type { RiwayahId } from '../riwayat';

/** Which counts a Madani-numbered reading uses — the recording's or the reader's. */
export function countsMadani(riwayah: RiwayahId): boolean {
  return riwayah === 'warsh' || riwayah === 'qalun';
}

/**
 * The recording's own ayahs that recite this ayah of the READER'S count,
 * as [first, last] — or null when the ayah before already recited it all.
 *
 * Both counts divide the same text. A recording in the Madani count heard
 * by a Ḥafṣ reader, or the other way round, needs the ayahs mapped through
 * the Ḥafṣ numbering that `riwayahAudio.ts` already keeps for the EveryAyah
 * Warsh files; between two readings that count alike, an ayah is itself.
 */
export function recordedAyahs(
  reader: RiwayahId,
  recording: RiwayahId,
  surah: number,
  ayah: number,
  afterPrevious: boolean,
): [number, number] | null {
  const readerMadani = countsMadani(reader);
  const recordingMadani = countsMadani(recording);
  if (readerMadani === recordingMadani) return [ayah, ayah];
  if (readerMadani) {
    // Reader Madani, recording Kufan (= Ḥafṣ numbering): the files of it.
    const files = filesOf(reader, surah, ayah, afterPrevious);
    return files.length ? [files[0], files[files.length - 1]] : null;
  }
  // Reader Kufan, recording Madani: the Madani ayahs holding this one.
  const madani: RiwayahId = recording;
  const first = riwayahAyahOf(madani, surah, ayah);
  const last = riwayahAyahOf(madani, surah, ayah, true);
  if (afterPrevious && ayah > 1) {
    const before = riwayahAyahOf(madani, surah, ayah - 1, true);
    // Two Kufan ayahs in one Madani one: heard with the first of them.
    if (before >= last) return null;
    return [Math.max(first, before + 1), last];
  }
  return [first, last];
}

