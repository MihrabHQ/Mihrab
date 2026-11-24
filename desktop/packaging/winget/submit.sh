#!/usr/bin/env bash
# Propose one version of MihrabHQ.Mihrab to microsoft/winget-pkgs: the
# manifests make-manifests.js wrote, committed to a branch of the token
# owner's fork through the GitHub API (no clone of that very large
# repository), and a pull request from it.
#
#   GH_TOKEN=… desktop/packaging/winget/submit.sh <out-dir-of-make-manifests> <version>
#
# The token's account needs a fork of microsoft/winget-pkgs (made here if
# missing) and to have agreed to Microsoft's CLA once, on its first pull
# request there. Does nothing when a pull request for the version is open.
set -euo pipefail
out=$1 version=$2
id=MihrabHQ.Mihrab
rel=manifests/m/MihrabHQ/Mihrab/$version
[ -d "$out/$rel" ] || { echo "no manifests at $out/$rel"; exit 1; }

user=$(gh api user -q .login)
upstream=microsoft/winget-pkgs
fork=$user/winget-pkgs
branch=$id-$version

if [ -n "$(gh api "repos/$upstream/pulls?state=open&head=$user:$branch" -q '.[].number')" ]; then
  echo "a pull request for $id $version is already open"; exit 0
fi

# New package or new version: the title winget-pkgs' bots expect.
if gh api "repos/$upstream/contents/manifests/m/MihrabHQ/Mihrab" >/dev/null 2>&1; then
  title="New version: $id version $version"
else
  title="New package: $id version $version"
fi

if ! gh api "repos/$fork" >/dev/null 2>&1; then
  gh api -X POST "repos/$upstream/forks" >/dev/null
  for _ in $(seq 1 30); do gh api "repos/$fork" >/dev/null 2>&1 && break; sleep 10; done
fi
gh api -X POST "repos/$fork/merge-upstream" -f branch=master >/dev/null
base=$(gh api "repos/$fork/git/ref/heads/master" -q .object.sha)
gh api -X DELETE "repos/$fork/git/refs/heads/$branch" >/dev/null 2>&1 || true
gh api -X POST "repos/$fork/git/refs" -f ref="refs/heads/$branch" -f sha="$base" >/dev/null

for f in "$out/$rel"/*.yaml; do
  name=$(basename "$f")
  gh api -X PUT "repos/$fork/contents/$rel/$name" \
    -f message="$title" -f branch="$branch" -f content="$(base64 < "$f" | tr -d '\n')" >/dev/null
done

body="Mihrab $version for Windows: the per-user NSIS installers (x64 and arm64) attached to [its release](https://github.com/MihrabHQ/Mihrab/releases/tag/v$version), from [MihrabHQ/Mihrab](https://github.com/MihrabHQ/Mihrab).

- [x] Have you checked that there aren't other open [pull requests](https://github.com/microsoft/winget-pkgs/pulls) for the same manifest update/change?
- [x] This PR only modifies one (1) manifest
- [x] Have you [validated](https://github.com/microsoft/winget-pkgs/blob/master/doc/Authoring.md#validation) your manifest locally with \`winget validate --manifest <path>\`?
- [x] Have you tested your manifest locally with \`winget install --manifest <path>\`?
- [x] Does your manifest conform to the [1.10 schema](https://github.com/microsoft/winget-pkgs/tree/master/doc/manifest/schema/1.10.0)?

Validated, installed, started and removed with winget on a Windows runner before this was opened ([winget.yml](https://github.com/MihrabHQ/Mihrab/blob/main/.github/workflows/winget.yml))."

gh api -X POST "repos/$upstream/pulls" -f title="$title" -f head="$user:$branch" -f base=master -f body="$body" -q .html_url
