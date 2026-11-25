/**
 * Which hadith of a book are served, and the grades each carries.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────
 *
 * A hadith of the Sunan or of the Muwaṭṭaʾ is in its pack only when
 * EVERY grader who ruled on it calls it ṣaḥīḥ or ḥasan — and at least one
 * did. One grader calling it weak leaves it out; so does having no grade.
 * The maintainer's rule (2026-11-25): the app does not serve a hadith that
 * is weak, disputed or ungraded.
 *
 * Not "most graders": under a majority the count moved by three hundred
 * with whether an edition's editor counts as a grader, and 477 ties needed
 * a ruling of ours. Under this rule neither question arises, and what the
 * app says of a book — nothing in it is called weak by any grader it
 * cites — is a sentence a test can hold.
 *
 * ── WHERE THE GRADES COME FROM ─────────────────────────────────────────
 *
 * Open-Hadith-Data, whose text the packs carry, has no grades.
 * fawazahmed0/hadith-api records, for each hadith of these five books,
 * what three or four named graders ruled (one for the Muwaṭṭaʾ). ONLY its
 * `grades` are taken into a pack: a grader's name and his verdict, as it
 * writes them. Its Arabic text is read here to find which of our rows a
 * grade belongs to and is never written anywhere; its translations are
 * never read at all (build-packs.js has why).
 *
 * The grades are as that dataset records them. Nobody here has checked
 * them against the printed works.
 *
 * ── TWO EDITIONS, ONE HADITH ───────────────────────────────────────────
 *
 * The two datasets are different editions of each book: the numbering
 * drifts, one splits what the other joins, one keeps the compiler's remark
 * after a hadith and the other does not. A row of ours is paired with the
 * row of theirs that shares its words (`pairRows`), and a row that cannot
 * be paired with confidence is LEFT OUT — it is ungraded as far as we can
 * tell. Wrong the other way would put a weak hadith in a pack under a
 * sound one's grade, which is the one mistake this file must not make:
 *
 *   • the same words, four fifths of them or more — or a little under
 *     that when one text is the other plus a remark;
 *   • nothing else in the book nearly as close, unless that other row is
 *     sound by every grader as well (the same hadith by a second chain:
 *     whichever it is, the answer is the same);
 *   • one row of theirs grades one row of ours;
 *   • and where a row of ours is two of theirs run together — a hadith
 *     and the narration after it, "حدثنا … بهذا الحديث" — both have to
 *     be sound, because the row is served whole.
 */
'use strict';

/** The five books that are graded hadith by hadith, and hadith-api's edition of each. */
const GRADED_BOOKS = {
  abudawud: 'ara-abudawud',
  tirmidhi: 'ara-tirmidhi',
  nasai: 'ara-nasai',
  ibnmajah: 'ara-ibnmajah',
  malik: 'ara-malik',
};

const HADITH_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const gradesUrl = book => `${HADITH_API}/${GRADED_BOOKS[book]}.min.json`;

/**
 * What a grade says of a hadith: weak, sound, or nothing either way
 * ("Maqtu", "-"). The words are hadith-api's, transliterated as it writes
 * them. Anything weak in a grade makes it weak ("Shadh, Sahih", "Mursal
 * Sahih Isnaad"): read strictly, like every grade here.
 *
 * The same rule as `bookGradeVerdict` in src/hadith/bookGrades.ts, where
 * the app refuses a pack with a row that does not pass it
 * (__tests__/hadithBookGrades.test.ts holds the two together).
 */
// book-grade-rule:start
const GRADE_WEAK = /da.?if|munkar|shadh|mawdu|batil|malool|mursal/i;
const GRADE_SOUND = /sahih|hasan/i;
function bookGradeVerdict(grade) {
  const g = String(grade ?? '');
  if (GRADE_WEAK.test(g)) return 'weak';
  return GRADE_SOUND.test(g) ? 'sound' : null;
}
/** Sound by every grader who ruled, and at least one did. */
function soundByAll(grades) {
  let sound = 0;
  for (const g of grades) {
    const v = bookGradeVerdict(g);
    if (v === 'weak') return false;
    if (v === 'sound') sound++;
  }
  return sound > 0;
}
// book-grade-rule:end

// ── Pairing the two editions ───────────────────────────────────────────

/** A text's words, unvowelled and with their letter variants made one. */
function wordsOf(text) {
  const s = String(text ?? '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  return new Set(s.match(/[\u0621-\u064A]+/g) ?? []);
}

function shared(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}
/** The words two texts share, of all the words either has: 0–1. */
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  const n = shared(a, b);
  return n / (a.size + b.size - n);
}
/** The words two texts share, of the shorter one's: 1 when one text is inside the other. */
function within(a, b) {
  if (!a.size || !b.size) return 0;
  return shared(a, b) / Math.min(a.size, b.size);
}

/** The same hadith in both editions. */
const SAME = 0.8;
/** The same hadith, where one edition's row is the other's and a remark besides… */
const SAME_WITH_REMARK = 0.6;
/** …which is to say the shorter text is in the longer one. */
const INSIDE = 0.9;
/** How much closer than any other row the pair has to be, for that other row not to be asked. */
const CLEAR_OF = 0.15;
/** A book is in the same order in both editions: this far behind and ahead of the last pair is looked at first. */
const BEHIND = 80;
const AHEAD = 200;
/** A word in more rows than this says nothing about which row it is. */
const COMMON = 40;
/** The rows sharing the most uncommon words, looked at beside the neighbours. */
const ELSEWHERE = 40;
/** A row of ours may run on into the rows of theirs this near its pair. */
const RUN_ON = 3;
/** What a neighbour has to add to the pair, in words, to be a text of its own… */
const ADDS = 3;
/** …and how much of that has to be in our row for the row to hold it too. */
const HOLDS = 0.8;

