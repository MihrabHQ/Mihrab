# National prayer-time tables

The countries whose authority publishes a table per place, mirrored as-is
and served through one module in the app (`src/providers/nationalTable.ts`,
instances in `nationalTables.ts`). Indonesia's Kemenag table is served
through the same module but computed on the phone (its method and
correction list, from MihrabHQ/mihrab-methods); its places list,
`src/providers/data/kemenagPlaces.json`, is the only data it needs.

| Country | Source | Builder | Places |
|---|---|---|---|
| Singapore | MUIS's timetable on [data.gov.sg](https://data.gov.sg/datasets/d_a6a206cba471fe04b62dd886ef5eaf22/view) (Open Data Licence) | `muis.ts` | 1 |
| London | The London Unified Prayer Timetable, from [londonprayertimes.com](https://www.londonprayertimes.com)'s API (a free key, in the `LONDON_PRAYER_TIMES_KEY` secret) | `london.ts` | 1 point, listed twice: with the first Asr and with the second (Hanafi) |
| Kyrgyzstan | The Spiritual Administration of Muslims' timetable, from the [public API](https://muftiyat.kg/ru/calendar/api/) on its site | `kmdb.ts` | 115 (`kmdb-places.ts`, each at the point its timetable shows — the API gives no coordinates) |
| Tajikistan | The Islamic Centre of Tajikistan's [table](https://shuroiulamo.tj/tj/namaz) for Dushanbe, and the page's note of the towns' minutes | `shuro.ts` | 19 (Dushanbe and 18 towns) |
| Dagestan | The Muftiate of the Republic of Dagestan's timetable, a file per place on [islamdag.ru](https://islamdag.ru/vremya-namaza/mahachkala) (copying allowed with a link) | `dagestan.ts` | 27 towns and district seats; 365 rows, the same every year |
| Bashkortostan | The Spiritual Administration of Muslims of the Republic of Bashkortostan's timetable, from the open interface its own site reads ([dumrb.com](https://dumrb.com/namaz)) | `bashkortostan.ts` | 63 towns and district seats; a month a request, three months ahead |
| Malaysia | JAKIM's [e-Solat](https://www.e-solat.gov.my) JSON endpoint, per zone | `jakim.ts` | 59 zones, 178 towns (`jakim-zones.ts`) |

## What a builder produces

`write.ts` writes, for `data/prayer-times/<country>/v1/`:

| Path | Purpose |
|---|---|
| `cities/<id>.json` | `{id, city, timezone, builtAt, days: {date: [Imsak, Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha]}}` |
| `index.json` | Build time, status, window, coverage days — what the app polls |

and for the app:

| Path | Purpose |
|---|---|
| `src/providers/data/<id>Seed.json` | The whole window, seven minute counts per day per place, bundled |
| `src/providers/data/<id>Places.json` | The places the phone matches its location to |

Every day is checked before it is written: the seven times in order and
within the day, Dhuhr near midday, Maghrib after four — a table with a typo
is refused rather than published. An Imsak the source does not print is
written ten minutes before Fajr.

## How it runs

`.github/workflows/national-tables.yml`: Mondays, and daily from 1 to 7
January, because e-Solat serves the current year only — the window ends on
31 December and the phone computes JAKIM's own method (20° / 18°) for the
days until the January run lands. MUIS publishes a year ahead, around the
same time.

London's API also serves the current year only, and its table is written
as two places at one point because the timetable prints two Asr times and
a table holds one; the app serves the second to the Hanafi school
(`nationalTablePlaceId`). Its midwinter Maghrib is before four, which the
day check allows for this table alone (`minMaghrib`).

Run locally: `npx tsx tools/national-tables/muis.ts`, `… /jakim.ts`,
`LONDON_PRAYER_TIMES_KEY=… npx tsx tools/national-tables/london.ts`.
`TABLE_TODAY=YYYY-MM-DD` fixes "today" for a reproducible build.
