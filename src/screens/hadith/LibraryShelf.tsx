/**
 * The Hadith tab's third page: the Library's books, to open or download.
 *
 * Each row is a book by its own Arabic title, with its name and its
 * author's in Latin letters under it for a reader who does not yet read
 * Arabic titles, and what it weighs while it is not on the device. Which
 * books are listed is `offeredLibraryBooks`: the ones our copy carries.
 * They stand by subject (`libraryShelves`), and a book says beside its
 * author what a reader should know before opening it: the school a book
 * of fiqh is written in, that it is a commentary, that it is for later.
 * The line above them says what a book here is and is not (the policy's
 * "The Library").
 *
 * A book that has been read in says how far (by its chapters), and the
 * one read last is offered above the rest, to go on from the paragraph it
 * was left at.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { Group, Row } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettingsOrDefaults } from '../../context/PrayerSettingsContext';
import {
  LIBRARY_LANGUAGE_NAMES,
  deviceLanguage,
  libraryAllBookmarks,
  libraryBookLanguageChip,
  libraryMatches,
  libraryReport,
  recentlyRead,
  type LibraryBook,
  type LibraryBookmark,
  libraryBookTags,
  libraryOtherLanguages,
  libraryOwnLanguages,
  libraryKey,
  libraryProgress,
  libraryReadings,
  libraryShelves,
  offeredLibraryBooks,
  type LibraryReading,
} from '../../hadith/libraryShelf';
import { downloadPack, loadPack, manifestBytes, manifestEntry, usePackStatuses } from '../../hadith/packs';
import type { LibraryFile } from '../../hadith/packTypes';
import { hadithReportIssueUrl, hadithReportMailUrl } from '../../hadith/report';
import { getInstalledAppVersionLabel } from '../../appVersion';
import { checkLibraryPdf, downloadLibraryPdf, useLibraryPdfStatuses, validLibraryPdf } from '../../hadith/libraryPdf';
import type { RootStackParamList } from '../../navigation/types';
import { TextAction, formatBytes } from '../../quran/downloadsUi';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { useManifest } from './PackGate';

export function LibraryShelf({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const { t, i18n } = useTranslation();
  // One script a line, as on the book's own page: a reader of Arabic
  // script is given the author as the book names him, not the title
  // over again in Latin letters.
  const arabicReader = isRtlLanguage(i18n.language);
  const { palette } = useAppPalette();
  const manifest = useManifest();
  const statuses = usePackStatuses();
  // Whose books: Arabic for everyone; then the languages this reader has without asking (the Hadith tab's,
  // the app's, the phone's), and the ones switched on below.
  const { settings, updateSettings } = usePrayerSettingsOrDefaults();
  const own = libraryOwnLanguages(i18n.language, settings.language, deviceLanguage());
  const chosen = settings.libraryLanguages ?? [];
  const others = libraryOtherLanguages(own);
  const books = offeredLibraryBooks(manifest, key => statuses[key]?.state === 'ready', [...own, ...chosen]);
  const toggleLanguage = (lang: string) =>
    updateSettings({ libraryLanguages: chosen.includes(lang) ? chosen.filter(l => l !== lang) : [...chosen, lang] });
  // Read again on coming back from a book: the place has moved.
  const [readings, setReadings] = useState<Record<string, LibraryReading>>({});
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void libraryReadings().then(r => {
        if (live) setReadings(r);
      });
      return () => {
        live = false;
      };
    }, []),
  );
  // A book that is a file is on the device when its file is: asked once the manifest says what the file is.
  const files = useLibraryPdfStatuses();
  useEffect(() => {
    for (const b of books) {
      const pdf = b.format === 'pdf' ? manifestEntry(manifest, libraryKey(b.id))?.pdf : undefined;
      if (validLibraryPdf(pdf)) void checkLibraryPdf(b.id, pdf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by which books, not by the array made each time
  }, [manifest, books.map(b => b.id).join(',')]);
  const held = (b: (typeof books)[number]) => statuses[libraryKey(b.id)]?.state === 'ready' && (b.format !== 'pdf' || files[b.id]?.state === 'ready');
  const here = books.filter(held);
  // The books to go on with: the last few read, not one.
  const recent = recentlyRead(readings, here.map(b => b.id)).map(id => here.find(b => b.id === id)!);

  // ── Finding a book: what is typed, what is on the device, a school ──
  const [query, setQuery] = useState('');
  const [onlyHere, setOnlyHere] = useState(false);
  const [school, setSchool] = useState<LibraryBook['madhhab'] | null>(null);
  const schools = (['hanafi', 'maliki', 'shafii', 'hanbali'] as const).filter(m => books.some(b => b.madhhab === m));
  const looking = query.trim() !== '' || onlyHere || school != null;
  const shown = books.filter(
    b =>
      (!onlyHere || held(b)) &&
      (school == null || b.madhhab === school) &&
      // A book is found by its subject's name too, and its school's, in the reader's language.
      libraryMatches(b, query, [t(`hadith.library.subject.${b.subject}`), ...libraryBookTags(b).map(k => t(k))]),
  );

  // ── Every bookmark, of every book: the newest few, each named by where it is ──
  const [marks, setMarks] = useState<(LibraryBookmark & { book: string })[]>([]);
  const [chapters, setChapters] = useState<Record<string, string[]>>({});
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void libraryAllBookmarks().then(all => {
        if (live) setMarks(all.slice(0, MARKS_SHOWN));
      });
      return () => {
        live = false;
      };
    }, []),
  );
  const marked = useMemo(() => marks.filter(m => here.some(b => b.id === m.book)), [marks, here]);
  useEffect(() => {
    // A text book's mark is named by its chapter, which is in the book.
    let live = true;
    for (const id of new Set(marked.map(m => m.book))) {
      const book = here.find(b => b.id === id);
      if (!book || book.format === 'pdf' || chapters[id]) continue;
      void loadPack<LibraryFile>(libraryKey(id)).then(f => {
        if (live && f) setChapters(was => ({ ...was, [id]: f.chapters.map(c => c.t) }));
      });
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by which books have marks
  }, [marked.map(m => m.book).join(',')]);

  // ── A whole shelf at once ──
  const weight = (b: LibraryBook) => {
    const key = libraryKey(b.id);
    const pdf = b.format === 'pdf' ? manifestEntry(manifest, key)?.pdf : undefined;
    return validLibraryPdf(pdf) ? pdf.bytes : manifestBytes(manifest, key) ?? 0;
  };
  const [fetching, setFetching] = useState<string | null>(null);
  const fetchShelf = async (subject: string, shelf: readonly LibraryBook[]) => {
    if (fetching) return;
    setFetching(subject);
    try {
      // One after another: a phone's connection is one connection, and a book that fails does not stop the rest.
      for (const b of shelf) {
        if (held(b)) continue;
        const key = libraryKey(b.id);
        if (statuses[key]?.state !== 'ready' && !(await downloadPack(key))) continue;
        const pdf = b.format === 'pdf' ? manifestEntry(manifest, key)?.pdf : undefined;
        if (validLibraryPdf(pdf)) await downloadLibraryPdf(b.id, pdf);
      }
    } finally {
      setFetching(null);
    }
  };

  // ── A word to the project: sent by the reader, from their own mail, or not at all ──
  const write = (kind: 'mistake' | 'ask') => {
    const r = libraryReport(kind, t(kind === 'mistake' ? 'hadith.library.report' : 'hadith.library.ask'), `${getInstalledAppVersionLabel()}, ${Platform.OS}`);
    void Linking.openURL(hadithReportMailUrl(r)).catch(() => Linking.openURL(hadithReportIssueUrl(r)).catch(() => undefined));
  };

  return (
    <View style={styles.page} testID="hadith-library">
      <Text style={[styles.intro, { color: palette.muted }]}>{t('hadith.library.intro')}</Text>
      {books.length ? (
        <View style={styles.find}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('hadith.library.searchShelf')}
            placeholderTextColor={palette.muted}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[styles.search, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
            testID="hadith-library-search"
          />
          <View style={styles.chips}>
            <Chip label={t('hadith.onDevice')} on={onlyHere} onPress={() => setOnlyHere(v => !v)} testID="hadith-library-filter-here" />
            {schools.map(m => (
              <Chip key={m} label={t(`settings.madhab_${m}`)} on={school === m} onPress={() => setSchool(was => (was === m ? null : m))} testID={`hadith-library-filter-${m}`} />
            ))}
          </View>
        </View>
      ) : null}
      {recent.length && !looking ? (
        <Group>
          {recent.map((b, i) => (
            <Row
              key={b.id}
              title={i === 0 ? t('hadith.library.continue', { chapter: b.title }) : b.title}
              subtitle={readings[b.id].t}
              onPress={() => navigation.push('LibraryBook', { id: b.id, chapter: readings[b.id].c })}
              testID={i === 0 ? 'hadith-library-continue' : `hadith-library-recent-${b.id}`}
            />
          ))}
        </Group>
      ) : null}
      {marked.length && !looking ? (
        <View style={styles.level} testID="hadith-library-marks">
          <Text style={[styles.levelTitle, { color: palette.text }]} accessibilityRole="header">
            {t('hadith.library.marks')}
          </Text>
          <Group>
            {marked.map(m => {
              const book = here.find(b => b.id === m.book)!;
              const where = book.format === 'pdf' ? t('quran.pageLabel', { page: m.b + 1 }) : chapters[m.book]?.[m.c] ?? '';
              return (
                <Row
                  key={`${m.book}:${m.c}:${m.b}`}
                  title={book.title}
                  // Where it is, and the reader's own words on it, where they wrote some.
                  subtitle={[where, m.n].filter(Boolean).join(' · ') || undefined}
                  onPress={() => navigation.push('LibraryBook', { id: m.book, chapter: m.c, block: m.b })}
                  testID={`hadith-library-mark-${m.book}-${m.c}-${m.b}`}
                />
              );
            })}
          </Group>
        </View>
      ) : null}
      {books.length && !shown.length ? (
        <Text style={[styles.empty, { color: palette.muted }]} testID="hadith-library-none">
          {t('hadith.noResults')}
        </Text>
      ) : null}
      {books.length ? (
        libraryShelves(shown).map(({ subject, books: shelf }) => {
          const missing = shelf.filter(b => !held(b));
          // Where a reader begins: the first book of a shelf nothing has been opened on.
          const begin = !looking && shelf.length > 1 && !shelf.some(b => readings[b.id]) ? shelf[0].id : null;
          return (
            <View key={subject} style={styles.level} testID={`hadith-library-shelf-${subject}`}>
              <View style={styles.shelfHead}>
                <Text style={[styles.levelTitle, styles.shelfName, { color: palette.text }]} accessibilityRole="header">
                  {t(`hadith.library.subject.${subject}`)}
                </Text>
                {missing.length > 1 ? (
                  <TextAction
                    label={fetching === subject ? t('hadith.downloading') : t('hadith.downloadSize', { size: formatBytes(missing.reduce((n, b) => n + weight(b), 0)) })}
                    color={fetching && fetching !== subject ? palette.mutedSolid : palette.accentSolid}
                    onPress={() => void fetchShelf(subject, shelf)}
                  />
                ) : null}
              </View>
              <Group>
                {shelf.map(b => {
                  const key = libraryKey(b.id);
                  const onDevice = held(b);
                  // A file's weight is the file's: its pack is a few lines.
                  const pdf = b.format === 'pdf' ? manifestEntry(manifest, key)?.pdf : undefined;
                  const bytes = onDevice ? null : validLibraryPdf(pdf) ? pdf.bytes : manifestBytes(manifest, key);
                  const at = onDevice ? readings[b.id] : undefined;
                  // A book only just opened says nothing: "0%" reads as a fault.
                  const percent = at ? Math.round(libraryProgress(at) * 100) : 0;
                  // "PDF" is said beside the author: its pages are as printed, and the text size does not reach them.
                  const tags = [...(b.id === begin ? [t('hadith.library.startHere')] : []), ...libraryBookTags(b).map(k => t(k)), ...(b.format === 'pdf' ? ['PDF'] : [])];
                  const coming = statuses[key]?.state === 'downloading' || files[b.id]?.state === 'downloading';
                  // A book in the reader's own language is named as it names itself.
                  const by = arabicReader || b.lang !== 'ar' ? b.author : `${b.latin} · ${b.authorLatin}`;
                  return (
                    <Row
                      key={b.id}
                      title={b.title}
                      chip={libraryBookLanguageChip(b, own) ?? undefined}
                      // On the author's line, not one of their own: a row shows three lines, and what the book is must keep two.
                      subtitle={`${[by, ...tags].join(' · ')}\n${b.about ?? t(`hadith.library.about.${b.id}`)}`}
                      value={coming ? t('hadith.downloading') : bytes != null ? formatBytes(bytes) : percent >= 1 ? t('hadith.library.percent', { percent }) : undefined}
                      onPress={() => navigation.push('LibraryBook', { id: b.id })}
                      testID={`hadith-library-${b.id}`}
                    />
                  );
                })}
              </Group>
            </View>
          );
        })
      ) : (
        <Text style={[styles.empty, { color: palette.text }]} testID="hadith-library-empty">
          {t('hadith.library.empty')}
        </Text>
      )}
      {books.length ? (
        <Group>
          <Row title={t('hadith.library.report')} tone="accent" onPress={() => write('mistake')} testID="hadith-library-report" />
          <Row title={t('hadith.library.ask')} tone="accent" onPress={() => write('ask')} testID="hadith-library-ask" />
        </Group>
      ) : null}
      {others.length ? (
        <View style={styles.level} testID="hadith-library-languages">
          <Text style={[styles.levelTitle, { color: palette.text }]} accessibilityRole="header">
            {t('hadith.library.otherLanguages')}
          </Text>
          <Text style={[styles.intro, { color: palette.muted }]}>{t('hadith.library.otherLanguagesHelp')}</Text>
          <Group>
            {others.map(lang => (
              <Row
                key={lang}
                title={LIBRARY_LANGUAGE_NAMES[lang] ?? lang}
                value={chosen.includes(lang) ? '✓' : undefined}
                onPress={() => toggleLanguage(lang)}
                testID={`hadith-library-language-${lang}`}
              />
            ))}
          </Group>
        </View>
      ) : null}
    </View>
  );
}

/** How many bookmarks the shelf lists: the newest; the rest are in their books. */
const MARKS_SHOWN = 5;

/** A choice that narrows the shelf: outlined, filled when it is on. */
function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={6}
      style={[styles.chip, { borderColor: on ? palette.accentSolid : palette.border, backgroundColor: on ? palette.controlBg : 'transparent' }]}
      testID={testID}
    >
      <Text style={[styles.chipText, { color: on ? palette.accentSolid : palette.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  find: { gap: SPACING.sm },
  search: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: TYPE.body.fontSize },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  chipText: { fontSize: TYPE.footnote.fontSize },
  shelfHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  shelfName: { flex: 1 },
  page: { gap: SPACING.lg, paddingTop: SPACING.md },
  intro: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  level: { gap: SPACING.sm },
  levelTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '600' },
  empty: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
});
