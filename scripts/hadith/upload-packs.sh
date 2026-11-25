#!/usr/bin/env bash
# Publish the Hadith packs as assets of the `data-hadith-v1` release.
#
#   node scripts/hadith/build-packs.js        # → build/hadith/v1/
#   scripts/hadith/upload-packs.sh            # → github.com/MihrabHQ/Mihrab/releases/tag/data-hadith-v1
#   scripts/hadith/upload-packs.sh --dry-run  # what would be uploaded
#
# The app reads each pack as `<key with / as .>.json` (`hadithAssetName` in
# src/config/mirrors.ts): build/hadith/v1/henc/cat-1/sv.json is the asset
# henc.cat-1.sv.json.
#
# Re-runnable: an asset already on the release with the same SHA-256 is
# skipped, anything else is replaced (--clobber). Not by size: a pack
# fetched again with a new retrieval date is the same length and different.
#
# manifest.json goes up LAST, after every pack it describes, so the sizes an
# app reads never belong to packs that are not there yet. It also names each
# pack's SHA-256, and an app that holds another file under that name fetches
# ours again (src/hadith/packUpdates.ts): uploading a pack and then the
# manifest IS how a correction is sent to the devices that already have it.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/build/hadith/v1"
TAG="data-hadith-v1"
REPO="MihrabHQ/Mihrab"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

[ -f "$DIR/manifest.json" ] || { echo "no $DIR/manifest.json — run node scripts/hadith/build-packs.js first" >&2; exit 1; }

NOTES="Mihrab's copy of the Hadith packs the app downloads on request (Hadith tab, Settings → Downloads). Built by scripts/hadith/build-packs.js; the app falls back to the original sources when this release cannot be reached.

Sources and terms:
• HadeethEnc.com — Encyclopedia of Translated Prophetic Hadiths (https://hadeethenc.com): texts, translations, explanations, benefits, grades and topics, republished unmodified with credit. Packs henc.*.json and categories.*.json.
• Open-Hadith-Data (https://github.com/mhashim6/Open-Hadith-Data): the nine books in vowelled Arabic, matn column only. Licensed under the Open Database License 1.0 (https://opendatacommons.org/licenses/odbl/1-0/), contents under the Database Contents License 1.0; packs books.*.json are a derived database under the ODbL.
• fawazahmed0/hadith-api (https://github.com/fawazahmed0/hadith-api): the Arabic text and numbering of an-Nawawi's Forty only (public domain). Pack nawawi.ar.json.

Mihrab is independent and not affiliated with any of these projects."

STAGE=$(mktemp -d)
EXISTING=$(mktemp)
trap 'rm -rf "$STAGE" "$EXISTING"' EXIT

# Flatten: a/b/c.json → a.b.c.json. Copies, so the build tree stays as is.
(cd "$DIR" && find . -type f -name '*.json' ! -name manifest.json) | sed 's|^\./||' | while read -r rel; do
  cp "$DIR/$rel" "$STAGE/$(echo "$rel" | tr '/' '.')"
done
cp "$DIR/manifest.json" "$STAGE/manifest.json"
printf '%s\n' "$NOTES" > "$STAGE/NOTICE.txt"

count=$(ls "$STAGE" | wc -l | tr -d ' ')
[ "$count" -le 1000 ] || { echo "$count assets: a release holds at most 1000" >&2; exit 1; }

if [ $DRY -eq 0 ] && ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "Hadith packs (v1)" --notes "$NOTES" --latest=false || exit 1
fi
gh api "repos/$REPO/releases/tags/$TAG" --jq '.assets[] | "\(.name) \(.digest // "")"' > "$EXISTING" 2>/dev/null || true

sha() { echo "sha256:$(shasum -a 256 "$1" | cut -d' ' -f1)"; }

uploaded=0
skipped=0
failed=0
upload() {
  local f="$1" name
  name=$(basename "$f")
  if grep -qxF "$name $(sha "$f")" "$EXISTING"; then
    skipped=$((skipped + 1))
    return
  fi
  if [ $DRY -eq 1 ]; then
    echo "would upload $name"
  elif ! gh release upload "$TAG" -R "$REPO" "$f" --clobber >/dev/null 2>&1; then
    echo "FAILED $name"
    failed=$((failed + 1))
    return
  fi
  uploaded=$((uploaded + 1))
}

for f in "$STAGE"/*; do
  [ "$(basename "$f")" = manifest.json ] && continue
  upload "$f"
done
if [ $failed -gt 0 ]; then
  echo "done: $uploaded uploaded, $skipped unchanged, $failed FAILED — manifest.json held back; run again" >&2
  exit 1
fi
upload "$STAGE/manifest.json"

echo "done: $uploaded uploaded, $skipped unchanged ($count assets)"
[ $DRY -eq 1 ] || gh release view "$TAG" -R "$REPO" --json assets --jq '.assets | length' | xargs echo "assets on release:"
