/**
 * The kinds of Arabic names a reader may ask to see in Arabic
 * (`arabicTerms.ts` says what each is and how it is done), and which of
 * them are on — kept here, with nothing imported, for what must know it
 * without loading the translations: the settings as they are read from
 * disk, and the surahs' names.
 */
export const ARABIC_TERM_GROUPS = ['quran', 'hadith', 'prayers', 'calendar', 'dhikr', 'sections'] as const;
export type ArabicTermGroup = (typeof ARABIC_TERM_GROUPS)[number];

/** Anything at all, as a list of groups: what is not one is dropped. */
export function coerceArabicTerms(raw: unknown): ArabicTermGroup[] {
  return Array.isArray(raw) ? ARABIC_TERM_GROUPS.filter(g => raw.includes(g)) : [];
}

let active: ReadonlySet<ArabicTermGroup> = new Set();
export function setActiveArabicTerms(groups: readonly string[] | null | undefined): void {
  active = new Set(coerceArabicTerms(groups));
}
export const arabicTermsHas = (group: ArabicTermGroup): boolean => active.has(group);
