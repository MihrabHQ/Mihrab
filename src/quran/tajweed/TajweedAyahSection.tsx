/**
 * The āyah sheet's "Tajweed" section: the āyah with its letters tinted —
 * only when the muṣḥaf's colours are off, since otherwise the sheet's
 * āyah above is already tinted — then one row per rule it contains — the colour, the name, what to do,
 * and the words it happens in. Tapping a word reads it out (the word
 * reader's own voice), which is the point: see the colour, hear the rule.
 *
 * Shown when the sheet's Tajweed tab is open — the sheet decides, and
 * keeps the reader's choice (`ayahSheetPanel`).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { SPACING } from '../../theme/tokens';
import { useReadingText } from '../../hooks/useReadingText';
import { hold, release } from '../audio/wordReader';
import { setQuranPrefs, useQuranState } from '../quranState';
import { riwayahById, riwayahFontFamily } from '../riwayat';
import { riwayahAyahText } from '../riwayahData';
import { loadTajweedAyah, type TajweedAyah } from './tajweedData';
import {
  loadWarshSurah,
  shapedRuns,
  warshAyahWords,
  type WarshTajweedWord,
} from './warshTajweed';
import { tajweedInk, type TajweedRule } from './rules';
import { TajweedSwatch } from './TajweedText';
import { ayahGlyphWords, TajweedAyahGlyphs, TajweedWordGlyph } from './TajweedAyahGlyphs';

/** The page font's size in the section's āyah and its chips, dp. */
const AYAH_FONT_SIZE = 30;
const CHIP_FONT_SIZE = 24;

/** Read one word aloud, as a held-and-released word in the muṣḥaf is. */
export function speakWord(surah: number, ayah: number, position: number): void {
  hold({ text: '', surah, ayah, position, isEnd: false, advance: 0 });
  void release();
}

