/**
 * Plays a notification's own sound — the adhan — when the main process
 * delivers it. Sounds are named the way the phones name them
 * ("adhan_makkah", "adhan_makkah.caf", a custom file's path); all resolve
 * to the bundled mp3s or the user's imported file.
 */
import { desktop } from '../shims/desktop';

let current = null;

export function stopNotificationSound() {
  if (current) {
    current.pause();
    current = null;
  }
}

export function isNotificationSoundPlaying() {
  return Boolean(current && !current.paused);
}

export async function playNotificationSound(sound) {
  const d = desktop();
  if (!d || !sound || sound === 'default') return;
  let url;
  if (sound.startsWith('/') || /^[A-Za-z]:[\\/]/.test(sound)) {
    url = d.fs.fileUrl(sound);
  } else {
    const base = sound.replace(/\.(caf|mp3|wav|m4a|ogg)$/i, '');
    url = d.fs.fileUrl(`${d.fs.dirs.bundle}/sounds/${base}.mp3`);
  }
  stopNotificationSound();
  const a = new Audio(url);
  current = a;
  a.addEventListener('ended', () => {
    if (current === a) current = null;
  });
  try {
    await a.play();
  } catch (e) {
    console.warn('[mihrab] could not play notification sound', sound, e);
  }
}

// "Stop the adhan" in the tray menu.
desktop()?.app.onAdhanStop(() => stopNotificationSound());
