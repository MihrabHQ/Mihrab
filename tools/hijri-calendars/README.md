# Hijri calendars (Indonesia)

Generates `src/hijri/data/monthStarts.json`, the first day of every Hijri month by:

- **MABIMS** (`mabims`): Indonesia's government (Kemenag) and Nahdlatul Ulama. On the evening after the conjunction, somewhere in Indonesia, the crescent at sunset is at least 3° high and at least 6.4° from the sun, both geocentric. In force since 1444 AH (2022). Geocentric altitude reproduces all 23 government dates in `calibrate.ts`: 13 sidang isbat results and 10 national holidays (1 Muharram, Maulid, Isra Mi'raj). Topocentric altitude gets 1 Rajab 1447 a day late. The build also lists the months that are **too close to call** (`mabimsUncertain`): those where a quarter of a degree either way, or the topocentric reading, gives another day. That is 41 of 685. The isbat reminder flags them. The government confirms Ramadan, Syawal and Zulhijah by sighting in the sidang isbat, so a prediction can be overruled.
- **KHGT** (`khgt`): Muhammadiyah's Kalender Hijriah Global Tunggal, used since 1 Muharram 1447 AH (26 June 2025). **Taken from Muhammadiyah's own published calendar** ([khgt.muhammadiyah.or.id](https://khgt.muhammadiyah.or.id/kalendar-hijriah), read by `khgtOfficial.ts`) for every month it publishes: 1447 to 1492-11 when written. The site's Zulhijah 1492 has no dates (it shows "Januari 1970"). The rule below fills that month and the years after it. Where both exist, the rule disagreed with the official calendar on 54 of 551 months (10%), mostly by giving the 1st a day later. That is why the official calendar is used wherever it exists, and why the tail after 1492 is the least reliable part of the table. One date for the whole world. The month begins the next day if, anywhere on Earth before 24:00 UTC, the crescent at sunset is at least 5° high (geocentric) and 8° from the sun. It also begins the next day if those values are reached after 24:00 UTC on the American mainland and the conjunction came before dawn in New Zealand.

Before each table begins and after it ends (1500 AH), the app counts months of the arithmetic calendar's lengths **from the table's edge**. It never uses the arithmetic calendar's own dates there, which can be a day off at the seam and would repeat or skip a day. Pre-2025 Muhammadiyah dates (its older *wujudul hilal* rule) and pre-2022 government dates are therefore approximate.

## Announced corrections (`data/hijri/v1/overrides.json`)

The government confirms Ramadan, Syawal and Zulhijah in the sidang isbat, on the evening of the 29th of the month before. When it announces a date the MABIMS prediction got wrong, add it to `mabims` in `data/hijri/v1/overrides.json` with a source and link. Set `updated` to today's date and push to main. Phones read the file every few hours (`src/hijri/overrides.ts`) and apply it without a release. The months after it shift as needed to stay 29–30 days.

`.github/workflows/hijri-isbat-reminder.yml` opens an issue on each isbat day with the app's prediction and the line to add. The file is validated whole (`src/hijri/overridesFile.ts`). One bad entry and phones ignore the file, so `__tests__/hijriOverrides.test.ts` checks it in CI.

## Automation

- `.github/workflows/hijri-calendars.yml` runs monthly. It checks both rules against `calibrate.ts`, then re-reads Muhammadiyah's calendar and rebuilds. A changed table opens a pull request; nothing reaches phones without one.
- `.github/workflows/hijri-isbat-reminder.yml` runs daily and opens an issue on each sidang isbat day.

## Rebuild

```sh
(cd tools/hijri-calendars && npm install --ignore-scripts)
npx tsx tools/hijri-calendars/calibrate.ts   # against announced dates
npx tsx tools/hijri-calendars/build.ts       # fetches KHGT, computes the rest, writes the table (~4 min)
```

`astronomy-engine` is pinned in this folder's own `package.json`, so it never enters the app bundle.

`calibrate.ts` holds the dates each body announced. Both rules match all of them: 13 government month starts from 1444–1447 and 10 Muhammadiyah ones from 1447–1448. Add new announcements there, and to `__tests__/hijriCalendars.test.ts`, as they are made.

## Known simplifications

- MABIMS is checked at ten points across Indonesia, from Sabang to Merauke. The western end decides nearly every month.
- The computed KHGT tail (after 1492) checks a 4° × 5° grid of the world, with a coarse outline of the American mainland. It is right about 90% of the time against the official calendar.
