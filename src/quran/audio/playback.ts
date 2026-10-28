/**
 * Playback orchestrator — QR-16/17/19 (docs/quran-reader-plan.md).
 *
 * Thin, typed layer over react-native-track-player:
 *
 *   • Builds per-ayah track queues (one EveryAyah MP3 per ayah, local
 *     file when downloaded, streaming URL otherwise).
 *   • Expands memorization repeats into the queue itself (each-ayah ×N,
 *     whole-range ×M) — no fragile mid-playback queue surgery.
 *   • Mirrors the active (surah, ayah) + playing state into a tiny
 *     external store so UI components subscribe without touching the
 *     player library directly (`usePlaybackStatus`).
 *
 * The player is set up lazily on first play — never at app startup.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import TrackPlayer, {
  RepeatMode,
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
  State,
  type Track,
} from 'react-native-track-player';
import { findSurah, SURAHS } from '../quran';
import { getQuranState } from '../quranState';
import { ayahCountForRiwayah } from '../pages';
import { DEFAULT_RIWAYAH, resolveRiwayah, type RiwayahId } from '../riwayat';
import { filesOf } from '../riwayahAudio';
import { trimFor } from './recitationEdges';
import * as seams from './seams';
import {
  ayahAudioUrl,
  findReciter,
  isWholeSurah,
  reciterRiwayah,
  surahAudioUrl,
  type Reciter,
} from './reciters';
import { ayahClip, surahFileSeconds } from './surahRecitation';
import { recordedAyahs } from './recordedAyahs';
import {
  isRestTrack,
  restAsset,
  restPieces,
  restTrackId,
  spokenSeconds,
} from './rest';
import {
  checkRemoteSurah,
  keepSurahQuietly,
  localAudioPathIfAny,
  localSurahFileIfAny,
  prefetchAyahAudio,
  surahChangedAtSource,
} from './audioStore';
import { setNowPlayingState } from '../../native/NowPlayingState';
import { noteListenPaused, recordListened } from './listenProgress';
import { onAudioRouteLost } from '../../native/AudioRoute';
import { onBeforeAdhanPlays } from '../../native/AdhanPlayer';

export type AyahRef = { surah: number; ayah: number };

export type PlaybackStatus = {
  /** Ayah currently loaded (playing or paused). Null when idle. */
  active: AyahRef | null;
  playing: boolean;
  /** Buffering / loading state for spinners. */
  loading: boolean;
  reciterId: string;
  /**
   * The ayah playback stopped on because its audio is neither on disk
   * nor reachable — issue #30.
   *
   * A track's source is the local file when it exists and a URL when it
   * does not, which is right, and which offline turns into a request
   * that fails and a player that stops with nothing said. "Downloaded
   * audio will not play offline" is partly that silence: the reader
   * cannot tell a network problem from a gap in the download, and the
   * app knows exactly which it is.
   *
   * Null whenever playback is working, and cleared by the next
   * successful start, so it can never outlive the condition it
   * describes.
   */
  gap: AyahRef | null;
  /**
   * The drill is resting after `active` — a silent track is playing
   * (rest.ts). The ayah stays lit; what is heard is nothing, so nothing
   * inside the ayah (a word) is.
   */
  resting?: boolean;
  /**
   * One ayah, round and round until stopped ("Play on repeat" in the
   * ayah sheet). The queue holds the ayah's files and the player loops
   * the queue, so the lock screen, the headphones and the screen going
   * off all leave it looping — a timer here would not survive them.
   */
  looping?: boolean;
  /**
   * Playback did not start because the reciter is a whole-surah
   * recitation (SURAH_FILE_RECITERS) and this surah of it is not on the
   * device. Those are played from a full download only, so there is no
   * stream to fall back on: the card says so and offers the download.
   * `active` holds the ayah that was asked for, not playing, so the card
   * is there to say it; `resumePlayback` asks again.
   */
  needsDownload?: {
    reciterId: string;
    surah: number;
    /**
     * `missing`: not on the device (or not at the size it was measured
     * at, which is the same thing). `changed`: the source now serves a
     * different file, which no download will fix (audioStore).
     */
    reason: 'missing' | 'changed';
  } | null;
  /**
   * Where the current track sits in its file, when it is an ayah cut from a
   * whole-surah recording: progress and scrubbing are then the AYAH's, not
   * the surah file's (useProgressWhileActive, seekTo).
   */
  clip?: { start: number; end: number } | null;
};

const IDLE: PlaybackStatus = {
  active: null,
  playing: false,
  loading: false,
  reciterId: 'husary',
  gap: null,
  resting: false,
  looping: false,
  needsDownload: null,
  clip: null,
};

let status: PlaybackStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: Partial<PlaybackStatus>): void {
  status = { ...status, ...next };
  /**
   * Tell the OS what the OS cannot work out for itself.
   *
   * On macOS — and a Mac Catalyst build is macOS here —
   * `MPNowPlayingInfoCenter.playbackState` is required before Control
   * Center will show anything at all, and track-player's iOS half never
   * sets it. This is the one funnel every state change passes through, so
   * publishing from here is the only way the system's answer cannot drift
   * from the app's. No-op on Android, where the media session carries the
   * state already. See src/native/NowPlayingState.ts.
   */
  setNowPlayingState(
    status.active == null ? 'stopped' : status.playing ? 'playing' : 'paused',
  );
  for (const l of listeners) l();
}

export function getPlaybackStatus(): PlaybackStatus {
  return status;
}

export function usePlaybackStatus(): PlaybackStatus {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPlaybackStatus,
    getPlaybackStatus,
  );
}

// ── Player bootstrap ─────────────────────────────────────────────────

/**
 * The player's options, applied more than once ON PURPOSE.
 *
 * `capabilities` is what the lock screen, the notification and a pair of
 * headphones are allowed to ask for, and on iOS the library only binds it
 * to `MPRemoteCommandCenter` when there is a CURRENT ITEM to bind it for:
 *
 *     public var remoteCommands: [RemoteCommand] = [] {
 *         didSet { if let item = currentItem { enableRemoteCommands(...) } }
 *     }
 *
 * Setup runs before anything is queued, so that `didSet` fired against an
 * empty player and bound nothing. Applying them again once a track is
 * actually loaded is what makes the command centre real — which is the
 * difference between a lock-screen card with transport buttons and the
 * one this app was drawing: artwork, title, a scrubber, and no way to
 * pause it without unlocking the phone and opening the app.
 *
 * Cheap to repeat and idempotent: the library diffs the set and only
 * touches the commands whose enabled-ness changed.
 */
async function applyPlayerOptions(): Promise<void> {
  await TrackPlayer.updateOptions({
    android: {
      /**
       * Swiping the app away does NOT stop the recitation.
       *
       * It used to, which was defensible while the only way to start
       * audio was "play from here" inside the reader — you were looking
       * at the page, and closing the app meant you were done. It stopped
       * being defensible the moment there was a listening page: someone
       * puts a surah on, locks the phone, clears their recents an hour
       * later out of habit, and the recitation dies mid-ayah. No music
       * player behaves that way, and the notification's own controls are
       * what the person would reach for instead.
       */
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
    ],
    progressUpdateEventInterval: 1,
  });
}

/** Whether the command centre has been bound against a real track. */
let optionsBound = false;

/** ExoPlayer's cache for streamed audio, in bytes (Android only). */
const STREAM_CACHE_BYTES = 256 * 1024 * 1024;

let setupPromise: Promise<void> | null = null;

