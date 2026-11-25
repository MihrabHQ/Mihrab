/**
 * The transliterations were checked against the Arabic, every ayah
 * (tools/transliteration-check). Fourteen ayahs of the generated editions
 * and 113 of Abay's Turkish do not spell it; they are put right as they
 * are read, and nothing else is touched.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  TRANSLITERATION_CORRECTIONS,
  correctSurahTransliteration,
  correctTransliteration,
  transliterationCorrectionCount,
} from '../src/quran/transliterationCorrections';
import { QURAN_TRANSLITERATIONS } from '../src/quran/translations';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const GENERATED = QURAN_TRANSLITERATIONS.filter(e => e.source === 'quran-json').map(e => e.id);

describe('which ayahs', () => {
  it('the three generated editions are one text: the same fourteen ayahs in each', () => {
    expect(GENERATED.sort()).toEqual(['translit.en', 'translit.en-simple', 'translit.id-skb']);
    const ayahs = (id: string) => TRANSLITERATION_CORRECTIONS[id].map(c => `${c[0]}:${c[1]}`);
    for (const id of GENERATED) {
      expect(ayahs(id)).toEqual(ayahs('translit.en'));
      expect(transliterationCorrectionCount(id)).toBe(14);
    }
  });

  it('only the editions that were checked have a list', () => {
    expect(Object.keys(TRANSLITERATION_CORRECTIONS).sort()).toEqual([...GENERATED, 'tr.transliteration'].sort());
    expect(transliterationCorrectionCount('some.other')).toBe(0);
  });

  it('every correction changes something, and is not already in what it replaces', () => {
    for (const list of Object.values(TRANSLITERATION_CORRECTIONS)) {
      for (const [surah, ayah, from, to] of list) {
        expect(surah).toBeGreaterThanOrEqual(1);
        expect(surah).toBeLessThanOrEqual(114);
        expect(ayah).toBeGreaterThanOrEqual(1);
        expect(from).not.toBe(to);
        // Applied twice it must not change the ayah a second time.
        expect(to.includes(from)).toBe(false);
      }
    }
  });
});

describe('Abay’s Turkish', () => {
  const ABAY = TRANSLITERATION_CORRECTIONS['tr.transliteration'];
  const fix = (s: number, a: number, text: string) => correctTransliteration('tr.transliteration', s, a, text);

  it('113 ayahs, as the check counted them — ayahs, not places', () => {
    expect(transliterationCorrectionCount('tr.transliteration')).toBe(113);
    expect(ABAY.length).toBe(123);
    // In the order of the muṣḥaf.
    const order = ABAY.map(c => c[0] * 1000 + c[1]);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('is the list the check proved against the Arabic (tools/transliteration-check)', () => {
    const table = src('tools/transliteration-check/fixes_tr_table.py');
    const rows = [...table.matchAll(/\((\d+),(\d+),'((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'\)/g)].map(m => [
      Number(m[1]),
      Number(m[2]),
      m[3].replace(/\\'/g, "'"),
      m[4].replace(/\\'/g, "'"),
    ]);
    const key = (c: readonly (string | number)[]) => c.join('|');
    expect(rows.map(key).sort()).toEqual(ABAY.map(key).sort());
  });

  it('a letter: the emphatic the Arabic has, the article joined, the letter that was dropped', () => {
    expect(fix(24, 4, 'velleẕîne yermûne-lmuḥsenâti ŝümme lem ye\'tû')).toBe(
      'velleẕîne yermûne-lmuḥṣanâti ŝümme lem ye\'tû',
    );
    expect(fix(30, 30, 'feeḳim vecheke lildîni ḥanîfâ.')).toBe('feeḳim vecheke liddîni ḥanîfâ.');
    expect(fix(25, 41, 'ehâẕe-lleẕî be`aŝe-llâhü rasûâ.')).toBe('ehâẕe-lleẕî be`aŝe-llâhü rasûlâ.');
  });

  it('a word: Ḥafṣ’s plural, and the ayah’s own words in 29:46', () => {
    expect(fix(70, 33, 'velleẕîne hüm bişehâdetihim ḳâimûn.')).toBe('velleẕîne hüm bişehâdâtihim ḳâimûn.');
    expect(fix(29, 46, 'veünzile ileyküm veileyhâ veilâhüküm vâḥidüv')).toBe(
      'veünzile ileyküm veilâhünâ veilâhüküm vâḥidüv',
    );
  });

  it('several places in one ayah are each put right', () => {
    expect(
      fix(4, 25, 'ey yenkiḥa-lmuḥsenâti-lmü\'minâti … muḥṣanâtin gayra mesâfiḥâtiv velâ … mâ `ale-lmuḥsenâti mine-l`aẕâb.'),
    ).toBe('ey yenkiḥa-lmuḥṣanâti-lmü\'minâti … muḥṣanâtin gayra müsâfiḥâtiv velâ … mâ `ale-lmuḥṣanâti mine-l`aẕâb.');
  });

  it('his conventions are left as he wrote them: where he pauses, enâ, ûlî', () => {
    // Not in the list: a length the script shows and the reading does not.
    for (const [s, a] of [[3, 81], [2, 179], [18, 38], [60, 1]]) {
      expect(ABAY.some(c => c[0] === s && c[1] === a)).toBe(false);
    }
    expect(fix(3, 81, 'ḳâle feşhedû veenâ me`aküm mine-şşâhidîn.')).toBe('ḳâle feşhedû veenâ me`aküm mine-şşâhidîn.');
    // …nor an ayah where the check's own reading was the one at fault.
    expect(fix(25, 49, 'linuḥyiye bihî')).toBe('linuḥyiye bihî');
  });
});

describe('what the reader sees', () => {
  it('the word the Arabic has: yuḥyiya, nunjī, dhambin, ātāniya', () => {
    expect(correctTransliteration('translit.en', 75, 40, 'Alaysa dhālika biqādirin ʿalā ay yuḥyil-mawtā')).toBe(
      'Alaysa dhālika biqādirin ʿalā ay yuḥyiyal-mawtā',
    );
    expect(correctTransliteration('translit.id-skb', 21, 88, 'wakażālika nujil-mu\'minīn.')).toBe(
      'wakażālika nunjil-mu\'minīn.',
    );
    expect(correctTransliteration('translit.en-simple', 81, 9, "Bi'ayyi dhambim qutilat")).toBe(
      "Bi'ayyi dhambin qutilat",
    );
    expect(correctTransliteration('translit.en-simple', 27, 36, 'famaa aataanillaahu khayrum')).toBe(
      'famaa aataaniyallaahu khayrum',
    );
  });

  it('only that ayah, and only that edition', () => {
    const line = 'ʿalā ay yuḥyil-mawtā';
    expect(correctTransliteration('translit.en', 75, 39, line)).toBe(line);
    expect(correctTransliteration('translit.en', 2, 260, line)).toBe(line);
    expect(correctTransliteration('some.other', 75, 40, line)).toBe(line);
  });

  it('does nothing once the source has put the ayah right itself', () => {
    const fixed = 'Alaysa dhālika biqādirin ʿalā ay yuḥyiyal-mawtā';
    expect(correctTransliteration('translit.en', 75, 40, fixed)).toBe(fixed);
    expect(correctTransliteration('translit.en', 75, 40, '')).toBe('');
  });

  it('a surah’s rows: the listed ayah changed, the others the same strings, the input untouched', () => {
    const rows = { '8': "Bi'ayyi", '9': "Bi'ayyi dhambim qutilat", '10': 'Wa-idhaṣ-ṣuḥufu' };
    const out = correctSurahTransliteration('translit.en-simple', 81, rows);
    expect(out['9']).toBe("Bi'ayyi dhambin qutilat");
    expect(out['8']).toBe(rows['8']);
    expect(rows['9']).toBe("Bi'ayyi dhambim qutilat");
    // A surah with nothing listed comes back as it went in.
    expect(correctSurahTransliteration('translit.en-simple', 1, rows)).toBe(rows);
  });
});

describe('where it is applied, and said', () => {
  it('to what is read, not to what is stored', () => {
    const t = src('src/quran/transliteration.ts');
    expect(t).toMatch(/correctTransliteration\(edition\.id, surah, ayah, text\)/);
    expect(t).toMatch(/correctSurahTransliteration\(edition\.id, surah, rows\)/);
    expect(src('src/quran/surahStore.ts')).not.toMatch(/transliterationCorrections/);
    expect(src('scripts/mirror/build-mirror.js')).not.toMatch(/transliterationCorrections/);
  });

  it('the credits say the text was checked and how many ayahs were put right', () => {
    const a = src('src/screens/settings/pages/AttributionsSettingsScreen.tsx');
    expect(a).toMatch(/transliterationCorrectionCount\('translit\.en'\)/);
    expect(a).toMatch(/transliterationCorrectionCount\('tr\.transliteration'\)/);
    expect(a).not.toMatch(/uncorrected/);
    expect(a).not.toMatch(/shown as served/);
  });

  it('the sources are named where the app’s sources are named', () => {
    for (const f of ['README.md', 'NOTICE', 'docs/index.html', 'docs/sv/index.html']) {
      expect(src(f)).toMatch(/risan\/quran-json/);
      expect(src(f)).toMatch(/Muhammet Abay/);
    }
    const site = JSON.parse(src('scripts/site/strings.json'));
    for (const [lang, t] of Object.entries<any>(site)) {
      if (!t?.footer?.content?.p) continue;
      expect([lang, t.footer.content.p]).toEqual([lang, expect.stringMatching(/risan\/quran-json/)]);
      expect([lang, t.footer.content.p]).toEqual([lang, expect.stringMatching(/Muhammet Abay/)]);
    }
  });
});
