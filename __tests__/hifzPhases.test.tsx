/**
 * Hifz, the later phases (#121): the drill's hand-off to the tracker,
 * Home's door, the reminder's verdict, and the juz' coverage.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';

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
    palette: { bg: '#fff', card: '#eee', text: '#000', muted: '#666', accent: '#0a0', accentBg: '#efe', border: '#ddd', danger: '#a00', accentSolid: '#0a0', controlBg: '#ddd' },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { HifzEntry } from '../src/screens/quran/HifzEntry';
import { ResumeDoors } from '../src/quran/ResumeDoors';
import { selectQuranCardState } from '../src/quran/quranCardState';
import { dayOf, markSurah, reviewPortion, type HifzState } from '../src/quran/hifz';
import { __resetDrillForTests, noteDrillFinished, lastDrill } from '../src/quran/hifzDrill';
import { juzCoverage } from '../src/quran/hifzProgress';
import { hifzReminderDue, hifzReminderVerdict } from '../src/notifications/hifzReminder';
import { __resetQuranStateForTests, getQuranState, updateHifz } from '../src/quran/quranState';
import { ayahIndexOf } from '../src/quran/ayahIndex';

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
  __resetDrillForTests();
  mockNavigate.mockReset();
});

describe('the drill hands over to the tracker', () => {
  it('offers the range a drill just played, and Mark keeps it', () => {
    act(() => {
      noteDrillFinished({ surah: 78, from: 1, to: 10 });
    });
    const tree = render(<HifzEntry />);
    expect(texts(tree.root)).toContain('Drilled An-Naba 1–10 — memorised');
    act(() => {
      byLabel(tree.root, 'Drilled An-Naba 1–10 — memorised — Mark').props.onPress();
    });
    const p = getQuranState().hifz!.portions[0];
    expect([p.start, p.end]).toEqual([ayahIndexOf(78, 1), ayahIndexOf(78, 10)]);
    // Taken up: the offer is gone, from the store and the row.
    expect(lastDrill()).toBeNull();
    expect(texts(tree.root)).not.toContain('Drilled An-Naba 1–10 — memorised');
  });

  it('is not offered once the range is by heart some other way', () => {
    const now = Date.now();
    act(() => {
      noteDrillFinished({ surah: 112, from: 1, to: 4 });
      updateHifz(prev => markSurah(prev, 112, dayOf(now), now));
    });
    const tree = render(<HifzEntry />);
    expect(texts(tree.root).some(s => s.startsWith('Drilled'))).toBe(false);
  });

  it('goes stale after half a day', () => {
    noteDrillFinished({ surah: 1, from: 1, to: 7 }, 0);
    expect(lastDrill(1000)).not.toBeNull();
    expect(lastDrill(13 * 3600 * 1000)).toBeNull();
  });
});

describe("Home's door", () => {
  it('counts what is due and unrecited, and opens the page', () => {
    const now = Date.now();
    act(() => {
      updateHifz(prev => markSurah(prev, 113, dayOf(now), now));
      updateHifz(prev => ({ ...prev, portions: prev.portions.map(p => ({ ...p, due: dayOf(now) })) }));
    });
    const card = selectQuranCardState(getQuranState(), now);
    expect(card.hifzDue).toBe(1);
    const onOpenHifz = jest.fn();
    const tree = render(
      <ResumeDoors
        state={card}
        onOpenKhatmah={() => {}}
        onOpenReading={() => {}}
        onOpenBookmark={() => {}}
        onOpenQuran={() => {}}
        onOpenHifz={onOpenHifz}
        showStart
        layout="columns"
      />,
    );
    act(() => {
      byLabel(tree.root, 'Revise today · 1 portions').props.onPress();
    });
    expect(onOpenHifz).toHaveBeenCalled();
  });

  it('is not drawn without the callback — the tab has its own row', () => {
    const now = Date.now();
    act(() => {
      updateHifz(prev => markSurah(prev, 113, dayOf(now), now));
      updateHifz(prev => ({ ...prev, portions: prev.portions.map(p => ({ ...p, due: dayOf(now) })) }));
    });
    const tree = render(
      <ResumeDoors
        state={selectQuranCardState(getQuranState(), now)}
        onOpenKhatmah={() => {}}
        onOpenReading={() => {}}
        onOpenBookmark={() => {}}
        onOpenQuran={() => {}}
        showStart
      />,
    );
    expect(texts(tree.root)).not.toContain('Revise today');
  });
});

describe('the reminder', () => {
  it('has nothing to say without a stock, and counts the day’s unrecited portions', () => {
    const now = Date.now();
    expect(hifzReminderVerdict(getQuranState(), now)).toBe('none');
    act(() => {
      updateHifz(prev => markSurah(markSurah(prev, 112, dayOf(now), now), 113, dayOf(now), now));
    });
    // Just memorised: due tomorrow, not today.
    expect(hifzReminderDue(getQuranState(), now)).toBe(0);
    expect(hifzReminderDue(getQuranState(), now + 864e5)).toBe(2);
    act(() => {
      updateHifz(prev => ({ ...prev, portions: prev.portions.map(p => ({ ...p, due: dayOf(now) })) }));
    });
    expect(hifzReminderDue(getQuranState(), now)).toBe(2);
    const before = hifzReminderVerdict(getQuranState(), now);
    act(() => {
      updateHifz(prev => reviewPortion(prev, prev.portions[0].id, 'fine', dayOf(now), now));
    });
    expect(hifzReminderDue(getQuranState(), now)).toBe(1);
    expect(hifzReminderVerdict(getQuranState(), now)).not.toBe(before);
  });
});

describe('the day’s budget', () => {
  it('counts what was recited today: three a day means three, not three at a time', () => {
    const now = Date.now();
    const today = dayOf(now);
    act(() => {
      for (let n = 105; n <= 114; n++) updateHifz(prev => markSurah(prev, n, today, now));
      updateHifz(prev => ({ ...prev, portions: prev.portions.map(p => ({ ...p, due: today })) }));
    });
    const tree = render(<HifzEntry />);
    for (const name of ['Al-Fil', 'Quraysh', 'Al-Maun']) {
      act(() => {
        byLabel(tree.root, `Recited ${name}`).props.onPress();
      });
    }
    const shown = texts(tree.root);
    expect(shown).toContain("Today's revision done");
    expect(shown).toContain('7 more tomorrow');
    expect(hifzReminderDue(getQuranState(), now)).toBe(0);
  });
});

describe('known surahs join the long cycle', () => {
  it('spreads Juz’ 30 over the month instead of putting it all on tomorrow', () => {
    const now = Date.now();
    const today = dayOf(now);
    let s: HifzState = { portions: [] };
    for (let n = 78; n <= 114; n++) s = markSurah(s, n, today, now, 'known');
    const perDay = new Map<string, number>();
    for (const p of s.portions) perDay.set(p.due, (perDay.get(p.due) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBe(2); // 37 over 30 days
    expect(perDay.size).toBe(30);
    expect(s.portions.every(p => p.interval === 30)).toBe(true);
    // Learning, by contrast, starts tomorrow and daily.
    const l = markSurah({ portions: [] }, 1, today, now);
    expect(l.portions[0].interval).toBe(1);
  });
});

describe('juz’ coverage', () => {
  it('counts the thirtieth juz’ full once its surahs are by heart', () => {
    const now = Date.now();
    let s: HifzState = { portions: [] };
    for (let n = 78; n <= 114; n++) s = markSurah(s, n, dayOf(now), now);
    const cov = juzCoverage(s);
    expect(cov).toHaveLength(30);
    expect(cov[29].memorised).toBe(cov[29].total);
    expect(cov[28].memorised).toBe(0);
    expect(cov.reduce((a, c) => a + c.total, 0)).toBe(6236);
  });
});
