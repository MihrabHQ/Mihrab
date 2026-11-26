/**
 * The title of a hadith page fits between the back arrow and what is
 * opposite it (`HadithPage.tsx`).
 *
 * It lay under the reader's text-size control twice on 2026-11-26:
 * "an-Nawawi's Forty", then "Riyad as-Salihin · 11". The maintainer's
 * rule: centred between the arrow and the control; drawn smaller to fit,
 * to a limit; past the limit, three dots.
 */
import fs from 'fs';
import path from 'path';
import { TITLE_MIN_SCALE, titleScale } from '../src/screens/hadith/HadithPage';

const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/hadith/HadithPage.tsx'), 'utf8');

describe('a hadith page’s title', () => {
  it('is drawn whole where it fits, and before anything is measured', () => {
    expect(titleScale(300, 200)).toBe(1);
    expect(titleScale(300, 300)).toBe(1);
    expect(titleScale(0, 200)).toBe(1);
    expect(titleScale(300, 0)).toBe(1);
  });

  it('is drawn as much smaller as it needs to fit, and fits', () => {
    for (const [room, natural] of [[240, 261], [240, 300], [200, 260]]) {
      const s = titleScale(room, natural);
      expect(s).toBeLessThan(1);
      expect(s).toBeGreaterThanOrEqual(TITLE_MIN_SCALE);
      expect(natural * s).toBeLessThanOrEqual(room);
    }
  });

  it('is never drawn under the limit: past it, the title is cut short', () => {
    expect(TITLE_MIN_SCALE).toBeGreaterThanOrEqual(0.7);
    expect(titleScale(100, 400)).toBe(TITLE_MIN_SCALE);
    expect(src).toMatch(/fontSize: titleSize \}\]\}\s+numberOfLines=\{1\}\s+ellipsizeMode="tail"/);
  });

  it('has the room between the arrow and what is opposite it, and is centred there', () => {
    expect(src).toContain("titleRoom: { flex: 1, minWidth: 0, justifyContent: 'center' }");
    expect(src).toContain("barSide: { flexGrow: 0, flexShrink: 0, flexDirection: 'row', alignItems: 'center' }");
    expect(src).toMatch(/title: \{[^}]*textAlign: 'center'/);
    // With nothing opposite the arrow it stays centred on the screen.
    expect(src).toContain('end ? null : { width: startWidth }');
    // Sized here, not by the platform's own shrinking.
    expect(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/adjustsFontSizeToFit|minimumFontScale/);
  });

  it('is measured on a copy no one sees or hears', () => {
    expect(src).toMatch(/styles\.measure\} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/);
    expect(src).toMatch(/measure: \{[^}]*opacity: 0/);
  });
});
