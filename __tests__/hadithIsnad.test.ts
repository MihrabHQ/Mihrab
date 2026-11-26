/**
 * The chain of narrators, folded (`src/hadith/isnad.ts`).
 *
 * What must hold: nothing of a hadith is lost or changed — chain and
 * report put together are the text; the report begins with the Companion;
 * and where the form is not plain there is no fold.
 */
import fs from 'fs';
import path from 'path';
import { splitIsnad } from '../src/hadith/isnad';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const S = 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ';

describe('where the chain ends', () => {
  it('begins the report with the Companion who hands it on from the Prophet ﷺ', () => {
    const t = `حَدَّثَنَا حَفْصُ بْنُ عُمَرَ قَالَ حَدَّثَنَا يَزِيدُ قَالَ حَدَّثَنَا قَتَادَةُ عَنْ أَنَسِ بْنِ مَالِكٍ عَنْ النَّبِيِّ ${S} قَالَ اعْتَدِلُوا فِي السُّجُودِ`;
    const s = splitIsnad(t)!;
    expect(s.report.startsWith('عَنْ أَنَسِ بْنِ مَالِكٍ عَنْ النَّبِيِّ')).toBe(true);
    expect(s.chain.endsWith('حَدَّثَنَا قَتَادَةُ')).toBe(true);
    expect(`${s.chain} ${s.report}`).toBe(t);
  });

  it('keeps the Companion where the telling is his own words about the Prophet ﷺ', () => {
    const t = `حَدَّثَنِي مُحَمَّدٌ حَدَّثَنَا سُرَيْجٌ حَدَّثَنَا فُلَيْحٌ عَنْ نَافِعٍ عَنْ ابْنِ عُمَرَ رَضِيَ اللَّهُ عَنْهُمَا قَالَ سَعَى النَّبِيُّ ${S} ثَلَاثَةَ أَشْوَاطٍ`;
    expect(splitIsnad(t)!.report.startsWith('عَنْ ابْنِ عُمَرَ')).toBe(true);
  });

  it('reads "سمعت" as it reads "عن", and steps over the "سمعت" that is the Companion hearing him', () => {
    const t = `حَدَّثَنَا الْحُمَيْدِيُّ قَالَ حَدَّثَنَا سُفْيَانُ قَالَ أَخْبَرَنِي مُحَمَّدٌ أَنَّهُ سَمِعَ عَلْقَمَةَ يَقُولُ سَمِعْتُ عُمَرَ بْنَ الْخَطَّابِ رَضِيَ اللَّهُ عَنْهُ عَلَى الْمِنْبَرِ قَالَ سَمِعْتُ رَسُولَ اللَّهِ ${S} يَقُولُ إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ`;
    expect(splitIsnad(t)!.report.startsWith('سَمِعْتُ عُمَرَ بْنَ الْخَطَّابِ')).toBe(true);
  });

  it('does not leave the Companion in the chain when her telling opens with "أنّ"', () => {
    const t = `حَدَّثَنَا عَبْدُ اللَّهِ عَنْ مَالِكٍ عَنْ هِشَامٍ عَنْ أَبِيهِ عَنْ عَائِشَةَ رَضِيَ اللَّهُ عَنْهَا أَنَّ قُرَيْشًا كَانَتْ تَصُومُ عَاشُورَاءَ ثُمَّ أَمَرَ رَسُولُ اللَّهِ ${S} بِصِيَامِهِ`;
    expect(splitIsnad(t)!.report.startsWith('عَنْ عَائِشَةَ رَضِيَ اللَّهُ عَنْهَا أَنَّ قُرَيْشًا')).toBe(true);
  });

  it('does not fold what it cannot read plainly', () => {
    // No blessing to find: a Companion's own words.
    expect(splitIsnad('حَدَّثَنَا يَحْيَى عَنْ مَالِكٍ عَنْ نَافِعٍ أَنَّ عَبْدَ اللَّهِ بْنَ عُمَرَ كَانَ يَقُولُ كَذَا')).toBeNull();
    // Nothing handed on before him.
    expect(splitIsnad(`قَالَ رَسُولُ اللَّهِ ${S} كَذَا`)).toBeNull();
    // A chain too short to be worth folding.
    expect(splitIsnad(`حَدَّثَنَا مَالِكٌ عَنْ أَنَسٍ عَنْ النَّبِيِّ ${S} قَالَ كَذَا`)).toBeNull();
    expect(splitIsnad('')).toBeNull();
  });

  it('loses nothing of any hadith in the books that are built here', () => {
    const dir = path.join(__dirname, '..', 'build', 'hadith', 'v1', 'books');
    if (!fs.existsSync(dir)) return; // packs are not built on CI
    for (const f of fs.readdirSync(dir)) {
      const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).hadiths as [number, string][];
      let folded = 0;
      for (const r of rows) {
        const s = splitIsnad(r[1]);
        if (!s) continue;
        folded++;
        if (`${s.chain} ${s.report}` !== r[1] && s.chain + r[1].slice(s.chain.length, r[1].length - s.report.length) + s.report !== r[1]) throw new Error(`${f} ${r[0]}: the halves are not the text`);
        expect(s.report.length).toBeGreaterThan(0);
      }
      expect([f, folded > rows.length / 2]).toEqual([f, true]);
    }
  });
});

describe('in the reader', () => {
  const src = read('src/screens/hadith/HadithReaderScreen.tsx');
  it('folds only a book\'s hadith, says where the chain is from, and shares the whole text', () => {
    expect(src).toContain("item?.source === 'book' && item.arabic ? splitIsnad(item.arabic) : null");
    expect(src).toContain("t('hadith.isnad.note'");
    // What is copied, shared or made a picture of is the hadith whole.
    expect(src).toContain('const parts = [item.arabic];');
    expect(src).toContain('arabic={item.arabic}');
  });
  it('says so in every language', () => {
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'src/i18n/locales'))) {
      const k = JSON.parse(read(`src/i18n/locales/${f}`)).hadith.isnad;
      expect([f, Object.keys(k).sort()]).toEqual([f, ['hide', 'note', 'show']]);
      expect(k.note).toContain('{{book}}');
      expect(k.note).toContain('Open-Hadith-Data');
    }
  });
});
