/**
 * THE MARKS THE READER KEEPS in the book — the reading marker that
 * "Continue reading" hands back, the bookmarks, and the starred ayahs —
 * and the rules for which of them a page turn moves.
 *
 * The khatmah is the other trail through the book and lives in the
 * khatmah modules; the rules below only ask it where it is. Everything here
 * writes through the store (`quranState.ts`), which imports nothing from
 * this file.
 *
 * Moved out of `quranState.ts` unchanged (docs/rewrite-plan.md, step
 * 2.3), and its importers pointed here in the same step, so the store never
 * re-exported it and no import ever ran in a circle.
 */
import { firstAyahOfPage } from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import {
  claimReadingSession,
  noteReadingMoved,
  noteReadingPlaced,
  readingSessionOwner,
  releaseReadingOwner,
} from './readingSession';
import type {
  BookmarkColor,
  LastRead,
  QuranBookmark,
  QuranState,
} from './quranTypes';
import { activeKhatmah, khatmahCurrentPage } from './khatmahProgress';
import { getQuranState, mergeRemovals, setQuranPrefs, updateQuranState } from './quranState';

export function setLastRead(pos: Omit<LastRead, 'updatedAt'>): void {
  updateQuranState(prev => ({
    ...prev,
    lastRead: { ...pos, updatedAt: Date.now() },
  }));
}

/**
 * How near a page has to be to the khatmah's own page to be its reading.
 *
 * Two, not one: a spread turns two pages at a time, and a turn that lands
 * two ahead of the plan's page is the plan being read on an iPad, not a
 * reader who went somewhere else.
 */
const KHATMAH_PAGE_REACH = 2;

/**
 * Is this page where the khatmah is being read — the plan's own next
 * page, or the one beside it?
 *
 * Narrower than `khatmahTracksPage`, and on purpose: that answers "does
 * reading here count towards the plan", and it says yes to every page
 * behind the frontier because re-reading is still the khatmah's ground.
 * This answers "is the reader on the khatmah's page RIGHT NOW", which is
 * what decides whether the reading marker (below) should follow them.
 * A page well behind the frontier is not the khatmah's reading; it is
 * someone reading Al-Baqarah on a Tuesday while their plan sits in juz
 * twenty, and that is exactly the reading the marker is for.
 */
export function isKhatmahPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  s: QuranState = getQuranState(),
): boolean {
  const plan = activeKhatmah(s);
  if (!plan) return false;
  return Math.abs(page - khatmahCurrentPage(plan, riwayah)) <= KHATMAH_PAGE_REACH;
}

/**
 * Record where the reader is — issue #41.
 *
 * ── TWO TRAILS THROUGH ONE BOOK ───────────────────────────────────────
 *
 * `lastRead` is the reading marker: the place "Continue reading" hands
 * back. A khatmah is a second trail with its own marker (the plan's next
 * page, `khatmahContinueTarget`), and a reader can walk both — the plan
 * in the morning, Al-Kahf on a Friday — which is a thing this store used
 * to make impossible: every page turn wrote `lastRead`, so an evening in
 * the khatmah erased the afternoon's place in Al-Kahf, and the marker
 * was never more than "the last page looked at".
 *
 * There are three trails now, not two — a khatmah, any number of
 * bookmarks, and the marker — and the marker is the one that takes what
 * the others did not claim. Each of the two rules that hold it back is
 * written at the point it applies, below: a bookmark visit records no
 * marker at all, and the khatmah vetoes a marker that was not already
 * riding with the plan.
 */
