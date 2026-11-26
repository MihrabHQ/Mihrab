/**
 * Where a book's hadith stops naming who passed it on and begins to be
 * told: the chain of narrators (isnād) and the report (matn).
 *
 * The books' text is one run, chain first (Open-Hadith-Data). Most
 * readers want the report; a student wants the chain. This finds the
 * place between them so the reader can FOLD the chain — nothing is cut,
 * changed or reordered, and the two halves put together are the text.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────
 *
 * The report begins with the Companion, as printed collections that drop
 * the chain begin it ("عن أبي هريرة رضي الله عنه قال: قال رسول الله ﷺ").
 * Found from the first "صلى الله عليه وسلم", which is where a chain has
 * reached the Prophet ﷺ (the same place `bookRowTitle` reads):
 *
 *   • the last word of handing-on before it (عن, سمعت, أنّ, حدثنا,
 *     أخبرنا…) introduces whoever stands there. Where that is the Prophet
 *     ﷺ himself, a word or two on ("عن النبي", "سمعت رسول الله"), the
 *     Companion is the one before, and the report begins at THAT word;
 *   • otherwise that word introduces the Companion, whose telling goes on
 *     to name the Prophet ﷺ ("عن عائشة قالت جاءت فاطمة إلى النبي ﷺ").
 *
 * It is a reading of the text's form and can be wrong about a chain that
 * is told in an unusual way. So it only ever folds, the whole text is one
 * tap away, and where the form is not plain — no blessing to find, no
 * word of handing-on before it, a chain of fewer than four words — there
 * is no fold at all and the text stands whole.
 */
import AsyncStorage from '../storage/appStorage';

const MARKS = '[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]*';
const written = (w: string) => [...w].map(c => (c === 'ى' ? '[ىي]' : /[أإآا]/.test(c) ? '[أإآاٱ]' : c) + MARKS).join('');
const SALAWAT = new RegExp(`(?:${['صلى', 'الله', 'عليه', 'وسلم'].map(written).join('\\s+')}|\\uFDFA)`);
/** A word of handing-on, whole, with the "و" or "ف" it may carry. */
const HANDING = new RegExp(
  `^[وف]?(?:${['عن', 'سمعت', 'سمع', 'أن', 'أنه', 'أنها', 'حدثنا', 'حدثني', 'حدثه', 'أخبرنا', 'أخبرني', 'أخبره', 'أنبأنا'].map(written).join('|')})$`,
);
/** How near the blessing a word of handing-on must be to be introducing the Prophet ﷺ: "عن [رسول الله]", "سمعت [النبي]". */
const NEAR = 3;
const THAT = new RegExp(`^[وف]?(?:${['أن', 'أنه', 'أنها'].map(written).join('|')})$`);
const PLEASED = new RegExp(['رضي', 'الله', 'عن'].map(written).join('\\s+'));
const MIN_CHAIN_WORDS = 4;

export type IsnadSplit = { chain: string; report: string };

export function splitIsnad(text: string): IsnadSplit | null {
  const m = SALAWAT.exec(text);
  if (!m) return null;
  // The words before the blessing, each with where it starts.
  const words: { w: string; at: number }[] = [];
  const re = /\S+/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(text)) && x.index < m.index) words.push({ w: x[0], at: x.index });
  const handing = words.map((w, i) => (HANDING.test(w.w) ? i : -1)).filter(i => i >= 0);
  if (!handing.length) return null;
  const last = handing[handing.length - 1];
  const introducesHim = words.length - last - 1 <= NEAR;
  let start = introducesHim ? handing[handing.length - 2] : last;
  // "عن عائشة رضي الله عنها أنّ قريشًا كانت…": the "أنّ" opens what she tells, and
  // she — named just before it, with "رضي الله عنها" — is the Companion.
  const before = handing[handing.indexOf(start) - 1];
  if (start != null && before != null && THAT.test(words[start].w) && PLEASED.test(text.slice(words[before].at, words[start].at))) start = before;
  if (start == null || start < MIN_CHAIN_WORDS) return null;
  const at = words[start].at;
  return { chain: text.slice(0, at).trimEnd(), report: text.slice(at) };
}

/** Whether the reader has chains unfolded: off until asked for, and remembered on this device. */
const SHOWN_KEY = 'mihrab.hadith.isnadShown';
let shown: boolean | null = null;
export async function isnadShown(): Promise<boolean> {
  if (shown == null) shown = (await AsyncStorage.getItem(SHOWN_KEY).catch(() => null)) === '1';
  return shown;
}
export async function setIsnadShown(on: boolean): Promise<void> {
  shown = on;
  await AsyncStorage.setItem(SHOWN_KEY, on ? '1' : '0').catch(() => undefined);
}
export function _resetIsnadForTests(): void {
  shown = null;
}
