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
| Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim by their books (97, and 57) | `scripts/hadith/book-chapters.js` → `src/hadith/chapters.json`; names in `src/hadith/chapterNames.json` |
| Hadith of the day, at the top of Learn | `src/hadith/daily.ts` |
| Copy and Share carry the reference (book, number, chapter) | `hadithReference` in `src/screens/hadith/HadithReaderScreen.tsx` |
| Related hadith: others in the same HadeethEnc topic, folded under the one read | `relatedHadith` in `src/hadith/library.ts`, `__tests__/hadithRelated.test.ts` |
| "What the grades mean": Settings → Hadith, and the foot of a hadith | `src/screens/settings/pages/HadithGradesSettingsScreen.tsx`, `hadith.grades.*`, `__tests__/hadithGradesGuide.test.ts` |

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
5. Memorisation mode; a reading plan ("Riyāḍ aṣ-Ṣāliḥīn in 90 days",
   with a reminder, as the Qur'an has its khatmah); bookmark folders.
   These three change the reader's stored record (`hadithRecord.ts`, and
   what syncs): the most care, and a migration test each.
6. Hadith of the day on Today and as a notification. Today and the alert
   scheduling are the app's most guarded code (AGENTS.md §1, §8, §9).

Content, all under the policy's compilation clause or from what is held:

7. Chapters for the five graded books. `book-chapters.js` already divides
   them (set `BOOKS` to all seven); a chapter none of whose rows a pack
   kept must be allowed to be empty instead of refused, and about 240
   chapter names are to be written.
8. Hadith Qudsi from the two Ṣaḥīḥs (hadith-api's edition ends each with
   its source; present as a list of ours, not as that modern book's
   selection). Ibn Rajab's eight additions to the Forty (Wikisource has
   Jāmiʿ al-ʿUlūm wa-l-Ḥikam). A "short hadith to memorise" set from
   "Agreed upon", by length. "See it in al-Bukhārī / Muslim" on a
   HadeethEnc entry (the pairing exists in `build-compilation.js`).
9. al-Wābil aṣ-Ṣayyib, al-Adhkār (Wikisource has only part), Kitāb
   at-Tawḥīd. The maintainer asked for these after first choosing to skip
   creed texts; confirm Kitāb at-Tawḥīd before building it.
10. Links between hadith and Qur'an: first measure how consistently
    HadeethEnc entries cite verses.

## 4. Waiting on the maintainer

- **HadeethEnc's other 59 languages.** The fetch was approved and is
  running on the maintainer's Mac in a worktree, `/tmp/geo/wt-langs`
  (log `/tmp/geo/langs-build.log`; rerun the same command to resume:
  `node scripts/hadith/build-packs.js --langs "$(cat /tmp/geo/langs.txt)" --concurrency 2`).
  **Nothing is published.** Before `scripts/hadith/upload-packs.sh` is
  run: (a) the 13 existing languages' packs must go up byte for byte as
  they are — a rebuilt pack carries a new retrieval date, and every
  installed app would download its hadith again (`packUpdates.ts`);
  (b) the app needs a hadith-language setting, since hadith language is
  tied to the 13 interface languages (`HADITH_LANGS`, `packLangs` in
  `catalog.ts`); (c) ask the maintainer again, with the list of files.
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
