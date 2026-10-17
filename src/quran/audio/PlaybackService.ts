/**
 * Headless playback service — registered in index.js via
 * `TrackPlayer.registerPlaybackService`. Handles lock-screen /
 * notification remote events.
 *
 * The memorisation drill's pause between repeats (QR-19) is NOT here. It
 * used to be: a paused player and a timer to start it again, which never
 * once paused (it measured `lastTrack.duration`, which no track carries)
 * and, had it paused, would have stopped the drill with the screen off —
 * a paused app is one iOS suspends and Android stops waking. The rest is
 * silent tracks in the queue now (rest.ts), and the player never stops.
 */
import TrackPlayer, { Event } from 'react-native-track-player';
import { listenNextSurah, listenPreviousSurah } from './playback';

export async function PlaybackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
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
    void listenNextSurah().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    void listenPreviousSurah().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void TrackPlayer.reset();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, e => {
    void TrackPlayer.seekTo(e.position);
  });
  TrackPlayer.addEventListener(Event.RemoteDuck, e => {
    // autoHandleInterruptions covers most cases; this is the fallback.
    if (e.paused) void TrackPlayer.pause();
  });
}
