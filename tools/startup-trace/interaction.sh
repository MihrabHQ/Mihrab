#!/bin/sh
# A Hermes sampling profile of something done in the RUNNING app — opening
# the muṣḥaf, a tap on an ayah — where profile.sh takes one of a cold start.
#
#   tools/startup-trace/interaction.sh <out-prefix> <serial> <ms> '<commands>'
#   → <out>.cpuprofile, <out>.logcat
#
# <commands> run on this machine while the phone samples, e.g.
#   'sleep 0.6; adb -s SERIAL shell input tap 540 1200'
#
# MainActivity.onNewIntent starts the sampler for <ms> when the activity is
# started again with `--ez mihrab.profile true --ei mihrab.profileMs <ms>`,
# and dumps it to logcat as profile.sh's does. Name the frames with
# profile-annotate.js and the bundle's source map, as there.
#
# 100 Hz: one sample is 10 ms. Read a tap as "which functions hold the
# thread", not to the millisecond; repeat it before believing a small one.
OUT=$1; S=$2; MS=$3; DO=$4
ADB="adb -s $S"
$ADB logcat -c
$ADB shell am start -n com.prayer_times/.MainActivity --ez mihrab.profile true --ei mihrab.profileMs "$MS" > /dev/null
sleep 0.4
sh -c "$DO"
sleep $(( MS / 1000 + 3 ))
$ADB logcat -d > "$OUT.logcat"
grep -E "MihrabProfile: enabled|MihrabProfile: DONE" "$OUT.logcat" | sed 's/^.*MihrabProfile: //'
grep "MihrabProfile: \[" "$OUT.logcat" | sed 's/^.*MihrabProfile: \[[0-9]*\] //' | tr -d '\n' | base64 -d | gunzip > "$OUT.cpuprofile"
ls -la "$OUT.cpuprofile"
