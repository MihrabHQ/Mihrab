/**
 * The in-app adhan and the recitation share one audio session; whoever
 * registered with `onBeforeAdhanPlays` runs — and is awaited — before the
 * native player starts, and a failing listener cannot silence the adhan.
 */
jest.mock('react-native', () => ({
  NativeModules: {
    AdhanPlayer: {
      play: jest.fn(() => Promise.resolve(true)),
      playPath: jest.fn(() => Promise.resolve(true)),
      stop: jest.fn(() => Promise.resolve(true)),
      isPlaying: jest.fn(() => Promise.resolve(false)),
    },
    AudioRouteWatcher: {},
  },
  NativeEventEmitter: class {
    static listeners: Array<(e: unknown) => void> = [];
    addListener(_name: string, fn: (e: unknown) => void) {
      (this.constructor as unknown as { listeners: Array<(e: unknown) => void> }).listeners.push(fn);
      return { remove: jest.fn() };
    }
  },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
}));

import { NativeEventEmitter, NativeModules } from 'react-native';
import { AdhanPlayer, onBeforeAdhanPlays } from '../src/native/AdhanPlayer';
import { onAudioRouteLost, audioRouteWatcherAvailable } from '../src/native/AudioRoute';

const native = (NativeModules as unknown as { AdhanPlayer: { play: jest.Mock; playPath: jest.Mock } }).AdhanPlayer;

beforeEach(() => {
  native.play.mockClear();
  native.playPath.mockClear();
});

it('runs and awaits the hook before the adhan starts', async () => {
  const order: string[] = [];
  const off = onBeforeAdhanPlays(async () => {
    await new Promise(r => setTimeout(r, 5));
    order.push('paused recitation');
  });
  native.play.mockImplementation(() => {
    order.push('adhan');
    return Promise.resolve(true);
  });
  await expect(AdhanPlayer.play('adhan_makkah')).resolves.toBe(true);
  expect(order).toEqual(['paused recitation', 'adhan']);
  off();
});

it('also runs for a file played by path, and a failing hook does not block', async () => {
  const off = onBeforeAdhanPlays(() => {
    throw new Error('boom');
  });
  await expect(AdhanPlayer.playPath('/tmp/x.mp3')).resolves.toBe(true);
  expect(native.playPath).toHaveBeenCalledWith('/tmp/x.mp3');
  off();
  await AdhanPlayer.play('adhan_makkah');
  expect(native.play).toHaveBeenCalledTimes(1);
});

it('forwards a lost audio route', () => {
  expect(audioRouteWatcherAvailable).toBe(true);
  const onLost = jest.fn();
  onAudioRouteLost(onLost);
  const listeners = (NativeEventEmitter as unknown as { listeners: Array<(e: unknown) => void> }).listeners;
  expect(listeners).toHaveLength(1);
  listeners[0]({ previousPort: 'Headphones' });
  expect(onLost).toHaveBeenCalledWith({ previousPort: 'Headphones' });
});
