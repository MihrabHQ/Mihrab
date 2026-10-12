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
import { capturePoseHero, hasPoseHero, onPoseHeroChange } from '../boot/poseHero';

type Native = {
  setEligible(value: boolean): void;
  setLookKey(key: string): void;
  hide(): void;
  /**
   * Copy the window now, if it is eligible — with the hero drawn in its
   * pose (see boot/poseHero.ts) from `heroFile` at (`x`, `y`) dp, when
   * one is given.
   */
  captureNow?(heroFile: string | null, x: number, y: number): void;
  /**
   * What the hero is aimed at now, and from: kept with the next picture.
   * `posed`: the picture shows the hero at `fromAt`, not at the moment it
   * was taken.
   */
  setHeroState?(targetAt: number, fromAt: number, posed: boolean): void;
  /** The picture on screen: "at,targetAt,fromAt,posed" (ms, 0/1), or "". */
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
/**
 * A posed picture of this interval is on disk. From then on native's own
 * copy on leaving is held off: it would show the hero at the moment of
 * leaving, not at the prayer, and undo the pose — the one thing the
 * picture is for. It was reset whenever the screen stopped being worth
 * keeping (the Help chip opening), and the next keep was then throttled
 * and dropped while native was let back in: most launches opened on an
 * unposed picture. Now it is reset only by a new interval, and a keep
 * that is throttled waits its turn rather than being dropped.
 */
let posedKept = false;

function pushEligible(): void {
  const value = screenWorthy && holds.size === 0;
  const keep = value && !posedKept;
  // Native's own copy on leaving only where JS cannot pose one: with the
  // twin on hand, JS keeps the screen itself (posed), and a visit too
  // short for that leaves the previous posed picture, which is still the
  // prayer's and still runs the whole way — better than an unposed one.
  const wanted = keep && !hasPoseHero();
  if (!native) return;
  if (wanted !== lastEligible) {
    lastEligible = wanted;
    try {
      native.setEligible(wanted);
    } catch {
      // Best effort: the worst case is a launch without the picture.
    }
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
  if (keep && native.captureNow) {
    // Not more often than KEEP_EVERY_MS — but then, not never.
    const wait = Math.max(KEEP_AFTER_MS, lastKept + KEEP_EVERY_MS - Date.now());
    keepTimer = setTimeout(() => {
      keepTimer = null;
      if (!(screenWorthy && holds.size === 0) || posedKept) return;
      lastKept = Date.now();
      void keepNow();
    }, wait);
  }
}

onPoseHeroChange(pushEligible);

/**
 * Keep the screen, with the hero at the prayer it is counting from
 * (boot/poseHero.ts) when that hero is on hand; as it is otherwise.
 */
async function keepNow(): Promise<void> {
  if (!native?.captureNow) return;
  if (!hasPoseHero()) {
    // As the screen is, and at once.
    try {
      native.captureNow(null, 0, 0);
    } catch {
      // As above.
    }
    return;
  }
  let posed: { file: string; x: number; y: number; targetAt: number; fromAt: number } | null = null;
  try {
    posed = await capturePoseHero();
  } catch {
    posed = null;
  }
  // The screen may have stopped being worth keeping while the pose drew.
  if (!(screenWorthy && holds.size === 0)) return;
  try {
    if (posed) {
      native.setHeroState?.(posed.targetAt, posed.fromAt, true);
      lastHero = `${posed.targetAt},${posed.fromAt},1`;
      native.captureNow(posed.file, posed.x, posed.y);
      posedKept = true;
      pushEligible();
    } else {
      native.captureNow(null, 0, 0);
    }
  } catch {
    // As above.
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
 * Once per window: the picture is only ever laid on a window's first
 * frame, and Today commits many times after that one.
 */
let hideSent = false;
let hideAt: number | null = null;

/** When JS asked native to fade the picture out, if it has. */
export function hideRequestedAt(): number | null {
  return hideAt;
}

export type ShownHeroState = { at: number; targetAt: number; fromAt: number; posed: boolean };
let shown: ShownHeroState | null | undefined;

/**
 * The picture this window opened on — when it was taken and what its hero
 * was counting down to, from what — or null if it opened on none. Asked
 * once; the answer does not change within a window.
 */
export function heroStateShown(): ShownHeroState | null {
  if (shown !== undefined) return shown;
  shown = null;
  try {
    const raw = native?.getShownState?.() ?? '';
    const [at, targetAt, fromAt, posed] = raw.split(',').map(Number);
    if (at > 0 && targetAt > 0 && Number.isFinite(fromAt)) {
      shown = { at, targetAt, fromAt, posed: posed === 1 };
    }
  } catch {
    // No picture, as far as JS is concerned.
  }
  return shown;
}

let lastHero = '';

/**
 * What the hero counts down to, and from: kept with the next picture. A
 * new interval is a new screen: a posed picture of the old one is let go.
 */
export function setLaunchHeroState(targetAt: number, fromAt: number): void {
  const key = `${targetAt},${fromAt},0`;
  if (!native?.setHeroState || key === lastHero) return;
  const wasPosed = lastHero.endsWith(',1');
  lastHero = key;
  try {
    native.setHeroState(targetAt, fromAt, false);
  } catch {
    // The next launch fades instead of running.
  }
  if (wasPosed || posedKept) {
    posedKept = false;
    pushEligible();
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

/**
 * A new window of this process is opening (src/boot/launchWarp.ts,
 * `beginLaunchWindow`): what was this window's — the picture it opened
 * on, whether the fade was asked for, what the old screen said about
 * itself — starts over. What is the process's (the look, what native was
 * last told, the posed picture on disk) stands.
 */
export function newLaunchSnapshotWindow(): void {
  hideSent = false;
  hideAt = null;
  shown = undefined;
  screenWorthy = false;
  holds.clear();
  pushEligible();
}

/** Test seam. */
export function _resetLaunchSnapshotForTests(): void {
  newLaunchSnapshotWindow();
  lastEligible = null;
  lastLook = null;
  lastHero = '';
  posedKept = false;
  lastKept = 0;
}
