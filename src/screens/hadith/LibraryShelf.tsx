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
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  lastReadBook,
  libraryBookLanguageChip,
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
import { manifestBytes, manifestEntry, usePackStatuses } from '../../hadith/packs';
import { checkLibraryPdf, useLibraryPdfStatuses, validLibraryPdf } from '../../hadith/libraryPdf';
import type { RootStackParamList } from '../../navigation/types';
import { formatBytes } from '../../quran/downloadsUi';
import { SPACING } from '../../theme/tokens';
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
  const lastId = lastReadBook(readings, here.map(b => b.id));
  const last = here.find(b => b.id === lastId);

  return (
    <View style={styles.page} testID="hadith-library">
      <Text style={[styles.intro, { color: palette.muted }]}>{t('hadith.library.intro')}</Text>
      {last ? (
        <Group>
          <Row
            title={t('hadith.library.continue', { chapter: last.title })}
            subtitle={readings[last.id].t}
            onPress={() => navigation.push('LibraryBook', { id: last.id, chapter: readings[last.id].c })}
            testID="hadith-library-continue"
          />
        </Group>
      ) : null}
      {books.length ? (
        libraryShelves(books).map(({ subject, books: shelf }) => {
          return (
            <View key={subject} style={styles.level} testID={`hadith-library-shelf-${subject}`}>
              <Text style={[styles.levelTitle, { color: palette.text }]} accessibilityRole="header">
                {t(`hadith.library.subject.${subject}`)}
              </Text>
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
                  const tags = [...libraryBookTags(b).map(k => t(k)), ...(b.format === 'pdf' ? ['PDF'] : [])];
                  // A book in the reader's own language is named as it names itself.
                  const by = arabicReader || b.lang !== 'ar' ? b.author : `${b.latin} · ${b.authorLatin}`;
                  return (
                    <Row
                      key={b.id}
                      title={b.title}
                      chip={libraryBookLanguageChip(b, own) ?? undefined}
                      // On the author's line, not one of their own: a row shows three lines, and what the book is must keep two.
                      subtitle={`${[by, ...tags].join(' · ')}\n${b.about ?? t(`hadith.library.about.${b.id}`)}`}
                      value={bytes != null ? formatBytes(bytes) : percent >= 1 ? t('hadith.library.percent', { percent }) : undefined}
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

const styles = StyleSheet.create({
  page: { gap: SPACING.lg, paddingTop: SPACING.md },
  intro: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  level: { gap: SPACING.sm },
  levelTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '600' },
  empty: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
});
