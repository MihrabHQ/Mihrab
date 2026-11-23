/**
 * One of the phone's alarm sounds instead of an adhan (#135: "in some
 * places we might like to use an alarm instead of Adhan … instead of using
 * any custom audio file"). Android's own sound picker; what it returns is
 * imported exactly like a chosen file, so it plays through the same
 * channels — the alarm stream and the full-screen alarm included.
 */
import fs from 'fs';
import path from 'path';

const kt = fs.readFileSync(
  path.join(__dirname, '../android/app/src/main/java/com/prayer_times/CustomAdhanModule.kt'),
  'utf8',
);

describe('the native picker', () => {
  const fn = kt.slice(kt.indexOf('fun pickSystemSound'), kt.indexOf('private fun systemSoundName'));

  it('is the system’s own sound picker, on the alarm sounds, with no "default" and no silence', () => {
    expect(fn).toContain('Intent(RingtoneManager.ACTION_RINGTONE_PICKER)');
    expect(fn).toContain('putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)');
    expect(fn).toContain('putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, false)');
    expect(fn).toContain('putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)');
    expect(fn).toContain('startActivityForResult(intent, SYSTEM_PICK_REQUEST)');
  });

  it('what it returns is copied in like a file, under the sound’s own name', () => {
    expect(kt).toContain('data?.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)');
    expect(kt).toMatch(/if \(requestCode == SYSTEM_PICK_REQUEST\) importFrom\(uri, systemSoundName\(uri\)\)/);
    expect(kt).toContain('val name = knownName ?: queryDisplayName(uri) ?: "adhan"');
  });

  it('asks for no permission', () => {
    const manifest = fs.readFileSync(path.join(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toContain('READ_MEDIA_AUDIO');
    // The storage permission a library brings is removed, and stays so.
    expect(manifest).toMatch(/android\.permission\.READ_EXTERNAL_STORAGE"\s+tools:node="remove"/);
  });
});

describe('the JS side', () => {
  function load(os: 'android' | 'ios', pickSystemSound?: jest.Mock) {
    jest.resetModules();
    const RN = require('react-native');
    RN.Platform.OS = os;
    RN.NativeModules.CustomAdhan = {
      pick: jest.fn(),
      current: jest.fn(async () => null),
      remove: jest.fn(),
      ensureChannel: jest.fn(),
      ensureAlarmChannel: jest.fn(),
      deleteChannel: jest.fn(),
      ...(pickSystemSound ? { pickSystemSound } : {}),
    };
    return require('../src/native/CustomAdhan') as typeof import('../src/native/CustomAdhan');
  }

  afterEach(() => {
    const RN = require('react-native');
    delete RN.NativeModules.CustomAdhan;
  });

  it('Android: imports the picked sound and hands back what was imported', async () => {
    const pick = jest.fn(async () => ({ name: 'Argon.ogg', token: 'abc123', channelId: 'prayer-times-adhan-custom-abc123', durationMs: 4000 }));
    const m = load('android', pick);
    expect(m.SYSTEM_SOUND_SUPPORTED).toBe(true);
    await expect(m.pickSystemAlarmSound('A sound from this phone')).resolves.toMatchObject({ name: 'Argon.ogg', token: 'abc123' });
    expect(pick).toHaveBeenCalledWith('A sound from this phone');
  });

  it('a cancelled picker is nothing, not an error', async () => {
    const m = load('android', jest.fn(async () => null));
    await expect(m.pickSystemAlarmSound(null)).resolves.toBeNull();
  });

  it('not offered on iOS, nor on a build without the native method', () => {
    expect(load('ios', jest.fn()).SYSTEM_SOUND_SUPPORTED).toBe(false);
    expect(load('android').SYSTEM_SOUND_SUPPORTED).toBe(false);
  });
});

describe('the strings', () => {
  it('in all thirteen languages', () => {
    const dir = path.join(__dirname, '../src/i18n/locales');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(typeof j.settings.notificationSoundSystem).toBe('string');
      expect(typeof j.settings.notificationSoundSystemHelp).toBe('string');
    }
  });
});
