/**
 * Full-screen alerts on in the app and off in the system: Today says so.
 *
 * Android's "Full-screen notifications" can be switched off for an app at
 * any time, and then a prayer's alert arrives as an ordinary notification
 * while the app's own switch still reads on. The one place that said so
 * was a row under that switch, in Settings → Notifications. A phone had it
 * off for three days and the first sign was a Dhuhr that did not fill the
 * screen (2026-11-25).
 */
import fs from 'fs';
import path from 'path';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: { accentBg: '#EEEEEE', card: '#FFFFFF', border: '#DDDDDD', text: '#111111', muted: '#777777', accent: '#2E7D5B', accentSolid: '#2E7D5B' },
    isDark: false,
  }),
}));
const mockOpen = jest.fn(async () => {});
jest.mock('../src/native/FullScreenAlarm', () => ({
  openFullScreenAlarmSettings: () => mockOpen(),
  canUseFullScreenAlarm: async () => false,
  fullScreenAlarmAvailable: true,
}));

import { PermissionBanners, permissionBannersShown } from '../src/screens/home/PermissionBanners';

const base = {
  usingLocalFallback: false,
  exactAlarmDenied: false,
  notifPermDenied: false,
  onRetryFetch: () => {},
};

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAll(n => typeof n.type === 'string' && (n.type as string) === 'Text')
    .map(n => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join(' | ');
}

describe('the notice on Today', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
    mockOpen.mockClear();
  });

  it('counts as a notice — the page makes room for it', () => {
    expect(permissionBannersShown({ fullScreenBlocked: true })).toBe(true);
    expect(permissionBannersShown({ fullScreenBlocked: false })).toBe(false);
  });

  it('nothing is drawn when the system allows it', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<PermissionBanners {...base} fullScreenBlocked={false} />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('Android: says what is off and what happens instead, and opens the system’s switch', async () => {
    Platform.OS = 'android';
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<PermissionBanners {...base} fullScreenBlocked />);
    });
    const said = texts(tree);
    // (No translations are loaded here: a key stands for its sentence, and
    // the last test of this group holds that every language has it.)
    expect(said).toContain('settings.prayerAlertFullScreenBlocked. settings.prayerAlertFullScreenBlockedHelp');
    expect(said).toContain('common.openSettings');
    const button = tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    expect(button.length).toBeGreaterThan(0);
    await act(async () => {
      button[0].props.onPress();
    });
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('iPhone: the words for alarms there', async () => {
    Platform.OS = 'ios';
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<PermissionBanners {...base} fullScreenBlocked />);
    });
    expect(texts(tree)).toContain('settings.prayerAlertFullScreenBlockedHelpIos');
    expect(texts(tree)).not.toContain('settings.prayerAlertFullScreenBlockedHelp ');
  });

  it('uses the sentences every language already has', () => {
    const dir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).settings;
      for (const key of ['prayerAlertFullScreenBlocked', 'prayerAlertFullScreenBlockedHelp', 'prayerAlertFullScreenBlockedHelpIos']) {
        expect(`${f} ${key}: ${typeof s[key] === 'string' && s[key].length > 0}`).toBe(`${f} ${key}: true`);
      }
    }
  });
});

describe('Today asks', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'), 'utf8');

  it('only while alerts and the full-screen switch are both on', () => {
    expect(home).toMatch(
      /useFullScreenAlarmSwitch\(\s*settings\.notificationsEnabled && settings\.prayerAlertFullScreen,\s*noFullScreenChange,\s*\)/,
    );
    expect(home).toMatch(/const fullScreenBlocked = settings\.notificationsEnabled && settings\.prayerAlertFullScreen && fullScreenRefused;/);
  });

  it('and hands the answer to both places the notices are drawn, and to the room made for them', () => {
    expect(home.match(/fullScreenBlocked=\{fullScreenBlocked\}/g)).toHaveLength(2);
    expect(home).toMatch(/notifPermDenied \|\|\s*fullScreenBlocked \|\|/);
    expect(home).toMatch(/notifPermDenied,\s*fullScreenBlocked,\s*timezoneShift,/);
  });
});
