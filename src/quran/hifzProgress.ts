/**
 * How the hifz stock stands (#121): per juz', how much of it is by heart.
 *
 * The juz' boundaries are the muṣḥaf's own (`juzAnchors`), so the thirty
 * cells agree with the index and the page bar rather than with a second
 * table. Counted in ayahs, which every riwayah agrees on.
 */
import { ayahIndexOf } from './ayahIndex';
import { juzAnchors } from './juzCheck';
import { pagesForRiwayah } from './pages';
import type { HifzState } from './hifz';

export type JuzCoverage = { juz: number; memorised: number; total: number };

let anchorsMemo: Array<{ juz: number; start: number; end: number }> | null = null;

/** Each juz' as absolute ayah indices, both inclusive. */
function juzSpans() {
  if (anchorsMemo) return anchorsMemo;
  anchorsMemo = juzAnchors(pagesForRiwayah()).map(a => ({
    juz: a.juz,
    start: ayahIndexOf(a.first.surah, a.first.ayah),
    end: ayahIndexOf(a.last.surah, a.last.ayah),
  }));
  return anchorsMemo;
}

/** Ayahs by heart in each of the thirty ajzāʾ. */
export function juzCoverage(state: HifzState | undefined): JuzCoverage[] {
  return juzSpans().map(({ juz, start, end }) => {
    let memorised = 0;
    for (const p of state?.portions ?? []) {
      const lo = Math.max(start, p.start);
      const hi = Math.min(end, p.end);
      if (hi >= lo) memorised += hi - lo + 1;
    }
    return { juz, memorised, total: end - start + 1 };
  });
}
