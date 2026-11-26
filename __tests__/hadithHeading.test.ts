/**
 * The reader's heading says when it is cut from a longer hadith
 * (`src/hadith/heading.ts`).
 *
 * The second of an-Nawawi's Forty is the hadith of Jibrīl; its title in
 * HadeethEnc is the one answer about the pillars of Islam, and it stood
 * above the page-long text as if it were the hadith (Pixel 10 Pro,
 * 2026-11-26). A title that is nearly all of its hadith is left as it is.
 */
import { hadithHeading, headingCut, HEADING_CUT_AFTER_WORDS } from '../src/hadith/heading';

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('hadithHeading', () => {
  const title = 'Islam is to testify that there is no god but Allah';

  it('leaves a title alone when the hadith is little more than it', () => {
    const text = `ʿUmar reported that the Messenger of Allah said: "${title}."`;
    expect(hadithHeading(title, text)).toBe(title);
  });

  it('marks the end the text goes on from', () => {
    expect(hadithHeading(title, `He said: "${title}." ${filler(60)}`)).toBe(`${title} …`);
    expect(hadithHeading(title, `${filler(60)} He said: "${title}."`)).toBe(`… ${title}`);
    expect(hadithHeading(title, `${filler(60)} "${title}" ${filler(60)}`)).toBe(`… ${title} …`);
  });

  it('does not count a narrator’s line as more hadith', () => {
    const before = filler(HEADING_CUT_AFTER_WORDS);
    expect(headingCut(title, `${before} ${title}`)).toEqual({ before: false, after: false });
    expect(headingCut(title, `${before} more ${title}`).before).toBe(true);
  });

  it('finds the words whatever their punctuation, capitals and accents', () => {
    const text = `${filler(60)} “ISLAM is to testify, that there is no god but Allāh” ${filler(3)}`;
    expect(hadithHeading(title, text)).toBe(`… ${title}`);
  });

  it('marks nothing where the title is not in the text as it stands', () => {
    expect(hadithHeading('The pillars of Islam', `${filler(60)} ${title} ${filler(60)}`)).toBe('The pillars of Islam');
    expect(hadithHeading('', filler(100))).toBe('');
  });

  it('does not mark a title twice', () => {
    expect(hadithHeading(`${title}…`, `${title} ${filler(60)}`)).toBe(`${title}…`);
  });

  it('reads Arabic the same way', () => {
    const t = 'الإسلام أن تشهد أن لا إله إلا الله';
    const ar = `${Array.from({ length: 60 }, () => 'كلمة').join(' ')} «الْإِسْلَامُ أَنْ تَشْهَدَ أَنْ لَا إِلَهَ إِلَّا اللهُ»`;
    expect(hadithHeading(t, ar)).toBe(`… ${t}`);
  });
});
