/**
 * The system's own PDF view, for a Library book that is a file: the
 * scrolling, the zoom under two fingers and the drawing of the pages are
 * the system's (`MihrabPdfReaderView.kt` says why) — Android's
 * `androidx.pdf` on Android 9 and later, Apple's PDFKit on iPhone, iPad
 * and Mac (`ios/PrayerApp/MihrabPdfView.swift`). One view to JavaScript,
 * with the same props and events on both.
 *
 * Everywhere else — older Android, the web, Jest —
 * `nativePdfViewAvailable()` is false and the reader draws its own list
 * of pages (`LibraryPdfBookScreen`), as it does when the system's view
 * says it cannot open a file.
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
      available = (rn.Platform.OS === 'android' || rn.Platform.OS === 'ios') && typeof rn.UIManager.hasViewManagerConfig === 'function' && rn.UIManager.hasViewManagerConfig(NAME) === true;
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
