/**
 * A pager's `contentOffset` says where it OPENS, and must not follow the
 * page on show.
 *
 * Fabric writes a changed `contentOffset` onto the scroll view at once. The
 * Today table's chevrons and "Back to today", and the Quran tab's selector,
 * change the page in the same breath as they start an animated scroll — and
 * on the Mac (Catalyst) that animation then went its whole distance on from
 * where the jump had put it. Every press on Today moved two days, so after
 * Isha, with the card on Tomorrow, today could not be reached at all; Juz
 * tapped from Surah settled on Bookmarks.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe("Today's day pager", () => {
  const card = read('src/screens/home/TodayCard.tsx');

  it('opens at an offset worked out from the width and layout, not from the day', () => {
    expect(card).toMatch(/contentOffset=\{openingOffset\}/);
    const memo = /const openingOffset = useMemo\(([\s\S]*?)\);/.exec(card);
    expect(memo).not.toBeNull();
    const deps = /\[([^\]]*)\]\s*,?\s*$/.exec(memo![1].trim())![1];
    // `openingDay` is the day only until the pager is mounted, and nothing
    // after: see `__tests__/pagerOpensOnTheDayOnShow.test.tsx`.
    expect(deps.split(',').map(s => s.trim())).toEqual(['pageWidth', 'todayIndex', 'pagePosition', 'openingDay']);
    expect(card).toMatch(/const pagerUp = pageWidth > 0 && pagerMayMount;\s*const openingDay = pagerUp \? null : selected;/);
    expect(memo![1]).toMatch(/openingDay \?\? selectedNow\.current/);
  });

  it('never hands the pager an offset built from `selected` itself', () => {
    expect(card).not.toMatch(/contentOffset=\{\{[^}]*selected/);
  });

  it('still steps a day with an animated scroll of its own', () => {
    expect(card).toMatch(/onPress=\{\(\) => handleSelect\(selected - 1\)\}/);
    expect(card).toMatch(/onPress=\{\(\) => handleSelect\(selected \+ 1\)\}/);
    expect(card).toMatch(/setSelected\(offset\);\s*scrollToDay\(offset, true\);/);
  });
});

describe("The Quran tab's pager", () => {
  const quran = read('src/screens/QuranScreen.tsx');

  it('opens at an offset worked out from the width and order, not from the tab', () => {
    expect(quran).toMatch(/contentOffset=\{\{ x: openingX, y: 0 \}\}/);
    expect(quran).toMatch(
      /const openingX = useMemo\(\s*\(\) => order\.indexOf\(tabRef\.current\) \* pageW,\s*\[order, pageW\],?\s*\);/,
    );
    expect(quran).not.toMatch(/contentOffset=\{\{ x: order\.indexOf\(tab\)/);
  });
});
