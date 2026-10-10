/**
 * The last Today screen as a cold start's first frame — the JS half of
 * `LaunchSnapshot.kt` (Android, which explains the whole thing) and
 * `MihrabLaunchSnapshot.swift` (iOS).
 *
 * JS decides three things native cannot know:
 *   - when the screen on display is worth keeping (`setLaunchSnapshotEligible`
 *     — Today, focused, settled, scrolled to the top);
 *   - what the app looks like (`setLaunchSnapshotLook` — every setting, so a
 *     picture taken before any change is never shown after it);
 *   - when the live screen has settled under the picture
 *     (`hideLaunchSnapshot`, from the first-paint latch).
 *
 * Everything is a no-op on the Mac, on the web, and when the module is
 * missing (tests, an older native build).
 */
import { NativeModules, Platform } from 'react-native';
import { isMacCatalyst } from '../responsive/breakpoints';

type Native = {
  setEligible(value: boolean): void;
  setLookKey(key: string): void;
  hide(): void;
  /** Copy the window now, if it is eligible. */
  captureNow?(): void;
  /** What the hero is aimed at now: kept with the next picture. */
  setHeroState?(targetAt: number, fromAt: number): void;
  /** The picture on screen: "at,targetAt,fromAt" (ms), or "" if none. */
  getShownState?(): string;
};

// Android and iPhone/iPad. Not the Mac: a window there is whatever size it
// was last dragged to, and a launch is not a moment anyone waits through.
const native: Native | null =
  Platform.OS === 'android' || (Platform.OS === 'ios' && !isMacCatalyst)
    ? ((NativeModules as { MihrabLaunchSnapshot?: Native }).MihrabLaunchSnapshot ?? null)
    : null;

let lastEligible: boolean | null = null;
let lastLook: string | null = null;
/** What the screen says about itself (Today, settled, at the top…). */
let screenWorthy = false;
/**
 * Things on the screen in a passing state that must not be kept: the Help
 * Mihrab chip while it is open or opening — a picture of it open would
 * fold shut in the fade, which reads as a stutter.
 */
const holds = new Set<string>();

/**
 * How long the screen must stay worth keeping before it is kept without
 * the app being left: long enough for a scroll to settle back at the top.
 */
export const KEEP_AFTER_MS = 300;
/** Kept at most this often while the app is open. */
export const KEEP_EVERY_MS = 10_000;
let keepTimer: ReturnType<typeof setTimeout> | null = null;
let lastKept = 0;

function pushEligible(): void {
  const value = screenWorthy && holds.size === 0;
  if (!native || value === lastEligible) return;
  lastEligible = value;
  try {
    native.setEligible(value);
  } catch {
    // Best effort: the worst case is a launch without the picture.
  }
  /**
   * Kept while the app is open, too, and not only when it is left. The
   * screen is not always worth keeping at the moment it is left — the Help
   * Mihrab chip opens a few seconds into every visit and stays open a
   * while — and a short visit would then leave no picture behind at all.
   * So the screen is also kept the moment it becomes worth keeping: just
   * after a launch's run has finished and before the chip opens, and again
   * when it folds.
   */
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = null;
  if (value && native.captureNow) {
    keepTimer = setTimeout(() => {
      keepTimer = null;
      if (!lastEligible || Date.now() - lastKept < KEEP_EVERY_MS) return;
      lastKept = Date.now();
      try {
        native.captureNow?.();
      } catch {
        // As above.
      }
    }, KEEP_AFTER_MS);
  }
}

export function setLaunchSnapshotEligible(value: boolean): void {
  screenWorthy = value;
  pushEligible();
}

/** Keep (or stop keeping) the screen out of the picture for `reason`. */
export function holdLaunchSnapshot(reason: string, held: boolean): void {
  if (held) holds.add(reason);
  else holds.delete(reason);
  pushEligible();
}

/**
 * Settings that change without the screen changing, left out of the look
 * so they do not throw away a good picture. The last GPS fix moves by a few
 * metres between launches; the city on screen does not.
 */
const NOT_LOOK = new Set(['lastFetchedLatitude', 'lastFetchedLongitude']);

/** A short, stable fingerprint of everything that decides how the app looks. */
export function lookKeyOf(settings: object): string {
  const json = JSON.stringify(settings, (k, v) => (NOT_LOOK.has(k) ? undefined : v));
  // FNV-1a, 32-bit: only ever compared for equality.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${json.length.toString(36)}-${h.toString(36)}`;
}

export function setLaunchSnapshotLook(key: string): void {
  if (!native || key === lastLook) return;
  lastLook = key;
  try {
    native.setLookKey(key);
  } catch {
    // As above.
  }
}

/**
 * Once per process: the picture is only ever laid on a cold start's first
 * frame, and Today commits many times after that one.
 */
let hideSent = false;
let hideAt: number | null = null;

/** When JS asked native to fade the picture out, if it has. */
export function hideRequestedAt(): number | null {
  return hideAt;
}

export type ShownHeroState = { at: number; targetAt: number; fromAt: number };
let shown: ShownHeroState | null | undefined;

/**
 * The picture this launch opened on — when it was taken and what its hero
 * was counting down to, from what — or null if it opened on none. Asked
 * once; the answer does not change within a process.
 */
export function heroStateShown(): ShownHeroState | null {
  if (shown !== undefined) return shown;
  shown = null;
  try {
    const raw = native?.getShownState?.() ?? '';
    const [at, targetAt, fromAt] = raw.split(',').map(Number);
    if (at > 0 && targetAt > 0 && Number.isFinite(fromAt)) shown = { at, targetAt, fromAt };
  } catch {
    // No picture, as far as JS is concerned.
  }
  return shown;
}

let lastHero = '';

/** What the hero counts down to, and from: kept with the next picture. */
export function setLaunchHeroState(targetAt: number, fromAt: number): void {
  const key = `${targetAt},${fromAt}`;
  if (!native?.setHeroState || key === lastHero) return;
  lastHero = key;
  try {
    native.setHeroState(targetAt, fromAt);
  } catch {
    // The next launch fades instead of running.
  }
}

export function hideLaunchSnapshot(): void {
  if (!native || hideSent) return;
  hideSent = true;
  hideAt = Date.now();
  try {
    native.hide();
  } catch {
    // The native side takes it down by itself after a few seconds.
  }
}

/** Test seam. */
export function _resetLaunchSnapshotForTests(): void {
  lastEligible = null;
  lastLook = null;
  hideSent = false;
  hideAt = null;
  shown = undefined;
  lastHero = '';
  screenWorthy = false;
  holds.clear();
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = null;
  lastKept = 0;
}
