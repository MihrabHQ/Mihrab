/**
 * The Hadith tab.
 *
 * A search field and a Learn | Look up switcher stay pinned at the top;
 * the page under them scrolls. Two readers, two pages:
 *
 *   • LEARN — someone who wants to read, and does not know where to
 *     begin. One question ("Where are you starting from?"), asked once and
 *     changed whenever; then the three or four sets for that answer, any
 *     of which can be opened today and another tomorrow. Nothing is a
 *     step and nothing is locked. A set shows how far along it is once it
 *     has been begun, and a finished one folds into "Completed".
 *   • LOOK UP — someone who has a question, or knows the book. Tiles
 *     named for the question (prayer, fasting, family…), HadeethEnc's own
 *     tree under "All topics", and the books.
 *
 * The field searches everything on the device, reads "Bukhari 2345" as
 * the hadith it names (`reference.ts`), and narrows to al-Bukhārī and
 * Muslim, to the books, or to one topic.
 *
 * ── WHAT THE LEARN PAGE NO LONGER SHOWS ────────────────────────────────
 *
 * It was every set at once — twelve cards, each with a level tag, a
 * progress bar at "0 of 156" and a "Mark as already read" link — under
 * three chips that only reordered them. Someone new was choosing among
 * twelve, which is the thing the page exists to spare them. The other
 * levels' sets are a fold away ("All sets"); marking a set as known is on
 * the set's own page, where it is a decision about that set and not a
 * link on every card.
 *
 * Nothing of the hadith is in the app: one tap brings HadeethEnc in the
 * reader's language (`libraryPacks`), from our copy first and the source
 * second (`hadith/packs.ts`); each book is a download of its own. The
 * switcher's choice is remembered.
 *
 * ── THE FIRST OPEN ─────────────────────────────────────────────────────
 *
 * With nothing on the device the page is the download card and nothing
 * else. It was the card over everything — a search field with nothing to
 * search, a switcher between two empty pages, a question about level and
 * three sets that each opened on another download prompt — and the one
 * thing to do was the fourth thing down. Once there is anything here (a
 * book, another language's hadith) the page is whole and the card sits
 * at its top, because then there is something to read and to search.
 *
 * Sources: HadeethEnc.com (texts, translations, explanations); an-Nawawi's
 * Arabic from fawazahmed0/hadith-api; the books from
 * mhashim6/Open-Hadith-Data (ODbL), and the grades of five of them from
 * fawazahmed0/hadith-api (`bookGrades.ts`). Named at the foot of Look up and in
 * Settings → About.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '../storage/appStorage';
import { Chip, Group, Row, SegmentedControl } from '../components/ui';
import { useAppPalette } from '../hooks/useAppPalette';
import { useTabBarInset } from '../navigation/tabBarInset';
import { useTabPageTop } from '../navigation/useTabPageTop';
import { useTabBarScroll } from '../navigation/tabBarVisibility';
import type { RootStackParamList } from '../navigation/types';
import {
  AGREED_LIST,
  AGREED_OFFERED,
  BOOKS,
  bookKey,
  findHub,
  HADITH_HUBS,
  HADITH_SETS,
  LEVELS,
  libraryPacks,
  nawawiIds,
  packsForSet,
  ROOT_TOPICS,
  type HadithSet,
  type Level,
} from '../hadith/catalog';
import { Column } from './hadith/Column';
import { isGradedBook } from '../hadith/bookGrades';
import { bookmarkedIds, isBookmarked, isRead, setLevel } from '../hadith/hadithRecord';
import { updateHadithRecord, useHadithRecord } from '../hadith/hadithStore';
import { gradesKnown, loadItem, searchHadith, setRows, warmSearch, type HadithItem, type SearchHit } from '../hadith/library';
import { GRADE_CLASSES, type GradeClass } from '../hadith/grade';
import { packStatus, usePackStatuses, usePacksReadyKey, usePacksScanned } from '../hadith/packs';
import { checkPackUpdates } from '../hadith/packUpdates';
import { continueAt, levelOf, resumeTarget, resumeWhere, setProgress, shelfFor, type SetProgress } from '../hadith/progress';
import { lookUpReference, NAWAWI_REF, parseReference, type ReferenceAnswer } from '../hadith/reference';
import { summarisePacks, useAppLang, useCategoryTree, useListRows } from '../hadith/useHadith';
import type { PackKey } from '../hadith/packTypes';
import { cardEdgeStyle, inputChromeStyle } from '../theme/chrome';
import { CloseIcon, SearchIcon } from '../theme/icons';
import { inlineSize, ProgressTrack, TextAction } from '../quran/downloadsUi';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';
import { tabularNumeralStyle } from '../theme/textScale';
import { HadithRow, listTitle } from './hadith/HadithListScreen';
import { PackGate, useManifest, packsBytes } from './hadith/PackGate';
import { useLayoutRtl } from '../i18n/useLayoutRtl';
import { ownSideAlign } from '../i18n/foreignText';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Mode = 'learn' | 'browse';
const MODE_KEY = 'mihrab.hadith.mode';

/**
 * Each set's entry ids.
 *
 * A chosen set's are in the app (`sets.json`) and an-Nawawi's are his, so
 * a card can say "25 hadith" before anything is downloaded. Once the packs
 * are here the rows themselves answer — an entry HadeethEnc has withdrawn
 * is then not counted, and a set can still be finished. A book's are only
 * known from its pack.
 */
