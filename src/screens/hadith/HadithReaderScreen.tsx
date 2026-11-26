/**
 * One hadith: the Arabic with its diacritics, the meaning in the reader's
 * language, where it is from and how it is graded, and — folded until
 * asked for — HadeethEnc's explanation, the lessons drawn from it, and
 * the meanings of its harder words.
 *
 * At the foot: back and forward through the list it was opened from (or,
 * opened from a search, the book it is in — `homeList`), read, bookmark, a
 * note of one's own, and share. Opening an entry
 * remembers it for "Continue reading"; it does not mark it read — that is
 * the reader's to say.
 *
 * Saying it is one tap, in one place, where the reading ends: under the
 * text, "Mark as read and continue" marks it and turns to the next of the
 * list ("Mark as read" where there is no next). Once read, the same place
 * offers the next hadith and "Mark as unread". The bar had a tick as well,
 * and opened from a search — no list, no next — the page showed "Mark as
 * read" twice, a button and an icon, doing the same thing. What is read
 * says so in words, in the line of badges.
 *
 * In a set or a topic the page says where it is — "3 of 25" — above the
 * title: a list read through has an end, and the bar's arrows alone did
 * not say how far off it was. A book's hadith has its own number, in the
 * page's title.
 *
 * At the very foot, "Report a problem with this hadith" (`report.ts`).
 *
 * A translation the app's language does not have is shown in English and
 * says so; an Arabic reader gets the Arabic and the explanation, no
 * translation. The texts of the books are Arabic only.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { hadithHeading } from '../../hadith/heading';
import { Button, TextSizeStepper } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useReadingText } from '../../hooks/useReadingText';
import { useLayoutRtl } from '../../i18n/useLayoutRtl';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { foreignText, ownSideAlign } from '../../i18n/foreignText';
import { useSheetSides } from '../../responsive/sheetSides';
import type { RootStackParamList } from '../../navigation/types';
import { chapterAt, chapterName, homeList, parseList, seeInBook } from '../../hadith/catalog';
import { isBookmarked, isRead, memoOf, noteOf, setBookmark, setLast, setMemo, setNote, setRead } from '../../hadith/hadithRecord';
import { updateHadithRecord, useHadithRecord } from '../../hadith/hadithStore';
import { loadItem, type HadithItem, relatedHadith, type RelatedHadith } from '../../hadith/library';
import { hadithReport, hadithReportIssueUrl, hadithReportMailUrl } from '../../hadith/report';
import { usePacksReadyKey } from '../../hadith/packs';
import { useAppLang, useCategoryTree, useListRows } from '../../hadith/useHadith';
import { copyToClipboard } from '../../sync/clipboard';
import { CheckIcon, PenIcon, ShareIcon, StarIcon } from '../../theme/icons';
import { cardEdgeStyle, inputChromeStyle } from '../../theme/chrome';
import { TextAction } from '../../quran/downloadsUi';
import { READING_BASE } from '../../theme/readingText';
import { MAX_CONTENT_WIDTH, useResponsive } from '../../responsive/breakpoints';
import { ShareHadithModal, fitsACard } from './ShareHadithModal';
import { MemoGate, ReaderTools } from './ReaderExtras';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';
import { Column } from './Column';
import { HadithPage } from './HadithPage';
import { listTitle } from './HadithListScreen';
import { PackGate } from './PackGate';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The Arabic and its meaning side by side: two columns of an ordinary measure, and the gap between them. */
export const PAIR_MAX_WIDTH = 1040;
/**
 * The narrowest window they are set side by side in. Under it each half would be narrower than a phone's own
 * column — the desktop app's first window is 734 wide, an iPad mini upright 744 — and the two are stacked.
 */
export const PAIR_MIN_WIDTH = 800;

/** Where an entry is from, in a line. */
export function sourceLine(item: HadithItem, t: TFunction): string {
  if (item.source === 'hadeethenc') return t('hadith.sourceHadeethenc');
  if (item.source === 'nawawi') return t('hadith.sourceNawawi');
  return t('hadith.sourceBook', { book: t(`hadith.book.${item.book}`) });
}

