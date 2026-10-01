/**
 * THE SHAPE OF THE QURAN BLOB — the types `mihrab.quran.v1` is made of.
 *
 * Types only, so that everything which reads a plan or a bookmark can say
 * what it is reading without importing the store that holds it: the pure
 * khatmah modules (`khatmahProgress`, `khatmahSchedule`, `khatmahStatus`)
 * sit below `quranState.ts` and import nothing from it. The store
 * re-exports every one of these, so an importer never has to know they
 * moved (docs/rewrite-plan.md, Phase 2).
 */
import type { RiwayahId } from './riwayat';
import type { KhatmahPace } from './khatmahPace';
import type { AyahMark, AyahRange } from './khatmahDone';

export type BookmarkColor = 'emerald' | 'sapphire' | 'amber' | 'rose' | 'violet';

export type QuranBookmark = {
  id: string;
  surah: number;
  ayah: number;
  page: number;
  color: BookmarkColor;
  createdAt: number;
  /**
   * A bookmark that MOVES: it records the reading done from it, instead
   * of staying where it was dropped (issue #54).
   *
   * Off — and absent, for every bookmark made before this existed — it
   * is what a bookmark has always been: a fixed pin. On, it is a place
   * that keeps itself. Open it and read, and the turns are its; leave
   * and come back a week later, and it is where you stopped. It is how a
   * reader keeps a surah read now and then, or a passage under revision,
   * without the evening's Al-Mulk wiping either — see `readingSession`
   * for which of them a turn belongs to.
   */
  follows?: boolean;
  /**
   * SHOWN ON THE QUR'AN TAB, under "Continue reading" (additive).
   *
   * A bookmark the reader goes back to often — the surah under revision,
   * the Friday Al-Kahf — is a row on the tab's doors card, one tap from
   * the top of the page, rather than a row in a list behind a tab. Off,
   * and absent on every bookmark made before this existed, it is in the
   * list only. Switched on the bookmark itself, in that list.
   */
  shortcut?: boolean;
  /**
   * When it last changed — moved, recoloured, or switched to following.
   *
   * A bookmark used to be immutable after creation, and the sync merge
   * leaned on that: first copy wins, by id. A bookmark that can move
   * would then move on one device and never on the other, silently —
   * the merge takes the newer of two copies now, and this is what
   * "newer" means. Absent on bookmarks written before this existed;
   * `createdAt` stands in.
   */
  updatedAt?: number;
};

export type LastRead = {
  surah: number;
  ayah: number;
  page: number;
  mode: 'mushaf' | 'withTranslation';
  updatedAt: number;
  /**
   * Set by hand from an ayah's own panel (#41), as opposed to recorded
   * from a page turn or a scroll. A pinned marker is DRAWN in the reader
   * — the wash and the medallion — because the reader put it there on
   * purpose and wants to find it again; a recorded one is not, because it
   * is wherever the reading is, and a mark that rides at the top of every
   * page as it is turned tells the reader nothing. The next stretch of
   * reading moves the marker on and clears this, as reading moves any
   * place along. Additive: absent on every marker written before it.
   */
  pinned?: boolean;
};

