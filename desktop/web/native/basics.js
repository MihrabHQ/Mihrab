/**
 * The small native modules: constants and one-liners the phones answer
 * natively, answered here from the preload's app info or the browser.
 */
import { desktop } from '../shims/desktop';

const info = () => desktop()?.app.info ?? { version: '0.0.0', platform: 'web', locale: navigator.language };

export const AppVersion = {
  get versionName() {
    return info().version;
  },
  get buildNumber() {
    return String(info().buildNumber ?? '');
  },
  getConstants() {
    return { versionName: this.versionName, buildNumber: this.buildNumber };
  },
};

export const PrayerBuildInfo = {
  distribution: 'desktop',
  getConstants: () => ({ distribution: 'desktop' }),
};

export const SecureRandom = {
  async bytes(count) {
    const buf = new Uint8Array(count);
    crypto.getRandomValues(buf);
    let s = '';
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  },
};

export const MihrabClipboard = {
  async setString(text) {
    const d = desktop();
    if (d) await d.clipboard.write(text);
    else await navigator.clipboard.writeText(text);
    return true;
  },
  async getString() {
    const d = desktop();
    return d ? d.clipboard.read() : navigator.clipboard.readText();
  },
};

/** Whether the OS clock shows 24-hour time, read from its own formatter. */
function reads24Hour() {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    if (typeof parts.hourCycle === 'string') return parts.hourCycle === 'h23' || parts.hourCycle === 'h24';
    return parts.hour12 === false;
  } catch {
    return null;
  }
}

export const SystemClock = {
  get is24Hour() {
    return reads24Hour();
  },
  getConstants: () => ({ is24Hour: reads24Hour() }),
  readIs24Hour: async () => reads24Hour(),
};

export const I18nManager = {
  get localeIdentifier() {
    const i = info();
    return (i.preferredLanguages && i.preferredLanguages[0]) || i.locale || navigator.language;
  },
};

export const RateApp = {
  requestReview() {
    void desktop()?.app.openExternal('https://github.com/Hassan-PS/Mihrab');
  },
};
