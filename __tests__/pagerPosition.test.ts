import { pagerPosition } from '../src/screens/home/pagerPosition';

describe('the Home day pager position', () => {
  it('is the page index itself in a left-to-right language', () => {
    for (let i = 0; i < 14; i += 1) expect(pagerPosition(i, 14, false)).toBe(i);
  });

  it('runs the other way in a right-to-left language: the oldest day at the far end', () => {
    expect(pagerPosition(0, 14, true)).toBe(13);
    expect(pagerPosition(13, 14, true)).toBe(0);
  });

  it('puts today one position from where the day after it sits, on the side the chevron points', () => {
    const todayIndex = 7;
    const today = pagerPosition(todayIndex, 14, true);
    const tomorrow = pagerPosition(todayIndex + 1, 14, true);
    const yesterday = pagerPosition(todayIndex - 1, 14, true);
    expect(tomorrow).toBe(today - 1); // to the left of today
    expect(yesterday).toBe(today + 1); // to the right of today
  });

  it('is its own inverse, so a position on the axis names the page it holds', () => {
    for (const rtl of [false, true]) {
      for (let i = 0; i < 14; i += 1) {
        expect(pagerPosition(pagerPosition(i, 14, rtl), 14, rtl)).toBe(i);
      }
    }
  });

  it('is what the card scrolls by, and what it reads a settled scroll with', () => {
    const fs = require('fs');
    const card: string = fs.readFileSync(
      require('path').join(__dirname, '..', 'src/screens/home/TodayCard.tsx'),
      'utf8',
    );
    // The list itself is left to right in every language; only the pages'
    // own content follows the language.
    expect(card).toMatch(/pager: \{ direction: 'ltr' \}/);
    expect(card).toMatch(/pageRtl: \{ direction: 'rtl' \}/);
    expect(card).toMatch(/pagerPosition\(index, pages\.length, rtl\)/);
  });
});
