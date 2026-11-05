/**
 * The edition chips in the ayah sheet — translation and tafsir alike.
 *
 * ── TWO ROWS, NOT ONE ──────────────────────────────────────────────────
 *
 * One row of chips served while there were fourteen translations and six
 * tafsirs: a chip per edition, labelled with its language, wrapping as it
 * had to. With twenty-nine translations in thirteen languages and
 * twenty-five tafsirs (2026-11) that row was a wall, and four chips all reading
 * "English" said nothing about which English. So the choice is made in
 * two steps that each fit a line or two: a LANGUAGE, then — only where the
 * language has more than one — an EDITION within it.
 *
 * The language row leads with the app's own language and then English,
 * the fallback every reader can use, and keeps the registry's order for
 * the rest. The edition row keeps the registry's order, which is the order
 * the defaults are chosen in. Tapping a language whose edition is not the
 * current one opens that language's first edition; tapping the current
 * language does nothing.
 *
 * Chip labels are the editions' own names, words held together
 * (`tafsirChipLabel`): Android has cut an Arabic name to its first word
 * at an ordinary space.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { tafsirChipLabel } from '../tafsir';

export type PickableEdition = {
  id: string;
  label: string;
  language: string;
  locale: string;
  rtl?: boolean;
};

/** The language row's order: the app's language, English, then the rest as listed. */
export function pickerLanguages(
  editions: ReadonlyArray<PickableEdition>,
  appLocale: string,
): string[] {
  const seen: string[] = [];
  for (const e of editions) if (!seen.includes(e.language)) seen.push(e.language);
  const own = editions.find(e => e.locale === appLocale)?.language;
  const english = editions.find(e => e.locale === 'en')?.language;
  const first = [own, english].filter((l): l is string => !!l);
  return [...new Set([...first, ...seen])];
}

export function EditionPicker({
  editions,
  selectedId,
  onSelect,
  appLocale,
  kind,
}: {
  editions: ReadonlyArray<PickableEdition>;
  selectedId: string;
  onSelect: (edition: PickableEdition) => void;
  appLocale: string;
  /** Only for the accessibility labels and test ids. */
  kind: 'translation' | 'tafsir';
}) {
  const { palette } = useAppPalette();
  const selected = editions.find(e => e.id === selectedId) ?? editions[0];
  if (!selected) return null;
  const languages = pickerLanguages(editions, appLocale);
  const within = editions.filter(e => e.language === selected.language);

  const chip = (
    key: string,
    label: string,
    on: boolean,
    a11y: string,
    onPress: () => void,
    rtl?: boolean,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={a11y}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: on ? palette.accentBg : 'transparent',
          borderColor: on ? palette.accentSolid : palette.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          rtl && styles.chipLabelRtl,
          { color: on ? palette.accentSolid : palette.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.rows} testID={`${kind}-picker`}>
      <View style={styles.chips} testID={`${kind}-picker-languages`}>
        {languages.map(language =>
          chip(
            `lang-${language}`,
            language,
            language === selected.language,
            language,
            () => {
              if (language === selected.language) return;
              const first = editions.find(e => e.language === language);
              if (first) onSelect(first);
            },
          ),
        )}
      </View>
      {within.length > 1 ? (
        <View style={styles.chips} testID={`${kind}-picker-editions`}>
          {within.map(ed =>
            chip(
              ed.id,
              tafsirChipLabel(ed.label),
              ed.id === selected.id,
              `${ed.language} — ${ed.label}`,
              () => onSelect(ed),
              ed.rtl,
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A wider gap between the two rows than within them, so the editions
  // read as a row of their own and not as more languages.
  rows: { gap: SPACING.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    // A chip wraps to the next line; it never gets squeezed. Yoga fits a
    // wrapping row by SHRINKING its items, and the text inside a shrunken
    // chip is truncated to whatever survives — an edition losing its name
    // on the one control whose job is to say which edition you are reading.
    flexShrink: 0,
  },
  chipLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '400',
    flexShrink: 0,
  },
  // An Arabic-script name is drawn with its own face; at weight 600 Android
  // drew only its first word inside a chip sized for the whole. Plain
  // weight, centred, and a stated direction, so the measured box and the
  // drawn text agree.
  chipLabelRtl: {
    fontWeight: '400',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
