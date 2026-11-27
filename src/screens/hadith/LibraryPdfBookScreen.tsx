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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Linking, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Group, Row } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { isRtlLanguage } from '../../i18n/layoutDirection';
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
import { deletePack, loadPack, usePackStatuses } from '../../hadith/packs';
import type { LibraryFile } from '../../hadith/packTypes';
import { summarisePacks } from '../../hadith/useHadith';
import { pdfInfo, pdfPage, pdfRenderWidth, type PdfPage } from '../../native/MihrabPdf';
import { useKeepAwake } from '../../quran/keepAwakeLock';
import { useQuranState } from '../../quran/quranState';
import type { RootStackParamList } from '../../navigation/types';
import { ProgressTrack, TextAction, formatBytes } from '../../quran/downloadsUi';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { Column } from './Column';
import { HadithPage } from './HadithPage';
import { PackGate } from './PackGate';

/** How long a place waits before it is written: scrolling passes pages quickly. */
const PLACE_DELAY_MS = 1000;
/** A PDF page is drawn on white paper whatever the app's theme: it is a picture of a printed page. */
const PAPER = '#FFFFFF';
const ON_PAPER = '#555555';
/** The zooms a reader steps through: the page's width, then closer. */
const ZOOMS = [1, 1.5, 2.25] as const;

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

function PdfReader({ id, title, path, pages, ratio, toPage }: { id: string; title: string; path: string; pages: number; ratio: number; toPage?: number }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { width: windowWidth } = useWindowDimensions();
  const keepLit = useQuranState().prefs.readerKeepAwake;
  useKeepAwake(keepLit);
  const shown = Math.min(windowWidth, 900);
  const [zoomAt, setZoomAt] = useState(0);
  const zoom = ZOOMS[zoomAt];
  const list = useRef<FlatList<number>>(null);
  const data = useMemo(() => Array.from({ length: pages }, (_, i) => i), [pages]);
  const rowHeight = shown * zoom * ratio + SPACING.sm;

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

  // Going to a page by its number.
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const go = () => {
    const n = Math.floor(Number(typed));
    setAsking(false);
    setTyped('');
    if (!Number.isFinite(n) || n < 1) return;
    list.current?.scrollToIndex({ index: Math.min(pages, n) - 1, animated: false, viewPosition: 0 });
  };

  return (
    <HadithPage
      title={title}
      end={
        <Pressable
          onPress={() => setZoomAt((zoomAt + 1) % ZOOMS.length)}
          accessibilityRole="button"
          accessibilityLabel={t('hadith.library.pdf.zoom')}
          hitSlop={10}
          style={({ pressed }) => [styles.zoom, { borderColor: palette.border }, pressed && styles.pressed]}
          testID="library-pdf-zoom"
        >
          <Text style={[styles.zoomText, { color: palette.text }]}>{`${Math.round(zoom * 100)}%`}</Text>
        </Pressable>
      }
    >
      {bottom => (
        <View style={styles.flex}>
          <View style={[styles.bar, { borderBottomColor: palette.border }]}>
            <Pressable onPress={() => setAsking(true)} accessibilityRole="button" accessibilityLabel={t('quran.jumpToPage')} hitSlop={8} testID="library-pdf-where">
              <Text style={[styles.where, { color: palette.text }]}>{t('hadith.library.chapterOf', { n: at + 1, count: pages })}</Text>
            </Pressable>
            <TextAction label={marked ? t('hadith.library.unmark') : t('hadith.library.mark')} color={palette.accentSolid} onPress={() => toggle(at)} />
          </View>
          {asking ? (
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
          <View style={styles.flex} onLayout={e => setRoom(e.nativeEvent.layout.height)}>
            {target != null && room > 0 ? (
              <ScrollView horizontal scrollEnabled={zoom > 1} showsHorizontalScrollIndicator={zoom > 1} bounces={false} contentContainerStyle={{ width: Math.max(windowWidth, shown * zoom) }}>
                <FlatList
                  ref={list}
                  key={`z${zoomAt}`}
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
              </ScrollView>
            ) : null}
          </View>
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

  if (chapter != null && info && status.state === 'ready') {
    return <PdfReader id={id} title={title} path={libraryPdfPath(id)} pages={info.pages} ratio={info.ratio} toPage={toPage} />;
  }

  return (
    <HadithPage title={title}>
      {(bottom, onScroll) =>
        !ready ? (
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
                        {t(`hadith.library.about.${known.id}`)}
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
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  where: { fontSize: TYPE.footnote.fontSize, fontVariant: ['tabular-nums'] },
  goRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  goInput: { flex: 1, fontSize: TYPE.body.fontSize, paddingVertical: SPACING.sm },
  page: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pageNote: { fontSize: TYPE.footnote.fontSize, padding: SPACING.lg, textAlign: 'center' },
  zoom: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm, borderWidth: StyleSheet.hairlineWidth },
  zoomText: { fontSize: TYPE.footnote.fontSize, fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.6 },
});
