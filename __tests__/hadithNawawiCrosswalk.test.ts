/**
 * Each of an-Nawawi's Forty is shown as the HadeethEnc entry the crosswalk
 * names (`src/hadith/nawawi40.json`) — title, translation, grade and
 * explanation all come from that entry. So the entry has to BE his hadith.
 *
 * Until 2026-11-25 no. 14 was not: "لا يحل دم امرئ مسلم إلا بإحدى ثلاث"
 * is Ibn Masʿūd's narration, agreed upon, and the crosswalk named
 * ʿĀʾishah's in an-Nasāʾī, which opens with the same words and lists a
 * different three. The app showed that one under "an-Nawawi's Forty · 14".
 *
 * The fixture holds both Arabic texts for every number, as the pack build
 * read them (`scripts/hadith/build-packs.js` writes it, and refuses to
 * write a crosswalk that fails this same check).
 */
import CROSSWALK from '../src/hadith/nawawi40.json';
import SETS from '../src/hadith/sets.json';
import FIXTURE from './fixtures/hadithNawawi.json';

const { MIN_OVERLAP, matnOverlap, mismatches } = require('../scripts/hadith/nawawi-check') as {
  MIN_OVERLAP: number;
  matnOverlap: (nawawi: string, henc: string) => number;
  mismatches: (
    cross: ReadonlyArray<{ n: number; henc: string | null }>,
    nawawi: ReadonlyArray<{ hadithnumber: number; text: string }>,
    arabicOf: (id: string) => string | undefined,
  ) => Array<{ n: number; henc: string; overlap: number }>;
};

const rows = FIXTURE.rows as Array<{ n: number; henc: string | null; nawawi: string; hencArabic: string }>;

/** ʿĀʾishah's narration in an-Nasāʾī (HadeethEnc 58194): what no. 14 was shown as. */
const AISHAH_NASAI =
  'عن عائشة رضي الله عنها قالت: قال رسول الله صلى الله عليه وسلم : "لا يَحِلّ دمُ امرئ مسلم، يشهد أن لا إله إلا الله، وأن محمدًا رسول الله، إلا بإحدى ثلاث: رجل زَنَى بَعْدَ إِحْصَان، فإنه يُرْجَم، ورجل خرج مُحاربًا لله ورسوله، فإنه يُقَتُل، أو يُصلَّبُ، أو يُنفى من الأرض، أو يَقتلَ نفسًا، فيُقتلُ بها".';

describe("an-Nawawi's Forty against HadeethEnc", () => {
  it('has the fixture for exactly the crosswalk the app ships', () => {
    expect(rows.map(r => [r.n, r.henc])).toEqual(CROSSWALK.map(c => [c.n, c.henc]));
    for (const r of rows) {
      expect(r.nawawi.length).toBeGreaterThan(20);
      if (r.henc) expect(r.hencArabic.length).toBeGreaterThan(20);
    }
  });

  it('shows every number as the same hadith, read whole', () => {
    const wrong = mismatches(
      CROSSWALK,
      rows.map(r => ({ hadithnumber: r.n, text: r.nawawi })),
      id => rows.find(r => r.henc === id)?.hencArabic,
    );
    expect(wrong).toEqual([]);
  });

  it('never gives two numbers the same entry', () => {
    const ids = CROSSWALK.map(c => c.henc).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows no. 14 as Ibn Masʿūd's narration, not ʿĀʾishah's", () => {
    const fourteen = rows.find(r => r.n === 14)!;
    expect(fourteen.henc).toBe('4714');
    expect((SETS.nawawiReviewed as Record<string, string>)['14']).toBe('4714');
    expect(fourteen.hencArabic).toContain('مَسعُودٍ');
    expect(matnOverlap(fourteen.nawawi, fourteen.hencArabic)).toBeGreaterThan(0.9);
  });

  it('tells a narration that only opens the same way from the one he chose', () => {
    const fourteen = rows.find(r => r.n === 14)!;
    expect(matnOverlap(fourteen.nawawi, AISHAH_NASAI)).toBeLessThan(MIN_OVERLAP);
    const wrong = mismatches(
      [{ n: 14, henc: '58194' }],
      [{ hadithnumber: 14, text: fourteen.nawawi }],
      () => AISHAH_NASAI,
    );
    expect(wrong).toHaveLength(1);
    expect(wrong[0].n).toBe(14);
  });

  it('lets a hand-reviewed entry win over the matcher, and checks it in the build', () => {
    const build = require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'hadith', 'build-packs.js'), 'utf8');
    expect(build).toContain('henc: reviewed ?? (best ? best.id : null)');
    expect(build).toContain('mismatches(cross, nawawi');
  });
});
