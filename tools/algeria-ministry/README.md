# Algeria dataset (Ministry of Religious Affairs and Wakfs)

The app serves Algeria the Ministry's own prayer timetable, the way it serves
Morocco (Habous) and Sweden (Islamiska Förbundet): the user is matched to the
nearest listed city and gets that city's published times, exactly. Issue #70.

## Where the times come from

The Ministry publishes its timetable in two places:

- **Scanned PDFs on marw.dz**, one per region. Each has a daily table for the
  regional centre and monthly offsets for the other places.
- **A database inside its official app**, "أذان الجزائر الرسمي"
  (`com.issolah.marwalarm`, Google Play, publisher "Ministere des affaires
  religieuse et wakfs"). This holds 68 cities, every day, in plain minutes.

This dataset is built from the app's database, not the PDFs. The database
needs no OCR, and each city in it is worked out on its own every day rather
than as a centre plus a rounded monthly offset.

Before switching to the database, it was checked against the PDFs. For 1448 AH
the three regional centres (Algiers, Djelfa, Adrar) agree on 6,382 of 6,390
published times, and the remaining eight look like OCR misreads. The other
places differ by about a minute, because of the PDFs' monthly rounding. An
older copy of the database (1442 AH) matches that year's PDF tables exactly.

The app has no data server. The Ministry ships each Hijri year as an app
update; 1448 arrived on 17 June 2026.

## How it is built

```
npx tsx tools/algeria-ministry/build.ts path/to/app.xapk   # or .apk
```

`build.ts` refuses the file, and writes nothing, unless all of these pass:

1. **Signature.** The APK's signature must verify (`apksigner`), and its
   signing certificate must be the pinned one (`MARW_CERT_SHA256`). When a
   Google Play source stamp is present, it must be Play's. Because of this,
   it does not matter where the file was downloaded from.
2. **Package.** The package must be `com.issolah.marwalarm` (`aapt2`).
3. **Data** (`dataset.ts`):
   - every city has coordinates in `cities.ts`; a new city fails the build
     until it is added;
   - every city has every day, exactly once;
   - the six times run in order through the day;
   - every time is within 5 minutes of the Ministry's own method at that
     city: 18° / 17°, Maghrib 3 minutes after sunset, Shafi'i Asr.

   The method check catches a table filed under the wrong city, a shifted day
   or a corrupted value. It has one exception. When the noon sun is at or
   north of the zenith (In Guezzam, Tamanrasset, Bordj Badji Mokhtar, roughly
   late May to July), the Ministry's Asr stays put while the textbook formula
   moves later, by up to 13 minutes. The Ministry's figure is what its app
   and the mosques there use, so it is served as published and Asr is not
   method-checked on those days.

The build writes:

- `data/prayer-times/algeria/v1/cities/<id>.json` and `index.json`. Phones
  fetch these from GitHub's raw CDN.
- `src/providers/data/marwSeed.json`. The whole published window, bundled in
  the app in a compact form: six minute counts per day.
- `src/providers/data/algeriaCities.json`. City ids, names and coordinates.

Running it again on the same app version does nothing unless `MARW_FORCE=1`
is set.

## Automation

`.github/workflows/marw-dataset.yml` runs weekly, and daily from May to July:

1. It downloads the latest app from APKPure with EFF's
   [apkeep](https://github.com/EFForg/apkeep). The apkeep binary itself is
   pinned by sha256.
2. It runs the build.
3. When the app version is new, it opens a **pull request** with a summary,
   including any already-published day whose times changed. Merging the PR
   is what publishes the new data to phones.

If the build fails, or fewer than 30 days of data are left, the workflow sends
an email.

For the workflow to open PRs, the repository setting *Settings → Actions →
General → "Allow GitHub Actions to create and approve pull requests"* must be
on.

## Doing it by hand

If APKPure lags behind Google Play, any copy of the app works, because the
signature is checked either way. Install the app on an Android phone, then:

```
adb shell pm path com.issolah.marwalarm        # lists base.apk and splits
adb pull <path to base.apk> marw.apk
npx tsx tools/algeria-ministry/build.ts marw.apk
```

## When it runs out

The data covers one Hijri year; 1448 ends on 5 June 2027. Past the end, the
app computes the Algeria method on the device. That method is typically
within a minute or two of the Ministry, and AlAdhan is not used for it,
because AlAdhan's method 19 lacks the Maghrib margin.

## If the certificate changes

The build fails with "signing certificate … is not the Ministry app's pinned
…". Before you update `MARW_CERT_SHA256` in `build.ts`, confirm that the new
key belongs to the Ministry's Play listing.
