import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SALAH_KEYS,
  alertModeFor,
  cycleAlertModePatch,
  shownAlertMode,
} from '../src/settings/alertModes';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Prayer sounds page (#66)', () => {
  it('is reachable from Notifications and typed', () => {
    expect(read('src/screens/settings/subpages.tsx')).toMatch(
      /route: 'SettingsPrayerSounds'/,
    );
    expect(read('src/navigation/types.ts')).toMatch(/SettingsPrayerSounds/);
  });

  it('writes the same map the home toggle writes', () => {
    const src = read('src/screens/settings/pages/PrayerSoundsSettingsScreen.tsx');
    expect(src).toMatch(/prayerAlertModes/);
    expect(src).toMatch(/shownAlertMode/);
  });

  it('a page choice is what the home row then shows, and vice versa', () => {
    const modes = { Fajr: 'silent' as const };
    expect(shownAlertMode('Fajr', modes, true, true)).toBe('silent');
    // home cycle from silent goes to adhan and the page would show it
    const patch = cycleAlertModePatch('Fajr', 'silent', modes, true);
    expect(alertModeFor('Fajr', patch.prayerAlertModes, true)).toBe('adhan');
    expect(SALAH_KEYS).toHaveLength(5);
  });
});
