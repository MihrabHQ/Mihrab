/**
 * The full-screen prayer alert's switch, as one hook — issue #63.
 *
 * Settings → Notifications and the first-run walkthrough both offer it, and
 * the rules are not trivial (Android's revocable full-screen permission,
 * iOS's system prompt, the "blocked" state that only system settings can
 * clear), so they live here once rather than twice.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  canUseFullScreenAlarm,
  fullScreenAlarmAvailable,
  openFullScreenAlarmSettings,
} from '../native/FullScreenAlarm';
import {
  prayerAlarmAccess,
  prayerAlarmsAvailable,
  requestPrayerAlarmAccess,
} from '../native/PrayerAlarms';

export function useFullScreenAlarmSwitch(
  fullScreenOn: boolean,
  setFullScreen: (value: boolean) => void,
) {
  // Android 14+: USE_FULL_SCREEN_INTENT can be off (Play pre-grants it only
  // to calling and alarm apps), and then Android quietly shows a heads-up
  // instead. Checked on mount and on every return from the system page, and
  // only while the switch is on.
  const [blocked, setBlocked] = useState(false);
  // iPhone (iOS 26+): the same switch rings the prayers as AlarmKit alarms.
  // Offered only where the OS has it; blocked means the person said no to
  // the system prompt, and only Settings can change that.
  const [iosOffered, setIosOffered] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    void prayerAlarmsAvailable().then(ok => {
      if (alive) setIosOffered(ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  const offered = fullScreenAlarmAvailable || iosOffered;
  useEffect(() => {
    if (!offered || !fullScreenOn) {
      setBlocked(false);
      return;
    }
    let alive = true;
    const check = () => {
      if (Platform.OS === 'ios') {
        void prayerAlarmAccess().then(a => {
          if (alive) setBlocked(a === 'denied');
        });
        return;
      }
      void canUseFullScreenAlarm().then(ok => {
        if (alive) setBlocked(!ok);
      });
    };
    check();
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [fullScreenOn, offered]);

  const toggle = async (value: boolean) => {
    setFullScreen(value);
    if (Platform.OS === 'ios') {
      // The system prompt appears here, once. A "no" leaves the switch on
      // and the notification as it was; the blocked row says why.
      if (value && (await requestPrayerAlarmAccess()) === 'denied') {
        setBlocked(true);
      }
      return;
    }
    // Turning it on with the permission off would look like it worked and
    // then not; take the person to the switch Android needs right away.
    if (value && !(await canUseFullScreenAlarm())) {
      await openFullScreenAlarmSettings();
    }
  };

  return { offered, blocked, toggle };
}
