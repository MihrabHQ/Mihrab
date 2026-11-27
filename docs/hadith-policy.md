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
- **A pairing a person has read and signed stands as found.** The
  measure falls short of some hadith that are plainly in the book their
  compiler names: he words one narration, the book holds another. The
  maintainer may sign such a pairing — the compilation's number, the
  book, the row, the words the row must hold, who decided and when and
  why — in `scripts/hadith/signed-pairings.json`. A signature never goes
  outside the compiler's attribution and never to a row the app does not
  serve, and the builder refuses one that does, or whose row no longer
  holds the words signed for. Added by the maintainer on 2026-11-26, for
  the first hadith of Riyāḍ aṣ-Ṣāliḥīn; the list is short on purpose,
  and the bar for everything else is where it was.
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
| **Riyāḍ aṣ-Ṣāliḥīn** (a compilation, §1) | The hadith an-Nawawī attributes to a book the app serves, each as that book's own row — in the five graded books, only a row every grader calls sound — or the HadeethEnc entry that is the same hadith, for its translation. One he himself calls weak is left out | `scripts/hadith/build-compilation.js` writes `src/hadith/compilations/riyad.json`: his number, the book, the row |
| **ʿUmdat al-Aḥkām** (a compilation, §1) | Its compiler's condition is that every hadith is in al-Bukhārī and Muslim both: each is served as the row of one of the two that has its words, or as its HadeethEnc entry | The same script; `src/hadith/compilations/umdah.json` |
| **al-Kalim aṭ-Ṭayyib** (a compilation, §1) | The supplications Ibn Taymiyyah attributes to a book the app serves, each as that book's row | The same script; `src/hadith/compilations/kalim.json` |
| **al-Adhkār** (a compilation, §1) | The reports an-Nawawī leads with the book they are from ("روينا في صحيح مسلم عن…") where that is a book the app serves, each as that book's row. One he calls weak is left out; one he gives to "the same book" or to Ibn as-Sunnī is not read | The same script (`attributionLed`); `src/hadith/compilations/adhkar.json`. Input: OpenITI's transcription, read and never republished |
| **al-Wābil aṣ-Ṣayyib** (a compilation, §1) | The hadith Ibn al-Qayyim attributes to a book the app serves, each as that book's row; read as al-Kalim aṭ-Ṭayyib is | The same script; `src/hadith/compilations/wabil.json` |
| **Bulūgh al-Marām** (a compilation, §1; added at the maintainer's request, 2026-11-26) | The hadith Ibn Ḥajar attributes to a book the app serves, each as that book's row. His shorthand is read as his preface defines it ("السبعة", "الستة": the six; "الخمسة", "الأربعة": the four Sunan; "الثلاثة": Abū Dāwūd, at-Tirmidhī, an-Nasāʾī; "متفق عليه": the two Ṣaḥīḥs; Aḥmad, whom he counts in two of these, is not a book the app serves), "إلا" and "سوى" take a book out, and a wording he gives as another book's ("وللبخاري: …") is that book's. A hadith he reports as found wanting — by him or by an imam he quotes ("وضعفه أبو حاتم", "وإسناده ضعيف", "ورجح إرساله", "معلول") — is left out | The same script (`attributionBulugh`, `weakBulugh`); `src/hadith/compilations/bulugh.json`. Input: OpenITI's transcription, read and never republished |
| **Kitāb at-Tawḥīd** (a compilation, §1; the maintainer's decision of 2026-11-26 to include it) | The hadith Muḥammad ibn ʿAbd al-Wahhāb attributes to a book the app serves — after the report ("أخرجاه", "رواه مسلم") or before it ("وفي الصحيح", "ولهما", "ولمسلم") — each as that book's row. His own points at each chapter's end are not read, and nothing of his text is shown | The same script (`attributionTawhid`); `src/hadith/compilations/tawhid.json` |
| **Hadith Qudsi** (a list of the app's own, §1) | The hadith qudsi that hadith-api's edition of a modern selection of forty attributes first to al-Bukhārī or to Muslim, each as that book's row. Not presented as that selection, and unnumbered | The same script; `src/hadith/compilations/qudsi.json` |
| **Ibn Rajab's eight additions to the Forty** (a compilation, §1) | Of the eight hadith he adds in Jāmiʿ al-ʿUlūm wa-l-Ḥikam (nos. 43 to 50), the seven he attributes to a book the app serves, each as that book's row or its HadeethEnc entry. No. 50 he gives to Aḥmad "in these words", and it is left out | The same script; `src/hadith/compilations/rajab.json` |
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

## 6. The Library: a book is its author's text

*The maintainer's decision of 2026-11-26, widened on 2026-11-27 (mended
words, books in other languages, works a publisher gives leave to pass on).*

The Hadith tab's Library holds whole books to read — Ibn al-Qayyim's
*Ighāthat al-Lahfān*, *Kalīla wa-Dimna*, al-Hamadhānī's *Maqāmāt*. A book
there is **not hadith served by this rule**:

- It is its author's text, **whole and unmodified**, in his order. What
  he quotes he quotes on his own authority, and a classical book quotes
  hadith of every grade. Mihrab grades none of it and removes none of it.
- **What is published is a transcription, and one kind of slip in it is
  mended:** a word the conversion cut in two with a space, and an آ it
  wrote as an alif and a space. Each place is read and listed with how
  often it must be found (`scripts/library/mends.js`) — a list, never a
  rule, because a lone letter is often the author's. What is not the
  author's at all (a printer's title page, a footnote's mark, the
  conversion's own marks) is left out by name. Nothing else is touched: a
  slip that would need a letter added, or a reading chosen, stays as the
  source has it.
- The book's page says so, in the reader's language, before its chapters:
  the hadith in it are not graded by Mihrab and may include weak reports,
  and graded hadith are in Learn and Look up.
- **Nothing of a book leaves the book.** Its text is not searched with the
  hadith, is not a topic, a set, a compilation or the hadith of the day,
  and is never shown with a grade or beside one.
- A book is included where its author's work is in the public domain
  everywhere the app ships and the edition read may be republished; its
  page names the source and the licence (`scripts/library/build-library.js`).
- **Or where its publisher gives leave to pass it on.** A modern work, or a
  translation, may be included when the publisher states in public that it
  may be republished, and then only on the publisher's terms: unaltered,
  with its author, its translator and the source named, and in the
  version the source publishes. Its page says whose it is and where it is
  from. None is included yet.
- **A book may be in any language the app has readers of**, and stands on
  the shelf for those who read that language; the Arabic books stand for
  everyone.
- **We pass books on; we do not vouch for them.** Mihrab has no reader of
  every language, and none to proof a whole book in any. What is checked
  is what can be: that the text is whole, is the author's alone, is
  unaltered but for the mends above, and is named with its source. The
  correctness of the words is the source's, and the book's page says where
  that is.

So the rule above is unchanged: what the app *serves as hadith* is still
only what §1 accepts. The Library is a shelf beside it.

## 7. Changing anything

- A new source, set, book or language of hadith is added **only under
  this rule**: a named grader, a sound grade, nobody cited calling it
  weak — or the whole of al-Bukhārī or Muslim — or, in a compilation, its
  compiler's attribution to one of those.
- A change to the rule itself is the maintainer's decision. It is made on
  this page first, then in `grade.ts` / `bookGrades.ts` /
  `book-grades.js` and their tests, with a line in `CHANGELOG.md` saying
  what readers will and will not see.
