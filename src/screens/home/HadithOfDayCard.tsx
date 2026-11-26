/**
 * The hadith of the day, on Today — where Today has a side column.
 *
 * The same hadith the Hadith tab's Learn page shows that day
 * (`hadith/daily.ts`: from what al-Bukhārī and Muslim both report, by the
 * date, the same for everyone), by its heading, and a tap opens it.
 *
 * ONLY BESIDE THE DAY, NEVER UNDER IT. The phone's Today shows the next
 * prayer, the day's times and one shortcut, and fits the screen without
 * scrolling: that is the page's whole design (HomeScreen, "THE PHONE
 * SHOWS WHAT IT NEEDS AND NO MORE"), and a card under the table would be
 * the first thing on it below the fold. The dashboard — a tablet on its
 * side, a desktop window — and a folded book have a column beside the
 * day with room in it, and the card goes there, under the Qur'an's. On a
 * phone the hadith of the day is the Hadith tab's first card, and a
 * notification for whoever asks for one (Settings → Notifications).
 *
 * Nothing is drawn until the hadith are on the device and the day's is
 * among them; nothing in a browser, which does not hold the list.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { AGREED_LIST, AGREED_OFFERED } from '../../hadith/catalog';
import { dailyHadithId } from '../../hadith/daily';
import { loadItem } from '../../hadith/library';
import { usePacksReadyKey } from '../../hadith/packs';
import { useAppLang } from '../../hadith/useHadith';
import { ownSideAlign } from '../../i18n/foreignText';
import { useLayoutRtl } from '../../i18n/useLayoutRtl';
import type { RootStackParamList } from '../../navigation/types';
import { cardEdgeStyle } from '../../theme/chrome';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { HOME_TABLE_RADIUS } from './tokens';

function HadithOfDayCardImpl({ day }: { /** The reader's calendar day, as any string that changes with it. */ day: string }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const rtl = useLayoutRtl();
  const lang = useAppLang();
  const here = usePacksReadyKey();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` is the reason to ask again
  const id = useMemo(() => (AGREED_OFFERED ? dailyHadithId(new Date()) : null), [day]);
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    setTitle(null);
    if (!id) return undefined;
    let live = true;
    loadItem(id, lang)
      .then(item => {
        if (live) setTitle(item?.title ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, lang, here]);
  if (!id || !title) return null;
  const arabic = /[؀-ۿ]/.test(title);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('hadith.daily.title')}. ${title}`}
      onPress={() => navigation.navigate('HadithReader', { id, list: AGREED_LIST })}
      style={({ pressed }) => [styles.card, cardEdgeStyle(palette), { backgroundColor: palette.card }, pressed && styles.pressed]}
      testID="home-hadith-of-day"
    >
      <Text style={[styles.label, { color: palette.accentSolid }]}>{t('hadith.daily.title')}</Text>
      <Text
        style={[styles.title, arabic && { writingDirection: 'rtl', textAlign: ownSideAlign(true, rtl) }, { color: palette.text }]}
        numberOfLines={4}
      >
        {title}
      </Text>
      <Text style={[styles.from, { color: palette.muted }]}>{t('hadith.daily.from')}</Text>
    </Pressable>
  );
}

export const HadithOfDayCard = memo(HadithOfDayCardImpl);

const styles = StyleSheet.create({
  card: { borderRadius: HOME_TABLE_RADIUS, padding: SPACING.lg, gap: SPACING.xs },
  label: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  title: { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight },
  from: { fontSize: TYPE.footnote.fontSize },
  pressed: { opacity: 0.6 },
});
