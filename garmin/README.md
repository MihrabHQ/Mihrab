# Mihrab on a Garmin watch

Three Connect IQ apps, fed by the Android app through
[Gadgetbridge](https://gadgetbridge.org):

- a **watch face**, drawn for a MIP screen (solid ink on black in the
  screen's own 64 colours, nothing dithered, nothing animating but what
  must) and wearing the app's accent, which the phone sends (each preset
  matched by eye to a colour the screen shows; a custom colour snapped to
  the nearest): a ring round the edge filling, in the accent, from the
  last prayer to the next, with a white bead where it has got to; the date, and under it today's steps as six
  figures, "004532" — the figures the count uses white, the unused
  leading zeros grey; the time as large as the dial allows, in the app's
  own Roboto at whichever of a ladder of sizes fits (40 to 76 pixels
  tall, one bit deep so the screen has nothing to dither;
  garmin/tools/clockfont.py), with the weather to its left — an icon
  drawn for the condition (sun or moon, partly cloudy, cloud, rain, snow,
  sleet, storm, fog, wind) and the temperature now, today's high and low
  under them — or, where that would make the clock smaller, on the steps'
  row before the footprint; and the seconds small and grey to its right, the colon and a rule under the figures in
  the accent; the next prayer, its name in the accent and its time in
  white, and the countdown to it in full, "05:49:12", ticking by the
  second, its colons in the accent;
  and at the foot, only after days without the phone, a word about that.
  Temperatures are in °F where the app's place reads Fahrenheit (the
  United States, Liberia and a few more) and °C elsewhere. The seconds
  and the countdown are redrawn every second inside their own clips
  (a partial update); everything else once a minute. The face is laid
  out, not placed: it picks each row's font and stacks the rows so that
  every row's ink — measured for the widest thing that row can show (any
  minute, any prayer's name in the watch's language, "88h 88m", six-figure
  steps; the weather and date as they are) — lies inside the round dial,
  giving the clock the largest font first, then the prayer and its
  countdown, then the rest. Messages wrap onto a second line rather than
  run off the edge. The weather is the
  watch's own, which Gadgetbridge fills from the phone's weather app
  (Breezy Weather, say);
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
   wears. Once for each of the three apps. `android/.../GarminWatch.kt`.
2. Gadgetbridge (2026.11 or later) encodes it the Garmin way, encrypts it
   and delivers it to the app on the watch over the Connect IQ channel.
   The limit is about 260 bytes per message, which is why it is numbers
   only.
3. On the watch a background service (`shared/source/MihrabService.mc`)
   receives it, keeps it in Storage, and wakes the app. From then on the
   face and the field read Storage; after three days without a message
   the face says the times may be out of date.

The phone sends again whenever its schedule is rebuilt (daily, on a
change of place or method), and from Settings ("Send now"). The same
message is not repeated within six hours.

## Setting it up

On the phone:

- Gadgetbridge 2026.11 or later, the watch paired and connected in it.
- In Gadgetbridge, open the watch → its settings → Developer settings →
  Intent API → **Allow messages to watch apps**.
- Install the apps on the watch: Gadgetbridge → the watch → App manager →
  install the `.prg` files (`garmin/build/mihrab-face.prg`,
  `mihrab-field.prg`, `mihrab-widget.prg`), or open a `.prg` with
  Gadgetbridge. Any one of them is enough for what it does.
- In Mihrab: Settings → Notifications → Garmin watch: on, then "Find the
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
