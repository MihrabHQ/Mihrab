/**
 * Swiping between Surah / Juz / Bookmarks on the Qur'an tab.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { tabAfterSwipe } from '../src/screens/QuranScreen';

const screen = readFileSync(join(__dirname, '..', 'src', 'screens', 'QuranScreen.tsx'), 'utf8');

describe('a swipe over the list', () => {
  it('moves one tab in the direction of the row, and stops at its ends', () => {
    expect(tabAfterSwipe('surah', -80, 0, false)).toBe('juz');
    expect(tabAfterSwipe('juz', -80, 0, false)).toBe('bookmarks');
    expect(tabAfterSwipe('bookmarks', -80, 0, false)).toBe('bookmarks');
    expect(tabAfterSwipe('bookmarks', 80, 0, false)).toBe('juz');
    expect(tabAfterSwipe('surah', 80, 0, false)).toBe('surah');
  });

  it('is mirrored with the layout', () => {
    expect(tabAfterSwipe('surah', 80, 0, true)).toBe('juz');
    expect(tabAfterSwipe('juz', -80, 0, true)).toBe('surah');
  });

  it('counts a short, fast flick, and ignores a short slow drag', () => {
    expect(tabAfterSwipe('surah', -30, -900, false)).toBe('juz');
    expect(tabAfterSwipe('surah', -30, -100, false)).toBe('surah');
  });

  it('activates only sideways and yields to a scroll', () => {
    expect(screen).toMatch(/Gesture\.Pan\(\)\s*\.activeOffsetX\(\[-SWIPE_ACTIVATE, SWIPE_ACTIVATE\]\)\s*\.failOffsetY\(\[-SWIPE_FAIL_Y, SWIPE_FAIL_Y\]\)/);
    expect(screen).toMatch(/<GestureDetector gesture=\{tabSwipe\}>/);
  });
});