async function ensureSetup(): Promise<void> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    try {
      await TrackPlayer.setupPlayer({
        // A phone call or Siri pauses the recitation and, if the
        // interruption says it should, resumes it afterwards. Both
        // platforms.
        autoHandleInterruptions: true,
        /**
         * iOS audio session, per Apple's "Configuring your app for media
         * playback": `.playback` is the category for audio that is the
         * app's purpose — it keeps playing with the ring/silent switch on
         * and with the screen locked, and is what makes
         * `UIBackgroundModes: audio` meaningful at all. `.spokenAudio`
         * tells the system this is speech, not music: when another app's
         * spoken audio (navigation, a reminder) interrupts, iOS PAUSES
         * instead of ducking, so no word of the recitation is lost under
         * a prompt. `longFormAudio` is the route-sharing policy Apple asks
         * long-form audio apps to adopt (it keeps the recitation on the
         * route the user picked, e.g. an AirPlay speaker, instead of
         * following the system route, and is a requirement for the
         * HomePod/Siri audio integration). The library's TypeScript type
         * omits the policy key, but its Swift reads it — see
         * RNTrackPlayer.swift, `iosCategoryPolicy`.
         */
        iosCategory: IOSCategory.Playback,
        iosCategoryMode: IOSCategoryMode.SpokenAudio,
        ...({ iosCategoryPolicy: 'longFormAudio' } as object),
        /**
         * Android: a disk cache under ExoPlayer's network source. A
         * whole-surah recitation streamed is one file queued as many
         * clips, each a media item of its own, and ExoPlayer fetches each
         * item's bytes afresh — so every ayah began with a second or two
         * of buffering, though the previous clip had already pulled the
         * next minute of the same file. With the cache, those bytes are
         * on disk and the next clip starts from them. Bytes, not the
         * kilobytes the library's type says: MusicService hands the number
         * to the evictor as it is.
         */
        maxCacheSize: STREAM_CACHE_BYTES,
      });
    } catch (e) {
      // "player has already been initialized" — benign on fast reloads.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('already')) throw e;
    }
    await applyPlayerOptions();

    // Headphones unplugged / Bluetooth speaker off: pause rather than
    // let the recitation jump to the loudspeaker. Android has this from
    // handleAudioBecomingNoisy; this is the iOS half (see AudioRoute.ts).
    onAudioRouteLost(() => {
      if (status.active && status.playing) void TrackPlayer.pause();
    });

    // The in-app full adhan (iOS) shares the one audio session with the
    // recitation. Two voices at once is never what anyone wanted, and
    // the adhan has the stronger claim, so the recitation yields.
    onBeforeAdhanPlays(async () => {
      if (status.active && status.playing) await TrackPlayer.pause();
    });

    // Mirror player state into the status store.
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, e => {
      // A drill's rest is silence after an ayah, not an ayah (rest.ts): the
      // ayah just heard stays lit through it, and the listening place does
      // not move.
      const resting = isRestTrack(e.track);
      const ref = e.track && !resting ? parseTrackId(String(e.track.id)) : null;
      if (resting) setStatus({ resting: true });
      else setStatus({ active: ref, resting: false, clip: clipOf(e.track) });
      if (ref && !resting) {
        lastActiveId = String(e.track!.id);
        void checkClipFile(e.track, ref);
      }
      // The join: skip this file's leading silence and aim at its last
      // sound (seams.ts; natively on Android). A rest has neither.
      void seams.onTrackChanged(e);
      // The listening place moves with a continuous listen, and only with
      // one: a range played from the reader is the reader's business.
      if (ref && listening)
        recordListened({ ...ref, riwayah: queueRiwayah }, status.reciterId);
      // The first track the player ever loads is the moment iOS will
      // accept the remote commands — see applyPlayerOptions. Once only:
      // after that the binding survives every later track by itself.
      if (ref && !optionsBound) {
        optionsBound = true;
        void applyPlayerOptions().catch(() => {
          optionsBound = false;
        });
      }
      // ONE look at the queue per ayah, shared by both of the jobs below.
      //
      // `getQueue()` hands the whole queue across the bridge — every track,
      // with its url, title, artist and artwork — and a listening queue is
      // up to seven hundred of them. Each job used to fetch its own copy,
      // and the prefetch fetched a third per file it finished, so a long
      // session was serialising a few hundred kilobytes of queue every six
      // seconds to answer "what is next" and "how much is left".
      void snapshotQueue().then(snap => {
        if (!snap) return;
        // Gapless: warm the next few ayahs onto disk (v2.7.28).
        void prefetchUpcoming(snap);
        // Listening: keep a couple of hundred ayahs queued ahead of here,
        // so one surah runs into the next without a gap or a decision.
        void extendListening(snap);
      });
    });
    TrackPlayer.addEventListener(Event.PlaybackState, e => {
      seams.onStateChanged(e.state);
      if (listening) {
        if (e.state === State.Paused) noteListenPaused(true);
        else if (e.state === State.Playing) noteListenPaused(false);
      }
      setStatus({
        playing: e.state === State.Playing,
        loading: e.state === State.Loading || e.state === State.Buffering,
      });
      if (e.state === State.Stopped || e.state === State.None) {
        // A card saying why a surah cannot be played stays: the stop that
        // came with it (the queue reset under it, delivered late) is not
        // the reader closing it.
        if (getPlaybackStatus().needsDownload) {
          setStatus({ playing: false, loading: false, clip: null });
        } else {
          setStatus({ active: null, playing: false, loading: false, clip: null });
        }
        void stoppedAtMissingSurah();
      }
    });
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      setStatus({ active: null, playing: false, loading: false, clip: null });
      void stoppedAtMissingSurah();
    });
    // The second net under a clip's end. The seam watcher ends each clip
    // (natively on Android, seams.ts elsewhere); if it was late — a timer
    // held back, a service restarted — the player is already into the
    // next ayah's audio, and this moves it on within a second.
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, e => {
      void catchClipOverrun(e.position);
    });

    /**
     * A track failed. Say whether it was the network or the download.
     *
     * The distinction is the entire point, and only this process can
     * make it: if the file is on disk and the player still failed, that
     * is a broken file or a busy device and retrying is reasonable. If
     * the file is NOT on disk, the player was reaching for a URL, and
     * offline that is a gap in the download — a specific ayah, which the
     * reader can be told about and can fix.
     */
    TrackPlayer.addEventListener(Event.PlaybackError, () => {
      const ref = getPlaybackStatus().active;
      if (!ref) return;
      void TrackPlayer.getActiveTrack()
        .then(track => localFileOf(track, ref))
        .then(local => {
          if (!local) setStatus({ gap: ref, playing: false, loading: false });
        })
        .catch(() => undefined);
    });
  })();
  return setupPromise;
}

/**
 * The local file a failed track was playing, if it is on the device.
 *
 * The FILE, which is not the ayah's number in a riwayah that counts
 * differently (riwayahAudio.ts) — and for a whole-surah recitation is the
 * surah's one file. A rest is a file in the app itself, never a gap in a
 * download.
 */
function localFileOf(
  track: Track | null | undefined,
  ref: AyahRef,
): Promise<string | null> | string {
  if (isRestTrack(track)) return 'bundled';
  const reciterId = getPlaybackStatus().reciterId;
  if (isWholeSurah(findReciter(reciterId))) {
    return localSurahFileIfAny(reciterId, ref.surah);
  }
  return localAudioPathIfAny(reciterId, ref.surah, fileAyahOf(track) ?? ref.ayah);
}

// ── Gapless prefetch (v2.7.28) ───────────────────────────────────────
//
// On every track change, warm the next few ayahs onto disk and swap
// their queue entries from remote URL → local file. Entries closer
// than +2 are never touched (ExoPlayer may already be buffering the
// immediate next item; replacing it would cause the very gap we're
// removing). After a short warmup a long session plays entirely from
// disk — no network pause between ayahs.

const PREFETCH_AHEAD = 3;
const inFlightPrefetch = new Set<string>();

/**
 * ONE SWAP AT A TIME.
 *
 * A swap is a remove and an add at the same index, by index rather than
 * by scanning a fresh copy of the whole queue. That is only sound if
 * nothing else moves entries between the two — and the swaps themselves
 * did: three files fetched together finish together, and a remove of 4
 * landing between another swap's remove of 5 and its add put the queue
 * out of order. Heard as an ayah skipped, played twice, or played after
 * the one that follows it (seen on the emulator as 3 → 5 → 4). Chained,
 * each swap re-reads its index after the last one has finished, and the
 * id check below is then a true statement about the queue.
 */
let swapChain: Promise<void> = Promise.resolve();

