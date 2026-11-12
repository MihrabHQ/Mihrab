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
| Apps are compiled in full when installed; the runtime's JIT and profiles are off | 2.9 s for the GitHub build on a Pixel 10 Pro (`cmd package compile -m speed -f`). The Baseline Profile the APK carries does nothing there, and is not needed. |
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

On the Pixel the app holds 520–650 MB (PSS) in front and 430–460 MB in the
background after every screen has been visited; the same build on a stock
emulator holds about 200 MB. Part of the difference is GrapheneOS's own:
`hardened_malloc` keeps freed memory in quarantine and guards each slab
(the process has some 32,000 mappings, 27,000 of them tagged), and a
process started without the zygote shares none of the framework's memory
with other apps. How much of it is that, and how much the app could give
back, has not been separated.

## Not done, and why

- **R8 in the F-Droid build.** F-Droid's build is the only one without it
  (it ran out of memory with lint beside it; lint is now off for that
  flavor, R8 alone has not been tried on their builder). What it would
  save on a phone is install-time compilation of a dex about twice the
  size — a few seconds on a Pixel 10 Pro, per update.
- **A 64-bit-only APK on GitHub.** The GitHub APK carries `arm64-v8a` and
  `armeabi-v7a` (61 MB, 12 MB of it the 32-bit libraries). The libraries
  are stored uncompressed and used from inside the APK, so the 32-bit ones
  cost a download and disk, not install time. A second asset changes which
  file Obtainium picks for people who already follow the releases, so it
  is a decision for a release, not a build flag. F-Droid's build is
  already 64-bit only.

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
