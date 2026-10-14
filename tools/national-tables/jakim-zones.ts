/**
 * JAKIM's e-Solat zones — the 59 areas Malaysia publishes a timetable for
 * (SWK09, a single village, is left out) — each with the towns it names on
 * www.e-solat.gov.my, placed on the map so the phone can pick the zone a
 * reader is in by the nearest town. Coordinates are the town centres, to
 * two decimals: a zone is tens of kilometres across, so that is enough.
 *
 * The zone's numeric id is its position here, and is what the dataset and
 * the app key files by; the code is what the site is asked for.
 */
export type JakimZone = { code: string; state: string; towns: [string, number, number][] };

export const JAKIM_ZONES: readonly JakimZone[] = [
  { code: 'JHR01', state: 'Johor', towns: [['Pulau Aur', 2.45, 104.52], ['Pulau Pemanggil', 2.58, 104.33]] },
  { code: 'JHR02', state: 'Johor', towns: [['Johor Bahru', 1.4927, 103.7414], ['Kota Tinggi', 1.7381, 103.8999], ['Mersing', 2.4312, 103.8405], ['Kulai', 1.6561, 103.6032]] },
  { code: 'JHR03', state: 'Johor', towns: [['Kluang', 2.0251, 103.3328], ['Pontian', 1.4866, 103.3894]] },
  { code: 'JHR04', state: 'Johor', towns: [['Batu Pahat', 1.8548, 102.9325], ['Muar', 2.0442, 102.5689], ['Segamat', 2.5148, 102.8158], ['Tangkak', 2.2673, 102.5453], ['Gemas', 2.5766, 102.611]] },
  { code: 'KDH01', state: 'Kedah', towns: [['Alor Setar', 6.1248, 100.3678], ['Jitra', 6.2641, 100.4214], ['Pokok Sena', 6.17, 100.517]] },
  { code: 'KDH02', state: 'Kedah', towns: [['Sungai Petani', 5.647, 100.487], ['Yan', 5.8, 100.38], ['Pendang', 5.996, 100.475]] },
  { code: 'KDH03', state: 'Kedah', towns: [['Kuala Nerang', 6.259, 100.608], ['Sik', 5.816, 100.738]] },
  { code: 'KDH04', state: 'Kedah', towns: [['Baling', 5.677, 100.918]] },
  { code: 'KDH05', state: 'Kedah', towns: [['Kulim', 5.365, 100.562], ['Bandar Baharu', 5.134, 100.492]] },
  { code: 'KDH06', state: 'Kedah', towns: [['Langkawi', 6.35, 99.8]] },
  { code: 'KDH07', state: 'Kedah', towns: [['Gunung Jerai', 5.794, 100.433]] },
  { code: 'KTN01', state: 'Kelantan', towns: [['Kota Bharu', 6.1254, 102.2381], ['Bachok', 6.059, 102.41], ['Machang', 5.767, 102.215], ['Pasir Mas', 6.049, 102.14], ['Pasir Puteh', 5.833, 102.4], ['Tanah Merah', 5.807, 102.148], ['Tumpat', 6.198, 102.171], ['Kuala Krai', 5.532, 102.2]] },
  { code: 'KTN02', state: 'Kelantan', towns: [['Gua Musang', 4.883, 101.967], ['Jeli', 5.702, 101.843], ['Lojing', 4.66, 101.53]] },
  { code: 'MLK01', state: 'Melaka', towns: [['Melaka', 2.1896, 102.2501], ['Alor Gajah', 2.381, 102.209], ['Jasin', 2.31, 102.43]] },
  { code: 'NGS01', state: 'Negeri Sembilan', towns: [['Tampin', 2.47, 102.23], ['Bandar Seri Jempol', 2.93, 102.37]] },
  { code: 'NGS02', state: 'Negeri Sembilan', towns: [['Kuala Klawang', 2.946, 102.07], ['Kuala Pilah', 2.739, 102.248], ['Rembau', 2.59, 102.092]] },
  { code: 'NGS03', state: 'Negeri Sembilan', towns: [['Seremban', 2.7258, 101.9424], ['Port Dickson', 2.5228, 101.796]] },
  { code: 'PHG01', state: 'Pahang', towns: [['Pulau Tioman', 2.79, 104.17]] },
  { code: 'PHG02', state: 'Pahang', towns: [['Kuantan', 3.8077, 103.326], ['Pekan', 3.49, 103.39], ['Muadzam Shah', 3.053, 103.08]] },
  { code: 'PHG03', state: 'Pahang', towns: [['Jerantut', 3.936, 102.362], ['Temerloh', 3.45, 102.417], ['Maran', 3.58, 102.77], ['Bera', 3.19, 102.53], ['Jengka', 3.75, 102.55]] },
  { code: 'PHG04', state: 'Pahang', towns: [['Bentong', 3.522, 101.908], ['Kuala Lipis', 4.184, 102.047], ['Raub', 3.793, 101.857]] },
  { code: 'PHG05', state: 'Pahang', towns: [['Genting Sempah', 3.373, 101.776], ['Janda Baik', 3.33, 101.87], ['Bukit Tinggi', 3.37, 101.83]] },
  { code: 'PHG06', state: 'Pahang', towns: [['Tanah Rata', 4.47, 101.38], ['Genting Highlands', 3.423, 101.793], ['Bukit Fraser', 3.713, 101.738]] },
  { code: 'PHG07', state: 'Pahang', towns: [['Kuala Rompin', 2.807, 103.489], ['Endau', 2.656, 103.622]] },
  { code: 'PLS01', state: 'Perlis', towns: [['Kangar', 6.4414, 100.1986], ['Padang Besar', 6.66, 100.32], ['Arau', 6.43, 100.27]] },
  { code: 'PNG01', state: 'Pulau Pinang', towns: [['George Town', 5.4141, 100.3288], ['Butterworth', 5.3992, 100.3638], ['Bukit Mertajam', 5.363, 100.46], ['Balik Pulau', 5.35, 100.23]] },
  { code: 'PRK01', state: 'Perak', towns: [['Tapah', 4.198, 101.262], ['Slim River', 3.83, 101.41], ['Tanjung Malim', 3.685, 101.519]] },
  { code: 'PRK02', state: 'Perak', towns: [['Ipoh', 4.5975, 101.0901], ['Kuala Kangsar', 4.77, 100.94], ['Sungai Siput', 4.82, 101.07], ['Batu Gajah', 4.469, 101.04], ['Kampar', 4.308, 101.154]] },
  { code: 'PRK03', state: 'Perak', towns: [['Gerik', 5.43, 101.13], ['Lenggong', 5.11, 100.97], ['Pengkalan Hulu', 5.71, 101.06]] },
  { code: 'PRK04', state: 'Perak', towns: [['Temengor', 5.4, 101.35], ['Belum', 5.6, 101.4]] },
  { code: 'PRK05', state: 'Perak', towns: [['Teluk Intan', 4.025, 101.021], ['Bagan Datuk', 3.984, 100.784], ['Seri Iskandar', 4.36, 100.96], ['Beruas', 4.5, 100.81], ['Parit', 4.433, 100.89], ['Lumut', 4.233, 100.63], ['Sitiawan', 4.214, 100.698], ['Pulau Pangkor', 4.23, 100.56], ['Kampung Gajah', 4.21, 100.95]] },
  { code: 'PRK06', state: 'Perak', towns: [['Taiping', 4.85, 100.74], ['Selama', 5.22, 100.69], ['Bagan Serai', 5.01, 100.54], ['Parit Buntar', 5.12, 100.49]] },
  { code: 'PRK07', state: 'Perak', towns: [['Bukit Larut', 4.86, 100.79]] },
  { code: 'SBH01', state: 'Sabah', towns: [['Sandakan', 5.84, 118.117], ['Sukau', 5.53, 118.29]] },
  { code: 'SBH02', state: 'Sabah', towns: [['Beluran', 5.91, 117.09], ['Telupid', 5.63, 117.13]] },
  { code: 'SBH03', state: 'Sabah', towns: [['Lahad Datu', 5.03, 118.33], ['Kunak', 4.68, 118.25], ['Semporna', 4.48, 118.61]] },
  { code: 'SBH04', state: 'Sabah', towns: [['Tawau', 4.25, 117.89], ['Kalabakan', 4.42, 117.48]] },
  { code: 'SBH05', state: 'Sabah', towns: [['Kudat', 6.89, 116.84], ['Kota Marudu', 6.48, 116.76], ['Pitas', 6.67, 117.04]] },
  { code: 'SBH06', state: 'Sabah', towns: [['Gunung Kinabalu', 6.075, 116.558]] },
  { code: 'SBH07', state: 'Sabah', towns: [['Kota Kinabalu', 5.9804, 116.0735], ['Ranau', 5.95, 116.66], ['Kota Belud', 6.35, 116.43], ['Tuaran', 6.18, 116.23], ['Penampang', 5.93, 116.1], ['Papar', 5.73, 115.93]] },
  { code: 'SBH08', state: 'Sabah', towns: [['Keningau', 5.34, 116.16], ['Tambunan', 5.67, 116.36], ['Nabawan', 5.07, 116.45], ['Pensiangan', 4.6, 116.33]] },
  { code: 'SBH09', state: 'Sabah', towns: [['Beaufort', 5.347, 115.745], ['Kuala Penyu', 5.6, 115.59], ['Sipitang', 5.08, 115.55], ['Tenom', 5.13, 115.95], ['Membakut', 5.46, 115.79]] },
  { code: 'SGR01', state: 'Selangor', towns: [['Shah Alam', 3.0733, 101.5185], ['Petaling Jaya', 3.1073, 101.6067], ['Gombak', 3.25, 101.65], ['Sepang', 2.69, 101.75], ['Kajang', 2.993, 101.79], ['Kuala Kubu Bharu', 3.56, 101.65]] },
  { code: 'SGR02', state: 'Selangor', towns: [['Kuala Selangor', 3.34, 101.25], ['Sabak Bernam', 3.77, 100.99]] },
  { code: 'SGR03', state: 'Selangor', towns: [['Klang', 3.0449, 101.4455], ['Banting', 2.81, 101.5]] },
  { code: 'SWK01', state: 'Sarawak', towns: [['Limbang', 4.75, 115.0], ['Lawas', 4.85, 115.41]] },
  { code: 'SWK02', state: 'Sarawak', towns: [['Miri', 4.4, 113.99], ['Marudi', 4.18, 114.32], ['Niah', 3.87, 113.75]] },
  { code: 'SWK03', state: 'Sarawak', towns: [['Bintulu', 3.17, 113.03], ['Belaga', 2.7, 113.78], ['Tatau', 2.89, 112.85]] },
  { code: 'SWK04', state: 'Sarawak', towns: [['Sibu', 2.287, 111.83], ['Mukah', 2.9, 112.09], ['Kapit', 2.016, 112.933], ['Kanowit', 2.1, 112.15], ['Dalat', 2.74, 111.94]] },
  { code: 'SWK05', state: 'Sarawak', towns: [['Sarikei', 2.127, 111.518], ['Bintangor', 2.17, 111.63], ['Daro', 2.52, 111.37], ['Julau', 1.96, 111.8]] },
  { code: 'SWK06', state: 'Sarawak', towns: [['Sri Aman', 1.237, 111.462], ['Betong', 1.41, 111.52], ['Saratok', 1.73, 111.35], ['Lubok Antu', 1.04, 111.83]] },
  { code: 'SWK07', state: 'Sarawak', towns: [['Serian', 1.17, 110.57], ['Kota Samarahan', 1.46, 110.49], ['Simunjan', 1.39, 110.75]] },
  { code: 'SWK08', state: 'Sarawak', towns: [['Kuching', 1.5533, 110.3592], ['Bau', 1.42, 110.15], ['Lundu', 1.67, 109.86], ['Sematan', 1.81, 109.77]] },
  { code: 'TRG01', state: 'Terengganu', towns: [['Kuala Terengganu', 5.33, 103.14], ['Marang', 5.2, 103.21], ['Kuala Nerus', 5.39, 103.09]] },
  { code: 'TRG02', state: 'Terengganu', towns: [['Jerteh', 5.74, 102.49], ['Setiu', 5.61, 102.73]] },
  { code: 'TRG03', state: 'Terengganu', towns: [['Kuala Berang', 5.07, 102.96]] },
  { code: 'TRG04', state: 'Terengganu', towns: [['Dungun', 4.76, 103.42], ['Chukai', 4.23, 103.42]] },
  { code: 'WLY01', state: 'Wilayah Persekutuan', towns: [['Kuala Lumpur', 3.139, 101.6869], ['Putrajaya', 2.9264, 101.6964]] },
  { code: 'WLY02', state: 'Wilayah Persekutuan', towns: [['Labuan', 5.28, 115.24]] },
];

/** The app's place list: one row per town, keyed by its zone's id. */
export function jakimPlaces(): { id: number; name: string; nameEn: string; lat: number; lon: number }[] {
  const out: { id: number; name: string; nameEn: string; lat: number; lon: number }[] = [];
  JAKIM_ZONES.forEach((z, i) => {
    for (const [name, lat, lon] of z.towns) {
      out.push({ id: i + 1, name, nameEn: `${name} (${z.code})`, lat, lon });
    }
  });
  return out;
}
