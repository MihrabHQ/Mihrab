/**
 * react-native-track-player on the desktop: one <audio> element and a queue.
 *
 * Covers what src/quran/audio uses — a queue of ayah tracks, play/pause/
 * seek/rate/skip, the state and track-change events, useProgress — and
 * wires the OS media keys through the Media Session API, which Electron
 * maps to the Windows media overlay and Linux MPRIS.
 */
import { useEffect, useState } from 'react';
import { mediaUrl } from './desktop';

export const Event = {
  PlayerError: 'player-error',
  PlaybackState: 'playback-state',
  PlaybackError: 'playback-error',
  PlaybackQueueEnded: 'playback-queue-ended',
  PlaybackTrackChanged: 'playback-track-changed',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackProgressUpdated: 'playback-progress-updated',
  PlaybackPlayWhenReadyChanged: 'playback-play-when-ready-changed',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  RemoteNext: 'remote-next',
  RemotePrevious: 'remote-previous',
  RemoteSeek: 'remote-seek',
  RemoteDuck: 'remote-duck',
  RemoteJumpForward: 'remote-jump-forward',
  RemoteJumpBackward: 'remote-jump-backward',
};
export const State = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Loading: 'loading',
  Connecting: 'loading',
  Buffering: 'buffering',
  Error: 'error',
  Ended: 'ended',
};
export const Capability = {
  Play: 0, PlayFromId: 1, PlayFromSearch: 2, Pause: 3, Stop: 4, SeekTo: 5, Skip: 6,
  SkipToNext: 7, SkipToPrevious: 8, JumpForward: 9, JumpBackward: 10, SetRating: 11,
  Like: 12, Dislike: 13, Bookmark: 14,
};
export const AppKilledPlaybackBehavior = {
  ContinuePlayback: 'continue-playback',
  PausePlayback: 'pause-playback',
  StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
};
export const RepeatMode = { Off: 0, Track: 1, Queue: 2 };
export const IOSCategory = {};
export const IOSCategoryMode = {};
export const IOSCategoryOptions = {};
export const AndroidAudioContentType = {};
export const TrackType = { Default: 'default', Dash: 'dash', HLS: 'hls', SmoothStreaming: 'smoothstreaming' };
export const PitchAlgorithm = {};
export const RatingType = {};

const listeners = new Map();
function emit(type, payload) {
  for (const fn of listeners.get(type) ?? []) {
    try {
      fn(payload);
    } catch (e) {
      console.error('[track-player]', e);
    }
  }
}

let audio = null;
let queue = [];
let index = -1;
let state = State.None;
let rate = 1;

function setState(next) {
  if (state === next) return;
  state = next;
  emit(Event.PlaybackState, { state });
}

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('playing', () => setState(State.Playing));
  audio.addEventListener('pause', () => {
    if (!audio.ended) setState(State.Paused);
  });
  audio.addEventListener('waiting', () => setState(State.Buffering));
  audio.addEventListener('ended', () => {
    if (index + 1 < queue.length) {
      load(index + 1, true);
    } else {
      setState(State.Ended);
      emit(Event.PlaybackQueueEnded, { track: index, position: audio.currentTime });
    }
  });
  audio.addEventListener('error', () => {
    setState(State.Error);
    emit(Event.PlaybackError, { code: 'playback-error', message: audio.error?.message ?? 'playback failed' });
  });
  return audio;
}

function load(i, autoplay) {
  const a = element();
  const lastIndex = index;
  const lastTrack = queue[lastIndex];
  index = i;
  const track = queue[i];
  if (!track) return;
  a.src = mediaUrl(track.url);
  a.playbackRate = rate;
  setState(State.Loading);
  emit(Event.PlaybackActiveTrackChanged, {
    lastIndex: lastIndex >= 0 ? lastIndex : undefined,
    lastTrack,
    lastPosition: 0,
    index: i,
    track,
  });
  updateMediaSession(track);
  if (autoplay) void a.play().catch(() => setState(State.Paused));
  else setState(State.Ready);
}

function updateMediaSession(track) {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (!ms || typeof MediaMetadata === 'undefined') return;
  ms.metadata = new MediaMetadata({
    title: track.title ?? '',
    artist: track.artist ?? '',
    album: track.album ?? 'Mihrab',
  });
}

