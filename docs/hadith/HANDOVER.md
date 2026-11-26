# Hadith work: where it stands

Written on 2026-11-26 at the end of a long working session, for whoever
continues it. Read [AGENTS.md](../../AGENTS.md) and
[docs/hadith-policy.md](../hadith-policy.md) first; the Unreleased section
of [CHANGELOG.md](../../CHANGELOG.md) says what each change gave the reader.
This page is the list of what is done, what is planned, what waits on the
maintainer, and what nobody has verified. Delete a line when it is no
longer true.

## 1. Done, on `main`

| What | Where |
|---|---|
| The rule for what is served, and its clause for compilations | `docs/hadith-policy.md`, `__tests__/hadithPolicy.test.ts`, AGENTS.md §4 |
| Search answers with the nearest match first; a × in the field | `matchDistance` in `src/hadith/library.ts` |
| Reader: title keeps a gap from − A +, a line under the bar when scrolled, a heading cut from a long hadith says so | `src/screens/hadith/HadithPage.tsx`, `src/hadith/heading.ts` |
| Settings → Hadith (starting level, downloads) | `src/screens/settings/pages/HadithSettingsScreen.tsx` |
| "Agreed upon": HadeethEnc entries attributed to both Ṣaḥīḥs | `scripts/hadith/agreed-list.js` → `src/hadith/agreed.json` |
| Books to read: Riyāḍ aṣ-Ṣāliḥīn (1,525 of 1,896), ʿUmdat al-Aḥkām (320 of 414), al-Kalim aṭ-Ṭayyib (68 of 187) | `scripts/hadith/build-compilation.js` → `src/hadith/compilations/*.json` |
| All seven collections by their compilers' books (al-Bukhārī 97, Muslim 57, Abū Dāwūd 43, at-Tirmidhī 49, an-Nasāʾī 51, Ibn Mājah 38, the Muwaṭṭaʾ 61). In a graded book a chapter with no row kept holds nothing and is not offered (the Muwaṭṭaʾ's 59) | `scripts/hadith/book-chapters.js` → `src/hadith/chapters.json`; names in `src/hadith/chapterNames.json` |
| Hadith of the day, at the top of Learn | `src/hadith/daily.ts` |
| Copy and Share carry the reference (book, number, chapter) | `hadithReference` in `src/screens/hadith/HadithReaderScreen.tsx` |
| "See it in al-Bukhārī / Muslim" on a HadeethEnc entry (1,579) | `scripts/hadith/see-in-book.js` → `src/hadith/seeInBook.json`, `seeInBook` in `catalog.ts` |
| Hadith Qudsi from the two Ṣaḥīḥs (30 of a selection's 40), as a list of the app's own | `build-compilation.js qudsi` → `compilations/qudsi.json` (`own: true`) |
| Ibn Rajab's additions to the Forty (7 of 8, nos. 43–49; no. 50 he gives to Aḥmad) | `build-compilation.js rajab` → `compilations/rajab.json` |
| al-Adhkār (406 of 1,219 numbered reports) and al-Wābil aṣ-Ṣayyib (50 of 203 bracketed reports) | `build-compilation.js adhkar` / `wabil`; al-Adhkār's attribution leads the report (`attributionLed`) and its input is OpenITI's text (Wikisource has one chapter) |
| The set "Short hadith to memorise" (the forty shortest of "Agreed upon") | `scripts/hadith/short-set.js` → `sets.json` |
| Related hadith: others in the same HadeethEnc topic, folded under the one read | `relatedHadith` in `src/hadith/library.ts`, `__tests__/hadithRelated.test.ts` |
| "What the grades mean": Settings → Hadith, and the foot of a hadith | `src/screens/settings/pages/HadithGradesSettingsScreen.tsx`, `hadith.grades.*`, `__tests__/hadithGradesGuide.test.ts` |

### The Library (2026-11-26)

A third page of the Hadith tab: whole books, each a pack `library/<id>`
beside the hadith packs (same release, same manifest under `library`,
same downloader). **Not hadith served by the rule** — policy §6, decided
by the maintainer the same day: a book is its author's text, whole;
nothing of it is searched, graded or shown outside the book.

| What | Where |
|---|---|
| The builder: Wikisource pages → paragraphs, headings, verse; stops on markup it does not know | `scripts/library/build-library.js` (cache `scripts/library/.cache`, ignored) |
| The books the app can name | `src/hadith/libraryBooks.json`, `src/hadith/libraryShelf.ts` (offered when the manifest names the pack or it is on the device) |
| The shelf, and a book / a chapter | `src/screens/hadith/LibraryShelf.tsx`, `LibraryBookScreen.tsx` (route `LibraryBook`) |
| Tests | `__tests__/libraryBooks.test.ts` |

Built: `kalila` (19 chapters), `maqamat` (51, in ʿAbduh's order), `ighatha`
(48) from Wikisource; `dawa` (الداء والدواء, 116), `bahja` (بهجة
المجالس, 125) and `iqd` (العقد الفريد, 770 chapters in 26 parts, 5.4 MB)
from OpenITI (CC BY-NC-SA, accepted by the maintainer; `openitiChapters`,
and `openitiParts` for a book of books — a chapter carries its part in
`p`, and the book's page lists parts that open onto their chapters).
al-ʿIqd is read from the Shamela transcription of the Dār al-Kutub
al-ʿIlmiyya printing: the editor's note marks (`«1»`; the notes themselves
are not in the file) and the printer's volume colophons are taken off,
three lines the file has wrong are mended by name in the spec, and every
Arabic letter of the file's body is in the pack (counted, difference 0).
Two book headings the transcription misspelt ("السدرة في النوادي
والتعاذي", "اللؤلوءة") are put as the author's own list in his preface has
them, on the maintainer's word. **Not published until the maintainer sees the file
list** (`upload-packs.sh` uploads whatever is under `build/hadith/v1`).

Reading (2026-11-26, the maintainer's plan — tasks 1–5 of it done):
the place to the paragraph (`mihrab.library.reading.v1`: chapter, block,
fraction, chapter count and name, time; the older chapter-only key is
still read), progress by chapters (`libraryProgress`), bookmarks
(`mihrab.library.bookmarks.v1`, places not copies), copy/share with the
book's name (`libraryShareText`), remove download. All device-local and
listed in `syncCompleteness` STAYS — except bookmarks, which the
maintainer decided (2026-11-26) travel like the journal: they are in the
hadith record (`HadithRecord.library`, `book:chapter:block` → `[0|1, at]`,
merged like every other mark), and the day-old device key is moved in
once. A mark is a place in a pack: **a book rebuilt with its blocks in
other places would move its marks**, so a rebuild that shifts blocks
needs a thought for them. Tapping a paragraph
shows its actions (holding selects text). Search inside ONE book and a
chapter's "Sections" jump list are in `src/hadith/librarySearch.ts`
(folded once per book in slices, a phrase match, first 100 places) —
never the Hadith tab's search. Each book has a line about it (`hadith.library.about.<id>`, 13
languages, saying so where it has coarse passages) and a `level` in
`libraryBooks.json` (1 to begin with, 2 for a later stage — the
maintainer's two lists). Still to do from the plan: search across
the shelf; font choice; verse links. A chapter holds the screen on
under the Qur'an's own `readerKeepAwake` setting (the maintainer's yes,
2026-11-26) — whose help text still names only the Qur'an screens.

Bulūgh al-Marām (`bulugh`, 703 of 1,582) was added the same day at the
maintainer's request: `attributionBulugh` / `reportBulugh` / `weakBulugh`
in `build-compilation.js`, the row in the policy table. Left out: 346
attributed elsewhere, 109 he reports as found wanting, 312 not found with
confidence, 99 too short to tell, 13 not in the text read. Known
conservative miss: "رواه أحمد، واللفظ له، والثلاثة" stops at "واللفظ".

Commentaries are Library books reached from the hadith they explain
(`src/hadith/commentary.ts`, `commentaryFor`): one so far, Ibn Rajab's
Jāmiʿ (`jami`, 51 chapters = his preface + a chapter a hadith, so hadith N
is chapter N; OpenITI, the transcription's `<span class="matn">` marks
taken off as `debris`). The link is drawn only where the pack is on the
device or in our copy's manifest. The maintainer wants each commentary to
be the reader's choice: Fatḥ al-Bārī (OpenITI, ~31 MB) and an-Nawawī on
Muslim are NOT built — each needs cutting into parts and a way from a
hadith's number to its place.

The reader folds a book hadith's chain (`src/hadith/isnad.ts`,
`splitIsnad`): the report begins at the Companion, found from the first
ṣalawāt and the words of handing-on before it; 92–97% of the six books'
rows fold (56% of the Muwaṭṭaʾ), the rest stand whole. A fold only — the
halves are the text, checked over every built row in `hadithIsnad.test`.
Memorising, notes and bookmark folders were already in the app
(`hadithRecord.ts`: `m`, `n`, `f`) and were not rebuilt.

Hadith tab, same day: a compilation shorter than its book says why
(`hadith.comp.why`, and `sectionNote` over the list); the search field is
not drawn on the Library page; recent searches and the count of results
by source are `src/hadith/recentSearches.ts`. Learn already had
"Continue reading" in one tap (`resumeTarget`), so nothing was added there.

Not built:
- بلد العميان — Hindawi's CC BY translation sits behind a bot check
  (Cloudflare), which is not to be worked round. The maintainer can
  download the EPUB himself and hand it over.
- Tafsir was **already in the app** (the āyah sheet, `src/quran/tafsir.ts`,
  25 editions from the Quran.com corpus via spa5k/tafsir_api — Ibn Kathīr
  and as-Saʿdī among them); this was missed when the maintainer's list was
  first answered. aṭ-Ṭabarī and Ibn ʿAṭiyya's al-Muḥarrar al-Wajīz were
  added to that registry on 2026-11-26 from the same corpus. They read
  from the corpus directly until their mirror releases exist
  (`data-tafsir-ar-tafsir-al-tabari`, `data-tafsir-al-muharrar-al-wajiz-ibn-atiyyah`,
  114 files each, fetched to `/tmp/mihrab-mirror` — **not uploaded**; ask
  the maintainer). Fī Ẓilāl al-Qurʾān is in copyright and not added.

Not looked at on a phone. The Maqāmāt include coarse passages (the
edition's text is kept whole).

## 2. Not verified by anyone

- **Seen on the Pixel 10 Pro on 2026-11-26 (English, the two Ṣaḥīḥs
  downloaded):** hadith of the day, the three books to read, al-Bukhārī
  by its books, "Agreed upon", the search and its ×, Share's reference,
  the reader's title gap and the line under its bar. **Not seen:**
  Settings → Hadith, Copy (the clipboard cannot be read over adb), the
  "…" on a heading cut from a long hadith, Muslim's chapters, a hadith
  from a Sunan, anything in Arabic or another locale. A new build is
  `./gradlew assembleGithubRelease`, then `adb install -r --user 0`,
  never an uninstall. `uiautomator dump` cannot read Today (its
  countdown never idles): drive it by screenshot, and do not tap from a
  dump that may be stale.
- **Riyāḍ aṣ-Ṣāliḥīn no. 1 is served by signature**, not by the measure
  (`scripts/hadith/signed-pairings.json`; the policy's clause of
  2026-11-26): al-Bukhārī's row 6194, numbered 6195 in the pack's
  edition and 6689 in Fatḥ al-Bārī's. It has no HadeethEnc entry signed
  with it, so a reader in translation gets the book's first hadith in
  Arabic only; signing an entry for it is the maintainer's to decide.
  The numbers the app shows for al-Bukhārī are that edition's, not the
  ones most people cite.
- **The pairings were read in samples, not in full**: about twenty of the
  least sure of each compilation, and a spread of the rest. All read were
  the right hadith. The 48 that Riyāḍ gained from its bracketed
  attributions were each read, his text against the row. Nobody has read
  all 1,913 rows.
- **Strings in the 12 locales that are not English**, and the **154
  chapter names** (Arabic and English, written by hand), want a native
  reader.
- On Today, a raw `uiautomator dump` holds a second countdown, stopped at
  the interval's start. It is the posed twin `TodayCard` draws for the
  kept launch picture (`twinUp`, `frozenAt={interval.fromAt}`), under the
  real hero and marked `importantForAccessibility="no-hide-descendants"`
  + `accessibilityElementsHidden`; a raw dump lists such views, a screen
  reader does not (`__tests__/heroTwinHiddenFromScreenReaders.test.ts`).
  Not heard with TalkBack on by anyone.

## 3. Planned, in the order agreed

Features that add no hadith:

1. ~~A short guide to the grades~~ — done 2026-11-26 (§1); its twelve
   translations want a native reader, and nobody has seen the page on a
   device.
2. ~~Related hadith~~ — done 2026-11-26 (§1).
3. ~~Arabic and translation side by side~~ — done 2026-11-26: from 800
   points across (`PAIR_MIN_WIDTH`). Seen in the desktop app only
   (`desktop/scripts/drive.js`; run `npm ci` in `desktop/` first if React
   says its versions differ). Not seen on an iPad, a Mac, or in Urdu.
4. ~~Share as an image~~ — done 2026-11-26 (`ShareHadithModal.tsx`): the
   text whole or no picture (`fitsACard`, 1,200 characters).
5. ~~Memorisation mode, a reading plan, bookmark folders~~ — done
   2026-11-26 (`ReaderExtras.tsx`, `hadithRecord.ts`, `plan.ts`), except
   the plan's daily reminder, which came later the same day
   (`notifications/hadithReminders.ts`, `hadithPlanReminder*`). The
   record gained `m`, `f`, `folders` and `plan`; no release has shipped
   the hadith record yet, so there is nothing to migrate.
6. ~~Hadith of the day on Today and as a notification~~ — done
   2026-11-26: the notification (`hadithReminders.ts`, off by default,
   Settings → Notifications → daily reminders) and a card in Today's side
   column on the dashboard and the folded book (`HadithOfDayCard.tsx`).
   **Not on the phone's Today, on purpose** — it fits the screen without
   scrolling by design; the maintainer may rule otherwise. No prayer
   alert's code was touched. Nobody has heard either notification on a
   device.

Content, all under the policy's compilation clause or from what is held:

7. ~~Chapters for the five graded books~~ — done 2026-11-26. The 242
   names were written from memory of the books and checked against
   sunnah.com's lists only where its pages could be read (about a third);
   **the maintainer should read `chapterNames.json` once.** hadith-api's
   ranges overlap for at-Tirmidhī and Ibn Mājah, so the five are read by
   where each book begins (`GRADED`); an-Nasāʾī's 35 is named for both
   books its range holds (oaths and vows, and sharecropping).
8. Hadith Qudsi from the two Ṣaḥīḥs (hadith-api's edition ends each with
   its source; present as a list of ours, not as that modern book's
   selection). ~~Ibn Rajab's eight additions to the Forty~~ — done
   2026-11-26, seven of the eight (§1). A "short hadith to memorise" set from
   "Agreed upon", by length. "See it in al-Bukhārī / Muslim" on a
   HadeethEnc entry (the pairing exists in `build-compilation.js`).
9. ~~al-Wābil aṣ-Ṣayyib, al-Adhkār~~ — done 2026-11-26 (§1). In
   al-Adhkār 244 reports he gives to a served book were not found with
   confidence and 512 name no served book in their own lead ("وروينا
   فيه", Ibn as-Sunnī): recall could be raised by reading "فيه" as the
   book just named, which is a reading of his words the maintainer should
   rule on. Kitāb at-Tawḥīd: built the same day, after the maintainer
   answered "finish the rest" to the question whether he wanted it — 40
   of the 122 reports it introduces as reports (`tawhid.json`). "وفي
   الصحيح" is read as either Ṣaḥīḥ; the pairing says which.
10. Links between hadith and Qur'an: first measure how consistently
    HadeethEnc entries cite verses.

### Verse citations in HadeethEnc, measured (2026-11-26)

Before any hadith-to-Qur'an links (item 10): of the 3,572 Arabic entries,
**272 (7.6%) cite a verse in a form that can be read** — "[البقرة: 255]",
in the hadith's text (175), its explanation (118) or its lessons (52);
477 citations, 74 surah names spelt consistently (one variant seen:
"الاسراء"). **155 more quote a verse in braces with no reference**, and
would need their words found in the Qur'an. The English entries cite 188
times under 113 spellings of the surah names ("Sūrat al-Baqarah", "Surat
al-Baqarah"…): links are to be read from the Arabic entry and carried to
every language by the entry's id, never from a translation. So links are
possible for about one entry in thirteen; whether that is worth a
feature is the maintainer's call.

## 4. Waiting on the maintainer

- **HadeethEnc's other 59 languages: published 2026-11-26**, on the
  maintainer's yes to the list of files. `merge-langs.js --write` then
  `upload-packs.sh`: 118 packs and the manifest went up, the 36 others
  were skipped as unchanged (the thirteen languages byte for byte), and
  the release holds 155 assets. The app offers a language once the
  manifest names it (Settings → Hadith → Hadith language), so builds with
  that page offer all seventy-two. **Not looked at on a phone in any of
  the 59**: the right-to-left ones (ug, fa, prs, ps, ku, kmr) and the
  scripts the reading font may not carry want a look. Some are thin
  (Akan 73 hadith, Yao 79); English stands in for the rest. To refresh a
  language later, build it in a tree of its own and bring it across with
  `merge-langs.js` — which only ADDS languages; replacing one that is
  published is a correction sent to every device and wants its own care.
- **Bulūgh al-Marām**: skipped by the maintainer. No clean input text was
  found; the only clean copies are taken from sunnah.com, which
  `build-packs.js` says is never read.
- **Narrator information** and **word meanings in translation**: no
  source. Not to be written or machine-translated here.
- **Dorar and sunnah.com** (verdicts for Musnad Aḥmad and the rest): the
  maintainer chose not to pursue them for now.
- Local folders: `mihrab-desktop`, `mihrab-macfix` and `mihrab-opt` are
  worktrees of the app. The first is fully in `main`; the second has one
  uncommitted change to look at; `opt/sweep` holds four commits not in
  `main`. Offered for removal, not removed.

## 5. How the builders are run

All three read the packs in `build/hadith/v1` (ignored; on the
maintainer's Mac after `node scripts/hadith/build-packs.js`, or the
`data-hadith-v1` release's `books.*.json` and `henc.all.ar.json` saved
there under `books/<id>.json` and `henc/all/ar.json`) and cache their
inputs under `scripts/hadith/.cache` (ignored).

```sh
node scripts/hadith/agreed-list.js
node scripts/hadith/build-compilation.js riyad --review   # also: umdah, kalim
node scripts/hadith/book-chapters.js
```

- Run them again whenever the packs are rebuilt: the preflight cannot
  check their output without the packs.
- Arabic Wikisource rate-limits: the script waits between batches, and a
  cloud sandbox may not reach it at all — run on the Mac.
- `--review` prints the least sure pairs. Read them before committing an
  index: the one mistake these scripts must not make is to show one
  hadith under another's number.
- An input is read and never republished. An index holds numbers only.

## 6. Rules learned the hard way today

- `npm run preflight` must EXIT 0 before a push, and the push must be
  made conditional on it: one commit went up with a lint error because
  the result was read and not acted on.
- A source-pin test elsewhere may hold the line being changed
  (`hadithFirstUse.test.ts` held the reader's old condition). Run the
  whole suite, not the nearest tests.
- An edition's own typography can hide an attribution: Wikisource's
  Riyāḍ sets the first chapters' in "((…))", and for a day 58 hadith
  were "attributed elsewhere". When `left.elsewhere` is large for a book
  whose compiler rarely goes outside the six, read what follows the
  hadith in a few of them before believing it.
- A count shown to the reader with a reason ("N more … once those books
  are on this device") must be a count of that reason alone
  (`compilationWaiting`).
- A widened pattern is tried against the books already built: adding
  "أخرجه" for Ibn Taymiyyah took an attribution away from Riyāḍ 518 for
  one run.
- The preflight reads the working tree as it runs. Do not edit tracked
  files while it does.
