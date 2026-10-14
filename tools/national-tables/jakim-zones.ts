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
/**
 * A town: name, latitude, longitude, and metres above sea level — kept only
 * for the summit zones (Gunung Jerai, Genting, the Cameron Highlands, Bukit
 * Larut, Kinabalu), whose times JAKIM computes at altitude; every other
 * zone is computed at sea level whatever the town's height, and carries 0.
 */
export type JakimZone = { code: string; state: string; towns: [string, number, number, number][] };

export const JAKIM_ZONES: readonly JakimZone[] = [
  { code: 'JHR01', state: 'Johor', towns: [['Pulau Aur', 2.45, 104.52, 0], ['Pulau Pemanggil', 2.58, 104.33, 0]] },
  { code: 'JHR02', state: 'Johor', towns: [['Johor Bahru', 1.4927, 103.7414, 0], ['Kota Tinggi', 1.7381, 103.8999, 0], ['Mersing', 2.4312, 103.8405, 0], ['Kulai', 1.6561, 103.6032, 0]] },
  { code: 'JHR03', state: 'Johor', towns: [['Kluang', 2.0251, 103.3328, 0], ['Pontian', 1.4866, 103.3894, 0]] },
  { code: 'JHR04', state: 'Johor', towns: [['Batu Pahat', 1.8548, 102.9325, 0], ['Muar', 2.0442, 102.5689, 0], ['Segamat', 2.5148, 102.8158, 0], ['Tangkak', 2.2673, 102.5453, 0], ['Gemas', 2.5766, 102.611, 0]] },
  { code: 'KDH01', state: 'Kedah', towns: [['Alor Setar', 6.1248, 100.3678, 0], ['Jitra', 6.2641, 100.4214, 0], ['Pokok Sena', 6.17, 100.517, 0]] },
  { code: 'KDH02', state: 'Kedah', towns: [['Sungai Petani', 5.647, 100.487, 0], ['Yan', 5.8, 100.38, 0], ['Pendang', 5.996, 100.475, 0]] },
  { code: 'KDH03', state: 'Kedah', towns: [['Kuala Nerang', 6.259, 100.608, 0], ['Sik', 5.816, 100.738, 0]] },
  { code: 'KDH04', state: 'Kedah', towns: [['Baling', 5.677, 100.918, 0]] },
  { code: 'KDH05', state: 'Kedah', towns: [['Kulim', 5.365, 100.562, 0], ['Bandar Baharu', 5.134, 100.492, 0]] },
  { code: 'KDH06', state: 'Kedah', towns: [['Langkawi', 6.35, 99.8, 0]] },
  { code: 'KDH07', state: 'Kedah', towns: [['Gunung Jerai', 5.794, 100.433, 951]] },
  { code: 'KTN01', state: 'Kelantan', towns: [['Kota Bharu', 6.1254, 102.2381, 0], ['Bachok', 6.059, 102.41, 0], ['Machang', 5.767, 102.215, 0], ['Pasir Mas', 6.049, 102.14, 0], ['Pasir Puteh', 5.833, 102.4, 0], ['Tanah Merah', 5.807, 102.148, 0], ['Tumpat', 6.198, 102.171, 0], ['Kuala Krai', 5.532, 102.2, 0]] },
  { code: 'KTN02', state: 'Kelantan', towns: [['Gua Musang', 4.883, 101.967, 0], ['Jeli', 5.702, 101.843, 0], ['Lojing', 4.66, 101.53, 0]] },
  { code: 'MLK01', state: 'Melaka', towns: [['Melaka', 2.1896, 102.2501, 0], ['Alor Gajah', 2.381, 102.209, 0], ['Jasin', 2.31, 102.43, 0]] },
  { code: 'NGS01', state: 'Negeri Sembilan', towns: [['Tampin', 2.47, 102.23, 0], ['Bandar Seri Jempol', 2.93, 102.37, 0]] },
  { code: 'NGS02', state: 'Negeri Sembilan', towns: [['Kuala Klawang', 2.946, 102.07, 0], ['Kuala Pilah', 2.739, 102.248, 0], ['Rembau', 2.59, 102.092, 0]] },
  { code: 'NGS03', state: 'Negeri Sembilan', towns: [['Seremban', 2.7258, 101.9424, 0], ['Port Dickson', 2.5228, 101.796, 0]] },
  { code: 'PHG01', state: 'Pahang', towns: [['Pulau Tioman', 2.79, 104.17, 0]] },
  { code: 'PHG02', state: 'Pahang', towns: [['Kuantan', 3.8077, 103.326, 0], ['Pekan', 3.49, 103.39, 0], ['Muadzam Shah', 3.053, 103.08, 0]] },
  { code: 'PHG03', state: 'Pahang', towns: [['Jerantut', 3.936, 102.362, 0], ['Temerloh', 3.45, 102.417, 0], ['Maran', 3.58, 102.77, 0], ['Bera', 3.19, 102.53, 0], ['Jengka', 3.75, 102.55, 0]] },
  { code: 'PHG04', state: 'Pahang', towns: [['Bentong', 3.522, 101.908, 0], ['Kuala Lipis', 4.184, 102.047, 0], ['Raub', 3.793, 101.857, 0]] },
  { code: 'PHG05', state: 'Pahang', towns: [['Genting Sempah', 3.373, 101.776, 813], ['Janda Baik', 3.33, 101.87, 487], ['Bukit Tinggi', 3.37, 101.83, 555]] },
  { code: 'PHG06', state: 'Pahang', towns: [['Tanah Rata', 4.47, 101.38, 1437], ['Genting Highlands', 3.423, 101.793, 1758], ['Bukit Fraser', 3.713, 101.738, 1219]] },
  { code: 'PHG07', state: 'Pahang', towns: [['Kuala Rompin', 2.807, 103.489, 0], ['Endau', 2.656, 103.622, 0]] },
  { code: 'PLS01', state: 'Perlis', towns: [['Kangar', 6.4414, 100.1986, 0], ['Padang Besar', 6.66, 100.32, 0], ['Arau', 6.43, 100.27, 0]] },
  { code: 'PNG01', state: 'Pulau Pinang', towns: [['George Town', 5.4141, 100.3288, 0], ['Butterworth', 5.3992, 100.3638, 0], ['Bukit Mertajam', 5.363, 100.46, 0], ['Balik Pulau', 5.35, 100.23, 0]] },
  { code: 'PRK01', state: 'Perak', towns: [['Tapah', 4.198, 101.262, 0], ['Slim River', 3.83, 101.41, 0], ['Tanjung Malim', 3.685, 101.519, 0]] },
  { code: 'PRK02', state: 'Perak', towns: [['Ipoh', 4.5975, 101.0901, 0], ['Kuala Kangsar', 4.77, 100.94, 0], ['Sungai Siput', 4.82, 101.07, 0], ['Batu Gajah', 4.469, 101.04, 0], ['Kampar', 4.308, 101.154, 0]] },
  { code: 'PRK03', state: 'Perak', towns: [['Gerik', 5.43, 101.13, 0], ['Lenggong', 5.11, 100.97, 0], ['Pengkalan Hulu', 5.71, 101.06, 0]] },
  { code: 'PRK04', state: 'Perak', towns: [['Temengor', 5.4, 101.35, 0], ['Belum', 5.6, 101.4, 0]] },
  { code: 'PRK05', state: 'Perak', towns: [['Teluk Intan', 4.025, 101.021, 0], ['Bagan Datuk', 3.984, 100.784, 0], ['Seri Iskandar', 4.36, 100.96, 0], ['Beruas', 4.5, 100.81, 0], ['Parit', 4.433, 100.89, 0], ['Lumut', 4.233, 100.63, 0], ['Sitiawan', 4.214, 100.698, 0], ['Pulau Pangkor', 4.23, 100.56, 0], ['Kampung Gajah', 4.21, 100.95, 0]] },
  { code: 'PRK06', state: 'Perak', towns: [['Taiping', 4.85, 100.74, 0], ['Selama', 5.22, 100.69, 0], ['Bagan Serai', 5.01, 100.54, 0], ['Parit Buntar', 5.12, 100.49, 0]] },
  { code: 'PRK07', state: 'Perak', towns: [['Bukit Larut', 4.86, 100.79, 943]] },
  { code: 'SBH01', state: 'Sabah', towns: [['Sandakan', 5.84, 118.117, 0], ['Sukau', 5.53, 118.29, 0]] },
  { code: 'SBH02', state: 'Sabah', towns: [['Beluran', 5.91, 117.09, 0], ['Telupid', 5.63, 117.13, 0]] },
  { code: 'SBH03', state: 'Sabah', towns: [['Lahad Datu', 5.03, 118.33, 0], ['Kunak', 4.68, 118.25, 0], ['Semporna', 4.48, 118.61, 0]] },
  { code: 'SBH04', state: 'Sabah', towns: [['Tawau', 4.25, 117.89, 0], ['Kalabakan', 4.42, 117.48, 0]] },
  { code: 'SBH05', state: 'Sabah', towns: [['Kudat', 6.89, 116.84, 0], ['Kota Marudu', 6.48, 116.76, 0], ['Pitas', 6.67, 117.04, 0]] },
  { code: 'SBH06', state: 'Sabah', towns: [['Gunung Kinabalu', 6.075, 116.558, 4046]] },
  { code: 'SBH07', state: 'Sabah', towns: [['Kota Kinabalu', 5.9804, 116.0735, 0], ['Ranau', 5.95, 116.66, 0], ['Kota Belud', 6.35, 116.43, 0], ['Tuaran', 6.18, 116.23, 0], ['Penampang', 5.93, 116.1, 0], ['Papar', 5.73, 115.93, 0]] },
  { code: 'SBH08', state: 'Sabah', towns: [['Keningau', 5.34, 116.16, 0], ['Tambunan', 5.67, 116.36, 0], ['Nabawan', 5.07, 116.45, 0], ['Pensiangan', 4.6, 116.33, 0]] },
  { code: 'SBH09', state: 'Sabah', towns: [['Beaufort', 5.347, 115.745, 0], ['Kuala Penyu', 5.6, 115.59, 0], ['Sipitang', 5.08, 115.55, 0], ['Tenom', 5.13, 115.95, 0], ['Membakut', 5.46, 115.79, 0]] },
  { code: 'SGR01', state: 'Selangor', towns: [['Shah Alam', 3.0733, 101.5185, 0], ['Petaling Jaya', 3.1073, 101.6067, 0], ['Gombak', 3.25, 101.65, 0], ['Sepang', 2.69, 101.75, 0], ['Kajang', 2.993, 101.79, 0], ['Kuala Kubu Bharu', 3.56, 101.65, 0]] },
  { code: 'SGR02', state: 'Selangor', towns: [['Kuala Selangor', 3.34, 101.25, 0], ['Sabak Bernam', 3.77, 100.99, 0]] },
  { code: 'SGR03', state: 'Selangor', towns: [['Klang', 3.0449, 101.4455, 0], ['Banting', 2.81, 101.5, 0]] },
  { code: 'SWK01', state: 'Sarawak', towns: [['Limbang', 4.75, 115.0, 0], ['Lawas', 4.85, 115.41, 0]] },
  { code: 'SWK02', state: 'Sarawak', towns: [['Miri', 4.4, 113.99, 0], ['Marudi', 4.18, 114.32, 0], ['Niah', 3.87, 113.75, 0]] },
  { code: 'SWK03', state: 'Sarawak', towns: [['Bintulu', 3.17, 113.03, 0], ['Belaga', 2.7, 113.78, 0], ['Tatau', 2.89, 112.85, 0]] },
  { code: 'SWK04', state: 'Sarawak', towns: [['Sibu', 2.287, 111.83, 0], ['Mukah', 2.9, 112.09, 0], ['Kapit', 2.016, 112.933, 0], ['Kanowit', 2.1, 112.15, 0], ['Dalat', 2.74, 111.94, 0]] },
  { code: 'SWK05', state: 'Sarawak', towns: [['Sarikei', 2.127, 111.518, 0], ['Bintangor', 2.17, 111.63, 0], ['Daro', 2.52, 111.37, 0], ['Julau', 1.96, 111.8, 0]] },
  { code: 'SWK06', state: 'Sarawak', towns: [['Sri Aman', 1.237, 111.462, 0], ['Betong', 1.41, 111.52, 0], ['Saratok', 1.73, 111.35, 0], ['Lubok Antu', 1.04, 111.83, 0]] },
  { code: 'SWK07', state: 'Sarawak', towns: [['Serian', 1.17, 110.57, 0], ['Kota Samarahan', 1.46, 110.49, 0], ['Simunjan', 1.39, 110.75, 0]] },
  { code: 'SWK08', state: 'Sarawak', towns: [['Kuching', 1.5533, 110.3592, 0], ['Bau', 1.42, 110.15, 0], ['Lundu', 1.67, 109.86, 0], ['Sematan', 1.81, 109.77, 0]] },
  { code: 'TRG01', state: 'Terengganu', towns: [['Kuala Terengganu', 5.33, 103.14, 0], ['Marang', 5.2, 103.21, 0], ['Kuala Nerus', 5.39, 103.09, 0]] },
  { code: 'TRG02', state: 'Terengganu', towns: [['Jerteh', 5.74, 102.49, 0], ['Setiu', 5.61, 102.73, 0]] },
  { code: 'TRG03', state: 'Terengganu', towns: [['Kuala Berang', 5.07, 102.96, 0]] },
  { code: 'TRG04', state: 'Terengganu', towns: [['Dungun', 4.76, 103.42, 0], ['Chukai', 4.23, 103.42, 0]] },
  { code: 'WLY01', state: 'Wilayah Persekutuan', towns: [['Kuala Lumpur', 3.139, 101.6869, 0], ['Putrajaya', 2.9264, 101.6964, 0]] },
  { code: 'WLY02', state: 'Wilayah Persekutuan', towns: [['Labuan', 5.28, 115.24, 0]] },
];

/** The app's place list: one row per town, keyed by its zone's id. */
export function jakimPlaces(): { id: number; name: string; nameEn: string; lat: number; lon: number; heightM: number }[] {
  const out: { id: number; name: string; nameEn: string; lat: number; lon: number; heightM: number }[] = [];
  JAKIM_ZONES.forEach((z, i) => {
    for (const [name, lat, lon, heightM] of z.towns) {
      out.push({ id: i + 1, name, nameEn: `${name} (${z.code})`, lat, lon, heightM });
    }
  });
  return out;
}
