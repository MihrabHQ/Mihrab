// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
/**
 * Quran index screen — Quran Reader v2
 * (docs/quran-reader-plan.md, QR-10/11/12/21/22/23).
 *
 * Three tabs: Surah / Juz / Bookmarks, plus search across surah names,
 * Arabic text (diacritic-insensitive) and the active translation.
 * Above the tabs: the doors back into the book (the khatmah's next page,
 * the reading marker, the bookmarks the reader put there), one row that
 * leads to the khatmah's own page — beside Tilāwah's, until there is a
 * plan — and, for a reader who switched it on in Settings, the verse of
 * the day. The khatmah card itself is `KhatmahScreen`; what sits under
 * each verse is chosen in Settings → Quran and on any āyah.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  I18nManager,
  Modal,
  useWindowDimensions,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { afterInteractions } from '../utils/afterInteractions';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { useAppPalette } from '../hooks/useAppPalette';
import type { AppPalette } from '../theme/appPalette';
import { SegmentedControl } from '../components/ui';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import type { RootStackParamList } from '../navigation/types';
import { findPageForAyah, MUSHAF_PAGES } from '../quran/pages';
import { hydrateRiwayahData } from '../quran/riwayahData';
import { warmMushafLayout } from '../quran/mushafLayout';
import { RIWAYAT } from '../quran/riwayat';
import { MUSHAF_TOTAL_PAGES } from '../quran/mushafImages';
import { findSurah, loadSurah, SURAHS, type SurahIndex } from '../quran/quran';
import { getAyahTranslation } from '../quran/translations';
import { useActiveEdition } from '../quran/useActiveEdition';
import {
  hydrateQuranState,
  setQuranPrefs,
  useQuranState,
  BOOKMARK_COLORS,
} from '../quran/quranState';
import { activeKhatmah } from '../quran/khatmahProgress';
import {
  removeBookmark,
  setBookmarkFollows,
  setBookmarkShortcut,
  setHomeBookmark,
  toggleStar,
} from '../quran/readerMarks';
import { loadTafsir, resolveTafsirEdition } from '../quran/tafsir';
import { useIslamicDay } from '../hijri/useIslamicDay';
import { selectQuranCardState } from '../quran/quranCardState';
import { ResumeDoors } from '../quran/ResumeDoors';
import { searchQuran, type QuranSearchResult } from '../quran/search';
import { useVerseOfTheDay } from '../quran/useVerseOfTheDay';
import { SyncHint } from './sync/SyncHint';
import { cardEdgeStyle } from '../theme/chrome';
import { TYPE, arabicTextStyle } from '../theme/typography';
import {
  surahHeaderGlyph,
  surahHeaderStyle,
  surahNameSize,
} from '../quran/surahHeaderGlyph';
import { useTabBarInset } from '../navigation/tabBarInset';
import { useTabPageTop } from '../navigation/useTabPageTop';
import {
  QuranDownloadStripView,
  useQuranDownloadRun,
} from '../quran/QuranDownloadStrip';
import { SyncHeaderButton } from './sync/SyncHeaderButton';
import { TilawahRow } from './quran/TilawahRow';
import { KhatmahEntry } from './quran/KhatmahEntry';
import { useTabBarScroll } from '../navigation/tabBarVisibility';
import { RADIUS, SPACING } from '../theme/tokens';

type Tab = 'surah' | 'juz' | 'bookmarks';
const TABS: Tab[] = ['surah', 'juz', 'bookmarks'];
/** Sideways travel before a pan is a swipe, and vertical travel that makes it a scroll. */
const SWIPE_ACTIVATE = 24;
const SWIPE_FAIL_Y = 16;
/** A swipe that ends shorter than this, and slower than this, is not one. */
const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 500;

/**
 * Which tab a swipe lands on. A swipe towards the start of the row (left,
 * in a left-to-right layout) goes to the NEXT tab, as paging does; in a
 * mirrored layout the row runs the other way and so does the swipe.
 * Exported for the test; pure.
 */
export function tabAfterSwipe(
  current: Tab,
  translationX: number,
  velocityX: number,
  rtl: boolean,
): Tab {
  const far = Math.abs(translationX) >= SWIPE_DISTANCE;
  const fast = Math.abs(velocityX) >= SWIPE_VELOCITY;
  if (!far && !fast) return current;
  const sign = Math.sign(far ? translationX : velocityX) * (rtl ? -1 : 1);
  const index = TABS.indexOf(current) + (sign < 0 ? 1 : -1);
  return TABS[Math.max(0, Math.min(TABS.length - 1, index))];
}

/**
 * The surahs with a standing appointment — issue #23.
 *
 * Al-Kahf on Friday and Al-Mulk before sleep, both named in well-known
 * ḥadīth, are the two people open on a schedule rather than look up.
 * Deliberately just the two: a shortcut row grows into a second list the
 * moment it tries to be a favourites feature, and this one is meant to
 * cost nothing to skip.
 */
const OFTEN_READ = [18, 67] as const;

type JuzRow = { juz: number; page: number; startSurah: SurahIndex | undefined };

/** The inset hairline under a surah or juz row. Nothing under flat chrome. */
function RowLine({ palette }: { palette: AppPalette }) {
  if (palette.flatChrome) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.rowLine, { backgroundColor: palette.border }]}
    />
  );
}

