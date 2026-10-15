# Prayer-time sources: where the app gets its times

October 2026. The rule: **every published table the app serves comes from
Mihrab's own repo**, never from the authority's site or API directly — a
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

### Sweden: calculated on the phone, nothing fetched

Sweden is not a mirrored table. The app calculates Islamiska Förbundet's
times on the phone, offline: the International Prayer Times Congress method
(Istanbul 2021) as Diyanet computes the Swedish tables, which Islamiska
Förbundet publishes — method 24, "Sweden (Islamiska Förbundet)"
(`src/providers/congressMethod.ts`), at the point each of Islamiska
Förbundet's 108 cities is computed at. With a small correction list
(`src/providers/swedenCorrections.ts` and
`src/providers/data/swedenCorrections.json`: 270 one-minute adjustments at
published city points) it is on the printed minute for every time of
Diyanet's and Islamiska Förbundet's timetables over 2024–2027, 1.39 million
times; by the method alone 99.98 %, every time within the minute. The list
covers the years the timetables do and is renewed each year. Where
Islamiska Förbundet's own copy differs from Diyanet's (a year served
copied, Kiruna printed with Umeå's table), the app follows Diyanet.

Source: [MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods) (`src/methods/sweden.ts`),
where the method and its check against the timetables live.

### Free APIs, mirrored, the API as backup

| Source | Into the repo by | Phone's backup | Calculation behind it |
|---|---|---|---|
| **Malaysia** — JAKIM e-Solat, 59 zones | `tools/national-tables/jakim.ts` (weekly; daily in early January) | e-Solat's JSON for the zone (`nationalLive.ts`) | `malaysiaMethod.ts`, the zone's extreme over a few fitted points: 95 % on the minute, 99.9 % within one |
| **Singapore** — MUIS | `tools/national-tables/muis.ts` (weekly) | data.gov.sg's CSV (`nationalLive.ts`) | method 11 (fitted angles): within a minute, ~70 % on it |
| **Türkiye Takvimi** — namazvakti.com | `tools/namazvakti-dataset/`: the city index into git (`build.ts`), every city's year into the `data-namazvakti-<year>` release (`years.ts`, daily) | the city's XML from the site | `namazvakti.ts`, at the city's point fitted from its year: 99.86 % on the minute |

### Scraped or account-only sources, mirrored, no live backup

The phone never asks these sources: their mirror in the repo is what is
served, and the calculation fills the days it does not have.

| Source | Into the repo by | Why no live backup | Calculation behind it |
|---|---|---|---|
| **Morocco** — Habous | `tools/habous-dataset/` (daily) | scraped HTML, a month at a time | method 21 (`moroccoMethod.ts`): 98.6 % |
| **Algeria** — Ministry of Religious Affairs | `tools/algeria-ministry/` | the ministry's app database, rebuilt from its APK | method 19 (`algeriaMethod.ts`): 99.4 % |
| **Indonesia** — Kemenag | `tools/national-tables/kemenag.ts` (weekly) | the site answers only the project's builders | method 20 (`indonesiaMethod.ts`): 99.965 % |

## The plan: these three to calculations

The calculations above are already in the app, behind each table, and
checked every week against the mirrored tables
(`data/prayer-times/verification/`). Each source moves to serving the
calculation — a switch per source: `servesCalculation` in
`habousDataset.ts`, `marwDataset.ts`, and
the table's config in `nationalTables.ts` — when:

1. **It is on the authority's minute for every time of a full year** of its
   tables, or every remaining difference is understood and accepted in
   `tools/verify-methods/accepted.json` (a fault in the source's copy, a
   rounding the authority itself is inconsistent about).
2. **It has held there for three months of the weekly check** with no new
   difference, including a change of year.
3. **The weekly check stays on afterwards**, with an alarm on any
   difference, and the table builders stay in place to feed it.

What is left for each:

- **Indonesia** (99.965 %): two regencies (Karawang and regency 54) whose
  times no single point fits, and times within a fraction of a second of the
  rounding point. Needs a year of tables (the site gives three months), to
  confirm the Asr rule in June.
- **Sweden — done (October 2026).** Served by the calculation alone (above),
  from [MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods); nothing is fetched for
  Sweden any more.
- **Algeria** (99.4 %): a residual of about a second, day to day, in the
  sun the ministry uses — not yet modelled.
- **Morocco** (98.6 %): a few cities' points and a seasonal 2–3 s drift in
  sunrise and Maghrib; the semi-diameter's variation explains part of it.

Malaysia, Singapore and Türkiye Takvimi stay on their free sources while
those work; their calculations are the backstop, not the plan.
