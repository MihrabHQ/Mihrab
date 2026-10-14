# Calculate, then check against the authority

What Mihrab distributes should be its own calculation — a method fitted
to each authority (`src/providers/localAdhan.ts`) — not a copy of the
authority's table. The tables the builders fetch (`tools/*-dataset`,
`tools/national-tables`) are kept for one purpose: to prove the
calculation right, day by day, and to say so the moment it is not.

`verify.ts` takes every fetched table, computes each place's days with
the method the phone uses for that authority, and compares them minute
by minute. It writes:

- `data/prayer-times/verification/summary.md` — every authority, one
  section each: the share of times within tolerance, the distribution of
  differences per prayer, the rows furthest off;
- `data/prayer-times/verification/<id>.json` — the same as data;
- `data/prayer-times/verification/<id>.md` — that authority's section
  alone, which the workflow posts as the issue body.

```sh
npx tsx tools/verify-methods/verify.ts            # all
npx tsx tools/verify-methods/verify.ts jakim ifis # some
```

Exit 4 means an authority that is meant to match does not; the workflow
(`.github/workflows/verify-methods.yml`, Tuesdays after the tables are
rebuilt) then opens or updates `Verification: <authority>` with the
section, and closes it again once the two agree.

## Reading a report

Three things can be wrong, and the report keeps them apart:

- **The angles** — most times a minute or two off in the same direction,
  at every place. Change the method's parameters in `localAdhan.ts`.
- **A place** — every prayer off by the same constant at every date,
  while the others agree. Dhuhr gives the longitude (four minutes per
  degree); sunrise against Maghrib gives the latitude, or the height of
  the horizon the authority allows that town. Fix the coordinate in the
  places file, or accept the authority's margin. These places are listed
  separately and left out of the method's own statistics.
- **A day** — a single row far off. The authority's hand edit, or its
  mistake; or ours.

Tolerances are per authority in `authorities.ts`: how far a time may be
from the table and still count (rounding differs), what share may fall
outside, and the single-row maximum that catches a wrong hour. A zone
system (JAKIM: one time for a whole zone, computed at a point of the
ministry's choosing) gets a looser share than a per-city table.

## Accepting a difference

A difference that is understood — the authority's own convention for one
town, a hand-edited week, a row of theirs that is simply wrong — goes in
`accepted.json` so it is counted as agreed and not raised again:

```json
[
  {
    "authority": "marw",
    "place": "In Guezzam",
    "prayer": "Asr",
    "from": "2027-05-20",
    "to": "2027-06-30",
    "maxAbs": 15,
    "note": "The ministry's Asr near the solstice at 19.6°N, sun north of the zenith; theirs, not ours."
  }
]
```

`place`, `prayer`, `from`, `to` and `maxAbs` are each optional; an entry
without them accepts the whole authority, which is never what is meant.
Every entry carries a `note` saying why — the file is the record of what
was decided and on what grounds.

## Heights, and what the first run found

The first run (October 2026) found the angles right everywhere and
three other things, each now in the data:

- **A town on a hill.** The Moroccan ministry lowers the horizon for
  every city by about 0.02° per √metre; JAKIM computes its five summit
  zones at altitude with the textbook 0.0293°; Kemenag gives 56 highland
  regencies a flat four and a half minutes whatever their height. So the
  places files carry `heightM` (SRTM, `heights.py`) and, where the
  authority's figure is not a height, `horizonMin`; the method applies
  them to sunrise and Maghrib (`src/prayer/horizonDip.ts`), and the
  phone's stand-in computes a listed place at the place, not at the
  reader's own spot. `fit-dip.ts` finds an authority's coefficient.
- **A regency computed elsewhere.** Thirty-two Kemenag regencies sat a
  degree or so from the ministry's point (an archipelago's seat against
  its centroid); `place-medians.ts` gives every place's constant, and
  Dhuhr's says the longitude. Two the ministry itself computes on the
  wrong island are kept at the true seat and accepted.
- **A formula of the authority's own.** The Algerian ministry's Asr takes
  the noon shadow with its sign, so south of the Tropic its Asr comes
  early about the solstice; method 19 now does the same.

## What is not checked here

- **AlAdhan and PrayTimes.dev** are services, not tables; the method
  tests in `__tests__/calculationMethods.test.ts` compare against them.
- **Türkiye Takvimi** (namazvakti.com) is fetched per city by the phone,
  not mirrored; its method is fitted and checked in
  `tools/namazvakti-dataset/model-fit.ts` and `__tests__/namazvakti.test.ts`.
- **Türkiye Takvimi's** method was read off the tables rather than
  published.

## Sweden: the Congress method

Islamiska Förbundet's tables are Diyanet's own (ezanvakti.emushaf.net,
country 12), computed by the International Prayer Times Congress method
(Istanbul 2021; awqatsalah.com, "Tespit Kriterleri"). Method 24 is that
method, in `src/providers/congressMethod.ts`: the published rules plus
what the tables turn out to do with them — the Almanac's low-precision
sun taken at 0h UT; the carried night share over the day's own night,
Fajr's scaled by 18/16; the gradual transition a straight line over the
days on which the true time lies within twenty minutes of the takdir at
the gap's edge; the five-hour floors each end on its own, and a
midsummer night floored at both ends (or within a minute of it)
anchoring the season's sunrise, Maghrib, Fajr and Isha.

- `congress-model.py` is the Python model the method was reverse-
  engineered in, day by day against a city's table:
  `python3 tools/verify-methods/congress-model.py stockholm 59.3333 18.0333 --as-year 2026 --days 2027-04-01:2027-04-30`
  (`--as-year 2026`: the site's 2027 rows are its 2026 rows copied).
- `fit-all.py` finds, for every city, the coordinates Diyanet computes
  its table for — an arc-minute grid about the town, scored on sunrise,
  Dhuhr and Maghrib — and writes `diyanet-sweden-coords.json`, which
  the checker and the dataset builder use. They are not always the
  town's: Kiruna's table is computed for 64°N (Umeå's longitude),
  Ystad's for a point west of the town, Gällivare's, Ludvika's and
  Torsby's where the geocoder had not put them. `fit-wide.py` searches
  further for such cases; `fit-sun.py` tests sun models and rounding;
  `run-cities.sh` scores a list of cities; `congress-ts-check.ts` runs
  the TypeScript port against a table.
- The result: every time within a minute of the table on every day in
  all 108 cities, and on the minute on 90–99 % of days. What remains is
  Diyanet's own ephemeris constants and coordinate decimals, which the
  tables alone cannot give. The carried share is fixed on the last day
  the 18° dawn forms, so it moves from year to year (Umeå: 0.187 in
  2026, 0.171 in 2027), which is how a copied year is told from a
  published one (`src/prayer/swedenYearCheck.ts`).