function swapToLocal(i: number, id: string, path: string): Promise<void> {
  const run = async () => {
    const [idx, track] = await Promise.all([
      TrackPlayer.getActiveTrackIndex(),
      TrackPlayer.getTrack(i),
    ]);
    // Entries closer than +2 may already be buffering; replacing one would
    // cause the very gap this removes. A different id means a different
    // queue, and this file waits for its own pass.
    if (idx == null || i < idx + 2 || !track) return;
    if (
      track.id !== id ||
      typeof track.url !== 'string' ||
      !track.url.startsWith('http')
    ) {
      return;
    }
    await TrackPlayer.remove([i]);
    await TrackPlayer.add({ ...track, url: `file://${path}` }, i);
  };
  swapChain = swapChain.then(run, run).catch(() => undefined);
  return swapChain;
}

/** The queue and where we are in it, as of one moment. */
type QueueSnapshot = { queue: Track[]; idx: number };

async function snapshotQueue(): Promise<QueueSnapshot | null> {
  try {
    const [queue, idx] = await Promise.all([
      TrackPlayer.getQueue(),
      TrackPlayer.getActiveTrackIndex(),
    ]);
    return idx == null ? null : { queue, idx };
  } catch {
    return null;
  }
}

async function prefetchUpcoming({ queue, idx }: QueueSnapshot): Promise<void> {
  if (isWholeSurah(findReciter(status.reciterId))) {
    void keepUpcomingSurahs({ queue, idx });
    return;
  }
  try {
    const reciterId = status.reciterId;
    // The next few FILES: a drill's rests between them are in the app
    // already, and do not count.
    let ahead = 0;
    for (let i = idx + 1; i < queue.length && ahead < PREFETCH_AHEAD; i++) {
      const tr = queue[i];
      if (!tr || isRestTrack(tr)) continue;
      ahead++;
      if (typeof tr.url !== 'string' || !tr.url.startsWith('http')) {
        continue;
      }
      const ref = parseTrackId(String(tr.id));
      if (!ref) continue;
      const file = fileAyahOf(tr) ?? ref.ayah;
      const key = `${reciterId}:${ref.surah}:${file}`;
      if (inFlightPrefetch.has(key)) continue;
      inFlightPrefetch.add(key);
      void prefetchAyahAudio(reciterId, ref.surah, file)
        .then(async path => {
          inFlightPrefetch.delete(key);
          if (!path) return;
          await swapToLocal(i, String(tr.id), path);
        })
        .catch(() => {
          inFlightPrefetch.delete(key);
        });
    }
  } catch {
    /* best effort */
  }
}

/**
 * The whole-surah counterpart of the prefetch above: the surah of the next
 * few clips being streamed is saved to the device (audioStore
 * `keepSurahQuietly`, short surahs only), and those queue entries are
 * swapped to the local file — far enough ahead that the player is not
 * already loading them, exactly as the ayah prefetch swaps its own.
 */
async function keepUpcomingSurahs({ queue, idx }: QueueSnapshot): Promise<void> {
  try {
    const reciterId = status.reciterId;
    const surahs = new Set<number>();
    for (let i = idx; i < queue.length && i <= idx + PREFETCH_AHEAD; i++) {
      const tr = queue[i];
      if (!tr || isRestTrack(tr) || typeof tr.url !== 'string' || !tr.url.startsWith('http')) continue;
      const ref = parseTrackId(String(tr.id));
      if (ref) surahs.add(ref.surah);
    }
    for (const surah of surahs) {
      void keepSurahQuietly(reciterId, surah).then(async path => {
        if (!path || status.reciterId !== reciterId) return;
        const snap = await snapshotQueue();
        if (!snap) return;
        for (let i = snap.idx + 2; i < snap.queue.length && i <= snap.idx + 2 + PREFETCH_AHEAD; i++) {
          const tr = snap.queue[i];
          const ref = parseTrackId(String(tr?.id ?? ''));
          if (ref?.surah === surah) await swapToLocal(i, String(tr.id), path);
        }
      });
    }
  } catch {
    /* best effort: the stream keeps playing */
  }
}

// ── Queue building ───────────────────────────────────────────────────

/** Hard cap so repeat expansion can never build a pathological queue. */
const MAX_QUEUE_TRACKS = 700;

export function trackId(surah: number, ayah: number, index: number): string {
  return `${surah}:${ayah}:${index}`;
}

export function parseTrackId(id: string): AyahRef | null {
  const m = /^(\d+):(\d+):\d+$/.exec(id);
  if (!m) return null;
  return { surah: Number(m[1]), ayah: Number(m[2]) };
}

/**
 * WHOSE NUMBERING THE QUEUE IS IN.
 *
 * The reader's: an ayah in the queue is the ayah lit on the page and the
 * one the page turns to, so it is counted the way the muṣḥaf on screen
 * counts. The recordings are cut by the Ḥafṣ count whatever the riwayah,
 * and `buildTracks` turns each ayah into its files (`riwayahAudio.ts`,
 * issue #83). Fixed when a queue is built, so a queue never changes
 * numbering halfway through.
 */
let queueRiwayah: RiwayahId = DEFAULT_RIWAYAH;

/** Ayahs in a surah, counted as the queue counts them. */
function ayahsIn(surah: number, riwayah: RiwayahId = queueRiwayah): number {
  return ayahCountForRiwayah(riwayah, surah);
}

/** The recording file a track plays, when it is not the ayah's own number. */
function fileAyahOf(track: Track | null | undefined): number | undefined {
  const n = (track as { fileAyah?: unknown } | null | undefined)?.fileAyah;
  return typeof n === 'number' ? n : undefined;
}

/** Expand a contiguous ayah range into the ordered play list (no repeats). */
export function expandRange(
  from: AyahRef,
  to: AyahRef,
  riwayah: RiwayahId = queueRiwayah,
): AyahRef[] {
  const out: AyahRef[] = [];
  // Both ends inside their surahs, as THIS riwayah counts them. An end
  // written in another count — Al-Baqarah 2:286 for a Warsh reader, whose
  // Al-Baqarah has 285 — never came round, and the walk ran on to An-Nās.
  const clamp = (r: AyahRef): AyahRef => ({
    surah: r.surah,
    ayah: Math.max(1, Math.min(r.ayah, ayahsIn(r.surah, riwayah))),
  });
  const start = clamp(from);
  let s = start.surah;
  let a = start.ayah;
  // Guard: inverted ranges play just the starting ayah.
  const last = clamp(to);
  const end =
    last.surah < start.surah ||
    (last.surah === start.surah && last.ayah < start.ayah)
      ? start
      : last;
  for (;;) {
    out.push({ surah: s, ayah: a });
    if (s === end.surah && a === end.ayah) break;
    if (s > end.surah || !findSurah(s)) break;
    if (a < ayahsIn(s, riwayah)) {
      a += 1;
    } else if (s < 114) {
      s += 1;
      a = 1;
    } else {
      break;
    }
    if (out.length > 6236) break; // absolute safety
  }
  return out;
}

/**
 * Apply memorization repeats: each ayah ×`eachAyah`, then the whole
 * sequence ×`range`. Trims range repeats first, then ayah repeats, to
 * stay under MAX_QUEUE_TRACKS.
 */
export function applyRepeats(
  refs: AyahRef[],
  eachAyah: number,
  range: number,
): AyahRef[] {
  const each = Math.max(1, Math.min(10, Math.floor(eachAyah)));
  let whole = Math.max(1, Math.min(10, Math.floor(range)));
  let per = each;
  while (refs.length * per * whole > MAX_QUEUE_TRACKS && whole > 1) whole -= 1;
  while (refs.length * per * whole > MAX_QUEUE_TRACKS && per > 1) per -= 1;
  const once: AyahRef[] = [];
  for (const r of refs) {
    for (let i = 0; i < per; i++) once.push(r);
  }
  const out: AyahRef[] = [];
  for (let i = 0; i < whole; i++) out.push(...once);
  return out.slice(0, MAX_QUEUE_TRACKS);
}

/**
 * What the lock screen shows next to the transport.
 *
 * The app's own icon. A media notification with no artwork is a grey
 * rectangle and a line of text, and the phone's own player, the car and
 * the watch all reserve the space whether we fill it or not. There is
 * nothing to picture for a recitation — no cover exists — so the honest
 * thing to put there is the app it is coming from.
 *
 * The SQUARE icon, not the rounded one. Every player draws album art in
 * its own frame — the lock screen's card, the notification's thumbnail —
 * and rounds it itself. The rounded PNG had transparent corners, which
 * iOS composited onto the card's white, so the icon sat in a square with
 * four white corners on the lock screen.
 */
