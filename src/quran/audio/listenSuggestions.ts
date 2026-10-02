/**
 * What to put on now — the recitations the sunnah attaches to a time.
 *
 * Offered on the listening page when there is nothing playing, or the last
 * session has gone stale, beside "carry on" and "shuffle". Only practice
 * with a sound narration behind it, and each says why it is there:
 *
 *   • Al-Kahf on Friday, from Thursday's maghrib — the night of Friday is
 *     Friday's, and the light "between the two Fridays" is promised to
 *     whoever recites it then (al-Ḥākim, al-Bayhaqī; ad-Dārimī for the
 *     night).
 *   • Al-Mulk and As-Sajdah at night: the Prophet ﷺ did not sleep until he
 *     had recited both (at-Tirmidhī 2892).
 *   • The last two ayahs of Al-Baqarah at night — "they will suffice him"
 *     (al-Bukhārī 5009).
 *   • Al-Ikhlāṣ, Al-Falaq and An-Nās morning and evening (Abū Dāwūd 5082)
 *     and before sleep (al-Bukhārī 5017).
 *   • As-Sajdah and Al-Insān on Friday morning, the two he recited in Fajr
 *     on Friday (al-Bukhārī 891).
 *   • Al-Baqarah at any time: Shayṭān leaves a house where it is recited
 *     (Muslim 780).
 *
 * Weak narrations that circulate for Yā-Sīn, Al-Wāqiʿah and others are
 * left out on purpose.
 *
 * Times are the local clock, with the evening turning at today's maghrib
 * when the app knows it (`todaysMaghrib`) and at six otherwise.
 */
export type ListenSuggestion = {
  /** Stable id, for keys and tests. */
  id: string;
  surah: number;
  ayah: number;
  /**
   * Set for a passage rather than a surah: play to here and stop. A whole
   * surah is a listen, and goes on into the next as any listen does.
   */
  to?: { surah: number; ayah: number };
  /** i18n key and English for why it is offered now. */
  reasonKey: string;
  reasonDefault: string;
  /** i18n key and English for a title other than the surah's name. */
  titleKey?: string;
  titleDefault?: string;
};

const THURSDAY = 4;
const FRIDAY = 5;

const KAHF: ListenSuggestion = {
  id: 'kahf',
  surah: 18,
  ayah: 1,
  reasonKey: 'quran.suggest.kahf',
  reasonDefault: "Friday's sunnah, from Thursday's maghrib",
};
const MULK: ListenSuggestion = {
  id: 'mulk',
  surah: 67,
  ayah: 1,
  reasonKey: 'quran.suggest.mulk',
  reasonDefault: 'The Prophet ﷺ recited it every night before sleeping',
};
const SAJDAH_NIGHT: ListenSuggestion = {
  id: 'sajdah-night',
  surah: 32,
  ayah: 1,
  reasonKey: 'quran.suggest.sajdahNight',
  reasonDefault: 'With Al-Mulk, before sleeping',
};
const BAQARAH_END: ListenSuggestion = {
  id: 'baqarah-end',
  surah: 2,
  ayah: 285,
  to: { surah: 2, ayah: 286 },
  titleKey: 'quran.suggest.baqarahEndTitle',
  titleDefault: 'Al-Baqarah, the last two ayahs',
  reasonKey: 'quran.suggest.baqarahEnd',
  reasonDefault: 'Recited at night, they are enough for whoever recites them',
};
const MUAWWIDHAT: ListenSuggestion = {
  id: 'muawwidhat',
  surah: 112,
  ayah: 1,
  to: { surah: 114, ayah: 6 },
  titleKey: 'quran.suggest.muawwidhatTitle',
  titleDefault: 'Al-Ikhlas, Al-Falaq and An-Nas',
  reasonKey: 'quran.suggest.muawwidhat',
  reasonDefault: 'Morning and evening, and before sleeping',
};
const SAJDAH_FRIDAY: ListenSuggestion = {
  id: 'sajdah-friday',
  surah: 32,
  ayah: 1,
  reasonKey: 'quran.suggest.fridayFajr',
  reasonDefault: 'Recited in Fajr on Friday',
};
const INSAN_FRIDAY: ListenSuggestion = {
  id: 'insan-friday',
  surah: 76,
  ayah: 1,
  reasonKey: 'quran.suggest.fridayFajr',
  reasonDefault: 'Recited in Fajr on Friday',
};
const BAQARAH: ListenSuggestion = {
  id: 'baqarah',
  surah: 2,
  ayah: 1,
  reasonKey: 'quran.suggest.baqarah',
  reasonDefault: 'Shayṭān leaves a house where it is recited',
};

/** How many are offered at once. */
export const MAX_SUGGESTIONS = 4;

/**
 * The suggestions for `now`, most timely first.
 *
 * @param maghrib today's maghrib, if known; one for another day is ignored.
 */
export function listenSuggestions(
  now: Date,
  maghrib: Date | null = null,
): ListenSuggestion[] {
  const sameDay =
    maghrib != null &&
    maghrib.getFullYear() === now.getFullYear() &&
    maghrib.getMonth() === now.getMonth() &&
    maghrib.getDate() === now.getDate();
  const hour = now.getHours() + now.getMinutes() / 60;
  const afterMaghrib = sameDay ? now.getTime() >= maghrib.getTime() : hour >= 18;
  const day = now.getDay();

  // Thursday from maghrib, and Friday until it.
  const kahf = (day === THURSDAY && afterMaghrib) || (day === FRIDAY && !afterMaghrib);
  // The night, until the small hours are over.
  const night = afterMaghrib || hour < 4;
  const morning = hour >= 4 && hour < 12;
  const evening = !afterMaghrib && hour >= 15;
  const fridayMorning = day === FRIDAY && morning;

  const out: ListenSuggestion[] = [];
  if (kahf) out.push(KAHF);
  if (fridayMorning) out.push(SAJDAH_FRIDAY, INSAN_FRIDAY);
  if (night) out.push(MULK, BAQARAH_END, SAJDAH_NIGHT, MUAWWIDHAT);
  else if (morning || evening) out.push(MUAWWIDHAT);

  const seen = new Set<number>();
  const timely = out.filter(s => {
    // One row per surah: Friday morning's As-Sajdah is not the night's.
    if (seen.has(s.surah)) return false;
    seen.add(s.surah);
    return true;
  });
  // Al-Baqarah is for any hour, so it keeps the last place whatever else
  // the hour brings — unless the hour already brought it.
  return [...timely.slice(0, MAX_SUGGESTIONS - 1), BAQARAH].filter(
    (s, i, all) => all.findIndex(o => o.id === s.id) === i,
  );
}
