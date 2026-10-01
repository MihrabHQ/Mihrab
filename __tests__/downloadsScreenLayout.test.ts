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
  it('puts its buttons on their own line, under the name and size', () => {
    expect(screen).toMatch(/<View style=\{styles\.cardHead\}>[\s\S]*?styles\.rowTitle[\s\S]*?styles\.rowBytes/);
    expect(screen).toMatch(/<View style=\{styles\.actions\}>[\s\S]*?listenDownloadResume[\s\S]*?common\.delete/);
    expect(screen).toContain("rowTitle: { fontSize: TYPE.callout.fontSize, fontWeight: '600', flex: 1 }");
  });

  it('shows how far a part-way reciter has got', () => {
    expect(screen).toContain('whole ? undefined : a.files / totalAyahCount(),');
    expect(screen).toMatch(/width: `\$\{Math\.round\(progress \* 100\)\}%`/);
  });
});
