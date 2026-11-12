/**
 * Several ayahs at once — to share or to copy.
 *
 * Asked for in a Play review (Infinix HOT 30i, Arabic, 2.37.0): "I just
 * wish they would add the option to copy or share more than one verse; it
 * shouldn't be limited to just one verse." The ayah sheet's Share asked
 * only how to send the ONE ayah it was opened on.
 *
 * So the share choice has a fourth answer, and it opens this: a run of
 * ayahs in the same surah, starting at the one the sheet was on, chosen
 * with two steppers, then sent — or copied, which a reader pasting into a
 * note or a message app of their own wants as often as the share sheet.
 *
 * ── ONE SURAH ─────────────────────────────────────────────────────────
 *
 * A run that crossed a surah's end would need a basmala, a second name
 * and a second reference in the middle of the text, and a reader who
 * wants two surahs wants them as two messages. The steppers stop at the
 * surah's first and last ayah.
 *
 * ── IN THE RIWAYAH ON THE PAGE ────────────────────────────────────────
 *
 * As the one-ayah share does since #46: each ayah's text is the reading
 * this reader has open where that reading has its own text, and its count
 * of ayahs is that reading's (`ayahCountForRiwayah` — al-Māʾidah has 122
 * in Warsh). The translation follows the Ḥafṣ numbering it is keyed by,
 * which is what the one-ayah share sends as well.
 *
 * ── HOW MUCH ──────────────────────────────────────────────────────────
 *
 * Any run within the surah, but not any LENGTH: what Android hands to
 * another app, or to the clipboard, crosses a process boundary that
 * refuses a transaction past about a megabyte, and refuses it by
 * throwing in the receiving app — the share would simply not arrive.
 * Al-Baqarah whole, with a translation, is near that. So the text is
 * measured before it is sent, and past `MAX_CHARS` the sheet says to
 * choose fewer ayahs instead of sending something that will not land.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { Button, SegmentedControl } from '../../components/ui';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { findSurah, loadSurah } from '../quran';
import { riwayahAyahText } from '../riwayahData';
import { ayahCountForRiwayah } from '../pages';
import type { RiwayahId } from '../riwayat';
import { getAyahTranslation, type QuranTranslationId } from '../translations';
import {
  ayahRangeReference,
  ayahRangeShareText,
  type AyahRangeParts,
} from '../../share/shareText';
import { copyToClipboard } from '../../sync/clipboard';

/** Past this many characters a share or a copy may not arrive at all (see above). */
export const MAX_CHARS = 90_000;
/** A run the sheet opens with: this ayah and the next two, where the surah has them. */
const OPENING_RUN = 3;
/** Held, a stepper repeats — a run in al-Baqarah is a long way by single taps. */
const REPEAT_AFTER_MS = 400;
const REPEAT_EVERY_MS = 70;

type Props = {
  visible: boolean;
  onClose: () => void;
  surah: number;
  /** The ayah the run starts at. */
  ayah: number;
  riwayah: RiwayahId;
  edition: QuranTranslationId;
};

/** The run's text, in the parts asked for; null when it is too long to send. */
export async function buildRangeText(args: {
  surah: number;
  from: number;
  to: number;
  riwayah: RiwayahId;
  edition: QuranTranslationId;
  parts: AyahRangeParts;
}): Promise<string | null> {
  const { surah, from, to, riwayah, edition, parts } = args;
  const meta = findSurah(surah);
  const numbers: number[] = [];
  for (let n = from; n <= to; n += 1) numbers.push(n);
  const needArabic = parts !== 'translation';
  const needTranslation = parts !== 'arabic';
  let bundled: ReadonlyArray<string> | null = null;
  if (needArabic && numbers.some(n => !riwayahAyahText(riwayah, surah, n))) {
    bundled = (await loadSurah(surah))?.arabic ?? null;
  }
  const arabic = needArabic
    ? numbers.map(n => riwayahAyahText(riwayah, surah, n) ?? bundled?.[n - 1] ?? '')
    : numbers.map(() => '');
  const translation = needTranslation
    ? await Promise.all(numbers.map(n => getAyahTranslation(edition, surah, n).catch(() => '')))
    : numbers.map(() => '');
  const text = ayahRangeShareText(
    { arabic, translation, first: from, surah, surahName: meta?.romanized ?? '' },
    parts,
  );
  return text.length > MAX_CHARS ? null : text;
}

