import {
  DEFAULT_GARMIN_WATCH,
  GARMIN_OPT,
  coerceGarminWatch,
  garminOptionFlags,
  normalizeWatchAddress,
} from '../src/settings/garminWatch';

describe('the Garmin watch setting', () => {
  it('reads a Bluetooth address as Gadgetbridge shows it, or refuses it', () => {
    expect(normalizeWatchAddress('d4:3a:2c:11:22:ff')).toBe('D4:3A:2C:11:22:FF');
    expect(normalizeWatchAddress(' D4-3A-2C-11-22-FF ')).toBe('D4:3A:2C:11:22:FF');
    expect(normalizeWatchAddress('D4:3A:2C:11:22')).toBeNull();
    expect(normalizeWatchAddress('not an address')).toBeNull();
    expect(normalizeWatchAddress('')).toBeNull();
  });

  it('coerces a stored blob to off and empty, never undefined', () => {
    expect(coerceGarminWatch(undefined)).toEqual(DEFAULT_GARMIN_WATCH);
    expect(coerceGarminWatch({ enabled: 'yes', address: 7 })).toEqual(DEFAULT_GARMIN_WATCH);
    expect(coerceGarminWatch({ enabled: true, address: 'D4:3A:2C:11:22:FF' })).toEqual({
      ...DEFAULT_GARMIN_WATCH,
      enabled: true,
      address: 'D4:3A:2C:11:22:FF',
    });
  });

  it('reads what the watch shows, and a blob from before the choice as everything shown', () => {
    const old = coerceGarminWatch({ enabled: true, address: 'D4:3A:2C:11:22:FF' });
    expect(old).toMatchObject({ faceDate: 'gregorian', faceSteps: true, faceWeather: true, faceSeconds: true, fieldProgress: false });
    expect(
      coerceGarminWatch({ faceDate: 'both', faceSteps: false, faceWeather: false, faceSeconds: false, fieldProgress: true }),
    ).toMatchObject({ faceDate: 'both', faceSteps: false, faceWeather: false, faceSeconds: false, fieldProgress: true });
    expect(coerceGarminWatch({ faceDate: 'lunar', faceSteps: 'no' }).faceDate).toBe('gregorian');
    expect(coerceGarminWatch({ faceSteps: 'no' }).faceSteps).toBe(true);
  });
});

describe('what the watch is told to show', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const watch = read('garmin', 'shared', 'source', 'Mihrab.mc');
  const kotlin = read('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', 'GarminWatch.kt');

  it('is 0 for the face as it always was, so a watch never told shows that', () => {
    expect(garminOptionFlags(DEFAULT_GARMIN_WATCH)).toBe(0);
  });

  it('sets one bit for each thing left off or added, and the date in two', () => {
    const w = { ...DEFAULT_GARMIN_WATCH };
    expect(garminOptionFlags({ ...w, faceSteps: false })).toBe(1);
    expect(garminOptionFlags({ ...w, faceWeather: false })).toBe(2);
    expect(garminOptionFlags({ ...w, faceSeconds: false })).toBe(4);
    expect(garminOptionFlags({ ...w, faceDate: 'hijri' })).toBe(8);
    expect(garminOptionFlags({ ...w, faceDate: 'both' })).toBe(16);
    expect(garminOptionFlags({ ...w, fieldProgress: true })).toBe(32);
    expect(
      garminOptionFlags({ ...w, faceSteps: false, faceWeather: false, faceSeconds: false, faceDate: 'both', fieldProgress: true }),
    ).toBe(1 + 2 + 4 + 16 + 32);
  });

  it('uses the bits the watch reads', () => {
    const bit = (name: string) => Number(watch.match(new RegExp(`const ${name} = (\\d+);`))![1]);
    expect(bit('OPT_NO_STEPS')).toBe(GARMIN_OPT.noSteps);
    expect(bit('OPT_NO_WEATHER')).toBe(GARMIN_OPT.noWeather);
    expect(bit('OPT_NO_SECONDS')).toBe(GARMIN_OPT.noSeconds);
    expect(bit('OPT_DATE_SHIFT')).toBe(GARMIN_OPT.dateShift);
    expect(bit('OPT_FIELD_PROGRESS')).toBe(GARMIN_OPT.fieldProgress);
  });

  it('travels in a second message, after the times and never in place of them', () => {
    // The watch: a message with "x" is the second one, read before the
    // times are looked for — an older watch app finds no "t" and drops it.
    expect(watch).toMatch(/if \(data\.get\("x"\) != null\) \{\s*return storeExtras\(data\);/);
    // The phone: the times to every app first, then the second message.
    expect(kotlin).toContain('for (payload in listOfNotNull(message, extras)) {');
    expect(kotlin).toContain('JSONObject().put("v", 2).put("x", 1).put("o", options)');
    // The night marks' kinds are the same three on both sides.
    expect(kotlin).toContain('mapOf("Midnight" to 1, "Lastthird" to 2, "Firstthird" to 3)');
    for (const [name, kind] of [['NIGHT_MIDNIGHT', 1], ['NIGHT_LAST_THIRD', 2], ['NIGHT_FIRST_THIRD', 3]] as const) {
      expect(watch).toContain(`const ${name} = ${kind};`);
    }
  });

  it('has an install for each watch app the build carries', () => {
    expect(kotlin).toMatch(/"face" to "mihrab-face\.prg",\s*"widget" to "mihrab-widget\.prg",\s*"field" to "mihrab-field\.prg"/);
    const gradle = read('android', 'app', 'build.gradle');
    for (const prg of ['mihrab-face.prg', 'mihrab-widget.prg', 'mihrab-field.prg']) {
      expect(gradle).toContain(`include '${prg}'`);
    }
  });
});

describe('garminAccentHex', () => {
  const { garminAccentHex, GARMIN_PRESET_ACCENTS } = require('../src/settings/garminWatch');
  const palette = /^#(00|55|AA|FF){3}$/;

  it('gives every preset a colour the watch screen shows as it is', () => {
    for (const hex of Object.values(GARMIN_PRESET_ACCENTS) as string[]) {
      expect(hex).toMatch(palette);
    }
    expect(garminAccentHex('green', '')).toBe('#00AA55');
    expect(garminAccentHex('amber', '')).toBe('#FFAA00');
  });

  it('makes a custom colour legible on black', () => {
    const hex = garminAccentHex('custom', '#101010');
    expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(hex.toLowerCase()).not.toBe('#101010');
  });
});
