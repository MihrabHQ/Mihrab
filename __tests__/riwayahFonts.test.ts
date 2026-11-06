/**
 * The faces the Quranpedia muṣḥafs are set in — `riwayahFonts.ts`.
 *
 * A reader wrote in that the Qālūn page did not look like the Qālūn
 * print: it was drawn in Amiri, the fallback. The face now arrives beside
 * the text, and the pin, the fallback and the switch are what these
 * tests hold still.
 */
import fs from 'fs';
import path from 'path';
import { FONTS } from '../src/theme/typography';
import { RIWAYAH_FONTS, riwayahFontUrls } from '../src/quran/riwayahFonts';
import {
  _resetRiwayahDataCacheForTests,
  _setRiwayahDataForTests,
} from '../src/quran/riwayahData';
import {
  riwayahById,
  riwayahFontFamily,
  riwayahPrintedMetrics,
  riwayahTextFontFamily,
} from '../src/quran/riwayat';
import type { RiwayahDataset } from '../src/quran/riwayahImport';

const DATASET: RiwayahDataset = {
  pages: [{ page: 1, surah: 1, ayah: 1, endSurah: 1, endAyah: 7 }] as never,
  surahs: [],
  ayahCounts: [7],
  text: { '1:1': 'بِسْمِ' },
};

afterEach(() => _resetRiwayahDataCacheForTests());

describe('the pinned faces', () => {
  it('names one TrueType file per Quranpedia muṣḥaf, with a pin', () => {
    for (const id of ['warsh', 'qalun', 'shubah'] as const) {
      const font = RIWAYAH_FONTS[id];
      expect(font.name).toMatch(/^Uthmanic\w+_V2\d\.ttf$/);
      expect(font.bytes).toBeGreaterThan(100_000);
      expect(font.sha256).toMatch(/^[0-9a-f]{64}$/);
      // The original is the same file under the same name: the mirror is a
      // copy, never a conversion.
      expect(font.original).toMatch(new RegExp(`^https://quranpedia\\.net/.*/${font.name}$`));
      expect(riwayahById(id).font).toBe(font);
      const [mirror, original] = riwayahFontUrls(font);
      expect(mirror).toContain(`/data-riwayah-v1/${font.name}`);
      expect(original).toBe(font.original);
    }
  });

  it('is what the mirror builder reads its list from', () => {
    // The same expression `scripts/mirror/build-mirror.js` uses, so a
    // reshaped table breaks here rather than in a release build.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/quran/riwayahFonts.ts'), 'utf8');
    const faces = [...src.matchAll(/(\w+): \{\s*name: '([^']+\.ttf)',[\s\S]*?original: `\$\{QURANPEDIA_FONTS\}\/([^`]+)`/g)];
    expect(faces.map(m => m[1]).sort()).toEqual(['qalun', 'shubah', 'warsh']);
    expect(faces.map(m => m[2]).sort()).toEqual(
      Object.values(RIWAYAH_FONTS).map(f => f.name).sort(),
    );
  });

  it('sizes the page for the face, not for Amiri', () => {
    for (const font of Object.values(RIWAYAH_FONTS)) {
      const m = font.metrics;
      // Shorter rows (the face is compact vertically), longer lines (its
      // words are wider) — measured, see `riwayahFonts.ts`.
      expect(m.lineHeightEm).toBeLessThan(2.05);
      expect(m.typicalLineEm).toBeGreaterThan(18.2);
      expect(m.ascentEm).toBeGreaterThan(1);
      expect(m.descentEm).toBeGreaterThan(0.5);
    }
  });
});

describe('which face the page is drawn in', () => {
  it('falls back to Amiri until the face is registered, then switches', () => {
    const def = riwayahById('qalun');
    _setRiwayahDataForTests('qalun', DATASET);
    expect(riwayahFontFamily(def)).toBe(FONTS.arabicQuran);
    expect(riwayahPrintedMetrics(def)).toBeUndefined();
    expect(riwayahTextFontFamily('qalun')).toBeNull();

    _setRiwayahDataForTests('qalun', DATASET, 'MihrabRiwayah_qalun');
    expect(riwayahFontFamily(def)).toBe('MihrabRiwayah_qalun');
    expect(riwayahPrintedMetrics(def)).toBe(RIWAYAH_FONTS.qalun.metrics);
    expect(riwayahTextFontFamily('qalun')).toBe('MihrabRiwayah_qalun');
  });

  it('keeps the tajwīd colours in Amiri, on the page and in the sheet', () => {
    // The colours cut words into runs; the KFGQPC faces pick each letter's
    // form from the next letter, which a run boundary hides, so a coloured
    // Warsh page in its own face came apart and overran its lines.
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const page = read('src/quran/MushafUnicodePage.tsx');
    expect(page).toMatch(
      /const fontFamily =\s*coloured && ownFamily != null && !definition\.fontDownloaded \? FONTS\.arabicQuran : ownFamily;/,
    );
    // The coloured page is sized for the face it is drawn in.
    expect(page).toMatch(/fontFamily === ownFamily \? riwayahPrintedMetrics\(definition\) : definition\.printed/);
    const sheet = read('src/quran/tajweed/TajweedAyahSection.tsx');
    expect(sheet).not.toMatch(/riwayahFontFamily\(/);
    expect(sheet.match(/const fontFamily = FONTS\.arabicQuran;/g)).toHaveLength(2);
  });

  it('still waits for a face the text cannot do without', () => {
    const def = riwayahById('indopak');
    _setRiwayahDataForTests('indopak', DATASET);
    expect(riwayahFontFamily(def)).toBeNull();
  });
});
