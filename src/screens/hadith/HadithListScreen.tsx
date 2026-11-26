/**
 * One list of hadith: a curated set, one of Look up's tiles, a HadeethEnc
 * topic, one of the books, or the reader's bookmarks (`catalog.ts`,
 * list ids).
 *
 * Rows are titles — HadeethEnc's, or the first words of an Arabic matn —
 * with a tick for what has been read. A set is for reading through and
 * its rows are titles alone; a topic is for looking something up, and
 * each of its rows says who reported the hadith and how it is graded. A
 * long list gets a field that searches it. Until the list's packs are on
 * the device the page is the download prompt (`PackGate`).
 *
 * ── A LONG TOPIC OPENS ON ITS PARTS ────────────────────────────────────
 *
 * A topic with more hadith than anyone reads through, and topics under
 * it, shows those first — each with its count, and "All hadith" for the
 * whole list (`opensOnContents`, `catalog.ts`). The field stays above
 * them and searches everything under the topic, so a reader who knows
 * the word never needs the headings. A tile made of two topics (prayer
 * and purification) lists each under its own name.
 *
 * ── A HADITH IS NOT A RULING ───────────────────────────────────────────
 *
 * The lists people open with a question of what to do — the tiles marked
 * `fiqh`, and everything under HadeethEnc's jurisprudence — open with one
 * line saying so (`hadith.rulingNote`). A hadith read alone, without what
 * qualifies it, abrogates it or how the schools understood it, is how
 * people arrive at rulings nobody qualified gave them; the app shows the
 * text and says plainly that the text is not the answer to "may I?".
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useLayoutRtl } from '../../i18n/useLayoutRtl';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { ownSideAlign } from '../../i18n/foreignText';
import { CenteredColumn } from '../../responsive/CenteredColumn';
import type { RootStackParamList } from '../../navigation/types';
import {
  FIQH_ROOT,
  findHub,
  findSet,
  LONG_LIST,
  opensOnContents,
  parseList,
  topicContents,
  type CategoryTree,
} from '../../hadith/catalog';
import { isGradedBook } from '../../hadith/bookGrades';
import { isBookmarked, isRead, isSetMarked, setSetMarked } from '../../hadith/hadithRecord';
import { updateHadithRecord, useHadithRecord } from '../../hadith/hadithStore';
import {
  foldForSearch,
  foldedTitle,
  latinDigits,
  searchHadith,
  type ListRow,
  type SearchHit,
} from '../../hadith/library';
import { setProgress } from '../../hadith/progress';
import { useAppLang, useCategoryTree, useListRows, useTopicCounts } from '../../hadith/useHadith';
import { Group, Row } from '../../components/ui';
import { CheckIcon, StarIcon } from '../../theme/icons';
import { inputChromeStyle, rowDividerStyle } from '../../theme/chrome';
import { ProgressTrack, TextAction } from '../../quran/downloadsUi';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';
import { Column } from './Column';
import { HadithPage } from './HadithPage';
import { PackGate } from './PackGate';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * A list's title, in the app's language where it has one. Only the seven
 * root topics have a name of the app's own; a topic under them is named
 * by HadeethEnc's tree, and without the tree by the tab — never by the
 * key ("hadith.topic.267" stood in the reader's title bar).
 */
export function listTitle(
  list: string,
  t: (k: string, o?: { defaultValue: string }) => string,
  tree: CategoryTree | null,
): string {
  const ref = parseList(list);
  if (!ref) return t('nav.hadith');
  if (ref.kind === 'bookmarks') return t('hadith.bookmarks');
  if (ref.kind === 'set') return t(`hadith.set.${ref.id}.title`);
  if (ref.kind === 'hub') return t(`hadith.hub.${ref.id}`);
  if (ref.kind === 'book') return t(`hadith.book.${ref.id}`);
  return tree?.title(ref.id) ?? t(`hadith.topic.${ref.id}`, { defaultValue: t('nav.hadith') });
}

const ARABIC = /[\u0600-\u06FF]/;
const NO_ROWS: ReadonlyArray<ListRow & Partial<SearchHit>> = [];