export function ShareAyahRangeSheet({ visible, onClose, surah, ayah, riwayah, edition }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const meta = findSurah(surah);
  const count = Math.max(1, ayahCountForRiwayah(riwayah, surah));
  const start = Math.min(Math.max(1, ayah), count);

  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(Math.min(count, start + OPENING_RUN - 1));
  const [parts, setParts] = useState<AyahRangeParts>('both');
  const [busy, setBusy] = useState<'share' | 'copy' | null>(null);
  const [said, setSaid] = useState<'copied' | 'failed' | 'tooLong' | null>(null);
  const saidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each opening starts again from the ayah it was opened on.
  useEffect(() => {
    if (!visible) return;
    setFrom(start);
    setTo(Math.min(count, start + OPENING_RUN - 1));
    setSaid(null);
    setBusy(null);
  }, [visible, start, count]);
  useEffect(
    () => () => {
      if (saidTimer.current) clearTimeout(saidTimer.current);
    },
    [],
  );

  const say = (what: 'copied' | 'failed' | 'tooLong' | null, forMs = 2500) => {
    setSaid(what);
    if (saidTimer.current) clearTimeout(saidTimer.current);
    if (what && what !== 'tooLong') saidTimer.current = setTimeout(() => setSaid(null), forMs);
  };

  // The run is always a run: moving one end past the other carries it along.
  const moveFrom = useCallback(
    (delta: number) => {
      setFrom(f => {
        const next = Math.min(Math.max(1, f + delta), count);
        setTo(tt => Math.max(tt, next));
        return next;
      });
      setSaid(null);
    },
    [count],
  );
  const moveTo = useCallback(
    (delta: number) => {
      setTo(tt => {
        const next = Math.min(Math.max(1, tt + delta), count);
        setFrom(f => Math.min(f, next));
        return next;
      });
      setSaid(null);
    },
    [count],
  );

  const text = () => buildRangeText({ surah, from, to, riwayah, edition, parts });

  const share = async () => {
    setBusy('share');
    try {
      const body = await text();
      if (body == null) {
        say('tooLong');
        return;
      }
      await Share.share({ message: body });
    } catch {
      /* cancelled */
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    setBusy('copy');
    try {
      const body = await text();
      if (body == null) {
        say('tooLong');
        return;
      }
      const result = await copyToClipboard(body);
      // Android 13 and later say "Copied" themselves; saying it again is noise.
      say(result === 'failed' ? 'failed' : result === 'copied-quietly' ? 'copied' : null);
    } finally {
      setBusy(null);
    }
  };

  const reference = ayahRangeReference(meta?.romanized ?? '', surah, from, to);
  const ayahs = to - from + 1;

  return (
    <ResponsiveModal visible={visible} onClose={onClose} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[typeStyle('title3'), { color: palette.text }]}>
            {t('quran.shareRangeTitle', 'Share several ayahs')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]} numberOfLines={1}>
            {reference}
          </Text>
        </View>

        <View style={[styles.group, { backgroundColor: palette.controlBg }]}>
          <EndStepper
            label={t('quran.rangeFrom', 'From ayah')}
            value={from}
            canDown={from > 1}
            canUp={from < count}
            onStep={moveFrom}
            downLabel={t('quran.rangeEarlier', 'Earlier')}
            upLabel={t('quran.rangeLater', 'Later')}
          />
          <View style={[styles.rule, { backgroundColor: palette.border }]} />
          <EndStepper
            label={t('quran.rangeTo', 'To ayah')}
            value={to}
            canDown={to > 1}
            canUp={to < count}
            onStep={moveTo}
            downLabel={t('quran.rangeEarlier', 'Earlier')}
            upLabel={t('quran.rangeLater', 'Later')}
          />
        </View>
        <Text style={[typeStyle('footnote'), styles.hint, { color: palette.muted }]}>
          {t('quran.rangeHint', {
            defaultValue: '{{count}} of {{total}} ayahs in {{surah}}. Hold an arrow to move faster.',
            count: ayahs,
            total: count,
            surah: meta?.romanized ?? '',
          })}
        </Text>

        <SegmentedControl<AyahRangeParts>
          accessibilityLabel={t('duas.shareWhat', 'What to send')}
          value={parts}
          onChange={p => {
            setParts(p);
            setSaid(null);
          }}
          segments={[
            { key: 'both', label: t('duas.shareBoth', 'Arabic and translation') },
            { key: 'arabic', label: t('duas.shareArabicOnly', 'Arabic only') },
            { key: 'translation', label: t('duas.shareTranslationOnly', 'Translation only') },
          ]}
        />

        {said ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typeStyle('footnote'), styles.hint, { color: said === 'copied' ? palette.accentSolid : palette.danger }]}>
            {said === 'copied'
              ? t('whatsNew.copied', 'Copied')
              : said === 'failed'
                ? t('whatsNew.copyFailed', "Couldn't copy")
                : t('quran.rangeTooLong', 'That is too long to send at once. Choose fewer ayahs.')}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              variant="secondary"
              label={t('quran.rangeCopy', 'Copy')}
              loading={busy === 'copy'}
              disabled={busy != null}
              onPress={() => void copy()}
            />
          </View>
          <View style={styles.action}>
            <Button
              label={t('common.share', 'Share')}
              loading={busy === 'share'}
              disabled={busy != null}
              onPress={() => void share()}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          onPress={onClose}
          style={({ pressed }) => [styles.close, { backgroundColor: palette.controlBg }, pressed ? styles.pressed : null]}>
          <Text style={[typeStyle('headline'), { color: palette.text }]}>{t('common.cancel', 'Cancel')}</Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

