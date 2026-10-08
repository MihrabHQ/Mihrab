/**
 * Downloads is a settings section, and every door in the app reaches it.
 *
 * The download manager used to be a root screen of its own
 * (`QuranDownloads`) with a row under About → Data & privacy. It is
 * Settings → Downloads now (`SettingsDownloads`), on the index beside the
 * other sections. A rename like that is exactly how a door goes dead
 * without a crash: a `navigate()` to a route nobody registers, a link
 * whose path maps to nothing, a notification that opens the app and stops.
 * So: no reference to the old route survives, every way in names the new
 * one, and a link that launches the app lands with Settings under it.
 */
import fs from 'fs';
import path from 'path';
import { Linking } from 'react-native';
import { getStateFromPath } from '@react-navigation/native';

import { linking, MIHRAB_SCHEME, withSettingsUnder } from '../src/navigation/linking';
import { previousIsSettings } from '../src/screens/settings/SettingsPage';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory()
      ? walk(path.join(dir, e.name))
      : /\.tsx?$/.test(e.name)
        ? [path.join(dir, e.name)]
        : [],
  );
}
const SOURCES = walk('src').map(f => ({ f, s: read(f) }));

describe('the old route is gone everywhere', () => {
  it('no source names QuranDownloads as a route', () => {
    const hits = SOURCES.filter(({ s }) =>
      /navigate\(\s*'QuranDownloads'|name="QuranDownloads"|\bQuranDownloads:/.test(s),
    ).map(({ f }) => f);
    expect(hits).toEqual([]);
  });

  it('is not a row under About any more — it is a section of its own', () => {
    expect(read('src/screens/settings/AboutCard.tsx')).not.toMatch(/navigate\('SettingsDownloads'\)/);
    const subpages = read('src/screens/settings/subpages.tsx');
    // Top level: declared outside every `children: [...]` block.
    const topLevel = subpages.replace(/children: \[[\s\S]*?\n {4}\],/g, '');
    expect(topLevel).toMatch(/route: 'SettingsDownloads'/);
    expect(subpages).toMatch(/component: DownloadsSettingsScreen/);
    expect(read('src/navigation/types.ts')).toMatch(/\bSettingsDownloads: undefined/);
  });
});

describe('every door in the app opens it', () => {
  it.each([
    ['the Quran screen', 'src/screens/QuranScreen.tsx'],
    ['the reader', 'src/screens/quran/MushafSurahScreen.tsx'],
    ['Settings → Quran, the riwayah rows and picker', 'src/screens/settings/QuranCard.tsx'],
  ])('%s', (_label, file) => {
    expect(read(file)).toMatch(/navigate\('SettingsDownloads'\)/);
  });

  it('every navigate() to a settings page names a page that is registered', () => {
    const types = read('src/navigation/types.ts');
    const targets = new Set(
      SOURCES.flatMap(({ s }) =>
        [...s.matchAll(/navigate\(\s*'(Settings\w+)'/g)].map(m => m[1]),
      ),
    );
    expect(targets.has('SettingsDownloads')).toBe(true);
    for (const route of targets) {
      expect(types).toMatch(new RegExp(`\\b${route}[?]?:`));
    }
  });

  it('mihrab://downloads — what the "download stopped" notification sends', () => {
    const state = getStateFromPath('downloads', linking.config);
    expect(state?.routes.map(r => r.name)).toEqual(['SettingsDownloads']);
  });
});

describe('a link that launches the app has Settings under its page', () => {
  it('puts the Settings tab under a lone settings page', () => {
    const state = withSettingsUnder({ routes: [{ name: 'SettingsDownloads' }] });
    expect(state).toEqual({
      index: 1,
      routes: [
        { name: 'Home', state: { index: 0, routes: [{ name: 'SettingsTab' }] } },
        { name: 'SettingsDownloads' },
      ],
    });
  });

  it('leaves every other link alone', () => {
    const read2 = { routes: [{ name: 'QuranSurah' }] };
    expect(withSettingsUnder(read2)).toBe(read2);
    const two = { routes: [{ name: 'Home' }, { name: 'SettingsDownloads' }] };
    expect(withSettingsUnder(two)).toBe(two);
  });

  it('only for the launch link — a link while running is pushed, not a reset', async () => {
    const spy = jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue(`${MIHRAB_SCHEME}downloads`);
    await expect(linking.getInitialURL!()).resolves.toBe(`${MIHRAB_SCHEME}downloads`);
    const launched = linking.getStateFromPath!('downloads', linking.config);
    expect(launched?.routes.map(r => r.name)).toEqual(['Home', 'SettingsDownloads']);
    // The next link is not the launch link.
    const running = linking.getStateFromPath!('downloads', linking.config);
    expect(running?.routes.map(r => r.name)).toEqual(['SettingsDownloads']);
    spy.mockRestore();
  });
});

describe('the back control says where back goes', () => {
  const home = (tab: string) => ({
    name: 'Home',
    state: { index: 0, routes: [{ name: tab }] },
  });

  it('"Settings" when opened from the Settings index', () => {
    expect(
      previousIsSettings({ index: 1, routes: [home('SettingsTab'), { name: 'SettingsDownloads' }] }),
    ).toBe(true);
  });

  it('the parent section when nested', () => {
    expect(
      previousIsSettings({ index: 1, routes: [{ name: 'SettingsQuran' }, { name: 'SettingsTajweed' }] }),
    ).toBe(true);
  });

  it('plain "Back" when opened from the Quran tab, the reader or a notification', () => {
    expect(
      previousIsSettings({ index: 1, routes: [home('QuranTab'), { name: 'SettingsDownloads' }] }),
    ).toBe(false);
    expect(
      previousIsSettings({
        index: 2,
        routes: [home('QuranTab'), { name: 'QuranSurah' }, { name: 'SettingsDownloads' }],
      }),
    ).toBe(false);
    expect(previousIsSettings({ index: 0, routes: [{ name: 'SettingsDownloads' }] })).toBe(false);
    expect(previousIsSettings(undefined)).toBe(false);
  });

  it('and the page wires both: the label and a back that always leads somewhere', () => {
    const page = read('src/screens/settings/SettingsPage.tsx');
    expect(page).toMatch(/previousIsSettings\(navigation\.getState\(\)\)/);
    expect(page).toMatch(/canGoBack\(\)/);
    expect(page).toMatch(/navigate\('Home', \{ screen: 'SettingsTab' \}\)/);
  });
});
