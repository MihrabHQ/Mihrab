/**
 * Issue #68 — turning mushaf pages with the volume buttons.
 *
 * The buttons are the phone's, so the rule that matters most is when they
 * are NOT taken: setting off, a tablet or iPhone, another screen in front,
 * an āyah selected (the sheet), the jump card open. Only the muṣḥaf with
 * nothing selected takes them.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  touchLockActive,
  volumeKeyDirection,
  volumeKeysShouldTurnPages,
} from '../src/quran/useVolumeKeyPaging';

const ALL_TRUE = {
  enabled: true,
  available: true,
  focused: true,
  sheetOpen: false,
  jumpOpen: false,
};

describe('when the volume buttons turn pages', () => {
  it('does, with the setting on, on a phone, in the reader, nothing selected', () => {
    expect(volumeKeysShouldTurnPages(ALL_TRUE)).toBe(true);
  });

  it.each([
    ['the setting is off', { enabled: false }],
    ['the device cannot (tablet, iPhone)', { available: false }],
    ['another screen is in front', { focused: false }],
    ['an ayah is selected', { sheetOpen: true }],
    ['the jump card is open', { jumpOpen: true }],
  ])('does not when %s', (_name, change) => {
    expect(volumeKeysShouldTurnPages({ ...ALL_TRUE, ...change })).toBe(false);
  });
});

describe('which way a button turns (#72)', () => {
  it('volume down is the next page, up the previous', () => {
    expect(volumeKeyDirection('down', false)).toBe(1);
    expect(volumeKeyDirection('up', false)).toBe(-1);
  });

  it('and the other way round when asked', () => {
    expect(volumeKeyDirection('up', true)).toBe(1);
    expect(volumeKeyDirection('down', true)).toBe(-1);
  });
});

describe('the touch lock (#72)', () => {
  it('holds only while the buttons turn pages', () => {
    expect(touchLockActive({ paging: true, lock: true, available: true })).toBe(true);
    // Never a page nothing can turn:
    expect(touchLockActive({ paging: false, lock: true, available: true })).toBe(false);
    expect(touchLockActive({ paging: true, lock: true, available: false })).toBe(false);
    expect(touchLockActive({ paging: true, lock: false, available: true })).toBe(false);
  });

  it('stops the swipe and the taps, and a hold brings the controls', () => {
    const phone = readFileSync(path.join(__dirname, '..', 'src/quran/MushafPhoneReader.tsx'), 'utf8');
    expect(phone).toMatch(/scrollEnabled=\{!locked\}/);
    expect(phone).toMatch(/const onTap = locked \? undefined : onToggleFullscreen;/);
    expect(phone).toMatch(/const onHold = locked \? onToggleFullscreen : undefined;/);
    expect(phone).toMatch(/onWordPress=\{locked \? undefined : onWordPress\}/);
    // And says so when touched, rather than look broken.
    expect(phone).toMatch(/if \(locked\) showLockHint\(\);/);
  });
});

describe('the setting', () => {
  const root = path.join(__dirname, '..');
  const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

  it('is off by default and only an explicit true turns it on', () => {
    const state = read('src/quran/quranState.ts');
    expect(state).toMatch(/volumeKeyPaging: false/);
    expect(state).toMatch(/volumeKeyPaging\s*===\s*true/);
  });

  it('is offered only where it can work', () => {
    const card = read('src/screens/settings/QuranCard.tsx');
    expect(card).toMatch(/volumeKeysAvailable\s*\?/);
  });

  it('offers the direction and the lock only with the buttons on (#72)', () => {
    const card = read('src/screens/settings/QuranCard.tsx');
    expect(card).toMatch(
      /\{quran\.prefs\.volumeKeyPaging \? \([\s\S]{0,400}settings-volume-keys-up-forward[\s\S]{0,800}settings-volume-keys-touch-lock/,
    );
  });

  it('keeps up-for-forward for anyone who had the buttons on before #72', () => {
    const state = read('src/quran/quranState.ts');
    expect(state).toMatch(/volumeKeyUpForward: false,\s*\n\s*volumeKeyTouchLock: false,/);
    expect(state).toMatch(
      /if \(typeof p\?\.volumeKeyUpForward === 'boolean'\) return p\.volumeKeyUpForward;\s*return p\?\.volumeKeyPaging === true;/,
    );
  });
});

describe('the native side', () => {
  const root = path.join(__dirname, '..');
  const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
  const kt = (f: string) =>
    read(`android/app/src/main/java/com/prayer_times/${f}`);

  it('is registered, and named the way JS asks for it', () => {
    expect(kt('MainApplication.kt')).toContain('VolumeKeysPackage()');
    expect(kt('VolumeKeysModule.kt')).toContain('"MihrabVolumeKeys"');
    expect(read('src/native/volumeKeys.ts')).toContain(
      'NativeModules.MihrabVolumeKeys',
    );
  });

  it('takes the buttons only while JS has asked, and starts cleared', () => {
    const mod = kt('VolumeKeysModule.kt');
    expect(mod).toMatch(/if \(!captured \|\| !isVolumeKey\(keyCode\)\) return false/);
    expect(mod).toMatch(/captured = false/);
  });

  it('turns one page per press, not one per repeat', () => {
    expect(kt('VolumeKeysModule.kt')).toMatch(
      /ACTION_DOWN && event\.repeatCount == 0/,
    );
  });

  it('hands both press and release to it from the activity', () => {
    const main = kt('MainActivity.kt');
    expect(main).toMatch(/onKeyDown[\s\S]*VolumeKeysModule\.handle/);
    expect(main).toMatch(/onKeyUp[\s\S]*VolumeKeysModule\.handle/);
  });
});
