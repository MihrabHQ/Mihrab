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

## What is not checked here

- **AlAdhan and PrayTimes.dev** are services, not tables; the method
  tests in `__tests__/calculationMethods.test.ts` compare against them.
- **Türkiye Takvimi** (namazvakti.com) is fetched per city by the phone,
  not mirrored; its method is fitted and checked in
  `tools/namazvakti-dataset/model-fit.ts` and `__tests__/namazvakti.test.ts`.
- **Sweden** has no fitted method yet (`method: 'auto'`, report only):
  Islamiska Förbundet's summer rule is still to be worked out.