function bindMediaKeys() {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (!ms) return;
  const set = (action, fn) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      // Unsupported action on this platform.
    }
  };
  set('play', () => emit(Event.RemotePlay, {}));
  set('pause', () => emit(Event.RemotePause, {}));
  set('stop', () => emit(Event.RemoteStop, {}));
  set('nexttrack', () => emit(Event.RemoteNext, {}));
  set('previoustrack', () => emit(Event.RemotePrevious, {}));
  set('seekto', d => emit(Event.RemoteSeek, { position: d.seekTime }));
}

const TrackPlayer = {
  async setupPlayer() {
    element();
    bindMediaKeys();
  },
  registerPlaybackService(factory) {
    // The service is what answers the remote events; start it right away.
    Promise.resolve()
      .then(() => factory()())
      .catch(e => console.error('[track-player] service', e));
  },
  async updateOptions() {},
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return { remove: () => listeners.get(type)?.delete(fn) };
  },
  async add(tracks, insertBeforeIndex) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    if (insertBeforeIndex == null || insertBeforeIndex < 0 || insertBeforeIndex >= queue.length) {
      queue.push(...list);
    } else {
      queue.splice(insertBeforeIndex, 0, ...list);
      if (insertBeforeIndex <= index) index += list.length;
    }
    if (index < 0 && queue.length > 0) load(0, false);
    return queue.length - 1;
  },
  async remove(indexes) {
    const drop = new Set(Array.isArray(indexes) ? indexes : [indexes]);
    const current = queue[index];
    queue = queue.filter((_, i) => !drop.has(i));
    index = current ? queue.indexOf(current) : -1;
  },
  async reset() {
    queue = [];
    index = -1;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setState(State.None);
  },
  async play() {
    if (index < 0 && queue.length) load(0, false);
    await element().play().catch(() => undefined);
  },
  async pause() {
    audio?.pause();
  },
  async stop() {
    audio?.pause();
    if (audio) audio.currentTime = 0;
    setState(State.Stopped);
  },
  async seekTo(seconds) {
    if (audio) audio.currentTime = seconds;
  },
  async seekBy(offset) {
    if (audio) audio.currentTime = Math.max(0, audio.currentTime + offset);
  },
  async setRate(r) {
    rate = r;
    if (audio) audio.playbackRate = r;
  },
  async getRate() {
    return rate;
  },
  async setVolume(v) {
    element().volume = v;
  },
  async skip(i, initialPosition) {
    load(i, state === State.Playing);
    if (initialPosition && audio) audio.currentTime = initialPosition;
  },
  async skipToNext() {
    if (index + 1 < queue.length) load(index + 1, state === State.Playing || state === State.Buffering);
  },
  async skipToPrevious() {
    if (index > 0) load(index - 1, state === State.Playing || state === State.Buffering);
  },
  async getActiveTrackIndex() {
    return index >= 0 ? index : undefined;
  },
  async getActiveTrack() {
    return queue[index];
  },
  async getTrack(i) {
    return queue[i];
  },
  async getQueue() {
    return [...queue];
  },
  async getPlaybackState() {
    return { state };
  },
  async getProgress() {
    return progressNow();
  },
  async setRepeatMode() {},
  async getRepeatMode() {
    return RepeatMode.Off;
  },
};

function progressNow() {
  const a = audio;
  if (!a) return { position: 0, duration: 0, buffered: 0 };
  const duration = Number.isFinite(a.duration) ? a.duration : 0;
  const buffered = a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0;
  return { position: a.currentTime, duration, buffered };
}

export function useProgress(updateInterval = 1000) {
  const [p, setP] = useState(progressNow);
  useEffect(() => {
    const t = setInterval(() => setP(progressNow()), updateInterval);
    return () => clearInterval(t);
  }, [updateInterval]);
  return p;
}

export function usePlaybackState() {
  const [s, setS] = useState({ state });
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackState, e => setS({ state: e.state }));
    return () => sub.remove();
  }, []);
  return s;
}

export function useActiveTrack() {
  const [t, setT] = useState(queue[index]);
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, e => setT(e.track));
    return () => sub.remove();
  }, []);
  return t;
}

export default TrackPlayer;
