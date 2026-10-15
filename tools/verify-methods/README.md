# Calculate, then check against the authority

What Mihrab distributes should be its own calculation — a method fitted
to each authority (`src/providers/localAdhan.ts`) — not a copy of the
authority's table. Sweden, Diyanet, Morocco, Algeria and Indonesia are
already computed on the phone, with each authority's small correction
list; those methods are developed and certified in
[MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods),
and the app copies them. Singapore's and Malaysia's free tables are still
served from this repo (`tools/national-tables`), with the authority's
method standing in past their window; this checks that method.

`verify.ts` takes the tables, computes each place's days with
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
npx tsx tools/verify-methods/verify.ts muis jakim # some
```

Exit 4 means an authority that is meant to match does not; the workflow
(`.github/workflows/verify-methods.yml`, Tuesdays after the tables are
rebuilt, Singapore and Malaysia) then opens or updates `Verification: <authority>` with the
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
  places files carry `heightM` (SRTM) and, where the
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

## Sweden, Diyanet, Morocco, Algeria, Indonesia

Computed on the phone, each with its authority's correction list, and on
every printed minute of the authority's tables over the dates checked:
the methods, their accuracy and how each was read off the tables are in
[MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods). The
check runs here too where those reference tables are checked out
(the folder `MIHRAB_TABLES` names):
`verify.ts diyanet habous marw kemenag`.

## Malaysia: JAKIM's zone times, to the minute where read

The reference is JAKIM's e-Solat year for all 59 zones, 2024, 2025 and
2026 (`jakim-year-fetch.py <out> [year]`; the API answers past years).
A zone's time is not one town's:

- **The extreme over a few points of the zone.** Every time is the latest
  of the times at two or three points (the earliest, for sunrise, which
  ends Fajr), then a margin, then the minute rounded up — Fajr and Isha
  18°, sunrise and Maghrib at −0°50′, Asr at its length plus the noon
  shadow, the precise sun at each moment. One point per zone leaves a
  seasonal drift of a minute and more; the latest of three takes Kuala
  Lumpur's Fajr from 87 misses a year to 1. The points and margins are
  fitted per zone and prayer on 2025–2026 (`/tmp` scripts:
  greedy on a 0.05° grid, then refined), stored in
  `src/providers/data/jakimMethodZones.json`.
- **Johor's and Pahang's Asr** take the noon shadow from the declination at
  00:00 UT of the day, as Kemenag's does: 0–3 misses in three years where
  the declination at Asr gives 170.

**Result:** on JAKIM's minute for 95.1 % of 2025 and 95.1 % of 2026, 99.9 %
within a minute; 2024, held out of the fit, 92.5 % (98.7 % within a minute
— Perlis and Gunung Kinabalu printed other figures that year, and NGS02's
2025 table has eleven days in a twelve-hour clock). What is not read yet:

- **Dhuhr in Johor, Pahang and Kedah** (about 36 a year per zone): the
  offset from the transit steps by 15–30 s from week to week, largest when
  the noon sun is near the zenith; no rounding, sun time or eot formula
  tried reproduces it. Kedah's seven zones print the same Dhuhr pattern
  shifted by whole minutes, as do JHR02, JHR04 and PHG02.
- **Asr in Negeri Sembilan, Penang and Perak** (60–85 a year per zone), not
  smooth enough for any seasonal correction.
- **Kedah** generally (20–130 a year per column).

These look like each state's own software. The app serves JAKIM's table
where it has one; this calculation is what it falls back to past the
published year.

## Türkiye Takvimi: the calendar's method, to the minute

The reference is the site's own year for 54 cities from 42°S to 60°N
(`/tmp`-saved `XML.php?cityID=` files; `nv-resid.py` reads them, the
standard meridian and the site's summer-time days included). Every column
is the bare sun (a precise sun at each event's moment) plus one per-city
constant, the temkin T, and a rounding:

| column | rule |
|---|---|
| İmsâk | 19°, less T, rounded down |
| Sabâh (Fajr) | 18°, rounded up — no temkin |
| Sunrise | the level horizon (0°), less T and 2 min, rounded up |
| Dhuhr, Asr, Isha (17°) | plus T, rounded up |
| Maghrib | 0°, plus T and 2 min, rounded up |

T is the time the sun takes on the summer solstice (declination 23.38°)
to go from the level horizon to 1.462° below it at the site's 250 m, and
1.719° at its 500 m — the only two heights it gives any city. The Dhuhr
windows pin T per city to a hundredth of a minute.

What is left is the city's point: the files give it to whole arc-minutes,
truncated, and the site computes with the finer one — moving a city by
less than 1′ makes even Sabâh, which has no temkin, exact. So at the file's
point the method is on the site's minute about 95 % of the time below 50°
(90 % with the high north's held summer nights) and within a minute
otherwise. The phone serves the site's own year when it has it.
