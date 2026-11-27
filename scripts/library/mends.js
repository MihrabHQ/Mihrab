/**
 * Words a transcription broke, put back together.
 *
 * A Library book is its author's text, and what is published here is a
 * transcription of it: typed or converted by others, with the slips that
 * leaves. One kind can be mended without anyone's judgement of the text
 * standing in for the author's: a word the conversion cut in two with a
 * space ("قا ل", "ر سول الله", "جبي ر"), and an آ it wrote as an alif and
 * a space ("الذين ا منوا"). The maintainer's ruling (2026-11-27): those are
 * joined; nothing else is touched. We have no reader to proof a whole
 * book, so the rest is the source's, as its licence line says.
 *
 * So this is a list, not a rule. A lone letter is often right — "فِ لي
 * بشرطي", the "ب" a commentary sets before its matn, a verse cut across
 * its halves — and a rule that joined every one would write words no
 * author wrote. Each entry is a place that was read, with the words
 * around it, and how many times it must be found: the build stops when a
 * source has changed under it. A slip that would need a letter ADDED
 * ("الوليد ن عبد الملك") is not a join, and is left.
 *
 * `[from, to, count]`: `from` is the words as the transcription has them
 * (a string, or a pattern with the `g` flag), `to` what they become.
 */
const A = '(?<=^| )'; // a word's beginning
const Z = '(?= |$)'; // …and its end

const MENDS = {
  tibyan: [
    [new RegExp(`${A}(ف|و|ي)?قا ل${Z}`, 'g'), '$1قال', 17],
    ['التابعين ك عبد الرحمن', 'التابعين كعبد الرحمن', 1],
    ['حم فا ن العلماء', 'حم فان العلماء', 1],
    ['لا تبط ل لأن', 'لا تبطل لأن', 1],
    ['غيره ف ينبغي', 'غيره فينبغي', 1],
    ['عذا ب النار', 'عذاب النار', 1],
    ['سور ة البقرة', 'سورة البقرة', 1],
    ['جبي ر وأحمد', 'جبير وأحمد', 1],
    ['في أو ل الكتاب', 'في أول الكتاب', 1],
  ],
  abushuja: [['خير منزو ل به', 'خير منزول به', 1]],
  bidaya: [['ولا ت طول أملك', 'ولا تطول أملك', 1]],
  bahja: [
    ['لرسو ل الله', 'لرسول الله', 1],
    [new RegExp(`${A}ر سول الله`, 'g'), 'رسول الله', 7],
  ],
  ighatha: [
    // The madda: "آمنوا", "آلهتكم", "آذوا", "آفة", "آخرهم", "آدر", "آثر".
    [new RegExp(`${A}ا (?=(?:منوا|لهتكم|لهة|ذوا|ذاه|فة|خرهم|در|ثر)${Z})`, 'g'), 'آ', 23],
    ['فا ذاه من', 'فآذاه من', 1],
    ['فإ ن الجهل', 'فإن الجهل', 1],
    ['الشيطان ف إنه', 'الشيطان فإنه', 1],
  ],
  iqd: [
    ['لها؛ ف إن الله', 'لها؛ فإن الله', 1],
    ['بالإثم ل قد ضللت', 'بالإثم لقد ضللت', 1],
    ['الله، ف إنه لا', 'الله، فإنه لا', 1],
    ['بعد؛ ف إن الله', 'بعد؛ فإن الله', 1],
    ['دخله ز هو شديد', 'دخله زهو شديد', 1],
  ],
};

/** The pack with its book's mends made. Stops when one is not found as many times as it was read. */
function mend(pack, list, where = pack.id) {
  if (!list || !list.length) return pack;
  const found = list.map(() => 0);
  const fix = s => {
    let out = s;
    list.forEach(([from, to], i) => {
      if (typeof from === 'string') {
        const parts = out.split(from);
        found[i] += parts.length - 1;
        out = parts.join(to);
      } else {
        out = out.replace(from, (...m) => {
          found[i] += 1;
          return to.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');
        });
      }
    });
    return out;
  };
  const chapters = pack.chapters.map(c => ({
    ...c,
    b: c.b.map(b => (typeof b === 'string' ? fix(b) : b.h != null ? { ...b, h: fix(b.h) } : { ...b, v: b.v.map(fix) })),
  }));
  list.forEach(([from, , count], i) => {
    if (found[i] !== count) throw new Error(`${where}: "${from}" was to be mended ${count} time(s) and was found ${found[i]}`);
  });
  return { ...pack, chapters };
}

module.exports = { MENDS, mend };