export function recordReading(
  pos: Omit<LastRead, 'updatedAt' | 'pinned'>,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  const prev = getQuranState();
  const owner = readingSessionOwner();

  /**
   * ── A BOOKMARK VISIT IS NOT THE MARKER'S TO RECORD ────────────────
   *
   * Whatever was opened owns the turns — see `readingSession` for why
   * proximity cannot be the rule once there is more than one bookmark.
   * What follows from that, and is the whole of this branch: while a
   * bookmark owns the visit the marker does not move AT ALL.
   *
   * A bookmark IS a kept place, so a second marker trailing the same
   * reading is a duplicate of a thing the reader already has — and
   * worse, it is a duplicate that destroys something: the marker it
   * overwrites is where that reader was when they were reading from the
   * index, which is the one place nothing else remembers. Resuming a
   * bookmark for ten minutes must not cost them that.
   *
   * So neither following mode matters here. A following bookmark walks
   * with the reading; a fixed one stays where it was pinned; and in both
   * cases the marker is left alone, because in both cases the place is
   * already kept by the thing that was opened.
   *
   * Reading away from it records NOTHING, which is the honest answer:
   * someone who swipes off to look something up has not started a
   * reading anywhere, and the bookmark is not dragged after them
   * (`withinBookmarkReach`). To keep a place out there, open it from the
   * index — that visit is the marker's — or bookmark it.
   */
  if (owner?.kind === 'bookmark') {
    const b = prev.bookmarks.find(x => x.id === owner.id);
    if (b) {
      /**
       * A TURN THAT DID NOT CHANGE THE PAGE MOVES NOTHING.
       *
       * `recordReading` is given the page's FIRST ayah, so a recorded
       * turn that lands on the page the bookmark is already on would
       * rewrite a deliberately marked ayah — the reader picks 2:47,
       * something re-settles on the same page, and the bookmark says
       * 2:1 instead. There is no reading to record in that case, and
       * the precise ayah is worth more than the page start it would be
       * replaced with. It also keeps the anchor drawn, which a rewrite
       * would have quietly put out.
       */
      if (b.follows && withinBookmarkReach(b, pos) && pos.page !== b.page) {
        moveBookmark(b.id, pos);
        // Carried along by reading, so it stops being drawn: the wash
        // would otherwise reappear under the first line of every page
        // turned to, which is not a place anybody marked.
        noteReadingMoved();
      }
      return;
    }
    // Deleted mid-visit: there is no kept place any more, so the turns
    // fall to the marker like any other reading.
  }

  /**
   * ── THE KHATMAH'S VETO, WHICH GUARDS THE MARKER AND NOTHING ELSE ──
   *
   * A muṣḥaf page within reach of the plan's page leaves the marker
   * where it is, UNLESS the marker was already riding with the plan, in
   * which case it comes along. That second clause is what keeps a reader
   * with one trail exactly where they were: every marker written before
   * this existed sits on the plan's page, and a marker that stopped
   * following would have looked like a lost place. The moment such a
   * reader reads somewhere else, the marker detaches and becomes theirs;
   * the moment it is theirs, the khatmah cannot take it back.
   *
   * It is evaluated HERE, after the bookmark branch, because it is a
   * rule about the marker. It used to return from the top of the
   * function, which also froze a following bookmark that happened to be
   * read within two pages of the plan — a bookmark session silently
   * recording nothing, for a reason that had nothing to do with it.
   *
   * Translation mode always writes. Khatmah progress is credited from
   * muṣḥaf page turns and nowhere else, so a plan read in translation
   * never advances on its own — and a marker that refused to follow that
   * reading would be a place lost with nothing to point at it instead.
   */
  const marker = prev.lastRead;
  if (
    pos.mode === 'mushaf' &&
    marker &&
    isKhatmahPage(pos.page, riwayah, prev) &&
    !isKhatmahPage(marker.page, riwayah, prev)
  ) {
    return;
  }
  // Reading moves the place along, pinned or not; a pin is a correction
  // of where the marker stands, never a bookmark (those exist).
  setLastRead(pos);
}

/**
 * Pin the reading marker to an ayah by hand — the counterpart of
 * `setKhatmahPosition` for the other trail. From an ayah's own panel,
 * so a reader can say "I am here" about a place the page turns did not
 * record: a translation row scrolled past, or a muṣḥaf page whose first
 * ayah is not where they stopped.
 */
export function setReadingPosition(
  surah: number,
  ayah: number,
  page: number,
  mode: LastRead['mode'],
): void {
  setLastRead({ surah, ayah, page, mode, pinned: true });
}

/**
 * The marker as something to DRAW, or null.
 *
 * Only a pinned marker is drawn — see `LastRead.pinned`. The readers
 * ask this rather than reading `lastRead` themselves so that the rule
 * lives in one place and a mark never appears for a reader who did
 * nothing but turn the page.
 */
export function drawnReadingPosition(
  s: QuranState,
): { surah: number; ayah: number } | null {
  const m = s.lastRead;
  return m?.pinned ? { surah: m.surah, ayah: m.ayah } : null;
}

/**
 * Where "Continue reading" leads, or null when there is no such place —
 * because nothing has been read, or because the marker is riding with
 * the khatmah and the khatmah's own offer already leads there. Two rows
 * to one page is one row too many; the plan's is the stronger claim.
 */
export function readingContinueTarget(
  s: QuranState,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): LastRead | null {
  const marker = s.lastRead;
  if (!marker) return null;
  // The same reach `recordReading` uses, so the two agree about what
  // "riding with the plan" means; a marker the khatmah would carry along
  // is a marker the khatmah's own row already speaks for.
  if (isKhatmahPage(marker.page, riwayah, s)) return null;
  return marker;
}

