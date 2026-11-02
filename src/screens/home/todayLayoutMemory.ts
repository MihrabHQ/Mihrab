/**
 * ── THE PAGE'S SETTLED SIZES, REMEMBERED ─────────────────────────────
 *
 * Today's first frame is laid out from what is in hand, and measured
 * after: the hero's height and where its countdown block sits, the day
 * pager's height. What is measured can differ from the first guess — the
 * hero's block was placed at the design's fractions until its first
 * layout, and the table's height moved with what loaded a moment later —
 * and every launch then settled in front of the reader, the hero and the
 * times moving before coming to rest (2.35).
 *
 * The sizes a page settles on are the same on the next launch as long as
 * nothing they depend on has changed: the layout (the full page or
 * Minimal), the window, the system text size, the insets, the rows the
 * day has. So once measured they are kept, under a key made of exactly
 * those, and a launch whose key matches opens on the kept sizes — the
 * same first frame as the last launch's last — and measures again
 * only to confirm them. A key that does not match (a new phone, a text
 * size changed in Settings, Minimal turned on) measures afresh and
 * remembers that; once is not harmful, every time was.
 *
 * Kept with the settings' own read (PrayerSettingsContext primes it), so
 * it is in hand for the first render; the key is the caller's, so this
 * module knows nothing of the page.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TodayLayout = {
  /** The hero box (fill), its top row, and its countdown block. */
  heroH?: number;
  topRowH?: number;
  block?: { y: number; h: number };
  /** The day pager's height for the day the page opened on. */
  table?: number;
};

const STORAGE_KEY = '@mihrab/todayLayout/v1';
/** How many keys are kept: a phone and its text sizes, both layouts. */
const KEEP = 8;

let memory: Record<string, TodayLayout> = {};
let primed: Promise<void> | null = null;

const size = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
function clean(v: unknown): TodayLayout | null {
  if (typeof v !== 'object' || v == null) return null;
  const l = v as TodayLayout;
  const out: TodayLayout = {};
  if (size(l.heroH)) out.heroH = l.heroH;
  if (typeof l.topRowH === 'number' && Number.isFinite(l.topRowH) && l.topRowH >= 0) out.topRowH = l.topRowH;
  if (
    typeof l.block === 'object' &&
    l.block != null &&
    typeof l.block.y === 'number' &&
    Number.isFinite(l.block.y) &&
    l.block.y >= 0 &&
    size(l.block.h)
  ) {
    out.block = { y: l.block.y, h: l.block.h };
  }
  if (size(l.table)) out.table = l.table;
  return Object.keys(out).length > 0 ? out : null;
}

/** Read the kept sizes once; later calls return the same promise. */
export function primeTodayLayout(): Promise<void> {
  if (primed) return primed;
  primed = AsyncStorage.getItem(STORAGE_KEY)
    .then(raw => {
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed == null) return;
      const out: Record<string, TodayLayout> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const c = clean(v);
        if (c) out[k] = c;
      }
      // Under what was already remembered this session, if anything.
      memory = { ...out, ...memory };
    })
    .catch(() => {
      // Nothing kept, or unreadable: the page measures as it always did.
    });
  return primed;
}

/** The sizes kept under `key`, or null. Synchronous: the first render asks. */
export function rememberedTodayLayout(key: string): TodayLayout | null {
  return memory[key] ?? null;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  // A breath after the last change: a launch measures several times as
  // it settles, and one write at the end is enough.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const keys = Object.keys(memory);
    const kept = keys.slice(Math.max(0, keys.length - KEEP));
    const out: Record<string, TodayLayout> = {};
    for (const k of kept) out[k] = memory[k];
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(out)).catch(() => {});
  }, 1500);
}

/**
 * Keep what `layout` has under `key`, over what is kept there; written
 * out when something differs.
 */
export function rememberTodayLayout(key: string, layout: TodayLayout): void {
  const add = clean(layout);
  if (!add) return;
  const had = memory[key] ?? {};
  const next: TodayLayout = { ...had, ...add };
  if (
    had.heroH === next.heroH &&
    had.topRowH === next.topRowH &&
    had.block?.y === next.block?.y &&
    had.block?.h === next.block?.h &&
    had.table === next.table
  ) {
    return;
  }
  // Re-inserted, so the most recently used keys are the ones kept.
  const rest = { ...memory };
  delete rest[key];
  memory = { ...rest, [key]: next };
  persist();
}

/** Tests. */
export function _resetTodayLayoutForTests(): void {
  memory = {};
  primed = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
