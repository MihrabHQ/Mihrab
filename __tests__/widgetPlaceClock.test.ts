/**
 * The widgets write a place's times on the place's clock, as the app's own
 * card does, and still count down and alert on the phone's.
 *
 * A saved Makkah on a phone in Stockholm: the card read ʿIshāʾ 19:07 and
 * the widget beside it 17:07 — the same moment, on two clocks.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { contractClock, formatContractMinutes } from '../src/widget/wallClock';
import { placeClockShiftMinutes } from '../src/utils/prayerTimes';
import { timePair, widgetMoment } from '../src/widget/widgetPayloadV2';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('how far the place\'s clock is ahead of the phone\'s', () => {
  const at = new Date(Date.UTC(2026, 10, 27, 12, 0, 0));
  const phone = 0 - at.getTimezoneOffset();

  it('is nothing on the phone\'s own clock', () => {
    expect(placeClockShiftMinutes(undefined, at)).toBe(0);
    expect(placeClockShiftMinutes(null, at)).toBe(0);
    expect(placeClockShiftMinutes('device', at)).toBe(0);
  });

  it('is the difference of the two offsets for a place in another zone', () => {
    // Fixed offsets, so the answer does not turn on the runner's zone data.
    expect(placeClockShiftMinutes('Etc/GMT-3', at)).toBe(180 - phone);
    expect(placeClockShiftMinutes('Etc/GMT+5', at)).toBe(-300 - phone);
  });

  it('is nothing where the phone cannot read the zone', () => {
    expect(placeClockShiftMinutes('Nowhere/Atall', at)).toBe(0);
  });
});

describe('a time written on the place\'s clock', () => {
  it('is the same minutes, written later', () => {
    const makkahFromStockholm = contractClock(false, 'en', 120);
    expect(makkahFromStockholm).toEqual({ hour12: false, shiftMinutes: 120 });
    // 17:07 on the phone is 19:07 in Makkah.
    expect(formatContractMinutes(17 * 60 + 7, makkahFromStockholm)).toBe('19:07');
    // Round midnight, both ways.
    expect(formatContractMinutes(23 * 60 + 30, makkahFromStockholm)).toBe('01:30');
    expect(formatContractMinutes(30, contractClock(false, 'en', -210))).toBe('21:00');
  });

  it('keeps its day period right on a 12-hour clock', () => {
    const c = contractClock(true, 'en', 120);
    expect(c.shiftMinutes).toBe(120);
    expect(formatContractMinutes(11 * 60 + 15, c)).toMatch(/^1:15\s?PM$/);
  });

  it('is not in the payload at all on the phone\'s own clock', () => {
    expect(contractClock(false, 'en')).toEqual({ hour12: false });
    expect(contractClock(false, 'en', 0)).toEqual({ hour12: false });
    expect('shiftMinutes' in contractClock(true, 'sv', 0)).toBe(false);
  });

  it('leaves the machine\'s string on the phone\'s clock: what the countdown and the ring are made from', () => {
    const pair = timePair(17 * 60 + 7, contractClock(false, 'en', 120));
    expect(pair.time).toBe('17:07');
    expect(pair.display).toBe('19:07');
    expect(typeof widgetMoment).toBe('function');
  });
});

describe('the three clocks agree, and the widget is told the place\'s', () => {
  it('shifts the writing only, in each language', () => {
    expect(src('android/app/src/main/java/com/prayer_times/contract/WallClock.kt')).toContain(
      'val m = Math.floorMod(minutes + clock.shiftMinutes, MINUTES_PER_DAY)',
    );
    expect(src('ios/Contract/WallClock.swift')).toContain('let shifted = minutes + clock.shiftMinutes');
    expect(src('src/widget/wallClock.ts')).toContain('Math.trunc(clock.shiftMinutes ?? 0)');
  });

  it('from the app and from a background refresh alike', () => {
    expect(src('src/widget/syncPrayerWidget.ts')).toContain(
      'contractClock(activeClock().hour12, i18n.language, placeClockShiftMinutes(placeClock, now))',
    );
    const home = src('src/screens/HomeScreen.tsx');
    expect(home.match(/phoneView\.widget\.yesterday,\s*\/\/ Written on the place's clock[^\n]*\n\s*state\.clock,/g)).toHaveLength(2);
    const republish = src('src/widget/republishWidgetPayload.ts');
    expect(republish).toContain('const clock = place[0]?.clock;');
    expect(republish).toMatch(/yesterday,\s*placeClock,\s*\);/);
  });
});
