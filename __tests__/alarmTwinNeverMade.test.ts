/**
 * #129 — "Alert Sound 'Default notification' & Prayer Sound to Adhan causes
 * no notification".
 *
 * With the adhan set to play on a silenced phone, a prayer set to Adhan is
 * addressed to the alarm-stream twin of its channel. For the system's own
 * tone the twin was never made (there was no sound to attach), and a
 * notification posted to a channel that does not exist is dropped by
 * Android without a trace. Now the twin is made for that tone too, and one
 * that could not be made is not addressed.
 */
import fs from 'fs';
import path from 'path';
import {
  alarmChannelId,
  registerAlarmTwin,
  registerCustomAdhan,
  resolveSoundTargets,
  SYSTEM_DEFAULT_ALARM_SOUND,
} from '../src/notifications/notificationSounds';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

afterEach(() => {
  registerAlarmTwin(undefined);
  registerCustomAdhan(null);
});

describe('a notification is never addressed to a twin that was not made', () => {
  const base = 'prayer-times-default';

  it('trusts the twin before anyone has tried this run, as it always did', () => {
    expect(resolveSoundTargets('default', true).androidChannelId).toBe(alarmChannelId(base));
  });

  it('uses the twin once it has been made', () => {
    registerAlarmTwin(alarmChannelId(base));
    expect(resolveSoundTargets('default', true).androidChannelId).toBe(alarmChannelId(base));
  });

  it('falls back to the ordinary channel — which exists — when making it failed', () => {
    registerAlarmTwin(null);
    expect(resolveSoundTargets('default', true).androidChannelId).toBe(base);
    expect(resolveSoundTargets('adhan_makkah', true).androidChannelId).toBe('prayer-times-adhan-makkah');
    // An imported recording whose file has gone: the default channel, not its twin.
    expect(resolveSoundTargets('custom', true).androidChannelId).toBe(base);
  });

  it('does not address another sound\'s twin: only the one that stands', () => {
    registerAlarmTwin(alarmChannelId('prayer-times-adhan-makkah'));
    expect(resolveSoundTargets('adhan_makkah', true).androidChannelId).toBe('prayer-times-adhan-makkah-alarm');
    expect(resolveSoundTargets('default', true).androidChannelId).toBe(base);
  });

  it('is asked of nothing when the alarm stream is not wanted', () => {
    registerAlarmTwin(null);
    expect(resolveSoundTargets('default').androidChannelId).toBe(base);
  });
});

describe('the twin of the system\'s own tone', () => {
  const sync = read('src/notifications/prayerNotifications.ts');
  const native = read('android/app/src/main/java/com/prayer_times/CustomAdhanModule.kt');

  it('is made with the phone\'s notification tone, not handed over as "the imported recording"', () => {
    expect(SYSTEM_DEFAULT_ALARM_SOUND).toBe('@default');
    expect(sync).toContain('imported ? null : option.androidSound ?? SYSTEM_DEFAULT_ALARM_SOUND,');
    expect(native).toContain('const val SYSTEM_DEFAULT_SOUND = "@default"');
    expect(native).toMatch(/if \(soundResName == SYSTEM_DEFAULT_SOUND\) \{[\s\S]*?RingtoneManager\.getDefaultUri\(RingtoneManager\.TYPE_NOTIFICATION\)/);
    // Before the recording's branch: null still means the recording.
    expect(native.indexOf('soundResName == SYSTEM_DEFAULT_SOUND')).toBeLessThan(native.indexOf('soundResName.isNullOrBlank()'));
  });

  it('is reported either way, before any notification is scheduled against it', () => {
    expect(sync).toMatch(/const made = await ensureAlarmAdhanChannel\([\s\S]*?registerAlarmTwin\(made\);/);
    expect(sync).toMatch(/await deleteAdhanChannel\(alarmId\);\s*registerAlarmTwin\(undefined\);/);
    // The channels are settled before the first target is resolved for an event.
    expect(sync.indexOf('await ensureChannel(params.notificationSound, useAlarmStream);')).toBeLessThan(
      sync.indexOf('const eventTargets = resolveSoundTargets('),
    );
  });
});
