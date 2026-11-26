/**
 * The Arabic and its meaning side by side on a wide window
 * (`HadithReaderScreen.tsx`): a tablet on its side, a desktop.
 *
 * Seen in the desktop app at 1258 points on 2026-11-26. Not seen on an
 * iPad, a Mac, in a browser, or with the app in Urdu.
 */
import fs from 'fs';
import path from 'path';
import { BREAKPOINT_REGULAR, MAX_CONTENT_WIDTH } from '../src/responsive/breakpoints';

jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async () => null),
  packStatus: jest.fn(() => ({ state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => [],
  usePackStatuses: () => ({}),
  usePacksReadyKey: () => '',
}));

const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/hadith/HadithReaderScreen.tsx'), 'utf8');
const num = (name: string) => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src)?.[1]);

describe('Arabic and meaning side by side', () => {
  const PAIR_MIN_WIDTH = num('PAIR_MIN_WIDTH');
  const PAIR_MAX_WIDTH = num('PAIR_MAX_WIDTH');

  it('only where each half is as wide as a phone’s own column, and only where there are two texts', () => {
    expect(src).toContain('const sideBySide = windowWidth >= PAIR_MIN_WIDTH && !!item?.arabic && !!item?.text;');
    // Not at the first width that counts as wide: the desktop app opens 734 across.
    expect(PAIR_MIN_WIDTH).toBeGreaterThan(BREAKPOINT_REGULAR);
    expect((PAIR_MIN_WIDTH - 80) / 2).toBeGreaterThanOrEqual(340);
  });

  it('in a wider column than the reading measure, with what follows kept to the measure', () => {
    expect(PAIR_MAX_WIDTH).toBeGreaterThan(MAX_CONTENT_WIDTH);
    expect(PAIR_MAX_WIDTH).toBeLessThanOrEqual(MAX_CONTENT_WIDTH * 1.5);
    expect(src).toContain('<Column style={styles.page} maxWidth={sideBySide ? PAIR_MAX_WIDTH : undefined}>');
    expect(src).toContain('<View style={sideBySide ? styles.measure : styles.rest}>');
    expect(src).toMatch(/measure: \{[^}]*maxWidth: MAX_CONTENT_WIDTH[^}]*alignSelf: 'center'/);
  });

  it('with the Arabic on the right, whatever the app’s direction', () => {
    expect(src).toContain('(layoutRtl ? [arabicText, meaningText] : [meaningText, arabicText])');
  });

  it('and a phone as it was: the Arabic, then its meaning', () => {
    expect(src).toMatch(/\) : \(\s+<>\s+\{arabicText\}\s+\{meaningText\}\s+<\/>/);
  });
});