export type KhatmahPlan = {
  id: string;
  /** Epoch ms the plan started. */
  startedAt: number;
  /** Goal length in days (e.g. 30). */
  targetDays: number;
  /** Furthest mushaf page completed (0 = none yet). */
  pagesRead: number;
  /** Set when pagesRead reaches 604. */
  completedAt: number | null;
  /**
   * When the reader abandoned this plan — a TOMBSTONE, not a deletion.
   *
   * Dropping the row is what let a paired device bring the plan back:
   * `mergeKhatmah` unites the two sides by id, and a row that is absent
   * locally and present on the other device is indistinguishable from a
   * row the other device has just created. The delete was purely local,
   * so the next sync round put it back — the same bug `removedPeers.ts`
   * describes for devices and `coerceSunnahLog` describes for a cleared
   * day, and the same answer both give: the removal is a fact with a
   * date on it, and it travels.
   *
   * Everything that looks for "the plan I am on" must go through
   * `isLivePlan`, which is the one place that guarantees an abandoned
   * plan reads as gone.
   */
  abandonedAt?: number;
  /**
   * SET ASIDE, NOT ABANDONED: the id of the plan kept in this one's place
   * (`oneLivePlan`). There is one khatmah; this is how a second, from a
   * device that started its own before they synced, is kept out of sight.
   *
   * Derived, never merged: worked out again from the plans on every
   * merge, every read of a stored blob and every write. Not `abandonedAt`,
   * because that choice is made from the reading one device can see, and
   * an abandonment is permanent — two devices merging stale copies each
   * abandoned the other's plan and left none. When the reader finishes or
   * abandons the kept plan, the plans set aside behind it are abandoned
   * with it (`endSetAside`) — that is the reader's act, so it is a real
   * tombstone.
   *
   * A build from before the field drops it and sees both plans live, as
   * it always did.
   */
  supersededBy?: string;
  /**
   * WHICH ayahs the plan has read, as inclusive `[from, to]` index
   * ranges — the authoritative record of progress (issue #54 follow-on).
   *
   * `ayahsRead` and `pagesRead` are a high-water mark, and a mark can
   * only say how FAR. It could not hold "today's portion read out of
   * order", and it had to count pages nobody read whenever a reader
   * skipped forward — the trade `khatmahTracksPage` spells out. This can
   * hold both: a page read is a page done, and a page skipped stays
   * undone however far past it the reader goes.
   *
   * In ayahs for the same reason `ayahsRead` is: a page belongs to one
   * printed muṣḥaf, an ayah belongs to the book. See `khatmahDone`.
   *
   * Absent on plans written before this existed, and on those the
   * high-water mark is converted into a single range — identical
   * behaviour, nothing lost. Both legacy fields go on being written from
   * the CONTIGUOUS run of this set, so a device still on an older build
   * reads exactly what it always read.
   */
  done?: AyahRange[];
  /**
   * DATED CLAIMS, so an un-mark survives the union (additive).
   *
   * `done` merges by union and a union only grows, so it cannot carry
   * "not read": un-mark a page here and the other device's set puts it
   * back on the next merge — the khatmah-delete bug, one level down. The
   * hand-made claims are logged with the time they were made and
   * replayed over the union, so the last thing the reader said about a
   * page wins wherever they said it. See `AyahMark`.
   *
   * Page turns are not logged; they extend `done`, which the union
   * already carries. Only a hand-made claim, and a reading that crosses
   * one, need a date.
   */
  marks?: AyahMark[];
  /**
   * Ḥafṣ pages already behind the reader when the plan was made — the
   * plan covers what FOLLOWS them, cut into `targetDays` portions.
   *
   * Absent or 0 on a khatmah begun at the first page, which is every plan
   * written before this existed and most written since.
   *
   * A reader who is already halfway through a khatmah nobody was tracking
   * (issue #17) has two things to say, and they are different things: how
   * much is already read, and how long the rest should take. Seeding only
   * the progress would leave the portions cut for a book they are not
   * starting — a thirty-day plan begun at page 143 would hand out its
   * first five days to ground already covered and then ask for the last
   * 461 pages in the twenty-five that remain. So the cut moves with the
   * start: 461 pages over thirty days, twenty or so a day, which is what
   * the reader asked for.
   */
  fromPage?: number;
  // ── Additive fields (v2.7.28) ─────────────────────────────────────
  /** Explicit user-pinned position ("I am here"), shown on the mushaf
   *  in the reserved khatmah color. Overrides the derived page. */
  position?: { surah: number; ayah: number; page: number } | null;
  /**
   * WHEN THE PIN WAS LAST SET **OR TAKEN OFF** — because taking it off is
   * a thing the reader did, and it has to travel (reported 2026-09-20).
   *
   * The pin used to merge by "furthest page wins", which cannot express a
   * removal: a cleared pin is a `null`, `null` has no page, and any pin
   * still sitting on the other device beat it — every round. Two symptoms,
   * one cause. The pin the reader took off came back; and since
   * `khatmahCurrentPage` answers with the pinned page while a pin is set,
   * a plan that had been read well past its pin was dragged back to it, so
   * "Continue khatmah" kept opening a page the reader had finished with.
   * Reading past a pin spends it (`position: null` in `recordKhatmahProgress`),
   * which made the second symptom arrive without anyone touching anything.
   *
   * So the pin is a CLAIM with a date on it, like the khatmah's own
   * tombstone and the un-marks beside it: whichever device spoke last
   * wins, and "no pin" is something a device can say. Absent on plans
   * written before this existed; the merge falls back to the old rule
   * only when NEITHER side carries a stamp.
   */
  positionAt?: number;
  /** `pagesRead` snapshot at the start of the local day (yyyy-mm-dd) —
   *  lets "reset today's reading" rewind only today's progress. */
  dayStartPagesRead?: number;
  dayStartDate?: string;
  // ── Additive fields (riwayat) ─────────────────────────────────────
  /**
   * Ayahs read, out of 6236 — the AUTHORITATIVE measure of progress.
   *
   * `pagesRead` is a page count, and a page is a fact about one printed
   * muṣḥaf: page 300 of a Warsh print is not page 300 of a Hafs one.
   * With a second riwayah on screen that number stops meaning one thing,
   * so progress is counted in ayahs, which every riwayah agrees on.
   *
   * Optional because plans written before this existed do not have it;
   * `khatmahAyahsRead` derives it from `pagesRead` for those. `pagesRead`
   * is still written, in HAFS terms, so that older versions and the sync
   * merge — which takes the max of it — keep working across devices.
   */
  ayahsRead?: number;
  /** `ayahsRead` at the start of the local day, mirroring `dayStartPagesRead`. */
  dayStartAyahsRead?: number;
  // ── Additive fields (the deadline plan, issue #53) ────────────────
  /**
   * THE DATE THIS IS MEANT TO BE FINISHED BY — `YYYY-MM-DD`, civil.
   *
   * Absent on every plan made until now, and that absence is the plan's
   * MODE: without it a khatmah is a duration ("finish in thirty days"),
   * cut once when it was made, and it keeps exactly the meaning it has
   * always had. With it the book is re-cut every day over the days that
   * are left, and the day number becomes the calendar's rather than the
   * reader's — see `khatmahPace.ts` for why that reversal is right for
   * one mode and wrong for the other.
   *
   * A date rather than a number of days because it is the promise the
   * reader actually made: "by the 30th" survives a week of not opening
   * the app, where "thirty days from now" quietly becomes a different
   * date every time you recompute it.
   */
  deadline?: string;
  /**
   * WHEN THIS PLAN WAS LAST PACED — and `targetDays` and `deadline`
   * together are what it stamps.
   *
   * The two fields are not two settings. They are one decision said two
   * ways — "in thirty days" and "by the 30th" — and the reader can change
   * their mind about it mid-khatmah, in either direction
   * (`setKhatmahDuration`, `setKhatmahDeadline`). That is why `targetDays`
   * can no longer be settled with a `Math.max`: it is edited now, and a
   * max would quietly restore the longer of two lengths whenever a device
   * that had not heard about the change spoke.
   *
   * So the PAIR travels with one stamp and the newest word wins, exactly
   * as the pin does. One stamp rather than two because half a decision is
   * not a state the reader ever asked for: "in 14 days" from this device
   * must never merge with "by 3 October" from that one into a plan that
   * is neither. Absent on plans written before this existed; the merge
   * falls back to the old rule only when NEITHER side carries a stamp.
   */
  pacedAt?: number;
  /**
   * THE DAY the pacing was decided — the store's own day, `YYYY-MM-DD`.
   *
   * `pacedAt` is an instant and orders the decisions; this is the day the
   * schedule counts from, and the two are not the same thing for a reader
   * who re-paces at ten in the evening. Their day rolled at maghrib
   * (`localYmd`), so the store already thinks it is tomorrow; the civil
   * date of the instant still says today. Counted from the instant, the
   * plan would be a day behind by the next morning without a day having
   * passed, and tomorrow's portion would read "today". Only the store at
   * the moment of writing knows which day that was — yesterday's maghrib
   * is not kept — so it is written down rather than derived.
   */
  pacedDay?: string;
  /**
   * The Ḥafṣ page the reader had reached when the pacing was decided.
   *
   * A plan re-paced on day twenty is not twenty days behind: the promise
   * it is measured against is the one made TODAY, from where the reader
   * actually is. `khatmahBehindBy` and the outgrown-pace test both start
   * from here, and both are nonsense without it — a reader who asks to
   * finish the last third in a fortnight would be told, the same second,
   * that they are three hundred pages behind schedule.
   *
   * Written by every plan made since this existed (where it equals
   * `fromPage`), so its absence means a legacy plan, and those measure
   * from where they began, as they always did.
   */
  pacedFrom?: number;
  /**
   * TODAY'S CUT, pinned when today opened (deadline plans only).
   *
   * The pace is "what is unread over the days that remain", and that
   * question cannot be asked twice in one day without the day receding as
   * you read it — `khatmahPace.ts` has the arithmetic and the reason.
   * Stored rather than derived from `dayStartAyahsRead` because that one
   * is a fact about one device's morning and deliberately does not sync;
   * two devices would pin different mornings and show different quotas
   * for the same day.
   */
  pace?: KhatmahPace;
};