const ARTWORK = require('../../../assets/app-icon-square.png');

async function buildTracks(
  refs: AyahRef[],
  reciterId: string,
  // Where these tracks start in the queue. Ids have to stay unique across
  // the top-ups a continuous listen appends, or two ayahs share one id and
  // the active-track lookup starts answering with the wrong one.
  indexOffset = 0,
  // The ayah queued just before `refs[0]`, when this is a top-up: it may
  // already have played a file the first of these shares.
  previous: AyahRef | null = null,
  // A drill repeats each ayah: the second half of a split ayah is then
  // heard in its own repetitions, shared file and all, rather than once.
  repeating = false,
  // The drill's "pause between repeats": rest for the ayah's recited
  // length × this after each ayah (rest.ts). 0 is no rest.
  restFactor = 0,
): Promise<Track[]> {
  const reciter = findReciter(reciterId);
  if (isWholeSurah(reciter)) {
    return buildClipTracks(refs, reciter, indexOffset, previous, repeating, restFactor);
  }
  const riwayah = queueRiwayah;
  // An ayah is one recording in Ḥafṣ and one, two, three — or, for the
  // second half of a split, none of its own — in a riwayah that counts
  // differently (`riwayahAudio.ts`). Each file is a track, and every track
  // carries the AYAH in its id: that is what the page lights, while the
  // file says what is heard.
  //
  // `n` is which of `refs` the file is for, so a rest can follow the LAST
  // file of each: an ayah heard in two files rests once, after both.
  const plan: Array<{ r: AyahRef; file: number; n: number }> = [];
  let before = previous;
  refs.forEach((r, n) => {
    const afterPrevious =
      !repeating &&
      before != null &&
      before.surah === r.surah &&
      before.ayah === r.ayah - 1;
    for (const file of filesOf(riwayah, r.surah, r.ayah, afterPrevious)) {
      plan.push({ r, file, n });
    }
    before = r;
  });
  // Resolve local paths once per unique file.
  const localByKey = new Map<string, string | null>();
  for (const { r, file } of plan) {
    const key = `${r.surah}:${file}`;
    if (!localByKey.has(key)) {
      localByKey.set(key, await localAudioPathIfAny(reciterId, r.surah, file));
    }
  }
  // The rest after each ayah, in silent pieces — one look per ayah.
  const restsAfter = new Map<number, number[]>();
  if (restFactor > 0) {
    const restByAyah = new Map<string, number[]>();
    for (let i = 0; i < plan.length; i++) {
      const { r, n } = plan[i];
      // Not after the ayah's first file when it has a second, and not after
      // the last of the queue: the drill is over there.
      if (i + 1 >= plan.length || plan[i + 1].n === n) continue;
      let first = i;
      while (first > 0 && plan[first - 1].n === n) first--;
      const files = plan.slice(first, i + 1).map(p => p.file);
      const key = `${r.surah}:${files.join(',')}`;
      let pieces = restByAyah.get(key);
      if (!pieces) {
        pieces = await restFor(reciter, r.surah, files, restFactor);
        restByAyah.set(key, pieces);
      }
      if (pieces.length > 0) restsAfter.set(i, pieces);
    }
  }
  const tracks: Track[] = [];
  plan.forEach(({ r, file }, i) => {
    const local = localByKey.get(`${r.surah}:${file}`);
    const meta = findSurah(r.surah);
    const ayahTrack: Track = {
      id: trackId(r.surah, r.ayah, indexOffset + tracks.length),
      url: local ? `file://${local}` : ayahAudioUrl(reciter, r.surah, file),
      fileAyah: file,
      // The silence at the file's two ends, skipped by the player so one
      // ayah runs into the next with a breath, not a stop
      // (recitationEdges.ts, seams.ts).
      ...trimFor(reciter.folder, r.surah, file),
      /**
       * THE SURAH, AND HOW FAR INTO IT — because the bar cannot say so.
       *
       * The system player's progress bar belongs to the TRACK, and a
       * track here is one ayah: six seconds that fill and reset, over and
       * over, saying nothing about the thing being listened to. It is the
       * platform's bar, drawn from the media session's own position and
       * duration, and neither can be overridden on Android — the session
       * reports what the player is actually playing.
       *
       * So the surah's progress goes where this app CAN put it: the
       * title. "Al-Kahf · 5 / 110" answers the question the bar looks
       * like it is answering and is not.
       */
      title: meta
        ? `${meta.romanized} · ${r.ayah} / ${ayahsIn(r.surah, riwayah)}`
        : `${r.surah}:${r.ayah}`,
      artist: reciter.name,
      // The surah on its own, for the surfaces that show an album line.
      album: meta?.romanized ?? undefined,
      artwork: ARTWORK,
    };
    tracks.push(ayahTrack);
    // The rest: silence, under the ayah's own title and reciter so the lock
    // screen does not flicker to something else and back. No trims, no
    // file: nothing to join and nothing to download.
    for (const ms of restsAfter.get(i) ?? []) {
      tracks.push({
        id: restTrackId(r.surah, r.ayah, indexOffset + tracks.length),
        // A bundled file, as `require` gives it; the player resolves it
        // (its `AddTrack` type means to allow this and, intersected with
        // `Track`, does not).
        url: restAsset(ms) as unknown as string,
        title: ayahTrack.title,
        artist: ayahTrack.artist,
        album: ayahTrack.album,
        artwork: ARTWORK,
      });
    }
  });
  return tracks;
}

// ── Whole-surah recitations: an ayah is a clip of its surah's file ───
//
// SURAH_FILE_RECITERS keep a surah in one file; `surahRecitation.ts` knows
// where each ayah starts and ends in it. A track per ayah, pointing at the
// file with `trimStart` (where it starts) and `clipEnd` (where it ends) —
// honoured natively on Android and by `seams.ts` elsewhere — keeps every
// queue mechanic as it is: the highlight, the repeats, the drill's rests,
// "play on repeat", the listening window, skipping by ayah.
//
// Played from the device only: a surah whose file is not downloaded is
// not queued (see `firstMissingSurah` and `needsDownload`).

/**
 * Where a whole-surah recitation's surah plays from: its file on the
 * device at its exact size, or — online, and only when the server says
 * the file is exactly that size — streamed (audioStore `checkRemoteSurah`).
 * Null when neither: changed at the source, or not here and not reachable.
 */
async function surahSource(
  reciterId: string,
  surah: number,
): Promise<{ url: string } | { blocked: 'missing' | 'changed' }> {
  if (offLength.has(`${reciterId}:${surah}`) || (await surahChangedAtSource(reciterId, surah))) {
    return { blocked: 'changed' };
  }
  const local = await localSurahFileIfAny(reciterId, surah);
  if (local) return { url: `file://${local}` };
  const remote = await checkRemoteSurah(reciterId, surah);
  if (remote === 'ok') return { url: surahAudioUrl(findReciter(reciterId), surah) };
  return { blocked: remote === 'changed' ? 'changed' : 'missing' };
}

/**
 * The first surah of `refs` that cannot be played — from the device, or
 * streamed — and why, or null. `changed`: the recording at the source is
 * not the one measured; no download fixes that. `missing`: not on the
 * device, and the server could not be reached to stream it.
 */
async function firstMissingSurah(
  reciterId: string,
  refs: readonly AyahRef[],
): Promise<{ surah: number; reason: 'missing' | 'changed' } | null> {
  if (!isWholeSurah(findReciter(reciterId))) return null;
  const seen = new Set<number>();
  for (const r of refs) {
    if (seen.has(r.surah)) continue;
    seen.add(r.surah);
    const source = await surahSource(reciterId, r.surah);
    if ('blocked' in source) return { surah: r.surah, reason: source.blocked };
  }
  return null;
}

