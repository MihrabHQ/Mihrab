import * as React from 'react';
import { act, create } from 'react-test-renderer';
import { getQuranState, setQuranPrefs, __resetQuranStateForTests } from '../src/quran/quranState';

const mockNavigate = jest.fn();

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
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
      accentSolid: '#080',
      border: '#ddd',
      error: '#a00',
      errorBg: '#fee',
    },
  }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    canGoBack: () => true,
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 64,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: { language: 'en', readingTextScale: 1, quranVerseByVerseEnabled: true },
    updateSettings: jest.fn(),
  }),
  usePrayerSettingsOrDefaults: () => ({
    settings: { language: 'en', readingTextScale: 1, quranVerseByVerseEnabled: true },
    updateSettings: jest.fn(),
  }),
}));

jest.mock('../src/quran/keepAwakeLock', () => ({
  useKeepAwake: jest.fn(),
}));

jest.mock('../src/quran/quran', () => ({
  ...jest.requireActual('../src/quran/quran'),
  loadSurah: jest.fn().mockResolvedValue({
    arabic: ['بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', 'الرَّحْمَٰنِ الرَّحِيمِ'],
  }),
}));

jest.mock('../src/quran/translations', () => ({
  ...jest.requireActual('../src/quran/translations'),
  getSurahTranslation: jest.fn().mockResolvedValue(['In the name of Allah', 'Praise be to Allah', 'The Entirely Merciful']),
}));

jest.mock('../src/quran/riwayahData', () => ({
  riwayahAyahText: jest.fn((riwayah, surah, ayah) => {
    if (riwayah === 'warsh' && surah === 1) {
      if (ayah === 1) return 'بِسۡمِ اِ۬للَّهِ اِ۬لرَّحۡمَٰنِ اِ۬لرَّحِيمِ';
      if (ayah === 2) return 'اِ۬لۡحَمۡدُ لِلهِ رَبِّ اِ۬لۡعَٰلَمِينَ';
      if (ayah === 3) return 'اِ۬لرَّحۡمَٰنِ اِ۬لرَّحِيمِ';
    }
    return null;
  }),
}));

jest.mock('../src/quran/tajweed/warshTajweed', () => ({
  loadWarshSurah: jest.fn().mockResolvedValue({
    v: 1,
    rules: ['tafkheem'],
    ayahs: [],
  }),
  warshAyahWords: jest.fn((data, ayah, text) => {
    return text.split(' ').map((w: string, i: number) => ({
      text: w,
      position: i + 1,
      rules: [{ id: 'tafkheem', family: 'tafkheem', ink: '#00f' }],
      runs: [{ text: w, rule: { id: 'tafkheem', family: 'tafkheem', ink: '#00f' } }],
    }));
  }),
  shapedRuns: (runs: unknown[]) => runs,
}));

jest.mock('../src/quran/tajweed/tajweedSupport', () => ({
  tajweedColoursShown: (riwayah: string, switchedOn: boolean) => switchedOn,
}));

import { TranslationSurahScreen } from '../src/screens/quran/TranslationSurahScreen';

describe('Hifz revision flashcards', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
  });

  it('toggles hifzReviewHideTafsir in prefs', () => {
    expect(getQuranState().prefs.hifzReviewHideTafsir).toBe(false);
    setQuranPrefs({ hifzReviewHideTafsir: true });
    expect(getQuranState().prefs.hifzReviewHideTafsir).toBe(true);
    setQuranPrefs({ hifzReviewHideTafsir: false });
    expect(getQuranState().prefs.hifzReviewHideTafsir).toBe(false);
  });

  it('renders cards in review with reveal and Anki grading buttons', async () => {
    let root: any;
    await act(async () => {
      root = create(
        <TranslationSurahScreen
          surah={{
            id: 1,
            arabic: 'الفاتحة',
            english: 'The Opening',
            romanized: 'Al-Fatiha',
            ayahCount: 3,
            revelation: 'Meccan',
          } as any}
          surahNumber={1}
          onToggleMode={() => {}}
          hifzReview={{ id: 'portion-1', from: 1, to: 3 }}
        />,
      );
    });

    // In review, ayahs initially show masked prompt "Recite it, then tap to check"
    const textNodes = root.root.findAll((n: any) => typeof n.props.children === 'string');
    const masked = textNodes.some((n: any) => n.props.children.includes('Recite it, then tap to check'));
    expect(masked).toBe(true);

    // Tap the first card to reveal it
    const ayahPressables = root.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel?.includes('Ayah 1'));
    expect(ayahPressables.length).toBeGreaterThan(0);

    await act(async () => {
      ayahPressables[0].props.onPress();
    });

    // Once revealed, grading buttons "Wrong" and "Correct" appear
    const wrongBtn = root.root.findAll((n: any) => n.props.accessibilityLabel === 'Wrong');
    const correctBtn = root.root.findAll((n: any) => n.props.accessibilityLabel === 'Correct');
    expect(wrongBtn.length).toBeGreaterThan(0);
    expect(correctBtn.length).toBeGreaterThan(0);

    // Tap "Wrong" to grade card 1 as incorrect
    await act(async () => {
      wrongBtn[0].props.onPress();
    });

    // Review bar now displays wrong count and option to review wrong cards
    const filterBtn = root.root.findAll((n: any) => n.props.accessibilityLabel?.includes('wrong') || n.props.children?.toString().includes('wrong'));
    expect(filterBtn.length).toBeGreaterThan(0);
  });

  it('suppresses companion text when hifzReviewHideTafsir is enabled', async () => {
    setQuranPrefs({ hifzReviewHideTafsir: true });

    let root: any;
    await act(async () => {
      root = create(
        <TranslationSurahScreen
          surah={{
            id: 1,
            arabic: 'الفاتحة',
            english: 'The Opening',
            romanized: 'Al-Fatiha',
            ayahCount: 3,
            revelation: 'Meccan',
          } as any}
          surahNumber={1}
          onToggleMode={() => {}}
          hifzReview={{ id: 'portion-1', from: 1, to: 3 }}
        />,
      );
    });

    // Reveal card 1
    const ayahPressables = root.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel?.includes('Ayah 1'));
    await act(async () => {
      ayahPressables[0].props.onPress();
    });

    // Translation should not appear even though the card is revealed
    const textNodes = root.root.findAll((n: any) => typeof n.props.children === 'string');
    const hasTranslation = textNodes.some((n: any) => n.props.children.includes('In the name of Allah'));
    expect(hasTranslation).toBe(false);
  });
});
