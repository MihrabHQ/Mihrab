/**
 * The volume buttons as page-turn keys — issue #68. Android phones only.
 *
 * The native side does nothing until `setVolumeKeysCaptured(true)`; while it
 * is set the buttons stop changing the volume and arrive here instead, one
 * `VolumeKey` per press. The caller owns when that is — the muṣḥaf, with
 * nothing selected — and must clear it again, which `useVolumeKeyPaging`
 * does in its cleanup.
 *
 * iOS offers no supported way to take the volume buttons from the system,
 * and a tablet is a different way of holding the book, so on both of those
 * `volumeKeysAvailable` is false and every call is a no-op.
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { DEVICE_CLASS } from '../responsive/deviceClass';

type NativeVolumeKeys = {
  setCaptured(on: boolean): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const Native =
  Platform.OS === 'android'
    ? ((NativeModules.MihrabVolumeKeys as NativeVolumeKeys | undefined) ?? null)
    : null;

/** Whether this device can turn pages with the volume buttons at all. */
export const volumeKeysAvailable: boolean =
  Native != null && DEVICE_CLASS === 'phone';

export type VolumeKeyDirection = 'up' | 'down';

export function setVolumeKeysCaptured(on: boolean): void {
  if (!volumeKeysAvailable) return;
  try {
    Native?.setCaptured(on);
  } catch {
    /* the buttons simply keep their normal job */
  }
}

/** Listen for presses; returns the unsubscribe. */
export function onVolumeKey(
  listener: (direction: VolumeKeyDirection) => void,
): () => void {
  if (!volumeKeysAvailable || !Native) return () => undefined;
  const emitter = new NativeEventEmitter(Native as never);
  const sub = emitter.addListener(
    'VolumeKey',
    (e: { direction?: string }) => {
      if (e?.direction === 'up' || e?.direction === 'down') {
        listener(e.direction);
      }
    },
  );
  return () => sub.remove();
}
