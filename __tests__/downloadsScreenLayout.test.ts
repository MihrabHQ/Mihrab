/**
 * Manage downloads: the app's own delete dialog, and a row that gives a
 * reciter's name the width of the card.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const screen = read('src/screens/QuranDownloadsScreen.tsx');
const riwayah = read('src/quran/RiwayahDownloadSection.tsx');

describe('deleting a download', () => {
  it('asks in the themed dialog, never the platform alert', () => {
    for (const src of [screen, riwayah]) {
      expect(src).not.toMatch(/Alert\.alert/);
      expect(src).toMatch(/<ConfirmModal[\s\S]*?destructive/);
    }
  });
});

describe('a downloaded item', () => {
  const ui = read('src/quran/downloadsUi.tsx');

  it('is a row of a settings group, with its actions on their own line', () => {
    // The page is built like every settings page: groups, not a card each.
    expect(screen).toMatch(/<SettingsGroup title=\{t\('downloads\.groupOnDevice'/);
    expect(screen).not.toMatch(/cardEdgeStyle/);
    expect(ui).toMatch(/<View style=\{styles\.cardHead\}>[\s\S]*?styles\.rowTitle[\s\S]*?styles\.rowBytes/);
    expect(ui).toMatch(/\{actions \? <View style=\{styles\.actions\}>/);
    expect(screen).toMatch(/listenDownloadResume[\s\S]*?common\.delete/);
  });

  it('draws no outlines: text actions, a filled track, tonal buttons', () => {
    for (const src of [screen, ui, riwayah]) {
      expect(src).not.toMatch(/borderWidth/);
      expect(src).not.toMatch(/borderColor:/);
    }
    // The track is on controlBg, which every palette paints — `border` is
    // transparent under iOS's grouped chrome, and the bar vanished there.
    expect(ui).toMatch(/styles\.track, \{ backgroundColor: palette\.controlBg \}/);
  });

  it('shows how far a part-way reciter has got', () => {
    expect(screen).toContain('progress={whole ? undefined : files / totalAyahCount()}');
    expect(ui).toMatch(/width: `\$\{Math\.round\(pct \* 100\)\}%`/);
  });
});

describe('a reciter downloading right now', () => {
  const screen = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/screens/QuranDownloadsScreen.tsx'),
    'utf8',
  );
  it('has its card follow the run, not the count from when the screen opened', () => {
    expect(screen).toMatch(
      /running\?\.kind === 'audio' && running\.reciterId === a\.reciterId/,
    );
    expect(screen).toMatch(/Math\.max\(a\.files, live\.done\)/);
    expect(screen).toMatch(/done: files,/);
    // Its own Continue button is not offered while it is the one running.
    expect(screen).toMatch(/whole \|\| live\s*\? undefined/);
    expect(screen).toMatch(/progress=\{whole \? undefined : files \/ totalAyahCount\(\)\}/);
  });
});
