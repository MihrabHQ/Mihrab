# Prayer-time sources: where the app gets its times

October 2026. Two rules. **An authority whose tables are not free to
republish is calculated, not served**: the phone computes its own method,
read off the authority's tables, with a small correction list (below).
And **every published table the app does serve comes from Mihrab's own
repo**, never from the authority's site or API directly — a
source can be down, slow, rate-limited, change shape or block a country,
and the phone should not notice. The scheduled workflows in
`.github/workflows/` fetch each source into the repo (or, where a source is
too large for git, into a release of this repo), the app reads that, and the
bundled seed carries a fresh install offline. (namazvakti.com's tables, ~55 MB a
year, are the one source kept as release assets rather than in git.)

Behind the repo, each source has a fallback, in this order:

1. **The repo's copy** (the CDN file, or the bundled seed).
2. **The source's own free API** — only for the sources that have one that
   can be used without problems (below), and only for a day the repo's copy
   lacks. Kept on the phone once answered; not asked again for six hours
   after a failure.
3. **Mihrab's own calculation** of the authority's method, fitted to its
   tables (`tools/verify-methods`), for the listed place — what fills any
   day nothing above has.

## The sources

### Calculated on the phone, nothing fetched

These are not mirrored tables. The app calculates each authority's times on
the phone, offline and for any date, with the authority's own method at the
point it computes each listed place, and a small correction list for the
few times its program rounds the other way (`src/providers/swedenCorrections.ts`
and `src/providers/data/*Corrections.json`). With the list, every time is
on the authority's printed minute over the tables checked:

| Authority | Method | By the method alone | Checked over |
|---|---|---|---|
| **Sweden** — Islamiska Förbundet (Diyanet's tables) | method 24, `congressMethod.ts`, 108 cities | 99.98 % | 2024–2027, 1.39 M times |
| **Diyanet** — Türkiye and worldwide | method 13, `diyanetMethod.ts`, 8,291 places (880 districts, 7,252 abroad, Sweden's 159) | 99.987 % | 2024–2027, 70.0 M times |
| **Morocco** — Habous | method 21, `moroccoMethod.ts`, 164 cities | 99.12 % | 27 Aug → 11 Nov 2026, 75,768 times |
| **Algeria** — Ministry of Religious Affairs | method 19, `algeriaMethod.ts`, 68 cities | 99.37 % | 1448 AH, 101,184 times |
| **Indonesia** — Kemenag | method 20, `indonesiaMethod.ts`, 517 regencies | 99.97 % | Oct → Dec 2026, 266,772 times |

Two more are computed the same way, from MihrabHQ/mihrab-methods, and are
not in the table above: **Tatarstan** — the Spiritual Administration of
Muslims of the Republic of Tatarstan (`tatarstanMethod.ts`, 44 towns and
district seats, inside the republic's outline), and **Russia's Central
Muftiate** — the Central Spiritual Administration of Muslims of Russia
(`cdumMethod.ts`, 18 cities, within 30 km of each). Both print one Asr, the Hanafi one. And two
more: **Albania** — the Muslim Community of Albania's calendar
(`albaniaMethod.ts`, Tirana and ten towns) and **Bulgaria** — the Grand
Mufti's Office's timetable (`bulgariaMethod.ts`, Sofia and 47 towns), each
one town's table with the sun taken once a day (`townTableMethod.ts`) and
served inside its country. And six more, each
served inside its country's outline: **Egypt** (the General Authority of
Survey, 77 cities), **Kuwait** (the Ministry of Awqaf, its areas),
**Qatar** (the Calendar House's table), **Jordan** (the Ministry of Awqaf,
16 zones), **Kazakhstan** (the Spiritual Administration of Muslims, 84
cities and the reader's own spot elsewhere) and **Brunei** (the Ministry of
Religious Affairs, four districts) — `ministryTimetables.ts`. And
**Pakistan** — Jamia Uloom-ul-Islamia, Banuri Town's own method
(`banuriTimetable.ts`, inside the country's outline): in one of the hundred
cities its page lists, that city's times; elsewhere in the country the same
method for the reader's own spot. Dhuhr is the minute after the zenith
(zawal) the page prints; the Hanafi Asr toggle applies. And the
**United Arab Emirates** — the General Authority of Islamic Affairs,
Endowments and Zakat's own method (`uaeTimetable.ts`): its forty-one
zones, each at its own point with its own horizons, the reader given the
zone of the nearest of its towns (`data/uaeAreas.json`); the two summits, Jebel Jais and Jebel
Hafeet, only on the mountain. The
certification of all of these is in mihrab-methods' `docs/status.md`.

Every time is within a minute by the method alone. Each list covers the
dates its tables do and is renewed as the authority publishes more; past
them the method alone is served. Where Islamiska Förbundet's own copy
differs from Diyanet's (a year served copied, Kiruna printed with Umeå's
table), the app follows Diyanet.

Source: [MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods),
where the methods, their correction lists and their check against the
timetables live; the app copies them.

Versions up to 2.31 read Sweden's, Morocco's and Algeria's times from
`data/prayer-times/v1`, `…/morocco/v1` and `…/algeria/v1`. Those files now
hold what the current app computes, in the shape those versions read, from
the first of the month to three months ahead (`tools/compat-feed/build.ts`,
`.github/workflows/compat-feed.yml`, daily; files change only when a day
does).

**IGMG** (`igmg`) is not a source of its own data: its prayer calendar is Diyanet's tables for its cities, and the app answers it with the Diyanet calculation (`isDiyanetSource`, `fetchPrayerTimes.ts`). Nothing is fetched from igmg.org.

### Free APIs, mirrored, the API as backup

| Source | Into the repo by | Phone's backup | Calculation behind it |
|---|---|---|---|
| **Malaysia** — JAKIM e-Solat, 59 zones | `tools/national-tables/jakim.ts` (weekly; daily in early January) | e-Solat's JSON for the zone (`nationalLive.ts`) | `malaysiaMethod.ts`, the zone's extreme over a few fitted points: 95 % on the minute, 99.9 % within one |
| **Singapore** — MUIS | `tools/national-tables/muis.ts` (weekly) | data.gov.sg's CSV (`nationalLive.ts`) | method 11 (fitted angles): within a minute, ~70 % on it |
| **London** — the London Unified Prayer Timetable (londonprayertimes.com, the East London Mosque) | `tools/national-tables/london.ts` (weekly; daily in early January), with the API key in the `LONDON_PRAYER_TIMES_KEY` secret | none: the API takes a key the phone does not carry | the Moonsighting Committee's method (15) as a stand-in past the published year — the timetable's Fajr and Isha are from observation and are no formula |
| **Kyrgyzstan** — the Spiritual Administration of Muslims (muftiyat.kg's documented public API), 115 places | `tools/national-tables/kmdb.ts` (weekly; a window of two months, moved on each run) | none: a missing day is calculated | the Muslim World League's angles with the Hanafi Asr as a stand-in — Fajr is the Administration's 18°, its Isha and margins are not read |
| **Tajikistan** — the Islamic Centre (shuroiulamo.tj): Dushanbe's table and eighteen towns as minutes from it | `tools/national-tables/shuro.ts` (weekly; as far as the site has published) | none: a missing day is calculated | the Muslim World League's angles with the Hanafi Asr as a stand-in — the Centre's table is set by hand each year (Dhuhr at 12:40 every day) and is no calculation |
| **Dagestan** — the Muftiate of the Republic of Dagestan ([islamdag.ru](https://islamdag.ru/vremya-namaza/mahachkala)), 27 towns and district seats | `tools/national-tables/dagestan.ts` (weekly; a window of four months, moved on each run — the table is the same every year) | none: a missing day is calculated | the Muslim World League's angles as a stand-in — the table's Dhuhr, sunrise, Maghrib and Isha follow a formula with margins, its Fajr and Asr are set at intervals and are no calculation |
| **Bashkortostan** — the Spiritual Administration of Muslims of the Republic of Bashkortostan ([dumrb.com](https://dumrb.com/namaz)), 63 towns and district seats | `tools/national-tables/bashkortostan.ts` (weekly; a window of three months, as far as the Administration has published) | none: a missing day is calculated | the Muslim World League's angles with the Hanafi Asr as a stand-in — the table's margins are set by hand and by season, its Dhuhr is a fixed clock time, and its sunrise is served as printed even where it is earlier than the sun's |
| **Türkiye Takvimi** — namazvakti.com | `tools/namazvakti-dataset/`: the city index into git (`build.ts`), every city's year into the `data-namazvakti-<year>` release (`years.ts`, daily) | the city's XML from the site | `namazvakti.ts`, at the city's point fitted from its year: 99.86 % on the minute |

Malaysia, Singapore and Türkiye Takvimi stay on their free sources while
those work; their calculations are the backstop, checked every week
against the tables (`tools/verify-methods`, `data/prayer-times/verification/`).
