/**
 * Bookmarks as doors: a shortcut under "Continue reading" on the Qur'an
 * tab, and one starred bookmark in the khatmah's slot on Home.
 *
 * Both are the reader's choice, made on the bookmark in the bookmark
 * list. The shortcut is a flag on the bookmark; the star is one id in the
 * preferences, so there can only ever be one, and it stands aside while a
 * khatmah runs.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';
import { readFileSync } from 'fs';
import path from 'path';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (k: string, d?: unknown) => {
      const opts = d as { defaultValue?: string } | string | undefined;
      const tpl = typeof opts === 'string' ? opts : (opts?.defaultValue ?? k);
      return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        String((opts as Record<string, unknown>)?.[key] ?? ''),
      );
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
      accentSolid: '#0a0',
      accentBg: '#efe',
      controlBg: '#ddd',
      border: '#ccc',
    },
  }),
}));

import {
  __resetQuranStateForTests,
  coerceQuranState,
  getQuranState,
  setQuranPrefs,
} from '../src/quran/quranState';
import { startKhatmah, abandonKhatmah } from '../src/quran/khatmahActions';
import {
  addBookmark,
  setBookmarkShortcut,
  setHomeBookmark,
} from '../src/quran/readerMarks';
import { selectQuranCardState } from '../src/quran/quranCardState';
import { ResumeDoors } from '../src/quran/ResumeDoors';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const marks = () => getQuranState().bookmarks;

const texts = (root: ReactTestInstance): string[] =>
  root
    .findAllByType('Text' as never, { deep: true })
    .flatMap(n =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
        .map(String),
    );

const buttons = (root: ReactTestInstance) => {
  const seen = new Set<string>();
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(n => typeof n.props.onPress === 'function')
    .filter(n => {
      const label = String(n.props.accessibilityLabel);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
};

function renderDoors(layout: 'stack' | 'columns', showStart = false) {
  const onOpenBookmark = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ResumeDoors
        state={selectQuranCardState(getQuranState())}
        onOpenKhatmah={jest.fn()}
        onOpenReading={jest.fn()}
        onOpenBookmark={onOpenBookmark}
        onOpenQuran={jest.fn()}
        showStart={showStart}
        layout={layout}
      />,
    );
  });
  return { tree, onOpenBookmark };
}

beforeEach(() => __resetQuranStateForTests());

describe('a shortcut bookmark', () => {
  it('is a flag on the bookmark, stamped like any other change, and off by default', () => {
    addBookmark(18, 1, 293, 'emerald');
    const id = marks()[0].id;
    expect(marks()[0].shortcut).toBeUndefined();
    setBookmarkShortcut(id, true);
    expect(marks()[0].shortcut).toBe(true);
    expect(marks()[0].updatedAt).toBeGreaterThan(0);
    setBookmarkShortcut(id, false);
    // Removed, not written false: a key that never existed must not
    // appear, or a snapshot merged with itself stops equalling itself.
    expect('shortcut' in marks()[0]).toBe(false);
  });

  it('survives the blob, and nothing else is read into it', () => {
    const state = coerceQuranState({
      bookmarks: [
        { id: 'a', surah: 18, ayah: 1, page: 293, color: 'emerald', createdAt: 1, shortcut: true },
        { id: 'b', surah: 67, ayah: 1, page: 562, color: 'rose', createdAt: 2, shortcut: 'yes' },
      ],
    });
    expect(state.bookmarks.find(b => b.id === 'a')?.shortcut).toBe(true);
    expect('shortcut' in state.bookmarks.find(b => b.id === 'b')!).toBe(false);
  });

  it('is a row on the tab, under the other doors, in book order — and never on Home', () => {
    addBookmark(67, 1, 562, 'rose');
    addBookmark(18, 1, 293, 'emerald');
    for (const b of marks()) setBookmarkShortcut(b.id, true);
    const card = selectQuranCardState(getQuranState());
    expect(card.shortcuts.map(b => b.surah)).toEqual([18, 67]);

    const tab = renderDoors('stack');
    const shown = texts(tab.tree.root);
    expect(shown.filter(s => s === 'Bookmark')).toHaveLength(2);
    expect(buttons(tab.tree.root)).toHaveLength(2);
    act(() => buttons(tab.tree.root)[0].props.onPress());
    expect(tab.onOpenBookmark).toHaveBeenCalledWith(expect.objectContaining({ surah: 18 }));

    // Home draws the two doors or the way in, and a shortcut is neither.
    const home = renderDoors('columns', true);
    expect(texts(home.tree.root)).toContain('Start reading');
    expect(texts(home.tree.root)).not.toContain('Bookmark');
  });
});

describe('the starred bookmark', () => {
  it('is one id, so starring another takes the star with it', () => {
    addBookmark(18, 1, 293, 'emerald');
    addBookmark(67, 1, 562, 'rose');
    const [a, b] = marks();
    setHomeBookmark(a.id);
    expect(getQuranState().prefs.homeBookmarkId).toBe(a.id);
    setHomeBookmark(b.id);
    expect(getQuranState().prefs.homeBookmarkId).toBe(b.id);
    setHomeBookmark(null);
    expect(getQuranState().prefs.homeBookmarkId).toBe('');
  });

  it('takes the khatmah\'s slot on Home, and opens the bookmark', () => {
    addBookmark(18, 1, 293, 'emerald');
    setHomeBookmark(marks()[0].id);
    const card = selectQuranCardState(getQuranState());
    expect(card.homeBookmark?.surah).toBe(18);
    const home = renderDoors('columns', true);
    expect(texts(home.tree.root)).not.toContain('Start reading');
    expect(texts(home.tree.root)).toContain('Bookmark');
    expect(buttons(home.tree.root)).toHaveLength(1);
    act(() => buttons(home.tree.root)[0].props.onPress());
    expect(home.onOpenBookmark).toHaveBeenCalledWith(expect.objectContaining({ surah: 18 }));
  });

  it('stands aside while a khatmah runs, and comes back when it is gone', () => {
    addBookmark(18, 1, 293, 'emerald');
    setHomeBookmark(marks()[0].id);
    startKhatmah(30);
    const live = selectQuranCardState(getQuranState());
    expect(live.khatmah).not.toBeNull();
    expect(live.homeBookmark).toBeNull();
    // The id is kept — the reader chose it, and the plan is what is in
    // the way.
    expect(getQuranState().prefs.homeBookmarkId).toBe(marks()[0].id);
    abandonKhatmah(getQuranState().khatmah[0].id);
    expect(selectQuranCardState(getQuranState()).homeBookmark?.surah).toBe(18);
  });

  it('is not drawn once the bookmark is deleted, and an unknown id in the blob is harmless', () => {
    const state = coerceQuranState({ prefs: { homeBookmarkId: 'gone' } });
    expect(state.prefs.homeBookmarkId).toBe('gone');
    expect(selectQuranCardState(state).homeBookmark).toBeNull();
    expect(coerceQuranState({ prefs: { homeBookmarkId: 7 } }).prefs.homeBookmarkId).toBe('');
  });

  it('is disabled on the list while a khatmah runs, and the list says what it does', () => {
    const screen = src('src/screens/QuranScreen.tsx');
    expect(screen).toContain('disabled={plan != null}');
    expect(screen).toMatch(/t\(\s*'quran\.homeBookmarkHelp'/);
    expect(screen).toMatch(/t\(\s*'quran\.homeBookmarkHelpKhatmah'/);
    expect(screen).toContain('setBookmarkShortcut(b.id, next)');
  });
});

describe('one bookmark per colour', () => {
  it('tapping a colour that is on another ayah moves that bookmark here, identity and all', () => {
    addBookmark(18, 1, 293, 'emerald');
    const id = marks()[0].id;
    setBookmarkShortcut(id, true);
    setHomeBookmark(id);
    addBookmark(67, 1, 562, 'emerald');
    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toMatchObject({ id, surah: 67, ayah: 1, page: 562, color: 'emerald', shortcut: true });
    expect(getQuranState().prefs.homeBookmarkId).toBe(id);
  });

  it('a bookmark already on the ayah gives way to the colour\'s, and is buried for the other device', () => {
    addBookmark(18, 1, 293, 'emerald');
    addBookmark(67, 1, 562, 'rose');
    const rose = marks().find(b => b.color === 'rose')!;
    // Tap emerald on Al-Mulk: the emerald bookmark comes here; rose goes.
    addBookmark(67, 1, 562, 'emerald');
    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toMatchObject({ surah: 67, color: 'emerald' });
    expect(getQuranState().bookmarksRemoved?.some(r => r.id === rose.id)).toBe(true);
  });

  it('recolouring the ayah\'s own bookmark to a free colour keeps it where it is', () => {
    addBookmark(18, 1, 293, 'emerald');
    const id = marks()[0].id;
    addBookmark(18, 1, 293, 'rose');
    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toMatchObject({ id, surah: 18, color: 'rose' });
  });

  it('the sheet marks the colours in use and names them', () => {
    const sheet = src('src/quran/mushaf/AyahActionSheet.tsx');
    expect(sheet).toContain('coloursInUse.get(color)');
    // A taken colour is ringed (here or elsewhere), and names its ayah underneath.
    expect(sheet).toContain('const ringed = selected || elsewhere != null;');
    expect(sheet).toContain('{ringed ? <View style={[styles.swatchRing, { borderColor: tint }]} /> : null}');
    expect(sheet).toContain('`${elsewhere.surah}:${elsewhere.ayah}`');
    expect(sheet).toContain("'quran.bookmarkCircledHint'");
  });
});

describe('reusing colours — the setting', () => {
  it('is off by default, and on it lets a colour repeat without moving anything', () => {
    expect(getQuranState().prefs.bookmarkColourReuse).toBe(false);
    setQuranPrefs({ bookmarkColourReuse: true });
    addBookmark(18, 1, 293, 'emerald');
    addBookmark(67, 1, 562, 'emerald');
    expect(marks()).toHaveLength(2);
    expect(marks().map(b => b.surah).sort()).toEqual([18, 67]);
  });

  it('is switched on for a blob that already holds two bookmarks in one colour — once, and then kept', () => {
    const two = [
      { id: 'a', surah: 18, ayah: 1, page: 293, color: 'emerald', createdAt: 1 },
      { id: 'b', surah: 67, ayah: 1, page: 562, color: 'emerald', createdAt: 2 },
    ];
    expect(coerceQuranState({ bookmarks: two }).prefs.bookmarkColourReuse).toBe(true);
    expect(coerceQuranState({ bookmarks: two, prefs: { bookmarkColourReuse: false } }).prefs.bookmarkColourReuse).toBe(false);
    expect(coerceQuranState({ bookmarks: [two[0]] }).prefs.bookmarkColourReuse).toBe(false);
    // Nothing of theirs is lost on the way in.
    expect(coerceQuranState({ bookmarks: two }).bookmarks).toHaveLength(2);
  });

  it('has a row in Settings → Quran', () => {
    expect(src('src/screens/settings/QuranCard.tsx')).toContain("setQuranPrefs({ bookmarkColourReuse: next })");
  });
});

describe('the verse of the day', () => {
  it('is off by default and a setting, and the tab fetches nothing while it is off', () => {
    expect(getQuranState().prefs.verseOfDay).toBe(false);
    expect(coerceQuranState({ prefs: { verseOfDay: true } }).prefs.verseOfDay).toBe(true);
    expect(coerceQuranState({ prefs: { verseOfDay: 'yes' } }).prefs.verseOfDay).toBe(false);
    const screen = src('src/screens/QuranScreen.tsx');
    expect(screen).toContain('{votdOn && votdArabic ? (');
    expect(screen.match(/if \(!votdOn\) return;/g)).toHaveLength(2);
    expect(screen).toContain("if (!votdOn || votdMode !== 'tafsir') return;");
    const settings = src('src/screens/settings/QuranCard.tsx');
    expect(settings).toContain("setQuranPrefs({ verseOfDay: next })");
  });
});
