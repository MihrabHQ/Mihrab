/**
 * The widget reads a table-serving source's days from the table.
 *
 * Morocco's, Sweden's, Algeria's and the national sources never write to
 * the cache — their day is read from the phone's own copy every time — so
 * the widget's cache-only window had nothing for them, and a refresh with
 * the app closed fell to a generic calculation at the raw coordinates: an
 * hour off in Morocco, on the wrong place and corrections elsewhere.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');

import {
  cachedDaysFrom,
  WIDGET_WINDOW_DAYS,
} from '../src/prayer/widgetDayWindow';
import { getDatasetPrayerTimesOrNull } from '../src/prayer/prayerStorage';
import { addDays } from '../src/utils/prayerTimes';

const now = new Date(2026, 9, 17, 9);

beforeEach(async () => {
  await AsyncStorage.clear();
  (global.fetch as jest.Mock).mockImplementation(() =>
    Promise.reject(new TypeError('offline')),
  );
});

it.each([
  ['habous', 34.0209, -6.8416], // Rabat
  ['islamiska_forbundet', 59.3293, 18.0686], // Stockholm
  ['marw', 36.7538, 3.0588], // Algiers
])(
  'fills the window for %s from the table, with nothing cached',
  async (provider, latitude, longitude) => {
    const params = {
      provider: provider as never,
      latitude,
      longitude,
      calculationMethod: 'auto' as const,
      school: 0,
    };
    const days = await cachedDaysFrom(0, params, now);
    expect(days).toHaveLength(WIDGET_WINDOW_DAYS);
    const first = await getDatasetPrayerTimesOrNull({ ...params, date: now });
    expect(days[0]).toEqual(first);
    const last = await getDatasetPrayerTimesOrNull({
      ...params,
      date: addDays(now, WIDGET_WINDOW_DAYS - 1),
    });
    expect(days[WIDGET_WINDOW_DAYS - 1]).toEqual(last);
  },
);

it('still reads the cache, and only the cache, for a network source', async () => {
  const params = {
    provider: 'aladhan' as const,
    latitude: 51.5,
    longitude: -0.12,
    calculationMethod: 3 as const,
    school: 0,
  };
  expect(await cachedDaysFrom(0, params, now)).toEqual([]);
  expect(global.fetch).not.toHaveBeenCalled();
});
