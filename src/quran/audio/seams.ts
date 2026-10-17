/**
 * The joins between ayahs, kept from JS where the player cannot keep them.
 *
 * A track may carry `trimStart` / `trimEnd` — seconds of silence to skip at
 * each end of its file (recitationEdges.ts).
 *
 * On Android the player's own service does this, natively
 * (patches/react-native-track-player: MusicService `watchSeam`): JS timers
 * stop when the app is in the background there, and a recitation is
 * listened to in a pocket. Everywhere else — iOS, iPadOS, the Mac — JS
 * keeps running while audio plays, and this module does the same job:
 *
 *   • when a track starts, skip its leading silence;
 *   • sleep until its last sound (plus a breath), then move to the next.
 *
 * Both happen only WHILE PLAYING, which is what keeps them safe in the
 * background: nothing here pauses the player and waits to start it again.
 * (The memorisation drill's "pause between repeats" would have to, and a
 * paused app is one iOS suspends and Android stops waking — so that pause
 * is not done here; see PlaybackService.)
 *
 * One timer, aimed at the moment it is needed and re-aimed whenever the
 * clock moves (a seek, a rate change, a pause) — never a poll that runs
 * for the length of the surah.
 */
import { Platform } from 'react-native';
import TrackPlayer, { State, type Track } from 'react-native-track-player';

const IN_JS = Platform.OS !== 'android';

let seamTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every re-aim, so a stale await does not arm a timer. */
let generation = 0;

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
    const trimEnd = seconds(track, 'trimEnd');
    if (trimEnd == null) return;
    if (!(progress.duration > 0)) {
      // Not loaded far enough to know its length yet.
      seamTimer = setTimeout(() => void watchSeam(), 250);
      return;
    }
    if (trimEnd >= progress.duration) return;
    const left = progress.duration - trimEnd - progress.position;
    if (left <= 0.02) {
      const index = await TrackPlayer.getActiveTrackIndex();
      if (mine !== generation || index == null) return;
      // The last ayah of the queue ends as recorded.
      if (!(await TrackPlayer.getTrack(index + 1))) return;
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

/** A new track is current: skip its leading silence, then watch for its end. */
export async function onTrackChanged(e: {
  track?: Track | null;
}): Promise<void> {
  if (!IN_JS) return;
  clearSeam();
  // A reset or a queue's end reports no track: nothing to join.
  if (!e.track) return;
  try {
    const trimStart = seconds(e.track, 'trimStart');
    if (trimStart != null) {
      const { position } = await TrackPlayer.getProgress();
      if (position < trimStart - 0.05) await TrackPlayer.seekTo(trimStart);
    }
  } catch {
    /* best effort */
  }
  void watchSeam();
}

/** For tests. */
export function _resetSeamsForTests(): void {
  clearSeam();
}
