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
 * The text is Arabic and is laid out right to left whatever the app's
 * language. Nothing here is searched, graded or shown anywhere else
 * (`libraryShelf.ts`).
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Group, Row, TextSizeStepper } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useReadingText } from '../../hooks/useReadingText';
import { ownSideAlign } from '../../i18n/foreignText';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { useLayoutRtl } from '../../i18n/useLayoutRtl';
import { findLibraryBook, libraryKey, libraryPlace, setLibraryPlace } from '../../hadith/libraryShelf';
import { loadPack, usePackStatuses } from '../../hadith/packs';
import type { LibraryBlock, LibraryFile } from '../../hadith/packTypes';
import { summarisePacks } from '../../hadith/useHadith';
import type { RootStackParamList } from '../../navigation/types';
import { SPACING } from '../../theme/tokens';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { Column } from './Column';
import { HadithPage } from './HadithPage';
import { PackGate } from './PackGate';

/** The size a book's Arabic is set at before the reader's own − A +: larger than Latin body text, with room for its marks. */
const ARABIC_READING = { fontSize: 20, lineHeight: 38 };

/** A block's kind, for its row. */
export function blockKind(b: LibraryBlock): 'p' | 'h' | 'v' {
  return typeof b === 'string' ? 'p' : 'h' in b ? 'h' : 'v';
}

export function LibraryBookScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id, chapter } = useRoute<RouteProp<RootStackParamList, 'LibraryBook'>>().params;
  const layoutRtl = useLayoutRtl();
  const readingText = useReadingText();
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
  // Reading a chapter is being at it.
  useEffect(() => {
    if (chapter != null && file && file.chapters[chapter]) void setLibraryPlace(id, chapter);
  }, [id, chapter, file]);

  // Arabic, against its own leading edge in either layout.
  const arabic = { textAlign: ownSideAlign(true, layoutRtl), writingDirection: 'rtl' as const };
  const open = useCallback((n: number) => navigation.push('LibraryBook', { id, chapter: n }), [navigation, id]);

  const arabicReader = isRtlLanguage(i18n.language);
  const title = file?.title ?? known?.title ?? t('hadith.library.tab');
  const current = chapter != null ? file?.chapters[chapter] : undefined;

  if (chapter != null) {
    const last = file ? file.chapters.length - 1 : 0;
    const block = ({ item }: { item: LibraryBlock }) => {
      const kind = blockKind(item);
      if (kind === 'h') {
        return (
          <Text style={[styles.heading, arabic, { color: palette.text }]} accessibilityRole="header" accessibilityLanguage="ar">
            {(item as { h: string }).h}
          </Text>
        );
      }
      if (kind === 'v') {
        return (
          <View style={styles.verse}>
            {(item as { v: string[] }).v.map((line, i) => (
              <Text key={i} style={[styles.verseLine, readingText.style(ARABIC_READING), { color: palette.text }]} selectable accessibilityLanguage="ar">
                {line}
              </Text>
            ))}
          </View>
        );
      }
      return (
        <Text style={[styles.para, readingText.style(ARABIC_READING), arabic, { color: palette.text }]} selectable accessibilityLanguage="ar">
          {item as string}
        </Text>
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
            <Column style={styles.flex}>
              <FlatList
                data={current?.b ?? []}
                keyExtractor={(_, i) => String(i)}
                renderItem={block}
                onScroll={onScroll}
                scrollEventThrottle={16}
                initialNumToRender={12}
                windowSize={9}
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
          <Column style={styles.flex}>
            <FlatList
              data={file ? [0] : []}
              keyExtractor={String}
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentContainerStyle={[styles.book, { paddingBottom: bottom + SPACING.xl }]}
              testID="library-book"
              renderItem={() =>
                file ? (
                  <View style={styles.bookBody}>
                    {/* One script a line: the author as the book names him for a reader of
                        Arabic script, in Latin letters otherwise ("d. 398 هـ" set both ways at once). */}
                    {arabicReader || !known ? (
                      <Text style={[styles.by, arabic, { color: palette.text }]} accessibilityLanguage="ar" testID="library-by">
                        {t('hadith.library.by', { author: file.author, died: file.died })}
                      </Text>
                    ) : (
                      <Text style={[styles.byLatin, { color: palette.text }]} testID="library-by">
                        {t('hadith.library.by', { author: known.authorLatin, died: known.died })}
                      </Text>
                    )}
                    <Text style={[styles.note, { color: palette.muted }]} testID="library-note">
                      {t('hadith.library.bookNote')}
                    </Text>
                    {place != null && file.chapters[place] ? (
                      <Group>
                        <Row
                          title={t('hadith.library.continue', { chapter: file.chapters[place].t })}
                          onPress={() => open(place)}
                          testID="library-continue"
                        />
                      </Group>
                    ) : null}
                    <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
                      {t('hadith.library.chapters')}
                    </Text>
                    <Group>
                      {file.chapters.map((c, i) => (
                        <Row key={i} title={c.t} onPress={() => open(i)} testID={`library-chapter-${i}`} />
                      ))}
                    </Group>
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
  by: { ...arabicTextStyle('body'), fontSize: TYPE.title3.fontSize, lineHeight: 34 },
  byLatin: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  sectionTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '600' },
  text: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  para: { ...arabicTextStyle('body'), marginBottom: SPACING.lg },
  heading: { ...arabicTextStyle('body'), fontSize: TYPE.title3.fontSize, lineHeight: 36, fontWeight: '600', marginTop: SPACING.md, marginBottom: SPACING.md },
  verse: { marginBottom: SPACING.lg, alignItems: 'center', gap: SPACING.xs },
  verseLine: { ...arabicTextStyle('body'), textAlign: 'center', writingDirection: 'rtl' },
  turn: { marginTop: SPACING.xl, gap: SPACING.md },
  link: { alignItems: 'center', paddingVertical: SPACING.sm },
  linkText: { fontSize: TYPE.body.fontSize },
  pressed: { opacity: 0.6 },
});