/**
 * Where a hadith of a book stands in it, as it is cited: "Sahih Muslim
 * 2577 · Kindness, Kinship and Manners" — the book, the number its pack
 * carries (Open-Hadith-Data's edition: `reference.ts` has why no other
 * numbering is offered), and the compiler's chapter where the book has
 * them. Null for an entry that is not a book's row.
 */
export function hadithReference(item: HadithItem, t: TFunction): string | null {
  if (item.source !== 'book' || !item.book) return null;
  const place = Number(item.id.slice(item.id.lastIndexOf(':') + 1));
  const chapter = Number.isInteger(place) ? chapterAt(item.book, place) : undefined;
  const name = chapter ? chapterName(item.book, chapter.no, t('hadith.chapterNamesIn')) : '';
  const book = t(`hadith.book.${item.book}`);
  return [item.number != null ? `${book} ${item.number}` : book, name].filter(Boolean).join(' · ');
}

/**
 * What Share and Copy hand on: the text, its meaning, and where it is
 * from — for a book's hadith, the reference it is cited by. A hadith
 * pasted somewhere with "Sahih Muslim" under it and no number could not
 * be looked up again by whoever read it there.
 */
export function hadithShareText(item: HadithItem, t: TFunction): string {
  const parts = [item.arabic];
  if (item.text) parts.push(item.text);
  const cite = [item.attribution, item.grade].filter(Boolean).join(' · ');
  if (cite) parts.push(cite);
  const reference = hadithReference(item, t);
  if (reference) parts.push(reference);
  parts.push(sourceLine(item, t));
  return parts.filter(Boolean).join('\n\n');
}

/**
 * The lines under a hadith's text on its picture (`ShareHadithModal`), the
 * same ones `hadithShareText` sends as text: who reported it and its grade
 * in the source's words, the reference a book's hadith is cited by, and
 * where the text is from. The first is the one a reader of the picture
 * needs most, and is drawn as such.
 */
export function hadithCardLines(item: HadithItem, t: TFunction): string[] {
  const cite = [item.attribution, item.grade].filter(Boolean).join(' · ');
  return [cite, hadithReference(item, t) ?? '', sourceLine(item, t)].filter(Boolean);
}

