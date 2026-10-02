import { NativeModules, Platform } from 'react-native';

/**
 * Foreground player for the FULL adhan recording (iOS only).
 *
 * iOS caps notification sounds at 30s, so the prayer notification can only play
 * a 29s clip. This native module plays the complete adhan (bundled `<id>.mp3`)
 * while the app is active — when the user taps an adhan notification (which
 * foregrounds the app) or when a prayer notification arrives while the app is
 * open. It uses no background audio mode, so playback only happens in the
 * foreground. On Android the notification channel already plays the full adhan,
 * so every method is a no-op there.
 */
type AdhanPlayerNative = {
  play(name: string): Promise<boolean>;
  playPath(path: string): Promise<boolean>;
  stop(): Promise<boolean>;
  isPlaying(): Promise<boolean>;
};

const native: AdhanPlayerNative | undefined =
  Platform.OS === 'ios'
    ? (NativeModules.AdhanPlayer as AdhanPlayerNative | undefined)
    : undefined;

type BeforePlay = () => Promise<void> | void;
const beforePlay = new Set<BeforePlay>();

/**
 * Run `fn` before the full adhan starts, and wait for it.
 *
 * The adhan and the Quran recitation share the app's one AVAudioSession,
 * so without this the two would play over each other. The recitation
 * player registers here (rather than this module importing it) so that
 * the notification code, which runs in the headless background task too,
 * does not pull the whole player in. Returns the unsubscribe.
 */
export function onBeforeAdhanPlays(fn: BeforePlay): () => void {
  beforePlay.add(fn);
  return () => beforePlay.delete(fn);
}

async function runBeforePlay(): Promise<void> {
  for (const fn of beforePlay) {
    try {
      await fn();
    } catch {
      // A listener that fails must not keep the adhan from playing.
    }
  }
}

export const AdhanPlayer = {
  /** Play the full adhan bundled as `<name>.mp3` (e.g. 'adhan_makkah'). */
  async play(name: string): Promise<boolean> {
    if (!native) return false;
    await runBeforePlay();
    return native.play(name).catch(() => false);
  },
  /**
   * Play a full adhan from an absolute path.
   *
   * The user's imported recording is not a bundle resource, and the clip the
   * notification plays is capped at 30s, so the foreground playback goes
   * through the original file instead.
   */
  async playPath(path: string): Promise<boolean> {
    if (!native) return false;
    await runBeforePlay();
    return native.playPath(path).catch(() => false);
  },
  /** Stop the currently-playing full adhan. */
  stop(): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    return native.stop().catch(() => false);
  },
  isPlaying(): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    return native.isPlaying().catch(() => false);
  },
};
