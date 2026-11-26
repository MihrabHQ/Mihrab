/**
 * Is this HadeethEnc entry the hadith an-Nawawi chose?
 *
 * The Forty are matched to HadeethEnc by their opening words, and six of
 * them by hand (`nawawiReviewed` in src/hadith/sets.json). Opening words
 * are not enough: no. 14, "لا يحل دم امرئ مسلم إلا بإحدى ثلاث", is Ibn
 * Masʿūd's narration in al-Bukhārī and Muslim, and HadeethEnc also holds
 * ʿĀʾishah's in an-Nasāʾī, which opens the same way and ends differently.
 * The second was shown under an-Nawawi's number until 2026-11-25.
 *
 * So every match is read again, whole: the words of HadeethEnc's Arabic
 * that an-Nawawi's text also has, as a share of HadeethEnc's. The same
 * hadith scores 0.79 and up across the forty-two (wording differs a
 * little between editions, and HadeethEnc sometimes carries the longer
 * version of the same narration); the wrong narration scored 0.43. The
 * build refuses anything under MIN_OVERLAP, and jest holds both.
 */
'use strict';

const MIN_OVERLAP = 0.7;

function foldArabic(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that say what a hadith is about: short particles left out. */
function contentWords(s) {
  return foldArabic(s)
    .split(' ')
    .filter(w => w.length > 2);
}

/** 0–1: how much of HadeethEnc's Arabic is in an-Nawawi's text. */
function matnOverlap(nawawiText, hencArabic) {
  const have = new Set(contentWords(nawawiText));
  const want = contentWords(hencArabic);
  if (!want.length) return 0;
  return want.filter(w => have.has(w)).length / want.length;
}

/**
 * The crosswalk's rows that are not the same hadith.
 * `arabicOf(id)` gives HadeethEnc's Arabic for an entry.
 */
function mismatches(crosswalk, nawawi, arabicOf) {
  const text = new Map(nawawi.map(h => [h.hadithnumber, h.text]));
  const out = [];
  for (const row of crosswalk) {
    if (!row.henc) continue;
    const overlap = matnOverlap(text.get(row.n) ?? '', arabicOf(row.henc) ?? '');
    if (overlap < MIN_OVERLAP) out.push({ n: row.n, henc: row.henc, overlap });
  }
  return out;
}

module.exports = { MIN_OVERLAP, foldArabic, contentWords, matnOverlap, mismatches };
