/**
 * "Update my location in the background" in the Windows and Linux app (a
 * preview): the main process says when the computer may have been moved
 * (desktop/electron/moveHints.js), the page asks for one position and hands
 * it to the app's own steps for a move (`locationMovedTask`), as a phone does.
 */
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(root, ...p), 'utf8');
const hints = read('desktop/electron/moveHints.js');
const page = read('desktop/web/native/backgroundLocation.js');

describe('background location in the desktop app', () => {
  it('looks again on a wake, an unlock and another network — only while the setting is on', () => {
    expect(hints).toContain("powerMonitor.on('resume', () => later('wake', AFTER_WAKE_MS));");
    expect(hints).toContain("powerMonitor.on('unlock-screen', () => later('unlock', AFTER_UNLOCK_MS));");
    expect(hints).toMatch(/if \(now\) later\('network', AFTER_NETWORK_MS\);/);
    expect(hints).toMatch(/const send = reason => \{\s+if \(!watching\) return;/);
    expect(hints).toMatch(/MIN_GAP_MS = 10 \* 60_000/);
    expect(read('desktop/electron/main.js')).toContain('moveHints.register(() => win);');
  });

  it('a new time zone is seen by the page, whose clock is told', () => {
    expect(page).toMatch(/zoneTimer = setInterval\(\(\) => \{\s+const now = zoneNow\(\);\s+if \(now === zone\) return;\s+zone = now;\s+void look\(\);/);
  });

  it('hands one position over as the phones do, and the app decides whether it is a move', () => {
    expect(page).toMatch(/DeviceEventEmitter\.emit\('BackgroundLocationMoved', \{\s+latitude: p\.coords\.latitude,\s+longitude: p\.coords\.longitude,\s+timestamp: p\.timestamp,/);
    expect(page).toContain('enableHighAccuracy: false');
    const ts = read('src/native/BackgroundLocation.ts');
    expect(ts).toMatch(/if \(\(Platform\.OS !== 'ios' && Platform\.OS !== 'web'\) \|\| !native\) return \(\) => \{\};/);
  });

  it('the desktop app only — Mihrab Web is not running when its tab is closed', () => {
    expect(read('desktop/web/native/install.js')).toContain('...(desktop()?.location ? { BackgroundLocation } : null),');
  });

  it('turning it on asks the computer for a position first, and is off without one', () => {
    const js = read('src/location/backgroundLocation.ts');
    expect(js).toMatch(/if \(Platform\.OS === 'web'\) \{[\s\S]{0,300}if \(!\(await probeBackgroundPosition\(\)\)\) return 'declined';\s+await AsyncStorage\.setItem\(WISH_KEY, '1'\)/);
  });
});

describe('the desktop watcher', () => {
  jest.resetModules();
  jest.doMock('electron', () => ({ ipcMain: { handle: jest.fn() }, powerMonitor: { on: jest.fn() } }), { virtual: true });
  const { networkFingerprint } = require('../desktop/electron/moveHints.js');
  const os = require('os');

  it('a network is the computer’s own addresses, not loopback or link-local', () => {
    const spy = jest.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      wlan0: [
        { address: '192.168.1.20', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
    });
    expect(networkFingerprint()).toBe('wlan0=192.168.1.20');
    spy.mockRestore();
  });
});
