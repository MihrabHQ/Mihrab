/**
 * A Library book that is a PDF: its page, and the pages of it.
 *
 * The book's page is the text books' page with a file in place of
 * chapters: whose it is, what it is, the note every book carries, then
 * the file — fetched once (`libraryPdf.ts`), with what it weighs said
 * before, how far along said during, and a sentence and a button for each
 * way it can fail. Once here it is read with no network.
 *
 * The reader is a list of pages, each drawn by the system at the width it
 * is shown at (`native/MihrabPdf.ts`) and shown as a picture. It keeps
 * what the text reader keeps, in the same store, so the shelf and the
 * bookmarks need to know nothing new: a PDF is one chapter (0) whose
 * blocks are its pages. The place is the page at the top; a bookmark is a
 * page; "Continue" on the shelf opens at it.
 *
 * A page that will not draw says so in its own place and the rest go on.
 * A file that will not open at all is offered to be fetched again.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, BackHandler, FlatList, Image, Linking, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Button, Group, Row } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { useLayoutRtl } from '../../i18n/useLayoutRtl';
import {
  findLibraryBook,
  libraryBookmarks,
  libraryKey,
  libraryReading,
  setLibraryReading,
  toggleLibraryBookmark,
  type LibraryBookmark,
} from '../../hadith/libraryShelf';
import {
  cancelLibraryPdf,
  checkLibraryPdf,
  deleteLibraryPdf,
  downloadLibraryPdf,
  libraryPdfPath,
  useLibraryPdfStatus,
  validLibraryPdf,
} from '../../hadith/libraryPdf';
import { cancelPack, deletePack, downloadPack, loadPack, manifestEntry, usePackStatuses } from '../../hadith/packs';
import type { LibraryFile } from '../../hadith/packTypes';
import { summarisePacks } from '../../hadith/useHadith';
import { pdfInfo, pdfPage, pdfRenderWidth, type PdfPage } from '../../native/MihrabPdf';
import { MihrabPdfViewNative, nativePdfViewAvailable } from '../../native/MihrabPdfView';
import { useKeepAwake } from '../../quran/keepAwakeLock';
import { useQuranState } from '../../quran/quranState';
import type { RootStackParamList } from '../../navigation/types';
import { ProgressTrack, TextAction, formatBytes } from '../../quran/downloadsUi';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { Column } from './Column';
import { HadithPage } from './HadithPage';
import { PackGate, useManifest } from './PackGate';

/** How long a place waits before it is written: scrolling passes pages quickly. */
const PLACE_DELAY_MS = 1000;
/** A PDF page is drawn on white paper whatever the app's theme: it is a picture of a printed page. */
const PAPER = '#FFFFFF';
const ON_PAPER = '#555555';
/** The zooms the button steps through; two fingers give any size up to `ZOOM_MAX`. */
const ZOOMS = [1, 1.5, 2.25] as const;
const ZOOM_MAX = 4;

