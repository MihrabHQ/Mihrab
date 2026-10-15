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
| **Diyanet** — Türkiye and worldwide | method 13, `diyanetMethod.ts` | — | 2024–2027, 8.06 M times |
| **Morocco** — Habous | method 21, `moroccoMethod.ts`, 164 cities | 99.12 % | 27 Aug → 11 Nov 2026, 75,768 times |
| **Algeria** — Ministry of Religious Affairs | method 19, `algeriaMethod.ts`, 68 cities | 99.37 % | 1448 AH, 101,184 times |
| **Indonesia** — Kemenag | method 20, `indonesiaMethod.ts`, 517 regencies | 99.97 % | Oct → Dec 2026, 266,772 times |

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

### Free APIs, mirrored, the API as backup

| Source | Into the repo by | Phone's backup | Calculation behind it |
|---|---|---|---|
| **Malaysia** — JAKIM e-Solat, 59 zones | `tools/national-tables/jakim.ts` (weekly; daily in early January) | e-Solat's JSON for the zone (`nationalLive.ts`) | `malaysiaMethod.ts`, the zone's extreme over a few fitted points: 95 % on the minute, 99.9 % within one |
| **Singapore** — MUIS | `tools/national-tables/muis.ts` (weekly) | data.gov.sg's CSV (`nationalLive.ts`) | method 11 (fitted angles): within a minute, ~70 % on it |
| **Türkiye Takvimi** — namazvakti.com | `tools/namazvakti-dataset/`: the city index into git (`build.ts`), every city's year into the `data-namazvakti-<year>` release (`years.ts`, daily) | the city's XML from the site | `namazvakti.ts`, at the city's point fitted from its year: 99.86 % on the minute |

Malaysia, Singapore and Türkiye Takvimi stay on their free sources while
those work; their calculations are the backstop, checked every week
against the tables (`tools/verify-methods`, `data/prayer-times/verification/`).
