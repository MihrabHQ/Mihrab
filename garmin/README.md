# Mihrab on a Garmin watch

Three Connect IQ apps, fed by the Android app through
[Gadgetbridge](https://gadgetbridge.org):

- a **watch face**, drawn for a MIP screen — always on, 64 colours and
  nothing in between, read at a glance in daylight and by a dim backlight
  at night. So: white on black for everything that is read, the app's
  accent (which the phone sends, snapped to a colour the screen shows) for
  the next prayer and the way to it, grey only for what is read second,
  nothing anti-aliased, and nothing moving but the seconds and the
  countdown. Top to bottom: the date (or the Hijri date, or both); the
  weather — an icon drawn for the condition, the temperature now, the
  day's high and low — and beside it the battery as CyanogenMod drew it,
  a circle that fills round with the charge and has the percentage
  inside; the time as large as the dial allows, in the app's
  Roboto at whichever of a ladder of sizes fits, its colon in the accent,
  with am/pm and the seconds small to its right; the next prayer, its name
  in the accent and its time in white; the countdown to it in full,
  "05:49:12", in the same Roboto; and at the foot, as Garmin's own faces
  write theirs, a footprint with today's steps.
  **Round the edge are the twelve hours ahead**, read as a clock is read
  — the app's Track bent into the bezel: a bead where the hour hand would
  be is the time now (yellow by day, white by night); from it, clockwise,
  the line is white while it will be day and thin grey while it will be
  night, with a tick at each prayer on the way, the next one a ring in the
  accent, and the stretch from now to it thick in the accent, shortening
  as it nears. Isha at 17:45 stands where the hour hand points at a
  quarter to six. (For one build it was the whole day once round with noon
  at the top; nobody reads the edge of a watch that way.)
  The seconds and the countdown are redrawn every second inside their own
  clips (a partial update), from values kept since the minute's draw and
  in fonts whose box is exactly their figures (`garmin/tools/clockfont.py`),
  so the lines the screen refreshes are no more than the ink: about 25 ms
  a second in the simulator's diagnostics against the 30 a face is
  allowed. If the watch says the budget was passed all the same, the face
  drops the seconds and counts down to the minute rather than leave
  figures the system has stopped redrawing. Everything else is drawn once
  a minute. The face is laid out, not placed: it picks each row's font and
  stacks the rows so that every row's ink — measured for the widest thing
  that row can show — lies inside the ring, trying arrangements from the
  best down; then, with the clock settled, it grows the rows while
  everything still fits and opens the gaps above and below the clock, so
  the stack reaches from the top of the dial to its foot instead of
  sitting in the middle of it. The sizes are four and every row is one of
  them: the time; the next prayer and its countdown, one size (the
  countdown's Roboto figures as tall as the prayer line's own); the date,
  the weather, the steps and the battery, one size below that; and am/pm,
  the seconds and the day's high and low, the smallest. A row grows only
  with its rank, and nothing is as large as the time. After days without the phone the weather's row says the
  times may be out of date. Temperatures are in °F where the app's place
  reads Fahrenheit and °C elsewhere; the weather is the watch's own, which
  Gadgetbridge fills from the phone's weather app (Breezy Weather, say);
- a **data field**: "Asr 1h 23m" in any activity screen, or a watch face's
  data-field slot, in the largest font the field's box takes — the name
  over the countdown in a box too narrow for one line;
- a **widget**: a glance with the next prayer and the countdown (the
  prayer and its time alone where the glance is too narrow), a page with
  today's five laid out as a table sized for the longest name and the
  widest time in the largest font whose rows all clear the round edge,
  and two **published complications** for Face It
  watch faces and any Connect IQ face that subscribes — "Next prayer"
  (Asr 16:42) and "Until prayer" in one unit ("5h", "49m", "37s").

Garmin's own built-in watch faces cannot take an app's complications
(they run no Connect IQ), so the countdown on a face is Mihrab's own face,
or a Face It / third-party face through the widget's complications. A
complication is refreshed by its publisher, and a background runs at most
every five minutes, so "Until prayer" is exact at each refresh and up to
five minutes behind between them; a live countdown is the face's and the
field's.

The watch counts down on its own; the phone sends the times, not the
countdown. Nothing goes to Garmin: no Garmin Connect, no account, no
Connect IQ store — the apps are side-loaded through Gadgetbridge.

## How the times get there

1. Mihrab builds its schedule (the same payload every widget draws from)
   and, if "Garmin watch" is on in Settings → Notifications, broadcasts to
   Gadgetbridge `nodomain.freeyourgadget.gadgetbridge.command.SEND_WATCH_APP_MESSAGE`
   with the watch's Bluetooth address, the watch app's UUID and the payload
   `{"v":2,"t":[…],"h12":0,"f":0,"a":…}` — six times a day, the five
   prayers and sunrise in the app's order, for three days as epoch
   seconds, today first, `0` for a time that does not occur (and for
   sunrise when the app is set not to show it); the
   app's clock (`h12`, Settings → Appearance), which the watch writes its
   times in; and whether the app's place reads Fahrenheit (`f`, worked
   out on the phone from the coordinates, `src/utils/temperatureUnit.ts`),
   for the face's weather; and the app's accent (`a`), which the face
   wears. Once for each of the three apps.
   `android/.../GarminWatch.kt`.
