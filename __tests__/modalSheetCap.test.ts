/**
 * The ayah sheet's height limit holds still. On Android a Modal's box
 * starts as an estimate (the screen without its bars) and is corrected
 * after the sheet is up; '82%' of it moved the sheet with it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { predictedModalHeight } from '../src/hooks/useModalSheetCap';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('the height a Modal ends at, before one has been measured', () => {
  it('is the window itself where the window is edge to edge', () => {
    // A Pixel 10 Pro: 918dp of window, the bars drawn over it.
    expect(predictedModalHeight(918, 918, 0, 0)).toBe(918);
    // The same window reporting its bars as insets: still no more than the screen.
    expect(predictedModalHeight(918, 918, 52, 24)).toBe(918);
  });

  it('adds the bars back where the window was measured without them', () => {
    expect(predictedModalHeight(842, 918, 52, 24)).toBe(918);
    expect(predictedModalHeight(842, 930, 52, 24)).toBe(918);
  });

  it('is never more than the display, and survives a display it was not told', () => {
    expect(predictedModalHeight(450, 918, 30, 0)).toBe(480); // split screen: a part of it
    expect(predictedModalHeight(900, 0, 20, 10)).toBe(930);
    expect(predictedModalHeight(900, 918, -5, -5)).toBe(900);
  });
});

describe('the ayah sheet', () => {
  const sheet = src('src/quran/mushaf/AyahActionSheet.tsx');
  const hook = src('src/hooks/useModalSheetCap.ts');

  it('takes its limit from the hook, not from a percentage of the Modal', () => {
    expect(sheet).toContain('const cap = useModalSheetCap(0.82, visible);');
    expect(sheet).toContain('{ maxHeight: cap.maxHeight },');
    expect(sheet).toContain('onLayout={cap.onContainerLayout}');
    expect(sheet).not.toContain("maxHeight: '82%'");
  });

  it('holds the limit from the moment it opens until it closes or the window changes', () => {
    expect(hook).toContain('const opening = visible && !(held.current?.open ?? false);');
    expect(hook).toContain('if (!held.current || held.current.key !== key || opening) {');
    // What a Modal's box reached is kept for the next opening, never applied to this one.
    expect(hook).toContain('if (h > (reached.get(key) ?? 0)) reached.set(key, h);');
    expect(hook).toContain('return { maxHeight: Math.round(held.current.base * fraction), onContainerLayout };');
  });

  it('keeps the percentage on iOS, where a Modal has its size from the start', () => {
    expect(hook).toMatch(/if \(Platform\.OS !== 'android'\) \{\s*return \{ maxHeight: `\$\{Math\.round\(fraction \* 100\)\}%`, onContainerLayout: undefined \};/);
  });

  it('opens with the ayah on it: the text from memory, the page-font ayah without waiting for the text', () => {
    expect(sheet).toContain("? riwayahAyahText(shownRiwayah, surah, ayah) ?? bundledSurahArabic(surah)?.[ayah - 1] ?? ''");
    expect(sheet).toContain('const arabic = arabicHeld || arabicLoaded;');
    expect(sheet).toContain("{riwayahById(shownRiwayah).render === 'glyph' ? (");
    expect(sheet).not.toContain("{arabic && riwayahById(shownRiwayah).render === 'glyph' ? (");
  });
});
