#!/usr/bin/env bash
# The Microsoft Store packages of a release, ready to upload by hand, the
# way the Play bundle is: waits for the tag's Desktop run, then downloads
# its mihrab-microsoft-store artifact (the x64 and arm64 .appx) into
# ~/Downloads/mihrab-store-<version>.
#
#   ./scripts/fetch-store-packages.sh 2.36.0
#   ./scripts/fetch-store-packages.sh 2.36.0 --background   # what release.sh does
#
# Beside them go whats-new-{en,sv,ar}.txt, the release's notes fitted to the
# Store's "What's new in this version" (Android and iPhone lines left out).
#
# The background form returns at once and logs to
# ~/Downloads/mihrab-store-<version>/fetch.log; the Mac says when the
# packages are there.
set -uo pipefail

REPO=MihrabHQ/Mihrab
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: $0 X.Y.Z [--background]" >&2; exit 2; }
TAG="v$VERSION"
DEST="$HOME/Downloads/mihrab-store-$VERSION"
mkdir -p "$DEST"

if [ "${2:-}" = "--background" ]; then
  nohup "$0" "$VERSION" >"$DEST/fetch.log" 2>&1 </dev/null &
  echo "  Microsoft Store packages → $DEST (when the tag's Desktop run is green; log: $DEST/fetch.log)"
  exit 0
fi

say() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
tell() { command -v osascript >/dev/null && osascript -e "display notification \"$1\" with title \"Mihrab $VERSION\"" >/dev/null 2>&1; true; }

# What's new, from the tag's version code and notes.
notes() {
  local code
  code="$(git -C "$ROOT" show "$TAG:android/app/build.gradle" 2>/dev/null | sed -n 's/^ *versionCode \([0-9]*\).*/\1/p' | head -1)"
  [ -n "$code" ] || { say "no versionCode at $TAG — no What's new files"; return; }
  node "$ROOT/scripts/ms-store-submit.js" --notes-out "$DEST" --code "$code" --root "$ROOT" >/dev/null && say "What's new: $DEST/whats-new-{en,sv,ar}.txt"
}

if ls "$DEST"/*.appx >/dev/null 2>&1; then notes; say "already here:"; ls -1 "$DEST"/*.appx; exit 0; fi

# The tag's run appears a moment after the push: wait up to 15 minutes.
run=""
for _ in $(seq 1 30); do
  run="$(gh run list -R "$REPO" --workflow desktop.yml --branch "$TAG" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)"
  [ -n "$run" ] && break
  sleep 30
done
[ -n "$run" ] || { say "no Desktop run for $TAG"; tell "No Desktop run for $TAG"; exit 1; }
say "Desktop run $run for $TAG"

gh run watch -R "$REPO" "$run" --interval 60 --exit-status >/dev/null 2>&1
conclusion="$(gh run view -R "$REPO" "$run" --json conclusion --jq .conclusion 2>/dev/null)"
if [ "$conclusion" != "success" ]; then
  say "the Desktop run ended $conclusion — https://github.com/$REPO/actions/runs/$run"
  tell "Desktop run $conclusion — no Store packages"
  exit 1
fi

if ! gh run download -R "$REPO" "$run" -n mihrab-microsoft-store -D "$DEST"; then
  say "download failed"; tell "Store package download failed"; exit 1
fi
ls "$DEST"/*.appx >/dev/null 2>&1 || { say "the artifact held no .appx"; exit 1; }
notes
say "ready to upload in Partner Center:"
ls -l "$DEST"/*.appx
tell "Microsoft Store packages are in Downloads/mihrab-store-$VERSION"
exit 0
