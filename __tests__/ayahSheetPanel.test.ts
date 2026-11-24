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
    expect(
      coerceQuranState({ version: 1, prefs: {} }).prefs.ayahSheetPanel,
    ).toBe('none');
    expect(
      coerceQuranState({ version: 1, prefs: { ayahSheetPanel: 'sideways' } })
        .prefs.ayahSheetPanel,
    ).toBe('none');
  });

  it('keeps each of the three', () => {
    for (const p of ['translation', 'tafsir', 'tajweed'] as const) {
      expect(
        coerceQuranState({ version: 1, prefs: { ayahSheetPanel: p } }).prefs
          .ayahSheetPanel,
      ).toBe(p);
    }
    setQuranPrefs({ ayahSheetPanel: 'tafsir' });
    expect(getQuranState().prefs.ayahSheetPanel).toBe('tafsir');
  });
});

describe('the sheet', () => {
  it('draws one row of tabs, and tapping the open one puts it away', () => {
    expect(sheet).toContain('accessibilityRole="tablist"');
    expect(sheet).toContain('accessibilityRole="tab"');
    expect(sheet).toContain(
      "setQuranPrefs({ ayahSheetPanel: panel === next ? 'none' : next });",
    );
    expect(sheet).toContain("const translationOpen = panel === 'translation';");
    expect(sheet).toContain("const tafsirOpen = panel === 'tafsir';");
    expect(sheet).toContain("{panel === 'tajweed' ? (");
  });

  it('offers Tajweed only where the muṣḥaf has it', () => {
    expect(sheet).toMatch(
      /\.\.\.\(\s*tajweedOffered\s*\?\s*\[\s*\[\s*'tajweed'/,
    );
    expect(sheet).toMatch(
      /state\.prefs\.ayahSheetPanel === 'tajweed' && !tajweedOffered\s*\?\s*'none'/,
    );
  });
});

describe('the play section', () => {
  const controls = readFileSync(
    join(__dirname, '..', 'src', 'quran', 'audio', 'RecitationControls.tsx'),
    'utf8',
  );

  it('puts the reciter last, after speed, memorisation and the range', () => {
    const at = (s: string) => controls.indexOf(s);
    expect(
      at("<SectionHead label={t('quran.speed', 'Speed')} first tight />"),
    ).toBeGreaterThan(-1);
    expect(at("label={t('quran.reciter', 'Reciter')}")).toBeGreaterThan(
      at("defaultValue: 'Play a range of {{surah}}'"),
    );
    expect(at("label={t('quran.reciter', 'Reciter')}")).toBeLessThan(
      at('<ReciterPickerSheet'),
    );
  });

  it('keeps the download and delete buttons apart, on one row', () => {
    expect(controls).toContain(
      "dlWrap: { flexDirection: 'row', marginTop: SPACING.sm, gap: SPACING.sm },",
    );
  });

  it('is compact: segmented choices, small buttons and steppers', () => {
    expect(controls).toContain(
      '<Segments values={values} selected={selected} onSelect={onSelect} format={format} />',
    );
    expect(controls).not.toMatch(/<Chip\b/);
    expect(controls).toMatch(/atMax=\{value >= max\}\s*compact/);
    expect(sheet).toMatch(
      /label=\{t\('quran\.playFromHere', 'Play from here'\)\}\s*glyph="▶"\s*emphasized\s*compact\s*grow/,
    );
  });
});

describe('"Hide while reviewing" is offered only where it does something', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const read = (p: string) =>
    fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  it('is behind an opt-in in the controls, off by default', () => {
    const controls = read('src/quran/audio/RecitationControls.tsx');
    expect(controls).toMatch(/showHideForReview = false/);
    expect(controls).toMatch(
      /\{showHideForReview \? \(\s*<>[\s\S]{0,200}quran\.hideForReview/,
    );
  });

  it('is asked for by the translation view and by no mushaf reader', () => {
    expect(read('src/screens/quran/TranslationSurahScreen.tsx')).toMatch(
      /<AyahActionSheet[\s\S]{0,400}showHideForReview\b/,
    );
    for (const reader of [
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/MushafSpreadReader.tsx',
    ]) {
      expect(read(reader)).not.toMatch(/showHideForReview/);
    }
  });
});

describe('an open section is one block that can be folded away', () => {
  // Asked for 2026-11-24: the section's area was not apparent — its text
  // followed the tabs on the sheet's own ground — nor that it could be
  // hidden: "Hide" was a small link under the text.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/quran/mushaf/AyahActionSheet.tsx'),
    'utf8',
  );

  it('the tabs, the text and Hide share a ground and an edge, only while one is open', () => {
    const card = src.slice(src.indexOf("panel !== 'none'\n                ? [\n                    styles.panelCard"));
    expect(card.length).toBeGreaterThan(0);
    expect(card.slice(0, 200)).toMatch(/backgroundColor: palette\.bg/);
    expect(card.slice(0, 260)).toMatch(/: null/);
    // The tab strip and Hide are both inside it.
    const open = src.indexOf('styles.panelCard,');
    expect(src.indexOf('accessibilityRole="tablist"')).toBeGreaterThan(open);
    expect(src.indexOf('styles.hidePanel,')).toBeGreaterThan(open);
  });

  it('Hide is a bar across the block’s foot, a full touch target, and the open tab says it closes', () => {
    const style = src.slice(src.indexOf('  hidePanel: {'), src.indexOf('  hidePanelLabel:'));
    expect(style).toMatch(/minHeight: 44/);
    expect(style).toMatch(/borderTopWidth/);
    expect(style).toMatch(/marginHorizontal: -SPACING\.md/);
    expect(src).toMatch(/\{on \? ' ▴' : ''\}/);
  });
});
