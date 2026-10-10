#!/usr/bin/env bash
# Measure Mihrab's cold start on a connected Android phone.
#
#   tools/startup-trace/run.sh            # build, install, 8 cold starts
#   tools/startup-trace/run.sh --trace    # …with the per-module trace
#   tools/startup-trace/run.sh --no-build # measure what is installed
#   RUNS=12 tools/startup-trace/run.sh
#
# Each run force-stops the app, clears logcat, launches MainActivity and
# reads back the `[boot]` line (src/boot/bootTimeline.ts) plus the system's
# own "Displayed" time. --trace also records how long every module took to
# initialise before the first paint; analyse.py turns that into a table.
# Output: tools/startup-trace/out/ (git-ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/tools/startup-trace/out"
PKG="com.prayer_times"
RUNS="${RUNS:-8}"
TRACE=0
BUILD=1
for a in "$@"; do
  case "$a" in
    --trace) TRACE=1 ;;
    --no-build) BUILD=0 ;;
  esac
done
mkdir -p "$OUT"
# Hassan's shell exports NODE_ENV=production, which breaks the bundler.
unset NODE_ENV

[ "$TRACE" = 1 ] && : > "$OUT/trace.txt"
if [ "$BUILD" = 1 ]; then
  if [ "$TRACE" = 1 ]; then
    : > "$OUT/modules.tsv"
    export MIHRAB_TRACE_MAP="$OUT/modules.tsv"
    node "$ROOT/tools/startup-trace/patch-require.js" apply
    trap 'node "$ROOT/tools/startup-trace/patch-require.js" restore' EXIT
  fi
  # --rerun on the bundle task: its inputs do not include node_modules, so
  # a patched (or freshly restored) loader would otherwise be skipped.
  (cd "$ROOT/android" && ./gradlew -q :app:createBundleGithubReleaseJsAndAssets --rerun :app:installGithubRelease)
fi

ACT="$(adb shell cmd package resolve-activity --brief "$PKG" | tail -1 | tr -d '\r')"
: > "$OUT/boot.log"
for i in $(seq 1 "$RUNS"); do
  adb shell am force-stop "$PKG"
  sleep 1.5
  adb logcat -c
  adb shell am start -W -n "$ACT" > "$OUT/am.txt"
  sleep 5
  total="$(grep -E '^TotalTime' "$OUT/am.txt" | awk '{print $2}')"
  boot="$(adb logcat -d -s ReactNativeJS:I | grep -o '\[boot\].*' | head -1 || true)"
  # When the system started the activity, on the phone's wall clock, so
  # the time before the bundle ran (process, native init, bundle load)
  # can be read off against js0.
  launch="$(adb logcat -d -v epoch -s ActivityTaskManager:I | grep -m1 "START u0.*$PKG" | awk '{printf "%d", $1*1000}' || true)"
  js0="$(echo "$boot" | sed -n 's/.*js0=\([0-9]*\).*/\1/p')"
  prejs=""
  if [ -n "$launch" ] && [ -n "$js0" ]; then prejs=$((js0 - launch)); fi
  native="$(adb logcat -d -s MihrabBoot:I | grep -o '\[boot-native\].*' | head -1 || true)"
  proc0="$(echo "$native" | sed -n 's/.*proc0=\([0-9]*\).*/\1/p')"
  procjs=""
  if [ -n "$proc0" ] && [ -n "$js0" ]; then procjs=$((js0 - proc0)); fi
  echo "run=$i displayed=$total prejs=$prejs procjs=$procjs ${native#\[boot-native\] } $boot" | tee -a "$OUT/boot.log"
  if [ "$TRACE" = 1 ] && [ ! -s "$OUT/trace.txt" ]; then
    adb logcat -d -s ReactNativeJS:I | grep -o '\[trace .*' > "$OUT/trace.txt" || true
  fi
done
adb shell input keyevent KEYCODE_HOME
echo "results: $OUT/boot.log"
