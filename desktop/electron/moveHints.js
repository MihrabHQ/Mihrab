/**
 * "Update my location in the background" on Windows and Linux: when to
 * look again.
 *
 * A phone is woken by its OS for a move. A computer is not, but Mihrab is
 * usually running all the same — in the tray, started at login
 * (background.js) — and the page is alive with its window hidden. What it
 * lacked was a reason to look: it asked for the position only when the
 * window came to the front, so after a journey the adhan went on playing
 * at the old city's times until the window was opened.
 *
 * So the main process watches for the signs that a computer may have been
 * carried somewhere, and tells the page, which asks for the position and
 * moves "My location" when it is twenty kilometres or more away — the
 * phones' own steps (`locationMovedTask`). The signs:
 *
 *   - waking from sleep, and the screen unlocked (the lid shut for the
 *     journey and opened at the other end);
 *   - another network: the computer's addresses change.
 *
 * A new time zone is the page's to see (its clock is told; this process's
 * is not): `desktop/web/native/backgroundLocation.js`.
 *
 * Only while the reader has the setting on (`location:setWatching`, sent
 * by the page whenever it changes), and at most once in ten minutes: the
 * position costs little, but nothing is asked for that cannot be news.
 */
const os = require('os');
const { ipcMain, powerMonitor } = require('electron');

const MIN_GAP_MS = 10 * 60_000;
// After a wake the network and the location service need a moment.
const AFTER_WAKE_MS = 20_000;
const AFTER_UNLOCK_MS = 5_000;
// A new network: its address is given within seconds, settled after a few more.
const AFTER_NETWORK_MS = 15_000;
const NETWORK_POLL_MS = 60_000;

let watching = false;
let lastSent = 0;
let pending = null;

/** The computer's own addresses on the networks it is on — not loopback, not link-local. */
function networkFingerprint() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.internal) continue;
      if (a.family === 'IPv6' && /^fe80:/i.test(a.address)) continue;
      out.push(`${name}=${a.address}`);
    }
  }
  return out.sort().join(',');
}

function register(getWindow) {
  const send = reason => {
    if (!watching) return;
    const now = Date.now();
    if (now - lastSent < MIN_GAP_MS) return;
    const w = getWindow();
    if (!w || w.isDestroyed()) return;
    lastSent = now;
    w.webContents.send('location:hint', reason);
  };
  const later = (reason, ms) => {
    if (!watching) return;
    clearTimeout(pending);
    pending = setTimeout(() => send(reason), ms);
  };

  ipcMain.handle('location:setWatching', (_e, on) => {
    watching = !!on;
    if (!watching) clearTimeout(pending);
    return watching;
  });

  powerMonitor.on('resume', () => later('wake', AFTER_WAKE_MS));
  powerMonitor.on('unlock-screen', () => later('unlock', AFTER_UNLOCK_MS));

  let network = networkFingerprint();
  setInterval(() => {
    const now = networkFingerprint();
    if (now === network) return;
    network = now;
    // No network at all is not a place; the one after it is.
    if (now) later('network', AFTER_NETWORK_MS);
  }, NETWORK_POLL_MS).unref?.();
}

module.exports = { register, networkFingerprint };
