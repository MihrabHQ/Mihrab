/**
 * The āyah sheet's Translation · Tafsir · Tajweed: tabs, one text at a
 * time, none to begin with, and the reader's pick kept.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  __resetQuranStateForTests,
  coerceQuranState,
  DEFAULT_QURAN_STATE,
  getQuranState,
  setQuranPrefs,
} from '../src/quran/quranState';

const sheet = readFileSync(
  join(__dirname, '..', 'src', 'quran', 'mushaf', 'AyahActionSheet.tsx'),
  'utf8',
);

beforeEach(() => __resetQuranStateForTests());

describe('the kept choice', () => {
  it('is none by default, and none for a blob from before it or with nonsense in it', () => {
    expect(DEFAULT_QURAN_STATE.prefs.ayahSheetPanel).toBe('none');
    expect(coerceQuranState({ version: 1, prefs: {} }).prefs.ayahSheetPanel).toBe('none');
    expect(
      coerceQuranState({ version: 1, prefs: { ayahSheetPanel: 'sideways' } }).prefs.ayahSheetPanel,
    ).toBe('none');
  });

  it('keeps each of the three', () => {
    for (const p of ['translation', 'tafsir', 'tajweed'] as const) {
      expect(coerceQuranState({ version: 1, prefs: { ayahSheetPanel: p } }).prefs.ayahSheetPanel).toBe(p);
    }
    setQuranPrefs({ ayahSheetPanel: 'tafsir' });
    expect(getQuranState().prefs.ayahSheetPanel).toBe('tafsir');
  });
});

describe('the sheet', () => {
  it('draws one row of tabs, and tapping the open one puts it away', () => {
    expect(sheet).toContain('accessibilityRole="tablist"');
    expect(sheet).toContain('accessibilityRole="tab"');
    expect(sheet).toContain("setQuranPrefs({ ayahSheetPanel: panel === next ? 'none' : next });");
    expect(sheet).toContain("const translationOpen = panel === 'translation';");
    expect(sheet).toContain("const tafsirOpen = panel === 'tafsir';");
    expect(sheet).toContain("{panel === 'tajweed' ? (");
  });

  it('offers Tajweed only where the muṣḥaf has it', () => {
    expect(sheet).toMatch(/\.\.\.\(tajweedOffered\s*\?\s*\[\['tajweed'/);
    expect(sheet).toMatch(/state\.prefs\.ayahSheetPanel === 'tajweed' && !tajweedOffered\s*\?\s*'none'/);
  });
});

describe('the play section', () => {
  const controls = readFileSync(
    join(__dirname, '..', 'src', 'quran', 'audio', 'RecitationControls.tsx'),
    'utf8',
  );

  it('puts the reciter last, after speed, memorisation and the range', () => {
    const at = (s: string) => controls.indexOf(s);
    expect(at("<SectionHead label={t('quran.speed', 'Speed')} first />")).toBeGreaterThan(-1);
    expect(at("label={t('quran.reciter', 'Reciter')}")).toBeGreaterThan(at("defaultValue: 'Play a range of {{surah}}'"));
    expect(at("label={t('quran.reciter', 'Reciter')}")).toBeLessThan(at('<ReciterPickerSheet'));
  });

  it('keeps the download and delete rows apart', () => {
    expect(controls).toContain('dlWrap: { marginTop: SPACING.sm, gap: SPACING.sm },');
  });
});
