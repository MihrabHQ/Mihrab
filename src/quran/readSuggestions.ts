/**
 * What to read now — the Qur'an tab's "Recommended now", which took the
 * place of its "Often read" row.
 *
 * The listening page's suggestions (`listenSuggestions`: what the sunnah
 * attaches to the hour, each with its reason) are as true of reading as of
 * listening, so they are the same list. Al-Kahf and Al-Mulk, which the
 * "Often read" row held for issue #23 — read on a schedule rather than
 * looked up, and a long scroll down the list — stay on it whatever the
 * hour: timely first, then the two, then Al-Baqarah for any hour while
 * there is room.
 */
import {
  BAQARAH,
  KAHF,
  MAX_SUGGESTIONS,
  MULK,
  timelySuggestions,
  type ListenSuggestion,
} from './audio/listenSuggestions';

/** The surahs that are always on the row, the old "Often read". */
export const ALWAYS_OFFERED: readonly ListenSuggestion[] = [KAHF, MULK];

/** The reading suggestions for `now`, most timely first; never more than `MAX_SUGGESTIONS`. */
export function readSuggestions(now: Date, maghrib: Date | null = null): ListenSuggestion[] {
  const timely = timelySuggestions(now, maghrib);
  const always = ALWAYS_OFFERED.filter(s => !timely.some(o => o.surah === s.surah));
  const out = [...timely.slice(0, MAX_SUGGESTIONS - always.length), ...always];
  // Al-Baqarah whole, beside the night's last two ayahs of it, as the
  // listening page has it.
  if (out.length < MAX_SUGGESTIONS && !out.some(o => o.id === BAQARAH.id)) out.push(BAQARAH);
  return out;
}
