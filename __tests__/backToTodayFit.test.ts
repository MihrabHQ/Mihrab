/**
 * "Back to today" in the times sheet stands in the first row's empty middle
 * instead of on a line of its own, in the form that fits there.
 */
import fs from 'fs';
import path from 'path';
import { BACK_CLEAR, BACK_PILL_PAD, backToTodayForm } from '../src/screens/home/backToTodayFit';

const sheet = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'TodayTimesSheet.tsx'), 'utf8');

describe('the form that fits between the name and the time', () => {
  const words = { fullW: 92, smallW: 78 };

  it('is the words where the row has the room', () => {
    // A 380-wide row, "Fajr" after its check, "05:11" at the end.
    expect(backToTodayForm({ rowW: 380, startW: 70, endW: 46, ...words })).toBe('full');
  });

  it('counts the wider side twice: the pill is centred on the row', () => {
    const side = 120 + BACK_CLEAR;
    const exact = 2 * side + words.fullW + 2 * BACK_PILL_PAD;
    expect(backToTodayForm({ rowW: exact, startW: 120, endW: 46, ...words })).toBe('full');
    expect(backToTodayForm({ rowW: exact - 1, startW: 120, endW: 46, ...words })).toBe('small');
    // The same room with the long side at the end.
    expect(backToTodayForm({ rowW: exact - 1, startW: 46, endW: 120, ...words })).toBe('small');
  });

  it('goes a size smaller, then to the glyph, as the middle narrows', () => {
    expect(backToTodayForm({ rowW: 300, startW: 90, endW: 46, ...words })).toBe('small');
    expect(backToTodayForm({ rowW: 280, startW: 110, endW: 46, ...words })).toBe('icon');
    // Large text: the words themselves are wider.
    expect(backToTodayForm({ rowW: 380, startW: 100, endW: 70, fullW: 176, smallW: 150 })).toBe('icon');
  });

  it('draws nothing on a guess: every measure first', () => {
    expect(backToTodayForm({ rowW: 0, startW: 70, endW: 46, ...words })).toBeNull();
    expect(backToTodayForm({ rowW: 380, startW: 70, endW: 0, ...words })).toBeNull();
    expect(backToTodayForm({ rowW: 380, startW: 70, endW: 46, fullW: 0, smallW: 78 })).toBeNull();
    expect(backToTodayForm({ rowW: 380, startW: 70, endW: 46, fullW: 92, smallW: 0 })).toBeNull();
  });
});

describe('the sheet', () => {
  it('has no line of its own for the way back: the sheet is one height on every day', () => {
    const head = sheet.slice(sheet.indexOf('<View style={styles.sheet}>'), sheet.indexOf('<View style={styles.foot}>'));
    // Between the day bar and the foot there is the pager (or the rows) and nothing else.
    expect(head).not.toMatch(/\{isToday \? null : \(/);
    expect(sheet).not.toContain('styles.backToToday');
  });

  it('draws it in the first row of every day but today, so it turns with its page', () => {
    expect(sheet).toContain('<DayRows rows={item.rows} onBackToToday={item.offset === 0 ? undefined : onBackToToday} />');
    expect(sheet).toContain('<DayRows rows={rows} onBackToToday={isToday ? undefined : onBackToToday} />');
    expect(sheet).toContain('const first = index === 0 && !!onBackToToday;');
  });

  it('lays it over the row without taking the row\'s touches or its height', () => {
    expect(sheet).toContain('<View style={styles.backLayer} pointerEvents="box-none">');
    expect(sheet).toMatch(/backLayer: \{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,/);
  });

  it('keeps its name for a screen reader in every form', () => {
    const pill = sheet.slice(sheet.indexOf('function BackToToday('), sheet.indexOf('function TodayGlyph('));
    expect(pill).toMatch(/accessibilityRole="button"\s*accessibilityLabel=\{label\}/);
    expect(pill).toContain("form === 'icon' ? (");
  });
});
