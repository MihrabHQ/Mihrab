/**
 * "A word is spelled wrong in this line" — for the transliterations.
 *
 * They are checked by a program, letter for letter against the Arabic
 * (tools/transliteration-check), and by nobody who recites: what a program
 * cannot hear, only a reader can say. The app sends nothing anywhere by
 * itself, so this turns the saying into a tap: a GitHub issue, opened in
 * the browser, already holding the edition, the ayah and the line as it
 * was shown — the reader adds the word and how it should read. Each one
 * that holds becomes a row in `transliterationCorrections.ts`.
 *
 * Nothing personal goes in it, and nothing is sent until the reader
 * submits the issue themselves.
 */
import { MIHRAB_REPO } from '../config/links';
import { getInstalledAppVersionLabel } from '../appVersion';
import { findSurah } from './quran';
import { TRANSLITERATION_CORRECTIONS } from './transliterationCorrections';

/** The issue's address, or null when there is no line to report on. */
export function transliterationReportUrl(
  editionId: string,
  surah: number,
  ayah: number,
  shown: string,
): string | null {
  const line = shown.trim();
  if (!line) return null;
  const name = findSurah(surah)?.romanized ?? String(surah);
  const corrected = (TRANSLITERATION_CORRECTIONS[editionId] ?? []).some(
    c => c[0] === surah && c[1] === ayah,
  );
  const title = `Transliteration: ${name} ${surah}:${ayah} (${editionId})`;
  const body = [
    'A word in an ayah’s transliteration does not spell what is recited.',
    '',
    `- Edition: \`${editionId}\``,
    `- Ayah: ${name} ${surah}:${ayah}`,
    `- As shown: ${line}`,
    // So a report on a line the app itself changed is read as one.
    `- Corrected by the app in this ayah: ${corrected ? 'yes' : 'no'}`,
    `- App: ${getInstalledAppVersionLabel()}`,
    '',
    'Which word is wrong, and how should it read?',
    '',
  ].join('\n');
  const q = (v: string) => encodeURIComponent(v);
  return `${MIHRAB_REPO}/issues/new?labels=transliteration&title=${q(title)}&body=${q(body)}`;
}
