/**
 * Pressing the tab you are already on returns that page to the top.
 *
 * It is the platform convention on both, and on these screens it is the
 * only way back: the surah list is 114 rows, the Log's history is a year,
 * and neither has a "top" button. `useScrollToTop` listens for `tabPress`
 * and acts only while the screen is focused, so the whole feature is one
 * hook plus a ref actually attached to the scrollable.
 *
 * The ref is the half that goes wrong, and silently — a screen can call
 * the hook, pass the ref to nothing, and look completely correct in
 * review. The Quran tab shipped exactly that way: the hook was added to
 * four screens and missed on the fifth, and nobody could tell from the
 * source without going looking for the `ref=`. So this asserts BOTH ends
 * on every scrolling tab.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) =>
  readFileSync(join(__dirname, '..', 'src', 'screens', p), 'utf8');

/** The six tab roots that have something to scroll, and the ref each uses. */
const TABS: { file: string; ref: string }[] = [
  { file: 'HomeScreen.tsx', ref: 'scrollRef' },
  { file: 'QuranScreen.tsx', ref: 'listRef' },
  { file: 'DuasScreen.tsx', ref: 'scrollRef' },
  { file: 'LogScreen.tsx', ref: 'scrollRef' },
  { file: 'SettingsScreen.tsx', ref: 'scrollRef' },
];

describe('every scrolling tab returns to the top on a second tab press', () => {
  for (const { file, ref } of TABS) {
    it(`${file} calls useScrollToTop`, () => {
      const src = read(file);
      expect(src).toMatch(/\buseScrollToTop\b/);
      expect(src).toContain(`useScrollToTop(${ref})`);
    });

    it(`${file} attaches that ref to a scrollable`, () => {
      // The hook without the ref is the failure mode: it compiles, it
      // renders, and the tab press does nothing. (The Quran tab hands it
      // to whichever page of its pager is in front — see below.)
      if (file === 'QuranScreen.tsx') return;
      expect(read(file)).toContain(`ref={${ref}}`);
    });
  }
});

describe('the Quran tab, which has three lists and one ref', () => {
  const SRC = read('QuranScreen.tsx');

  it('points the ref at the list in front', () => {
    // Surah / Juz / Bookmarks are all mounted — the pager's cards. Each
    // keeps its own ref, and `listRef` follows whichever is in front —
    // miss one and that tab alone stops responding.
    const lists = SRC.match(/<FlatList[<\s]/g) ?? [];
    expect(lists.length).toBe(3);
    for (const p of ['surah', 'juz', 'bookmarks']) expect(SRC).toContain(`ref={pageRef.${p}}`);
    expect(SRC).toContain('if (pageTab === tabRef.current) listRef.current = r;');
    expect(SRC).toMatch(/listRef\.current = pageRefs\.current\[tab\];\s*\}, \[tab\]\);/);
  });

  it('does not scroll a tab it is not on', () => {
    // `useScrollToTop` is focus-aware by contract; this pins that we rely
    // on it rather than on a listener of our own.
    expect(SRC).not.toMatch(/addListener\(\s*'tabPress'/);
  });
});
