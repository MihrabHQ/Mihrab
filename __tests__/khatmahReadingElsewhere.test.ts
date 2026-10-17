/**
 * Reading a surah ahead of the khatmah leaves the khatmah where it was — #84.
 *
 * "When I choose surah an-Nāziʿāt to begin my memorisation, I lose
 * progress on my khatmah tracker": fifty pages from the end of a plan,
 * the portion the reader stands in can be the rest of the book, and every
 * page turned in it was credited whatever door the reader came in by. So
 * An-Nāziʿāt, opened from the index, moved "Continue khatmah" thirty pages
 * on, and left the pages in between as a gap.
 */
import {
  __resetQuranStateForTests,
  getQuranState,
} from '../src/quran/quranState';
import {
  activeKhatmah,
  khatmahCurrentPage,
} from '../src/quran/khatmahProgress';
import {
  recordKhatmahPageTurn,
  startKhatmah,
} from '../src/quran/khatmahActions';
import { findPageForAyah } from '../src/quran/pages';
import {
  _resetReadingSession,
  beginReadingSession,
  endReadingSession,
} from '../src/quran/readingSession';

const plan = () => activeKhatmah(getQuranState())!;
const NAZIAT = findPageForAyah(79, 1);

beforeEach(() => {
  __resetQuranStateForTests();
  _resetReadingSession();
  // A plan with one portion: the window is the whole book, as near the end
  // of any plan whose portions are long.
  startKhatmah(1);
  // Read through page 553 in the khatmah.
  beginReadingSession({ kind: 'khatmah' });
  recordKhatmahPageTurn(1, 554);
  endReadingSession();
  expect(khatmahCurrentPage(plan())).toBe(554);
});
afterEach(() => endReadingSession());

it('does not move the khatmah for a surah read ahead from the index', () => {
  beginReadingSession(null); // the surah index
  recordKhatmahPageTurn(NAZIAT, NAZIAT + 1);
  recordKhatmahPageTurn(NAZIAT + 1, NAZIAT + 2);
  expect(khatmahCurrentPage(plan())).toBe(554);
});

it('nor for one read from a bookmark', () => {
  beginReadingSession({ kind: 'bookmark', id: 'b1' });
  recordKhatmahPageTurn(NAZIAT, NAZIAT + 1);
  expect(khatmahCurrentPage(plan())).toBe(554);
});

it('still counts the plan’s own pages read from the index, from where it stands', () => {
  beginReadingSession(null);
  recordKhatmahPageTurn(554, 555);
  recordKhatmahPageTurn(555, 556);
  expect(khatmahCurrentPage(plan())).toBe(556);
});

it('counts reading ahead in the portion when the khatmah was opened', () => {
  beginReadingSession({ kind: 'khatmah' });
  recordKhatmahPageTurn(NAZIAT, NAZIAT + 1);
  expect(khatmahCurrentPage(plan())).toBe(NAZIAT + 1);
  // …and the pages in between are the gap the card offers to go back to.
});
