#!/usr/bin/env bash
# What the user sees: screen-record cold starts and time them from the
# frames themselves.
#
#   tools/startup-trace/video.sh          # 6 cold starts of what is installed
#   RUNS=10 tools/startup-trace/video.sh
#   NOSNAP=1 tools/startup-trace/video.sh   # without the kept launch screen
#   GAP=40 RUNS=1 tools/startup-trace/video.sh # away 40 s between runs
#
# For each run: force-stop, start a screen recording, launch, and let
# video.py find (a) the first frame that differs from the launcher — the
# tap's launch animation starting — and (b) the first frame from which the
# screen stays the way it ends up: the content. The difference is the
# number a person waits. Phone must be unlocked, on the launcher.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/tools/startup-trace/out/video"
PKG="com.prayer_times"
RUNS="${RUNS:-6}"
mkdir -p "$OUT"
ACT="$(adb shell cmd package resolve-activity --brief "$PKG" | tail -1 | tr -d '\r')"
: > "$OUT/results.txt"
# Leave the app from a settled Today screen first, the way a person does:
# that is when the launch snapshot (LaunchSnapshot.kt) is taken.
adb shell am start -n "$ACT" > /dev/null
sleep 5
for i in $(seq 1 "$RUNS"); do
  adb shell input keyevent KEYCODE_HOME
  sleep 1.5
  # stop-app (Android 14+) ends the process the way swiping it away does,
  # leaving its notifications; force-stop also clears those, and the launch
  # that follows re-posts the ongoing one as a heads-up over the screen.
  adb shell am stop-app "$PKG" 2>/dev/null || adb shell am force-stop "$PKG"
  # GAP=seconds: time away, so the hero has something to run through.
  sleep "${GAP:-1}"
  adb shell rm -f /sdcard/mihrab-cs.mp4
  adb shell screenrecord --time-limit 4 --bit-rate 16000000 /sdcard/mihrab-cs.mp4 &
  rec=$!
  sleep 1
  # NOSNAP=1: an extra on the intent makes it "not a plain launch", so the
  # same build starts without the kept screen — the before, to compare.
  if [ -n "${NOSNAP:-}" ]; then
    adb shell am start -n "$ACT" --es mihrab.nosnap 1 > /dev/null
  else
    adb shell am start -n "$ACT" > /dev/null
  fi
  wait "$rec" || true
  sleep 0.5
  adb pull -q /sdcard/mihrab-cs.mp4 "$OUT/run$i.mp4"
  r="$(python3 "$ROOT/tools/startup-trace/video.py" "$OUT/run$i.mp4")"
  echo "run=$i $r" | tee -a "$OUT/results.txt"
done
adb shell input keyevent KEYCODE_HOME
python3 - "$OUT/results.txt" <<'EOF'
import re, statistics, sys
rows = [dict(re.findall(r'(\w+)=(\d+)', l)) for l in open(sys.argv[1])]
for k in ('visible', 'content'):
    v = [int(r[k]) for r in rows if k in r]
    if v:
        print(f'{k}: median {statistics.median(v):.0f} ms  (min {min(v)}, max {max(v)})')
EOF
