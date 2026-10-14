# National prayer-time tables

The countries whose authority publishes a table per place, mirrored as-is
and served through one module in the app (`src/providers/nationalTable.ts`,
instances in `nationalTables.ts`). Sweden, Morocco and Algeria predate this
and have their own modules; anything new goes here.

| Country | Source | Builder | Places |
|---|---|---|---|
| Singapore | MUIS's timetable on [data.gov.sg](https://data.gov.sg/datasets/d_a6a206cba471fe04b62dd886ef5eaf22/view) (Open Data Licence) | `muis.ts` | 1 |
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

Run locally: `npx tsx tools/national-tables/muis.ts`, `… /jakim.ts`.
`TABLE_TODAY=YYYY-MM-DD` fixes "today" for a reproducible build.
