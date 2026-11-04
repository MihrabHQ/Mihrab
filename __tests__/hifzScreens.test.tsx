/**
 * Hifz on screen (#121): the row on the Qur'an tab and the page.
 *
 * The arithmetic is pinned in `hifz.test.ts`; this is the thinner claim
 * that the two surfaces draw it: a door before anything is marked, the
 * day's portions once something is, a tick that records a recitation and
 * moves the portion on, and a page where a surah is marked and unmarked.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    // The default string, with its {{slots}} filled — enough to read the
    // labels the tests look for.
    t: (k: string, d?: unknown) => {
      if (typeof d === 'string') return d;
      const o = (d ?? {}) as Record<string, unknown>;
      const s = typeof o.defaultValue === 'string' ? o.defaultValue : k;
      return s.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      bg: '#fff',
      card: '#eee',
      text: '#000',
      muted: '#666',
      accent: '#0a0',
      accentBg: '#efe',
      border: '#ddd',
      danger: '#a00',
    },
  }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../src/navigation/tabBarInset', () => ({ useTabBarInset: () => 0 }));
jest.mock('../src/responsive/breakpoints', () => ({ useBreakpoint: () => 'compact' }));
jest.mock('../src/hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));
jest.mock('../src/responsive/sheetSides', () => ({ useSheetSides: () => ({ left: 0, right: 0 }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { HifzEntry } from '../src/screens/quran/HifzEntry';
import { HifzScreen } from '../src/screens/quran/HifzScreen';
import { dayOf, markSurah } from '../src/quran/hifz';
import { ayahIndexOf } from '../src/quran/ayahIndex';
import {
  __resetQuranStateForTests,
  getQuranState,
  updateHifz,
} from '../src/quran/quranState';

const texts = (root: ReactTestInstance): string[] =>
  root
    .findAllByType('Text' as never, { deep: true })
    .flatMap(n =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
        .map(String),
    );

const byLabel = (root: ReactTestInstance, label: string) =>
  root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

function render(el: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(el);
  });
  return tree;
}

beforeEach(() => {
  __resetQuranStateForTests();
  mockNavigate.mockReset();
});

describe('the row on the Qur\'an tab', () => {
  it('is a door until something is by heart', () => {
    const tree = render(<HifzEntry />);
    expect(texts(tree.root)).toContain('What you know by heart');
    act(() => {
      byLabel(tree.root, 'Hifz — What you know by heart').props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Hifz');
  });

  it('shows the day\'s portions, and a tick records a recitation', () => {
    const now = Date.now();
    act(() => {
      updateHifz(prev => markSurah(markSurah(prev, 112, dayOf(now), now), 113, dayOf(now), now));
      // Just memorised: due tomorrow. Pull both to today.
      updateHifz(prev => ({ ...prev, portions: prev.portions.map(p => ({ ...p, due: dayOf(now) })) }));
    });
    const tree = render(<HifzEntry />);
    const shown = texts(tree.root);
    expect(shown).toContain('Revise today');
    expect(shown).toContain('Al-Ikhlas');
    expect(shown).toContain('Al-Falaq');
    act(() => {
      byLabel(tree.root, 'Recited Al-Ikhlas').props.onPress();
    });
    const ikhlas = getQuranState().hifz!.portions.find(p => p.start === 6222)!;
    expect(ikhlas.reviews).toHaveLength(1);
    expect(ikhlas.due > dayOf(now)).toBe(true);
    // Done with one, the other is still the day's.
    const after = texts(tree.root);
    expect(after).not.toContain('Al-Ikhlas');
    expect(after).toContain('Al-Falaq');
  });
});

describe('the page', () => {
  it('marks a surah from the grid and unmarks it again', () => {
    const tree = render(<HifzScreen />);
    expect(texts(tree.root)).toContain('Which surahs do you know by heart?');
    act(() => {
      byLabel(tree.root, '114 An-Nas').props.onPress();
    });
    expect(getQuranState().hifz?.portions).toHaveLength(1);
    expect(texts(tree.root)).toContain('By heart');
    act(() => {
      byLabel(tree.root, '114 An-Nas').props.onPress();
    });
    // Gone from the stock — but the removal itself stays, for the merge.
    expect(getQuranState().hifz?.portions).toHaveLength(0);
    expect(getQuranState().hifz?.removed).toHaveLength(1);
    expect(texts(tree.root)).toContain('Which surahs do you know by heart?');
  });

  it('marks part of a surah from a long press on the grid', () => {
    const tree = render(<HifzScreen />);
    act(() => {
      byLabel(tree.root, '2 Al-Baqarah').props.onLongPress();
    });
    const field = (label: string) =>
      tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0];
    const inputs = [field('From ayah'), field('To ayah')];
    expect(inputs.every(Boolean)).toBe(true);
    act(() => {
      inputs[0].props.onChangeText('1');
      inputs[1].props.onChangeText('100');
    });
    act(() => {
      byLabel(tree.root, 'Mark').props.onPress();
    });
    const p = getQuranState().hifz!.portions;
    expect(p).toHaveLength(1);
    expect([p[0].start, p[0].end]).toEqual([ayahIndexOf(2, 1), ayahIndexOf(2, 100)]);
    // Opened again, it says what is held — and cutting it keeps the head.
    act(() => {
      byLabel(tree.root, '2 Al-Baqarah').props.onLongPress();
    });
    const again = [field('From ayah'), field('To ayah')];
    expect(again[0].props.value).toBe('1');
    expect(again[1].props.value).toBe('100');
    act(() => {
      again[1].props.onChangeText('80');
    });
    act(() => {
      byLabel(tree.root, 'Mark').props.onPress();
    });
    const q = getQuranState().hifz!.portions;
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe(p[0].id);
    expect(q[0].end).toBe(ayahIndexOf(2, 80));
  });

  it("marks all of Juz' 30 in one tap", () => {
    const tree = render(<HifzScreen />);
    act(() => {
      byLabel(tree.root, "Juz' 30").props.onPress();
    });
    expect(getQuranState().hifz?.portions).toHaveLength(37);
  });
});
