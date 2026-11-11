# The Android Baseline Profile

`android/app/src/main/baseline-prof.txt` lists the classes and methods the app runs when it
starts, opens each tab, turns a page of the reader, opens the settings pages and switches
layout. The build packs it into the APK (`assets/dexopt/baseline.prof`), and Android compiles
those ahead of time when the app is installed, instead of interpreting them until the phone
has watched the app long enough to work it out for itself. It matters most on the first
launches after an install or an update, and on phones slower than the ones we test on.

It does nothing on a phone that compiles everything anyway. The Pixel 10 Pro on Android 17
runs with `dalvik.vm.usejit=false` and installs every app fully compiled (`status=speed`):
there is nothing for a profile to add there, and such a phone cannot record one either.

## Recording it again

Worth doing when the start-up path changes a great deal (a React Native upgrade, a new
navigator), not for every release: a profile that is a little stale still covers most of it,
and rules for code that no longer exists are ignored.

1. A device that records: an emulator (`Mihrab_Shots_37`), or a phone where
   `adb shell getprop dalvik.vm.usejit` is `true`. Mihrab onboarded on it, in English.
2. Build the release with R8 off, so the device names things as the source does, and install
   it over the app (same signing key):

       cd android && ./gradlew assembleGithubRelease -PprofileBuild -q
       export ANDROID_SERIAL=emulator-5554
       adb install -r app/build/outputs/apk/github/release/app-github-release.apk

3. Start from nothing, walk the app, and take what the device recorded:

       adb shell am force-stop com.prayer_times
       adb shell cmd package compile -m verify -f com.prayer_times
       adb shell pm art clear-app-profiles com.prayer_times
       tools/baseline-profile/journey.sh          # about five minutes; ends "JOURNEY DONE"
       adb shell am broadcast -a androidx.profileinstaller.action.SAVE_PROFILE \
           com.prayer_times/androidx.profileinstaller.ProfileInstallReceiver
       adb shell pm dump-profiles --dump-classes-and-methods com.prayer_times
       adb pull /data/misc/profman/com.prayer_times-primary.prof.txt /tmp/prof.txt

   An empty file means the device does not record (step 1).
4. Keep the class and method lines (array classes, `[L…`, are not rules), sorted without
   their flags so the next recording diffs against this one, as
   `android/app/src/main/baseline-prof.txt`.
5. Build the release as usual and check the APK carries it:
   `unzip -l …/app-github-release.apk | grep dexopt` — `baseline.prof` was 4 KB with only the
   libraries' own rules.

`journey.sh` checks before every touch that Mihrab is in front, and taps nothing that
changes what is saved.
