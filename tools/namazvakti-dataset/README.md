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
| `tiles/<lat>_<lon>.json` | `{v:1, tile, cities:[[id, lat, lon, name]]}` — the SW corner of a 5° square |
| `index.json` | Coverage summary (cities listed, located, tiles, complete) |
| `cities.tsv` | Working table: id, country, lat, lon, height, name, state |
| `countries.json`, `crawl.json` | Crawl state, so a run resumes where the last stopped |

The app (`src/providers/namazvakti.ts`) fetches the tile around the phone and
its neighbours, picks the nearest city within 75 km, then fetches that city's
year from the site and keeps it. Without the site it computes the same
calendar on the phone (`computeNamazvaktiMethodTimes`, within 2–3 min of the
tables all year at Istanbul and Cologne) — never AlAdhan.

## How it runs

Three phases, each resumable:

1. **List** — `CountryList.php` → `StateList.php` → `CityList.php`, refreshed
   every `NV_LIST_REFRESH_DAYS` (30).
2. **Locate** — the head of each new city's XML, read until the `<cityinfo>`
   attributes and then aborted, for its coordinates.
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
