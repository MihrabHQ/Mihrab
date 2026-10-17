/**
 * Headless playback service — registered in index.js via
 * `TrackPlayer.registerPlaybackService`. Handles lock-screen /
 * notification remote events.
 *
 * The memorisation pause between repeats (QR-19) used to live here, on
 * `PlaybackActiveTrackChanged`, and never once paused: it measured the
 * track by `lastTrack.duration`, which is only what the app put on the
 * track — nothing, since nobody knows a file's length before it plays — and
 * its resume was a JS timer, which Android stops in the background. It is
 * now a property of the queue (`restFactor`, only on a drill's tracks) kept
 * by the player itself on Android and by `seams.ts` elsewhere. A remote
 * control ends a rest, as the app's own controls do.
 */
import TrackPlayer, { Event } from 'react-native-track-player';
import { listenNextSurah, listenPreviousSurah } from './playback';
import { cancelRest } from './seams';

export async function PlaybackService(): Promise<void> {
  // Any hand on a remote control ends a rest (seams.ts). On Android the
  // player's service already does so itself.
  const clearPauseTimer = cancelRest;

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    clearPauseTimer();
    void TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    clearPauseTimer();
    void TrackPlayer.pause();
  });
  /**
   * THE REMOTE ARROWS MOVE BY SURAH, like the app's own big ones.
   *
   * A track here is one ayah, so `skipToNext` — which is what these used
   * to call — moved the lock screen, the notification and the Mac's media
   * keys forward by about six seconds. Al-Baqarah is 286 of those. Nobody
   * reaching for the next-track button on a car stereo or a pair of
   * headphones means "advance six seconds"; they mean the next thing, and
   * the next thing in a recitation is the next surah.
   *
   * These are the same two functions the transport in Tilawah calls, on
   * purpose: the arrow on the lock screen and the arrow in the app are
   * one control in two places, and they were not before. Ayah stepping
   * is still there, in the smaller pair of buttons whose size says what
   * they are for — there is no room for a second pair on a lock screen,
   * and this is the one worth having.
   *
   * `listenPreviousSurah` restarts the current surah when you are past
   * its first ayah and only then steps back, which is what every player
   * does with a track and what a hand reaching for "previous" expects.
   */
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    clearPauseTimer();
    void listenNextSurah().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    clearPauseTimer();
    void listenPreviousSurah().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    clearPauseTimer();
    void TrackPlayer.reset();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, e => {
    clearPauseTimer();
    void TrackPlayer.seekTo(e.position);
  });
  TrackPlayer.addEventListener(Event.RemoteDuck, e => {
    // A call or another app took the sound: a rest must not start the
    // recitation again over it.
    clearPauseTimer();
    // autoHandleInterruptions covers most cases; this is the fallback.
    if (e.paused) void TrackPlayer.pause();
  });
}