export function ayahKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function toggleStar(surah: number, ayah: number): void {
  const key = ayahKey(surah, ayah);
  updateQuranState(prev => {
    const on = prev.starred.includes(key);
    /**
     * BOTH HALVES OF THE TOGGLE ARE DATED (see `starsRemoved`).
     *
     * The list of stars merges by union, and a union cannot say "not
     * starred": take a star off here and the other device's list put it
     * straight back. The removal is a dated fact now — and so is the
     * star itself, or re-starring an ayah would lose to the removal it
     * came after, for ever.
     *
     * One clock for the pair, nudged past whichever of the two is newer,
     * so a star and the un-star of it cannot land on the same
     * millisecond and be replayed in the wrong order elsewhere.
     */
    const at = Math.max(
      Date.now(),
      (prev.starsAt?.[key] ?? 0) + 1,
      (prev.starsRemoved?.find(r => r.id === key)?.at ?? 0) + 1,
    );
    const starsAt = { ...(prev.starsAt ?? {}) };
    if (on) delete starsAt[key];
    else starsAt[key] = at;
    return {
      ...prev,
      starred: on ? prev.starred.filter(k => k !== key) : [...prev.starred, key],
      ...(Object.keys(starsAt).length > 0 ? { starsAt } : {}),
      ...(on
        ? { starsRemoved: mergeRemovals(prev.starsRemoved, [{ id: key, at }]) }
        : prev.starsRemoved
          ? { starsRemoved: prev.starsRemoved.filter(r => r.id !== key) }
          : {}),
    };
  });
}

export function isStarred(s: QuranState, surah: number, ayah: number): boolean {
  return s.starred.includes(ayahKey(surah, ayah));
}

/**
 * A change stamp later than the bookmark's last one.
 *
 * The merge keeps whichever copy is NEWER, by strict comparison, and the
 * wall clock is too coarse to order two changes made here in the same
 * millisecond — create and recolour, or two switch flips — so the later
 * could lose to the earlier on the other device. One past the last stamp
 * is later than it and still a time the other device can compare.
 */
function stampAfter(b: QuranBookmark): number {
  return Math.max(Date.now(), (b.updatedAt ?? b.createdAt) + 1);
}

