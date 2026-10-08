/**
 * Coordinates for the cities in the Ministry's timetable database.
 *
 * The database names its cities (in Arabic) and gives no coordinates, so
 * they live here, keyed by that name with whitespace collapsed. They decide
 * only which listed city a user is matched to — the times themselves come
 * from the Ministry untouched — so a city-centre position is enough.
 *
 * Checked against the data, not just a map: for every city the Ministry's
 * Dhuhr sits the same ~0.5 min after solar noon at these coordinates, and
 * its Fajr the same ~0.6 min after an 18° dawn. A wrong longitude shows as a
 * different Dhuhr lead (Ben Badis, Beni Ounif and Ain El Melh were moved
 * until theirs matched). The build re-runs that check and fails on a city
 * whose times are not where its coordinates say they should be.
 *
 * A city the database lists and this table does not FAILS the build. Add
 * it here; do not let it be dropped silently.
 */
export type CityCoords = { nameEn: string; lat: number; lon: number };

export const ALGERIA_CITY_COORDS: Record<string, CityCoords> = {
  'الجلفة': { nameEn: 'Djelfa', lat: 34.6728, lon: 3.263 },
  'تبسة': { nameEn: 'Tebessa', lat: 35.4042, lon: 8.1242 },
  'بئر العاتر': { nameEn: 'Bir El Ater', lat: 34.7458, lon: 8.06 },
  'خنشلة': { nameEn: 'Khenchela', lat: 35.4358, lon: 7.1433 },
  'الوادي': { nameEn: 'El Oued', lat: 33.3683, lon: 6.8674 },
  'باتنة': { nameEn: 'Batna', lat: 35.5559, lon: 6.1741 },
  'تقرت': { nameEn: 'Touggourt', lat: 33.1054, lon: 6.063 },
  'بسكرة': { nameEn: 'Biskra', lat: 34.85, lon: 5.7333 },
  'بوسعادة': { nameEn: 'Bou Saada', lat: 35.2058, lon: 4.1757 },
  'عين الملح': { nameEn: 'Ain El Melh', lat: 34.84, lon: 4.16 },
  'حاسي الرمل': { nameEn: "Hassi R'mel", lat: 32.9333, lon: 3.2667 },
  'الأغواط': { nameEn: 'Laghouat', lat: 33.8, lon: 2.865 },
  'عين وسارة': { nameEn: 'Ain Oussara', lat: 35.45, lon: 2.9 },
  'تيسمسيلت': { nameEn: 'Tissemsilt', lat: 35.6072, lon: 1.8097 },
  'تيارت': { nameEn: 'Tiaret', lat: 35.371, lon: 1.317 },
  'البيض': { nameEn: 'El Bayadh', lat: 33.6831, lon: 1.0192 },
  'سعيدة': { nameEn: 'Saida', lat: 34.8303, lon: 0.1517 },
  'معسكر': { nameEn: 'Mascara', lat: 35.3967, lon: 0.1403 },
  'النعامة': { nameEn: 'Naama', lat: 33.2667, lon: -0.3167 },
  'سيدي بلعباس': { nameEn: 'Sidi Bel Abbes', lat: 35.1899, lon: -0.6308 },
  'ابن باديس': { nameEn: 'Ben Badis', lat: 34.99, lon: -0.9 },
  'تلمسان': { nameEn: 'Tlemcen', lat: 34.878, lon: -1.315 },
  'عين تموشنت': { nameEn: 'Ain Temouchent', lat: 35.2972, lon: -1.1403 },
  'سبدو': { nameEn: 'Sebdou', lat: 34.6381, lon: -1.3253 },
  'مغنية': { nameEn: 'Maghnia', lat: 34.85, lon: -1.7333 },
  'الجزائر': { nameEn: 'Algiers', lat: 36.7538, lon: 3.0588 },
  'وهران': { nameEn: 'Oran', lat: 35.6911, lon: -0.6417 },
  'مستغانم': { nameEn: 'Mostaganem', lat: 35.9315, lon: 0.0892 },
  'غليزان': { nameEn: 'Relizane', lat: 35.7373, lon: 0.5558 },
  'الشلف': { nameEn: 'Chlef', lat: 36.1652, lon: 1.3345 },
  'عين الدفلى': { nameEn: 'Ain Defla', lat: 36.2641, lon: 1.9679 },
  'تيبازة': { nameEn: 'Tipaza', lat: 36.5897, lon: 2.4475 },
  'المدية': { nameEn: 'Medea', lat: 36.2675, lon: 2.7503 },
  'البليدة': { nameEn: 'Blida', lat: 36.47, lon: 2.8277 },
  'بومرداس': { nameEn: 'Boumerdes', lat: 36.7664, lon: 3.4772 },
  'البويرة': { nameEn: 'Bouira', lat: 36.3749, lon: 3.902 },
  'دلس': { nameEn: 'Dellys', lat: 36.9186, lon: 3.9156 },
  'تيزي وزو': { nameEn: 'Tizi Ouzou', lat: 36.7118, lon: 4.0459 },
  'المسيلة': { nameEn: "M'Sila", lat: 35.7058, lon: 4.5419 },
  'برج بوعريريج': { nameEn: 'Bordj Bou Arreridj', lat: 36.0731, lon: 4.7611 },
  'بجاية': { nameEn: 'Bejaia', lat: 36.7509, lon: 5.0567 },
  'سطيف': { nameEn: 'Setif', lat: 36.1898, lon: 5.4108 },
  'جيجل': { nameEn: 'Jijel', lat: 36.82, lon: 5.7667 },
  'ميلة': { nameEn: 'Mila', lat: 36.4503, lon: 6.2644 },
  'قسنطينة': { nameEn: 'Constantine', lat: 36.365, lon: 6.6147 },
  'سكيكدة': { nameEn: 'Skikda', lat: 36.8762, lon: 6.9067 },
  'أم البواقي': { nameEn: 'Oum El Bouaghi', lat: 35.8754, lon: 7.1135 },
  'قالمة': { nameEn: 'Guelma', lat: 36.4621, lon: 7.4261 },
  'عنابة': { nameEn: 'Annaba', lat: 36.9, lon: 7.7667 },
  'سوق أهراس': { nameEn: 'Souk Ahras', lat: 36.2864, lon: 7.9511 },
  'الطارف': { nameEn: 'El Tarf', lat: 36.7672, lon: 8.3137 },
  'أدرار': { nameEn: 'Adrar', lat: 27.8743, lon: -0.2939 },
  'تندوف': { nameEn: 'Tindouf', lat: 27.6711, lon: -8.1474 },
  'بشار': { nameEn: 'Bechar', lat: 31.6167, lon: -2.2167 },
  'تميمون': { nameEn: 'Timimoun', lat: 29.2639, lon: 0.2308 },
  'رقان': { nameEn: 'Reggane', lat: 26.7167, lon: 0.1667 },
  'برج باجي مختار': { nameEn: 'Bordj Badji Mokhtar', lat: 21.3269, lon: 0.9531 },
  'بني عباس': { nameEn: 'Beni Abbes', lat: 30.1333, lon: -2.1667 },
  'عين صالح': { nameEn: 'In Salah', lat: 27.1951, lon: 2.4783 },
  'المنيعة': { nameEn: 'El Menia', lat: 30.5833, lon: 2.8833 },
  'غرداية': { nameEn: 'Ghardaia', lat: 32.49, lon: 3.67 },
  'ورقلة': { nameEn: 'Ouargla', lat: 31.95, lon: 5.3333 },
  'تمنراست': { nameEn: 'Tamanrasset', lat: 22.785, lon: 5.5228 },
  'عين قزام': { nameEn: 'In Guezzam', lat: 19.5667, lon: 5.7667 },
  'إليزي': { nameEn: 'Illizi', lat: 26.5058, lon: 8.4825 },
  'جانت': { nameEn: 'Djanet', lat: 24.5542, lon: 9.4842 },
  'عين أمناس': { nameEn: 'In Amenas', lat: 28.05, lon: 9.5667 },
  'بني ونيف': { nameEn: 'Beni Ounif', lat: 32.05, lon: -1.24 },
};

/** Whitespace-collapsed key, as the table above is keyed. */
export function cityKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}
