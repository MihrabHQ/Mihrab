# Mihrab on a Garmin watch

Three Connect IQ apps, fed by the Android app through
[Gadgetbridge](https://gadgetbridge.org):

- a **watch face**: the time, the date, the next prayer with its time and
  the countdown as the phone's Minimal page writes it — "5h 49m" with the
  unit letters small, "49m", and inside the last five minutes "4m 37s",
  ticking every second (a partial update of the countdown alone);
- a **data field**: "Asr 1h 23m" in any activity screen, or a watch face's
  data-field slot;
- a **widget**: a glance with the next prayer and the countdown, a page
  with today's five, and two **published complications** for Face It
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
   `{"v":1,"t":[…]}` — the five prayers for four days as epoch seconds,
   today first; `0` for a time that does not occur. Once for each of the
   three apps. `android/.../GarminWatch.kt`.
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
