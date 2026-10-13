/**
 * Volume up / down turn the muṣḥaf's page — issue #68.
 *
 * The buttons are taken ONLY while all of these hold: the reader has the
 * setting on, this is an Android phone, the reader's screen is the one in
 * front, and nothing is selected — no āyah sheet and no jump card. Select
 * an āyah, or leave the muṣḥaf, and they are the phone's again at once; the
 * cleanup gives them back on every one of those, so a path out that nobody
 * thought of still ends with working volume.
 */
import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  onVolumeKey,
  setVolumeKeysCaptured,
  volumeKeysAvailable,
} from '../native/volumeKeys';

export function volumeKeysShouldTurnPages(input: {
  enabled: boolean;
  available: boolean;
  focused: boolean;
  sheetOpen: boolean;
  jumpOpen: boolean;
}): boolean {
  return (
    input.enabled &&
    input.available &&
    input.focused &&
    !input.sheetOpen &&
    !input.jumpOpen
  );
}

/**
 * What the reading lock lets through (#72, #75).
 *
 * The lock used to need the volume buttons — "a locked page would be a
 * page nothing could turn" — which made it Android-only and made every
 * tap on the page dead. Both were the wrong trade: the page CAN be turned,
 * by unlocking (a hold on the badge), and somebody holding a page still
 * wants the āyah under their finger. So the lock is its own switch on
 * every platform; the words stay live unless the freeze is asked for; and
 * the volume buttons, where they exist and are on, keep turning the page.
 */
export type ReadingLock = {
  /** Swipes, the tap-to-toggle, the footer and the jump do nothing. */
  locked: boolean;
  /** A tap or a hold on a word still opens its āyah. */
  wordsLive: boolean;
  /** The volume buttons turn the locked page (Android, paging on). */
  buttonsTurn: boolean;
};

export function readingLock(input: {
  lock: boolean;
  freeze: boolean;
  paging: boolean;
  available: boolean;
}): ReadingLock {
  const locked = input.lock;
  return {
    locked,
    wordsLive: !locked || !input.freeze,
    buttonsTurn: locked && input.paging && input.available,
  };
}

/**
 * Which way a button turns: volume DOWN is the next page unless the reader
 * has asked for up (#72) — down-for-forward is the grip most people read
 * with, the thumb resting on the lower button.
 */
export function volumeKeyDirection(key: 'up' | 'down', upForward: boolean): 1 | -1 {
  const forward = upForward ? 'up' : 'down';
  return key === forward ? 1 : -1;
}

export function useVolumeKeyPaging(
  enabled: boolean,
  sheetOpen: boolean,
  jumpOpen: boolean,
  /** +1 = next page, -1 = previous, in reading direction. */
  turnPage: (dir: 1 | -1) => void,
  upForward: boolean = false,
): void {
  const focused = useIsFocused();
  const on = volumeKeysShouldTurnPages({
    enabled,
    available: volumeKeysAvailable,
    focused,
    sheetOpen,
    jumpOpen,
  });
  useEffect(() => {
    if (!on) return undefined;
    setVolumeKeysCaptured(true);
    const off = onVolumeKey(key => turnPage(volumeKeyDirection(key, upForward)));
    return () => {
      off();
      setVolumeKeysCaptured(false);
    };
  }, [on, turnPage, upForward]);
}
