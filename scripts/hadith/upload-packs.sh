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
# Packs that are no longer built, and so are taken off the release: the two
# books no open dataset grades (scripts/hadith/build-packs.js, "what is served").
GONE="books.ahmad.json books.darimi.json"

[ -f "$DIR/manifest.json" ] || { echo "no $DIR/manifest.json — run node scripts/hadith/build-packs.js first" >&2; exit 1; }

NOTES="Mihrab's copy of the Hadith packs the app downloads on request (Hadith tab, Settings → Downloads). Built by scripts/hadith/build-packs.js; the app falls back to the original sources when this release cannot be reached.

Sources and terms:
• HadeethEnc.com — Encyclopedia of Translated Prophetic Hadiths (https://hadeethenc.com): texts, translations, explanations, benefits, grades and topics, republished unmodified with credit. Packs henc.*.json and categories.*.json.
• Open-Hadith-Data (https://github.com/mhashim6/Open-Hadith-Data): seven books in vowelled Arabic, matn column only. Licensed under the Open Database License 1.0 (https://opendatacommons.org/licenses/odbl/1-0/), contents under the Database Contents License 1.0; packs books.*.json are a derived database under the ODbL.
• fawazahmed0/hadith-api (https://github.com/fawazahmed0/hadith-api): the Arabic text and numbering of an-Nawawi's Forty (public domain; pack nawawi.ar.json), and the graders' verdicts on the hadith of the four Sunan and the Muwatta, as it records them (in packs books.abudawud, books.tirmidhi, books.nasai, books.ibnmajah and books.malik).

What is served: only sound hadith. A HadeethEnc entry whose Arabic grade does not call it sound is left out. Sahih al-Bukhari and Sahih Muslim are whole, on the standing of the collections. Of the four Sunan and the Muwatta, a pack holds only the hadith that every grader who ruled on it calls sahih or hasan; manifest.json says how many of each book that is and how many were left out. Musnad Ahmad and Sunan ad-Darimi are not published: no open dataset grades them. The grades are as hadith-api records them and have not been checked against the printed works.

The Library (library.*.json, library.*.pdf): whole books to read, not hadith served by the rule above. Classical Arabic texts are from OpenITI (CC BY-NC-SA 4.0) and Arabic Wikisource (CC BY-SA 4.0), as each pack's source line says. Indonesian books are IslamHouse.com's own PDF files (https://islamhouse.com), republished unaltered with their authors and the source named, on IslamHouse's stated terms.

Mihrab is independent and not affiliated with any of these projects."

STAGE=$(mktemp -d)
EXISTING=$(mktemp)
trap 'rm -rf "$STAGE" "$EXISTING"' EXIT

# Flatten: a/b/c.json → a.b.c.json. Copies, so the build tree stays as is.
# The packs, and the Library's books that are files (library/<id>.pdf: a publisher's PDF, byte for byte).
(cd "$DIR" && find . -type f \( -name '*.json' -o -name '*.pdf' \) ! -name manifest.json) | sed 's|^\./||' | while read -r rel; do
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

# After the manifest that stopped naming them. The release's notes are set
# again too: they say what is served.
removed=0
for name in $GONE; do
  grep -q "^$name " "$EXISTING" || continue
  if [ $DRY -eq 1 ]; then
    echo "would remove $name"
  elif ! gh release delete-asset "$TAG" "$name" -R "$REPO" --yes >/dev/null 2>&1; then
    echo "FAILED to remove $name" >&2
    continue
  fi
  removed=$((removed + 1))
done
[ $DRY -eq 1 ] || gh release edit "$TAG" -R "$REPO" --notes "$NOTES" >/dev/null 2>&1 || echo "the release's notes were not updated" >&2
[ $removed -eq 0 ] || echo "removed: $removed no longer published"

echo "done: $uploaded uploaded, $skipped unchanged ($count assets)"
[ $DRY -eq 1 ] || gh release view "$TAG" -R "$REPO" --json assets --jq '.assets | length' | xargs echo "assets on release:"