async function buildClipTracks(
  refs: AyahRef[],
  reciter: Reciter,
  indexOffset: number,
  previous: AyahRef | null,
  repeating: boolean,
  restFactor: number,
): Promise<Track[]> {
  const reader = queueRiwayah;
  const recording = reciterRiwayah(reciter);
  lastBuildStop = null;
  const sources = new Map<number, string | null>();
  const tracks: Track[] = [];
  let before = previous;
  for (let n = 0; n < refs.length; n++) {
    const r = refs[n];
    if (!sources.has(r.surah)) {
      const source = await surahSource(reciter.id, r.surah);
      sources.set(r.surah, 'url' in source ? source.url : null);
    }
    const path = sources.get(r.surah);
    // A listening window that walks into a surah that cannot be played —
    // not here and not reachable, or changed at its source — ends there,
    // and says so when the player reaches it (`listenStopsAt`); the start
    // of playback checks before it gets this far.
    if (!path) {
      lastBuildStop = {
        surah: r.surah,
        afterId: tracks.length ? String(tracks[tracks.length - 1].id) : null,
      };
      break;
    }
    const afterPrevious =
      !repeating &&
      before != null &&
      before.surah === r.surah &&
      before.ayah === r.ayah - 1;
    before = r;
    const span = recordedAyahs(reader, recording, r.surah, r.ayah, afterPrevious);
    if (!span) continue;
    // The surah's opening — taʿawwudh, basmalah — is part of hearing it
    // begin, not of an ayah drilled on its own.
    const opening = span[0] === 1 && !repeating;
    const a = ayahClip(reciter.id, r.surah, span[0], opening);
    const b = ayahClip(reciter.id, r.surah, span[1]);
    if (!a || !b) continue;
    const meta = findSurah(r.surah);
    const track: Track = {
      id: trackId(r.surah, r.ayah, indexOffset + tracks.length),
      url: path,
      ...(a.start > 0 ? { trimStart: a.start } : {}),
      clipEnd: b.end,
      title: meta
        ? `${meta.romanized} · ${r.ayah} / ${ayahsIn(r.surah, reader)}`
        : `${r.surah}:${r.ayah}`,
      artist: reciter.name,
      album: meta?.romanized ?? undefined,
      artwork: ARTWORK,
    };
    tracks.push(track);
    if (restFactor > 0 && n + 1 < refs.length) {
      const spoken = Math.max(0, b.end - ayahClip(reciter.id, r.surah, span[0])!.start);
      for (const ms of restPieces(spoken * restFactor)) {
        tracks.push({
          id: restTrackId(r.surah, r.ayah, indexOffset + tracks.length),
          url: restAsset(ms) as unknown as string,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: ARTWORK,
        });
      }
    }
  }
  return tracks;
}

/**
 * Stop before starting, when a whole-surah recitation is not on the
 * device for these ayahs. Records what was asked for, so `resumePlayback`
 * can ask again once it is.
 */
let blockedStart: (() => Promise<void>) | null = null;

async function blockedByDownload(
  reciterId: string,
  refs: readonly AyahRef[],
  retry: () => Promise<void>,
): Promise<boolean> {
  const missing = await firstMissingSurah(reciterId, refs);
  if (missing == null) {
    blockedStart = null;
    return false;
  }
  // Whatever was playing stops: the reader asked for this, not that. Before
  // the card is shown — the player's own "stopped" would clear it.
  endListening();
  await TrackPlayer.reset().catch(() => undefined);
  showBlocked(reciterId, refs[0] ?? null, missing, retry);
  return true;
}

/** Say that playback cannot go on here, and how Play asks again. */
function showBlocked(
  reciterId: string,
  at: AyahRef | null,
  missing: { surah: number; reason: 'missing' | 'changed' },
  retry: () => Promise<void>,
): void {
  blockedStart = retry;
  setStatus({
    active: at,
    playing: false,
    loading: false,
    resting: false,
    looping: false,
    gap: null,
    clip: null,
    needsDownload: { reciterId, surah: missing.surah, reason: missing.reason },
  });
}

/**
 * Where a track begins: its `trimStart`, or 0.
 *
 * Passed to every skip, so a clip of a surah file starts at its ayah and
 * not at the top of the file with a seek after it (see MusicService.jumpTo
 * in the track-player patch; on iOS the track's own initial time).
 */
function startOf(track: Track | null | undefined): number {
  const v = (track as { trimStart?: unknown } | null | undefined)?.trimStart;
  return typeof v === 'number' && v > 0 ? v : 0;
}

/** Where a clip of a surah file ends, or null for any other track. */
function clipEndOf(track: Track | null | undefined): number | null {
  const v = (track as { clipEnd?: unknown } | null | undefined)?.clipEnd;
  return typeof v === 'number' && v > 0 ? v : null;
}

/** The clip a track is, for `PlaybackStatus.clip`. */
function clipOf(track: Track | null | undefined): { start: number; end: number } | null {
  const end = clipEndOf(track);
  return end == null ? null : { start: startOf(track), end };
}

/**
 * ── A FILE THAT RUNS A DIFFERENT LENGTH ───────────────────────────────
 *
 * The size check (audioStore) is what stands between a reader and an ayah
 * cut in the wrong place. This is the check behind it: once a surah's file
 * is playing, the player knows its length, and the table knows the length
 * the boundaries were measured on. More than two seconds apart, and the
 * file is not that recording whatever its size says — so the surah stops,
 * says it cannot be played in this voice, and is not offered again this
 * session. Logged, so a report can say which.
 */
const offLength = new Set<string>();
const LENGTH_SLACK_S = 2;

async function checkClipFile(track: Track | null | undefined, ref: AyahRef): Promise<void> {
  if (clipEndOf(track) == null) return;
  const reciterId = status.reciterId;
  const measured = surahFileSeconds(reciterId, ref.surah);
  if (measured == null || offLength.has(`${reciterId}:${ref.surah}`)) return;
  // The length is known once the file has loaded; a few looks, then none.
  const id = String(track!.id);
  for (let i = 0; i < 6; i++) {
    const { duration } = await TrackPlayer.getProgress().catch(() => ({ duration: 0 }));
    // The length the player reports is the ACTIVE track's. A short last
    // ayah can end, and the next surah's file load, inside these looks —
    // then the duration is the next file's, and this surah would be
    // declared changed on another file's length. Only this track's counts.
    const now = await TrackPlayer.getActiveTrack().catch(() => null);
    if (now == null || String(now.id) !== id || lastActiveId !== id) return;
    if (duration > 0) {
      if (Math.abs(duration - measured) > LENGTH_SLACK_S) {
        console.warn(
          `[surahRecitation] ${reciterId} ${ref.surah}: file runs ${duration}s, measured ${measured}s`,
        );
        offLength.add(`${reciterId}:${ref.surah}`);
        const retry = () => playRangeFrom(ref);
        endListening();
        await TrackPlayer.reset().catch(() => undefined);
        showBlocked(reciterId, ref, { surah: ref.surah, reason: 'changed' }, retry);
      }
      return;
    }
    await new Promise<void>(r => setTimeout(r, 500));
  }
}

/** Play on from an ayah to the end of its surah — a retry's shape. */
function playRangeFrom(ref: AyahRef): Promise<void> {
  return playRange(ref, { surah: ref.surah, ayah: ayahsIn(ref.surah) }, { useRepeats: false });
}

/**
 * Past a clip's end by more than the seam watcher should ever allow: move
 * on now. On iOS the watcher is `seams.ts`, asked to look again; on
 * Android it is native, and a whole second past means it did not fire, so
 * the step is taken from here.
 */
let overrunBusy = false;
async function catchClipOverrun(position: number): Promise<void> {
  const clip = status.clip;
  if (!clip || overrunBusy || !status.playing) return;
  const late = position - clip.end;
  if (late <= 0.3) return;
  overrunBusy = true;
  try {
    if (Platform.OS !== 'android') {
      await seams.watchSeam();
      return;
    }
    if (late < 1) return;
    const snap = await snapshotQueue();
    if (!snap) return;
    const next = snap.queue[snap.idx + 1];
    if (next) await skipToEntry(snap.idx + 1, next);
    else await TrackPlayer.stop();
  } catch {
    /* the next progress event looks again */
  } finally {
    overrunBusy = false;
  }
}

/**
 * ── LISTENING INTO A SURAH THAT IS NOT HERE ───────────────────────────
 *
 * A whole-surah recitation part-downloaded — a run interrupted, a surah
 * changed at its source — has holes, and a continuous listen walks into
 * them. The queue ends at the last ayah before the hole
 * (`buildClipTracks`), and when the player gets there this says so, in
 * the same words a start would have used, with the download; Play goes on
 * from that surah once it is here.
 */
