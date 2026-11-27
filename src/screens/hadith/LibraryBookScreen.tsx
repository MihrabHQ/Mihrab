/**
 * A book of the Library: its chapters, or one of them to read.
 *
 * One screen for both, by whether `chapter` is given, the way a Hadith
 * list is one screen for a book and for one of its chapters.
 *
 *   • The book's page: who wrote it, where its text is from and under
 *     what licence (the source asks to be credited, and a reader should
 *     know which edition this is), what a Library book is and is not, and
 *     its chapters in the author's order — with the one last opened first.
 *     While the pack is not here, the gate that fetches it and nothing
 *     else.
 *   • A chapter: its text, a block at a time — a paragraph, a heading
 *     inside the chapter, lines of verse — in the reading size the Qur'an
 *     and the hadith share (− A +), and the way on to the next chapter at
 *     its foot. A long chapter is hundreds of paragraphs, so it is a
 *     list, drawn as it is scrolled.
 *
 * A chapter opens where it was left, to the paragraph, and says how far
 * through the book that is (a thin line under the bar, and "12 of 116"
 * over the text). Tapping a paragraph shows what can be done with it —
 * mark it, copy it, send it, the last two with the book's name under the
 * words. Tapping and not holding: holding a paragraph selects its text.
 *
 * The book's page has a field that finds a phrase in THIS book
 * (`librarySearch.ts`), and a chapter with headings of its own lists them
 * to jump to ("Sections").
 *
 * The text is Arabic and is laid out right to left whatever the app's
 * language. Nothing here is graded, searched with the hadith or shown
 * anywhere else (`libraryShelf.ts`).
 */
import { withHadithUi } from '../../hadith/HadithUiScope';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, type ColorValue } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Group, Row, TextSizeStepper } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useReadingText } from '../../hooks/useReadingText';
import { ownSideAlign } from '../../i18n/foreignText';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { useLayoutRtl } from '../../i18n/useLayoutRtl';
import {
  findLibraryBook,
  libraryBookLang,
  libraryBlockText,
  libraryBookmarks,
  libraryKey,
  libraryParts,
  libraryPlace,
  libraryProgress,
  libraryReading,
  libraryShareText,
  setLibraryReading,
  toggleLibraryBookmark,
  type LibraryBookmark,
} from '../../hadith/libraryShelf';
import { readingParagraphs } from '../../hadith/libraryParagraphs';
import { LIBRARY_HITS_MAX, LIBRARY_QUERY_MIN, chapterHeadings, libraryIndex, searchLibrary, type LibraryHit } from '../../hadith/librarySearch';
import { foldForSearch } from '../../hadith/library';
import { deletePack, loadPack, usePackStatuses } from '../../hadith/packs';
import type { LibraryBlock, LibraryFile } from '../../hadith/packTypes';
import { summarisePacks } from '../../hadith/useHadith';
import { useKeepAwake } from '../../quran/keepAwakeLock';
import { useQuranState } from '../../quran/quranState';
import { copyToClipboard } from '../../sync/clipboard';
import type { RootStackParamList } from '../../navigation/types';
import { TextAction } from '../../quran/downloadsUi';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { inputChromeStyle } from '../../theme/chrome';
import { CloseIcon, SearchIcon } from '../../theme/icons';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { Column } from './Column';
import { HadithPage } from './HadithPage';
import { PackGate } from './PackGate';

// `outer={styles.flex}` on both pages: on a wide window the column sits in a full-width
// band, and a band without a height lets the list grow to its whole text and never scroll.
/** The size a book's Arabic is set at before the reader's own − A +: larger than Latin body text, with room for its marks. */
const ARABIC_READING = { fontSize: 20, lineHeight: 38 };
/** …and a book in a script that needs no such room. */
const PLAIN_READING = { fontSize: 17, lineHeight: 27 };

/** A block's kind, for its row. */
export function blockKind(b: LibraryBlock): 'p' | 'h' | 'v' {
  return typeof b === 'string' ? 'p' : 'h' in b ? 'h' : 'v';
}