/** "From ayah   −  5  +" — the arrows repeat while held. */
function EndStepper({
  label,
  value,
  canDown,
  canUp,
  onStep,
  downLabel,
  upLabel,
}: {
  label: string;
  value: number;
  canDown: boolean;
  canUp: boolean;
  onStep: (delta: number) => void;
  downLabel: string;
  upLabel: string;
}) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.stepRow}>
      <Text style={[typeStyle('body'), styles.stepLabel, { color: palette.text }]}>{label}</Text>
      <RepeatButton glyph="−" label={`${label}: ${downLabel}`} enabled={canDown} onStep={() => onStep(-1)} />
      <Text
        accessibilityLabel={`${label} ${value}`}
        style={[typeStyle('title3'), styles.value, { color: palette.text }]}>
        {value}
      </Text>
      <RepeatButton glyph="+" label={`${label}: ${upLabel}`} enabled={canUp} onStep={() => onStep(1)} />
    </View>
  );
}

function RepeatButton({
  glyph,
  label,
  enabled,
  onStep,
}: {
  glyph: string;
  label: string;
  enabled: boolean;
  onStep: () => void;
}) {
  const { palette } = useAppPalette();
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const every = useRef<ReturnType<typeof setInterval> | null>(null);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = () => {
    if (delay.current) clearTimeout(delay.current);
    if (every.current) clearInterval(every.current);
    delay.current = null;
    every.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={6}
      onPressIn={() => {
        step.current();
        stop();
        delay.current = setTimeout(() => {
          every.current = setInterval(() => step.current(), REPEAT_EVERY_MS);
        }, REPEAT_AFTER_MS);
      }}
      onPressOut={stop}
      style={({ pressed }) => [
        styles.arrow,
        { backgroundColor: pressed ? palette.accentBg : palette.card },
        !enabled && styles.disabled,
      ]}>
      <Text style={[styles.arrowGlyph, { color: palette.accentSolid }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  head: { gap: SPACING.xs },
  group: { borderRadius: RADIUS.md, paddingHorizontal: SPACING.md },
  rule: { height: StyleSheet.hairlineWidth },
  stepRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: SPACING.sm },
  stepLabel: { flex: 1 },
  value: { minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  arrowGlyph: { fontSize: 22, lineHeight: 26, fontWeight: '500' },
  disabled: { opacity: 0.35 },
  hint: { paddingHorizontal: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  action: { flex: 1 },
  close: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: RADIUS.md },
  pressed: { opacity: 0.7 },
});
