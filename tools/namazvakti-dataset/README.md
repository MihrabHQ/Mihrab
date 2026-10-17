# namazvakti.com city index

The Türkiye Takvimi source (namazvakti.com) publishes a year of times for every
city it lists — about 118,000 with times, worldwide — at
`https://www.namazvakti.com/XML.php?cityID=<id>`. Two jobs mirror it into this
repository, so the phone reads Mihrab's copy and asks the site only as a backup
(docs/prayer-times-sources.md):

- **the index** (`build.ts`, below): every city's id, name and coordinates, cut
  into 5° tiles the phone can fetch for where it is — the site has no search by
  coordinates and its lists are country → state → city pages;
- **the yearly tables** (`years.ts`, at the end): every city's year, packed.

## What it produces (`data/prayer-times/namazvakti/v1/`)

| Path | Purpose |
|---|---|
| `tiles/<lat>_<lon>.json` | `{v:1, tile, cities:[[id, lat, lon, name, height?]]}` — the SW corner of a 5° square; `height` only when not 250 m |
| `index.json` | Coverage summary (cities listed, located, tiles, complete) |
| `cities.tsv` | Working table: id, country, lat, lon, height, name, state, table (`1` has times, `0` none, empty not yet checked) |
| `countries.json`, `crawl.json` | Crawl state, so a run resumes where the last stopped |

The app (`src/providers/namazvakti.ts`) fetches the tile around the phone and
its neighbours, picks the nearest city within 75 km, then reads that city's
year from the mirror (the site only when the mirror does not have it) and
keeps it. Without the site it computes the same
calendar on the phone (`computeNamazvaktiMethodTimes`, fitted to the site's
tables from Mecca to Oslo) — never AlAdhan.

## How it runs

Three phases, each resumable:

1. **List** — `CountryList.php` → `StateList.php` → `CityList.php`, refreshed
   every `NV_LIST_REFRESH_DAYS` (30).
2. **Locate** — the head of each new city's XML, read to its first day and
   then aborted: the coordinates and height, and whether the site publishes
   any times for it. It lists cities north of about 62° (Umeå, Kiruna,
   Tromsø) with none; those are left out of the tiles, so a phone there is
   told the source has no times for it.
3. **Publish** — rewrite the tiles and `index.json`.

`.github/workflows/namazvakti-dataset.yml` runs it daily and commits the
changes; a first full crawl takes several runs, after which a day's run is a
few hundred requests. Failure emails go to the maintainer (exit 2: the site is
failing; exit 3: anything else).

Run locally: `npx tsx tools/namazvakti-dataset/build.ts`

| Var | Default | Meaning |
|---|---|---|
| `NV_MAX_REQUESTS` | 20000 | per-run request budget |
| `NV_MAX_WALL_MIN` | 300 | per-run wall-clock budget |
| `NV_DELAY_MS` | 300 | politeness delay between requests |
| `NV_LIST_REFRESH_DAYS` | 30 | how often the lists are re-read |

Every request carries a User-Agent naming the project and a contact address.

## Other tools here

- `seed-country.ts <Country>` — lists and locates one country now and merges
  it into the tiles, to try the provider there before the crawl reaches it.
- `calibrate.ts` — the site's tables against bare astronomy for a spread of
  cities, per time: the evidence for the on-phone method.
- `model-fit.ts` — scores the on-phone method (temkin 0.97°, horizon 0.5°)
  against saved years: about 97 % of times within a minute, 99.5 % within two.

## The yearly tables (`years.ts`)

Every located city with times, its year packed by
`src/providers/namazvaktiPack.ts` (eight columns, a character a day; ~460 bytes
a city gzipped, round-tripped exactly — `__tests__/namazvaktiPack.test.ts`),
spread over 512 gzipped files by city id (`b<id % 512>.json.gz`, ~100 kB each)
plus `index.json`. About 55 MB a year: too much for git history and the raw
CDN, so they are assets of the **`data-namazvakti-<year>` release** of this
repository, updated in place by `.github/workflows/namazvakti-years.yml`
(daily): download the year's files, read the cities due — first those the
mirror does not have, then those read longest ago (`NV_REFRESH_DAYS`, 60) —
within a request budget (`NV_MAX_REQUESTS`, 25,000, 0.4 s apart), upload the
files that changed. A full pass is about five days of runs; a new year's
release is created on 1 January, and until a city is in it the phone asks the
site for that city.

Each answer is filed under the year the file itself gives (`<!--2027-->`).
From 1 December a run builds next year's release as well: the cities it
lacks are asked first, and while the site still serves this year's file the
run notices after a few answers and spends the rest of its budget on this
year. The workflow checks every file of a release downloaded before a run
(one that did not download is left alone, never rebuilt from a part of its
cities), and after the upload that the release has every file the run's
`index.json` counts (`years.ts verify`); one it still lacks is read again
first by the next run.