/** The rows of theirs beside `at` whose own words — those `at` does not have — are in `mine` as well. */
function runsOnInto(mine, their, at) {
  const out = [];
  for (let j = Math.max(0, at - RUN_ON); j <= Math.min(their.length - 1, at + RUN_ON); j++) {
    if (j === at) continue;
    let adds = 0;
    let held = 0;
    for (const w of their[j]) {
      if (their[at].has(w)) continue;
      adds++;
      if (mine.has(w)) held++;
    }
    if (adds >= ADDS && held / adds >= HOLDS) out.push(j);
  }
  return out;
}

/**
 * For each row of ours, the row of theirs it is — or null.
 *
 * `rival` is the next closest row of theirs when it is close enough to
 * have been the one (`CLEAR_OF`): the caller asks it too, and takes the
 * pair only when both say the same. `also` is the rows of theirs our row
 * holds besides (`runsOnInto`).
 *
 * @param {string[]} ours
 * @param {string[]} theirs
 * @returns {Array<{ at: number, score: number, rival: number | null, also: number[] } | null>}
 */
function pairRows(ours, theirs) {
  const their = theirs.map(wordsOf);
  const seenIn = new Map();
  for (const s of their) for (const w of s) seenIn.set(w, (seenIn.get(w) ?? 0) + 1);
  const rowsWith = new Map();
  their.forEach((s, j) => {
    for (const w of s) {
      if (seenIn.get(w) > COMMON) continue;
      if (!rowsWith.has(w)) rowsWith.set(w, []);
      rowsWith.get(w).push(j);
    }
  });

  let last = 0;
  const pairs = ours.map(text => {
    const mine = wordsOf(text);
    if (!mine.size) return null;
    const candidates = new Set();
    for (let j = Math.max(0, last - BEHIND); j < Math.min(their.length, last + AHEAD); j++) candidates.add(j);
    const votes = new Map();
    for (const w of mine) for (const j of rowsWith.get(w) ?? []) votes.set(j, (votes.get(j) ?? 0) + 1);
    [...votes.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, ELSEWHERE)
      .forEach(([j]) => candidates.add(j));

    let best = -1;
    let bestScore = 0;
    let next = -1;
    let nextScore = 0;
    for (const j of [...candidates].sort((a, b) => a - b)) {
      const s = overlap(mine, their[j]);
      if (s > bestScore) {
        next = best;
        nextScore = bestScore;
        best = j;
        bestScore = s;
      } else if (s > nextScore) {
        next = j;
        nextScore = s;
      }
    }
    if (best < 0) return null;
    const same =
      bestScore >= SAME || (bestScore >= SAME_WITH_REMARK && within(mine, their[best]) >= INSIDE);
    if (!same) return null;
    last = best;
    return {
      at: best,
      score: bestScore,
      rival: next >= 0 && bestScore - nextScore < CLEAR_OF ? next : null,
      also: runsOnInto(mine, their, best),
    };
  });

  // One row of theirs grades one row of ours: the closest.
  const taken = new Map();
  pairs.forEach((p, i) => {
    if (!p) return;
    const held = taken.get(p.at);
    if (held == null || pairs[held].score < p.score) taken.set(p.at, i);
  });
  return pairs.map((p, i) => (p && taken.get(p.at) === i ? p : null));
}

/**
 * A book's rows as its pack keeps them, and what was left out and why.
 *
 * A kept row is `[number, text, i, grades]`: `i` is its place in
 * Open-Hadith-Data's file, which is what the app's ids are made of
 * (`b:<book>:<i>`) — so a bookmark stays on its hadith when the next build
 * keeps a row this one left out. `grades` is `[grader, grade]` pairs,
 * `grader` an index into the file's `graders`.
 *
 * @param {Array<[number | null, string]>} hadiths  Open-Hadith-Data's rows
 * @param {Array<{ text: string, grades?: Array<{ name: string, grade: string }> }>} api  hadith-api's
 */
function gradeBook(hadiths, api) {
  const graders = [];
  const graderIndex = name => {
    let i = graders.indexOf(name);
    if (i < 0) i = graders.push(name) - 1;
    return i;
  };
  const gradesAt = j => (api[j].grades ?? []).filter(g => g && g.name && String(g.grade ?? '').trim());
  const sound = j => soundByAll(gradesAt(j).map(g => g.grade));

  const pairs = pairRows(
    hadiths.map(h => h[1]),
    api.map(h => h.text),
  );
  const left = { weak: 0, disputed: 0, ungraded: 0, unpaired: 0, joined: 0 };
  const rows = [];
  hadiths.forEach((h, i) => {
    const p = pairs[i];
    if (!p) return void left.unpaired++;
    const verdicts = gradesAt(p.at).map(g => bookGradeVerdict(g.grade));
    const weak = verdicts.filter(v => v === 'weak').length;
    const good = verdicts.filter(v => v === 'sound').length;
    if (!weak && !good) return void left.ungraded++;
    if (weak) return void (good ? left.disputed++ : left.weak++);
    // Sound — and so must be the row it might have been instead.
    if (p.rival != null && !sound(p.rival)) return void left.unpaired++;
    // And every hadith the row holds besides.
    if (!p.also.every(sound)) return void left.joined++;
    rows.push([h[0], h[1], i, gradesAt(p.at).map(g => [graderIndex(g.name), String(g.grade).trim()])]);
  });
  return { rows, graders, left, of: hadiths.length };
}

module.exports = {
  GRADED_BOOKS,
  gradesUrl,
  bookGradeVerdict,
  soundByAll,
  wordsOf,
  overlap,
  within,
  pairRows,
  gradeBook,
};
