#!/usr/bin/env bash
# The Connect IQ apps: build, test, or run in the simulator.
#
#   garmin/build.sh                 # both .prg into garmin/build/, for enduro3
#   garmin/build.sh test            # the shared tests, in the simulator
#   garmin/build.sh run watchface   # start the simulator with the face
#   garmin/build.sh run datafield | widget
#   garmin/build.sh release         # .iq packages for the Connect IQ store
#
# Needs the SDK (CIQ_SDK, default ~/garmin-sdk/sdk) with the device files
# downloaded by the SDK manager, and a developer key (CIQ_KEY, default
# ~/garmin-sdk/key/developer_key). DEVICE defaults to enduro3.
set -euo pipefail
cd "$(dirname "$0")"
SDK="${CIQ_SDK:-$HOME/garmin-sdk/sdk}"
KEY="${CIQ_KEY:-$HOME/garmin-sdk/key/developer_key}"
DEVICE="${DEVICE:-enduro3}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home 2>/dev/null || true)}"
mkdir -p build

compile() { # app, output, extra flags...
  local app="$1" out="$2"; shift 2
  "$SDK/bin/monkeyc" -f "$app/monkey.jungle" -d "$DEVICE" -o "$out" -y "$KEY" -w -l 3 "$@"
}

case "${1:-build}" in
  build)
    compile watchface build/mihrab-face.prg
    compile datafield build/mihrab-field.prg
    compile widget build/mihrab-widget.prg
    ls -l build/*.prg
    ;;
  release)
    compile watchface build/mihrab-face.iq -e -r
    compile datafield build/mihrab-field.iq -e -r
    compile widget build/mihrab-widget.iq -e -r
    ls -l build/*.iq
    ;;
  test)
    compile watchface build/mihrab-face-test.prg -t
    "$SDK/bin/connectiq" >/dev/null 2>&1 &
    sleep 4
    "$SDK/bin/monkeydo" build/mihrab-face-test.prg "$DEVICE" -t
    ;;
  run)
    app="${2:-watchface}"
    case "$app" in watchface) out=build/mihrab-face.prg;; datafield) out=build/mihrab-field.prg;; widget) out=build/mihrab-widget.prg;; *) echo "watchface, datafield or widget" >&2; exit 2;; esac
    compile "$app" "$out"
    "$SDK/bin/connectiq" >/dev/null 2>&1 &
    sleep 4
    "$SDK/bin/monkeydo" "$out" "$DEVICE"
    ;;
  *) echo "usage: $0 [build|test|run watchface|run datafield|release]" >&2; exit 2;;
esac
