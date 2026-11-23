/**
 * Hifz revision (#138, from pull request #139 by Yushi5058, reworked):
 * the reader's riwayah on the right rows, a mark per checked ayah with
 * "recite the missed again", and the Arabic alone when asked for.
 */
import * as React from 'react';
import { act, create } from 'react-test-renderer';
import { setQuranPrefs, __resetQuranStateForTests } from '../src/quran/quranState';

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
      danger: '#a00',
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


const HAFS_FATIHA = [
  'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
  'الرَّحْمَٰنِ الرَّحِيمِ',
  'مَالِكِ يَوْمِ الدِّينِ',
  'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
  'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
  'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
];
// The Warsh text, keyed in Warsh's own (Madani) count.
const WARSH: Record<string, string> = {
  '1:1': 'اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ',
  '1:2': 'اَ۬لرَّحْمَٰنِ اِ۬لرَّحِيمِ',
  '1:3': 'مَلِكِ يَوْمِ اِ۬لدِّينِ',
  '1:4': 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
  '1:5': 'اُ۪هْدِنَا اَ۬لصِّرَٰطَ اَ۬لْمُسْتَقِيمَ',
  '1:6': 'صِرَٰطَ اَ۬لذِينَ أَنْعَمْتَ عَلَيْهِمْ',
  '1:7': 'غَيْرِ اِ۬لْمَغْضُوبِ عَلَيْهِمْ وَلَا اَ۬لضَّآلِّينَ',
};

jest.mock('../src/quran/quran', () => ({
  ...jest.requireActual('../src/quran/quran'),
  loadSurah: jest.fn(async () => ({ arabic: HAFS_FATIHA })),
}));

jest.mock('../src/quran/translations', () => ({
  ...jest.requireActual('../src/quran/translations'),
  getSurahTranslation: jest.fn(async () => ['In the name of Allah', 'Praise be to Allah', 'The Most Merciful', 'Master of the Day', 'You alone', 'Guide us', 'The path']),
}));

jest.mock('../src/quran/riwayahData', () => ({
  ...jest.requireActual('../src/quran/riwayahData'),
  useRiwayahAvailability: () => 0,
  riwayahAyahText: (r: string, s: number, a: number) => (r === 'warsh' ? WARSH[`${s}:${a}`] ?? null : null),
}));

// The Warsh dataset is "installed": the reader's choice stands.
jest.mock('../src/quran/riwayat', () => ({
  ...jest.requireActual('../src/quran/riwayat'),
  resolveRiwayah: (r: string | undefined) => r ?? 'hafs',
  riwayahTextFontFamily: () => null,
}));

import { TranslationSurahScreen } from '../src/screens/quran/TranslationSurahScreen';

const FATIHA = { id: 1, arabic: 'الفاتحة', english: 'The Opening', romanized: 'Al-Fatiha', ayahCount: 7, revelation: 'Meccan' };

async function open(review = { id: 'p1', from: 1, to: 7 }) {
  let root: any;
  await act(async () => {
    root = create(
      <TranslationSurahScreen surah={FATIHA as any} surahNumber={1} onToggleMode={() => {}} hifzReview={review} />,
    );
  });
  return root;
}
const texts = (root: any): string[] =>
  root.root.findAll((n: any) => typeof n.props.children === 'string').map((n: any) => n.props.children);
const card = (root: any, ayah: number) =>
  root.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === `Ayah ${ayah} — tap for actions`)[0];
async function check(root: any, ayah: number) {
  await act(async () => card(root, ayah).props.onPress());
}

describe('Hifz revision', () => {
  beforeEach(() => __resetQuranStateForTests());

  it('Ḥafṣ reader: the bundled text, and a mark for each checked ayah', async () => {
    const root = await open();
    // (Each text is found twice: the component and the host it renders.)
    expect(new Set(root.root.findAll((n: any) => n.props.children === 'Recite it, then tap to check').map((n: any) => n.parent)).size).toBeGreaterThanOrEqual(7);
    await check(root, 4);
    expect(texts(root)).toContain('مَالِكِ يَوْمِ الدِّينِ');
    expect(root.root.findAll((n: any) => n.props.accessibilityLabel === 'Missed it').length).toBeGreaterThan(0);
    expect(root.root.findAll((n: any) => n.props.accessibilityLabel === 'Knew it').length).toBeGreaterThan(0);
  });

  it('Warsh reader: each Ḥafṣ row gets the Warsh ayah it is recited in — not Warsh ayah n', async () => {
    setQuranPrefs({ riwayah: 'warsh' });
    const root = await open();
    for (const a of [1, 2, 4, 7]) await check(root, a);
    const shown = texts(root);
    // Row 1 is the basmalah, which Warsh does not number: the bundled one.
    expect(shown).toContain(HAFS_FATIHA[0]);
    // Row 2 is Warsh 1, row 4 Warsh 3 (مَلِكِ, Warsh's own reading).
    expect(shown).toContain(WARSH['1:1']);
    expect(shown).toContain(WARSH['1:3']);
    expect(shown).not.toContain(HAFS_FATIHA[3]);
    // Row 7 holds Warsh 6 and 7, which share it.
    expect(shown).toContain(`${WARSH['1:6']} ${WARSH['1:7']}`);
  });

  it('missed ayahs are hidden again to be recited once more; the rest stay checked', async () => {
    const root = await open();
    await check(root, 2);
    await check(root, 3);
    const missedBtn = () => root.root.findAll((n: any) => n.props.accessibilityLabel === 'Missed it' && n.props.onPress);
    await act(async () => missedBtn()[0].props.onPress());
    const again = root.root.findAll((n: any) => n.props.accessibilityLabel === 'Recite the {{count}} missed again' || /missed again/.test(n.props.accessibilityLabel ?? ''))[0];
    expect(again).toBeTruthy();
    await act(async () => again.props.onPress());
    const shown = texts(root);
    expect(shown).not.toContain(HAFS_FATIHA[1]); // ayah 2, missed: hidden again
    expect(shown).toContain(HAFS_FATIHA[2]); // ayah 3: still checked
  });

  it('Arabic only while revising: no translation under a checked ayah', async () => {
    setQuranPrefs({ hifzReviewHideCompanion: true });
    const root = await open();
    await check(root, 2);
    expect(texts(root)).toContain(HAFS_FATIHA[1]);
    expect(texts(root)).not.toContain('Praise be to Allah');
  });

  it('and with it off, the translation comes with the check', async () => {
    const root = await open();
    await check(root, 2);
    expect(texts(root)).toContain('Praise be to Allah');
  });
});
