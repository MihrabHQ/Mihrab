import { Platform } from 'react-native';
import type { TimingsMap } from '../types/prayer';
import {
  buildWidgetPayload,
  type WidgetCoords,
  type WidgetSeasonalFlags,
} from './buildWidgetPayload';
import { getPrayerWidgetModule } from '../native/PrayerWidget';
import type { WidgetExtras } from './widgetBlocks';
import { widgetPayloadV2FromV1 } from './widgetPayloadV2';
import { contractClock } from './wallClock';
import { activeClock } from '../utils/activeClock';
import i18n from '../i18n';

/**
 * Updates home-screen widget data (Android + iOS when native module is linked).
 *
 * @param coords Optional. When provided and both lat and lng are exactly 0,
 * `buildWidgetPayload` throws — this is the (0, 0) gate. Callers with coords
 * SHOULD pass them; the gate is the only thing standing between a corrupted
 * coord pipeline and Ghana-coast prayer times reaching the user's home screen.
 */
export async function syncPrayerWidget(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date = new Date(),
  locationName?: string,
  coords?: WidgetCoords,
  seasonal?: WidgetSeasonalFlags,
  /** Consecutive days starting today — drives the multi-day rollover. */
  week?: TimingsMap[],
  /** Practice / today / reading / hijri / tasbih blocks. */
  extras?: WidgetExtras,
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }
  const mod = getPrayerWidgetModule();
  if (!mod) {
    return;
  }
  const payload = buildWidgetPayload(
    today,
    tomorrow,
    now,
    locationName,
    coords,
    seasonal,
    week,
    extras,
  );
  const json = JSON.stringify(payload);
  if (mod.setDataV2) {
    try {
      const v2 = widgetPayloadV2FromV1(payload, {
        clock: contractClock(activeClock().hour12, i18n.language),
        now,
      });
      await mod.setDataV2(json, JSON.stringify(v2));
      return;
    } catch {
      // Whatever went wrong with v2, v1 alone still reaches the widgets —
      // and `setData` clears the v2 that would otherwise outrank it.
    }
  }
  try {
    await mod.setData(json);
  } catch {
    /* widget is best-effort */
  }
}
