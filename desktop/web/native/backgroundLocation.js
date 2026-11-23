/**
 * BackgroundLocation on Windows and Linux — the phones' module, with the
 * same calls (`src/native/BackgroundLocation.ts`), so the app's own steps
 * for a move (`locationMovedTask`) run here unchanged.
 *
 * The computer is not woken for a move as a phone is; Mihrab is simply
 * running, usually in the tray. The main process says when it may have
 * been moved — a wake, an unlock, another network (electron/moveHints.js)
 * — and this page sees a new time zone itself, its clock being the one
 * that is told. Then the position is asked for once, at the location
 * service's own accuracy (Windows' location service; on Linux usually
 * none, and then nothing happens), and handed to the app as the phones
 * hand theirs: `BackgroundLocationMoved`. Whether it is a move — twenty
 * kilometres or more from "My location" — is the app's to decide.
 *
 * Turning it on asks for a position first (`probe`): a computer that will
 * not give one says so then (the setting stays off and says where location
 * is allowed), not on the evening after a journey.
 */
import { DeviceEventEmitter } from 'react-native-web/dist/index';
import { desktop } from '../shims/desktop';

const ZONE_POLL_MS = 60_000;

let enabled = false;
let stopHints = null;
let zoneTimer = null;

const geo = () => (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

function position(maximumAge) {
  return new Promise((resolve, reject) => {
    const g = geo();
    if (!g) return reject(new Error('no location service'));
    g.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 60_000, maximumAge });
  });
}

let asking = false;
async function look() {
  if (!enabled || asking) return;
  asking = true;
  try {
    const p = await position(5 * 60_000);
    if (!enabled) return;
    DeviceEventEmitter.emit('BackgroundLocationMoved', {
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      timestamp: p.timestamp,
    });
  } catch {
    // No position now (no service, not allowed, indoors): the next sign
    // asks again, and the window asks when it is opened.
  } finally {
    asking = false;
  }
}

const zoneNow = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
};

function watch(on) {
  stopHints?.();
  stopHints = null;
  clearInterval(zoneTimer);
  zoneTimer = null;
  const d = desktop();
  void d?.location?.setWatching(on);
  if (!on) return;
  stopHints = d?.location?.onHint(() => void look()) ?? null;
  let zone = zoneNow();
  zoneTimer = setInterval(() => {
    const now = zoneNow();
    if (now === zone) return;
    zone = now;
    void look();
  }, ZONE_POLL_MS);
}

export const BackgroundLocation = {
  async status() {
    return { offered: !!geo(), enabled, permitted: !!geo() };
  },
  /** Whether this computer gives a position at all: asked when the reader turns it on. */
  async probe() {
    try {
      await position(10 * 60_000);
      return true;
    } catch {
      return false;
    }
  },
  async setEnabled(on) {
    enabled = !!on;
    watch(enabled);
    return enabled;
  },
  // The app compares every position with "My location" itself.
  setPlace() {},
  confirmPlace() {},
  async takePending() {
    return null;
  },
  finish() {},
  // NativeEventEmitter asks these of a module; the events go through
  // DeviceEventEmitter, which is what it subscribes to.
  addListener() {},
  removeListeners() {},
};
