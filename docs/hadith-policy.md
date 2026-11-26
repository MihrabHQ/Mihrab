# Which hadith Mihrab serves

The rule, in one sentence:

> **A hadith is in the app only when a named grader calls it ṣaḥīḥ or
> ḥasan, and no grader the app cites calls it weak.**

Set by the maintainer on 2026-11-25 and confirmed on 2026-11-26, with the
clause for compilations added that day (§1). Mihrab
grades nothing itself: it sorts what its sources say, shows each grade in
the source's own words with the grader's name, and leaves out what does
not pass. This page is the rule; the code named beside each part is what
enforces it, and a test holds the two together
(`__tests__/hadithPolicy.test.ts`).

## 1. What is accepted

- **Ṣaḥīḥ** (authentic) and **ḥasan** (good), including where the grade
  was reached through supporting chains ("صحيح لغيره", "حسن بشواهده").
  Ḥasan is sound: it is served on the same footing as ṣaḥīḥ, and shown as
  what it is.
- A grade of the chain ("إسناده صحيح"), or of a report as a Companion's
  own words (mawqūf), is a sound grade and is served. It is shown in the
  source's words, and is not listed under the search's "ṣaḥīḥ" or "ḥasan"
  filters, which hold only what is graded so outright (`gradeClass`,
  `src/hadith/grade.ts`).

### A compilation: by its compiler's own attribution

Added by the maintainer on 2026-11-26. The books people read most —
Riyāḍ aṣ-Ṣāliḥīn, ʿUmdat al-Aḥkām, Bulūgh al-Marām — are not graded
hadith by hadith in any open dataset. They do not need to be: their
compilers say, of each hadith, which book it is from.

> **A hadith in a compilation is served when its compiler attributes it
> to al-Bukhārī or to Muslim, or to one of the five graded books and the
> row it is there passes the rule above.**

- The attribution is the **compiler's**, in his words ("متفق عليه",
  "رواه مسلم", "رواه أبو داود والترمذي"). The app does not decide where a
  hadith is from.
- What is served is **the app's own row** of that hadith in the book
  named — the text and the grade it already carries. The compilation's
  text is read only to find that row and is never republished, so where a
  compiler shortened a hadith the reader has the narration whole.
- A hadith is left out when the compiler attributes it to a book the app
  does not grade (Aḥmad, al-Ḥākim, al-Bayhaqī…), when its row in a graded
  book does not pass, or **when its row cannot be found with
  confidence** — the same caution as for the grades of the Sunan: wrong
  the other way would put one hadith under another's name.
- Where the compiler names several books, one that passes is enough: the
  hadith is served from that book. A compiler's own remark that a hadith
  is weak leaves it out whatever he attributes it to.
- This is **not** matching by wording alone. A hadith of Musnad Aḥmad
  that reads like one of al-Bukhārī's is not thereby al-Bukhārī's: the
  chain is another, and nobody has said so. Only a compiler's stated
  attribution carries a grade across.
- A compilation's list says how many of the book's hadith it holds and
  how many it leaves out.

## 2. What is refused

- **Anything a grader calls weak**, in whatever word: ḍaʿīf, munkar,
  shādh, mawḍūʿ, bāṭil, mursal, muʿallal, "not established". A grade that
  holds a weak word anywhere in it is weak ("Shadh, Sahih").
- **Anything without a grade.** Ungraded is not "probably fine": it is
  not served.
- **Anything the graders disagree on.** One grader calling a hadith weak
  leaves it out, whatever the others say.

### Why "every grader", and not "most" or "any"

This is the one place the rule is stricter than "better than weak, by
someone trustworthy", and it is deliberate:

- Under **"any grader says sound"** the app would show hadith that a
  grader it names calls weak. Each would need both verdicts set out, and
  a reader would have to weigh them.
- Under **"most graders"** the count moved by hundreds with whether an
  edition's editor counts as a grader, and several hundred ties needed a
  ruling of the app's own. Mihrab is not a grader and makes no such
  ruling.