export function QuranScreen() {
  const quranWide = useBreakpoint() !== 'compact';
  const listCap = quranWide ? styles.listWide : null;
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  // Two dialogs on this screen open with an autoFocus field in them.
  const keyboardInset = useKeyboardInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useAndroidSubScreenBack();
  /**
   * Pressing the Quran tab while already on it returns to the top — the
   * same rule as Today, the Log, Duas and Settings, and the one this
   * screen most needs: the surah list is 114 rows and the juz list 30, so
   * "back to the top" was otherwise a long swipe with no shortcut.
   *
   * ONE ref for all three lists. The tab renders exactly one of them at a
   * time, so at any moment this holds whichever is mounted; React detaches
   * the outgoing list before it attaches the incoming one, so a switch
   * never leaves the ref pointing at a list that is gone.
   */
  const listRef = useRef<FlatList>(null);
  useScrollToTop(listRef);
  // The search box lives in the list header, so it travels with the
  // list: tap it after scrolling and it is the list that has to move.
  const kb = useKeyboardAwareScroll<FlatList>(listRef);
  const isArabic = i18n.language === 'ar';
  const quran = useQuranState();
  // What is playing is no longer this screen's business: the bar under
  // the title names it and opens both the player and the reader, on
  // every screen. The card that used to do that here sat forty points
  // under the bar saying the same surah and ayah.
  /**
   * Is there a second muṣḥaf to offer at all?
   *
   * The TABLE, not what this device has installed — the link's job is to
   * lead someone to the screen where they can get one, so it has to be
   * there before they have it. It disappears only in a build that knows
   * one recitation, which is a build with nothing to link to.
   */
  const riwayahOffered = RIWAYAT.some(r => r.render === 'unicode' && r.source);
  const edition = useActiveEdition();

  useEffect(() => {
    void hydrateQuranState();
    void hydrateRiwayahData();
  }, []);

  // Whoever is on this tab is one tap from the reader. Its page-layout
  // data — the largest file in the app — comes in now, once the list has
  // settled, instead of during the push transition of the surah they tap.
  const riwayahForWarm = quran.prefs.riwayah;
  useEffect(() => {
    const task = afterInteractions(() =>
      warmMushafLayout(riwayahForWarm),
    );
    return () => task.cancel();
  }, [riwayahForWarm]);

  const [tab, setTab] = useState<Tab>('surah');
  const tabRef = useRef<Tab>('surah');
  tabRef.current = tab;
  /**
   * The bar floats OVER the list, inside this area's bounds, and a
   * hold-and-slide along it (`TabBarButton`) is a horizontal pan too. A
   * swipe that began under the bar is the bar's, not the tabs'.
   */
  const windowH = useWindowDimensions().height;
  const barTopRef = useRef(0);
  barTopRef.current = windowH - useTabBarInset();
  const swipeStartY = useRef(0);
  const tabSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
        .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
        .runOnJS(true)
        .onBegin(e => {
          swipeStartY.current = e.absoluteY;
        })
        .onEnd(e => {
          if (swipeStartY.current >= barTopRef.current) return;
          const next = tabAfterSwipe(tabRef.current, e.translationX, e.velocityX, I18nManager.isRTL);
          if (next !== tabRef.current) setTab(next);
        }),
    [],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuranSearchResult[] | null>(null);
  // Go-to-page (v2.8.5) — a page number typed here opens the mushaf there.
  const tabBarInset = useTabBarInset();
  const pageTop = useTabPageTop();
  /**
   * The download strip, when anything is downloading.
   *
   * This tab draws no header (see `useTabPageTop`), so the strip is the
   * top of the page while it is up and has to clear the status bar
   * itself — `pageTop` minus its own breathing room is exactly that
   * inset. The lists then start below the strip rather than below the
   * status bar, or the page would open with a band of nothing in it.
   */
  const download = useQuranDownloadRun();
  const stripOn = download.running != null;
  const listTop = stripOn ? SPACING.md : pageTop;
  // The bar gets out of the way while reading — see tabBarVisibility.ts.
  const tabBarScroll = useTabBarScroll();
  const [pageJumpVisible, setPageJumpVisible] = useState(false);
  const [pageJumpText, setPageJumpText] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced full-text search (QR-22).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void searchQuran(q, edition, 50).then(setResults);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, edition]);

  // Verse of the day (QR-23). The hook re-reads the date at midnight and on
  // resume, so the card and the daily notification — which now schedules the
  // same date-seeded verse — never show different ayahs.
  const votdRef = useVerseOfTheDay();
  // A setting now (Settings → Quran), off unless asked for: the card is
  // one more thing above the surah list, and most readers never opened
  // it. Off, nothing below is fetched either.
  const votdOn = quran.prefs.verseOfDay;
  const [votdArabic, setVotdArabic] = useState('');
  useEffect(() => {
    if (!votdOn) return;
    let cancelled = false;
    void loadSurah(votdRef.surah).then(loaded => {
      if (cancelled || !loaded) return;
      setVotdArabic(loaded.arabic[votdRef.ayah - 1] ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [votdRef, votdOn]);
  // Fetched, not read: the editions live on disk now rather than in the
  // JS bundle. Empty for the first frame, which the card already handles
  // — it falls back to the reference alone.
  const [votdTranslation, setVotdTranslation] = useState('');
  useEffect(() => {
    if (!votdOn) return;
    let cancelled = false;
    getAyahTranslation(edition, votdRef.surah, votdRef.ayah)
      .then(text => {
        if (!cancelled) setVotdTranslation(text);
      })
      .catch(() => {
        if (!cancelled) setVotdTranslation('');
      });
    return () => {
      cancelled = true;
    };
  }, [edition, votdRef, votdOn]);
  const votdSurah = findSurah(votdRef.surah);
  // Second row of the card follows the app-wide companion mode (v2.7.40) —
  // the toggle here IS the global switch, and the edition caption below
  // opens the shared companion-text sheet.
  const votdMode = quran.prefs.companionMode;
  const [votdTafsir, setVotdTafsir] = useState<string | null>(null);
  // Tafsir can be long — show a few lines by default with a "Show more" expand.
  const [votdExpanded, setVotdExpanded] = useState(false);
  /**
   * Is the verse-of-the-day card open, and is the search field showing?
   *
   * The first is a preference, because the answer should survive leaving
   * the tab — someone who opened the card wants it open tomorrow too. The
   * second is not: a search is a thing you are doing right now, and coming
   * back to the tab a day later to find a stale query in a field you
   * forgot about is worse than one tap.
   */
  const votdOpen = quran.prefs.verseOfDayOpen;
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!votdOn || votdMode !== 'tafsir') return;
    let cancelled = false;
    // The user's chosen tafsir edition — not the locale default (v2.7.40).
    const ed = resolveTafsirEdition(
      quran.prefs.tafsirEditionId,
      (i18n.language || 'en').slice(0, 2),
    );
    if (!ed) return;
    setVotdTafsir(null);
    void loadTafsir(ed.id, votdRef.surah, votdRef.ayah).then(text => {
      if (!cancelled) setVotdTafsir(text);
    });
    return () => {
      cancelled = true;
    };
  }, [votdOn, votdMode, votdRef, i18n.language, quran.prefs.tafsirEditionId]);

  const openSurah = (
    surahNumber: number,
    scrollToAyah?: number,
    page?: number,
    sessionBookmarkId?: string,
    sessionKhatmah?: boolean,
  ) => {
    navigation.navigate('QuranSurah', {
      surahNumber,
      scrollToAyah,
      initialPage: page,
      sessionBookmarkId,
      sessionKhatmah,
    });
  };

  /**
   * Open the mushaf at a typed page. The reader is addressed by surah, so
   * the page has to name the surah it starts inside — otherwise the header
   * and the khatmah bookkeeping would be talking about a different place
   * than the page on screen.
   */
  const goToPage = (text: string) => {
    const n = Number(text.trim());
    if (!Number.isFinite(n)) return;
    const page = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, Math.round(n)));
    const surah = MUSHAF_PAGES.find(p => p.page === page)?.start.surah ?? 1;
    setPageJumpVisible(false);
    openSurah(surah, undefined, page);
  };

  // ── Surah tab data (name filter applies instantly) ──────────────────
  const filteredSurahs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(
      s =>
        s.romanized.toLowerCase().includes(q) ||
        s.english.toLowerCase().includes(q) ||
        s.arabic.includes(query.trim()) ||
        String(s.number) === q,
    );
  }, [query]);

  // ── Juz tab data ────────────────────────────────────────────────────
  const juzRows: JuzRow[] = useMemo(() => {
    const rows: JuzRow[] = [];
    for (let j = 1; j <= 30; j++) {
      const firstPage = MUSHAF_PAGES.find(p => p.juz === j);
      if (!firstPage) continue;
      rows.push({
        juz: j,
        page: firstPage.page,
        startSurah: findSurah(firstPage.start.surah),
      });
    }
    return rows;
  }, []);

  // ── Header (cards + tabs + search) ──────────────────────────────────
  // The two doors, from the selector Home's card uses (#41). Subscribed
  // to the boundary because the day's portion turns at maghrib and no
  // state this screen holds turns with it.
  useIslamicDay();
  const doors = selectQuranCardState(quran);
  const plan = activeKhatmah(quran);
  // Bar widths. Clamped because a plan synced from another device can
  // claim more read than the book holds, and a negative width crashes.

  /**
   * An honest scroll indicator — v2.14.5.
   *
   * Without `getItemLayout` a virtualised list can only report the height
   * of what it has actually measured, and it says so: the tail spacer is
   * capped at the highest measured frame. So the content starts out
   * looking about a dozen rows long, the indicator is drawn huge, and it
   * shrinks all the way down the surah list as the real height arrives —
   * which means its POSITION was lying too, from the top, where it
   * matters most.
   *
   * Both numbers are measured rather than assumed, because both move
   * with the user's font-size setting: the header once (it holds the
   * search box, the tabs and the continue-reading card), and the first
   * row once. Until both have arrived `getItemLayout` is undefined and
   * the list behaves exactly as it did before.
   *
   * The rows are separated by the content container's `gap`, and it sits
   * inside its `padding`, so both belong in the offset — hence the two
   * named constants shared with the stylesheet rather than two numbers
   * typed twice.
   */
  const [headerH, setHeaderH] = useState(0);
  const [surahRowH, setSurahRowH] = useState(0);
  const [juzRowH, setJuzRowH] = useState(0);
  const itemLayoutFor = useCallback(
    (rowH: number) =>
      headerH > 0 && rowH > 0
        ? (_: unknown, index: number) => ({
            length: rowH,
            offset:
              LIST_PADDING + headerH + HEADER_GAP + index * (rowH + LIST_GAP),
            index,
          })
        : undefined,
    [headerH],
  );

  const header = (
    <View
      style={[styles.headerWrap, listCap]}
      onLayout={e => setHeaderH(e.nativeEvent.layout.height)}>
      {/* The doors back into the book — the khatmah's next page and the
          reading marker, both when the reader keeps both (#41). The same
          rows Home draws, from the same selector, so the two screens
          cannot disagree about where "Continue" leads. Absent when there
          is nothing to continue: this screen IS the way in. */}
      {doors.khatmah || doors.reading || doors.shortcuts.length > 0 ? (
        <View
          style={[
            styles.doorsCard,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <ResumeDoors
            state={doors}
            // One line a door: there can be three and more here.
            dense
            // Both the page and the ayah, whichever reader recorded the
            // place: the muṣḥaf takes the page and the translation reader
            // the ayah, and a marker pinned in one reader still lands in
            // the other after the mode has been switched.
            // The khatmah's own door: this visit is the plan's, which is
            // what puts the done-marks in the header — see `readingSession`.
            onOpenKhatmah={target =>
              openSurah(target.surah, target.ayah, target.page, undefined, true)
            }
            onOpenReading={marker => openSurah(marker.surah, marker.ayah, marker.page)}
            // A shortcut is the bookmark, opened: the visit is its, as from
            // the list.
            onOpenBookmark={b => openSurah(b.surah, b.ayah, b.page, b.id)}
            onOpenQuran={() => {}}
          />
        </View>
      ) : null}

      {/* Said where it lands: this card is the user's place in the mushaf,
          and the whole point of sync is that the place follows them. Shows
          only until sync works or they wave it away — see SyncHint. */}
      <SyncHint place="quran" />

      {/* The khatmah's row, or — with no plan — the two buttons that lead
          to a khatmah and to Tilāwah. The card itself is its own page now;
          see `KhatmahEntry`. */}
      <KhatmahEntry />

      {/* Tilāwah, as a row under the khatmah — what is playing (or would
          play), play/pause, next surah; the row opens the player. Only
          beside a live plan: without one it is the half-row above. */}
      {plan ? <TilawahRow /> : null}

      {/* Verse of the day (QR-23).

          CLOSED TO BEGIN WITH, and the reader's choice is remembered.

          It was four to six lines of Arabic and tafsir sitting between
          someone and the surah list they opened the tab for, every single
          time — and a screen you scroll past the same block on every day
          is one whose top you stop reading. Collapsed, the row still
          carries the reference, which is the part that makes anyone want
          to open it. */}
      {votdOn && votdArabic ? (
        <View
          style={[
            styles.votdCard,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: votdOpen }}
            accessibilityLabel={t('quran.verseOfDay', 'Verse of the day')}
            onPress={() => setQuranPrefs({ verseOfDayOpen: !votdOpen })}
            style={styles.votdHeaderRow}>
            <Text style={[styles.votdLabel, { color: palette.muted }]}>
              {t('quran.verseOfDay', 'Verse of the day')}
            </Text>
            <View style={styles.votdHeaderEnd}>
              <Text style={[styles.votdRef, { color: palette.accentSolid }]}>
                {`${votdSurah?.romanized ?? ''} ${votdRef.surah}:${votdRef.ayah}`}
              </Text>
              <Text style={[styles.votdChevron, { color: palette.muted }]}>
                {votdOpen ? '⌃' : '⌄'}
              </Text>
            </View>
          </Pressable>
          {votdOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.openInReader', 'Open in the reader')}
            onPress={() =>
              openSurah(
                votdRef.surah,
                votdRef.ayah,
                findPageForAyah(votdRef.surah, votdRef.ayah),
              )
            }>
          {/* Row 1: the ayah. Row 2: translation or tafsir. */}
          <Text
            numberOfLines={2}
            style={[styles.votdArabic, { color: palette.text }]}>
            {votdArabic}
          </Text>
          {votdMode === 'tafsir' ? (
            <>
              <Text
                numberOfLines={votdExpanded ? undefined : 4}
                style={[styles.votdTranslation, { color: palette.muted }]}>
                {votdTafsir ??
                  t(
                    'quran.tafsirUnavailable',
                    'Tafsir unavailable — connect to the internet once to download it.',
                  )}
              </Text>
              {votdTafsir && votdTafsir.length > 220 ? (
                // Own Pressable — claims the touch so the card's open-in-reader
                // press doesn't also fire when expanding the tafsir.
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  onPress={() => setVotdExpanded(v => !v)}>
                  <Text style={[styles.votdShowMore, { color: palette.accentSolid }]}>
                    {votdExpanded
                      ? t('quran.showLess', 'Show less')
                      : t('quran.showMore', 'Show more')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : votdTranslation ? (
            <Text
              numberOfLines={3}
              style={[styles.votdTranslation, { color: palette.muted }]}>
              {votdTranslation}
            </Text>
          ) : null}
          </Pressable>
          ) : null}
        </View>
      ) : null}


      {/* Search (QR-22) + go-to-page (v2.8.5), both BEHIND their glyphs.

          The field used to sit open across the screen whether or not
          anyone was searching — a permanent row of chrome above the list
          it filters. It is one tap now, and the tap puts the cursor in it,
          which is the same number of touches as before for the person who
          actually came to search and one fewer row of furniture for
          everyone else.

          Go-to-page is here for the reason it always was: someone who
          knows they want page 440 had to open a surah first and find the
          jump control inside the reader. The mushaf is paginated; a page
          number is a first-class address and belongs on the screen that
          lists everything else you can address. */}
      {searchOpen ? (
      <View style={styles.searchRow}>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={t('quran.searchPlaceholder', 'Search surahs, ayahs, translation…')}
          placeholderTextColor={String(palette.muted)}
          accessibilityLabel={t('quran.searchPlaceholder', 'Search surahs, ayahs, translation…')}
          clearButtonMode="while-editing"
          style={[
            styles.search,
            styles.searchGrow,
            {
              color: palette.text,
              backgroundColor: palette.card,
              ...cardEdgeStyle(palette),
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => {
            setQuery('');
            setSearchOpen(false);
          }}
          style={[
            styles.pageJumpBtn,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.pageJumpGlyph, { color: palette.muted }]}>
            ✕
          </Text>
        </Pressable>
      </View>
      ) : null}

      {/* Tabs (QR-11), with the two glyphs that open a field beside them. */}
      <View style={styles.tabsRow}>
      <View style={styles.tabsGrow}>
        <SegmentedControl
          accessibilityLabel={t('quran.tabSurah', 'Surah')}
          segments={[
            { key: 'surah', label: t('quran.tabSurah', 'Surah') },
            { key: 'juz', label: t('quran.tabJuz', 'Juz') },
            { key: 'bookmarks', label: t('quran.tabBookmarks', 'Bookmarks') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
        {searchOpen ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'quran.searchPlaceholder',
              'Search surahs, ayahs, translation…',
            )}
            onPress={() => setSearchOpen(true)}
            style={[
              styles.pageJumpBtn,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <Text
              style={[styles.pageJumpGlyph, { color: palette.accentSolid }]}>
              ⌕
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
          onPress={() => {
            setPageJumpText('');
            setPageJumpVisible(true);
          }}
          style={[
            styles.pageJumpBtn,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.pageJumpGlyph, { color: palette.accentSolid }]}>
            ⌗
          </Text>
        </Pressable>
      </View>

      {/* The two surahs with a place in the week — issue #23.
          
          Al-Kahf on Friday and Al-Mulk before sleep are read on a
          schedule rather than looked up, and reaching them meant
          scrolling 18 and 67 rows or typing a name that has four
          spellings in Latin letters. Only on the surah tab, and only
          while nothing is being searched: they are a shortcut past the
          list, so above a list that is already narrowed they would be in
          the way. */}
      {tab === 'surah' && !query.trim() && results == null ? (
        <View style={styles.oftenRow}>
          <Text style={[styles.oftenLabel, { color: palette.muted }]}>
            {t('quran.oftenRead', { defaultValue: 'Often read' })}
          </Text>
          {OFTEN_READ.map(number => {
            const surah = findSurah(number);
            if (!surah) return null;
            return (
              <Pressable
                key={number}
                accessibilityRole="button"
                accessibilityLabel={`${surah.romanized} — ${surah.english}`}
                onPress={() => openSurah(number)}
                style={[
                  styles.oftenChip,
                  {
                    backgroundColor: palette.card,
                    ...cardEdgeStyle(palette),
                  },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[styles.oftenChipText, { color: palette.text }]}>
                  {isArabic ? surah.arabic : surah.romanized}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Manage downloads (v2.7.28), and beside it the way to a second
          muṣḥaf.
          
          Both land on the same screen. "Manage downloads" is where you go
          when you already know something is on the device; nobody reads it
          as "and here is how to read Warsh", which is a feature that
          otherwise has no door on the screen it belongs to. The riwayah
          link is shown only when there is a riwayah to offer at all — a
          build that knows one recitation should not advertise a picker. */}
      <View style={styles.downloadsRow}>
        {/* Sync, once it is set up — it used to sit in the title bar. */}
        <SyncHeaderButton />
        {riwayahOffered ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'downloads.riwayat',
              'Reading traditions',
            )}
            onPress={() => navigation.navigate('QuranDownloads')}
            style={styles.downloadsLink}>
            <Text
              style={{
                color: palette.accentSolid,
                fontSize: TYPE.label.fontSize,
                fontWeight: '700',
              }}>
              {t('downloads.riwayat', 'Reading traditions')} ›
            </Text>
          </Pressable>
        ) : null}
        {/* The tajwīd colours' door, beside the riwayah's: both are ways
            to read the same book differently, and the guide is what
            makes the colours worth turning on. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tajweed.title', 'Tajweed colours')}
          onPress={() => navigation.navigate('QuranTajweed')}
          style={styles.downloadsLink}>
          <Text
            style={{
              color: palette.accentSolid,
              fontSize: TYPE.label.fontSize,
              fontWeight: '700',
            }}>
            {t('tajweed.title', 'Tajweed colours')} ›
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('downloads.title', 'Manage downloads')}
          onPress={() => navigation.navigate('QuranDownloads')}
          style={styles.downloadsLink}>
          <Text
            style={{ color: palette.muted, fontSize: TYPE.label.fontSize, fontWeight: '600' }}>
            {t('downloads.title', 'Manage downloads')} ›
          </Text>
        </Pressable>
      </View>

      {/* Full-text results */}
      {results != null ? (
        <View style={styles.resultsWrap}>
          <Text style={[styles.resultsLabel, { color: palette.muted }]}>
            {t('quran.searchResults', {
              defaultValue: '{{count}} ayah matches',
              count: results.length,
            })}
          </Text>
          {results.map(r => (
            <Pressable
              key={`${r.surah}:${r.ayah}`}
              accessibilityRole="button"
              accessibilityLabel={`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
              onPress={() => openSurah(r.surah, r.ayah)}
              style={[
                styles.resultRow,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <Text style={[styles.resultRef, { color: palette.accentSolid }]}>
                {`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.resultArabic, { color: palette.text }]}>
                {r.arabic}
              </Text>
              {r.translation ? (
                <Text
                  numberOfLines={2}
                  style={[styles.resultTranslation, { color: palette.muted }]}>
                  {r.translation}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  // ── Rows per tab ────────────────────────────────────────────────────
  const renderSurahRow = ({
    item,
    index,
  }: {
    item: SurahIndex;
    index: number;
  }) => {
    const startPage = findPageForAyah(item.number, 1);
    return (
      <Pressable
        // One row is every row: the three lines below are clamped, so the
        // measurement taken here holds for all 114.
        onLayout={
          index === 0
            ? e => setSurahRowH(e.nativeEvent.layout.height)
            : undefined
        }
        accessibilityRole="button"
        accessibilityLabel={`${item.number}. ${item.romanized} — ${t('quran.pageLabel', { page: startPage })}`}
        onPress={() => openSurah(item.number)}
        style={({ pressed }) => [
          styles.row,
          listCap,
          pressed && { backgroundColor: palette.controlBg },
        ]}>
        <RowLine palette={palette} />
        <View style={[styles.numberBadge, { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.numberText, { color: palette.accent }]}>
            {item.number}
          </Text>
        </View>
        <View style={styles.rowText}>
          {/* One line each, so every row is the same height and the
              measured one above speaks for all of them. Nothing is lost:
              the whole of it is in the row's accessibility label. */}
          {!isArabic ? (
            <Text
              numberOfLines={1}
              style={[styles.romanized, { color: palette.text }]}>
              {item.romanized}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.english, { color: palette.muted }]}>
            {isArabic ? '' : `${item.english} · `}
            {t('quran.ayahCount', { count: item.ayahCount })} ·{' '}
            {item.type === 'meccan' ? t('quran.meccan') : t('quran.medinan')}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.pageHint, { color: palette.muted }]}>
            {t('quran.pageLabel', { page: startPage })}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          // NO adjustsFontSizeToFit HERE — see the note above `arabic`.
          allowFontScaling={false}
          // A drawing of the header, not text — the row's own label names
          // the surah for screen readers.
          accessible={false}
          importantForAccessibility="no"
          // Each name at its own size — see `SURAH_NAME_SIZES`. The line
          // height is the base's, so the row is the same height either way.
          style={[
            styles.arabic,
            { color: palette.text, fontSize: surahNameSize(item.number) },
          ]}>
          {surahHeaderGlyph(item.number)}
        </Text>
      </Pressable>
    );
  };

  const renderJuzRow = ({ item, index }: { item: JuzRow; index: number }) => (
    <Pressable
      onLayout={
        index === 0 ? e => setJuzRowH(e.nativeEvent.layout.height) : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={`${t('quran.juzLabel', { defaultValue: 'Juz {{juz}}', juz: item.juz })} — ${t('quran.pageLabel', { page: item.page })}`}
      onPress={() =>
        item.startSurah && openSurah(item.startSurah.number, undefined, item.page)
      }
      style={({ pressed }) => [
        styles.row,
        listCap,
        pressed && { backgroundColor: palette.controlBg },
      ]}>
      <RowLine palette={palette} />
      <View style={[styles.numberBadge, { backgroundColor: palette.accentBg }]}>
        <Text style={[styles.numberText, { color: palette.accent }]}>
          {item.juz}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.romanized, { color: palette.text }]}>
          {t('quran.juzLabel', { defaultValue: 'Juz {{juz}}', juz: item.juz })}
        </Text>
        <Text style={[styles.english, { color: palette.muted }]}>
          {`${item.startSurah?.romanized ?? ''} · ${t('quran.pageLabel', { page: item.page })}`}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        // NO adjustsFontSizeToFit HERE — see the note above `arabic`.
        allowFontScaling={false}
        accessible={false}
        importantForAccessibility="no"
        style={[
          styles.arabic,
          { color: palette.text },
          item.startSurah ? { fontSize: surahNameSize(item.startSurah.number) } : null,
        ]}>
        {item.startSurah ? surahHeaderGlyph(item.startSurah.number) : ''}
      </Text>
    </Pressable>
  );

  const bookmarks = useMemo(
    () =>
      [...quran.bookmarks].sort(
        (a, b) => a.surah - b.surah || a.ayah - b.ayah,
      ),
    [quran.bookmarks],
  );
  const starredRefs = useMemo(
    () =>
      quran.starred
        .map(k => {
          const [s, a] = k.split(':').map(Number);
          return { surah: s, ayah: a };
        })
        .filter(r => Number.isFinite(r.surah) && Number.isFinite(r.ayah))
        .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah),
    [quran.starred],
  );

  const bookmarksEmpty = bookmarks.length === 0 && starredRefs.length === 0;

  const renderBookmarks = () => (
    <View style={[{ gap: SPACING.sm }, listCap]}>
      {bookmarksEmpty ? (
        <View
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={{ color: palette.muted, fontSize: TYPE.footnote.fontSize, flex: 1 }}>
            {t(
              'quran.noBookmarks',
              'No bookmarks yet — tap any ayah while reading to bookmark or star it.',
            )}
          </Text>
        </View>
      ) : null}
      {bookmarks.map(b => {
        const starred = quran.prefs.homeBookmarkId === b.id;
        return (
        <View
          key={b.id}
          style={[
            styles.bookmarkCard,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${findSurah(b.surah)?.romanized ?? ''} ${b.surah}:${b.ayah}`}
          // A bookmark opened from here OWNS the visit, following or
          // not: a bookmark IS a kept place, so the marker has nothing
          // to add and everything to lose by trailing this reading —
          // see `recordReading`. Following decides whether the bookmark
          // itself walks along, not whose visit this is.
          onPress={() => openSurah(b.surah, b.ayah, b.page, b.id)}
          style={styles.bookmarkHead}>
          <View
            style={[
              styles.bookmarkDot,
              { backgroundColor: BOOKMARK_COLORS[b.color] },
            ]}
          />
          <View style={styles.rowText}>
            <Text style={[styles.romanized, { color: palette.text }]}>
              {`${findSurah(b.surah)?.romanized ?? ''} ${b.surah}:${b.ayah}`}
            </Text>
            <Text style={[styles.english, { color: palette.muted }]}>
              {t('quran.pageLabel', { page: b.page })}
              {` · ${
                b.follows
                  ? t('quran.followingOn', 'moves as you read')
                  : t('quran.followingOff', 'stays on this ayah')
              }`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.deleteBookmark', 'Delete bookmark')}
            hitSlop={10}
            onPress={() => removeBookmark(b.id)}
            style={styles.deleteBtn}>
            <Text style={[styles.deleteGlyph, { color: palette.muted }]}>
              ✕
            </Text>
          </Pressable>
        </Pressable>
        {/* What the bookmark does, per bookmark, where the bookmark is —
            not in a settings page nobody would look in for it. Three
            controls on their own line under the name, each named: a bare
            switch in a row says nothing about WHICH of the row's
            properties it holds.

            Follow — a fixed pin or a place that keeps itself (#54).
            Quran page — a row on the doors card at the top of this tab.
            The star — the khatmah's slot on Home, for one bookmark only,
            and only while there is no khatmah to fill it; the line under
            the list says so. */}
        <View style={[styles.bookmarkControls, { borderTopColor: palette.border }]}>
          <View style={styles.followControl}>
            <Text style={[styles.followLabel, { color: palette.muted }]}>
              {t('quran.followToggle', 'Follow')}
            </Text>
            <Switch
              accessibilityLabel={t('quran.bookmarkFollows', 'Follows your reading')}
              value={!!b.follows}
              onValueChange={next => setBookmarkFollows(b.id, next)}
              trackColor={{ true: palette.accentSolid }}
              style={styles.followSwitch}
            />
          </View>
          <View style={styles.followControl}>
            <Text style={[styles.followLabel, { color: palette.muted }]}>
              {t('quran.shortcutToggle', 'Quran page')}
            </Text>
            <Switch
              accessibilityLabel={t(
                'quran.bookmarkShortcut',
                'Shown under Continue reading on the Quran page',
              )}
              value={!!b.shortcut}
              onValueChange={next => setBookmarkShortcut(b.id, next)}
              trackColor={{ true: palette.accentSolid }}
              style={styles.followSwitch}
            />
          </View>
          <View style={styles.bookmarkControlsSpacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: starred, disabled: plan != null }}
            accessibilityLabel={
              starred
                ? t('quran.homeBookmarkOff', 'Take off the Home screen')
                : t('quran.homeBookmarkOn', 'Show on the Home screen')
            }
            disabled={plan != null}
            hitSlop={8}
            onPress={() => setHomeBookmark(starred ? null : b.id)}
            style={[
              styles.starBtn,
              { borderColor: starred ? palette.accentSolid : palette.border },
              starred && { backgroundColor: palette.accentBg },
              plan != null && styles.starDisabled,
            ]}>
            <Text
              style={[
                styles.starGlyph,
                { color: starred ? palette.accentSolid : palette.muted },
              ]}>
              {starred ? '★' : '☆'}
            </Text>
            <Text
              style={[
                styles.followLabel,
                { color: starred ? palette.accentSolid : palette.muted, marginBottom: 0 },
              ]}>
              {t('quran.homeBookmarkLabel', 'Home')}
            </Text>
          </Pressable>
        </View>
        </View>
        );
      })}
      {bookmarks.length > 0 ? (
        <Text style={[styles.bookmarksHelp, { color: palette.muted }]}>
          {plan
            ? t(
                'quran.homeBookmarkHelpKhatmah',
                'Quran page puts a bookmark under Continue reading at the top of this page. The star puts one bookmark on the Home screen where Continue khatmah is — it is off while a khatmah is running.',
              )
            : t(
                'quran.homeBookmarkHelp',
                'Quran page puts a bookmark under Continue reading at the top of this page. The star puts one bookmark on the Home screen, in the place a khatmah would take; only one bookmark can have it.',
              )}
        </Text>
      ) : null}
      {starredRefs.length > 0 ? (
        <Text style={[styles.starredHeading, { color: palette.muted }]}>
          {t('quran.starred', 'Starred')}
        </Text>
      ) : null}
      {starredRefs.map(r => (
        <Pressable
          key={`${r.surah}:${r.ayah}`}
          accessibilityRole="button"
          accessibilityLabel={`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
          onPress={() => openSurah(r.surah, r.ayah)}
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={{ color: palette.accentSolid, fontSize: TYPE.body.fontSize }}>★</Text>
          <View style={styles.rowText}>
            <Text style={[styles.romanized, { color: palette.text }]}>
              {`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.removeStar', 'Remove star')}
            hitSlop={10}
            onPress={() => toggleStar(r.surah, r.ayah)}
            style={styles.deleteBtn}>
            <Text style={[styles.deleteGlyph, { color: palette.muted }]}>
              ✕
            </Text>
          </Pressable>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {stripOn ? (
        <QuranDownloadStripView
          run={download}
          top={Math.max(0, pageTop - SPACING.md)}
        />
      ) : null}
      {/* SWIPE BETWEEN THE TABS. A horizontal pan over the list moves to
          the next or previous of Surah / Juz / Bookmarks, the way the
          segmented control does. The pan only activates once the finger
          has clearly gone sideways (`activeOffsetX`) and gives up the
          moment it goes up or down (`failOffsetY`), so the lists scroll
          exactly as they did; the lists' own native gesture is left to
          win every vertical drag. In Arabic the row is mirrored, and so
          is the swipe. */}
      <GestureDetector gesture={tabSwipe}>
      <View style={styles.swipeArea}>
      {tab === 'surah' ? (
        <FlatList<SurahIndex>
          automaticallyAdjustKeyboardInsets
          ref={listRef}
          {...tabBarScroll}
          data={[...filteredSurahs]}
          keyExtractor={s => String(s.number)}
          contentContainerStyle={[
            styles.list,
            { paddingTop: listTop, paddingBottom: tabBarInset },
            kb.contentPadding,
          ]}
          contentInsetAdjustmentBehavior="never"
          ListHeaderComponent={header}
          initialNumToRender={12}
          windowSize={7}
          renderItem={renderSurahRow}
          getItemLayout={itemLayoutFor(surahRowH)}
        />
      ) : tab === 'juz' ? (
        <FlatList<JuzRow>
          automaticallyAdjustKeyboardInsets
          ref={listRef}
          {...tabBarScroll}
          data={juzRows}
          keyExtractor={j => String(j.juz)}
          contentContainerStyle={[
            styles.list,
            { paddingTop: listTop, paddingBottom: tabBarInset },
            kb.contentPadding,
          ]}
          contentInsetAdjustmentBehavior="never"
          ListHeaderComponent={header}
          renderItem={renderJuzRow}
          getItemLayout={itemLayoutFor(juzRowH)}
        />
      ) : (
        <FlatList
          automaticallyAdjustKeyboardInsets
          ref={listRef}
          {...tabBarScroll}
          data={[0]}
          keyExtractor={() => 'bookmarks'}
          contentContainerStyle={[
            styles.list,
            { paddingTop: listTop, paddingBottom: tabBarInset },
            kb.contentPadding,
          ]}
          contentInsetAdjustmentBehavior="never"
          ListHeaderComponent={header}
          renderItem={renderBookmarks}
        />
      )}
      </View>
      </GestureDetector>



      {/* Go to page (v2.8.5) — same shape as the reader's own jump sheet,
          reached from the index instead of from inside a surah. */}
      <Modal
        visible={pageJumpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPageJumpVisible(false)}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setPageJumpVisible(false)}
        />
        <View
          style={[
            styles.menuCard,
            { backgroundColor: palette.card },
            // Top-anchored, so padding cannot lift it. Re-anchoring to
            // `bottom` puts the card just above the keyboard rather than
            // leaving an autoFocus field underneath it — a Modal on
            // Android does not resize. See useKeyboardInset.
            keyboardInset > 0
              ? { bottom: keyboardInset + SPACING.xl }
              : styles.menuCardResting,
          ]}>
          <Text style={[styles.menuTitle, { color: palette.text }]}>
            {t('quran.jumpToPage', 'Go to page')}
          </Text>
          <TextInput
            value={pageJumpText}
            onChangeText={setPageJumpText}
            keyboardType="number-pad"
            autoFocus
            maxLength={3}
            accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
            placeholder="1–604"
            placeholderTextColor={String(palette.muted)}
            style={[
              styles.customDaysInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            onSubmitEditing={() => goToPage(pageJumpText)}
          />
          <View style={styles.customDaysRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel', 'Cancel')}
              onPress={() => setPageJumpVisible(false)}
              style={styles.menuCancel}>
              <Text style={{ color: palette.muted, fontWeight: '600' }}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
              onPress={() => goToPage(pageJumpText)}
              style={styles.menuCancel}>
              <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
                {t('quran.goCta', 'Go')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

/**
 * The content container's own padding and the gap between its children.
 *
 * Named because `getItemLayout` has to add both to every offset — the
 * rows sit inside the padding and are separated by the gap — and a
 * stylesheet and an offset formula disagreeing about them is a scroll
 * indicator that lies by exactly one gap per row.
 */
const LIST_PADDING = 16;
/**
 * Zero: the surah, juz and bookmark rows are ROWS now, separated by an inset
 * hairline, not 114 cards separated by air (redesign-plan B.3.5). The
 * header keeps its own gap below (`HEADER_GAP`), which `itemLayoutFor`
 * accounts for since `onLayout` heights exclude margins.
 */
const LIST_GAP = 0;
const HEADER_GAP = 12;

const styles = StyleSheet.create({
  root: { flex: 1 },
  swipeArea: { flex: 1 },
  list: { padding: LIST_PADDING, gap: LIST_GAP },
  // Center + cap the index column on iPad/Mac so surah rows stay readable.
  // Cap+center applied to the header and to EVERY row — NOT to the
  // FlatList contentContainerStyle. `alignSelf`/`maxWidth` on the content
  // container are ignored/pin to the flow-start edge, which under RTL
  // shoved the whole 720pt column against the RIGHT edge of a wide
  // window and left the other half empty (Mac audit, 2026-07-16).
  listWide: { maxWidth: 720, width: '100%', alignSelf: 'center' as const },
  headerWrap: { gap: SPACING.md, marginBottom: HEADER_GAP },
  doorsCard: { borderRadius: RADIUS.md, overflow: 'hidden' },
  khatmahCard: { padding: SPACING.lg, borderRadius: RADIUS.md, gap: SPACING.sm },
  khatmahTop: { flexDirection: 'row', justifyContent: 'space-between' },
  khatmahTitle: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  khatmahMeta: { fontSize: TYPE.label.fontSize, fontVariant: ['tabular-nums'] },
  // A row, because a track carries TWO fills: the reading itself, and
  // the gold that is reading done past the day's portion.
  khatmahTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  khatmahFill: { height: '100%' },
  khatmahFillExtra: { opacity: 0.45 },
  khatmahMore: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khatmahMoreGlyph: { fontSize: TYPE.title3.fontSize, fontWeight: '700', lineHeight: 20 },
  khatmahDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  khatmahDayLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  // Five chips — three durations, a date, custom — and a phone's card is
  // not five chips wide: "Custom…" ran off the right edge of the card
  // (reported 2026-09-25). They wrap onto a second line instead.
  khatmahChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  votdCard: { padding: SPACING.md, borderRadius: RADIUS.md, gap: SPACING.sm },
  votdLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
  },
  votdArabic: {
    fontSize: TYPE.title3.fontSize,
    lineHeight: 40,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  votdTranslation: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  votdShowMore: { fontSize: TYPE.label.fontSize, fontWeight: '700', marginTop: SPACING.xs },
  votdRef: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  /** The reference and the chevron travel together on the trailing edge. */
  votdHeaderEnd: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  votdChevron: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  companionCard: {
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  companionCardRow: {
    marginTop: SPACING.sm,
  },
  votdEdition: { fontSize: TYPE.caption.fontSize, fontWeight: '600', flexShrink: 1 },
  votdCompanionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  votdBarDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  votdEditionSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    flexShrink: 1,
  },
  votdHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  votdToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  votdToggleSeg: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  customDaysInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.title3.fontSize,
    fontVariant: ['tabular-nums'],
    marginTop: SPACING.xs,
  },
  customFieldLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    marginTop: SPACING.md,
  },
  customDaysRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
  },
  search: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPE.callout.fontSize,
  },
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: SPACING.sm },
  searchGrow: { flex: 1 },
  pageJumpBtn: {
    width: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageJumpGlyph: { fontSize: TYPE.title2.fontSize, fontWeight: '700' },
  /** The three tabs, then the two glyphs that open a field. */
  tabsRow: { flexDirection: 'row', alignItems: 'stretch', gap: SPACING.sm },
  tabsGrow: { flex: 1 },
  resultsWrap: { gap: SPACING.sm },
  resultsLabel: { fontSize: TYPE.label.fontSize, fontWeight: '600', marginTop: 2 },
  resultRow: { padding: SPACING.md, borderRadius: RADIUS.md, gap: SPACING.xs },
  resultRef: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  resultArabic: {
    fontSize: TYPE.body.fontSize,
    lineHeight: 36,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  resultTranslation: { fontSize: TYPE.label.fontSize, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.md,
    position: 'relative',
  },
  // The inset hairline under a list row: starts where the text does.
  rowLine: {
    position: 'absolute',
    bottom: 0,
    start: 12 + 36 + 12,
    end: 0,
    height: StyleSheet.hairlineWidth,
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: TYPE.callout.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowText: { flex: 1 },
  romanized: { fontSize: TYPE.body.fontSize, fontWeight: '600' },
  english: { fontSize: TYPE.label.fontSize, marginTop: 2 },
  pageHint: { fontSize: TYPE.caption.fontSize, marginTop: 2, fontVariant: ['tabular-nums'] },
  /**
   * The name as the muṣḥaf writes it — see surahHeaderGlyph.ts. Not text:
   * one drawn glyph per surah, at one size everywhere, and never shrunk
   * to fit.
   *
   * `adjustsFontSizeToFit` used to sit on both rows that draw this, as a
   * net for extreme font-scale settings. On iOS it turned two of the 114
   * names — Maryam and Al-Qāri'ah — into a 4pt speck, the same names on
   * every launch, while their neighbours drew correctly. Android and Mac
   * Catalyst were both fine.
   *
   * Why 4pt: on the new architecture that prop sends the text through
   * `NSTextStorage+FontScaling`, which binary-searches a scale and, when
   * the search ends without one, applies its initial
   * `lastRatioWhichFits = 0.02` — clamped to a hard-coded 4pt floor.
   * 34pt × 0.02 is 0.68pt, so 4pt is exactly what a name that "never fit"
   * comes out at, and `minimumFontScale` cannot raise that floor: iOS
   * reads `minimumFontSize` out of the paragraph attributes and only
   * Android forwards the scale prop (see BaseParagraphProps and
   * HostPlatformParagraphProps). The net had no floor on iOS at all.
   *
   * Why those two names and not the other 112 is a matter of the width
   * Yoga hands the view against what that file measures — a port of the
   * search run outside the app, over all 114 glyphs at the pixel-rounded
   * width, does NOT collapse any of them, so the trigger lives in the
   * real row and not in the glyphs. Which is the argument for not running
   * the search at all rather than for tuning its inputs.
   *
   * The drawing does not need the net. `flexShrink: 0` keeps its measured
   * width and the flexible left column gives way — which is what made the
   * multi-word names ("آل عمران") whole again — and `allowFontScaling`
   * off keeps a 310% text setting from growing a decorative glyph out of
   * its row while the row's own words, the ones being read, still grow.
   */
  arabic: {
    flexShrink: 0,
    ...surahHeaderStyle(),
  },
  bookmarkDot: { width: 14, height: 14, borderRadius: RADIUS.sm },
  deleteBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  bookmarkCard: { borderRadius: RADIUS.md },
  bookmarkHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  bookmarkControls: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bookmarkControlsSpacer: { flex: 1 },
  starBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  starDisabled: { opacity: 0.4 },
  starGlyph: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  bookmarksHelp: { fontSize: TYPE.caption.fontSize, lineHeight: 17, paddingHorizontal: SPACING.xs },
  followSwitch: { marginStart: SPACING.xs },
  followControl: { alignItems: 'center' },
  followLabel: {
    fontSize: TYPE.caption.fontSize,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  deleteGlyph: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  khatmahActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  khatmahBtn: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khatmahBtnLabel: { fontWeight: '700', fontSize: TYPE.footnote.fontSize },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menuCard: {
    position: 'absolute',
    // rtl-safe: a dialog pinned to both edges — symmetric, direction-agnostic
    left: 24,
    right: 24,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  // The vertical anchor is a style of its own, and the card takes exactly
  // one of the two. It cannot live in `menuCard` and be cancelled with
  // `{top: undefined}` when the keyboard lifts the card: an undefined
  // value is dropped rather than applied, so `top` survived, the card
  // was pinned at both edges, and it stretched into a tall pale box with
  // its buttons floating in the middle of it.
  menuCardResting: { top: '25%' },
  // The Khatmah options dialog: centred between the insets rather than
  // pinned — see its render site.
  menuCentre: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    // rtl-safe: symmetric on both edges, the same 24 the pinned cards use
    paddingHorizontal: 24,
  },
  menuCardCentred: {
    maxHeight: '100%',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  // Shrinks to its rows, and scrolls only when they outgrow the screen.
  menuRows: { flexGrow: 0, flexShrink: 1 },
  menuRowsContent: { gap: SPACING.md },
  menuTitle: { fontSize: TYPE.title3.fontSize, fontWeight: '700', marginBottom: SPACING.xs },
  menuRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  menuCancel: { alignItems: 'center', paddingVertical: SPACING.sm },
  downloadsLink: { paddingVertical: 2 },
  oftenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  oftenLabel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  oftenChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  oftenChipText: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  /** Tilāwah leads as a chip; the two plain links trail behind it. */
  downloadsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.md,
  },
  starredHeading: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
});
