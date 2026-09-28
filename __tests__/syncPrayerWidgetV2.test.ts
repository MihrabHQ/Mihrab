/**
 * The app hands its widgets v1 and v2 together (docs/rewrite-plan.md, step
 * 1.4) — in ONE native call, because a v2 left over from an earlier write
 * would be read in preference to a newer v1. A binary without that call
 * gets v1 alone, as before.
 */
import { Platform } from 'react-native';
import { syncPrayerWidget } from '../src/widget/syncPrayerWidget';
import { getPrayerWidgetModule } from '../src/native/PrayerWidget';
import { readWidgetContractPayload } from '../src/widget/contract.generated';
import { widgetPayloadV1FromV2 } from '../src/widget/widgetPayloadV2';

jest.mock('../src/native/PrayerWidget', () => ({
  getPrayerWidgetModule: jest.fn(),
}));

const TODAY = {
  Fajr: '05:12',
  Sunrise: '07:05',
  Dhuhr: '12:32',
  Asr: '15:50',
  Maghrib: '18:35',
  Isha: '20:15',
};
const TOMORROW = { ...TODAY, Fajr: '05:14' };

describe('syncPrayerWidget', () => {
  const setData = jest.fn(async (_json: string) => {});
  const setDataV2 = jest.fn(async (_json: string, _v2: string) => {});

  beforeEach(() => {
    setData.mockClear();
    setDataV2.mockClear();
    Platform.OS = 'android';
  });

  it('writes v1 and v2 in one call when the binary can take both', async () => {
    (getPrayerWidgetModule as jest.Mock).mockReturnValue({
      setData,
      setDataV2,
    });
    const now = new Date(2026, 3, 9, 13, 0, 0, 0);
    await syncPrayerWidget(
      TODAY,
      TOMORROW,
      now,
      'Malmö',
      undefined,
      undefined,
      [TODAY, TOMORROW],
    );
    expect(setData).not.toHaveBeenCalled();
    expect(setDataV2).toHaveBeenCalledTimes(1);
    const [json, v2json] = setDataV2.mock.calls[0];
    const v1 = JSON.parse(json);
    const v2 = readWidgetContractPayload(JSON.parse(v2json));
    expect(v2).not.toBeNull();
    expect(v2!.schemaVersion).toBe(2);
    // The two describe the same moment: v2 read back is the v1 written.
    const back = JSON.parse(
      JSON.stringify(
        widgetPayloadV1FromV2(v2!, {
          todayKey: '2026-04-09',
          nowMinutes: 13 * 60,
        }),
      ),
    );
    delete v1.tomorrowEstimated;
    expect(back).toEqual(v1);
  });

  it('writes v1 alone to a binary without the v2 call', async () => {
    (getPrayerWidgetModule as jest.Mock).mockReturnValue({ setData });
    await syncPrayerWidget(TODAY, TOMORROW, new Date(2026, 3, 9, 13, 0, 0, 0));
    expect(setData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setData.mock.calls[0][0]).nextKey).toBe('Asr');
  });

  it('falls back to v1 alone when the v2 write fails', async () => {
    (getPrayerWidgetModule as jest.Mock).mockReturnValue({
      setData,
      setDataV2: jest.fn(async () => {
        throw new Error('bridge down');
      }),
    });
    await expect(
      syncPrayerWidget(TODAY, TOMORROW, new Date(2026, 3, 9, 13, 0, 0, 0)),
    ).resolves.toBeUndefined();
    expect(setData).toHaveBeenCalledTimes(1);
  });

  it('stays best-effort when even v1 cannot be written', async () => {
    (getPrayerWidgetModule as jest.Mock).mockReturnValue({
      setData: jest.fn(async () => {
        throw new Error('bridge down');
      }),
    });
    await expect(
      syncPrayerWidget(TODAY, TOMORROW, new Date(2026, 3, 9, 13, 0, 0, 0)),
    ).resolves.toBeUndefined();
  });
});
