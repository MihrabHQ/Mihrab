/**
 * Android's own PDF view (`androidx.pdf`), for a Library book that is a
 * file: the scrolling, the zoom under two fingers and the drawing of the
 * pages are the system's (`MihrabPdfReaderView.kt` says why).
 *
 * It is there on Android 9 and later. Everywhere else — older Android,
 * iPhone, Mac, the web, Jest — `nativePdfViewAvailable()` is false and
 * the reader draws its own list of pages (`LibraryPdfBookScreen`).
 */
import type { HostComponent, Platform, UIManager } from 'react-native';
import type { NativeProps } from './MihrabPdfViewNativeComponent';

export type MihrabPdfViewProps = NativeProps;

const NAME = 'MihrabPdfView';
let available: boolean | null = null;

/** Asked when it is needed, not at import: the UI manager answers for a view manager made on demand. */
export function nativePdfViewAvailable(): boolean {
  if (available === null) {
    try {
      const rn = require('react-native') as { Platform: typeof Platform; UIManager: typeof UIManager };
      available = rn.Platform.OS === 'android' && typeof rn.UIManager.hasViewManagerConfig === 'function' && rn.UIManager.hasViewManagerConfig(NAME) === true;
    } catch {
      available = false;
    }
  }
  return available;
}

/** Tests only: pretend the view is (or is not) there. */
export function setNativePdfViewAvailableForTests(value: boolean | null): void {
  available = value;
}

let component: HostComponent<NativeProps> | null = null;

/** The host component — call only after `nativePdfViewAvailable()`. */
export function MihrabPdfViewNative(): HostComponent<NativeProps> {
  if (component === null) component = (require('./MihrabPdfViewNativeComponent') as { default: HostComponent<NativeProps> }).default;
  return component;
}
