# namazvakti.com city index

The Türkiye Takvimi source (namazvakti.com) publishes a year of times for every
city it lists — tens of thousands of them, worldwide — at
`https://www.namazvakti.com/XML.php?cityID=<id>`. Those yearly tables are small
and the phone fetches them itself, one city, once a year. What the phone cannot
do is find the right city: the site has no search by coordinates that it
documents, and its lists are country → state → city pages.

So this job builds only the **index**: every city's id, name and coordinates,
cut into 5° tiles the phone can fetch for where it is.

## What it produces (`data/prayer-times/namazvakti/v1/`)

| Path | Purpose |
|---|---|
| `tiles/<lat>_<lon>.json` | `{v:1, tile, cities:[[id, lat, lon, name, height?]]}` — the SW corner of a 5° square; `height` only when not 250 m |
| `index.json` | Coverage summary (cities listed, located, tiles, complete) |
| `cities.tsv` | Working table: id, country, lat, lon, height, name, state, table (`1` has times, `0` none, empty not yet checked) |
| `countries.json`, `crawl.json` | Crawl state, so a run resumes where the last stopped |

The app (`src/providers/namazvakti.ts`) fetches the tile around the phone and
its neighbours, picks the nearest city within 75 km, then fetches that city's
year from the site and keeps it. Without the site it computes the same
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