export function HadithReaderScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const layoutRtl = useLayoutRtl();
  const { width: windowWidth } = useResponsive();
  const readingText = useReadingText();
  const navigation = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'HadithReader'>>().params;
  const { id } = params;
  // Opened from a search, there is no list: a book's hadith reads on in its book.
  const list = params.list ?? homeList(id);
  const lang = useAppLang();
  const here = usePacksReadyKey();
  const tree = useCategoryTree();
  const rec = useHadithRecord();
  const listing = useListRows(list ?? '');
  const [item, setItem] = useState<HadithItem | null | undefined>(undefined);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [picture, setPicture] = useState(false);
  // Read from the Memorising list, the text waits to be asked for (`MemoGate`).
  const [recalled, setRecalled] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    let live = true;
    loadItem(id, lang).then(x => {
      if (live) setItem(x);
    });
    return () => {
      live = false;
    };
  }, [id, lang, here]);

  // Others on the same subject (`relatedHadith`): asked for with the hadith,
  // shown folded like its explanation.
  const [related, setRelated] = useState<RelatedHadith | null>(null);
  useEffect(() => {
    let live = true;
    setRelated(null);
    relatedHadith(id, lang).then(x => {
      if (live) setRelated(x);
    });
    return () => {
      live = false;
    };
  }, [id, lang, here]);

  useEffect(() => {
    void updateHadithRecord(r => setLast(r, id, list, Date.now()));
    setOpen({});
    setCopied(false);
    setRecalled(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [id, list]);

  const ids = useMemo(() => listing.rows?.map(r => r.id) ?? [], [listing.rows]);
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : null;
  const next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : null;
  const go = (to: string) => navigation.setParams({ id: to, list });

  const read = isRead(rec, id);
  const marked = isBookmarked(rec, id);
  const note = noteOf(rec, id);
  const now = () => Date.now();

  const textDir = item?.textLang ? foreignText(item.textLang, i18n.language) : null;
  const arabicAlign = { textAlign: ownSideAlign(true, layoutRtl), writingDirection: 'rtl' as const };

  // Read through a compilation, a hadith is one of ITS hadith: the bar
  // names the compilation and the place in it, not the number the hadith
  // has in the book it is shown from.
  const inCompilation = parseList(list)?.kind === 'comp';
  // Where its compiler numbered his hadith, the bar carries HIS number
  // of this one: the list beside it said "3", and a page that said only
  // "2 of 1394" — its place among the ones held here — had lost the
  // number the hadith is known by in the book being read.
  const hisNumber = inCompilation && at >= 0 ? listing.rows?.[at]?.number : undefined;
  const title = hisNumber != null && list
    ? `${listTitle(list, t, tree)} · ${hisNumber}`
    : item?.number != null && item.source !== 'hadeethenc' && !inCompilation
    ? `${list ? listTitle(list, t, tree) : t('nav.hadith')} · ${item.number}`
    : list
      ? listTitle(list, t, tree, rec)
      : t('nav.hadith');

  // Under the text: say it is read, and go on.
  const readOn = () => {
    if (!read) void updateHadithRecord(r => setRead(r, id, true, now()));
    if (next) go(next);
  };

  // Where this is in the list it is being read through. A book's hadith
  // carries its own number in the title.
  const position =
    item && (item.source !== 'book' || inCompilation) && at >= 0 && ids.length > 1
      ? t('hadith.position', { n: at + 1, total: ids.length })
      : null;

  const report = (it: HadithItem) => {
    const r = hadithReport(it, lang, t('hadith.reportPrompt'), Platform.OS);
    Linking.openURL(hadithReportMailUrl(r)).catch(() =>
      Linking.openURL(hadithReportIssueUrl(r)).catch(() => undefined),
    );
  };

  const section = (key: string, label: string, body: ReactNode) => (
    <View key={key} style={[styles.section, cardEdgeStyle(palette), { backgroundColor: palette.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !!open[key] }}
        onPress={() => setOpen(o => ({ ...o, [key]: !o[key] }))}
        style={({ pressed }) => [styles.sectionHead, pressed && styles.pressed]}
      >
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.chevron, { color: palette.muted }]}>{open[key] ? '▾' : '▸'}</Text>
      </Pressable>
      {open[key] ? <View style={styles.sectionBody}>{body}</View> : null}
    </View>
  );

  const bodyText = (s: string) => (
    <Text style={[styles.prose, readingText.style(READING_BASE), textDir?.style, { color: palette.text }]}>
      {textDir?.open}
      {s}
      {textDir?.close}
    </Text>
  );

  // ARABIC AND MEANING SIDE BY SIDE, on a window wide enough for two columns
  // of text (a tablet, a desktop): a reader comparing the two had the whole
  // Arabic to scroll past to reach its meaning, in a single column with a
  // margin's worth of empty window either side. The pair is given a wider
  // column than the reading measure (two measures of ordinary length); what
  // follows it — the explanation, the buttons — keeps the usual one, since
  // prose a thousand points wide is not read. A phone, a hadith in Arabic
  // only, and an Arabic reader (who has no translation) are as they were.
  const sideBySide = windowWidth >= PAIR_MIN_WIDTH && !!item?.arabic && !!item?.text;
  const practising = parseList(list)?.kind === 'memo';
  const inBook = seeInBook(id);
  const arabicText = item?.arabic ? (
    <Text style={[styles.arabic, arabicAlign, { color: palette.text }]} selectable accessibilityLanguage="ar">
      {item.arabic}
    </Text>
  ) : null;
  const meaningText = item?.text ? (
    <Text style={[styles.translation, readingText.style(READING_BASE), textDir?.style, { color: palette.text }]} selectable>
      {textDir?.open}
      {item.text}
      {textDir?.close}
    </Text>
  ) : null;

  return (
    <HadithPage title={title} end={item?.text ? <TextSizeStepper /> : null}>
      {(bottom, onScroll) => (
        <View style={styles.flex}>
          {item && picture ? (
            <ShareHadithModal
              visible
              onClose={() => setPicture(false)}
              arabic={item.arabic}
              meaning={item.text}
              meaningRtl={item.textLang === 'ur' || item.textLang === 'ar'}
              lines={hadithCardLines(item, t)}
            />
          ) : null}
          {item === null ? (
            <Column>
              {list && listing.packs.missing.length ? (
                <PackGate packs={listing.packs} />
              ) : (
                <Text style={[styles.missing, { color: palette.muted }]}>{t('hadith.notOnDevice')}</Text>
              )}
            </Column>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              onScroll={onScroll}
              scrollEventThrottle={32}
              contentContainerStyle={{ paddingBottom: SPACING.lg }}
              contentInsetAdjustmentBehavior="never"
            >
              {item ? (
                <Column style={styles.page} maxWidth={sideBySide ? PAIR_MAX_WIDTH : undefined}>
                  {position ? (
                    <Text style={[styles.position, tabularNumeralStyle, { color: palette.muted }]} testID="hadith-position">
                      {position}
                    </Text>
                  ) : null}
                  {item.source === 'hadeethenc' ? (
                    <Text style={[styles.heading, textDir?.style, { color: palette.text }]} accessibilityRole="header">
                      {textDir?.open}
                      {hadithHeading(item.title, item.text ?? item.arabic)}
                      {textDir?.close}
                    </Text>
                  ) : null}
                  {practising ? (
                    <>
                      {/* A book's row has no heading: its opening words are the cue. */}
                      {!recalled && item.source !== 'hadeethenc' ? (
                        <Text style={[styles.arabic, arabicAlign, { color: palette.text }]} accessibilityLanguage="ar">
                          {item.title}
                        </Text>
                      ) : null}
                      <MemoGate
                        shown={recalled}
                        memorised={memoOf(rec, id) === 2}
                        onShow={() => setRecalled(true)}
                        onKnew={() => {
                          void updateHadithRecord(r => setMemo(r, id, 2, now()));
                          if (next) go(next);
                        }}
                        onNotYet={() => {
                          void updateHadithRecord(r => setMemo(r, id, 1, now()));
                          if (next) go(next);
                        }}
                      />
                    </>
                  ) : null}
                  {practising && !recalled ? null : sideBySide ? (
                    // A wide window: the Arabic and its meaning beside each
                    // other, the Arabic on the right whatever the app's
                    // direction (`sideBySide`, above).
                    <View style={styles.pair} testID="hadith-side-by-side">
                      {(layoutRtl ? [arabicText, meaningText] : [meaningText, arabicText]).map((half, i) => (
                        <View key={i} style={styles.half}>
                          {half}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <>
                      {arabicText}
                      {meaningText}
                    </>
                  )}
                  <View style={sideBySide ? styles.measure : styles.rest}>
                  {item.fallback ? (
                    <Text style={[styles.note, { color: palette.muted }]}>{t('hadith.fallbackNote')}</Text>
                  ) : null}
                  {!item.text && item.source !== 'hadeethenc' && lang.slice(0, 2) !== 'ar' ? (
                    <Text style={[styles.note, { color: palette.muted }]}>{t('hadith.arabicOnlyNote')}</Text>
                  ) : null}

                  {/* al-Bukhārī's and Muslim's: what stands behind the text, since no grade does. */}
                  {item.sahihCollection && item.book ? (
                    <Text style={[styles.note, { color: palette.muted }]} testID="hadith-sahih-collection">
                      {t('hadith.sahihCollectionNote', { book: t(`hadith.book.${item.book}`) })}
                    </Text>
                  ) : null}

                  <View style={styles.badges}>
                    {read ? <Badge text={t('hadith.read')} solid /> : null}
                    {/* A graded book: each grader's own verdict, in the source's words. */}
                    {item.verdicts
                      ? item.verdicts.map(v => <Badge key={v.grader} text={`${v.grader}: ${v.grade}`} />)
                      : item.grade
                        ? <Badge text={item.grade} />
                        : null}
                    {item.attribution ? <Badge text={item.attribution} muted /> : null}
                    {item.number != null && item.source === 'hadeethenc' ? (
                      <Badge text={t('hadith.nawawiNumber', { n: item.number })} muted />
                    ) : null}
                  </View>

                  {item.explanation
                    ? section('sharh', t('hadith.explanation'), bodyText(item.explanation))
                    : null}
                  {item.hints.length
                    ? section(
                        'fawaid',
                        t('hadith.benefits'),
                        <View style={styles.list}>
                          {item.hints.map((h, i) => (
                            <View key={i} style={styles.bulletRow}>
                              <Text style={[styles.bullet, { color: palette.accentSolid }]}>•</Text>
                              <View style={styles.flex}>{bodyText(h)}</View>
                            </View>
                          ))}
                        </View>,
                      )
                    : null}
                  {item.words.length
                    ? section(
                        'words',
                        t('hadith.wordMeanings'),
                        <View style={styles.list}>
                          {item.words.map((w, i) => (
                            <View key={i} style={styles.wordRow}>
                              <Text style={[styles.word, arabicAlign, { color: palette.text }]}>{w.word}</Text>
                              {bodyText(w.meaning)}
                            </View>
                          ))}
                        </View>,
                      )
                    : null}

                  {related?.rows.length
                    ? section(
                        'related',
                        t('hadith.related', { topic: tree?.title(related.topic) ?? '' }).replace(/[:：]\s*$/, ''),
                        <View style={styles.list}>
                          {related.rows.map(r => (
                            <Pressable
                              key={r.id}
                              accessibilityRole="button"
                              onPress={() => navigation.push('HadithReader', { id: r.id, list: `cat:${related.topic}` })}
                              style={({ pressed }) => pressed && styles.pressed}
                              testID={`hadith-related-${r.id}`}
                            >
                              <Text style={[styles.prose, { color: palette.text }]}>{r.title}</Text>
                              {r.note ? <Text style={[styles.relatedNote, { color: palette.muted }]}>{r.note}</Text> : null}
                            </Pressable>
                          ))}
                          <TextAction
                            label={t('hadith.allHadith')}
                            color={palette.accentSolid}
                            onPress={() => navigation.push('HadithList', { list: `cat:${related.topic}` })}
                          />
                        </View>,
                      )
                    : null}

                  {note ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('hadith.editNote')}
                      onPress={() => setEditing(true)}
                      style={[styles.noteBox, { backgroundColor: palette.accentBg }]}
                    >
                      <Text style={[styles.noteLabel, { color: palette.muted }]}>{t('hadith.yourNote')}</Text>
                      <Text style={[styles.prose, { color: palette.text }]}>{note}</Text>
                    </Pressable>
                  ) : null}

                  {!read || next ? (
                    <Button
                      label={read ? t('hadith.next') : next ? t('hadith.readNext') : t('hadith.markRead')}
                      variant={read ? 'secondary' : 'primary'}
                      onPress={readOn}
                    />
                  ) : null}
                  {read ? (
                    <View style={styles.unread}>
                      <TextAction
                        label={t('hadith.markUnread')}
                        color={palette.muted}
                        onPress={() => void updateHadithRecord(r => setRead(r, id, false, now()))}
                      />
                    </View>
                  ) : null}

                  <View style={styles.sourceRow}>
                    <Text style={[styles.source, { color: palette.muted }]}>{sourceLine(item, t)}</Text>
                    <TextAction
                      label={copied ? t('hadith.copied') : t('hadith.copy')}
                      color={palette.accentSolid}
                      onPress={async () => {
                        const r = await copyToClipboard(hadithShareText(item, t));
                        setCopied(r !== 'failed');
                      }}
                    />
                  </View>
                  <View style={styles.report}>
                    {/* As a picture, where it can be shown whole on one and the
                        platform can hand a file to a share sheet (not a browser). */}
                    {Platform.OS !== 'web' && fitsACard(item) ? (
                      <TextAction label={t('hadith.shareImage')} color={palette.accentSolid} onPress={() => setPicture(true)} />
                    ) : null}
                    {/* The same hadith as its collector has it, with its chain (`seeInBook`). */}
                    {inBook ? (
                      <TextAction
                        label={t('hadith.seeIn', { book: t(`hadith.book.${inBook.book}`) })}
                        color={palette.accentSolid}
                        onPress={() => navigation.push('HadithReader', { id: inBook.id, list: `book:${inBook.book}` })}
                      />
                    ) : null}
                    <ReaderTools id={id} rec={rec} />
                    {/* A grade is shown above, or a line saying there is none of
                        ours: this is where a reader asks what either means. */}
                    <TextAction
                      label={t('hadith.grades.title')}
                      color={palette.muted}
                      onPress={() => navigation.navigate('SettingsHadithGrades')}
                    />
                    <TextAction label={t('hadith.report')} color={palette.muted} onPress={() => report(item)} />
                  </View>
                  </View>
                </Column>
              ) : null}
            </ScrollView>
          )}

          {item ? (
            <View style={[styles.bar, { paddingBottom: bottom - SPACING.md, backgroundColor: palette.bg, borderTopColor: palette.border }]}>
              <Column style={styles.barInner}>
                <BarButton
                  label={t('hadith.previous')}
                  disabled={!prev}
                  onPress={() => prev && go(prev)}
                  icon={<Text style={[styles.arrow, { color: prev ? palette.text : palette.muted }]}>{layoutRtl ? '›' : '‹'}</Text>}
                />
                <BarButton
                  label={marked ? t('hadith.removeBookmark') : t('hadith.bookmark')}
                  selected={marked}
                  onPress={() => void updateHadithRecord(r => setBookmark(r, id, !marked, now()))}
                  icon={<StarIcon size={22} color={marked ? palette.accentSolid : palette.muted} filled={marked} />}
                />
                <BarButton
                  label={note ? t('hadith.editNote') : t('hadith.addNote')}
                  selected={!!note}
                  onPress={() => setEditing(true)}
                  icon={<PenIcon size={22} color={note ? palette.accentSolid : palette.mutedSolid} />}
                />
                <BarButton
                  label={t('hadith.share')}
                  onPress={() => void Share.share({ message: hadithShareText(item, t) }).catch(() => undefined)}
                  icon={<ShareIcon size={22} color={palette.muted} />}
                />
                <BarButton
                  label={t('hadith.next')}
                  disabled={!next}
                  onPress={() => next && go(next)}
                  icon={<Text style={[styles.arrow, { color: next ? palette.text : palette.muted }]}>{layoutRtl ? '‹' : '›'}</Text>}
                />
              </Column>
            </View>
          ) : null}

          <NoteEditor
            visible={editing}
            initial={note}
            onClose={() => setEditing(false)}
            onSave={text => {
              setEditing(false);
              void updateHadithRecord(r => setNote(r, id, text.trim(), now()));
            }}
          />
        </View>
      )}
    </HadithPage>
  );
}

function Badge({ text, muted, solid }: { text: string; muted?: boolean; solid?: boolean }) {
  const { palette } = useAppPalette();
  const bg = solid ? palette.accentSolid : muted ? palette.controlBg : palette.accentBg;
  const fg = solid ? palette.onAccent : muted ? palette.muted : palette.accentSolid;
  return (
    <View style={[styles.badge, solid && styles.badgeSolid, { backgroundColor: bg }]}>
      {solid ? <CheckIcon size={13} color={fg} /> : null}
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function BarButton({
  label,
  icon,
  onPress,
  disabled,
  selected,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.barButton,
        // Chosen sits on a tint: the icon's colour alone did not say so.
        selected && { backgroundColor: palette.accentBg },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 },
      ]}
    >
      {icon}
    </Pressable>
  );
}

