/**
 * The reading lock — issue #75 (on top of #72).
 *
 * Its own switch on every platform; the words stay live unless frozen; a
 * hold on the badge unlocks and a tap does not; the first lock explains
 * itself once; and somebody who locked the page under the old key stays
 * locked.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'fs';
import path from 'path';
import { readingLock } from '../src/quran/useVolumeKeyPaging';
import { HOLD_MS, ReadingLockBadge } from '../src/quran/ReadingLockBadge';
import { coerceQuranState } from '../src/quran/quranState';

jest.mock('../src/polish/haptics', () => ({ hapticTick: jest.fn(async () => undefined) }));

const root = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('what the lock lets through', () => {
  it('is its own switch — no buttons needed', () => {
    const l = readingLock({ lock: true, freeze: false, paging: false, available: false });
    expect(l.locked).toBe(true);
    expect(l.wordsLive).toBe(true);
    expect(l.buttonsTurn).toBe(false);
  });
  it('keeps the words live unless frozen', () => {
    expect(readingLock({ lock: true, freeze: true, paging: false, available: false }).wordsLive).toBe(false);
    // Unlocked, the freeze means nothing.
    expect(readingLock({ lock: false, freeze: true, paging: false, available: false }).wordsLive).toBe(true);
  });
});

describe('the badge', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function mount(onUnlock: () => void, onHint: () => void): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <ReadingLockBadge
          testID="badge"
          ink="#111"
          ground="#fff"
          onUnlock={onUnlock}
          onHint={onHint}
        />,
      );
    });
    return r;
  }

  it('unlocks after a full hold, and not a moment before', () => {
    const onUnlock = jest.fn();
    const onHint = jest.fn();
    const r = mount(onUnlock, onHint);
    const badge = r.root.findAll(n => typeof n.props.onPressIn === 'function' && n.props.testID === 'badge')[0];
    act(() => badge.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_MS - 50));
    expect(onUnlock).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(60));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    // The release after the unlock is not a tap.
    act(() => badge.props.onPressOut());
    expect(onHint).not.toHaveBeenCalled();
  });

  it('a tap, or a hold let go early, asks for the hint instead', () => {
    const onUnlock = jest.fn();
    const onHint = jest.fn();
    const r = mount(onUnlock, onHint);
    const badge = r.root.findAll(n => typeof n.props.onPressIn === 'function' && n.props.testID === 'badge')[0];
    act(() => badge.props.onPressIn());
    act(() => jest.advanceTimersByTime(300));
    act(() => badge.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_MS * 2));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(onHint).toHaveBeenCalledTimes(1);
  });
});

describe('the bar button', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('locks on a tap, unlocks on a hold, and the lift after the hold does not re-lock', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MushafLockButton } = require('../src/quran/mushafReaderCore');
    const onLock = jest.fn();
    const onUnlock = jest.fn();
    const onHint = jest.fn();
    let r!: ReactTestRenderer;
    const render = (locked: boolean) => (
      <MushafLockButton
        color="#000"
        backgroundColor="#fff"
        locked={locked}
        onLock={onLock}
        onUnlock={onUnlock}
        onHint={onHint}
      />
    );
    act(() => {
      r = create(render(false));
    });
    const btn = () =>
      r.root.findAll(n => typeof n.props.onPressIn === 'function' && n.props.testID === 'mushaf-lock-button')[0];
    // A tap locks.
    act(() => btn().props.onPressIn());
    act(() => btn().props.onPressOut());
    act(() => btn().props.onPress());
    expect(onLock).toHaveBeenCalledTimes(1);
    act(() => r.update(render(true)));
    // A hold unlocks; the parent re-renders it unlocked while the finger is down.
    act(() => btn().props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_MS + 10));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    act(() => r.update(render(false)));
    act(() => btn().props.onPressOut());
    act(() => btn().props.onPress());
    expect(onLock).toHaveBeenCalledTimes(1);
    // The next tap locks again.
    act(() => btn().props.onPressIn());
    act(() => btn().props.onPressOut());
    act(() => btn().props.onPress());
    expect(onLock).toHaveBeenCalledTimes(2);
  });
});

describe('the stored preference', () => {
  it('reads the old key as the new one, so a locked page stays locked', () => {
    const old = coerceQuranState({ prefs: { volumeKeyTouchLock: true } } as never);
    expect(old.prefs.touchLock).toBe(true);
    expect(old.prefs.touchLockFreeze).toBe(false);
    const fresh = coerceQuranState({ prefs: {} } as never);
    expect(fresh.prefs.touchLock).toBe(false);
    const named = coerceQuranState({ prefs: { touchLock: false, volumeKeyTouchLock: true } } as never);
    expect(named.prefs.touchLock).toBe(false);
  });
});

describe('the lock button', () => {
  it('is off by default', () => {
    expect(coerceQuranState({ prefs: {} } as never).prefs.lockButton).toBe(false);
  });
  it('stays for whoever had a use for it before it was a setting', () => {
    expect(coerceQuranState({ prefs: { volumeKeyPaging: true } } as never).prefs.lockButton).toBe(true);
    expect(coerceQuranState({ prefs: { touchLock: true } } as never).prefs.lockButton).toBe(true);
    expect(coerceQuranState({ prefs: { volumeKeyTouchLock: true } } as never).prefs.lockButton).toBe(true);
    expect(
      coerceQuranState({ prefs: { volumeKeyPaging: true, lockButton: false } } as never).prefs.lockButton,
    ).toBe(false);
  });
  it('comes on with the volume buttons, and has its own switch', () => {
    const src = read('src/screens/settings/QuranCard.tsx');
    expect(src).toMatch(/next \? \{ volumeKeyPaging: true, lockButton: true \} : \{ volumeKeyPaging: false \}/);
    expect(src).toMatch(/testID="settings-lock-button"[\s\S]{0,300}setQuranPrefs\(\{ lockButton: next \}\)/);
  });
  it('is shown only when asked for, or on a locked page', () => {
    expect(read('src/quran/MushafPhoneReader.tsx')).toMatch(
      /\{core\.quran\.prefs\.lockButton \|\| locked \? \(\s*<MushafLockButton/,
    );
    expect(read('src/quran/mushafReaderCore.tsx')).toMatch(/if \(!lockButton && !locked\) return null;/);
  });
});

describe('the readers', () => {
  it('keep the words live on a locked page, and drop them only for the freeze', () => {
    for (const f of ['src/quran/MushafPhoneReader.tsx', 'src/quran/MushafSpreadReader.tsx']) {
      const src = read(f);
      expect(src).toMatch(/onWordPress=\{wordsLive \? onWordPress : undefined\}/);
      expect(src).toMatch(/onWordLongPress=\{wordsLive \? onWordPress : undefined\}/);
      expect(src).toMatch(/scrollEnabled=\{!locked\}/);
      // The badge rides in the fullscreen band (MushafPageHeader), fed from
      // here; the bar button locks on a tap and unlocks on a hold.
      expect(src).toMatch(/const lockBadge = useMemo\([\s\S]{0,300}onUnlock: \(\) => setLock\(false\)/);
    }
    // The phone's lock is in its page bar; the spread's is in the screen
    // header, because an upright iPad has no bar to carry it.
    expect(read('src/quran/MushafPhoneReader.tsx')).toMatch(
      /<MushafLockButton[\s\S]{0,400}onLock=\{\(\) => setLock\(true\)\}[\s\S]{0,100}onUnlock=\{\(\) => setLock\(false\)\}/,
    );
    expect(read('src/screens/quran/MushafSurahScreen.tsx')).toMatch(
      /\{DEVICE_CLASS !== 'phone' \? \(\s*<MushafLockHeaderButton/,
    );
  });

  it('puts the badge in the fullscreen band, and the bar button needs a hold to unlock', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/\{lock \? \([\s\S]{0,200}<ReadingLockBadge/);
    expect(core).toMatch(/const hold = useHoldToUnlock\(unlock, onHint\);[\s\S]{0,900}if \(locked\) hold\.begin\(\);[\s\S]{0,200}if \(locked\) hold\.end\(\);/);
    // The lift that ends the unlocking hold must not be the tap that locks.
    expect(core).toMatch(/if \(locked \|\| unlockedByThisTouch\.current\) return;\s*onLock\(\);/);
  });

  it('lets a swipe along a line go, locked or not', () => {
    const page = read('src/quran/MushafTextPage.tsx');
    expect(page).toMatch(/if \(!tap\.wasTap\(e\)\) return;/);
  });

  it('frozen, the lines are not touch targets, so a hold on the words still brings the chrome', () => {
    const page = read('src/quran/MushafTextPage.tsx');
    expect(page).toMatch(/const inert = !onWordPress && !onWordLongPress;[\s\S]{0,200}pointerEvents=\{inert \? 'none' : 'auto'\}/);
    // ...and the surface does not wrap an absent handler into a present one.
    const surface = read('src/quran/MushafTextPageSurface.tsx');
    expect(surface).toMatch(/onWordPress=\{onWordPress \? handleWordPress : undefined\}/);
    expect(surface).toMatch(/onWordLongPress=\{onWordLongPress \? handleWordLongPress : undefined\}/);
  });

  it('takes the back swipe with the page swipe, so a locked page stays', () => {
    const screen = read('src/screens/quran/MushafSurahScreen.tsx');
    expect(screen).toMatch(/const gestureEnabled = !isMacCatalyst && !quran\.prefs\.touchLock;/);
  });

  it('locks the rail too — the strip under the thumb', () => {
    const rail = read('src/quran/MushafPageScrubber.tsx');
    expect(rail).toMatch(/\{\.\.\.\(locked \? \{ onTouchStart: onLockedTouch \} : pan\.panHandlers\)\}/);
    expect(rail).toMatch(/onPress=\{locked \? onLockedTouch : onOpenJump\}/);
    expect(read('src/quran/MushafPhoneReader.tsx')).toMatch(/locked=\{locked\}\s*onLockedTouch=/);
  });

  it('explains itself the first time, once per device', () => {
    const phone = read('src/quran/MushafPhoneReader.tsx');
    expect(phone).toMatch(/LOCK_EXPLAINED_KEY = 'mihrab\.quran\.touchLockExplained\.v1'/);
    expect(phone).toMatch(/AsyncStorage\.getItem\(LOCK_EXPLAINED_KEY\)[\s\S]{0,300}showLockHint\('explain'\)/);
  });

  it('is offered in Settings on every platform, with the freeze under it', () => {
    const card = read('src/screens/settings/QuranCard.tsx');
    expect(card).toMatch(/settings-touch-lock"[\s\S]{0,600}\{quran\.prefs\.touchLock \? \([\s\S]{0,200}settings-touch-lock-freeze/);
    // Not inside the Android-only volume-keys block any more.
    expect(card).not.toMatch(/settings-volume-keys-touch-lock/);
  });
});
