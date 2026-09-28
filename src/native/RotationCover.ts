/**
 * The native rotation cover — a sheet of page colour the PLATFORM raises
 * at the moment the window turns, before React has heard about it. See
 * `RotationCover.kt` / `MihrabRotationCover.swift` for why only the
 * platform can be early enough, and `src/quran/rotationFade.ts` for who
 * arms it and when it comes down.
 *
 * Absent — the tests, an older native build, the Mac, where a window is
 * resized rather than turned — every call is a no-op and `available` is
 * false, and the reader falls back to its own cover and fade.
 */
import { NativeModules, processColor } from 'react-native';

type RotationCoverNative = {
  arm(argb: number): void;
  disarm(): void;
  lift(durationMs: number): void;
  getConstants?: () => { enabled?: boolean };
  enabled?: boolean;
};

/**
 * Looked up on each call rather than once at load: it is a property read,
 * the calls are a handful per rotation, and it lets a test put the module
 * in place before rendering.
 */
function native(): RotationCoverNative | undefined {
  const module = NativeModules.MihrabRotationCover as RotationCoverNative | undefined;
  if (!module) return undefined;
  const constants = module.getConstants?.() ?? module;
  return constants.enabled === true ? module : undefined;
}

/** Whether the platform raises the cover itself when the window turns. */
export function rotationCoverAvailable(): boolean {
  return native() != null;
}

/** The reader is in front, and its page is `color`. */
export function armRotationCover(color: string): void {
  const module = native();
  if (!module) return;
  const argb = processColor(color);
  if (typeof argb !== 'number') return;
  module.arm(argb);
}

/** The reader has gone; a cover still up goes with it. */
export function disarmRotationCover(): void {
  native()?.disarm();
}

/** Fade the cover off the settled page. A no-op when none is up. */
export function liftRotationCover(durationMs: number): void {
  native()?.lift(durationMs);
}