function NoteEditor({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [text, setText] = useState(initial);
  // A Modal is its own window on Android: nothing resizes it for the keyboard.
  const keyboard = useKeyboardInset();
  const sides = useSheetSides();
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.scrim,
          {
            backgroundColor: palette.overlay,
            paddingBottom: SPACING.lg + keyboard,
            // rtl-safe: the vertical bar is on a physical side
            paddingLeft: SPACING.lg + sides.left,
            // rtl-safe: the vertical bar is on a physical side
            paddingRight: SPACING.lg + sides.right,
          },
        ]}
      >
        <View style={[styles.sheet, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('hadith.yourNote')}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            placeholder={t('hadith.notePlaceholder')}
            placeholderTextColor={palette.muted}
            style={[styles.noteInput, inputChromeStyle(palette), { color: palette.text, backgroundColor: palette.bg }]}
            accessibilityLabel={t('hadith.yourNote')}
            maxLength={4000}
          />
          <View style={styles.sheetActions}>
            <Button label={t('common.cancel')} variant="tertiary" onPress={onClose} />
            <Button label={t('common.save')} onPress={() => onSave(text)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.lg },
  // What follows the text: the page's own gap on a phone; the usual reading
  // measure, centred under the wider pair, where the two are side by side.
  rest: { gap: SPACING.lg },
  measure: { gap: SPACING.lg, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xxl },
  half: { flex: 1, minWidth: 0 },
  heading: { fontSize: TYPE.title3.fontSize, fontWeight: '500', lineHeight: 28 },
  arabic: { ...arabicTextStyle('body'), fontSize: TYPE.title2.fontSize, lineHeight: 46 },
  translation: { fontSize: TYPE.body.fontSize, lineHeight: 26 },
  prose: { fontSize: TYPE.callout.fontSize, lineHeight: 23 },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: -SPACING.sm },
  // Sits on the title it counts: the page's gap is taken back.
  position: { fontSize: TYPE.footnote.fontSize, marginBottom: -SPACING.md },
  unread: { flexDirection: 'row', justifyContent: 'center', marginTop: -SPACING.sm },
  relatedNote: { fontSize: TYPE.footnote.fontSize, marginTop: SPACING.xs },
  // Two lines of their own, centred: side by side they do not fit a phone.
  report: { alignItems: 'center', gap: SPACING.sm },
  missing: { padding: SPACING.xl, textAlign: 'center', fontSize: TYPE.callout.fontSize },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  badge: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  badgeSolid: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  badgeText: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  section: { borderRadius: RADIUS.md, overflow: 'hidden' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
  },
  sectionTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '500' },
  // ▸ at the text's own size was a speck beside its heading on Android.
  chevron: { fontSize: TYPE.title3.fontSize, lineHeight: 22 },
  sectionBody: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  list: { gap: SPACING.md },
  bulletRow: { flexDirection: 'row', gap: SPACING.sm },
  bullet: { fontSize: TYPE.callout.fontSize, lineHeight: 23 },
  wordRow: { gap: 2 },
  word: { ...arabicTextStyle('body'), fontSize: TYPE.headline.fontSize, lineHeight: 30 },
  noteBox: { borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.xs },
  noteLabel: { fontSize: TYPE.footnote.fontSize },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  source: { flex: 1, fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACING.sm },
  barInner: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: SPACING.sm },
  barButton: { minWidth: 44, minHeight: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 30, lineHeight: 34 },
  pressed: { opacity: 0.6 },
  scrim: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
  sheet: { borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  noteInput: {
    minHeight: 140,
    fontSize: TYPE.body.fontSize,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    textAlignVertical: 'top',
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
});
