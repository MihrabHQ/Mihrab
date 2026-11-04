/**
 * The Qur'an's text is not a selection.
 *
 * On the web — the browser and the desktop app — text is selectable unless
 * told otherwise, so a drag across the muṣḥaf page (with the word reader
 * off, which otherwise takes the hold) highlighted a run of ayahs, and a
 * select-all took the page's text with it. On the phones a <Text> is not
 * selectable by default and none of the Qur'an's is made so. The text
 * leaves the app only by the app's own actions — a tap opens the ayah, a
 * hold reads a word, the ayah sheet shares and copies — so on the web it
 * is made unselectable where it is drawn: the reader (both views), the
 * ayah sheet's ayah, the verse of the day and the search results.
 *
 * A container's `userSelect: 'none'` reaches everything inside it, since
 * react-native-web's <Text> sets no selection of its own unless asked.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const NO_TEXT_SELECTION: ViewStyle & TextStyle =
  Platform.OS === 'web' ? ({ userSelect: 'none' } as ViewStyle & TextStyle) : {};