export function HadithListScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const layoutRtl = useLayoutRtl();
  const navigation = useNavigation<Nav>();
  const { list, all } = useRoute<RouteProp<RootStackParamList, 'HadithList'>>().params;
  const ref = parseList(list);
  const tree = useCategoryTree();
  const counts = useTopicCounts();
  const rec = useHadithRecord();
  const { rows, packs } = useListRows(list);
  const lang = useAppLang();
  const [filter, setFilter] = useState('');
  const keyboard = useKeyboardInset();

  const hub = ref?.kind === 'hub' ? findHub(ref.id) : undefined;
  // What a topic narrows to: the topics under it — and for a tile made of
  // several topics, those.
  const subtopics = !tree
    ? []
    : ref?.kind === 'cat'
      ? tree.children(ref.id)
      : hub
        ? hub.topics.length > 1
          ? hub.topics
          : tree.children(hub.topics[0])
        : [];
  // The topics this list is drawn from, for its field to search within.
  const topicsKey = ref?.kind === 'cat' ? ref.id : hub ? hub.topics.join(',') : '';
  const topics = useMemo(() => (topicsKey ? topicsKey.split(',') : null), [topicsKey]);
  const sections = useMemo(
    () => (tree && counts && topics ? topicContents(topics, tree, counts) : []),
    [tree, counts, topics],
  );
  // Its parts first, unless the whole list was asked for.
  const contents = !all && !!rows && opensOnContents(sections, rows.length);
  const rulings = hub ? !!hub.fiqh : ref?.kind === 'cat' && (tree?.rootOf(ref.id) ?? ref.id) === FIQH_ROOT;
  const set = ref?.kind === 'set' ? findSet(ref.id) : undefined;
  const ids = useMemo(() => rows?.map(r => r.id) ?? null, [rows]);
  const progress = set ? setProgress(rec, set.id, ids) : null;
  const setMarked = set ? isSetMarked(rec, set.id) : false;

  /*
   * The field over a list.
   *
   *   • A number is a hadith's number: that row, and no other.
   *   • In a book or a topic, words are looked for in the WHOLE text of
   *     every hadith (`searchHadith`, kept to this book or these topics).
   *     A row's title is a dozen words of it, and filtering titles found
   *     a hadith only by those: "wudu" under Prayer found three.
   *   • In a set or the bookmarks, words filter the titles: a few dozen
   *     rows the reader is reading through, not searching.
   */
  const isBook = ref?.kind === 'book';
  const bookId = isBook ? ref.id : null;
  const q = foldForSearch(filter);
  // Only where the rows are numbered: a book, the Forty.
  const numbered = useMemo(() => !!rows?.some(r => r.number != null), [rows]);
  const number = numbered && /^\d+$/.test(latinDigits(filter.trim())) ? latinDigits(filter.trim()) : null;
  const searchesText = (!!bookId || !!topics) && !!q && !number;
  const [found, setFound] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!searchesText) {
      setFound(null);
      setBusy(false);
      return undefined;
    }
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      searchHadith(filter, lang, {
        ...(bookId ? { book: bookId } : { topics: topics ?? [] }),
        limit: 200,
        isCancelled: () => !live,
      })
        .then(h => {
          if (!live) return;
          setFound(h);
          setBusy(false);
        })
        .catch(() => {
          if (live) setBusy(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [searchesText, bookId, topics, filter, lang]);

  const shown: ReadonlyArray<ListRow & Partial<SearchHit>> | null = useMemo(() => {
    if (!rows || !q) return rows;
    if (number) return rows.filter(r => String(r.number ?? '') === number);
    if (searchesText) return found;
    return rows.filter(r => foldedTitle(r).includes(q));
  }, [rows, q, number, searchesText, found]);

  const open = useCallback((id: string) => navigation.push('HadithReader', { id, list }), [navigation, list]);

  const fieldLabel = t(isBook ? 'hadith.filterBookPlaceholder' : topics ? 'hadith.filterTopicPlaceholder' : 'hadith.filterPlaceholder');
  const field =
    rows && rows.length >= LONG_LIST ? (
      <TextInput
        value={filter}
        onChangeText={setFilter}
        placeholder={fieldLabel}
        placeholderTextColor={palette.muted}
        style={[styles.filter, inputChromeStyle(palette), { color: palette.text, backgroundColor: palette.card }]}
        accessibilityLabel={fieldLabel}
        clearButtonMode="while-editing"
        autoCorrect={false}
        testID="hadith-list-filter"
      />
    ) : null;
  // A page of contents has no rows of its own until its field is typed in.
  const listed = contents && !q ? NO_ROWS : shown ?? NO_ROWS;
  const header = (
    <Column style={styles.headInner}>
      {rulings ? (
        <Text
          style={[styles.ruling, { color: palette.text, backgroundColor: palette.controlBg }]}
          accessibilityRole="text"
          testID="hadith-ruling-note"
        >
          {t('hadith.rulingNote')}
        </Text>
      ) : null}
      {/* A graded book says what it holds, and what it has left out (`bookGrades.ts`). */}
      {bookId && isGradedBook(bookId) ? (
        <Text
          style={[styles.ruling, { color: palette.text, backgroundColor: palette.controlBg }]}
          accessibilityRole="text"
          testID="hadith-graded-book-note"
        >
          {t('hadith.gradedBookNote')}
        </Text>
      ) : null}
      {set ? (
        <Text style={[styles.blurb, { color: palette.muted }]}>{t(`hadith.set.${set.id}.blurb`)}</Text>
      ) : null}
      {progress && progress.total > 0 ? (
        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Text style={[styles.progressText, tabularNumeralStyle, { color: palette.muted }]}>
              {t('hadith.progress', { read: progress.read, total: progress.total })}
            </Text>
            {setMarked || !progress.done ? (
              <TextAction
                label={setMarked ? t('hadith.markSetUnread') : t('hadith.markSetRead')}
                color={palette.accentSolid}
                onPress={() => void updateHadithRecord(r => setSetMarked(r, set!.id, !setMarked, Date.now()))}
              />
            ) : null}
          </View>
          <ProgressTrack progress={progress.read / progress.total} />
        </View>
      ) : null}
      {field}
      {contents && !q
        ? sections.map(s => (
            <View key={s.topic} style={styles.section}>
              {sections.length > 1 ? (
                <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
                  {tree?.title(s.topic)}
                </Text>
              ) : null}
              <Group>
                <Row
                  title={t('hadith.allHadith')}
                  value={String(s.total)}
                  onPress={() =>
                    navigation.push('HadithList', { list: sections.length > 1 ? `cat:${s.topic}` : list, all: true })
                  }
                  testID={`hadith-topic-all-${s.topic}`}
                />
                {s.children.map(c => (
                  <Row
                    key={c.id}
                    title={tree?.title(c.id) ?? ''}
                    value={String(c.count)}
                    onPress={() => navigation.push('HadithList', { list: `cat:${c.id}` })}
                    testID={`hadith-topic-${c.id}`}
                  />
                ))}
              </Group>
            </View>
          ))
        : null}
      {subtopics.length && !contents && !all ? (
        <View style={styles.subtopics}>
          {subtopics.map(id => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => navigation.push('HadithList', { list: `cat:${id}` })}
              style={({ pressed }) => [styles.subtopic, { backgroundColor: palette.controlBg }, pressed && styles.pressed]}
            >
              <Text style={[styles.subtopicText, { color: palette.text }]} numberOfLines={1}>
                {tree?.title(id)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Column>
  );

  return (
    <HadithPage title={listTitle(list, t, tree)}>
      {(bottom, onScroll) =>
        packs.missing.length ? (
          <Column>
            {/* A book has no translation: said before it is downloaded. */}
            <PackGate
              packs={packs}
              body={isBook && lang.slice(0, 2) !== 'ar' ? t('hadith.bookNeedsDownload') : undefined}
            />
          </Column>
        ) : (
          <FlatList
            data={listed}
            keyExtractor={r => r.id}
            onScroll={onScroll}
            scrollEventThrottle={32}
            ListHeaderComponent={header}
            ListEmptyComponent={
              contents && !q ? undefined : busy ? (
                <Text style={[styles.empty, { color: palette.muted }]} accessibilityLiveRegion="polite">
                  {t('placeSearch.searching')}
                </Text>
              ) : shown ? (
                <Text style={[styles.empty, { color: palette.muted }]}>
                  {ref?.kind === 'bookmarks' ? t('hadith.noBookmarks') : t('hadith.noResults')}
                </Text>
              ) : undefined
            }
            renderItem={({ item }) => (
              <HadithRow
                row={item}
                read={setMarked || isRead(rec, item.id)}
                bookmarked={isBookmarked(rec, item.id)}
                layoutRtl={layoutRtl}
                onPress={open}
                sub={item.snippet}
              />
            )}
            contentContainerStyle={{ paddingBottom: Math.max(bottom, keyboard + SPACING.lg) }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            windowSize={9}
          />
        )
      }
    </HadithPage>
  );
}

export const HadithRow = memo(function HadithRow({
  row,
  read,
  bookmarked,
  layoutRtl,
  onPress,
  sub,
  subLabel,
}: {
  row: ListRow;
  read: boolean;
  bookmarked: boolean;
  layoutRtl: boolean;
  onPress: (id: string) => void;
  /** A second, quieter line: where a search found its words. */
  sub?: string;
  /**
   * A small line under the title. What `sub` is from, when that is not the
   * hadith itself (a book, the explanation) — otherwise the row's own
   * note, where it has one: who reported it and its grade.
   */
  subLabel?: string;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const arabic = ARABIC.test(row.title);
  const subArabic = !!sub && ARABIC.test(sub);
  const label = subLabel ?? row.note;
  return (
    <CenteredColumn>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[row.number != null ? `${row.number}.` : '', row.title, label ?? '', read ? t('hadith.read') : '']
          .filter(Boolean)
          .join(' ')}
        onPress={() => onPress(row.id)}
        style={({ pressed }) => [styles.row, rowDividerStyle(palette), pressed && styles.pressed]}
      >
        {row.number != null ? (
          <Text style={[styles.number, tabularNumeralStyle, { color: palette.muted }]}>{row.number}</Text>
        ) : null}
        <View style={styles.words}>
          <Text
            style={[
              styles.title,
              arabic && styles.arabicTitle,
              arabic && { textAlign: ownSideAlign(true, layoutRtl), writingDirection: 'rtl' },
              { color: palette.text },
            ]}
            numberOfLines={2}
          >
            {row.title}
          </Text>
          {label ? (
            <Text style={[styles.subLabel, { color: palette.muted }]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
          {sub ? (
            <Text
              style={[
                styles.sub,
                subArabic && styles.arabicSub,
                subArabic && { textAlign: ownSideAlign(true, layoutRtl), writingDirection: 'rtl' },
                { color: palette.muted },
              ]}
              numberOfLines={2}
            >
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={styles.marks}>
          {bookmarked ? <StarIcon size={14} color={palette.accentSolid} filled /> : null}
          {read ? <CheckIcon size={16} color={palette.accentSolid} /> : null}
        </View>
      </Pressable>
    </CenteredColumn>
  );
});

const styles = StyleSheet.create({
  headInner: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.sm },
  blurb: { fontSize: TYPE.callout.fontSize, lineHeight: 21 },
  ruling: {
    fontSize: TYPE.footnote.fontSize,
    lineHeight: 19,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  progress: { gap: SPACING.xs },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  progressText: { fontSize: TYPE.footnote.fontSize },
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '500', marginTop: SPACING.xs },
  subtopics: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  subtopic: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, maxWidth: '100%' },
  subtopicText: { fontSize: TYPE.footnote.fontSize },
  filter: {
    fontSize: TYPE.body.fontSize,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 52,
  },
  number: { fontSize: TYPE.footnote.fontSize, minWidth: 28 },
  words: { flex: 1, gap: 2 },
  title: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  arabicTitle: { ...arabicTextStyle('body'), fontSize: TYPE.headline.fontSize, lineHeight: 30 },
  subLabel: { fontSize: TYPE.caption.fontSize, lineHeight: 16 },
  sub: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  arabicSub: { ...arabicTextStyle('body'), fontSize: TYPE.callout.fontSize, lineHeight: 26 },
  marks: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, minWidth: 16 },
  empty: { padding: SPACING.xl, textAlign: 'center', fontSize: TYPE.callout.fontSize },
  pressed: { opacity: 0.6 },
});
