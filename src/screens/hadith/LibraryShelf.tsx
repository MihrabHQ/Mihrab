/**
 * The Hadith tab's third page: the Library's books, to open or download.
 *
 * Each row is a book by its own Arabic title, with its name and its
 * author's in Latin letters under it for a reader who does not yet read
 * Arabic titles, and what it weighs while it is not on the device. Which
 * books are listed is `offeredLibraryBooks`: the ones our copy carries.
 * The line above them says what a book here is and is not (the policy's
 * "The Library").
 *
 * A book that has been read in says how far (by its chapters), and the
 * one read last is offered above the rest, to go on from the paragraph it
 * was left at.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Group, Row } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { lastReadBook, libraryKey, libraryProgress, libraryReadings, offeredLibraryBooks, type LibraryReading } from '../../hadith/libraryShelf';
import { manifestBytes, usePackStatuses } from '../../hadith/packs';
import type { RootStackParamList } from '../../navigation/types';
import { formatBytes } from '../../quran/downloadsUi';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { useManifest } from './PackGate';

export function LibraryShelf({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const manifest = useManifest();
  const statuses = usePackStatuses();
  const books = offeredLibraryBooks(manifest, key => statuses[key]?.state === 'ready');
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
  const here = books.filter(b => statuses[libraryKey(b.id)]?.state === 'ready');
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
        <Group>
          {books.map(b => {
            const key = libraryKey(b.id);
            const onDevice = statuses[key]?.state === 'ready';
            const bytes = onDevice ? null : manifestBytes(manifest, key);
            const at = onDevice ? readings[b.id] : undefined;
            // A book only just opened says nothing: "0%" reads as a fault.
            const percent = at ? Math.round(libraryProgress(at) * 100) : 0;
            return (
              <Row
                key={b.id}
                title={b.title}
                subtitle={`${b.latin} · ${b.authorLatin}`}
                value={bytes != null ? formatBytes(bytes) : percent >= 1 ? t('hadith.library.percent', { percent }) : undefined}
                onPress={() => navigation.push('LibraryBook', { id: b.id })}
                testID={`hadith-library-${b.id}`}
              />
            );
          })}
        </Group>
      ) : (
        <Text style={[styles.empty, { color: palette.text }]} testID="hadith-library-empty">
          {t('hadith.library.empty')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACING.lg, paddingTop: SPACING.md },
  intro: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
  empty: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
});