export type RepeatSettings = {
  /** Repeat each ayah N times (1 = play once). */
  eachAyah: number;
  /** Repeat the whole selected range N times (1 = play once). */
  range: number;
  /** Extra silence between repeats, as a multiple of the ayah length (0–2). */
  pauseFactor: number;
};

export type QuranPrefs = {
  reciterId: string;
  playbackRate: number;
  /** Mushaf night mode (a repaint on a near-black ground). */
  mushafNightMode: boolean;
  /**
   * Which of the two LIGHT tones the page takes when night is off —
   * additive, see `mushafTone.ts` for why night keeps its own boolean.
   */
  mushafPaperTone: 'paper' | 'sepia';
  /**
   * Follow the app theme — paper when it is light, night when it is dark
   * — instead of a fixed tone (additive; see `mushafTone.ts`). A blob
   * from before the field keeps the fixed tone it held; a fresh install
   * starts here.
   */
  mushafToneAuto: boolean;
  /**
   * Which reading tradition the muṣḥaf is drawn in (additive).
   *
   * A string rather than a boolean because Warsh is the second of five
   * the app may eventually draw, not the other one — see `riwayat.ts`.
   * Stored ids this build cannot draw resolve back to Hafs on read, so a
   * device that syncs `warsh` to one without the data still opens a
   * muṣḥaf.
   */
  riwayah: RiwayahId;
  /**
   * Has the reader been told that a Unicode muṣḥaf reflows? (additive)
   *
   * A `unicode` riwayah gets its page BOUNDARIES from the print and its
   * LINE breaks from the platform, because no open Warsh dataset carries
   * line assignments (`docs/design/riwayat-plan.md` §2). Someone who has
   * memorised where an ayah sits on the page of a physical muṣḥaf will
   * notice, and finding out by being confused is the worst way to learn
   * it. Said once, on the first switch, and then never again.
   */
  riwayahNoticeSeen: boolean;
  /**
   * WHAT A NEW BOOKMARK DOES — follow the reading, or stay put (additive).
   *
   * Two jobs wear one badge. A star already says "this ayah matters to
   * me", so a bookmark is a PLACE, and a place that keeps itself is what
   * a place is for: `follow` is the default because it is what the object
   * means. `fixed` is the old behaviour, for a reader who wants coloured
   * pins and nothing else, and `ask` shows the choice in the ayah sheet
   * the moment a bookmark is made rather than deciding for them.
   *
   * It sets a new bookmark's STARTING state and nothing more — the switch
   * on the bookmark's own row still overrides it, for that bookmark,
   * forever. A blob from before this field takes `fixed`, so nothing a
   * reader already has changes under them.
   */
  bookmarkFollowDefault: 'follow' | 'fixed' | 'ask';
  /**
   * TILĀWAH's coffee cup, and only it (the name predates the split).
   *
   * It used to be both this and the readers' — one flag under two
   * controls, on the reasoning that it is one question. It is not: the
   * coffee cup is reached with the recitation already playing and gets
   * turned off for a session of listening, and that silently took the
   * muṣḥaf's keep-awake with it. Issue #52 asked for the reading one to
   * be answerable "separate from tilawah", and this is what that means.
   */
  keepAwake: boolean;
  /**
   * READING — the muṣḥaf and the verse-by-verse reader. Settings → Quran
   * is its control. Default on, which is the issue's own ask, and a blob
   * without the field takes the default rather than inheriting whatever
   * the coffee cup happened to be left at.
   */
  readerKeepAwake: boolean;
  /**
   * THE WORD READER (additive): hold a word on the Ḥafṣ page and hear
   * it, on its own, when the finger lifts — sliding to another word first
   * if that is the one. Off by default: a long press has meant "open the
   * ayah" since the reader was built, and this takes that gesture.
   */
  wordReader: boolean;
  /**
   * Who reads the word (additive). Its own choice, not the recitation's:
   * only a reciter with word timings can read one word, and the
   * recitation may be someone without them. Empty means "not chosen" —
   * `wordReaderReciter()` then takes the recitation's reciter when timed,
   * and the default reciter otherwise. Never a reciter without timings.
   */
  wordReaderReciterId: string;
  /**
   * TAJWĪD COLOURS (additive): draw the Ḥafṣ page in the King Fahd
   * Complex's colour-coded fonts, where each rule of recitation has its
   * colour — and let a tapped āyah say which letters carry which rule.
   * Off by default: the plain page is the one everybody knows, and the
   * colours are a second set of fonts to fetch. Only Ḥafṣ has them.
   */
  tajweedColours: boolean;
  /** Memorization masking in translation view. */
  hideMode: 'none' | 'arabic' | 'translation';
  repeat: RepeatSettings;
  /** Second row of the Verse-of-the-day card (v2.7.31, additive).
   *  LEGACY as of v2.7.40 — superseded by `companionMode`, kept only so a
   *  downgrade still finds a sensible value. Writers keep it in sync. */
  votdMode: 'translation' | 'tafsir';
  /**
   * THE app-wide companion-text mode (v2.7.40, additive): what renders
   * beneath each ayah everywhere — the translation reader rows, the verse
   * of the day, the mushaf ayah sheet's expanded section, and the daily
   * ayah notification. Seeded from the legacy `votdMode` on first load so
   * an existing "tafsir" choice carries over. Editions per mode:
   * translation → settings.quranTranslationEdition (useActiveEdition),
   * tafsir → `tafsirEditionId` below.
   */
  companionMode: 'translation' | 'tafsir';
  /**
   * Chosen tafsir edition id (v2.8, additive). Empty string = "use the
   * locale default". Persisted here so the pick sticks across ayah-sheet
   * reopens and stays in sync between the Quran page and Settings — the old
   * behaviour kept it in ephemeral component state, so it reverted to the
   * default every time the sheet remounted. Resolve with `resolveTafsirEdition`
   * (which falls back to the locale default when the stored id isn't offered).
   */
  tafsirEditionId: string;
  /**
   * Is the verse-of-the-day card open? (additive)
   *
   * Closed to begin with. The card is four to six lines of Arabic and
   * tafsir sitting between someone and the surah list they came for, and
   * a screen you have to scroll past the same thing on every day is one
   * you stop reading the top of. Open it once and it stays open — the
   * point is that the reader decides, not that we guess right.
   */
  verseOfDayOpen: boolean;
  /**
   * Is the verse of the day on the Qur'an tab at all? (additive)
   *
   * Off by default. The card was there for everyone, closed, as one more
   * row between the top of the tab and the surah list; it is a setting
   * now (Settings → Quran), and the tab shows it only to a reader who
   * asked. The daily ayah notification is its own switch and unaffected.
   */
  verseOfDay: boolean;
  /**
   * THE BOOKMARK THAT STANDS IN FOR THE KHATMAH ON HOME (additive).
   *
   * Home's Qur'an card has a slot for the khatmah's next page. A reader
   * who keeps no khatmah but reads one surah on a schedule has the same
   * need — a door to a kept place — and an empty slot. So one bookmark,
   * and only one, can be starred in the bookmark list to take it. Its
   * id, or empty for none. While a khatmah is live the star is disabled
   * and the slot is the plan's; the id is kept, and the door returns
   * when the plan is done. A bookmark that no longer exists is simply
   * not drawn.
   */
  homeBookmarkId: string;
  /**
   * Does one surah lead to a random next one? (additive)
   *
   * A SURAH shuffle, never an ayah shuffle — see `pickNextSurah`. Off by
   * default: reading order is the order the book has.
   */
  shuffleSurahs: boolean;
  /**
   * Does Tilāwah draw the page the recitation is on? (additive)
   *
   * On by default: it is the difference between listening to a voice and
   * following a text, and someone who does not want it turns it off once.
   * The card removes itself when the page's font cannot be had, so a
   * device with no muṣḥaf and no connection is not left staring at a
   * spinner.
   */
  tilawahShowPage: boolean;
};

