/**
 * The Dhikr tab: Tasbih and Duas, one tab with a switcher at its top.
 *
 * It opens on the counter — the thing reached for straight after prayer —
 * at every launch, not on whichever page was open last time: the tab's
 * promise is "the beads are one tap away", and a Duas remembered across
 * days would break it the one time it mattered. Within a session the tab
 * stays on the page it was turned to. A link lands where it says: mihrab://duas,
 * mihrab://duas/evening (the adhkār reminders, #39) and mihrab://tasbih
 * (the widget) all come here (`linking.ts`).
 *
 * Only the page on show is mounted. The counter's count lives in its
 * store, and a dua category is a page of its own with the switcher out of
 * the way, so there is nothing of either worth keeping alive behind the
 * other.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { showTabBar } from '../navigation/tabBarVisibility';
import type { DhikrView } from '../navigation/types';
import { SPACING } from '../theme/tokens';
import { DuasScreen } from './DuasScreen';
import { TasbihScreen } from './TasbihScreen';

type Params = { view?: DhikrView; category?: string } | undefined;

type Props = {
  route?: { params?: Params };
  navigation?: {
    setParams?: (params: { view?: DhikrView; category?: string }) => void;
    addListener?: (event: 'focus', cb: () => void) => (() => void) | undefined;
  };
};

/** Which page a route's parameters ask for, if any. */
export function dhikrViewOf(params: Params): DhikrView | null {
  if (params?.view === 'tasbih' || params?.view === 'duas') return params.view;
  if (typeof params?.category === 'string' && params.category) return 'duas';
  return null;
}

export function DhikrScreen({ route, navigation }: Props = {}) {
  const { t } = useTranslation();
  const asked = dhikrViewOf(route?.params);
  const [view, setLocalView] = useState<DhikrView>(asked ?? 'tasbih');

  // A link that arrives while the tab is already mounted. The page on show
  // is kept on the route too (`choose`), so it outlives a process the
  // system reclaimed (resumeWhereLeft.ts); `category` is DuasScreen's to
  // consume, and with it gone `view` still says Duas.
  useEffect(() => {
    if (asked) setLocalView(asked);
  }, [asked]);
  const choose = (next: DhikrView) => {
    setLocalView(next);
    navigation?.setParams?.({ view: next });
  };

  // A category hides the tab bar, and leaving Duas unmounts the screen
  // that would have brought it back.
  useEffect(() => {
    if (view === 'tasbih') showTabBar();
  }, [view]);

  const segments = useMemo(
    () => [
      { key: 'tasbih' as const, label: t('nav.tasbih') },
      { key: 'duas' as const, label: t('nav.duas') },
    ],
    [t],
  );
  const switcher = (
    <View style={styles.switcher}>
      <SegmentedControl
        segments={segments}
        value={view}
        onChange={choose}
        accessibilityLabel={t('nav.dhikr')}
        testID="dhikr-switcher"
      />
    </View>
  );

  return view === 'tasbih' ? (
    <TasbihScreen header={switcher} />
  ) : (
    <DuasScreen
      route={{ params: { category: route?.params?.category } }}
      navigation={navigation}
      header={switcher}
    />
  );
}

const styles = StyleSheet.create({
  // The Duas index pads its own sides; Tasbih's column does too. Room
  // underneath so the switcher reads as the page's top, not its first row.
  switcher: { paddingBottom: SPACING.xs },
});
