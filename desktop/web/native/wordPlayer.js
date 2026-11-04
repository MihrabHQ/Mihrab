/* eslint-env browser */
/**
 * The word reader's player on the desktop and in the browser — one slice of
 * an ayah's recording, played and stopped.
 *
 * The phones have a native WordPlayer beside the recitation's queue; here
 * there was none, so `WordPlayer.play` answered false at once and holding a
 * word lit it and read nothing. This is the same contract on an <audio>
 * element of its own (never the recitation's, which the hold has paused):
 * load the ayah's file, seek to the word, play, stop at its end.
 *
 * The end is watched every animation frame, not by `timeupdate` alone —
 * that fires about four times a second, which would let a quarter of a
 * second of the next word through. A newer `play` or a `stop` ends the one
 * in progress, which answers false, as the native players do.
 */
import { mediaUrl } from '../shims/desktop';

let audio = null;
/** The slice playing now: its settle function and its frame loop. */
let current = null;

function element() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}

function finish(result) {
  const c = current;
  if (!c) return;
  current = null;
  if (c.frame != null) cancelAnimationFrame(c.frame);
  clearTimeout(c.guard);
  for (const [type, fn] of c.listeners) element().removeEventListener(type, fn);
  try {
    element().pause();
  } catch {
    // nothing to pause
  }
  c.resolve(result);
}

/** Resolves once `a` can be seeked: metadata loaded. */
function ready(a, c) {
  if (a.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => resolve();
    const bad = () => reject(new Error('load'));
    c.listeners.push(['loadedmetadata', ok], ['error', bad]);
    a.addEventListener('loadedmetadata', ok, { once: true });
    a.addEventListener('error', bad, { once: true });
  });
}

/** Resolves once a seek to `t` has landed. */
function seekTo(a, t, c) {
  if (Math.abs(a.currentTime - t) < 0.005) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => resolve();
    c.listeners.push(['seeked', done]);
    a.addEventListener('seeked', done, { once: true });
    a.currentTime = t;
  });
}

export const WordPlayer = {
  play(path, startMs, endMs) {
    finish(false);
    const a = element();
    const start = Math.max(0, startMs / 1000);
    const end = endMs / 1000;
    return new Promise(resolve => {
      const c = { resolve, listeners: [], frame: null, guard: null };
      current = c;
      // However the media misbehaves, the hold is never left waiting.
      c.guard = setTimeout(() => current === c && finish(false), Math.max(0, endMs - startMs) + 8000);
      const src = mediaUrl(path);
      if (a.getAttribute('src') !== src) {
        a.setAttribute('src', src);
        a.load();
      }
      a.playbackRate = 1;
      ready(a, c)
        .then(() => (current === c ? seekTo(a, start, c) : null))
        .then(() => {
          if (current !== c) return;
          const watch = () => {
            if (current !== c) return;
            if (a.currentTime >= end || a.ended) {
              finish(true);
              return;
            }
            c.frame = requestAnimationFrame(watch);
          };
          const onError = () => finish(false);
          c.listeners.push(['error', onError], ['ended', () => finish(true)]);
          a.addEventListener('error', onError);
          a.addEventListener('ended', c.listeners[c.listeners.length - 1][1]);
          return a.play().then(
            () => {
              c.frame = requestAnimationFrame(watch);
            },
            () => finish(false),
          );
        })
        .catch(() => finish(false));
    });
  },
  stop() {
    finish(false);
    return Promise.resolve(true);
  },
};
