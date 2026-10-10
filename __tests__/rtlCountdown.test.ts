/**
 * Issue #71: in Arabic the hero read minutes, hours, seconds, and the next
 * prayer's time lost its ص to an ellipsis.
 */
import fs from 'fs';
import path from 'path';
import { countdownPieces } from '../src/utils/prayerTimes';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

describe('the countdown as pieces', () => {
  it("gives hours, minutes and seconds apart, in the language's units", () => {
    const ar = { hour: 'س', minute: 'د', second: 'ث' };
    expect(countdownPieces(3 * 3600 + 43 * 60 + 41, ar)).toEqual({
      hours: '3س',
      minutes: '43د',
      seconds: '41ث',
    });
    const en = { hour: 'h', minute: 'm', second: 's' };
    expect(countdownPieces(47 * 60 + 7, en)).toEqual({ hours: null, minutes: '47m', seconds: '07s' });
    expect(countdownPieces(-5, en)).toEqual({ hours: null, minutes: '0m', seconds: '00s' });
  });

  it('is drawn as separate texts, so the row orders them in reading order', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toContain('{pieces.hours}');
    expect(card).toContain('{pieces.minutes}');
    expect(card).toContain('{pieces.seconds}');
    expect(card).not.toContain('{parts.main}');
  });

  it('has Arabic units in Arabic and the old letters elsewhere', () => {
    const ar = JSON.parse(read('src/i18n/locales/ar.json'));
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    expect([ar.home.countdownUnitHour, ar.home.countdownUnitMinute, ar.home.countdownUnitSecond]).toEqual([
      'س',
      'د',
      'ث',
    ]);
    expect([en.home.countdownUnitHour, en.home.countdownUnitMinute, en.home.countdownUnitSecond]).toEqual([
      'h',
      'm',
      's',
    ]);
  });
});

describe('the time column', () => {
  it("is as wide as the wider of the sample and the row's own time", () => {
    const row = read('src/screens/home/PrayerRow.tsx');
    expect(row).toMatch(/styles\.timeSample, styles\.timeOwnWidth\]}[\s\S]{0,120}\{shown\}/);
    expect(row).toMatch(/timeOwnWidth: \{ height: 0, overflow: 'hidden' \}/);
  });
});
