/**
 * The codegen spec for Android's own PDF view — see `MihrabPdfView.ts`,
 * which is the file to read. This one is rewritten at bundle time by
 * `@react-native/babel-plugin-codegen` into a static view config; the
 * native side is an ordinary view manager, carried by the interop layer
 * (`MihrabPdfViewManager.kt`). Keep it to the types and the export.
 */
import { codegenNativeComponent, type CodegenTypes, type HostComponent, type ViewProps } from 'react-native';

type Int32 = CodegenTypes.Int32;
type Double = CodegenTypes.Double;

export interface NativeProps extends ViewProps {
  /** The file, on the device. */
  path: string;
  /** The page to open at, from 0. */
  page: Int32;
  /** A page to go to; `key` changes each time it is asked for. */
  goTo?: Readonly<{ page: Int32; key: Int32 }>;
  /** A zoom to take, 1 being a page as wide as the view; `key` changes each time it is asked for. */
  zoomTo?: Readonly<{ step: Double; key: Int32 }>;
  /** Words to look for in the file ('' takes the marks off); `key` changes each time it is asked. */
  find?: Readonly<{ query: string; key: Int32 }>;
  /** To the next place the words are (1) or the one before (-1); `key` changes each time. */
  findStep?: Readonly<{ by: Int32; key: Int32 }>;
  /** The file is open; `search`: whether this device can look for words in it. */
  onPdfReady?: CodegenTypes.DirectEventHandler<Readonly<{ search: boolean }>>;
  /** How many places the words are in, and which is shown (from 1; 0 when there is none). */
  onPdfFind?: CodegenTypes.DirectEventHandler<Readonly<{ count: Int32; index: Int32 }>>;
  /** The page being read (from 0) and the zoom, as they change. */
  onPdfViewport?: CodegenTypes.DirectEventHandler<Readonly<{ page: Int32; zoom: Double }>>;
  /** The file would not open. */
  onPdfError?: CodegenTypes.DirectEventHandler<Readonly<{ message: string }>>;
}

export default codegenNativeComponent<NativeProps>('MihrabPdfView') as HostComponent<NativeProps>;
