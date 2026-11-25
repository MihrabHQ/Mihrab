/**
 * Is a HadeethEnc entry reported in al-Bukhārī's Ṣaḥīḥ or in Muslim's?
 *
 * By HadeethEnc's own Arabic attribution, which is written one way where
 * the translations write it a dozen ("Narrated by Bukhari", "Al-Bukhāri",
 * "Agreed upon"…). The packs carry the answer as `s: 1`
 * (`scripts/hadith/build-packs.js`, the same rule); this copy is for a
 * pack rebuilt from HadeethEnc itself (`origin.ts`).
 *
 * Read strictly. The attribution OPENS with it ("متفق عليه", "رواه
 * البخاري", "رواه مسلم"), or it is a list of narrations and every line of
 * it says so ("الرواية الأولى: متفق عليها. الرواية الثانية: رواها مسلم").
 * "رواه أحمد، وأصله في صحيح مسلم" is neither; nor is a report al-Bukhārī
 * gives in another of his books ("رواه البخاري في الأدب المفرد"), in
 * Muslim's introduction ("رواه مسلم في مقدمته"), or without its chain
 * ("معلقًا", "تعليقًا"). An entry that misses the flag is still found by
 * every other search; one that wrongly had it would be a claim the app
 * makes about a hadith.
 */
// sahihayn-rule:start
const SAHIHAYN_OPENS = /^(?:متفق عليه|رواه (?:البخاري|مسلم)(?! في))/;
const SAHIHAYN_LINE = /(?:متفق عليه|روا(?:ه|ها) (?:البخاري|مسلم))(?! في)/;
const NOT_SAHIHAYN = /معلق|تعليق/;
export function reportedInSahihayn(attributionAr: string | null | undefined): boolean {
  const a = String(attributionAr ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .trim();
  if (!a || NOT_SAHIHAYN.test(a)) return false;
  if (SAHIHAYN_OPENS.test(a)) return true;
  const lines = a
    .split(/[\n.]+/)
    .map(l => l.trim())
    .filter(Boolean);
  return lines.length > 1 && lines.every(l => SAHIHAYN_LINE.test(l));
}
// sahihayn-rule:end
