/**
 * "Headphones out, playback pauses" — iOS side.
 *
 * Android gets this from track-player's `handleAudioBecomingNoisy`. iOS
 * has the same convention (Apple's AVAudioSession guide: pause when the
 * old output device becomes unavailable) but the library does not observe
 * `AVAudioSession.routeChangeNotification`, so `AudioRouteWatcher.swift`
 * does, and forwards the one reason that calls for a pause,
 * `.oldDeviceUnavailable`, as an `AudioRouteLost` event.
 *
 * Android and tests have no module: subscribing is a no-op there.
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type AudioRouteLost = { previousPort: string };

const native =
  Platform.OS === 'ios'
    ? (NativeModules as { AudioRouteWatcher?: object }).AudioRouteWatcher
    : undefined;

/** Whether the platform module is present (false on Android and in tests). */
export const audioRouteWatcherAvailable = native != null;

/**
 * Call `onLost` each time the output route the audio was playing through
 * (headphones, a Bluetooth speaker, CarPlay) goes away. Returns the
 * unsubscribe; a no-op when the module is absent.
 */
export function onAudioRouteLost(
  onLost: (e: AudioRouteLost) => void,
): () => void {
  if (!native) return () => {};
  try {
    const emitter = new NativeEventEmitter(native as never);
    const sub = emitter.addListener('AudioRouteLost', (e: unknown) =>
      onLost((e as AudioRouteLost | undefined) ?? { previousPort: '' }),
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
