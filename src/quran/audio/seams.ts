/**
 * The joins between ayahs, kept from JS where the player cannot keep them.
 *
 * A track may carry `trimStart` / `trimEnd` — seconds of silence to skip at
 * each end of its file (recitationEdges.ts) — or `trimStart` / `clipEnd`,
 * where an ayah cut out of a whole-surah file starts and ends in it
 * (surahRecitation.ts).
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
 * (The memorisation drill's "pause between repeats" is silent tracks in
 * the queue, played like any other — rest.ts. They carry no trims, so
 * nothing here touches them: a rest plays to its end and the next ayah
 * starts.)
 *
 * One timer, aimed at the moment it is needed and re-aimed whenever the
 * clock moves (a seek, a rate change, a pause) — never a poll that runs
 * for the length of the surah.
 */
import { Platform } from 'react-native';
import TrackPlayer, {
  RepeatMode,
  State,
  type Track,
} from 'react-native-track-player';

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

/**
 * The queue has run out of clips — ayahs cut from a surah file, which end
 * inside it. Letting the player run on would play the rest of the surah
 * after the range that was asked for. On repeat it goes round again from
 * the first clip; otherwise it stops, as a queue of whole files does.
 */
async function endOfClips(): Promise<void> {
  const mode = await TrackPlayer.getRepeatMode();
  if (mode === RepeatMode.Queue) {
    const first = await TrackPlayer.getTrack(0);
    await TrackPlayer.skip(0, seconds(first, 'trimStart') ?? 0);
    await TrackPlayer.play();
    return;
  }
  await TrackPlayer.stop();
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
    // `clipEnd`: where an ayah cut from a surah file ends, in seconds from
    // the file's start (surahRecitation.ts). `trimEnd`: silence to skip at
    // the end of an ayah's own file, in seconds before its end.
    const clipEnd = seconds(track, 'clipEnd');
    const trimEnd = seconds(track, 'trimEnd');
    if (clipEnd == null && trimEnd == null) return;
    let left: number;
    if (clipEnd != null) {
      left = clipEnd - progress.position;
    } else {
      if (!(progress.duration > 0)) {
        // Not loaded far enough to know its length yet.
        seamTimer = setTimeout(() => void watchSeam(), 250);
        return;
      }
      if (trimEnd! >= progress.duration) return;
      left = progress.duration - trimEnd! - progress.position;
    }
    if (left <= 0.02) {
      const index = await TrackPlayer.getActiveTrackIndex();
      if (mine !== generation || index == null) return;
      const next = await TrackPlayer.getTrack(index + 1);
      if (next) {
        if (clipEnd == null) {
          // A file of its own: the join exactly as it always was.
          await TrackPlayer.skipToNext();
        } else {
          // A clip: the next one at its own start, mid-file.
          await TrackPlayer.skip(index + 1, seconds(next, 'trimStart') ?? 0);
        }
        return;
      }
      // The last ayah of a queue of files ends as recorded; the last clip
      // does not run on into the rest of its file.
      if (clipEnd != null) await endOfClips();
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
