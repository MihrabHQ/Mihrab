/**
 * The joins between ayahs, kept from JS where the player cannot keep them.
 *
 * A track may carry `trimStart` / `trimEnd` — seconds of silence to skip at
 * each end of its file (recitationEdges.ts) — and `restFactor`, the
 * memorisation drill's pause after it (its spoken length × the factor).
 *
 * On Android the player's own service does all of this, natively
 * (patches/react-native-track-player: MusicService `watchSeam`): JS timers
 * stop when the app is in the background there, and a recitation is
 * listened to in a pocket. Everywhere else — iOS, iPadOS, the Mac — JS
 * keeps running behind playing audio, and this module does the same job:
 *
 *   • when a track starts, skip its leading silence;
 *   • sleep until its last sound (plus a breath), then move to the next;
 *   • after a track that rests, pause for the rest, then go on.
 *
 * One timer, aimed at the moment it is needed and re-aimed whenever the
 * clock moves (a seek, a rate change, a pause) — never a poll that runs
 * for the length of the surah. A user's own play, pause, skip or seek ends
 * a rest: the drill's pause is the app's, and the user's hand wins.
 */
import { Platform } from 'react-native';
import TrackPlayer, { State, type Track } from 'react-native-track-player';

const IN_JS = Platform.OS !== 'android';

let seamTimer: ReturnType<typeof setTimeout> | null = null;
let restTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every re-aim, so a stale await does not arm a timer. */
let generation = 0;
let advancedAtSeam = false;
/** The current track's spoken length and full length, seconds, once known. */
let spoken = 0;
let duration = 0;

function seconds(
  track: Track | null | undefined,
  key: string,
): number | undefined {
  const v = (track as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === 'number' && v > 0 ? v : undefined;
}

function clearSeam(): void {
  generation += 1;
  if (seamTimer != null) clearTimeout(seamTimer);
  seamTimer = null;
}

/** End a pending rest. Every control the user touches calls this. */
export function cancelRest(): void {
  if (restTimer != null) clearTimeout(restTimer);
  restTimer = null;
}

/** Aim the timer at the current track's last sound. */
export async function watchSeam(): Promise<void> {
  if (!IN_JS) return;
  clearSeam();
  const mine = generation;
  try {
    const [track, progress, playback, rate] = await Promise.all([
      TrackPlayer.getActiveTrack(),
      TrackPlayer.getProgress(),
      TrackPlayer.getPlaybackState(),
      TrackPlayer.getRate(),
    ]);
    if (mine !== generation || !track || playback.state !== State.Playing)
      return;
    const trimStart = seconds(track, 'trimStart') ?? 0;
    const trimEnd = seconds(track, 'trimEnd');
    if (!(progress.duration > 0)) {
      // Not loaded far enough to know its length yet.
      seamTimer = setTimeout(() => void watchSeam(), 250);
      return;
    }
    duration = progress.duration;
    spoken = Math.max(0, duration - (trimEnd ?? 0) - trimStart);
    if (trimEnd == null || trimEnd >= duration) return;
    const left = duration - trimEnd - progress.position;
    if (left <= 0.02) {
      const index = await TrackPlayer.getActiveTrackIndex();
      if (mine !== generation || index == null) return;
      // The last ayah of the queue ends as recorded.
      if (!(await TrackPlayer.getTrack(index + 1))) return;
      advancedAtSeam = true;
      await TrackPlayer.skipToNext();
      return;
    }
    const ms = (left / Math.max(0.25, rate || 1)) * 1000;
    seamTimer = setTimeout(
      () => void watchSeam(),
      Math.min(1000, Math.max(15, ms)),
    );
  } catch {
    // Best effort: the file plays to its end as recorded.
  }
}

/** The player's state changed: a playing track is watched, any other is not. */
export function onStateChanged(state: State | string): void {
  if (!IN_JS) return;
  if (state === State.Playing) void watchSeam();
  else clearSeam();
}

/** A new track is current: skip its leading silence, and rest if the last one asks. */
export async function onTrackChanged(e: {
  track?: Track | null;
  lastTrack?: Track | null;
  lastPosition?: number;
}): Promise<void> {
  if (!IN_JS) return;
  clearSeam();
  cancelRest();
  const natural =
    advancedAtSeam ||
    (e.lastTrack != null &&
      duration > 0 &&
      (e.lastPosition ?? 0) >= duration - 0.5);
  advancedAtSeam = false;
  const previousSpoken = spoken;
  spoken = 0;
  duration = 0;
  try {
    const trimStart = seconds(e.track, 'trimStart');
    if (trimStart != null) {
      const { position } = await TrackPlayer.getProgress();
      if (position < trimStart - 0.05) await TrackPlayer.seekTo(trimStart);
    }
    const factor = seconds(e.lastTrack, 'restFactor');
    if (natural && factor != null && previousSpoken > 0) {
      const ms = Math.min(30_000, previousSpoken * factor * 1000);
      if (ms >= 250) {
        await TrackPlayer.pause();
        restTimer = setTimeout(() => {
          restTimer = null;
          void TrackPlayer.play();
        }, ms);
        return;
      }
    }
  } catch {
    /* best effort */
  }
  void watchSeam();
}

/** For tests. */
export function _resetSeamsForTests(): void {
  clearSeam();
  cancelRest();
  advancedAtSeam = false;
  spoken = 0;
  duration = 0;
}