function useSetIds(): Record<string, string[]> {
  const lang = useAppLang();
  // When a pack arrives or goes — not on each tick of one coming down.
  const here = usePacksReadyKey();
  const known = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const set of HADITH_SETS) {
      if (set.nawawi) out[set.id] = nawawiIds();
      else if (set.ids) out[set.id] = set.ids.map(id => `h:${id}`);
    }
    return out;
  }, []);
  const [ids, setIds] = useState<Record<string, string[]>>(known);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: Record<string, string[]> = { ...known };
      for (const set of HADITH_SETS) {
        if (packsForSet(set, lang).some(k => packStatus(k).state !== 'ready')) continue;
        out[set.id] = (await setRows(set, lang)).map(r => r.id);
      }
      if (live) setIds(out);
    })();
    return () => {
      live = false;
    };
  }, [lang, here, known]);
  return ids;
}

export function HadithScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<Nav>();
  const lang = useAppLang();
  const pageTop = useTabPageTop();
  const tabBarInset = useTabBarInset();
  const tabBarScroll = useTabBarScroll();
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(scrollRef);
  // Results run on under the keyboard while the field is open.
  const keyboard = useKeyboardInset();
  const statuses = usePackStatuses();

  const [mode, setMode] = useState<Mode>('learn');
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then(v => {
        if (v === 'learn' || v === 'browse') setMode(v);
      })
      .catch(() => undefined);
  }, []);
  const choose = useCallback((m: Mode) => {
    setMode(m);
    // The other page from its top: it opened wherever this one had been scrolled to.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    AsyncStorage.setItem(MODE_KEY, m).catch(() => undefined);
  }, []);

  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;

  // Have the downloaded hadith ready to be searched before the field is
  // touched: the first query used to wait while every text was folded.
  const here = usePacksReadyKey();
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void warmSearch(lang, () => !live).catch(() => undefined);
    }, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [lang, here]);

  // A pack we have corrected since it was downloaded is fetched again:
  // once a day at most, and only where there is a pack (`packUpdates.ts`).
  useFocusEffect(
    useCallback(() => {
      void checkPackUpdates();
    }, []),
  );

  // The field's hint names a reference that works in this language
  // (`hadith.searchExample`; hadithSearchHint.test.ts reads each one).
  const searchHint = t('hadith.searchPlaceholder', { example: t('hadith.searchExample') });
  const segments = useMemo(
    () => [
      { key: 'learn' as const, label: t('hadith.learn') },
      { key: 'browse' as const, label: t('hadith.browse') },
    ],
    [t],
  );

  // The one download: asked for at the top of whichever page is showing,
  // until it is here — and alone on the page while nothing else is.
  const library = summarisePacks(libraryPacks(lang), statuses);
  const scanned = usePacksScanned();
  // "Nothing else": no pack but this download's own. Its small parts land
  // before its large one, and the page must not change under a download.
  const firstOpen =
    library.missing.length > 0 &&
    !Object.keys(statuses).some(k => statuses[k].state === 'ready' && !library.keys.includes(k as PackKey));
  const gate = (
    <View
      style={[styles.card, styles.gate, cardEdgeStyle(palette), { backgroundColor: palette.card }]}
      testID="hadith-library-gate"
    >
      <Text style={[styles.cardTitle, styles.gateTitle, { color: palette.text }]}>{t('hadith.welcomeTitle')}</Text>
      <PackGate packs={library} body={t('hadith.welcomeBody')} />
    </View>
  );

  // Not looked yet: neither the prompt nor the page, for a moment.
  if (!scanned) return <View style={[styles.root, { backgroundColor: palette.bg }]} />;
  if (firstOpen) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]} testID="hadith-first-open">
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          // The one card in the middle of the page: at its top it left
          // four-fifths of a phone's screen empty under it, and read as a
          // page that had not finished loading.
          contentContainerStyle={[styles.firstOpen, { paddingTop: pageTop + SPACING.sm, paddingBottom: tabBarInset }]}
          contentInsetAdjustmentBehavior="never"
        >
          <Column style={styles.page}>{gate}</Column>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <Column outer={{ paddingTop: pageTop, backgroundColor: palette.bg }} style={styles.pinned}>
        <View style={[styles.search, inputChromeStyle(palette), { backgroundColor: palette.card }]}>
          <SearchIcon size={18} color={palette.mutedSolid} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchHint}
            placeholderTextColor={palette.muted}
            style={[styles.searchInput, { color: palette.text }]}
            accessibilityLabel={searchHint}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            testID="hadith-search"
          />
          {/* iOS draws its own (clearButtonMode); Android and the web have none,
              and a query was still in the field on coming back to the tab. */}
          {Platform.OS !== 'ios' && query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel={t('hadith.searchClear')}
              hitSlop={12}
              style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
              testID="hadith-search-clear"
            >
              <CloseIcon size={16} color={palette.mutedSolid} />
            </Pressable>
          ) : null}
        </View>
        {!searching ? (
          <SegmentedControl
            segments={segments}
            value={mode}
            onChange={choose}
            accessibilityLabel={t('nav.hadith')}
            testID="hadith-mode"
          />
        ) : null}
      </Column>
      <ScrollView
        ref={scrollRef}
        {...tabBarScroll}
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: Math.max(tabBarInset, keyboard + SPACING.lg), paddingTop: SPACING.sm }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.page}>
          {library.missing.length && !searching ? gate : null}
          {searching ? (
            <SearchResults
              query={query}
              lang={lang}
              navigation={navigation}
              // The hadith in this language are not here (deleted in
              // Settings, say, with a book kept): a search that finds
              // nothing says why and offers them, not "Nothing found."
              whenEmpty={library.missing.length ? gate : undefined}
            />
          ) : mode === 'learn' ? (
            <Learn navigation={navigation} lang={lang} onLookUp={() => choose('browse')} />
          ) : (
            <Browse navigation={navigation} />
          )}
        </Column>
      </ScrollView>
    </View>
  );
}