export function addBookmark(
  surah: number,
  ayah: number,
  page: number,
  color: BookmarkColor,
  /**
   * Whether the new bookmark follows the reading. Omitted means "what the
   * reader's default says" — `ask` counts as not following until they say
   * otherwise, because a place that moves without being asked for is
   * worse than one that does not move.
   */
  follows?: boolean,
): void {
  /**
   * BOOKMARKING AN AYAH DURING A FOLLOWING SESSION MOVES THAT BOOKMARK,
   * rather than leaving a second one behind (issue #54).
   *
   * Reported from the device: open a following bookmark, read on a few
   * pages, tap an ayah and bookmark it — and you left the muṣḥaf with TWO
   * bookmarks in the same colour, one on the ayah you chose and one where
   * the following bookmark had got to. Two marks for one place, and no way
   * to tell which was which.
   *
   * The gesture means "my place is here", which is what a following
   * bookmark is for; it is the same reading, said precisely. The bookmark
   * takes the ayah and the colour that was tapped, keeps `createdAt` so it
   * stays where it was in the list, and any other pin already on that ayah
   * gives way — one bookmark per ayah, as before.
   *
   * It asks reach for itself. It used to lean on `recordReading` having
   * released the session once the reading went far enough, which is no
   * longer something that happens — a bookmark owns its visit until the
   * visit ends. Bookmarking an ayah fifty pages away is a NEW place, not
   * this one said precisely, so the reach that decides whether reading
   * moves the bookmark decides this too.
   */
  const owner = readingSessionOwner();
  if (owner?.kind === 'bookmark') {
    const session = getQuranState().bookmarks.find(b => b.id === owner.id);
    if (session?.follows && withinBookmarkReach(session, { surah, page })) {
      const at = stampAfter(session);
      updateQuranState(prev => {
        // A pin that gave way is a pin the reader no longer has, and on
        // the other device it is still there — one bookmark per ayah has
        // to be true after the sync too, not just here. See
        // `bookmarksRemoved`.
        const gaveWay = prev.bookmarks.filter(
          b => b.id !== session.id && b.surah === surah && b.ayah === ayah,
        );
        return {
          ...prev,
          bookmarks: [
            ...prev.bookmarks.filter(
              b => b.id !== session.id && !(b.surah === surah && b.ayah === ayah),
            ),
            { ...session, surah, ayah, page, color, updatedAt: at },
          ],
          ...(gaveWay.length > 0
            ? {
                bookmarksRemoved: mergeRemovals(
                  prev.bookmarksRemoved,
                  gaveWay.map(b => ({ id: b.id, at: stampAfter(b) })),
                ),
              }
            : {}),
        };
      });
      // Put here on purpose, so it is drawn again.
      noteReadingPlaced();
      return;
    }
  }
  const now = Date.now();
  updateQuranState(prev => {
    /**
     * One bookmark per ayah: re-bookmarking is a RECOLOUR, and a recolour
     * keeps the bookmark's identity. It used to make a new one and drop
     * the old, which was two bugs: the visit it owned now named a dead
     * id, so the marker quietly took over — and on the other device the
     * old id was still there, so the sync produced two bookmarks on one
     * ayah. A following bookmark recoloured is still following; a new
     * colour is not a reason to lose a place that keeps itself.
     */
    const replaced = prev.bookmarks.find(b => b.surah === surah && b.ayah === ayah);
    const wants =
      follows ?? prev.prefs.bookmarkFollowDefault === 'follow';
    const base: QuranBookmark = replaced
      ? { ...replaced, page, color, updatedAt: stampAfter(replaced) }
      : {
          id: `${now}-${Math.floor(Math.random() * 1e6)}`,
          surah,
          ayah,
          page,
          color,
          createdAt: now,
        };
    const next: QuranBookmark =
      replaced?.follows || wants
        ? { ...base, follows: true, updatedAt: base.updatedAt ?? now }
        : base;
    // Same rule as above: anything else that was sitting on this ayah has
    // given way, and the other device has to be told rather than left to
    // hand it back.
    const gaveWay = prev.bookmarks.filter(
      b => b.id !== next.id && b.surah === surah && b.ayah === ayah,
    );
    return {
      ...prev,
      bookmarks: [
        ...prev.bookmarks.filter(b => !(b.surah === surah && b.ayah === ayah)),
        next,
      ],
      ...(gaveWay.length > 0
        ? {
            bookmarksRemoved: mergeRemovals(
              prev.bookmarksRemoved,
              gaveWay.map(b => ({ id: b.id, at: stampAfter(b) })),
            ),
          }
        : {}),
    };
  });
  /**
   * A BOOKMARK THAT FOLLOWS, MADE MID-READING, TAKES THE VISIT.
   *
   * Flipping the switch on an existing bookmark already does this
   * (`setBookmarkFollows`), and making one already flipped meant the same
   * thing and did not: the marker went on recording while the new
   * bookmark sat where it was made until the next visit — two places
   * kept for one reading, which is the duplicate this whole model exists
   * to avoid.
   *
   * Not from a khatmah visit. That reading belongs to the plan, and
   * marking an ayah inside it is a note, not a change of what is being
   * read.
   */
  const after = readingSessionOwner();
  const made = getQuranState().bookmarks.find(
    b => b.surah === surah && b.ayah === ayah,
  );
  if (made?.follows && (after == null || after.kind === 'reading')) {
    claimReadingSession({ kind: 'bookmark', id: made.id });
  }
}

export function removeBookmark(id: string): void {
  // An owner that no longer exists cannot own the visit.
  const owner = readingSessionOwner();
  if (owner?.kind === 'bookmark' && owner.id === id) releaseReadingOwner();
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.filter(b => b.id !== id),
    /**
     * The row goes; the REMOVAL stays, dated. Dropping the bookmark and
     * saying nothing else is what let the other device hand it back on
     * the next round — see `bookmarksRemoved`. Stamped past the copy it
     * buries, so a bookmark edited in the same millisecond somewhere else
     * does not survive on a tie.
     */
    bookmarksRemoved: mergeRemovals(prev.bookmarksRemoved, [
      {
        id,
        at: Math.max(
          Date.now(),
          (prev.bookmarks.find(b => b.id === id)?.updatedAt ?? 0) + 1,
        ),
      },
    ]),
  }));
}

/**
 * Switch a bookmark between a fixed pin and a place that keeps itself.
 *
 * Turning it ON while the reader is open hands the open visit to it —
 * "mark where I am, and keep tracking from here" is what that gesture
 * means. From the Qur'an tab's list, with no reader open, it is only a
 * setting, and `claimReadingSession` says so by doing nothing.
 */