2. Gadgetbridge (2026.11 or later) encodes it the Garmin way, encrypts it
   and delivers it to the app on the watch over the Connect IQ channel.
   The limit is about 260 bytes per message, which is why it is numbers
   only.
3. On the watch a background service (`shared/source/MihrabService.mc`)
   receives it, keeps it in Storage, and wakes the app. From then on the
   face and the field read Storage; after three days without a message
   the face says the times may be out of date.

After the times, to the same apps, goes a second message with everything
else the watch is told — `{"v":2,"x":1,"o":…,"hj":[…],"n":[…]}`
(`GarminWatch.extras`; the comment at the head of `shared/source/Mihrab.mc`
has each part):

- `o`, what to show, from Settings → Devices → Garmin watch: the face's
  date row (the calendar's date, the Hijri date, or both), its steps,
  weather and seconds, and a bar from the last prayer to the next in the
  data field. 0 — and a watch never told — is everything as it was.
- `hj`, the Hijri date of each day the times cover, which the face writes
  in the watch's language when asked to.
- `n`, the night marks the app has turned on (Islamic midnight, the last
  third, the first third), which the widget lists on a second page (up,
  down or a swipe; two dots at the left edge while there is one).

It is a message of its own because the first is near Gadgetbridge's limit,
and because a watch app from before it reads the first exactly as it did
and drops the second — where a new shape for the first would have left it
with no times.

The phone sends again whenever its schedule is rebuilt (daily, on a
change of place or method), and from Settings ("Send now"). The same
message is not repeated within six hours.

## Installing from the phone

An Android build made on a machine where `garmin/build.sh` has run carries
the three watch apps (`android/app/build.gradle`, `copyGarminFace`: whatever
`garmin/build/mihrab-face.prg`, `mihrab-widget.prg` and `mihrab-field.prg`
are at build time), and Settings has an install for each it carries. Settings → Devices →
Garmin watch → **Install or reinstall watch face** (beside Find the watch) sends the times
again, then hands that face to Gadgetbridge's installer
(`GarminWatch.installFace`), which asks before installing. A build without
it — F-Droid's, CI's — does not show the button. Build the face before the APK.

## Setting it up

On the phone:

- Gadgetbridge 2026.11 or later, the watch paired and connected in it.
- In Gadgetbridge, open the watch → its settings → Developer settings →
  Intent API → **Allow messages to watch apps**.
- Install the apps on the watch: Gadgetbridge → the watch → App manager →
  install the `.prg` files (`garmin/build/mihrab-face.prg`,
  `mihrab-field.prg`, `mihrab-widget.prg`), or open a `.prg` with
  Gadgetbridge. Any one of them is enough for what it does.
- In Mihrab: Settings → Devices → Garmin watch: on, then "Find the
  watch" (the phone's paired devices, with the Bluetooth permission; one
  Garmin watch is taken as it is) — or type the address Gadgetbridge shows
  under the watch's name. "Send now" says what happened.

On the watch: choose the Mihrab face; add the Mihrab data field to an
activity's data screen; add the widget's glance to the glance list; and in
a Face It face, pick "Mihrab · Next prayer" or "Until prayer" for a slot.

## Building

Needs the Connect IQ SDK (`~/garmin-sdk/sdk`, or `CIQ_SDK`), the device
files for the watch downloaded with Garmin's SDK manager (the command-line
one works: `connect-iq-sdk-manager device download --device enduro3
--include-fonts`), and a developer key (`~/garmin-sdk/key/developer_key`,
or `CIQ_KEY`; `openssl genrsa 4096 | openssl pkcs8 -topk8 -outform DER
-nocrypt`).

```sh
garmin/build.sh            # the three .prg files into garmin/build/
garmin/build.sh test       # the shared tests, in the simulator
garmin/build.sh run watchface      # or datafield, widget
garmin/build.sh release    # .iq packages, for the Connect IQ store
```

The three UUIDs in the manifests are what the phone addresses; they never
change (`GarminWatch.FACE_APP_ID`, `FIELD_APP_ID`, `WIDGET_APP_ID`). The apps are built for
the Enduro 3; adding a device is a `<iq:product>` line in each manifest
and a look at the face on that screen.

## Layout

```
shared/source/Mihrab.mc         the store, the next prayer, the words
shared/source/MihrabHijri.mc    the Hijri months and night marks, by name
shared/source/MihrabService.mc  the background service: receives the message
shared/source/MihrabTests.mc    tests (compiled in with -t only)
watchface/                      the face (manifest, resources, view)
datafield/                      the field
widget/                         the widget, glance and complications
```

Strings are in `resources/strings` (English) and `resources-<lang>` for
Swedish, German, French, Spanish, Indonesian, Turkish and Russian; the
prayer names are a table in `Mihrab.mc` (a string resource lives in one
scope, and the names are needed in the background, the glance and the
page), with Arabic too. Bengali, Hindi and Urdu are not there yet: the
watch's fonts have to be checked for them first.
