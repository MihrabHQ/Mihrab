/**
 * The hadith of the day on Today: beside the day where Today has a side
 * column, and never under it on a phone, whose Today fits the screen
 * without scrolling by design (`screens/home/HadithOfDayCard.tsx`).
 *
 * Seen in the desktop app's dashboard on 2026-11-26; not on an iPad, a
 * Mac, a fold, or the iPhone Duo (which never shows the dashboard).
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the hadith of the day on Today', () => {
  const home = read('src/screens/HomeScreen.tsx');
  const card = read('src/screens/home/HadithOfDayCard.tsx');

  it('is in the dashboard’s side column and the book’s second page, under the Qur’an’s card, and nowhere else', () => {
    const uses = home.split('{hadithOfDay}').length - 1;
    expect(uses).toBe(2);
    expect(home.split(/\{quranShortcut\}\s+\{hadithOfDay\}\s+\{toolsGrid\}/).length - 1).toBe(2);
    // Each of the two is inside a side column.
    for (const part of home.split('{hadithOfDay}').slice(0, 2)) expect(part.slice(-220)).toContain('styles.dashSide');
  });

  it('is the day’s own hadith, from "Agreed upon", opened in that list; nothing where it is not on the device or in a browser', () => {
    expect(card).toContain('AGREED_OFFERED ? dailyHadithId(new Date()) : null');
    expect(card).toContain("navigation.navigate('HadithReader', { id, list: AGREED_LIST })");
    expect(card).toContain('if (!id || !title) return null;');
    // Asked again when the day changes.
    expect(home).toContain('<HadithOfDayCard day={new Date().toDateString()} />');
    expect(card).toMatch(/\[day\]\);/);
  });
});