export function setBookmarkFollows(id: string, follows: boolean): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b => {
      if (b.id !== id) return b;
      const next: QuranBookmark = { ...b, updatedAt: stampAfter(b) };
      if (follows) next.follows = true;
      else delete next.follows;
      return next;
    }),
  }));
  // Switching it ON hands this bookmark the open visit. Switching it OFF
  // does NOT hand the visit to anyone: the bookmark still owns it, it
  // just stops walking with the reading. Releasing it used to let the
  // marker take the turns, which is the duplicate place `recordReading`
  // exists to avoid.
  if (follows) claimReadingSession({ kind: 'bookmark', id });
}

/**
 * Put a bookmark on the Qur'an tab's doors card, or take it off — see
 * `QuranBookmark.shortcut`. A setting on the bookmark, nothing more: it
 * does not touch the visit.
 */
export function setBookmarkShortcut(id: string, shortcut: boolean): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b => {
      if (b.id !== id) return b;
      const next: QuranBookmark = { ...b, updatedAt: stampAfter(b) };
      if (shortcut) next.shortcut = true;
      else delete next.shortcut;
      return next;
    }),
  }));
}

/**
 * Give one bookmark the khatmah's slot on Home, or clear it — see
 * `QuranPrefs.homeBookmarkId`. One at a time by construction: the id
 * replaces whatever was there.
 */
export function setHomeBookmark(id: string | null): void {
  setQuranPrefs({ homeBookmarkId: id ?? '' });
}

/**
 * How far a following bookmark can be read from before the visit is no
 * longer its reading. Anywhere in the SAME SURAH counts — Al-Baqarah is
 * forty-eight pages and reading it end to end is one reading — and a
 * few pages past its end, for the turn that crosses into the next one.
 * Beyond that the reader has gone to look something up, and dragging the
 * bookmark after them would lose the place it was keeping.
 */
export const BOOKMARK_PAGE_REACH = 3;

/**
 * A SCRUB IS THE READER SAYING "MY READING IS HERE NOW" — so a following
 * bookmark goes with it.
 *
 * Reported from the device: scrub to a page, read on from there, and
 * nothing was saved. Two reasons, and both were right on their own. The
 * jump records no reading by design — "a turn is reading; a jump is not"
 * (#41), which is what stops a glance at the index stealing your place.
 * And the first real turn after the jump was then far outside the
 * bookmark's reach, so the session was released and the marker took it:
 * correct for someone who swiped off to look something up, wrong for
 * someone who deliberately went to where they meant to read.
 *
 * Scrubbing is not browsing. It is a destination chosen on purpose, and
 * inside a following session it moves that bookmark rather than losing
 * it — which also puts reach back around the new page, so the reading
 * that follows keeps being tracked.
 *
 * IT IS NOT DRAWN THERE, THOUGH. What the reader chose was a PAGE, and
 * the ayah this lands on is only whichever one that page happens to
 * start with — washing it says "you marked this line" about a line
 * nobody picked, which is the same noise the wash was taken off page
 * turns to avoid. So the position is recorded and the anchor goes out,
 * exactly as it does when reading carries the bookmark along. The wash
 * is for an ayah that was actually chosen: the one the visit opened on,
 * or one the reader bookmarked by hand.
 *
 * Only the session's bookmark. With nothing owning the visit a jump still
 * records nothing at all, exactly as before: `lastRead` waits for a turn.
 */
export function moveSessionToPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  const owner = readingSessionOwner();
  if (owner?.kind !== 'bookmark') return;
  const b = getQuranState().bookmarks.find(x => x.id === owner.id);
  if (!b?.follows) return;
  const first = firstAyahOfPage(page, riwayah);
  moveBookmark(b.id, { surah: first.surah, ayah: first.ayah, page });
  noteReadingMoved();
}

function withinBookmarkReach(
  b: QuranBookmark,
  pos: { surah: number; page: number },
): boolean {
  return pos.surah === b.surah || Math.abs(pos.page - b.page) <= BOOKMARK_PAGE_REACH;
}

function moveBookmark(
  id: string,
  pos: { surah: number; ayah: number; page: number },
): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b =>
      b.id === id
        ? { ...b, surah: pos.surah, ayah: pos.ayah, page: pos.page, updatedAt: stampAfter(b) }
        : b,
    ),
  }));
}

export function findBookmark(
  s: QuranState,
  surah: number,
  ayah: number,
): QuranBookmark | undefined {
  return s.bookmarks.find(b => b.surah === surah && b.ayah === ayah);
}
