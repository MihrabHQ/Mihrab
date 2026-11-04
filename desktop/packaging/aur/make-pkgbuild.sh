#!/bin/sh
# The AUR package mihrab-bin (yay -S mihrab-bin), written for one release.
#
#   make-pkgbuild.sh <version> <amd64.deb> <arm64.deb> <out-dir>
#
# Writes PKGBUILD and .SRCINFO into <out-dir> (a clone of the AUR package's
# git repository, ssh://aur@aur.archlinux.org/mihrab-bin.git). The package
# is the release's own .deb, unpacked: the AUR holds only this recipe, and
# makepkg downloads the .deb from the GitHub release and checks its sha256.
set -eu

version=$1
amd64=$2
arm64=$3
out=$4
base=${MIHRAB_RELEASES:-https://github.com/MihrabHQ/Mihrab/releases/download}

sum() { sha256sum "$1" | cut -d' ' -f1; }
sum_x86_64=$(sum "$amd64")
sum_aarch64=$(sum "$arm64")
src_x86_64="mihrab-$version-amd64.deb::$base/v$version/Mihrab-$version-linux-amd64.deb"
src_aarch64="mihrab-$version-arm64.deb::$base/v$version/Mihrab-$version-linux-arm64.deb"

desc="Prayer times, the adhan and the Qur'an"
url="https://mihrab.elghamri.se"
depends="gtk3 libnotify nss libxtst alsa-lib xdg-utils"

mkdir -p "$out"

{
  echo "# Maintainer: Hassan El Ghamri <hassan15015099 at gmail dot com>"
  echo "#"
  echo "# Written by desktop/packaging/aur/make-pkgbuild.sh in MihrabHQ/Mihrab for"
  echo "# each release; changes belong there."
  echo
  echo "pkgname=mihrab-bin"
  echo "pkgver=$version"
  echo "pkgrel=1"
  echo "pkgdesc=\"$desc\""
  echo "arch=('x86_64' 'aarch64')"
  echo "url=\"$url\""
  echo "license=('AGPL-3.0-or-later')"
  printf "depends=("; for d in $depends; do printf "'%s' " "$d"; done | sed 's/ $//'; echo ")"
  echo "provides=('mihrab')"
  echo "conflicts=('mihrab')"
  echo "options=('!strip' '!debug')"
  echo "source_x86_64=(\"$src_x86_64\")"
  echo "source_aarch64=(\"$src_aarch64\")"
  echo "sha256sums_x86_64=('$sum_x86_64')"
  echo "sha256sums_aarch64=('$sum_aarch64')"
  cat <<'EOF'

package() {
  bsdtar -xf data.tar.* -C "$pkgdir"
  rm -rf "$pkgdir/usr/share/doc"
  install -dm755 "$pkgdir/usr/bin"
  ln -s /opt/Mihrab/mihrab "$pkgdir/usr/bin/mihrab"
}
EOF
} > "$out/PKGBUILD"

{
  echo "pkgbase = mihrab-bin"
  printf '\tpkgdesc = %s\n' "$desc"
  printf '\tpkgver = %s\n' "$version"
  printf '\tpkgrel = 1\n'
  printf '\turl = %s\n' "$url"
  printf '\tarch = x86_64\n\tarch = aarch64\n'
  printf '\tlicense = AGPL-3.0-or-later\n'
  for d in $depends; do printf '\tdepends = %s\n' "$d"; done
  printf '\tprovides = mihrab\n\tconflicts = mihrab\n'
  printf '\toptions = !strip\n\toptions = !debug\n'
  printf '\tsource_x86_64 = %s\n\tsha256sums_x86_64 = %s\n' "$src_x86_64" "$sum_x86_64"
  printf '\tsource_aarch64 = %s\n\tsha256sums_aarch64 = %s\n' "$src_aarch64" "$sum_aarch64"
  printf '\npkgname = mihrab-bin\n'
} > "$out/.SRCINFO"

echo "mihrab-bin $version written to $out"
