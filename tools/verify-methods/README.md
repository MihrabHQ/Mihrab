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

## Sweden: the Congress method, to the minute

Islamiska Förbundet's tables are Diyanet's own, republished: the 2026
rows are identical to what Diyanet's API (awqatsalah.com) serves for the
same places. So the reference is **Diyanet's genuine tables**, 2024–2027,
for all 160 Swedish places Diyanet lists — not the site's copy, which
serves the previous year's figures for a year it has not published and
prints Umeå's table for Kiruna. The method (method 24,
`src/providers/congressMethod.ts`) is the International Prayer Times
Congress method (Istanbul 2021, "Tespit Kriterleri") as Diyanet computes
it, read off those tables:

- **The sun**, once a day at 0h UT less 45 s: Meeus's mean elements and
  equation of the centre (1.914602° − 0.004817°·T …), the *true*
  longitude (no aberration, no nutation), the *apparent* obliquity (mean
  plus the four-term nutation), the equation of time as L0 − α, plus
  0.106 s. Each step was measured, not guessed: on any one day the 160
  places round their Dhuhr at different points of the minute, and
  intersecting their rounding windows pins Diyanet's equation of time
  for that day to under a second (`diyanet-perday.py`); its difference
  from the Almanac formula was a clean −0.0064·sin g minutes, which is
  Meeus's equation of the centre; and so on down to a fraction of a
  second. Horizon −0.833°; evaluating at each event's own moment, or
  the precise apparent sun, is far worse.
- **Coordinates** to three decimals of a degree — every latitude fitted
  lands on one, and every longitude on one plus the same constant (the
  0.106 s). They are the real towns, except Ystad, which Diyanet
  computes 43 km west of the town, and Kungälv, ~200 km south.
- **Asr** that never forms is printed at Dhuhr's time (the published
  rule); Asr is never before Dhuhr.
- **The floors**: the day and the night never shorter than five hours,
  each end on its own. Where midsummer's night is floored at both ends
  (to within a minute), the floored times never step back: before
  midsummer sunrise is held against midsummer's Dhuhr and a floored
  Maghrib against the latest Dhuhr since its floor began; after it,
  against every Dhuhr since midsummer. Carried Fajr and Isha follow the
  same rule.
- **The carried share** is a third of the sharia night (Maghrib to the
  next dawn) over the night, on the last day the 18° dawn forms; Isha is
  that share of the night after Maghrib, Fajr 18/16 of it before
  sunrise. The gradual transition is a straight line over the days the
  true time lies within twenty minutes of the takdir at the gap's edge.
  The share is fixed afresh each year (Umeå: 0.187 in 2026, 0.171 in
  2027), which is how a copied year is told from a published one
  (`src/prayer/swedenYearCheck.ts`).

**Result:** 99.94 % of 1.39 million times on Diyanet's printed minute,
every one within a minute; 0.06 % — about five per city over four
years — are a fraction of a second the other side of the rounding
point, the last of Diyanet's exact implementation.

- `diyanet-fetch.py` downloads the tables (CI does, weekly; not
  committed). `diyanet-sweden-points.json` is Diyanet's points; the
  coordinates file the app uses holds them too.
- The `diyanet` check compares to the minute; the `ifis` check compares
  the site's table and sets aside rows that differ from Diyanet's own.
- Research tools: `congress-model.py` (the model, `--diyanet <id>`),
  `diyanet-exact.py` / `-joint.py` / `-allcities.py` / `-snap.py` (sun
  model and coordinates), `diyanet-perday.py` (the day-by-day equation
  of time), `diyanet-dhuhr.py`, `diyanet-all-prayers.py`,
  `diyanet-fi-misses.py` (every miss, by regime), `diyanet-ts-check.ts`
  (the app's TypeScript against every table).

## Algeria: the Ministry's method, to the minute

The reference is the Ministry's own table (its official app's database,
`tools/algeria-ministry`): 68 cities, every day of 1448 AH. The method
(method 19, `src/providers/algeriaMethod.ts`) was read off it with
`table-exact.py`, the Sweden approach generalised (fit each city's point
to its own table, then ask which model leaves the fewest misses):

- **The sun is NOAA's** — the solar-calculator series for the equation of
  time, its declination. Of every model tried it is the only one near the
  table: Dhuhr alone, after the best longitude for each city, misses 83
  of 16,864 times with NOAA against ~200 with Meeus's chapter-25 sun and
  235 with the precise sun (JPL DE421, `sun-jpl-grid.py`).
- **Dhuhr is the transit**, the equation of time taken there (iterated).
- **Every other time** is the transit ± the hour angle from the
  declination at that prayer's own moment (iterated), with the equation
  of time kept at noon's value. Taking both at the moment, or both once a
  day, is five to six times worse.
- Fajr 18°, Isha 17°, sunrise and sunset −0.833°; **Asr from the noon
  shadow tan(φ − δ) with its sign** (In Guezzam, Bordj Badji Mokhtar and
  Tamanrasset come early about the June solstice); Maghrib sunset + 3.
- **Every time rounded up** to the minute.
- The points (`src/providers/data/algeriaMethodPoints.json`) sit within
  a few seconds of time of the towns; they are not on any grid (whole
  arc-minutes, 0.01° and 0.001° were all tried).

**Result:** 99.37 % of 101,184 times on the Ministry's printed minute,
every one within a minute. The misses are spread evenly over the cities,
the prayers and the year, and each is within about a second of a minute's
edge (median 0.5 s): their sun differs from NOAA's by a second or so, a
little differently each day. No variant tried closes it — the evaluation
instant, the number of iterations, the obliquity in the series, ΔT,
single-precision arithmetic, rounding the equation of time or the clock
time, a lunar term, the horizon; a smooth per-day correction removes
only a sixth of them.

- The `marw` check compares to the minute, at those points.
- Research tools: `table-exact.py` (`resid`, `margins`, `fit`, `excess`;
  `DEC_AT`/`EOT_AT`, `PASSES`, `START`, `DEC_SHIFT`, `EOT_FIX`,
  `ROUND_HOURS` select the variants), `sun-jpl-grid.py`.
