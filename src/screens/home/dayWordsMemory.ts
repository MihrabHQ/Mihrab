/**
 * ── THE DAY BAR'S WORDS, REMEMBERED ──────────────────────────────────
 *
 * The day bar says the weekday and the date in the reader's language —
 * `toLocaleDateString`, which on Hermes builds a formatter through ICU
 * each call, and the first of the process cost 8 ms of the JS thread in
 * Today's first render on a Pixel 10 Pro, after the warm-up of ICU
 * itself (MainApplication.warmIntl). The words for a day in a language
 * are the same on every launch of that day, so they are kept with the
 * launch's other small records (boot/launchReads.ts): a launch whose day
 * and language were seen opens on the kept words and builds no
 * formatter before the first frame; a new day formats once, after it,
 * and remembers.
 *
 * Only the words: a key is `kind|language|y-m-d`, a value the string the
 * formatter gave. Nothing is derived from a kept word, so a wrong one
 * could only ever be a wrong day name — and a key names the day.
 */
import { launchRead, launchWrite } from '../../boot/launchReads';

const STORAGE_KEY = '@mihrab/dayWords/v1';
/** A fortnight of days in two kinds, with room for a language change. */
const KEEP = 48;

let memory = new Map<string, string>();
let primed: Promise<void> | null = null;

/** Read the kept words once; later calls return the same promise. */
export function primeDayWords(): Promise<void> {
  if (primed) return primed;
  primed = launchRead(STORAGE_KEY)
    .then(raw => {
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed == null) return;
      const kept = new Map<string, string>();
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length > 0 && v.length < 80) kept.set(k, v);
      }
      // Under what this session already formatted, if anything.
      for (const [k, v] of memory) kept.set(k, v);
      memory = kept;
    })
    .catch(() => {
      // Nothing kept, or unreadable: the words are formatted as they always were.
    });
  return primed;
}

/** The word kept under `key`, or undefined. Synchronous: the first render asks. */
export function rememberedDayWord(key: string): string | undefined {
  return memory.get(key);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const entries = [...memory.entries()];
    const kept = entries.slice(Math.max(0, entries.length - KEEP));
    memory = new Map(kept);
    launchWrite(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept))).catch(() => {});
  }, 1500);
}

/** Keep `word` under `key`; written out a breath later. */
export function rememberDayWord(key: string, word: string): void {
  if (memory.get(key) === word) return;
  memory.set(key, word);
  persist();
}

/** Tests. */
export function _resetDayWordsForTests(): void {
  memory = new Map();
  primed = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
