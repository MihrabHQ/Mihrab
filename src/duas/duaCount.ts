/**
 * The dua counter's rules — what one tap does — kept apart from the screen
 * so they can be held by tests (issue #120).
 *
 * Three kinds of card:
 *
 *   • a plain dua with `repeat` — counts up to it and stops there;
 *   • `parts` with `countEach` ("three times each": the three Quls morning,
 *     evening and after prayer) — each surah has its own count, and one
 *     counted out hands on to the next;
 *   • `parts` without it (the bedtime Muʿawwidhāt: all three recited, blown
 *     into the hands and wiped over the body, three times — Bukhari 5017)
 *     — the SET is counted: a tap reads one surah and moves to the next,
 *     and the tap on the last completes a round.
 *
 * A count never passes its target: the counter is for the number the
 * sunnah gives (the Tasbih screen is for counting on); Reset starts again.
 */
import type { Dua } from './duas';

export type CountTap = {
  /** The counts key this card counts under. */
  key: string;
  /** Its count after the tap. */
  count: number;
  /** The part (surah tab) to show after the tap. */
  part: number;
  /**
   * What the tap did: `part` moved to the next surah of a set (no count),
   * `count` counted one, `done` counted the last one, `none` nothing (the
   * count was already complete).
   */
  step: 'part' | 'count' | 'done' | 'none';
};

/** The counts key of a card, at the part shown. */
export function countKeyOf(dua: Dua, partIndex: number): string {
  const part = dua.parts?.[partIndex];
  return part && dua.countEach ? `${dua.id}|${part.surah}` : dua.id;
}

/** What one tap on the counter does. */
export function tapCount(dua: Dua, partIndex: number, counts: Readonly<Record<string, number>>): CountTap {
  const target = dua.repeat ?? 0;
  const parts = dua.parts ?? [];
  const key = countKeyOf(dua, partIndex);
  const cur = counts[key] ?? 0;
  const full = target > 0 && cur >= target;
  const counted = (count: number, part: number): CountTap => ({
    key,
    count,
    part,
    step: target > 0 && count === target ? 'done' : 'count',
  });

  if (parts.length > 0 && !dua.countEach) {
    // The set: a round is all of its surahs.
    if (full) return { key, count: cur, part: partIndex, step: 'none' };
    if (partIndex + 1 < parts.length) return { key, count: cur, part: partIndex + 1, step: 'part' };
    const count = cur + 1;
    // Another round starts at the first surah; the last round stays where it ended.
    return counted(count, target > 0 && count >= target ? partIndex : 0);
  }
  if (full) return { key, count: cur, part: partIndex, step: 'none' };
  const count = cur + 1;
  // Each surah counted out hands on to the next.
  const next = dua.countEach && target > 0 && count === target && partIndex + 1 < parts.length ? partIndex + 1 : partIndex;
  return counted(count, next);
}

/** Which surah tabs carry a ✓: each counted out, or — for a set — all of them once its rounds are done. */
export function partsDone(dua: Dua, counts: Readonly<Record<string, number>>): boolean[] {
  const target = dua.repeat ?? 0;
  const parts = dua.parts ?? [];
  if (target <= 0) return parts.map(() => false);
  if (!dua.countEach) {
    const done = (counts[dua.id] ?? 0) >= target;
    return parts.map(() => done);
  }
  return parts.map(p => (counts[`${dua.id}|${p.surah}`] ?? 0) >= target);
}