/** How long a place waits before it is written: scrolling passes many paragraphs a second. */
const PLACE_DELAY_MS = 1200;
/** A bookmark's line on the book's page: the paragraph's first words. */
export function bookmarkSnippet(text: string, max = 90): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, one.lastIndexOf(' ', max) > max / 2 ? one.lastIndexOf(' ', max) : max)}…`;
}

/** How far through the book: a hairline under the bar, moved without drawing the page again. */
const ProgressLine = forwardRef<{ set: (f: number) => void }, { start: number; track: ColorValue; fill: ColorValue }>(function ProgressLine(
  { start, track, fill },
  ref,
) {
  const [f, setF] = useState(start);
  useImperativeHandle(ref, () => ({ set: setF }), []);
  return (
    <View style={[styles.progress, { backgroundColor: track }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }} testID="library-progress">
      <View style={[styles.progressFill, { backgroundColor: fill, width: `${Math.round(f * 1000) / 10}%` }]} />
    </View>
  );
});

/** Inside `HadithUiScope`: Arabic and mirrored when the hadith language is Arabic. */
export const LibraryBookScreen = withHadithUi(LibraryBookScreenPage, 'LibraryBookScreen');

function LibraryBookScreenPage() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id, chapter, block: toBlock } = useRoute<RouteProp<RootStackParamList, 'LibraryBook'>>().params;
  const layoutRtl = useLayoutRtl();
  const readingText = useReadingText();
  // A chapter is read slowly: the screen stays lit while one is open, under the reader's own
  // "Keep the screen on" (Settings → Quran), and is let go on leaving.
  const keepLit = useQuranState().prefs.readerKeepAwake;
  useKeepAwake(keepLit && chapter != null);
  // What was found runs on under the keyboard while the search field is open.
  const keyboard = useKeyboardInset();
  const statuses = usePackStatuses();
  const known = findLibraryBook(id);
  const key = libraryKey(id);
  const packs = summarisePacks([key], statuses);
  const ready = packs.missing.length === 0;

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
  }, [key, ready]);

  // Read again whenever the page is come back to: the chapter just left is where to continue.
  const [place, setPlace] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void libraryPlace(id).then(p => {
        if (live) setPlace(p);
      });
      return () => {
        live = false;
      };
    }, [id]),
  );
  // The book's marks, read again on coming back: one may have been made in a chapter.
  const [marks, setMarks] = useState<LibraryBookmark[]>([]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void libraryBookmarks(id).then(m => {
        if (live) setMarks(m);
      });
      return () => {
        live = false;
      };
    }, [id]),
  );

  // ── A chapter: where to open it, and keeping the place as it is read ──
  const blocks = chapter != null ? file?.chapters[chapter]?.b : undefined;
  const list = useRef<FlatList<LibraryBlock>>(null);
  const line = useRef<{ set: (f: number) => void }>(null);
  // The block to open at: the one asked for (a bookmark), else where this chapter was left. null until known.
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    if (chapter == null) return undefined;
    let live = true;
    void libraryReading(id).then(r => {
      if (live) setTarget(toBlock ?? (r && r.c === chapter ? r.b : 0));
    });
    return () => {
      live = false;
    };
  }, [id, chapter, toBlock]);
  // Nothing is written until the chapter stands where it was opened at: the top it is drawn at first is not where the reader is.
  const settled = useRef(false);
  const seen = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const write = useCallback(() => {
    pending.current = null;
    if (chapter == null || !file || !blocks) return;
    const b = Math.min(seen.current, blocks.length - 1);
    void setLibraryReading(id, { c: chapter, b, f: blocks.length > 1 ? b / blocks.length : 0, n: file.chapters.length, t: file.chapters[chapter].t, at: Date.now() });
  }, [id, chapter, file, blocks]);
  const writeRef = useRef(write);
  writeRef.current = write;
  useEffect(() => {
    if (chapter == null || !file || !blocks || target == null) return undefined;
    const at = Math.min(target, blocks.length - 1);
    seen.current = at;
    const done = () => {
      settled.current = true;
      writeRef.current();
    };
    let timer: ReturnType<typeof setTimeout>;
    if (at > 0) {
      timer = setTimeout(() => {
        list.current?.scrollToIndex({ index: at, animated: false, viewPosition: 0 });
        timer = setTimeout(done, 600);
      }, 60);
    } else timer = setTimeout(done, 0);
    return () => {
      clearTimeout(timer);
      settled.current = false;
      // Leaving: what was waiting to be written is written.
      if (pending.current) {
        clearTimeout(pending.current);
        writeRef.current();
      }
    };
  }, [chapter, file, blocks, target]);
  const bookF = useCallback(
    (b: number) => (file && blocks && chapter != null ? libraryProgress({ c: chapter, f: blocks.length > 1 ? b / blocks.length : 0, n: file.chapters.length }) : 0),
    [file, blocks, chapter],
  );
  const bookFRef = useRef(bookF);
  bookFRef.current = bookF;
  // A list wants these two never to change.
  const viewability = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const first = viewableItems.find(v => v.index != null)?.index;
    if (first == null || !settled.current || first === seen.current) return;
    seen.current = first;
    line.current?.set(bookFRef.current(first));
    if (!pending.current) pending.current = setTimeout(() => writeRef.current(), PLACE_DELAY_MS);
  }).current;

  // ── Finding a phrase in this book (the book's page) ──
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ hits: LibraryHit[]; more: boolean } | null>(null);
  const asking = foldForSearch(query).length >= LIBRARY_QUERY_MIN;
  useEffect(() => {
    if (!file || !asking) {
      setFound(null);
      return undefined;
    }
    let live = true;
    // Wait for the typing to pause: the first search folds the whole book.
    const timer = setTimeout(() => {
      void libraryIndex(file.chapters).then(index => {
        if (live) setFound(searchLibrary(file.chapters, index, query));
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [file, query, asking]);

  // A chapter's own headings, to jump to.
  const headings = useMemo(() => (blocks ? chapterHeadings(blocks) : []), [blocks]);
  const [jumping, setJumping] = useState(false);

  // The paragraph whose actions are showing, and whether it was just copied.
  const [picked, setPicked] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setPicked(null);
    setCopied(false);
  }, [chapter]);

  // A book of books lists its parts; the one last read in starts open.
  const parts = useMemo(() => (file ? libraryParts(file.chapters) : null), [file]);
  const [openPart, setOpenPart] = useState<number | null>(null);
  useEffect(() => {
    if (!parts || place == null) return;
    const at = parts.findIndex(p => place >= p.first && place < p.first + p.count);
    if (at >= 0) setOpenPart(at);
  }, [parts, place]);

  // Arabic, against its own leading edge in either layout.
  // The book's own language decides how its words are set — their side,
  // their direction, their face and size — whatever the app's is.
  const lang = libraryBookLang(known);
  const bookRtl = isRtlLanguage(lang);
  const arabic = { textAlign: ownSideAlign(bookRtl, layoutRtl), writingDirection: bookRtl ? ('rtl' as const) : ('ltr' as const) };
  const reading = bookRtl ? ARABIC_READING : PLAIN_READING;
  const open = useCallback((n: number) => navigation.push('LibraryBook', { id, chapter: n }), [navigation, id]);

  const arabicReader = isRtlLanguage(i18n.language);
  const title = file?.title ?? known?.title ?? t('hadith.library.tab');
  const current = chapter != null ? file?.chapters[chapter] : undefined;

  if (chapter != null) {
    const last = file ? file.chapters.length - 1 : 0;
    const block = ({ item, index }: { item: LibraryBlock; index: number }) => {
      const kind = blockKind(item);
      if (kind === 'h') {
        return (
          <Text style={[bookRtl ? styles.heading : styles.headingPlain, arabic, { color: palette.text }]} accessibilityRole="header" accessibilityLanguage={lang}>
            {(item as { h: string }).h}
          </Text>
        );
      }
      const on = picked === index;
      const marked = marks.some(m => m.c === chapter && m.b === index);
      const pick = () => {
        setCopied(false);
        setPicked(on ? null : index);
      };
      const words = file ? libraryShareText(file, current?.t ?? '', item) : libraryBlockText(item);
      return (
        <View
          style={[styles.block, marked && { borderStartWidth: StyleSheet.hairlineWidth * 4, borderStartColor: palette.accentSolid, borderRadius: 0 }, on && { backgroundColor: palette.card }]}
          testID={`library-block-${index}`}
        >
          {kind === 'v' ? (
            <Pressable onPress={pick} style={styles.verse} accessibilityRole="button">
              {(item as { v: string[] }).v.map((verseLine, i) => (
                <Text key={i} style={[bookRtl ? styles.verseLine : styles.verseLinePlain, readingText.style(reading), { color: palette.text }]} selectable accessibilityLanguage={lang}>
                  {verseLine}
                </Text>
              ))}
            </Pressable>
          ) : (
            // A long passage is set in paragraphs (libraryParagraphs): still one block to mark, copy and find.
            readingParagraphs(item as string).map((words, i) => (
              <Text
                key={i}
                style={[bookRtl ? styles.para : styles.paraPlain, i > 0 && styles.paraNext, readingText.style(reading), arabic, { color: palette.text }]}
                selectable
                onPress={pick}
                accessibilityLanguage={lang}
              >
                {words}
              </Text>
            ))
          )}
          {on ? (
            <View style={styles.actions} testID="library-actions">
              <TextAction
                label={marked ? t('hadith.library.unmark') : t('hadith.library.mark')}
                color={palette.accentSolid}
                onPress={() => void toggleLibraryBookmark(id, chapter, index).then(setMarks)}
              />
              <TextAction
                label={copied ? t('hadith.copied') : t('hadith.copy')}
                color={palette.accentSolid}
                onPress={async () => setCopied((await copyToClipboard(words)) !== 'failed')}
              />
              <TextAction label={t('common.share')} color={palette.accentSolid} onPress={() => void Share.share({ message: words }).catch(() => undefined)} />
            </View>
          ) : null}
        </View>
      );
    };
    return (
      <HadithPage title={current?.t ?? title} end={<TextSizeStepper />}>
        {(bottom, onScroll) =>
          !ready ? (
            <Column>
              <PackGate packs={packs} body={t('hadith.library.needsDownload')} />
            </Column>
          ) : (
            <Column style={styles.flex} outer={styles.flex}>
              {file && blocks && target != null ? (
                <ProgressLine ref={line} start={bookF(Math.min(target, blocks.length - 1))} track={palette.border} fill={palette.accentSolid} />
              ) : null}
              <FlatList
                ref={list}
                data={current?.b ?? []}
                keyExtractor={(_, i) => String(i)}
                renderItem={block}
                extraData={`${picked}|${copied}|${marks.length}`}
                onScroll={onScroll}
                scrollEventThrottle={16}
                initialNumToRender={12}
                windowSize={9}
                viewabilityConfig={viewability}
                onViewableItemsChanged={onViewable}
                // A paragraph far down has not been measured yet: go to about where it is, then to it.
                onScrollToIndexFailed={info => {
                  list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
                  setTimeout(() => list.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 }), 120);
                }}
                ListHeaderComponent={
                  file ? (
                    <View style={styles.whereRow}>
                      <Text style={[styles.where, { color: palette.muted }]} testID="library-where">
                        {t('hadith.library.chapterOf', { n: chapter + 1, count: file.chapters.length })}
                      </Text>
                      {headings.length > 1 ? (
                        <TextAction label={t('hadith.library.sections')} color={palette.accentSolid} onPress={() => setJumping(true)} />
                      ) : null}
                    </View>
                  ) : undefined
                }
                contentContainerStyle={[styles.text, { paddingBottom: bottom + SPACING.xl }]}
                testID="library-chapter"
                ListFooterComponent={
                  file && current ? (
                    <View style={styles.turn}>
                      {chapter < last ? (
                        <Button label={t('hadith.library.next')} onPress={() => navigation.replace('LibraryBook', { id, chapter: chapter + 1 })} />
                      ) : null}
                      {chapter > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => navigation.replace('LibraryBook', { id, chapter: chapter - 1 })}
                          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                          testID="library-previous"
                        >
                          <Text style={[styles.linkText, { color: palette.accentSolid }]}>{t('hadith.library.previous')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : undefined
                }
              />
              <ResponsiveModal visible={jumping} onClose={() => setJumping(false)} closeLabel={t('common.close')} maxHeightRatio={0.7}>
                <ScrollView contentContainerStyle={styles.sheet} testID="library-sections">
                  <Group>
                    {headings.map(h => (
                      <Row
                        key={h.b}
                        title={h.h}
                        onPress={() => {
                          setJumping(false);
                          // Once the sheet has gone: a list does not move under an open one.
                          setTimeout(() => list.current?.scrollToIndex({ index: h.b, animated: false, viewPosition: 0 }), 450);
                        }}
                        testID={`library-section-${h.b}`}
                      />
                    ))}
                  </Group>
                </ScrollView>
              </ResponsiveModal>
            </Column>
          )
        }
      </HadithPage>
    );
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
              contentContainerStyle={[styles.book, { paddingBottom: Math.max(bottom, keyboard) + SPACING.xl }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              testID="library-book"
              renderItem={() =>
                file ? (
                  <View style={styles.bookBody}>
                    {/* One script a line: the author as the book names him for a reader of
                        Arabic script, in Latin letters otherwise ("d. 398 هـ" set both ways at once). */}
                    {arabicReader || !known ? (
                      <Text style={[styles.by, arabic, { color: palette.text }]} accessibilityLanguage={lang} testID="library-by">
                        {t('hadith.library.by', { author: file.author, died: file.died })}
                      </Text>
                    ) : (
                      <Text style={[styles.byLatin, { color: palette.text }]} testID="library-by">
                        {t('hadith.library.by', { author: known.authorLatin, died: known.died })}
                      </Text>
                    )}
                    {known ? (
                      <Text style={[styles.about, { color: palette.text }]} testID="library-about">
                        {t(`hadith.library.about.${known.id}`)}
                      </Text>
                    ) : null}
                    <Text style={[styles.note, { color: palette.muted }]} testID="library-note">
                      {t('hadith.library.bookNote')}
                    </Text>
                    <View style={[styles.search, inputChromeStyle(palette), { backgroundColor: palette.card }]}>
                      <SearchIcon size={18} color={palette.mutedSolid} />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('hadith.library.searchHint')}
                        placeholderTextColor={palette.muted}
                        style={[styles.searchInput, { color: palette.text }]}
                        accessibilityLabel={t('hadith.library.searchHint')}
                        returnKeyType="search"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                        testID="library-search"
                      />
                      {Platform.OS !== 'ios' && query.length > 0 ? (
                        <Pressable
                          onPress={() => setQuery('')}
                          accessibilityRole="button"
                          accessibilityLabel={t('hadith.searchClear')}
                          hitSlop={12}
                          style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
                          testID="library-search-clear"
                        >
                          <CloseIcon size={16} color={palette.mutedSolid} />
                        </Pressable>
                      ) : null}
                    </View>
                    {asking ? (
                      found == null ? null : found.hits.length === 0 ? (
                        <Text style={[styles.note, { color: palette.muted }]} testID="library-no-results">
                          {t('hadith.noResults')}
                        </Text>
                      ) : (
                        <>
                          <Group>
                            {found.hits.map(h => (
                              <Row
                                key={`${h.c}.${h.b}`}
                                title={h.snippet}
                                subtitle={file.chapters[h.c].t}
                                onPress={() => navigation.push('LibraryBook', { id, chapter: h.c, block: h.b })}
                                testID={`library-hit-${h.c}-${h.b}`}
                              />
                            ))}
                          </Group>
                          {found.more ? (
                            <Text style={[styles.note, { color: palette.muted }]} testID="library-more">
                              {t('hadith.library.firstOnly', { count: LIBRARY_HITS_MAX })}
                            </Text>
                          ) : null}
                        </>
                      )
                    ) : (
                      <>
                    {place != null && file.chapters[place] ? (
                      <Group>
                        <Row
                          title={t('hadith.library.continue', { chapter: file.chapters[place].t })}
                          subtitle={t('hadith.library.chapterOf', { n: place + 1, count: file.chapters.length })}
                          onPress={() => open(place)}
                          testID="library-continue"
                        />
                      </Group>
                    ) : null}
                    {marks.some(m => file.chapters[m.c]?.b[m.b] != null) ? (
                      <>
                        <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
                          {t('hadith.library.marks')}
                        </Text>
                        <Group>
                          {marks
                            .filter(m => file.chapters[m.c]?.b[m.b] != null)
                            .map(m => (
                              <Row
                                key={`${m.c}.${m.b}`}
                                title={bookmarkSnippet(libraryBlockText(file.chapters[m.c].b[m.b]))}
                                subtitle={file.chapters[m.c].t}
                                onPress={() => navigation.push('LibraryBook', { id, chapter: m.c, block: m.b })}
                                testID={`library-mark-${m.c}-${m.b}`}
                              />
                            ))}
                        </Group>
                      </>
                    ) : null}
                    <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
                      {t('hadith.library.chapters')}
                    </Text>
                    {parts ? (
                      // A book of books: its parts, and the chapters of the one that is open.
                      parts.map((p, n) => (
                        <View key={n} style={styles.part}>
                          <Group>
                            <Row
                              title={p.name}
                              titleStyle={arabic}
                              onPress={() => (p.count === 1 ? open(p.first) : setOpenPart(openPart === n ? null : n))}
                              testID={`library-part-${n}`}
                            />
                          </Group>
                          {openPart === n && p.count > 1 ? (
                            <Group>
                              {file.chapters.slice(p.first, p.first + p.count).map((c, i) => (
                                <Row key={i} title={c.t} titleStyle={arabic} onPress={() => open(p.first + i)} testID={`library-chapter-${p.first + i}`} />
                              ))}
                            </Group>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <Group>
                        {file.chapters.map((c, i) => (
                          <Row key={i} title={c.t} titleStyle={arabic} onPress={() => open(i)} testID={`library-chapter-${i}`} />
                        ))}
                      </Group>
                    )}
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => void Linking.openURL(file.source.url).catch(() => undefined)}
                      style={({ pressed }) => pressed && styles.pressed}
                      testID="library-source"
                    >
                      <Text style={[styles.note, { color: palette.muted }]}>
                        {t('hadith.library.source', { source: file.source.name, license: file.source.license })}
                      </Text>
                    </Pressable>
                    {/* The book off the device; the place and the marks in it are kept for when it is back. */}
                    <Group>
                      <Row title={t('hadith.library.remove')} tone="danger" onPress={() => void deletePack(key)} testID="library-remove" />
                    </Group>
                      </>
                    )}
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
  part: { gap: SPACING.sm },
  by: { ...arabicTextStyle('body'), fontSize: TYPE.title3.fontSize, lineHeight: 34 },
  byLatin: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  about: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  sectionTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '600' },
  text: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  block: { marginBottom: SPACING.lg, paddingHorizontal: SPACING.sm, marginHorizontal: -SPACING.sm, borderRadius: RADIUS.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg, paddingVertical: SPACING.sm },
  whereRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  where: { fontSize: TYPE.footnote.fontSize, fontVariant: ['tabular-nums'] },
  sheet: { padding: SPACING.lg },
  search: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.lg },
  searchInput: { flex: 1, fontSize: TYPE.body.fontSize, paddingVertical: SPACING.sm },
  searchClear: { padding: SPACING.xs },
  progress: { height: StyleSheet.hairlineWidth * 3 },
  progressFill: { height: '100%' },
  para: { ...arabicTextStyle('body') },
  paraPlain: { fontSize: TYPE.body.fontSize },
  paraNext: { marginTop: SPACING.md },
  headingPlain: { fontSize: TYPE.title3.fontSize, lineHeight: 30, fontWeight: '600', marginTop: SPACING.md, marginBottom: SPACING.md },
  verseLinePlain: { fontSize: TYPE.body.fontSize, textAlign: 'center' },
  heading: { ...arabicTextStyle('body'), fontSize: TYPE.title3.fontSize, lineHeight: 36, fontWeight: '600', marginTop: SPACING.md, marginBottom: SPACING.md },
  verse: { alignItems: 'center', gap: SPACING.xs },
  verseLine: { ...arabicTextStyle('body'), textAlign: 'center', writingDirection: 'rtl' },
  turn: { marginTop: SPACING.xl, gap: SPACING.md },
  link: { alignItems: 'center', paddingVertical: SPACING.sm },
  linkText: { fontSize: TYPE.body.fontSize },
  pressed: { opacity: 0.6 },
});
