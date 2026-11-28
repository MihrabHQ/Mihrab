#!/bin/sh
# The F-Droid build, built here the way F-Droid builds it — before a push,
# not after.
#
#   sh scripts/fdroid-check.sh                       always
#   sh scripts/fdroid-check.sh --if-android-changed  only when something that
#                                                    can break it has changed
#
# F-Droid's recipe (contrib/fdroid/com.prayer_times.yml, prebuild) lowers the
# SDK the app is compiled against before it builds. A change that compiles at
# the project's own SDK can fail there, and nothing on this machine said so:
# a call to a newer API did (2.38.1, #131), and a library whose metadata
# refuses the lower SDK did (androidx.pdf, 2026-11-28 — three pushes went out
# on a red F-Droid job before it was read). CI's Android job builds this way
# too; this is the same build, a push earlier.
#
# What it does: takes the recipe's own `sed` lines (so the two cannot drift),
# applies them to android/build.gradle, assembles the F-Droid RELEASE APK for
# arm64 — the flavour, build type and ABI the recipe builds — and puts
# android/build.gradle back whatever happened.
#
# `npm run preflight` runs it with --if-android-changed. Under CI it does
# nothing: the Android job there is this build.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECIPE="$ROOT/contrib/fdroid/com.prayer_times.yml"
GRADLE="$ROOT/android/build.gradle"

if [ "${CI:-}" != "" ]; then
  echo "fdroid-check: under CI, where the Android job is this build — skipped"
  exit 0
fi

if [ "${1:-}" = "--if-android-changed" ]; then
  # Against what is on the remote: what a push would send, and what is not committed yet.
  BASE="$(git -C "$ROOT" rev-parse --verify -q origin/main || true)"
  CHANGED="$( { [ -n "$BASE" ] && git -C "$ROOT" diff --name-only "$BASE" HEAD; git -C "$ROOT" diff --name-only HEAD; git -C "$ROOT" ls-files --others --exclude-standard; } 2>/dev/null | sort -u)"
  if ! printf '%s\n' "$CHANGED" | grep -Eq '^(android/|contrib/fdroid/|package\.json$|package-lock\.json$)'; then
    echo "fdroid-check: nothing under android/, contrib/fdroid/ or the packages has changed — skipped"
    exit 0
  fi
fi

if [ -z "${JAVA_HOME:-}" ] && [ -d /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ]; then
  export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
fi

# The recipe's own lines, as CI takes them: `- sed -i 's/…/…/' ../build.gradle`.
EXPRS="$(grep -E "^[[:space:]]+- sed -i 's/(SdkVersion|\"37)" "$RECIPE" | sed -E "s/^[[:space:]]+- sed -i '([^']+)'.*/\1/")"
if [ -z "$EXPRS" ]; then
  echo "fdroid-check: the recipe lowers nothing any more — building at the project's own SDK"
fi

KEPT="$(mktemp)"
cp "$GRADLE" "$KEPT"
restore() { cp "$KEPT" "$GRADLE"; rm -f "$KEPT"; }
trap restore EXIT INT TERM

printf '%s\n' "$EXPRS" | while IFS= read -r expr; do
  [ -n "$expr" ] || continue
  # -i with a suffix is the one spelling both seds take.
  sed -i.fdroid -e "$expr" "$GRADLE"
  rm -f "$GRADLE.fdroid"
done
echo "fdroid-check: compiling as F-Droid does —$(grep -E 'compileSdkVersion = |buildToolsVersion = ' "$GRADLE" | tr -s ' ' | tr '\n' ';')"

LOG="$(mktemp)"
if (cd "$ROOT/android" && NODE_ENV= ./gradlew assembleFdroidRelease -PreactNativeArchitectures=arm64-v8a >"$LOG" 2>&1); then
  echo "fdroid-check: ✓ the F-Droid release APK builds at F-Droid's SDK"
  rm -f "$LOG"
else
  echo "fdroid-check: ✗ the F-Droid build FAILS at F-Droid's SDK. Do not push." >&2
  grep -E "What went wrong|error:|^e: |FAILED|requires libraries and applications" -A6 "$LOG" | head -60 >&2
  echo "fdroid-check: the whole log is $LOG" >&2
  exit 1
fi
