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

export function useVolumeKeyPaging(
  enabled: boolean,
  sheetOpen: boolean,
  jumpOpen: boolean,
  /** +1 = next page, -1 = previous, in reading direction. */
  turnPage: (dir: 1 | -1) => void,
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
    const off = onVolumeKey(direction => turnPage(direction === 'up' ? 1 : -1));
    return () => {
      off();
      setVolumeKeysCaptured(false);
    };
  }, [on, turnPage]);
}
