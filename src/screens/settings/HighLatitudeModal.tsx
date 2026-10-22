// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { HIGH_LATITUDE_RULES, type HighLatitudeRuleId } from '../../prayer/calculationPreferences';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { modalStyles } from './modalStyles';
import { useSheetPadding } from '../../responsive/sheetSides';

type Props = {
  visible: boolean;
  current: HighLatitudeRuleId;
  palette: AppPalette;
  onSelect: (id: HighLatitudeRuleId) => void;
  onClose: () => void;
};

/** The three summer-night rules AlAdhan offers, under its names, with a line each. */
export const HighLatitudeModal = memo(function HighLatitudeModal({
  visible,
  current,
  palette,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const sheetPad = useSheetPadding();
  const navigationReserve = useSystemNavigationReserve();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[modalStyles.root, sheetPad]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.highLatitudeRule')}
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.highLatitudeRule')}
          </Text>
          {HIGH_LATITUDE_RULES.map(id => {
            const label = t(`settings.highLatitude.${id}`);
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected: current === id }}
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  current === id && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  onSelect(id);
                  onClose();
                }}
              >
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>{label}</Text>
                <Text style={[modalStyles.rowSub, { color: palette.muted }]}>
                  {t(`settings.highLatitude.${id}Help`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
});
