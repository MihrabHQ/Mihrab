#!/bin/sh
# A Hermes sampling profile of one cold start on a phone, with the boot marks.
#
#   tools/startup-trace/profile.sh [out-prefix] [serial]
#   → <out>.cpuprofile (Chrome trace-event JSON), <out>.txt (the [boot] lines
#     and the profiler's start time), <out>.logcat
#
# MainActivity enables the profiler when the activity is started with
# `--ez mihrab.profile true` and dumps it, gzip + base64, to logcat 2.5 s
# later (MainActivity.kt, "PROFILE"). The sampler runs at 100 Hz, so one
# launch is too coarse to read: take ten or more and aggregate them —
#
#   for i in $(seq 1 12); do tools/startup-trace/profile.sh out/run$i; done
#   for f in out/run*.cpuprofile; do node tools/startup-trace/profile-annotate.js \
#     $f android/app/build/generated/sourcemaps/react/githubRelease/index.android.bundle.map; done
#   python3 tools/startup-trace/profile-aggregate.py out commit raf
#
# profile-annotate.js names every frame from the bundle's source map;
# profile-aggregate.py counts the samples between two boot marks across the
# runs, by leaf function and by the first frame in src/.
OUT=${1:-/tmp/launch}
S=${2:-5A250DLCH00166}
adb -s "$S" shell am force-stop com.prayer_times; sleep 3
adb -s "$S" shell am force-stop com.prayer_times; sleep 1
adb -s "$S" logcat -c
adb -s "$S" shell am start -W -n com.prayer_times/.MainActivity --ez mihrab.profile true > /dev/null
sleep 7
adb -s "$S" logcat -d > "$OUT.logcat"
grep -E "\[boot\]|\[boot-native\]|MihrabProfile: enabled|MihrabProfile: DONE" "$OUT.logcat" | sed 's/^.*ReactNativeJS: //; s/^.*MihrabProfile: //' | tee "$OUT.txt"
grep "MihrabProfile: \[" "$OUT.logcat" | sed 's/^.*MihrabProfile: \[[0-9]*\] //' | tr -d '\n' | base64 -d | gunzip > "$OUT.cpuprofile"
ls -la "$OUT.cpuprofile"
