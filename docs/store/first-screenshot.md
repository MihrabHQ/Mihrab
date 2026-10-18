# Shot list: a new first screenshot (accuracy)

The first screenshot is the one most people see without scrolling. The
accuracy headline belongs there: Today, with the source of the times named.
Nothing in the store listings changes until this is taken and approved; the
current screenshots stay as they are.

## What the app shows today — read before shooting

The example line "Diyanet · certified through Nov 2027" is **not something
the app shows**. Today names the city in the location chip; the source
appears only in the location sheet, as "Automatic · Diyanet"
(`src/settings/locationSourceLine.ts`). The certified span is not shown
anywhere: Today speaks about the calculation only when it is *not* current
(`methodCurrency.ts` — "method alone after …", "update Mihrab …").

So the shot needs one of two things, decided before it is taken:

1. **An app change** (preferred, because a screenshot should show the app):
   under the city on Today, a source line such as
   `Diyanet · matches the published timetable through Nov 2027`, with the date
   from the correction list in force (`correctionsInForce(authority).to`) and
   shown only while the method is current. Needs a string in all thirteen
   languages.
2. **A caption in the store frame**, outside the phone, generated from the
   record — never typed: `{{diyanet.toMonthYear}}` from
   `data/methods/certification.json`.

## The shot

| | |
|---|---|
| Screen | Today |
| Place | Istanbul (Fatih) — Automatic picks Diyanet in Türkiye. Alternates: Stockholm (Sweden), Casablanca (Morocco), Jakarta (Indonesia) |
| Time | Between Asr and Maghrib, so the countdown is to Maghrib — the prayer where a minute matters most |
| Look | Sky, Realistic colours, light — matches the rest of the gallery (`SHOT_V` in `scripts/build-site.js`) |
| Language | English for the en-US listing; Turkish for tr-TR with Istanbul; Swedish with Stockholm; Indonesian with Jakarta |
| Devices | iPhone 6.9″ and 6.5″, iPad 13″; Android phone 1080×2400 — the same sizes as the current set |
| Must be visible | The city and the source line (option 1), the five times, the countdown |
| Must not be visible | Notifications, a personal location, a status-bar carrier name, a banner (dismiss the method note if one shows) |

## Frame caption

Top: **To the printed minute.**
Below, generated: "Matches Diyanet’s published timetable: `{{diyanet.off}}` of
`{{diyanet.timesCompact}}` times off." For the tr-TR, sv-SE and id frames, the
same from the country drafts in `scripts/site/strings.json` once a native
speaker has reviewed them.

## Order after it

Keep the rest of the current order (`SHOTS` in `scripts/build-site.js` and the
store sets): the mushaf, the word reader, Tilawah, the month sheet, the
widgets.
