/**
 * Which of two grades a HadeethEnc entry carries outright: ṣaḥīḥ
 * (authentic) or ḥasan (good).
 *
 * By HadeethEnc's own Arabic grade. The translations word a grade a dozen
 * ways in each language ("Authentic", "Authentic hadith", "Sahih/Authentic
 * by virtue of corroborating evidence"…); the Arabic is nine times in ten
 * one of two words. The packs carry the answer as `q`
 * (`scripts/hadith/build-packs.js`, the same rule); this copy is for a
 * pack rebuilt from HadeethEnc itself (`origin.ts`).
 *
 * ── A TRANSLATION'S GRADE CAN BE AN OLDER ONE ──────────────────────────
 *
 * A translated entry carries the Arabic grade it was translated with
 * (`grade_ar`), and HadeethEnc has revised some Arabic entries since. On
 * 2026-11-25 the English entry 65065 said "Authentic hadith" / "صحيح"
 * where the Arabic entry said "ضعيف"; Spanish had eleven such, Chinese
 * four, Urdu three, Russian two, Hindi one. So a translated entry has a
 * class only where its own Arabic grade and the Arabic entry's grade
 * today say the same (`agreedGradeClass`); otherwise it is under
 * neither. That needs the Arabic entry, which the pack builder has and a
 * pack rebuilt on the device one language at a time does not — there
 * only the Arabic pack carries `q`, and the filter is not offered over
 * the others (`gradesKnown`, `library.ts`).
 *
 * The page of such an entry still shows the translation's own wording,
 * as HadeethEnc sends it: the app republishes it unmodified. That an
 * entry reads "Authentic" in English and "weak" in Arabic is the
 * source's to put right, not something to edit here; the builder prints
 * the ids each time, which is the list to send HadeethEnc.
 *
 * Read strictly, because the search offers it as a filter and a filter is
 * a claim the app makes about a hadith:
 *
 *   • A grade with a reservation is NEITHER — authentic "except" or
 *     "without" a phrase, authentic as a companion's own words (mawqūf),
 *     a grade of the chain only ("إسناده صحيح"), a grade someone is
 *     reported to have passed on, a note, or anything weak in it. Such an
 *     entry is found by every other search, and its row and its page show
 *     the grade as HadeethEnc words it.
 *   • Where an entry is several narrations and one is ḥasan, the entry is
 *     ḥasan: the lower of what it holds. So is "حسن صحيح".
 *   • Ṣaḥīḥ or ḥasan through its supporting chains ("صحيح لغيره", "حسن
 *     بشواهده") is ṣaḥīḥ or ḥasan: that is the grade, and how it was
 *     reached. The reader's page still shows the wording.
 *
 * Nothing is weighed here and no grade is the app's: this sorts
 * HadeethEnc's words, and says nothing where they are not plain.
 */
// grade-rule:start
const GRADE_RESERVED = /ضعيف|ضعف|موقوف|مدرج|ملحوظ|تنبيه|إسناد|سنده|رجال|نقل/;
const GRADE_RESERVING = ['إلا', 'دون', 'لكن', 'غير', 'سوى'];
const GRADE_HASAN = ['حسن', 'حسنه', 'حسنة', 'حسنان'];
const GRADE_SAHIH = ['صحيح', 'صحيحة', 'صحيحان', 'صححه'];
export function gradeClass(gradeAr: string | null | undefined): 0 | 1 | 2 {
  const g = String(gradeAr ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .trim();
  if (!g || GRADE_RESERVED.test(g)) return 0;
  const words = g.split(/[^\u0621-\u064A]+/).filter(Boolean);
  if (words.some(w => GRADE_RESERVING.includes(w))) return 0;
  if (words.some(w => GRADE_HASAN.includes(w))) return 2;
  return words.some(w => GRADE_SAHIH.includes(w)) ? 1 : 0;
}
// grade-rule:end

/** The class a translated entry carries: what its own Arabic grade and the Arabic entry's grade today both say. */
export function agreedGradeClass(gradeAr: string | null | undefined, currentAr: string | null | undefined): 0 | 1 | 2 {
  const q = gradeClass(gradeAr);
  return q && gradeClass(currentAr) === q ? q : 0;
}

export type GradeClass = 1 | 2;
/** The filter's two choices, and the key each is named by (`hadith.filter.*`). */
export const GRADE_CLASSES: ReadonlyArray<{ q: GradeClass; key: 'sahih' | 'hasan' }> = [
  { q: 1, key: 'sahih' },
  { q: 2, key: 'hasan' },
];
