/**
 * The Hadith tab's third page: the Library's books, to open or download.
 *
 * Each row is a book by its own Arabic title, with its name and its
 * author's in Latin letters under it for a reader who does not yet read
 * Arabic titles, and what it weighs while it is not on the device. Which
 * books are listed is `offeredLibraryBooks`: the ones our copy carries.
 * The line above them says what a book here is and is not (the policy's
 * "The Library").
 */
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Group, Row } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { libraryKey, offeredLibraryBooks } from '../../hadith/libraryShelf';
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

  return (
    <View style={styles.page} testID="hadith-library">
      <Text style={[styles.intro, { color: palette.muted }]}>{t('hadith.library.intro')}</Text>
      {books.length ? (
        <Group>
          {books.map(b => {
            const key = libraryKey(b.id);
            const here = statuses[key]?.state === 'ready';
            const bytes = here ? null : manifestBytes(manifest, key);
            return (
              <Row
                key={b.id}
                title={b.title}
                subtitle={`${b.latin} · ${b.authorLatin}`}
                value={bytes != null ? formatBytes(bytes) : undefined}
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