let listenStopsAt: { surah: number; afterId: string | null } | null = null;
/** Where the last `buildClipTracks` stopped short, and after which track. */
let lastBuildStop: { surah: number; afterId: string | null } | null = null;
/** The last ayah track the player made current. */
let lastActiveId: string | null = null;

/**
 * Arm the stop once the tracks are really in the player, never before: a
 * reset raises a "stopped" of its own, and it can land after the new queue.
 * `fallbackAfter` is the queue's last track when this build added none.
 */
function armListenStop(fallbackAfter: string | null): void {
  const stop = lastBuildStop;
  lastBuildStop = null;
  if (!stop || !listening) return;
  listenStopsAt = { surah: stop.surah, afterId: stop.afterId ?? fallbackAfter };
  // Nothing past the hole is queued: the listen ends there.
  listenCursor = null;
}

async function stoppedAtMissingSurah(): Promise<void> {
  const stop = listenStopsAt;
  // Only the stop that comes from playing up to the hole: the track that
  // finished is the last one before it.
  if (stop == null || stop.afterId == null || stop.afterId !== lastActiveId) return;
  const surah = stop.surah;
  listenStopsAt = null;
  const reciterId = status.reciterId;
  const at = { surah, ayah: 1 };
  const missing = await firstMissingSurah(reciterId, [at]);
  if (!missing) return;
  endListening();
  showBlocked(reciterId, at, missing, () => listenFrom(surah, 1));
}

/**
 * A scrub on the lock screen, the notification or a watch.
 *
 * The system's bar is the FILE's, and for a whole-surah recitation the
 * file is the surah: a drag lands anywhere in it. Inside the ayah being
 * played, that is where it plays from. In another ayah that is queued, the
 * player goes to that ayah, there, so the highlight follows. Anywhere else
 * — before the range, past it — it stays in this ayah, at the nearer end.
 */
export async function seekInRecitation(position: number): Promise<void> {
  await ensureSetup();
  const snap = await snapshotQueue();
  const track = snap?.queue[snap.idx];
  const end = clipEndOf(track);
  if (!snap || !track || end == null) {
    await TrackPlayer.seekTo(Math.max(0, position));
    return;
  }
  const start = startOf(track);
  if (position >= start && position < end) {
    await TrackPlayer.seekTo(position);
    return;
  }
  const holds = (t: Track) =>
    !isRestTrack(t) &&
    t.url === track.url &&
    position >= startOf(t) &&
    position < (clipEndOf(t) ?? -1);
  // The nearest such ayah to here: a drill holds the same one many times.
  let found = -1;
  for (let d = 1; d < snap.queue.length && found < 0; d++) {
    if (snap.idx + d < snap.queue.length && holds(snap.queue[snap.idx + d])) found = snap.idx + d;
    else if (snap.idx - d >= 0 && holds(snap.queue[snap.idx - d])) found = snap.idx - d;
  }
  if (found >= 0) {
    await TrackPlayer.skip(found, position);
    return;
  }
  await TrackPlayer.seekTo(Math.min(Math.max(position, start), end - 0.05));
}

/**
 * Skip to a queue entry: a clip at its own start (MusicService.jumpTo in
 * the track-player patch; the clip's initial time on iOS), every other
 * track exactly as the player always skipped — no position passed, so the
 * proven path for a file per ayah is the one it runs.
 */
function skipToEntry(i: number, track: Track | null | undefined): Promise<void> {
  return clipEndOf(track) != null
    ? TrackPlayer.skip(i, startOf(track))
    : TrackPlayer.skip(i);
}

/** Load `tracks` and land on the first at its own start, ready to play. */
async function addAtStart(tracks: Track[]): Promise<void> {
  await TrackPlayer.add(tracks);
  // Only a clip needs landing: a file of its own starts where it starts.
  const first = startOf(tracks[0]);
  if (clipEndOf(tracks[0]) != null && first > 0) {
    await TrackPlayer.skip(0, first).catch(() => undefined);
  }
}

/** The silent pieces to rest for after an ayah heard in `files`. */
async function restFor(
  reciter: Reciter,
  surah: number,
  files: readonly number[],
  factor: number,
): Promise<number[]> {
  try {
    const spoken = await spokenSeconds(reciter, surah, files);
    return spoken == null ? [] : restPieces(spoken * factor);
  } catch {
    return [];
  }
}

// ── Listening: past the end of a surah ───────────────────────────────
//
// The reader's flow ends where the surah does: you tapped an ayah, you
// wanted that passage. Listening does not — someone who puts Al-Baqarah on
// expects Āl-ʿImrān after it, the way any album plays into the next.
//
// The whole book is 6,236 tracks and the player is not going to hold that.
// So the queue is a WINDOW that walks forward: a couple of hundred ayahs
// ahead of where you are, topped up as it drains. `listenCursor` is the
// first ayah not yet queued, which is the only state a top-up needs.

/** Ayahs queued ahead while listening. */
const LISTEN_WINDOW = 200;
/** Top the queue up once fewer than this many remain after the active one. */
const LISTEN_REFILL_AT = 60;

let listening = false;
/** The first ayah NOT yet in the queue, or null at the end of the book. */
let listenCursor: AyahRef | null = null;
/** Monotonic, so an appended track can never reuse an id. */
let listenIndex = 0;

/** The ayah after this one, or null at 114:6. */
export function nextAyahRef(
  ref: AyahRef,
  riwayah: RiwayahId = queueRiwayah,
): AyahRef | null {
  if (!findSurah(ref.surah)) return null;
  if (ref.ayah < ayahsIn(ref.surah, riwayah))
    return { surah: ref.surah, ayah: ref.ayah + 1 };
  if (ref.surah >= 114) return null;
  return { surah: ref.surah + 1, ayah: 1 };
}

/**
 * SHUFFLE IS A SURAH SHUFFLE, AND ONLY EVER COULD BE.
 *
 * Shuffling ayahs would be meaningless — worse than meaningless: the
 * Quran is ordered, an ayah is a sentence in an argument, and playing
 * 2:97 after 78:12 is not a shuffled album, it is noise. So shuffle
 * changes exactly one thing: which surah follows this one. Inside a
 * surah, nothing moves.
 *
 * A bag, not a die. Rolling 1–114 each time replays surahs before it has
 * touched most of them, which people read as broken. Every surah is heard
 * once before any is heard twice, and the bag refills when it empties.
 */
let shuffle = false;
const heard = new Set<number>();

function pickNextSurah(after: number): number {
  heard.add(after);
  if (heard.size >= 114) heard.clear();
  const left: number[] = [];
  for (let n = 1; n <= 114; n++) if (!heard.has(n) && n !== after) left.push(n);
  if (left.length === 0) return after === 114 ? 1 : after + 1;
  return left[Math.floor(Math.random() * left.length)];
}

/**
 * Whether the next surah is the next one, or any other one.
 *
 * ── WHY THIS RESHAPES THE QUEUE ──────────────────────────────────────
 *
 * The flag is consulted when the queue is EXTENDED, and a listen starts
 * with two hundred ayahs already queued in reading order. So turning
 * shuffle on mid-listen changed nothing anyone could hear: Al-Fatihah
 * ran into Al-Baqarah, then Āl-ʿImrān, exactly as before, and the first
 * shuffled surah was somewhere past ayah 200 — reported, correctly, as
 * "shuffle doesn't shuffle". The mirror case was as wrong: turning it
 * off left a shuffled tail playing.
 *
 * So the toggle re-shapes what is queued. The surah being recited is
 * left whole — an ayah is a sentence in an argument, and nothing inside
 * a surah moves — and everything queued after its last ayah is dropped
 * and rebuilt with the new step. Only while listening: a range play has
 * no next surah to shuffle.
 */
export function setShuffleSurahs(on: boolean): void {
  const was = shuffle;
  shuffle = on;
  if (!on) heard.clear();
  if (was !== on && listening) void reshapeListenTail();
}

/**
 * Drop every queued ayah past the end of the surah being recited, and
 * queue the next window from there with the current step.
 */
