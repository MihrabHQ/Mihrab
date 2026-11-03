/**
 * Settings → Downloads after a riwāyah finished downloading: the card told
 * the page on every render, the page re-read the disk, which re-rendered
 * it — a loop, the storage bar flickering with "Loading…" for as long as
 * the page was open. Checked on the desktop build
 * (desktop/scripts/steps-downloads-watch.js with MIHRAB_RIWAYAH=1).
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the Downloads page after a riwayah download', () => {
  it('is told once per finished run', () => {
    const card = read('src/quran/RiwayahDownloadSection.tsx');
    expect(card).toMatch(/const told = useRef\(last\);/);
    expect(card).toMatch(/told\.current === last\) return;/);
  });

  it('passes one function for its life, not a new one each render', () => {
    const page = read('src/screens/QuranDownloadsScreen.tsx');
    expect(page).not.toMatch(/onChanged=\{\(\) =>/);
    expect(page).toMatch(/useCallback\(\(\) => void refresh\(\), \[refresh\]\)/);
  });

  it('says "Loading…" only before the first read', () => {
    const page = read('src/screens/QuranDownloadsScreen.tsx');
    expect(page.match(/setLoading\(/g) ?? []).toHaveLength(1);
  });
});
