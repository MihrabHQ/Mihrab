/**
 * A khatmah removed on another device must cancel this device's pending
 * reminders even when that removal is the first change seen after launch.
 * The old watcher took its baseline from that first change and swallowed it,
 * so a week of pre-scheduled reminders kept firing for a plan that was gone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { watchKhatmahReminder } from '../src/notifications/khatmahReminder';
import {
  __resetQuranStateForTests,
  getQuranState,
  hydrateQuranState,
  subscribeQuranState,
} from '../src/quran/quranState';
import { activeKhatmah } from '../src/quran/khatmahProgress';
import {
  abandonKhatmah,
  finishKhatmahPortion,
  startKhatmah,
} from '../src/quran/khatmahActions';

const flush = () => new Promise<void>(r => setImmediate(r));

beforeEach(async () => {
  __resetQuranStateForTests();
  await AsyncStorage.clear();
});

function watch() {
  const onChange = jest.fn();
  const stop = watchKhatmahReminder({
    subscribe: subscribeQuranState,
    hydrate: hydrateQuranState,
    getState: getQuranState,
    onChange,
  });
  return { onChange, stop };
}

describe('watchKhatmahReminder', () => {
  it('reschedules when the first change after launch removes the khatmah', async () => {
    startKhatmah(30);
    const { onChange, stop } = watch();
    await flush();
    abandonKhatmah(activeKhatmah(getQuranState())!.id);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reschedules when the day’s portion is finished', async () => {
    startKhatmah(30);
    const { onChange, stop } = watch();
    await flush();
    finishKhatmahPortion();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stays quiet after unsubscribing', async () => {
    startKhatmah(30);
    const { onChange, stop } = watch();
    await flush();
    stop();
    abandonKhatmah(activeKhatmah(getQuranState())!.id);
    expect(onChange).not.toHaveBeenCalled();
  });
});
