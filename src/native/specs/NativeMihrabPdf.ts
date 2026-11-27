/**
 * `MihrabPdf` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 *
 * It draws a page of a PDF that is a file on this device, with what the
 * platform already has (Android's PdfRenderer, Apple's Core Graphics):
 * nothing is fetched, and nothing is added to the app to do it.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** `{ pages, width, height }` — the first page's size in points — or a rejection when the file is not a PDF that can be read. */
  info(path: string): Promise<Object>;
  /** Page `page` (from 0) drawn `width` pixels wide into the cache: `{ uri, width, height }`. */
  renderPage(path: string, page: number, width: number): Promise<Object>;
  /** Throw the drawn pages away. */
  clearCache(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('MihrabPdf');