async function reshapeListenTail(): Promise<void> {
  try {
    const snap = await snapshotQueue();
    if (!snap || !listening) return;
    const { queue, idx } = snap;
    const active = parseTrackId(String(queue[idx]?.id ?? ''));
    if (!active) return;
    // The first queued index that belongs to another surah.
    let cut = idx + 1;
    while (cut < queue.length) {
      const ref = parseTrackId(String(queue[cut]?.id ?? ''));
      if (!ref || ref.surah !== active.surah) break;
      cut++;
    }
    // Claim the cursor before any await, like `extendListening`. It steps
    // from the last queued ayah of this surah: the next ayah if the window
    // happened to end mid-surah, otherwise the next surah — by whatever
    // rule `shuffle` now says.
    const lastKept = parseTrackId(String(queue[cut - 1]?.id ?? '')) ?? active;
    listenCursor = nextListenRef(lastKept);
    if (cut < queue.length) {
      const drop: number[] = [];
      for (let i = cut; i < queue.length; i++) drop.push(i);
      await TrackPlayer.remove(drop);
    }
    // Re-checked after the await: a stop or a new listen may have landed.
    if (!listening || !listenCursor) return;
    const { refs, cursor } = listenWindow(
      listenCursor,
      LISTEN_WINDOW,
      nextListenRef,
    );
    listenCursor = cursor;
    const tracks = await buildTracks(
      refs,
      status.reciterId,
      listenIndex,
      lastKept,
    );
    listenIndex += tracks.length;
    await TrackPlayer.add(tracks);
    armListenStop(String(queue[cut - 1]?.id ?? '') || null);
  } catch {
    // Best effort: the queue that was there keeps playing, and the next
    // top-up steps with the new flag.
  }
}

export function isShuffling(): boolean {
  return shuffle;
}

/** For tests: an empty bag and a known ordering. */
export function _resetShuffleForTests(): void {
  shuffle = false;
  heard.clear();
}

/** The step the listening queue walks with — sequential, or shuffled. */
function nextListenRef(ref: AyahRef): AyahRef | null {
  if (!findSurah(ref.surah)) return null;
  if (ref.ayah < ayahsIn(ref.surah))
    return { surah: ref.surah, ayah: ref.ayah + 1 };
  if (!shuffle) return nextAyahRef(ref);
  return { surah: pickNextSurah(ref.surah), ayah: 1 };
}

/** The next `count` ayahs from `start` inclusive, and where to resume. */
export function listenWindow(
  start: AyahRef,
  count: number,
  /** How to step. Defaults to reading order; shuffle passes its own. */
  step: (ref: AyahRef) => AyahRef | null = nextAyahRef,
): { refs: AyahRef[]; cursor: AyahRef | null } {
  const refs: AyahRef[] = [];
  let cur: AyahRef | null = start;
  while (cur && refs.length < count) {
    refs.push(cur);
    cur = step(cur);
  }
  return { refs, cursor: cur };
}

function endListening(): void {
  listenStopsAt = null;
  listening = false;
  listenCursor = null;
  listenIndex = 0;
}

/** Append the next window if the queue is running low. Best effort. */
async function extendListening({ queue, idx }: QueueSnapshot): Promise<void> {
  if (!listening || !listenCursor) return;
  try {
    const remaining = queue.length - (idx + 1);
    if (remaining >= LISTEN_REFILL_AT) return;
    const { refs, cursor } = listenWindow(
      listenCursor,
      LISTEN_WINDOW,
      nextListenRef,
    );
    if (refs.length === 0) {
      listenCursor = null;
      return;
    }
    // Claim the cursor BEFORE the await that builds the tracks: two track
    // changes in quick succession would otherwise both queue the same
    // window and play every ayah twice.
    listenCursor = cursor;
    const lastQueued = parseTrackId(String(queue[queue.length - 1]?.id ?? ''));
    const tracks = await buildTracks(
      refs,
      status.reciterId,
      listenIndex,
      lastQueued,
    );
    listenIndex += tracks.length;
    await TrackPlayer.add(tracks);
    armListenStop(String(queue[queue.length - 1]?.id ?? '') || null);
  } catch {
    // A top-up that fails leaves what is queued playing. The next track
    // change tries again.
  }
}

// ── Public controls ──────────────────────────────────────────────────

/**
 * Play from an ayah to the end of its surah (the standard "play from
 * here" listening flow). Repeat settings apply only via `playRange`.
 */
export async function playFromAyah(surah: number, ayah: number): Promise<void> {
  if (!findSurah(surah)) return;
  const riwayah = resolveRiwayah(getQuranState().prefs.riwayah);
  await playRange(
    { surah, ayah },
    { surah, ayah: ayahsIn(surah, riwayah) },
    { useRepeats: false },
  );
}

/**
 * Loop the queue, or stop looping it. Every start of something new goes
 * through here with `false`: the player keeps its repeat mode across
 * `reset()`, so a listen started after a loop would otherwise loop too.
 */
async function setLoop(on: boolean): Promise<void> {
  await TrackPlayer.setRepeatMode(on ? RepeatMode.Queue : RepeatMode.Off).catch(
    () => undefined,
  );
  setStatus({ looping: on });
}

/**
 * Play one ayah over and over, until stopped or something else is
 * played. Not the memorisation drill (`playRange` with repeats): that
 * counts, this does not — it is for sitting with an ayah.
 */
export async function playAyahOnRepeat(surah: number, ayah: number): Promise<void> {
  if (!findSurah(surah)) return;
  await ensureSetup();
  endListening();
  const prefs = getQuranState().prefs;
  // A choice that can no longer be played answers with the default voice.
  const reciterId = findReciter(prefs.reciterId).id;
  queueRiwayah = resolveRiwayah(prefs.riwayah);
  setStatus({ reciterId, loading: true, gap: null, needsDownload: null });
  const ref = { surah, ayah };
  if (
    await blockedByDownload(reciterId, [ref], () =>
      playAyahOnRepeat(surah, ayah),
    )
  ) {
    return;
  }
  const tracks = await buildTracks(expandRange(ref, ref), reciterId, 0);
  await TrackPlayer.reset();
  await addAtStart(tracks);
  await TrackPlayer.setRate(prefs.playbackRate);
  await setLoop(true);
  await TrackPlayer.play();
  setStatus({ active: ref, playing: true, resting: false });
}

/** Play an explicit range with (optionally) the memorization repeats. */
export async function playRange(
  from: AyahRef,
  to: AyahRef,
  opts: {
    useRepeats?: boolean;
    /** A voice other than the chosen one, without choosing it (a preview). */
    reciterId?: string;
  } = {},
): Promise<void> {
  await ensureSetup();
  // A deliberate range replaces a continuous listen. The two cannot both
  // be true of one queue, and the one the user just asked for wins.
  endListening();
  const prefs = getQuranState().prefs;
  // A choice that can no longer be played answers with the default voice.
  const reciterId = findReciter(opts.reciterId ?? prefs.reciterId).id;
  queueRiwayah = resolveRiwayah(prefs.riwayah);
  setStatus({ reciterId, loading: true, gap: null, needsDownload: null });
  let refs = expandRange(from, to);
  if (
    await blockedByDownload(reciterId, refs, () => playRange(from, to, opts))
  ) {
    return;
  }
  let repeating = false;
  let restFactor = 0;
  if (opts.useRepeats !== false) {
    const { eachAyah, range, pauseFactor } = prefs.repeat;
    refs = applyRepeats(refs, eachAyah, range);
    repeating = eachAyah > 1;
    // Only a drill rests: a range heard once is a listen.
    if (eachAyah > 1 || range > 1) restFactor = Math.max(0, pauseFactor || 0);
  }
  const tracks = await buildTracks(
    refs,
    reciterId,
    0,
    null,
    repeating,
    restFactor,
  );
  await TrackPlayer.reset();
  await setLoop(false);
  await addAtStart(tracks);
  await TrackPlayer.setRate(prefs.playbackRate);
  await TrackPlayer.play();
  setStatus({ active: from, playing: true, resting: false });
}

/**
 * Hear a voice before choosing it: al-Fātiḥah, from the reciter picker.
 * The same for every reciter — streamed or from the device, a whole-surah
 * recitation checked exactly as any of its surahs would be — and the
 * chosen reciter is left as it was.
 */