export type QuranState = {
  version: 1;
  lastRead: LastRead | null;
  bookmarks: QuranBookmark[];
  /** Starred ayah keys, `"surah:ayah"`. */
  starred: string[];
  khatmah: KhatmahPlan[];
  prefs: QuranPrefs;
  /**
   * WHEN THE PREFERENCES LAST CHANGED (additive).
   *
   * They used to ride on `lastRead.updatedAt` — the only timestamp this
   * store kept — so a preference changed on a device that had not read
   * since lost to one that had. Which is the wrong way round for exactly
   * the settings nobody changes while reading: switch New bookmarks on
   * the Mac and the phone's older choice came back on the next sync,
   * silently. A preference is a write, so it gets a write time.
   *
   * Absent on a blob from before the field, which reads as 0 — older
   * than any stamped change, which is the truthful answer: that device
   * has never knowingly chosen.
   */
  prefsUpdatedAt?: number;
  /**
   * BOOKMARKS THE READER TOOK AWAY, with the time they did it.
   *
   * A deleted bookmark used to be an absence, and an absence loses every
   * argument a union has: the other device still had the row, and the
   * merge — which unites by id — could not tell "deleted here" from
   * "made there". So it came back, every round. The same shape as the
   * khatmah plan that resurrected itself (`abandonedAt`), the peer that
   * un-removed itself (`removedPeers.ts`) and the cleared sunnah day, and
   * the same answer: the removal is a fact with a date on it, and it
   * travels.
   *
   * A removal only beats a bookmark OLDER than it, so re-making one —
   * which mints a new id anyway — and editing one on the other device
   * after the delete both survive. Pruned at ninety days by
   * `coerceQuranState`, like every other tombstone here.
   */
  bookmarksRemoved?: Removal[];
  /** Stars the reader took off — same reasoning as `bookmarksRemoved`. */
  starsRemoved?: Removal[];
  /**
   * WHEN EACH STAR WAS PUT ON.
   *
   * `starred` is a bare list of keys merged by union, so it cannot be
   * ordered against a removal on its own: without this, re-starring an
   * ayah after un-starring it on the other device would lose to the
   * older removal for ever. A star made before this field existed reads
   * as 0 — older than any removal, which is the truthful answer for a
   * device that never recorded when it starred anything.
   */
  starsAt?: Record<string, number>;
};

/** Something the reader took away, and when. */
export type Removal = { id: string; at: number };
