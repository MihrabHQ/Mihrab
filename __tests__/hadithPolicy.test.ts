/**
 * The rule for which hadith the app serves (`docs/hadith-policy.md`), and
 * the code that enforces it, say the same thing.
 *
 *   A hadith is in the app only when a named grader calls it ṣaḥīḥ or
 *   ḥasan, and no grader the app cites calls it weak.
 *
 * The page is what a contributor and a reader are pointed at (AGENTS.md,
 * Settings → About); `grade.ts` and `bookGrades.ts` are what the packs
 * and the app obey. Each sentence of the rule is held to the function
 * that carries it out, so the page cannot promise what the code does not
 * do, and the code cannot be loosened with the page left standing.
 */
import fs from 'fs';
import path from 'path';
import { servedGrade } from '../src/hadith/grade';
import { GRADED_BOOKS, SAHIH_BOOKS, ALL_BOOKS, bookGradeVerdict, soundByAll } from '../src/hadith/bookGrades';

const REPO = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');
const POLICY = read('docs/hadith-policy.md');

describe('the rule, as the page states it', () => {
  it('is one sentence, and it is there', () => {
    expect(POLICY.replace(/\s+/g, ' ')).toContain(
      'A hadith is in the app only when a named grader calls it ṣaḥīḥ or > ḥasan, and no grader the app cites calls it weak.',
    );
  });

  it('names the code that enforces each part', () => {
    for (const file of ['src/hadith/grade.ts', 'src/hadith/bookGrades.ts', 'scripts/hadith/book-grades.js', 'src/hadith/withheld.json']) {
      expect(POLICY).toContain(file);
      expect(fs.existsSync(path.join(REPO, file))).toBe(true);
    }
  });

  it('types no count: the builder prints them', () => {
    // A figure here would be a claim nobody regenerates (AGENTS.md §4).
    expect(POLICY).not.toMatch(/\d[\d,]{2,}\s+(hadith|of)\b/i);
  });
});

describe('accepted: ṣaḥīḥ and ḥasan', () => {
  it('HadeethEnc — outright, through supporting chains, of the chain, of a Companion', () => {
    for (const g of ['صحيح', 'حسن', 'حسن صحيح', 'صحيح لغيره', 'حسن بشواهده', 'إسناده صحيح', 'صحيح موقوفًا على ابن عباس']) {
      expect(servedGrade(g)).toBe(true);
    }
  });

  it('the books — every grader who ruled, and at least one did', () => {
    expect(soundByAll(['Sahih'])).toBe(true);
    expect(soundByAll(['Sahih', 'Hasan', 'Hasan Sahih'])).toBe(true);
    // A grader who says nothing either way has not ruled.
    expect(soundByAll(['Sahih', '-'])).toBe(true);
  });
});

describe('refused: weak, ungraded, disputed', () => {
  it('HadeethEnc — any weak word, and no grade at all', () => {
    for (const g of ['ضعيف', 'ضعيف جدًا', 'موضوع', 'منكر', 'لا يصح', 'صحيح، والرواية الثانية ضعيفة', '', null, undefined]) {
      expect(servedGrade(g)).toBe(false);
    }
  });

  it('the books — a weak word anywhere in a grade makes it weak', () => {
    for (const g of ["Da'if", 'Daif', 'Munkar', 'Shadh', 'Shadh, Sahih', 'Mawdu', 'Batil', 'Mursal Sahih Isnaad', 'Malool']) {
      expect(bookGradeVerdict(g)).toBe('weak');
    }
  });

  it('the books — no grade is not served', () => {
    expect(soundByAll([])).toBe(false);
    expect(soundByAll(['-', 'Maqtu'])).toBe(false);
  });

  it('the books — one grader calling it weak leaves it out, whatever the others say', () => {
    expect(soundByAll(['Sahih', 'Sahih', "Da'if"])).toBe(false);
    expect(soundByAll(["Da'if", 'Hasan'])).toBe(false);
  });
});

describe('source by source', () => {
  it('al-Bukhārī and Muslim whole; five books graded hadith by hadith; nothing else offered', () => {
    expect([...SAHIH_BOOKS].sort()).toEqual(['bukhari', 'muslim']);
    expect([...GRADED_BOOKS].sort()).toEqual(['abudawud', 'ibnmajah', 'malik', 'nasai', 'tirmidhi']);
    expect([...ALL_BOOKS].sort()).toEqual([...SAHIH_BOOKS, ...GRADED_BOOKS].sort());
    // The two the page says are not offered.
    expect(ALL_BOOKS).not.toContain('ahmad');
    expect(ALL_BOOKS).not.toContain('darimi');
    expect(POLICY).toMatch(/Musnad Aḥmad, Sunan ad-Dārimī\*\* \| Not offered/);
  });
});

describe('where the rule is pointed at', () => {
  it('AGENTS.md sends a contributor to it before anything is added', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('docs/hadith-policy.md');
    expect(agents).toMatch(/No new set, book, language or source of hadith outside that\s+rule/);
  });

  it('Settings → About links it for a reader', () => {
    const about = read('src/screens/settings/pages/AttributionsSettingsScreen.tsx');
    expect(about).toContain("'https://github.com/MihrabHQ/Mihrab/blob/main/docs/hadith-policy.md'");
    expect(about).toMatch(/attributions\.hadithPolicy'[\s\S]{0,400}url: HADITH_POLICY_URL/);
  });
});
