/**
 * "Something is wrong with this hadith" — a mistyped word, a translation
 * that says something else, a grade or a number that is not the book's.
 *
 * The app sends nothing anywhere by itself, so a wrong text is only ever
 * known if somebody says so; and a wrong text here is words attributed to
 * the Prophet ﷺ. This turns the saying into a tap: a message to the
 * project's address, opened in the reader's own mail app, already naming
 * the entry — which one, from which source, in which language, in which
 * version of the app — so the reader writes only what they saw. Where no
 * mail app answers, the same report opens as a GitHub issue in the
 * browser, as the ayah-boundary report does (`ayahBoundaryReport.ts`).
 *
 * Nothing personal goes in it, and nothing is sent until the reader sends
 * it themselves — from their own address, which is then theirs to share.
 */
import { MIHRAB_CONTACT, MIHRAB_REPO } from '../config/links';
import { getInstalledAppVersionLabel } from '../appVersion';
import { parseEntryId } from './catalog';
import type { HadithItem } from './library';

export type HadithReport = { subject: string; body: string };

/** Which entry, in words a maintainer can find it by. */
function entryLine(item: HadithItem): string {
  const ref = parseEntryId(item.id);
  if (ref?.kind === 'henc') return `HadeethEnc entry ${ref.id}`;
  if (ref?.kind === 'nawawi') return `an-Nawawi's Forty, no. ${ref.n} (Arabic, fawazahmed0/hadith-api)`;
  if (ref?.kind === 'book') {
    return `${ref.book}, no. ${item.number ?? '?'} (row ${ref.index}, Open-Hadith-Data)`;
  }
  return item.id;
}

/**
 * The report's subject and body. `prompt` is the one line in the reader's
 * language — what to write; the rest is for whoever fixes it, in English.
 */
export function hadithReport(item: HadithItem, appLang: string, prompt: string, platform: string): HadithReport {
  const shown = item.textLang
    ? `${item.textLang}${item.fallback ? ` (English standing in for ${appLang.slice(0, 2)})` : ''}`
    : 'Arabic only';
  return {
    subject: `Hadith ${item.id}`,
    body: [
      prompt,
      '',
      '',
      '—',
      `Entry: ${entryLine(item)}`,
      `Opens with: ${item.title.slice(0, 120)}`,
      `Shown in: ${shown}`,
      `App: ${getInstalledAppVersionLabel()}, ${platform}`,
      '',
    ].join('\n'),
  };
}

const q = (v: string) => encodeURIComponent(v);

/** The report as a message to the project, for the reader's mail app. */
export function hadithReportMailUrl(r: HadithReport): string {
  return `mailto:${MIHRAB_CONTACT}?subject=${q(r.subject)}&body=${q(r.body)}`;
}

/** The same report as a GitHub issue, where there is no mail app to open. */
export function hadithReportIssueUrl(r: HadithReport): string {
  return `${MIHRAB_REPO}/issues/new?labels=hadith&title=${q(r.subject)}&body=${q(r.body)}`;
}
