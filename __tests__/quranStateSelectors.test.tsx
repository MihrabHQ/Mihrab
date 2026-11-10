/**
 * A reader of one part of the Qur'an state sleeps through writes to the
 * rest (`useQuranSelector`, quran/quranState.ts).
 *
 * The case that mattered: every page turn writes the last-read position,
 * and each mounted muṣḥaf page read the whole state to get two
 * preferences — so every page was rendered again in the middle of the
 * turn. The page's hooks take the preferences alone now; these hold that
 * a position write does not reach them, and that their own part still does.
 */
import { act } from 'react';
import { create } from 'react-test-renderer';
import { Text } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getQuranState,
  updateQuranState,
  useQuranBookmarks,
  useQuranPrefs,
  useQuranSelector,
  useQuranState,
} from '../src/quran/quranState';

function counting(useHook: () => unknown) {
  const renders = { count: 0 };
  function Reader() {
    renders.count += 1;
    useHook();
    return <Text>reader</Text>;
  }
  return { Reader, renders };
}

/** What a page turn does to the store: a new position, nothing else. */
function turnPage(page: number) {
  act(() => {
    updateQuranState(prev => ({
      ...prev,
      lastRead: { ...(prev.lastRead ?? {}), surah: 2, ayah: page, page, updatedAt: page } as never,
    }));
  });
}

describe('one part of the Qur’an state', () => {
  it('a page turn renders the whole-state reader and not the readers of a part', async () => {
    const whole = counting(useQuranState);
    const prefs = counting(useQuranPrefs);
    const marks = counting(useQuranBookmarks);
    const word = counting(() => useQuranSelector(s => (s.prefs.tajweedColours ? 'on' : 'off')));
    await act(async () => {
      create(
        <>
          <whole.Reader />
          <prefs.Reader />
          <marks.Reader />
          <word.Reader />
        </>,
      );
    });
    const before = { whole: whole.renders.count, prefs: prefs.renders.count, marks: marks.renders.count, word: word.renders.count };
    turnPage(40);
    turnPage(41);
    turnPage(42);
    expect(whole.renders.count).toBe(before.whole + 3);
    expect(prefs.renders.count).toBe(before.prefs);
    expect(marks.renders.count).toBe(before.marks);
    expect(word.renders.count).toBe(before.word);
  });

  it('a change to its own part still reaches it', async () => {
    const prefs = counting(useQuranPrefs);
    await act(async () => {
      create(<prefs.Reader />);
    });
    const before = prefs.renders.count;
    const was = getQuranState().prefs.tajweedColours;
    act(() => {
      updateQuranState(prev => ({ ...prev, prefs: { ...prev.prefs, tajweedColours: !was } }));
    });
    expect(prefs.renders.count).toBe(before + 1);
    act(() => {
      updateQuranState(prev => ({ ...prev, prefs: { ...prev.prefs, tajweedColours: was } }));
    });
  });

  it('the muṣḥaf page reads no whole state', () => {
    const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
    // The page and the hooks every page calls: a part each, never the lot.
    for (const p of ['src/quran/MushafUnicodePage.tsx', 'src/quran/useMushafPageFont.ts', 'src/quran/PageProgressMark.tsx']) {
      expect(read(p)).not.toMatch(/useQuranState\(\)/);
    }
  });
});