export function TajweedAyahSection({
  surah,
  ayah,
  onClose,
}: {
  surah: number;
  ayah: number;
  /** Closes the sheet — before leaving for the guide. */
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const readingText = useReadingText();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { prefs } = useQuranState();
  const open = true;
  const [data, setData] = useState<TajweedAyah | null | undefined>(undefined);

  useEffect(() => {
    if (!open || prefs.riwayah === 'warsh') return;
    let alive = true;
    setData(undefined);
    void loadTajweedAyah(surah, ayah).then(res => {
      if (alive) setData(res);
    });
    return () => {
      alive = false;
    };
  }, [open, surah, ayah, prefs.riwayah]);

  const coloursOn = prefs.tajweedColours;
  const hafs = riwayahById(prefs.riwayah).render !== 'unicode';
  const warsh = prefs.riwayah === 'warsh';
  // The page's own words, for the chips — by position, as the rules count.
  const glyphs = useMemo(() => (open ? ayahGlyphWords(surah, ayah) : []), [open, surah, ayah]);
  const glyphAt = (position: number) => glyphs.find(g => g.position === position && !g.isEnd);

  return (
    <>
      {open && warsh ? (
        <WarshTajweedBody
          surah={surah}
          ayah={ayah}
          onClose={onClose}
          coloursOn={coloursOn}
        />
      ) : null}
      {open && !warsh ? (
        <View style={styles.block}>
          {data === undefined ? (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {t('quran.loading', 'Loading…')}
            </Text>
          ) : data === null ? (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {t('tajweed.sheetUnavailable', 'The rules for this ayah are not available.')}
            </Text>
          ) : (
            <>
              {/* The tinted āyah, only when the sheet's own copy above the
                  tabs is plain (the muṣḥaf's colours off). With them on, the
                  one above is already tinted and a second would repeat it. */}
              {coloursOn ? null : (
                <TajweedAyahGlyphs
                  surah={surah}
                  ayah={ayah}
                  fontSize={AYAH_FONT_SIZE}
                  color={String(palette.text)}
                  onWordPress={w => {
                    if (!w.isEnd) speakWord(surah, ayah, w.position);
                  }}
                />
              )}
              {data.rules.length === 0 ? (
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {t('tajweed.sheetNone', 'Nothing in this ayah is tinted — no rule applies.')}
                </Text>
              ) : (
                data.rules.map(rule => {
                  const words = data.words.filter(w => w.spans.some(s => s.rule.id === rule.id));
                  return (
                    <View key={rule.id} style={styles.rule}>
                      <View style={styles.ruleHead}>
                        <TajweedSwatch rule={rule} />
                        <Text style={[styles.ruleName, readingText.style({ fontSize: TYPE.callout.fontSize }), { color: palette.text }]}>
                          {t(`tajweed.rule.${rule.id}.name`)}
                          {rule.counts ? (
                            <Text style={{ color: palette.muted, fontWeight: '400' }}>
                              {`  ·  ${t('tajweed.counts', { counts: rule.counts })}`}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                      <Text style={[styles.ruleHelp, readingText.style({ fontSize: TYPE.footnote.fontSize, lineHeight: 18 }), { color: palette.muted }]}>
                        {t(`tajweed.rule.${rule.id}.help`)}
                      </Text>
                      <View style={styles.chips}>
                        {words.map(w => {
                          const glyph = glyphAt(w.position);
                          return (
                            <Pressable
                              key={w.position}
                              accessibilityRole="button"
                              accessibilityLabel={`${w.text} — ${t('tajweed.hearWord', 'Hear it')}`}
                              onPress={() => speakWord(surah, ayah, w.position)}
                              style={({ pressed }) => [
                                styles.chip,
                                { borderColor: palette.border, backgroundColor: palette.card },
                                pressed && styles.pressed,
                              ]}>
                              {glyph ? (
                                <TajweedWordGlyph
                                  word={glyph}
                                  fontSize={CHIP_FONT_SIZE}
                                  color={String(palette.text)}
                                />
                              ) : (
                                <Text style={[styles.chipText, { color: palette.text }]}>{w.text}</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
              <View style={styles.links}>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() => {
                    onClose();
                    navigation.navigate('QuranTajweed');
                  }}>
                  <Text style={[styles.link, { color: palette.accentSolid }]}>
                    {t('tajweed.sheetMore', 'All the colours explained')} ›
                  </Text>
                </Pressable>
                {!coloursOn && hafs ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setQuranPrefs({ tajweedColours: true })}>
                    <Text style={[styles.link, { color: palette.accentSolid }]}>
                      {t('tajweed.turnOn', 'Show the colours in the mushaf')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

/**
 * The same section on the Warsh muṣḥaf. The āyah is the device's own
 * Warsh text in the page's face, tinted from `tajweed-warsh` wherever the
 * word hashes the same (`warshTajweed.ts`); the rows are the rules it
 * carries, each with its words. No "hear it": the word timings are the
 * Ḥafṣ recitations', and a Ḥafṣ voice reading a Warsh word would teach
 * the wrong thing.
 */
function WarshTajweedBody({
  surah,
  ayah,
  onClose,
  coloursOn,
}: {
  surah: number;
  ayah: number;
  onClose: () => void;
  coloursOn: boolean;
}) {
  const { t } = useTranslation();
  const { palette, isDark } = useAppPalette();
  const readingText = useReadingText();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [words, setWords] = useState<WarshTajweedWord[] | null | undefined>(undefined);
  const fontFamily = riwayahFontFamily(riwayahById('warsh'));

  useEffect(() => {
    let alive = true;
    setWords(undefined);
    const text = riwayahAyahText('warsh', surah, ayah);
    void loadWarshSurah(surah).then(data => {
      if (!alive) return;
      setWords(data && text ? warshAyahWords(data, ayah, text) : null);
    });
    return () => {
      alive = false;
    };
  }, [surah, ayah]);

  const rules: TajweedRule[] = [];
  for (const w of words ?? []) for (const r of w.rules) if (!rules.includes(r)) rules.push(r);

  const drawn = (w: WarshTajweedWord) =>
    shapedRuns(w.runs).map((run, i) =>
      run.rule ? (
        <Text key={i} style={{ color: tajweedInk(run.rule, isDark) }}>
          {run.text}
        </Text>
      ) : (
        run.text
      ),
    );

  return (
    <View style={styles.block}>
      {words === undefined ? (
        <Text style={[styles.meta, { color: palette.muted }]}>
          {t('quran.loading', 'Loading…')}
        </Text>
      ) : words === null ? (
        <Text style={[styles.meta, { color: palette.muted }]}>
          {t('tajweed.sheetUnavailable', 'The rules for this ayah are not available.')}
        </Text>
      ) : (
        <>
          {coloursOn ? null : (
            <Text style={[styles.warshAyah, { color: palette.text, fontFamily }]}>
              {words.map((w, i) => (
                <Text key={i}>
                  {i > 0 ? ' ' : null}
                  {drawn(w)}
                </Text>
              ))}
            </Text>
          )}
          {rules.length === 0 ? (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {t('tajweed.sheetNone', 'Nothing in this ayah is tinted — no rule applies.')}
            </Text>
          ) : (
            rules.map(rule => (
              <View key={rule.id} style={styles.rule}>
                <View style={styles.ruleHead}>
                  <TajweedSwatch rule={rule} />
                  <Text style={[styles.ruleName, readingText.style({ fontSize: TYPE.callout.fontSize }), { color: palette.text }]}>
                    {t(`tajweed.rule.${rule.id}.name`)}
                    {rule.counts ? (
                      <Text style={{ color: palette.muted, fontWeight: '400' }}>
                        {`  ·  ${t('tajweed.counts', { counts: rule.counts })}`}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                <Text style={[styles.ruleHelp, readingText.style({ fontSize: TYPE.footnote.fontSize, lineHeight: 18 }), { color: palette.muted }]}>
                  {t(`tajweed.rule.${rule.id}.help`)}
                </Text>
                <View style={styles.chips}>
                  {words
                    .filter(w => w.rules.includes(rule))
                    .map(w => (
                      <View
                        key={w.position}
                        style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.card }]}>
                        <Text style={[styles.warshChip, { color: palette.text, fontFamily }]}>
                          {drawn(w)}
                        </Text>
                      </View>
                    ))}
                </View>
              </View>
            ))
          )}
          <View style={styles.links}>
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => {
                onClose();
                navigation.navigate('QuranTajweed');
              }}>
              <Text style={[styles.link, { color: palette.accentSolid }]}>
                {t('tajweed.sheetMore', 'All the colours explained')} ›
              </Text>
            </Pressable>
            {!coloursOn ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setQuranPrefs({ tajweedColours: true })}>
                <Text style={[styles.link, { color: palette.accentSolid }]}>
                  {t('tajweed.turnOn', 'Show the colours in the mushaf')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * The Warsh āyah in the page's face with its letters tinted — what the
 * sheet draws above its tabs when the muṣḥaf's colours are on. Until the
 * rules load, or where they do not match, it is the plain text.
 */
export function WarshTajweedAyah({
  surah,
  ayah,
  text,
  style,
}: {
  surah: number;
  ayah: number;
  /** The āyah's own text, drawn as-is until (or unless) the tints load. */
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const { palette, isDark } = useAppPalette();
  const [words, setWords] = useState<WarshTajweedWord[] | null>(null);
  const fontFamily = riwayahFontFamily(riwayahById('warsh'));

  useEffect(() => {
    let alive = true;
    setWords(null);
    const own = riwayahAyahText('warsh', surah, ayah);
    void loadWarshSurah(surah).then(data => {
      if (alive) setWords(data && own ? warshAyahWords(data, ayah, own) : null);
    });
    return () => {
      alive = false;
    };
  }, [surah, ayah]);

  return (
    <Text style={[style, { color: palette.text, fontFamily }]}>
      {words
        ? words.map((w, i) => (
            <Text key={i}>
              {i > 0 ? ' ' : null}
              {shapedRuns(w.runs).map((run, j) =>
                run.rule ? (
                  <Text key={j} style={{ color: tajweedInk(run.rule, isDark) }}>
                    {run.text}
                  </Text>
                ) : (
                  run.text
                ),
              )}
            </Text>
          ))
        : text}
    </Text>
  );
}

const styles = StyleSheet.create({
  warshAyah: { fontSize: 26, lineHeight: 52, textAlign: 'right', writingDirection: 'rtl' },
  warshChip: { fontSize: TYPE.title3.fontSize, lineHeight: 40 },
  block: { marginTop: SPACING.sm, gap: SPACING.sm },
  meta: { fontSize: TYPE.footnote.fontSize },
  rule: { marginTop: SPACING.xs, gap: 4 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ruleName: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  ruleHelp: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  chipText: { ...arabicTextStyle('quran'), fontSize: TYPE.title3.fontSize, lineHeight: 40 },
  pressed: { opacity: 0.6 },
  links: { marginTop: SPACING.sm, gap: SPACING.sm },
  link: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
});
