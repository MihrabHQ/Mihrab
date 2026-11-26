/**
 * Recent searches and the count of results by source (`src/hadith/recentSearches.ts`).
 *
 * What must hold: a search is kept only once it led somewhere (the caller
 * decides when), newest first, once however it was typed, eight at most,
 * on this device; and a count is given only where it says something.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '../src/storage/appStorage';
import { RECENT_SEARCHES_MAX, _resetRecentSearchesForTests, clearRecentSearches, countBySource, recentSearches, rememberSearch } from '../src/hadith/recentSearches';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

beforeEach(async () => {
  await AsyncStorage.removeItem('mihrab.hadith.recentSearches.v1');
  _resetRecentSearchesForTests();
});

it('keeps the newest first, and a phrase once however its marks were typed', async () => {
  await rememberSearch('الصبر');
  await rememberSearch('  intention  ');
  expect(await rememberSearch('الصَّبْر')).toEqual(['الصَّبْر', 'intention']);
  _resetRecentSearchesForTests();
  expect(await recentSearches()).toEqual(['الصَّبْر', 'intention']);
});

it('keeps eight, drops a single letter, and can be emptied', async () => {
  for (let i = 0; i < 12; i++) await rememberSearch(`word${i}`);
  const all = await recentSearches();
  expect(all).toHaveLength(RECENT_SEARCHES_MAX);
  expect(all[0]).toBe('word11');
  expect(await rememberSearch('a')).toEqual(all);
  await clearRecentSearches();
  expect(await recentSearches()).toEqual([]);
  await AsyncStorage.setItem('mihrab.hadith.recentSearches.v1', '{broken');
  _resetRecentSearchesForTests();
  expect(await recentSearches()).toEqual([]);
});

it('counts what is shown by where it is from, only when that says something', () => {
  expect(countBySource([{ where: 'book', book: 'bukhari' }, { where: 'book', book: 'bukhari' }])).toBeNull();
  expect(countBySource([])).toBeNull();
  expect(countBySource([{ where: 'hadeethenc' }, { where: 'book', book: 'muslim' }, { where: 'hadeethenc' }, { where: 'nawawi' }])).toEqual([
    ['hadeethenc', 2],
    ['muslim', 1],
    ['nawawi', 1],
  ]);
});

it('is kept when a result is opened, not as it is typed, and is not offered on the Library page', () => {
  const src = read('src/screens/HadithScreen.tsx');
  expect(src.match(/rememberSearch\(/g)).toHaveLength(1);
  expect(src).toContain("fieldOpen && !query.trim() && recent.length && mode !== 'library'");
  // The field itself is not on the Library page: it does not search the books.
  expect(src).toContain("{mode !== 'library' ? (");
  expect(read('src/hadith/library.ts')).toContain('const limit = opts.limit ?? 80;');
});