/** A heading that opens and closes what is under it. */
function Fold({ title, open, onToggle, testID }: { title: string; open: boolean; onToggle: () => void; testID?: string }) {
  const { palette } = useAppPalette();
  const rtl = useLayoutRtl();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      testID={testID}
      style={({ pressed }) => [styles.fold, pressed && styles.pressed]}
    >
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.foldMark, { color: palette.muted }]}>{open ? '▾' : rtl ? '◂' : '▸'}</Text>
    </Pressable>
  );
}

// ── Learn ──────────────────────────────────────────────────────────────

function Learn({ navigation, lang, onLookUp }: { navigation: Nav; lang: string; onLookUp: () => void }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const rtl = useLayoutRtl();
  const rec = useHadithRecord();
  const level = levelOf(rec);
  // Asked until it is answered; after that one quiet line, and "Change".
  const answered = rec.level != null;
  const [changing, setChanging] = useState(false);
  const ids = useSetIds();
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const here = usePacksReadyKey();
  // Where "Continue reading" goes: the hadith last opened — or, once that
  // one is marked read, the next in its list that is not. It used to open
  // the one just finished, every time.
  const last = continueAt(rec);
  // Its list is only read once it is needed: that can be a whole book.
  const lastRead = last ? isRead(rec, last.id) : false;
  const lastList = useListRows(lastRead ? last?.list ?? '' : '');
  const resume = useMemo(
    () => resumeTarget(rec, lastList.rows?.map(r => r.id) ?? null),
    [rec, lastList.rows],
  );
  const [resumeItem, setResumeItem] = useState<HadithItem | null>(null);
  const resumeTitle = resumeItem?.title ?? null;
  const tree = useCategoryTree();
  const bookmarks = bookmarkedIds(rec);

  useEffect(() => {
    let live = true;
    if (!resume) setResumeItem(null);
    else
      loadItem(resume.id, lang).then(item => {
        if (live) setResumeItem(item);
      });
    return () => {
      live = false;
    };
  }, [resume?.id, lang, here]); // eslint-disable-line react-hooks/exhaustive-deps

  // What it is a line of: the set, topic or book it was being read in.
  const resumeFrom =
    resume && resumeItem
      ? resumeWhere(
          resumeItem,
          resume.list ? listTitle(resume.list, t, tree) : null,
          resumeItem.book ? t(`hadith.book.${resumeItem.book}`) : null,
          !!resume.list && !!HADITH_SETS.find(s => `set:${s.id}` === resume.list)?.nawawi,
        )
      : null;
  const resumeArabic = !!resumeTitle && /[\u0600-\u06FF]/.test(resumeTitle);

  const progressOf = (s: HadithSet) => setProgress(rec, s.id, ids[s.id] ?? null);
  const shelf = shelfFor(level, s => progressOf(s).done);
  const openSet = (s: HadithSet) => navigation.push('HadithList', { list: `set:${s.id}` });
  const pick = (lv: Level) => {
    setChanging(false);
    void updateHadithRecord(r => setLevel(r, lv, Date.now()));
  };

  return (
    <View style={styles.stack}>
      {resume && resumeTitle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[t('hadith.continueReading'), resumeFrom ?? '', resumeTitle].filter(Boolean).join('. ')}
          onPress={() => navigation.push('HadithReader', { id: resume.id, list: resume.list })}
          style={({ pressed }) => [styles.resume, { backgroundColor: palette.accentBg }, pressed && styles.pressed]}
          testID="hadith-resume"
        >
          <Text style={[styles.label, { color: palette.accentSolid }]}>{t('hadith.continueReading')}</Text>
          <Text
            style={[
              styles.resumeTitle,
              resumeArabic && { writingDirection: 'rtl', textAlign: ownSideAlign(true, rtl) },
              { color: palette.text },
            ]}
            numberOfLines={2}
          >
            {resumeTitle}
          </Text>
          {resumeFrom ? (
            <Text style={[styles.small, tabularNumeralStyle, { color: palette.muted }]} numberOfLines={1}>
              {resumeFrom}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      {answered && !changing ? (
        <View style={styles.levelLine}>
          <Text style={[styles.label, styles.levelText, { color: palette.muted }]}>
            {t('hadith.levelLine', { level: t(`hadith.level.${level}`) })}
          </Text>
          <TextAction label={t('hadith.change')} color={palette.accentSolid} onPress={() => setChanging(true)} />
        </View>
      ) : (
        <View style={styles.levels}>
          <Text style={[styles.prompt, { color: palette.text }]}>{t('hadith.levelPrompt')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {LEVELS.map(lv => (
              <Chip
                key={lv}
                label={t(`hadith.level.${lv}`)}
                selected={answered && lv === level}
                suggested={!answered && lv === level}
                onPress={() => pick(lv)}
                testID={`hadith-level-${lv}`}
              />
            ))}
          </View>
          <Text style={[styles.small, { color: palette.muted }]}>{t('hadith.levelNote')}</Text>
        </View>
      )}

      {shelf.now.map(s => (
        <SetCard key={s.id} set={s} progress={progressOf(s)} onOpen={() => openSet(s)} />
      ))}

      <Group>
        <Row title={t('hadith.pickDirect')} subtitle={t('hadith.pickDirectNote')} onPress={onLookUp} testID="hadith-pick-direct" />
        {bookmarks.length ? (
          <Row
            title={t('hadith.bookmarks')}
            value={String(bookmarks.length)}
            onPress={() => navigation.push('HadithList', { list: 'bookmarks' })}
          />
        ) : null}
      </Group>

      {shelf.more.length ? (
        <View>
          <Fold title={t('hadith.allSets')} open={showAll} onToggle={() => setShowAll(v => !v)} testID="hadith-all-sets" />
          {showAll ? <SetRows sets={shelf.more} progressOf={progressOf} onOpen={openSet} showLevel /> : null}
        </View>
      ) : null}

      {shelf.done.length ? (
        <View>
          <Fold
            title={t('hadith.completed', { count: shelf.done.length })}
            open={showDone}
            onToggle={() => setShowDone(v => !v)}
            testID="hadith-completed"
          />
          {showDone ? <SetRows sets={shelf.done} progressOf={progressOf} onOpen={openSet} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** "12 of 25 read" once begun; before that, how long the set is. */
function useProgressLine() {
  const { t } = useTranslation();
  return (p: SetProgress): string | undefined =>
    p.total === 0
      ? undefined
      : p.read > 0
        ? t('hadith.progress', { read: p.read, total: p.total })
        : t('hadith.entries', { count: p.total });
}

function SetCard({ set, progress, onOpen }: { set: HadithSet; progress: SetProgress; onOpen: () => void }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const line = useProgressLine()(progress);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      testID={`hadith-set-${set.id}`}
      style={({ pressed }) => [
        styles.card,
        cardEdgeStyle(palette),
        { backgroundColor: palette.card },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.cardTitle, { color: palette.text }]}>{t(`hadith.set.${set.id}.title`)}</Text>
      <Text style={[styles.blurb, { color: palette.muted }]}>{t(`hadith.set.${set.id}.blurb`)}</Text>
      {/* A bar at nought is a demand; it appears with the first hadith read. */}
      {progress.read > 0 && progress.total > 0 ? <ProgressTrack progress={progress.read / progress.total} /> : null}
      {line ? <Text style={[styles.small, tabularNumeralStyle, { color: palette.muted }]}>{line}</Text> : null}
    </Pressable>
  );
}

/** The sets not on the page as cards: a row each. */
function SetRows({
  sets,
  progressOf,
  onOpen,
  showLevel,
}: {
  sets: readonly HadithSet[];
  progressOf: (s: HadithSet) => SetProgress;
  onOpen: (s: HadithSet) => void;
  showLevel?: boolean;
}) {
  const { t } = useTranslation();
  const line = useProgressLine();
  return (
    <Group>
      {sets.map(s => {
        const p = progressOf(s);
        const sub = [showLevel ? t(`hadith.level.${s.level}`) : '', (!p.done && line(p)) || ''].filter(Boolean).join(' · ');
        return <Row key={s.id} title={t(`hadith.set.${s.id}.title`)} subtitle={sub || undefined} onPress={() => onOpen(s)} />;
      })}
    </Group>
  );
}

// ── Look up ────────────────────────────────────────────────────────────

function Browse({ navigation }: { navigation: Nav }) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  // The books have no translation. Said on each row a reader of another
  // language might tap, before megabytes they cannot read come down.
  const arabicTag = (i18n.language || 'en').slice(0, 2) === 'ar' ? '' : t('hadith.arabicTag');
  const { palette } = useAppPalette();
  const tree = useCategoryTree();
  const statuses = usePackStatuses();
  const manifest = useManifest();
  const [showTree, setShowTree] = useState(false);

  return (
    <View style={styles.stack}>
      <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
        {t('hadith.topics')}
      </Text>
      <View style={styles.grid}>
        {HADITH_HUBS.map(hub => (
          <Pressable
            key={hub.id}
            accessibilityRole="button"
            onPress={() => navigation.push('HadithList', { list: `hub:${hub.id}` })}
            testID={`hadith-hub-${hub.id}`}
            style={({ pressed }) => [
              styles.topic,
              cardEdgeStyle(palette),
              { backgroundColor: palette.card },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.topicTitle, { color: palette.text }]} numberOfLines={2}>
              {t(`hadith.hub.${hub.id}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View>
        <Fold title={t('hadith.allTopics')} open={showTree} onToggle={() => setShowTree(v => !v)} testID="hadith-all-topics" />
        {showTree ? (
          <Group>
            {ROOT_TOPICS.map(id => (
              <Row
                key={id}
                title={tree?.title(id) ?? t(`hadith.topic.${id}`)}
                onPress={() => navigation.push('HadithList', { list: `cat:${id}` })}
              />
            ))}
          </Group>
        ) : null}
      </View>

      {/* The two Ṣaḥīḥs in translation, as near as there is: what HadeethEnc
          says both report. Before the books, which are Arabic only. */}
      {AGREED_OFFERED ? (
        <Group>
          <Row
            title={t('hadith.agreed.title')}
            subtitle={t('hadith.agreed.row')}
            onPress={() => navigation.push('HadithList', { list: AGREED_LIST })}
            testID="hadith-agreed"
          />
        </Group>
      ) : null}

      <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
        {t('hadith.books')}
      </Text>
      <Text style={[styles.blurb, { color: palette.muted }]}>{t('hadith.booksNote')}</Text>
      <Group>
        {BOOKS.map(book => {
          const s = statuses[bookKey(book)];
          const size = packsBytes(manifest, summarisePacks([bookKey(book)], statuses));
          const value =
            s?.state === 'ready'
              ? t('hadith.onDevice')
              : s?.state === 'downloading'
                ? `${Math.round(s.progress * 100)}%`
                : size
                  ? [arabicTag, inlineSize(size, rtl)].filter(Boolean).join(' · ')
                  : arabicTag || undefined;
          return (
            <Row
              key={book}
              title={t(`hadith.book.${book}`)}
              value={value}
              onPress={() => navigation.push('HadithList', { list: `book:${book}` })}
            />
          );
        })}
      </Group>

      <Text style={[styles.small, { color: palette.muted }]}>{t('hadith.attribution')}</Text>
    </View>
  );
}

// ── Search ─────────────────────────────────────────────────────────────

/** Where a search looks: everywhere, HadeethEnc's entries from the two Ṣaḥīḥs, or the books. */
type Scope = 'all' | 'sahihayn' | 'books';

function SearchResults({
  query,
  lang,
  navigation,
  whenEmpty,
}: {
  query: string;
  lang: string;
  navigation: Nav;
  /** Shown in place of "Nothing found." — the download, while the hadith themselves are not here. */
  whenEmpty?: ReactNode;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const layoutRtl = useLayoutRtl();
  const rec = useHadithRecord();
  const here = usePacksReadyKey();
  const statuses = usePackStatuses();
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  // A book is megabytes: the first search of one takes seconds, and a
  // blank page for seconds reads as "nothing found".
  const [busy, setBusy] = useState(true);

  /*
   * The filters. Three places to look, one topic and one grade: a topic
   * or a grade and "the books" cannot both hold (a book's hadith has
   * neither), so choosing one lets go of the other. The topics, and the
   * two grades, open under their chip and close on a choice — a row of
   * twelve would scroll sideways, and this app has no screen that does
   * (`DuasScreen`, #33).
   *
   * The grade is HadeethEnc's, sorted and not weighed (`grade.ts`): what
   * it grades with a reservation is under neither, and the line under the
   * chips says so while a grade is chosen.
   */
  const [scope, setScope] = useState<Scope>('all');
  const [topic, setTopic] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeClass | null>(null);
  const [picking, setPicking] = useState<'topic' | 'grade' | null>(null);
  // Not offered over a pack from before the entries said (`gradesKnown`).
  const [grades, setGrades] = useState(false);
  useEffect(() => {
    let live = true;
    gradesKnown(lang)
      .then(k => {
        if (live) setGrades(k);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lang, here]);
  const gradeKey = GRADE_CLASSES.find(g => g.q === grade)?.key;
  const anyBook = BOOKS.some(b => statuses[bookKey(b)]?.state === 'ready');
  const hubTopics = topic ? findHub(topic)?.topics.join(',') ?? '' : '';

  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      searchHadith(query, lang, {
        sahihayn: scope === 'sahihayn',
        grade: grade ?? undefined,
        booksOnly: scope === 'books',
        topics: hubTopics ? hubTopics.split(',') : undefined,
        isCancelled: () => !live,
        // HadeethEnc's are found first and shown while the books are read.
        onPartial: h => {
          if (live && h.length) setHits(h);
        },
      })
        .then(h => {
          if (!live) return;
          setHits(h);
          setBusy(false);
        })
        .catch(() => {
          if (live) setBusy(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, lang, here, scope, hubTopics, grade]);

  // "Bukhari 2345": the hadith it names, above whatever its words find.
  const names = useMemo(() => {
    const out: Record<string, string> = { [NAWAWI_REF]: t('hadith.set.nawawi40.title') };
    for (const b of BOOKS) out[b] = t(`hadith.book.${b}`);
    return out;
  }, [t]);
  const ref = useMemo(() => parseReference(query, names), [query, names]);
  const refKey = ref ? `${ref.book}:${ref.n}` : '';
  const [answer, setAnswer] = useState<ReferenceAnswer | null>(null);
  useEffect(() => {
    let live = true;
    if (!ref) setAnswer(null);
    else
      lookUpReference(ref, lang)
        .then(a => {
          if (live) setAnswer(a);
        })
        .catch(() => {
          if (live) setAnswer(null);
        });
    return () => {
      live = false;
    };
  }, [refKey, lang, here]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((id: string) => navigation.push('HadithReader', { id }), [navigation]);
  const anything = here.length > 0;
  const searchingLine = (
    <Text style={[styles.empty, { color: palette.muted }]} accessibilityLiveRegion="polite">
      {t('placeSearch.searching')}
    </Text>
  );

  const collection = answer
    ? answer.ref.book === NAWAWI_REF
      ? t('hadith.set.nawawi40.title')
      : t(`hadith.book.${answer.ref.book}`)
    : '';
  const reference = answer ? (
    <View testID="hadith-reference">
      <Text style={[styles.small, styles.scope, tabularNumeralStyle, { color: palette.muted }]}>
        {t('hadith.refHeading', { book: collection, n: answer.ref.n })}
      </Text>
      {answer.rows.map(r => (
        <HadithRow
          key={r.id}
          row={r}
          read={isRead(rec, r.id)}
          bookmarked={isBookmarked(rec, r.id)}
          layoutRtl={layoutRtl}
          onPress={id => navigation.push('HadithReader', { id, list: answer.list || undefined })}
        />
      ))}
      {answer.missing && answer.ref.book !== NAWAWI_REF ? (
        <View style={styles.inset}>
          <Group>
            <Row
              title={t(lang.slice(0, 2) === 'ar' ? 'hadith.refNeedsBook' : 'hadith.refNeedsBookArabic', { book: collection })}
              onPress={() => navigation.push('HadithList', { list: answer.list })}
              tone="accent"
            />
          </Group>
        </View>
      ) : !answer.rows.length && !answer.missing ? (
        <Text style={[styles.small, styles.scope, { color: palette.muted }]}>
          {/* In a graded book the number may be one that is left out, not one the edition lacks. */}
          {t(isGradedBook(answer.ref.book) ? 'hadith.refNotServed' : 'hadith.refNotFound', { book: collection, n: answer.ref.n })}
        </Text>
      ) : null}
    </View>
  ) : null;

  const filters = anything ? (
    <View style={styles.filters}>
      <View style={styles.filterRow} accessibilityRole="radiogroup">
        <Chip
          compact
          label={t('hadith.filter.all')}
          selected={scope === 'all' && !topic && !grade}
          onPress={() => {
            setScope('all');
            setTopic(null);
            setGrade(null);
            setPicking(null);
          }}
          testID="hadith-filter-all"
        />
        <Chip
          compact
          label={t('hadith.filter.sahihayn')}
          selected={scope === 'sahihayn'}
          onPress={() => setScope(scope === 'sahihayn' ? 'all' : 'sahihayn')}
          testID="hadith-filter-sahihayn"
        />
        {anyBook ? (
          <Chip
            compact
            label={t('hadith.filter.books')}
            selected={scope === 'books'}
            onPress={() => {
              setScope(scope === 'books' ? 'all' : 'books');
              setTopic(null);
              setGrade(null);
              setPicking(null);
            }}
            testID="hadith-filter-books"
          />
        ) : null}
        <Chip
          compact
          label={topic ? `${t(`hadith.hub.${topic}`)} ×` : t('hadith.filter.topic')}
          accessibilityLabel={topic ? t('hadith.filter.clearTopic', { topic: t(`hadith.hub.${topic}`) }) : t('hadith.filter.topic')}
          selected={!!topic}
          suggested={picking === 'topic' && !topic}
          onPress={() => (topic ? setTopic(null) : setPicking(v => (v === 'topic' ? null : 'topic')))}
          testID="hadith-filter-topic"
        />
        {grades ? (
          <Chip
            compact
            label={gradeKey ? `${t(`hadith.filter.${gradeKey}`)} ×` : t('hadith.filter.grade')}
            accessibilityLabel={
              gradeKey ? t('hadith.filter.clearGrade', { grade: t(`hadith.filter.${gradeKey}`) }) : t('hadith.filter.grade')
            }
            selected={!!grade}
            suggested={picking === 'grade' && !grade}
            onPress={() => (grade ? setGrade(null) : setPicking(v => (v === 'grade' ? null : 'grade')))}
            testID="hadith-filter-grade"
          />
        ) : null}
      </View>
      {picking === 'grade' && !grade ? (
        <View style={styles.filterRow}>
          {GRADE_CLASSES.map(g => (
            <Chip
              key={g.key}
              compact
              label={t(`hadith.filter.${g.key}`)}
              onPress={() => {
                setGrade(g.q);
                setPicking(null);
                if (scope === 'books') setScope('all');
              }}
              testID={`hadith-filter-grade-${g.key}`}
            />
          ))}
        </View>
      ) : null}
      {grade ? <Text style={[styles.small, { color: palette.muted }]}>{t('hadith.filter.gradeNote')}</Text> : null}
      {picking === 'topic' && !topic ? (
        <View style={styles.filterRow}>
          {HADITH_HUBS.map(h => (
            <Chip
              key={h.id}
              compact
              label={t(`hadith.hub.${h.id}`)}
              onPress={() => {
                setTopic(h.id);
                setPicking(null);
                if (scope === 'books') setScope('all');
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.results}>
      {filters}
      {reference}
      {hits?.length ? (
        <>
          <Text style={[styles.small, styles.scope, { color: palette.muted }]}>{t('hadith.searchScope')}</Text>
          {hits.map(h => (
            <HadithRow
              key={h.id}
              row={h}
              read={isRead(rec, h.id)}
              bookmarked={isBookmarked(rec, h.id)}
              layoutRtl={layoutRtl}
              onPress={open}
              sub={h.snippet}
              subLabel={h.inExplanation ? t('hadith.explanation') : h.book ? t(`hadith.book.${h.book}`) : undefined}
            />
          ))}
          {busy ? searchingLine : null}
        </>
      ) : busy && anything ? (
        searchingLine
      ) : answer && (answer.rows.length || answer.missing) ? null : whenEmpty ? (
        <View style={styles.inset} testID="hadith-search-needs-library">
          {whenEmpty}
        </View>
      ) : (
        <Text style={[styles.empty, { color: palette.muted }]}>
          {anything ? t('hadith.noResults') : t('hadith.searchNeedsDownload')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pinned: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: TYPE.body.fontSize, paddingVertical: SPACING.sm },
  searchClear: { padding: SPACING.xs },
  firstOpen: { flexGrow: 1, justifyContent: 'center' },
  // ▸ at the text's own size was a speck beside its heading on Android.
  foldMark: { fontSize: TYPE.title3.fontSize, lineHeight: 22 },
  page: { paddingHorizontal: SPACING.lg },
  stack: { gap: SPACING.md },
  levels: { gap: SPACING.sm },
  prompt: { fontSize: TYPE.headline.fontSize, fontWeight: '500' },
  levelLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  levelText: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  label: { fontSize: TYPE.footnote.fontSize },
  resume: { borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.xs },
  resumeTitle: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.sm },
  // The gate pads itself; the card gives it its title and its edge.
  gate: { padding: 0, gap: 0, marginBottom: SPACING.md },
  gateTitle: { flex: 0, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  cardTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '500' },
  blurb: { fontSize: TYPE.callout.fontSize, lineHeight: 21 },
  small: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  sectionTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '500', marginTop: SPACING.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  topic: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  topicTitle: { fontSize: TYPE.callout.fontSize, fontWeight: '500' },
  // Rows run edge to edge and pad themselves; the page's own padding is taken back.
  results: { gap: 0, marginHorizontal: -SPACING.lg },
  filters: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.xs },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  inset: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs },
  scope: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xs },
  empty: { padding: SPACING.xl, textAlign: 'center', fontSize: TYPE.callout.fontSize },
  pressed: { opacity: 0.6 },
});
