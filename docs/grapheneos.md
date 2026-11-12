# Mihrab on GrapheneOS

What GrapheneOS does differently from stock Android, what was checked, and
what the app does about each. Checked on a Pixel 10 Pro running GrapheneOS
2026110801 with the GitHub release build, and — for the location stack — on
an AOSP Android 12 emulator with no Google apps, which has what a GrapheneOS
phone has by default: `gps`, `fused` and `passive` providers and no
`network` one.

Mihrab is independent of GrapheneOS and is not endorsed by it.

## In short

| GrapheneOS | Mihrab |
|---|---|
| No Google Play services unless the owner installs the sandboxed ones | Never used. No flavor has any Google Play services, Firebase or Play Core class in it; the release script counts them in the APK and stops on one. Prayer alerts are local alarms: nothing is pushed. |
| Apps are compiled in full when installed; the runtime's JIT and profiles are off | 2.8 s on a Pixel 10 Pro (`cmd package compile -m speed -f`). F-Droid's build was made without R8 until the release after 2.37.0 and took 4.7 s (dex 32.8 MB against 10.5 MB); it is built with R8 now — on this Mac that build takes 149 s instead of 96 s and its largest Java process 2.9 GB instead of 2.4 GB, and `-PfdroidNoR8` builds it the old way should F-Droid's builder object. The Baseline Profile the APK carries does nothing on GrapheneOS, and is not needed. |
| Hardened allocator (`hardened_malloc`) | Runs under it; see *Memory* below for what it costs. |
| Hardware memory tagging (MTE), Pixel 8 and later | The manifest asks for it (`android:memtagMode="async"`). A walk of every screen, the reader, the compass and the widgets' settings in the synchronous mode — a build made with `-PmemtagMode=sync`, which faults at the bad access itself — found nothing. |
| Dynamic code loading can be blocked, from memory and from storage | The app loads no code that is not in the APK: no class loader for files or memory in the dex, native libraries used from inside the APK (`extractNativeLibs=false`), no library with a writable-and-executable segment, and Hermes runs bytecode without a JIT. `scripts/check-apk-hardening.py` reads this off the APK at every release. |
| **Sensors** permission, per app | The Qibla compass says that Sensors is off for Mihrab, at once, with a button to the app's settings; the bearing in degrees is still shown (it is trigonometry, not a sensor). |
| **Network** permission, per app | Everything but downloads, sync and the optional online sources works: prayer times are computed on the phone. The app sees an outage, as GrapheneOS intends, and says there is no connection. |
| No network location unless the owner opts in | A place is found from the satellites. "Approximate" is enough and is not questioned (see *Location*). A place can always be searched for or typed instead. |
| Apps start as fresh processes (no zygote) | About 0.5 s from tap to first frame on a Pixel 10 Pro, of which ~170 ms is the runtime being created before any of the app's code runs. |

## Sensors

GrapheneOS keeps the switch as a runtime permission,
`android.permission.OTHER_SENSORS`, which it adds to every app and grants
unless the owner (or their default for new apps) says otherwise. With it
off an app's listeners register, no event ever comes, and values read as
zero; the system may also notify the owner that the app tried.

The compass used to wait ten seconds and then said the phone had no
usable magnetometer. Now `CompassModule.sensorsAccess()` asks the platform
for that permission by name — and only believes the answer where the
platform defines it, since an unknown permission also reads as "not
granted" — before anything is started, and again on every return to the
app. Off, the screen says so and registers no listener.

## Location

Three things, all found on the Android 12 emulator without Google apps:

1. **"Approximate" was answered with "change to precise?".** The location
   library checked for the precise permission before each fix and, not
   finding it, asked for both again; Android shows that as a second sheet.
   The app now asks itself, once, and the library is told not to
   (`skipPermissionRequests` on Android). A permission already held is
   never asked for again.
2. **With "Approximate" and no network provider there was no location at
   all** ("No location provider available"): the library refused the
   satellites to an app holding only the coarse permission, which was the
   rule before Android 12.