/** One page: drawn when it comes near the screen, a paper-coloured space of its shape until then. */
function PdfPageView({ path, index, shown, ratio, zoom, marked, onLongPress }: { path: string; index: number; shown: number; ratio: number; zoom: number; marked: boolean; onLongPress: () => void }) {
  const { palette } = useAppPalette();
  const { t } = useTranslation();
  const [page, setPage] = useState<PdfPage | null>(null);
  const [failed, setFailed] = useState(false);
  const width = pdfRenderWidth(shown, PixelRatio.get(), zoom);
  useEffect(() => {
    let live = true;
    setFailed(false);
    void pdfPage(path, index, width).then(p => {
      if (!live) return;
      if (p) setPage(p);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [path, index, width]);
  const w = shown * zoom;
  const h = w * (page ? page.height / page.width : ratio);
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} accessibilityLabel={t('quran.pageLabel', { page: index + 1 })} testID={`library-pdf-page-${index}`}>
      <View style={[styles.page, { width: w, height: h, backgroundColor: PAPER }, marked && { borderStartWidth: 4, borderStartColor: palette.accentSolid }]}>
        {page ? (
          <Image source={{ uri: page.uri }} style={{ width: w, height: h }} resizeMode="contain" fadeDuration={0} />
        ) : failed ? (
          <Text style={[styles.pageNote, { color: ON_PAPER }]}>{t('hadith.library.pdf.pageFailed')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function PdfReader({ id, title, path, pages, ratio, toPage, rtl }: { id: string; title: string; path: string; pages: number; ratio: number; toPage?: number; rtl: boolean }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { width: windowWidth } = useWindowDimensions();
  const keepLit = useQuranState().prefs.readerKeepAwake;
  useKeepAwake(keepLit);
  const shown = Math.min(windowWidth, 900);
  // ── Zoom: any size between the page's width and four times it, as a picture is zoomed ──
  // While two fingers are down the pages are scaled as they stand (`live`); when they lift, the pages are laid
  // out at the new size and drawn again sharp, and what was under the middle of the screen is kept there.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const live = useRef(new Animated.Value(1)).current;
  const list = useRef<FlatList<number>>(null);
  const side = useRef<ComponentRef<typeof ScrollView>>(null);
  const layoutRtl = useLayoutRtl();
  const at2 = useRef({ x: 0, y: 0 });
  const restore = useRef<{ x: number; y: number } | null>(null);
  const box = useRef({ w: windowWidth, h: 0 });
  box.current.w = windowWidth;
  // Where the fingers are, in the pages' own room: what is under them stays under them, while they move and
  // when they lift. null for the button, which zooms about the middle.
  const focal = useRef<{ x: number; y: number } | null>(null);
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  // Set while a new size is being laid out: the pages stay as the fingers left them until it is, so nothing
  // springs back to the old size for a frame and then forward again.
  const committing = useRef(false);
  const settle = useCallback(() => {
    live.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
  }, [live, tx, ty]);
  const zoomTo = useCallback(
    (wanted: number, about: { x: number; y: number } | null) => {
      const from = zoomRef.current;
      const next = Math.round(Math.min(ZOOM_MAX, Math.max(1, wanted)) * 100) / 100;
      if (next === from) {
        settle();
        return;
      }
      const k = next / from;
      const f = about ?? { x: box.current.w / 2, y: box.current.h / 2 };
      restore.current = {
        // The button, from the page's own width, has no place across the page to keep: see `put`.
        x: !about && from === 1 ? -1 : Math.max(0, (at2.current.x + f.x) * k - f.x),
        y: Math.max(0, (at2.current.y + f.y) * k - f.y),
      };
      committing.current = true;
      zoomRef.current = next;
      setZoom(next);
    },
    [settle],
  );
  // Two fingers are a zoom and one is a scroll, every time. The two scrollers are told so in the gesture
  // system's own terms (`Native`, simultaneous with the pinch): left to themselves they claim the touch the
  // moment a finger moves, which cancels a pinch begun a little unevenly — it zoomed on some tries and
  // scrolled on others. And while two fingers are down they do not scroll at all.
  const [pinching, setPinching] = useState(false);
  const sideGesture = useMemo(() => Gesture.Native(), []);
  const listGesture = useMemo(() => Gesture.Native(), []);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .simultaneousWithExternalGesture(sideGesture, listGesture)
        .onTouchesDown(e => {
          if (e.numberOfTouches >= 2) setPinching(true);
        })
        .onStart(e => {
          focal.current = { x: e.focalX, y: e.focalY };
        })
        .onUpdate(e => {
          const scale = Math.min(ZOOM_MAX / zoomRef.current, Math.max(1 / zoomRef.current, e.scale));
          const f = focal.current ?? { x: box.current.w / 2, y: box.current.h / 2 };
          live.setValue(scale);
          // Scaled about the middle and moved back, so the point under the fingers does not move.
          tx.setValue((1 - scale) * (f.x - box.current.w / 2));
          ty.setValue((1 - scale) * (f.y - box.current.h / 2));
        })
        .onEnd(e => zoomTo(zoomRef.current * e.scale, focal.current))
        .onFinalize(() => {
          if (!committing.current) settle();
          setPinching(false);
        }),
    [live, tx, ty, settle, zoomTo, sideGesture, listGesture],
  );
  useLayoutEffect(() => {
    const want = restore.current;
    if (!want) return undefined;
    restore.current = null;
    const put = () => {
      list.current?.scrollToOffset({ offset: want.y, animated: false });
      if (want.x >= 0) side.current?.scrollTo({ x: want.x, animated: false });
      // From the page's own width, by the button, there is no place across it yet: a wider page opens at the
      // edge its lines begin at. On Android a sideways scroller's 0 is the left edge whatever the layout's
      // direction (seen on a Pixel: `scrollToEnd` in an Arabic layout goes right, where it already was); on
      // iOS a mirrored scroller counts from its own start, so the far edge is its end.
      else if (layoutRtl !== rtl) {
        if (Platform.OS === 'android') side.current?.scrollTo({ x: rtl ? 100000 : 0, animated: false });
        else side.current?.scrollToEnd({ animated: false });
      }
    };
    // With the new size: the pages go to their place and stop being held as the fingers left them, together.
    put();
    settle();
    committing.current = false;
    // …and once more when the list has settled, for a phone that had not laid it out yet.
    const timer = setTimeout(put, 120);
    return () => clearTimeout(timer);
  }, [zoom, layoutRtl, rtl, settle]);
  const data = useMemo(() => Array.from({ length: pages }, (_, i) => i), [pages]);
  const rowHeight = shown * zoom * ratio + SPACING.sm;
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;

  // Where to open: the page asked for (a bookmark), else where the book was left. null until known.
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void libraryReading(id).then(r => {
      if (live) setTarget(Math.min(pages - 1, Math.max(0, toPage ?? r?.b ?? 0)));
    });
    return () => {
      live = false;
    };
  }, [id, pages, toPage]);

  const [room, setRoom] = useState(0);
  // The page number is typed at the top; the pages run on under the keyboard while it is open.
  const keyboard = useKeyboardInset();
  const [at, setAt] = useState(0);
  const seen = useRef(0);
  const settled = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const write = useCallback(() => {
    pending.current = null;
    const b = Math.min(seen.current, pages - 1);
    void setLibraryReading(id, { c: 0, b, f: pages > 1 ? b / pages : 0, n: 1, t: t('quran.pageLabel', { page: b + 1 }), at: Date.now() });
  }, [id, pages, t]);
  const writeRef = useRef(write);
  writeRef.current = write;
  useEffect(() => {
    if (target == null) return undefined;
    seen.current = target;
    setAt(target);
    // Where the list opens is where it is, before any scrolling has said so: a zoom keeps the place from here.
    at2.current.y = target * rowHeightRef.current;
    const timer = setTimeout(() => {
      settled.current = true;
      writeRef.current();
    }, 500);
    return () => {
      clearTimeout(timer);
      settled.current = false;
      // Leaving: what was waiting to be written is written.
      if (pending.current) {
        clearTimeout(pending.current);
        writeRef.current();
      }
    };
  }, [target]);
  const viewability = useRef({ itemVisiblePercentThreshold: 30 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const first = viewableItems.find(v => v.index != null)?.index;
    if (first == null || !settled.current || first === seen.current) return;
    seen.current = first;
    setAt(first);
    if (!pending.current) pending.current = setTimeout(() => writeRef.current(), PLACE_DELAY_MS);
  }).current;

  const [marks, setMarks] = useState<LibraryBookmark[]>([]);
  useEffect(() => {
    void libraryBookmarks(id).then(setMarks);
  }, [id]);
  const marked = marks.some(m => m.c === 0 && m.b === at);
  const toggle = useCallback((page: number) => void toggleLibraryBookmark(id, 0, page).then(setMarks), [id]);

  // ── Android's own PDF view, where there is one ──
  // On Android 9 and later the pages are the system's to scroll and zoom (`MihrabPdfView.ts`); what this
  // screen keeps is what it kept before — the place, the bookmarks, going to a page — told and asked through
  // the view. Everything above that zooms and lists pages is then for the platforms without it. If the
  // system's view cannot open the file, the list of pages reads it instead.
  const [systemFailed, setSystemFailed] = useState(false);
  const system = !systemFailed && nativePdfViewAvailable();
  const [systemZoom, setSystemZoom] = useState(1);
  const [goTo, setGoTo] = useState<{ page: number; key: number } | undefined>(undefined);
  const [zoomAsk, setZoomAsk] = useState<{ step: number; key: number } | undefined>(undefined);
  const onSystemViewport = useCallback((e: { nativeEvent: { page: number; zoom: number } }) => {
    const { page, zoom: z } = e.nativeEvent;
    setSystemZoom(z);
    if (!settled.current || page === seen.current) return;
    seen.current = page;
    setAt(page);
    if (!pending.current) pending.current = setTimeout(() => writeRef.current(), PLACE_DELAY_MS);
  }, []);

  // Looking for words in the book: the system's view does the looking, in the file, on the device.
  // Offered only where the system says it can read the file's words (`onPdfReady`).
  const [canFind, setCanFind] = useState(false);
  const [finding, setFinding] = useState(false);
  const [words, setWords] = useState('');
  const [find, setFind] = useState<{ query: string; key: number } | undefined>(undefined);
  const [findStep, setFindStep] = useState<{ by: number; key: number } | undefined>(undefined);
  /** null: not asked, or still looking. */
  const [found, setFound] = useState<{ count: number; index: number } | null>(null);
  const look = (query: string) => {
    setFound(null);
    setFind(was => ({ query, key: (was?.key ?? 0) + 1 }));
  };
  const step = (by: number) => setFindStep(was => ({ by, key: (was?.key ?? 0) + 1 }));
  const stopFinding = () => {
    setFinding(false);
    setWords('');
    look('');
  };

  // ── Full screen: the pages and nothing else ──
  // The bar, the title and the status bar go. The way back is a button that stays in the corner — a tap on
  // the page is not it: a page is tapped by accident, and to select its words — and Android's back button,
  // which leaves the book only once the bars are back.
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFull(false);
      return true;
    });
    return () => sub.remove();
  }, [full]);
  const insets = useSafeAreaInsets();

  // Going to a page by its number.
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const go = () => {
    const n = Math.floor(Number(typed));
    setAsking(false);
    setTyped('');
    if (!Number.isFinite(n) || n < 1) return;
    if (system) {
      setGoTo(was => ({ page: Math.min(pages, n) - 1, key: (was?.key ?? 0) + 1 }));
      return;
    }
    list.current?.scrollToIndex({ index: Math.min(pages, n) - 1, animated: false, viewPosition: 0 });
  };

  const SystemPdfView = system ? MihrabPdfViewNative() : null;
  return (
    <HadithPage
      title={title}
      bare={full}
      end={
        <Pressable
          onPress={() => {
            // The button steps, for a hand that cannot pinch.
            if (system) setZoomAsk(was => ({ step: ZOOMS.find(z => z > systemZoom + 0.01) ?? 1, key: (was?.key ?? 0) + 1 }));
            else zoomTo(ZOOMS.find(z => z > zoomRef.current + 0.01) ?? 1, null);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('hadith.library.pdf.zoom')}
          hitSlop={10}
          style={({ pressed }) => [styles.zoom, { borderColor: palette.border }, pressed && styles.pressed]}
          testID="library-pdf-zoom"
        >
          <Text style={[styles.zoomText, { color: palette.text }]}>{`${Math.round((system ? systemZoom : zoom) * 100)}%`}</Text>
        </Pressable>
      }
    >
      {bottom => (
        <View style={styles.flex}>
          {full ? null : (
          <View style={[styles.bar, { borderBottomColor: palette.border }]}>
            <Pressable onPress={() => setAsking(true)} accessibilityRole="button" accessibilityLabel={t('quran.jumpToPage')} hitSlop={8} testID="library-pdf-where">
              <Text style={[styles.where, { color: palette.text }]}>{t('hadith.library.chapterOf', { n: at + 1, count: pages })}</Text>
            </Pressable>
            <View style={styles.barEnd}>
              {system && canFind ? <TextAction label={t('hadith.library.pdf.find')} color={palette.accentSolid} onPress={() => (finding ? stopFinding() : setFinding(true))} /> : null}
              <TextAction label={t('hadith.library.pdf.fullScreen')} color={palette.accentSolid} onPress={() => { setAsking(false); setFull(true); }} />
              <TextAction label={marked ? t('hadith.library.unmark') : t('hadith.library.mark')} color={palette.accentSolid} onPress={() => toggle(at)} />
            </View>
          </View>
          )}
          {finding && system && !full ? (
            <View style={[styles.goRow, { backgroundColor: palette.card }]}>
              <TextInput
                value={words}
                onChangeText={setWords}
                autoFocus
                placeholder={t('hadith.library.pdf.find')}
                placeholderTextColor={palette.muted}
                onSubmitEditing={() => look(words)}
                returnKeyType="search"
                autoCorrect={false}
                style={[styles.goInput, { color: palette.text }]}
                testID="library-pdf-find"
              />
              {found ? (
                <Text style={[styles.found, { color: palette.muted }]} testID="library-pdf-found">
                  {found.count > 0 ? t('hadith.library.chapterOf', { n: found.index, count: found.count }) : t('hadith.noResults')}
                </Text>
              ) : null}
              {found && found.count > 1 ? (
                <>
                  <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={t('hadith.library.pdf.findPrevious')} hitSlop={10} testID="library-pdf-find-previous">
                    <Text style={[styles.findStep, { color: palette.accentSolid }]}>↑</Text>
                  </Pressable>
                  <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={t('hadith.library.pdf.findNext')} hitSlop={10} testID="library-pdf-find-next">
                    <Text style={[styles.findStep, { color: palette.accentSolid }]}>↓</Text>
                  </Pressable>
                </>
              ) : null}
              <TextAction label={t('common.cancel')} color={palette.mutedSolid} onPress={stopFinding} />
            </View>
          ) : null}
          {asking && !full ? (
            <View style={[styles.goRow, { backgroundColor: palette.card }]}>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                keyboardType="number-pad"
                autoFocus
                placeholder={t('quran.jumpToPage')}
                placeholderTextColor={palette.muted}
                onSubmitEditing={go}
                returnKeyType="go"
                style={[styles.goInput, { color: palette.text }]}
                testID="library-pdf-goto"
              />
              <TextAction label={t('quran.jumpToPage')} color={palette.accentSolid} onPress={go} />
              <TextAction label={t('common.cancel')} color={palette.mutedSolid} onPress={() => setAsking(false)} />
            </View>
          ) : null}
          {/* The pages' own room, measured: a list inside a sideways scroller has no height of its own, and one
              without a height draws every page of the book at once. */}
          {SystemPdfView ? (
            target != null ? (
              <SystemPdfView
                style={styles.flex}
                path={path}
                page={target}
                goTo={goTo}
                zoomTo={zoomAsk}
                onPdfViewport={onSystemViewport}
                find={find}
                findStep={findStep}
                onPdfReady={e => setCanFind(e.nativeEvent.search)}
                onPdfFind={e => setFound({ count: e.nativeEvent.count, index: e.nativeEvent.index })}
                onPdfError={() => setSystemFailed(true)}
                testID="library-pdf-system"
              />
            ) : null
          ) : (
          <GestureHandlerRootView style={styles.flex}>
            <GestureDetector gesture={pinch}>
          <Animated.View style={[styles.flex, { transform: [{ translateX: tx }, { translateY: ty }, { scale: live }] }]} onLayout={e => { box.current.h = e.nativeEvent.layout.height; setRoom(e.nativeEvent.layout.height); }}>
            {target != null && room > 0 ? (
              <GestureDetector gesture={sideGesture}>
              <ScrollView
                ref={side}
                onScroll={e => { at2.current.x = e.nativeEvent.contentOffset.x; }}
                scrollEventThrottle={32}
                horizontal scrollEnabled={zoom > 1 && !pinching} showsHorizontalScrollIndicator={zoom > 1} bounces={false} contentContainerStyle={{ width: Math.max(windowWidth, shown * zoom) }}>
                <GestureDetector gesture={listGesture}>
                <FlatList
                  ref={list}
                  scrollEnabled={!pinching}
                  onScroll={e => { at2.current.y = e.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={32}
                  data={data}
                  keyExtractor={String}
                  style={{ width: Math.max(windowWidth, shown * zoom), height: room }}
                  contentContainerStyle={{ alignItems: 'center', paddingBottom: Math.max(bottom, keyboard) + SPACING.xl }}
                  initialScrollIndex={Math.min(seen.current, pages - 1)}
                  getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
                  initialNumToRender={2}
                  maxToRenderPerBatch={2}
                  windowSize={5}
                  viewabilityConfig={viewability}
                  onViewableItemsChanged={onViewable}
                  renderItem={({ item }) => (
                    <View style={{ height: rowHeight }}>
                      <PdfPageView path={path} index={item} shown={shown} ratio={ratio} zoom={zoom} marked={marks.some(m => m.c === 0 && m.b === item)} onLongPress={() => toggle(item)} />
                    </View>
                  )}
                  testID="library-pdf-pages"
                />
                </GestureDetector>
              </ScrollView>
              </GestureDetector>
            ) : null}
          </Animated.View>
            </GestureDetector>
          </GestureHandlerRootView>
          )}
          {full ? (
            <Pressable
              onPress={() => setFull(false)}
              accessibilityRole="button"
              accessibilityLabel={t('hadith.library.pdf.exitFullScreen')}
              hitSlop={12}
              style={({ pressed }) => [styles.exitFull, { top: insets.top + SPACING.sm, end: insets.right + SPACING.md }, pressed && styles.pressed]}
              testID="library-pdf-exit-full"
            >
              <Text style={styles.exitFullText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </HadithPage>
  );
}

export function LibraryPdfBookScreenPage() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id, chapter, block: toPage } = useRoute<RouteProp<RootStackParamList, 'LibraryBook'>>().params;
  const statuses = usePackStatuses();
  const known = findLibraryBook(id);
  const key = libraryKey(id);
  const packs = summarisePacks([key], statuses);
  const ready = packs.missing.length === 0;
  const status = useLibraryPdfStatus(id);

  const [file, setFile] = useState<LibraryFile | null>(null);
  useEffect(() => {
    let live = true;
    if (!ready) {
      setFile(null);
      return undefined;
    }
    void loadPack<LibraryFile>(key).then(f => {
      if (live) setFile(f);
    });
    return () => {
      live = false;
    };
  }, [ready, key]);
  const pdf = file && validLibraryPdf(file.pdf) ? file.pdf : null;
  // Is the file here? Asked on coming to the page, and again on coming back to it.
  useFocusEffect(
    useCallback(() => {
      if (pdf) void checkLibraryPdf(id, pdf);
    }, [id, pdf]),
  );

  // The file as the system reads it: its pages and their shape. `false`: it would not open.
  const [info, setInfo] = useState<{ pages: number; ratio: number } | false | null>(null);
  useEffect(() => {
    let live = true;
    setInfo(null);
    if (status.state !== 'ready') return undefined;
    void pdfInfo(libraryPdfPath(id)).then(i => {
      if (live) setInfo(i ? { pages: i.pages, ratio: i.height / i.width } : false);
    });
    return () => {
      live = false;
    };
  }, [id, status.state]);

  const [reading, setReading] = useState<number | null>(null);
  const [marks, setMarks] = useState<LibraryBookmark[]>([]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void libraryReading(id).then(r => {
        if (live) setReading(r ? r.b : null);
      });
      void libraryBookmarks(id).then(m => {
        if (live) setMarks(m);
      });
      return () => {
        live = false;
      };
    }, [id]),
  );

  const title = file?.title ?? known?.title ?? t('hadith.library.tab');
  const own = isRtlLanguage(i18n.language) || !known || known.lang !== 'ar';
  const open = (page?: number) => navigation.push('LibraryBook', { id, chapter: 0, block: page });
  const fetchIt = () => {
    if (pdf) void downloadLibraryPdf(id, pdf);
  };
  // One button fetches the book: its few lines of pack, then the file. What the manifest says of the file is
  // what the button weighs it at, before either is here.
  const manifest = useManifest();
  const offered = manifestEntry(manifest, key)?.pdf;
  const wanted = useRef(false);
  useEffect(() => {
    if (wanted.current && pdf && status.state === 'absent') {
      wanted.current = false;
      void downloadLibraryPdf(id, pdf);
    }
  }, [id, pdf, status.state]);

  if (chapter != null && info && status.state === 'ready') {
    return <PdfReader id={id} title={title} path={libraryPdfPath(id)} pages={info.pages} ratio={info.ratio} toPage={toPage} rtl={isRtlLanguage(known?.lang ?? 'ar')} />;
  }

  return (
    <HadithPage title={title}>
      {(bottom, onScroll) =>
        !ready && validLibraryPdf(offered) ? (
          <Column>
            <View style={[styles.book, styles.gate]} testID="library-pdf-gate">
              <Text style={[styles.about, { color: palette.text }]}>{t('hadith.library.needsDownload')}</Text>
              {known?.about ? <Text style={[styles.note, { color: palette.muted }]}>{known.about}</Text> : null}
              {packs.downloading ? (
                <>
                  <Text style={[styles.note, { color: palette.muted }]}>{t('hadith.downloading')}</Text>
                  <TextAction label={t('common.cancel')} color={palette.accentSolid} onPress={() => { wanted.current = false; cancelPack(key); }} />
                </>
              ) : (
                <>
                  {packs.failed ? <Text style={[styles.note, { color: palette.danger }]}>{t('hadith.downloadFailed')}</Text> : null}
                  <Button
                    label={t('hadith.downloadSize', { size: formatBytes(offered.bytes) })}
                    onPress={() => {
                      wanted.current = true;
                      void downloadPack(key);
                    }}
                  />
                </>
              )}
            </View>
          </Column>
        ) : !ready ? (
          <Column>
            <PackGate packs={packs} body={t('hadith.library.needsDownload')} />
          </Column>
        ) : (
          <Column style={styles.flex} outer={styles.flex}>
            <FlatList
              data={file ? [0] : []}
              keyExtractor={String}
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentContainerStyle={[styles.book, { paddingBottom: bottom + SPACING.xl }]}
              testID="library-pdf-book"
              renderItem={() =>
                file ? (
                  <View style={styles.bookBody}>
                    <Text style={[styles.by, { color: palette.text }]} testID="library-by">
                      {own || !known ? file.author : known.authorLatin}
                    </Text>
                    {known ? (
                      <Text style={[styles.about, { color: palette.text }]} testID="library-about">
                        {known.about ?? t(`hadith.library.about.${known.id}`)}
                      </Text>
                    ) : null}
                    <Text style={[styles.note, { color: palette.muted }]}>{t('hadith.library.pdf.note')}</Text>
                    {!pdf ? (
                      <Text style={[styles.note, { color: palette.danger }]}>{t('hadith.library.pdf.unreadable')}</Text>
                    ) : status.state === 'downloading' ? (
                      <View style={styles.gate} testID="library-pdf-downloading">
                        <Text style={[styles.about, { color: palette.text }]}>{t('hadith.downloading')}</Text>
                        <ProgressTrack progress={status.progress} />
                        <TextAction label={t('common.cancel')} color={palette.accentSolid} onPress={() => cancelLibraryPdf(id)} />
                      </View>
                    ) : status.state === 'ready' && info ? (
                      <View style={styles.gate}>
                        <Button
                          label={reading != null && reading > 0 ? t('hadith.library.continue', { chapter: t('quran.pageLabel', { page: reading + 1 }) }) : t('hadith.library.pdf.read')}
                          onPress={() => open()}
                        />
                        {reading != null && reading > 0 ? <TextAction label={t('quran.pageLabel', { page: 1 })} color={palette.accentSolid} onPress={() => open(0)} /> : null}
                      </View>
                    ) : status.state === 'ready' && info === false ? (
                      <View style={styles.gate} testID="library-pdf-unreadable">
                        <Text style={[styles.note, { color: palette.danger }]}>{t('hadith.library.pdf.unreadable')}</Text>
                        <Button label={t('hadith.downloadSize', { size: formatBytes(pdf.bytes) })} onPress={() => void deleteLibraryPdf(id).then(fetchIt)} />
                      </View>
                    ) : status.state === 'ready' ? null : (
                      <View style={styles.gate} testID="library-pdf-absent">
                        {status.state === 'failed' ? (
                          <Text style={[styles.note, { color: palette.danger }]} testID={`library-pdf-failed-${status.why}`}>
                            {status.why === 'space'
                              ? t('hadith.library.pdf.noSpace', { size: formatBytes(pdf.bytes) })
                              : status.why === 'file'
                                ? t('hadith.library.pdf.badFile')
                                : t('hadith.downloadFailed')}
                          </Text>
                        ) : null}
                        <Button label={t('hadith.downloadSize', { size: formatBytes(pdf.bytes) })} onPress={fetchIt} />
                      </View>
                    )}
                    {marks.length > 0 && status.state === 'ready' ? (
                      <>
                        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('hadith.library.marks')}</Text>
                        <Group>
                          {[...marks].sort((a, b) => a.b - b.b).map(m => (
                            <Row key={m.b} title={t('quran.pageLabel', { page: m.b + 1 })} onPress={() => open(m.b)} testID={`library-pdf-mark-${m.b}`} />
                          ))}
                        </Group>
                      </>
                    ) : null}
                    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(file.source.url).catch(() => undefined)}>
                      <Text style={[styles.note, { color: palette.muted }]}>{t('hadith.library.source', { source: file.source.name, license: file.source.license })}</Text>
                    </Pressable>
                    <TextAction
                      label={t('hadith.library.remove')}
                      color={palette.danger}
                      onPress={() => {
                        void deleteLibraryPdf(id);
                        void deletePack(key);
                        navigation.goBack();
                      }}
                    />
                  </View>
                ) : null
              }
            />
          </Column>
        )
      }
    </HadithPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  book: { padding: SPACING.lg },
  bookBody: { gap: SPACING.lg },
  by: { fontSize: TYPE.title3.fontSize, lineHeight: 30 },
  about: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  sectionTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '600' },
  gate: { gap: SPACING.md },
  // Over the pages, which are white paper whatever the theme: dark glass, white mark.
  exitFull: { position: 'absolute', width: 40, height: 40, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  exitFullText: { color: PAPER, fontSize: TYPE.headline.fontSize, fontWeight: '600' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACING.xs, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  where: { fontSize: TYPE.footnote.fontSize, fontVariant: ['tabular-nums'] },
  goRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  barEnd: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  found: { fontSize: TYPE.caption.fontSize },
  findStep: { fontSize: TYPE.body.fontSize, fontWeight: '600', paddingHorizontal: SPACING.xs },
  goInput: { flex: 1, fontSize: TYPE.body.fontSize, paddingVertical: SPACING.sm },
  page: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pageNote: { fontSize: TYPE.footnote.fontSize, padding: SPACING.lg, textAlign: 'center' },
  zoom: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm, borderWidth: StyleSheet.hairlineWidth },
  zoomText: { fontSize: TYPE.footnote.fontSize, fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.6 },
});