export async function previewReciter(reciterId: string): Promise<void> {
  const reading = resolveRiwayah(getQuranState().prefs.riwayah);
  await playRange(
    { surah: 1, ayah: 1 },
    { surah: 1, ayah: ayahsIn(1, reading) },
    { useRepeats: false, reciterId },
  );
}

/** Whether this voice's preview is what is playing (or loading). */
export function isPreviewing(st: PlaybackStatus, reciterId: string): boolean {
  return (
    st.reciterId === reciterId &&
    st.active?.surah === 1 &&
    (st.playing || st.loading) &&
    getQuranState().prefs.reciterId !== reciterId
  );
}

export async function pausePlayback(): Promise<void> {
  await ensureSetup();
  await TrackPlayer.pause();
}

export async function resumePlayback(): Promise<void> {
  // Play pressed on a card that is waiting for a download: ask again for
  // what was asked for, which plays if the download has come in since and
  // says so again if it has not.
  if (status.needsDownload && blockedStart) {
    await blockedStart();
    return;
  }
  await ensureSetup();
  await TrackPlayer.play();
}

/**
 * Listen from here to the end of the book.
 *
 * Starts at an ayah — normally the first of a surah, but the listening
 * page also resumes mid-surah — and keeps going: when the queue runs low
 * the next window is appended, surah after surah, to 114:6.
 *
 * The memorisation repeats are deliberately NOT applied. They belong to
 * the range player, where you asked for an ayah five times on purpose;
 * applying them to a continuous listen would turn an evening's recitation
 * into the same page over and over.
 */
export async function listenFrom(
  surah: number,
  ayah: number = 1,
): Promise<void> {
  if (!findSurah(surah)) return;
  await ensureSetup();
  const prefs = getQuranState().prefs;
  // A choice that can no longer be played answers with the default voice.
  const reciterId = findReciter(prefs.reciterId).id;
  queueRiwayah = resolveRiwayah(prefs.riwayah);
  // A new listen: whatever the last one stopped short of is not this one's.
  listenStopsAt = null;
  setStatus({ reciterId, loading: true, gap: null, needsDownload: null });
  const start = { surah, ayah: Math.max(1, Math.min(ayahsIn(surah), ayah)) };
  if (
    await blockedByDownload(reciterId, [start], () => listenFrom(surah, ayah))
  ) {
    return;
  }
  // The preference is the record; the screen pushes it on mount, but a
  // listen started from the notification or a widget may never have had
  // the screen open. Read it here so the first window is already shaped.
  shuffle = prefs.shuffleSurahs;
  const { refs, cursor } = listenWindow(start, LISTEN_WINDOW, nextListenRef);
  const tracks = await buildTracks(refs, reciterId, 0);
  await TrackPlayer.reset();
  await setLoop(false);
  await addAtStart(tracks);
  await TrackPlayer.setRate(prefs.playbackRate);
  await TrackPlayer.play();
  // Armed only once the queue is really in the player: an `extendListening`
  // that ran against the OLD queue would top up something we are about to
  // reset.
  listening = true;
  listenCursor = cursor;
  listenIndex = tracks.length;
  armListenStop(null);
  recordListened({ ...start, riwayah: queueRiwayah }, reciterId);
  setStatus({ active: start, playing: true, resting: false });
}

/** Is a continuous listen the thing that is playing? */
export function isListening(): boolean {
  return listening;
}

/**
 * The next surah, and the previous one.
 *
 * The transport's big arrows move by SURAH, not by ayah. An ayah is six
 * seconds: a "next" that advanced by one was a control you had to press
 * two hundred times to leave Al-Baqarah, and the thing people reach for
 * when a recitation is playing is the next surah. Ayah stepping is still
 * there, on its own smaller pair — see the screen.
 *
 * Previous restarts the current surah unless you are already at its
 * beginning, which is what every music player does with a track and what
 * makes the button useful twice: once to start this one again, twice to
 * leave it.
 */
export async function listenNextSurah(): Promise<void> {
  const current = status.active?.surah ?? 0;
  // Shuffle owns "next" too: the arrow going to N+1 while the queue was
  // going to draw from the bag was the other half of "shuffle doesn't
  // shuffle". The bag is the same one the queue draws from, so a surah
  // skipped past still counts as heard.
  if (shuffle && current > 0) {
    await listenFrom(pickNextSurah(current), 1);
    return;
  }
  if (current >= 114) return;
  await listenFrom(Math.max(1, current) + (current === 0 ? 0 : 1), 1);
}

export async function listenPreviousSurah(): Promise<void> {
  const current = status.active?.surah ?? 1;
  const ayah = status.active?.ayah ?? 1;
  if (ayah > 1) {
    await listenFrom(current, 1);
    return;
  }
  await listenFrom(Math.max(1, current - 1), 1);
}

export async function stopPlayback(): Promise<void> {
  endListening();
  blockedStart = null;
  if (status.needsDownload) setStatus({ active: null, needsDownload: null });
  if (!setupPromise) return; // never started — nothing to stop
  await TrackPlayer.reset();
  await setLoop(false);
  setStatus({ active: null, playing: false, loading: false });
}

/**
 * Move within the ayah being recited. For an ayah cut from a surah file,
 * `seconds` is into the AYAH — what the progress bar showed
 * (useProgressWhileActive) — and stays inside it.
 */
export async function seekTo(seconds: number): Promise<void> {
  await ensureSetup();
  const clip = status.clip;
  const to = clip
    ? Math.min(clip.end - 0.05, clip.start + Math.max(0, seconds))
    : Math.max(0, seconds);
  await TrackPlayer.seekTo(to);
  void seams.watchSeam();
}

/**
 * The ayah buttons step by AYAH, which is not always by track: an ayah
 * the Madani count makes of two Ḥafṣ ayahs is two files in a row
 * (`buildTracks`), and "next" from its first half means the ayah after
 * it, not its second half. A track continues the one before it when both
 * are the same ayah and its file is the next one up; a repeat of the
 * ayah starts again from its first file, and so starts a new step.
 */
function continuesPrevious(queue: Track[], i: number): boolean {
  // A drill's rest between them makes two tracks two steps (and a rest is
  // not an ayah: `parseTrackId` below reads it as nothing).
  if (i <= 0) return false;
  const a = parseTrackId(String(queue[i - 1]?.id ?? ''));
  const b = parseTrackId(String(queue[i]?.id ?? ''));
  if (!a || !b || a.surah !== b.surah || a.ayah !== b.ayah) return false;
  const fa = fileAyahOf(queue[i - 1]);
  const fb = fileAyahOf(queue[i]);
  return fa != null && fb != null && fb === fa + 1;
}

/** The first track of the ayah the track at `idx` belongs to. */
function stepStart(queue: Track[], idx: number): number {
  let i = idx;
  while (continuesPrevious(queue, i)) i--;
  return i;
}

/**
 * A drill's rests are stepped over both ways: "next" from an ayah is the
 * next ayah, not the silence after it, and a rest belongs to the ayah
 * before it — "previous" during one goes where it would from that ayah.
 */
export async function skipToNextAyah(): Promise<void> {
  await ensureSetup();
  const snap = await snapshotQueue();
  if (!snap) return;
  const { queue, idx } = snap;
  let i = idx + 1;
  while (
    i < queue.length &&
    (isRestTrack(queue[i]) || continuesPrevious(queue, i))
  ) {
    i++;
  }
  if (i >= queue.length) return; // end of queue
  await skipToEntry(i, queue[i]).catch(() => undefined);
}

export async function skipToPreviousAyah(): Promise<void> {
  await ensureSetup();
  const snap = await snapshotQueue();
  if (!snap) return;
  const { queue, idx } = snap;
  let k = idx;
  while (k > 0 && isRestTrack(queue[k])) k--;
  const here = stepStart(queue, k);
  let j = here - 1;
  while (j >= 0 && isRestTrack(queue[j])) j--;
  if (j < 0) return;
  const to = stepStart(queue, j);
  await skipToEntry(to, queue[to]).catch(() => undefined);
}

export async function setPlaybackRate(rate: number): Promise<void> {
  await ensureSetup();
  await TrackPlayer.setRate(rate);
  void seams.watchSeam();
}

/** Ordered list of surahs — re-exported for pickers. */
export { SURAHS };