3. **Asked of the satellites directly, such an app still got nothing** in
   useful time. A single fix for an "Approximate" reader on Android 12 and
   later is now asked of the platform's own `getCurrentLocation`, at high
   accuracy, from the platform's fused provider (AOSP's own — not
   Google's), else the network provider, else the satellites.

The patch is `patches/@react-native-community+geolocation+3.4.0.patch`,
the same one that removes Google Play services from the library.

A first fix from the satellites indoors can take longer than the app
waits (8 s and 20 s); it then says so and offers the search. Turning on
GrapheneOS's network location, where the owner wants it, makes this
immediate.

## Memory

Measured on the Pixel with the same walk — a cold start, every tab and
settings page, then the home screen for half a minute — once as GrapheneOS
runs it and once with the app's *Exploit protection compatibility mode* on
(Android's own allocator instead of `hardened_malloc`):

| | hardened | compatibility mode |
|---|---:|---:|
| after a cold start | 411 MB | 386 MB |
| after every screen | 536 MB | 506 MB |
| in the background | 400 MB | 350 MB |

So the hardened allocator costs 25–50 MB of it, and nothing about the app
needs the compatibility mode. Of what is the app's own after a cold start,
on a 1280 × 2856 screen at 120 Hz: about 115 MB is graphics (70 MB of it
the window's own five buffers, which are the system's), about 150 MB
native memory, 64 MB mapped code, 31 MB the Java heap. Two things in it
were found and are the app's doing:

- the widgets' practice graph, drawn sixteen times a card at every redraw
  (fixed: `GridCache`), and
- the Minimal layout, which keeps every tab mounted (about a thousand views
  more than the Full layout) and draws the day chart of the neighbouring
  days ahead of the swipe — about 17 MB on the emulator. Left as it is:
  that is what makes the tabs and the day swipe immediate.

## Not done, and why

- **A 64-bit-only APK on GitHub.** The GitHub APK carries `arm64-v8a` and
  `armeabi-v7a`: 61 MB, of which the 32-bit libraries are 11.6 MB. The
  libraries are stored uncompressed and used from inside the APK, so the
  32-bit ones cost a download and disk on a 64-bit phone and nothing else —
  not install time, not memory. A second APK beside the first would save
  that download and cost more than it saves: Obtainium installs in the
  background only when a release leaves it exactly one APK, and with two it
  stops and asks (its `canInstallSilently`; its filter by CPU architecture
  can leave one, where the reader has it on and the names carry the
  architecture). Making the one APK 64-bit only would save the 11.6 MB for
  everyone and leave 32-bit phones without a GitHub build. F-Droid's build
  is already 64-bit only.
- **Squeezing the dex further.** With R8 on, the GitHub build's dex holds
  about 7 MB of code. The keep rules in `proguard-rules.pro` that are
  wider than they need be — all of `kotlin.**` (0.9 MB) and all of
  `com.facebook.react.**` (1.2 MB) — could give back perhaps 1 MB of it,
  some 0.4 s of the 2.8 s compile, at the price of finding every class
  that native code or reflection reaches by name. Not worth a prayer alarm
  that does not ring.

## Checking it again

```sh
# the APK's promises (dynamic code, W^X, 16 KB pages, memory tagging)
scripts/check-apk-hardening.py android/app/build/outputs/apk/github/release/app-github-release.apk

# a build that faults at the first bad access under MTE
cd android && ./gradlew assembleGithubRelease -PreactNativeArchitectures=arm64-v8a -PmemtagMode=sync

# the switches, on a GrapheneOS phone over adb (they are permissions there)
adb shell pm revoke com.prayer_times android.permission.OTHER_SENSORS   # then open mihrab://qibla
adb shell pm grant  com.prayer_times android.permission.OTHER_SENSORS
adb shell pm revoke com.prayer_times android.permission.INTERNET
adb shell pm grant  com.prayer_times android.permission.INTERNET
```

The exploit-protection switches themselves (dynamic code loading, memory
tagging, the compatibility mode) are in Settings → Apps → Mihrab on the
phone and are the owner's to turn; with dynamic code loading blocked from
both memory and storage the app should run unchanged, and a notification
from the system naming Mihrab would mean the table above is wrong.
