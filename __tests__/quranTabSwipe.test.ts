/**
 * Surah / Juz / Bookmarks on the Qur'an tab are a pager of cards: a swipe
 * drags the next page in, the pages set back and dim while they move.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const screen = readFileSync(join(__dirname, '..', 'src', 'screens', 'QuranScreen.tsx'), 'utf8');

describe('the pager', () => {
  it('is a horizontal paging scroll view, one page per tab', () => {
    expect(screen).toMatch(/<Animated\.ScrollView[\s\S]*?horizontal\s+pagingEnabled/);
    expect(screen).toContain('{order.map((pageTab, slot) => {');
    expect(screen).toContain('{renderPage(pageTab, inFront)}');
    // No more swapping one list for another on a pan.
    expect(screen).not.toMatch(/tabAfterSwipe/);
  });

  it('draws the pages as cards that set back and dim off-centre, on the native driver', () => {
    expect(screen).toMatch(/outputRange: \[CARD_SCALE, 1, CARD_SCALE\]/);
    expect(screen).toMatch(/outputRange: \[CARD_DIM, 1, CARD_DIM\]/);
    expect(screen).toMatch(/contentOffset: \{ x: scrollX \} \} \}\], \{ useNativeDriver: true \}/);
    expect(screen).toMatch(/page: \{ flex: 1, overflow: 'hidden', borderRadius: RADIUS\.xl \}/);
  });

  it('settles the tab where the swipe lands, and a tap on the control slides there', () => {
    expect(screen).toContain('onMomentumScrollEnd={e => onPagerSettled(e.nativeEvent.contentOffset.x)}');
    expect(screen).toMatch(/value=\{tab\}\s*onChange=\{goToTab\}/);
    expect(screen).toMatch(/pagerRef\.current\?\.scrollTo\(\{ x: order\.indexOf\(next\) \* pageW/);
  });

  it('keeps Surah at the start of the row in a mirrored layout', () => {
    expect(screen).toContain("layoutRtl ? [...TABS].reverse() : TABS");
    expect(screen).toMatch(/pager: \{ flex: 1, direction: 'ltr' \}/);
    expect(screen).toContain("direction: layoutRtl ? 'rtl' : 'ltr'");
  });

  it('locks while searching, with one search field', () => {
    expect(screen).toContain('scrollEnabled={!searching}');
    expect(screen).toContain('const listHeader = inFront || !searching ? headerFor(pageTab) : undefined;');
  });

  it('moves only what is under the selector: the top is shared, laid over the cards', () => {
    // The selector and everything above it is one view, outside the pages…
    const top = screen.slice(screen.indexOf('const topHeader = ('), screen.indexOf('const headerFor = ('));
    expect(top).toContain('<SegmentedControl');
    expect(top).toContain('<KhatmahEntry />');
    expect(top).not.toContain('OFTEN_READ');
    // …drawn over the pager, following the list in front up and away…
    expect(screen).toMatch(/<GestureDetector gesture=\{topDrag\}>\s*<Animated\.View/);
    expect(screen).toContain('transform: [{ translateY: topShift }]');
    expect(screen).toMatch(/scrollYs\[tab\]\.interpolate\(\{ inputRange: \[0, h\], outputRange: \[0, -h\], extrapolate: 'clamp' \}\)/);
    // …and each list leaves room for it, and lines up with the others first.
    expect(screen).toContain('{ paddingTop: topH, paddingBottom: tabBarInset, minHeight: pagerH + topH }');
    expect(screen).toContain('onScrollBeginDrag={alignPages}');
    expect(screen).toContain('const target = y < h ? y : Math.max(lastY.current[p], h);');
  });
});