- Under **"every grader who ruled"** neither question arises, and what
  the app says of a book — *nothing in it is called weak by any grader it
  cites* — is a sentence a test can hold.

The hadith this leaves out are still in the printed books. Admitting them
would be a change to this page first, with how each disagreement is shown
decided before any is served.

## 3. Source by source

| Source | What is served | By what |
|---|---|---|
| **HadeethEnc** (the sets, the topics, an-Nawawi's Forty in translation) | Every entry its Arabic grade calls sound and nowhere weak | `servedGrade`, `src/hadith/grade.ts`; the ids left out on the day the packs were built are `src/hadith/withheld.json` |
| **Ṣaḥīḥ al-Bukhārī, Ṣaḥīḥ Muslim** | Whole | The standing of the collections. They are not graded hadith by hadith in any open dataset, and a hadith's page says exactly that — it does not show a grade of ours |
| **Sunan Abī Dāwūd, Jāmiʿ at-Tirmidhī, Sunan an-Nasāʾī, Sunan Ibn Mājah, the Muwaṭṭaʾ** | Only the hadith every grader who ruled calls ṣaḥīḥ or ḥasan — and at least one did | `scripts/hadith/book-grades.js` (the build), `src/hadith/bookGrades.ts` (the app reads every row again and refuses a pack with one that does not pass) |
| **Musnad Aḥmad, Sunan ad-Dārimī** | Not offered | No open dataset grades them. They come back when one does |

**"Agreed upon"** (Look up, above the books) is not a further source: it
is the HadeethEnc entries whose Arabic attribution is "متفق عليه" and
nothing else, and whose Arabic grade is "صحيح" and nothing else
(`scripts/hadith/agreed-list.js` writes `src/hadith/agreed.json`). An
entry attributed with any qualification is served in its topics and in
search, and is not on that list.

Two details that follow from the rule:

- **A translation is judged by the Arabic entry's grade as it stands
  today.** A translated HadeethEnc entry carries the grade it was
  translated with, and HadeethEnc has revised some Arabic entries since.
- **A text that cannot be matched to its grade with confidence is left
  out.** The books' text and their grades come from two datasets that are
  different editions; a row is served only when the pairing is sure.
  Wrong the other way would put a weak hadith under a sound one's grade.

How many hadith each rule keeps and leaves out is printed by the builder
(`scripts/hadith/build-packs.js`) and recorded in `CHANGELOG.md` when it
changes. No count is typed here.

## 4. What the app says

- A grade is always **someone's**: "graded ṣaḥīḥ by …", in the source's
  wording. The app never calls a hadith authentic in its own voice.
- Nothing is called "official", "the only" or "the first".
- Texts are republished **unmodified**. Leaving an entry out changes
  nothing in the ones that are served.

## 5. What this rule does not claim

- **The grades are as the datasets record them.** The grades of the four
  Sunan and the Muwaṭṭaʾ are fawazahmed0/hadith-api's record of what its
  named graders ruled; nobody here has checked them against the printed
  works.
- **Who counts as a grader is the sources' choice**, not a judgement made
  here. The list has not been reviewed by a scholar of hadith; that
  review is wanted, and a reader can report a hadith from its page
  ("Report a problem with this hadith").
- The rule decides what is **served**, not what is true of a hadith. A
  hadith left out is not thereby called weak by Mihrab.

## 6. Changing anything

- A new source, set, book or language of hadith is added **only under
  this rule**: a named grader, a sound grade, nobody cited calling it
  weak — or the whole of al-Bukhārī or Muslim — or, in a compilation, its
  compiler's attribution to one of those.
- A change to the rule itself is the maintainer's decision. It is made on
  this page first, then in `grade.ts` / `bookGrades.ts` /
  `book-grades.js` and their tests, with a line in `CHANGELOG.md` saying
  what readers will and will not see.
