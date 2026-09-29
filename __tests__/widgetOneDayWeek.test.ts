/**
 * A week of today alone, with tomorrow's times known, built before ʿIshāʾ
 * (review, 2026-09-29). v2 carried today only, so after ʿIshāʾ the widgets
 * and the Live Activity had nothing ahead until the app ran again — and
 * since step 1.7 v2 is the only payload the natives are given.
 */
import i18n from '../src/i18n';
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import {
  widgetPayloadV1FromV2,
  widgetPayloadV2FromV1,
} from '../src/widget/widgetPayloadV2';
import { contractClock } from '../src/widget/wallClock';
import { readWidgetContractPayload } from '../src/widget/contract.generated';
import type { TimingsMap } from '../src/types/prayer';

const TODAY: TimingsMap = {
  Fajr: '05:12',
  Sunrise: '07:05',
  Dhuhr: '12:32',
  Asr: '15:50',
  Maghrib: '18:35',
  Isha: '20:15',
};
const TOMORROW: TimingsMap = {
  Fajr: '05:10',
  Sunrise: '07:03',
  Dhuhr: '12:32',
  Asr: '15:51',
  Maghrib: '18:37',
  Isha: '20:17',
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

it('carries a known tomorrow, so there is a next prayer after ʿIshāʾ', () => {
  const built = new Date(2026, 3, 9, 13, 0);
  const v1 = buildWidgetPayload(
    TODAY,
    TOMORROW,
    built,
    undefined,
    undefined,
    undefined,
    [TODAY],
  );
  const v2 = widgetPayloadV2FromV1(v1, {
    clock: contractClock(false, 'en'),
    now: built,
  });
  expect(v2.days.map(d => d.dateKey)).toEqual(['2026-04-09', '2026-04-10']);
  const read = readWidgetContractPayload(JSON.parse(JSON.stringify(v2)))!;
  const late = widgetPayloadV1FromV2(read, {
    todayKey: '2026-04-09',
    nowMinutes: 22 * 60,
  });
  expect(late?.nextKey).toBe('Fajr');
});
