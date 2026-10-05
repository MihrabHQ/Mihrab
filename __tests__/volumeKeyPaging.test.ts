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
import { volumeKeysShouldTurnPages } from '../src/quran/useVolumeKeyPaging';

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
