/**
 * An ayah's transliteration, as it is set wherever it is shown: under the
 * Arabic, slanted and muted like a du'a's (DuasScreen), at the reader's
 * text size, and left to right in its own direction whatever the app's.
 */
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useReadingText } from '../hooks/useReadingText';
import { foreignText } from '../i18n/foreignText';
import { READING_BASE } from '../theme/readingText';
import { TYPE } from '../theme/typography';

export function TransliterationLine({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const { i18n } = useTranslation();
  const { palette } = useAppPalette();
  const readingText = useReadingText();
  if (!text) return null;
  // Latin letters in every language the app speaks: under Arabic or Urdu
  // the paragraph keeps its own side and its own punctuation.
  const latin = foreignText('en', i18n.language);
  return (
    <Text
      accessibilityLabel={text}
      style={[
        styles.line,
        readingText.style(READING_BASE),
        latin.style,
        { color: palette.muted },
        style,
      ]}>
      {latin.open}
      {text}
      {latin.close}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: TYPE.callout.fontSize, lineHeight: 22, fontStyle: 'italic' },
});
