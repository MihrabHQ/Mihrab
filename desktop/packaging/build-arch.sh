#!/bin/sh
# The pacman repository (Arch, Manjaro, EndeavourOS — pacman and yay alike),
# built from one release's .debs into <out>/arch/<arch>/:
#
#   build-arch.sh <in> <out>
#
# The package is aur/make-pkgbuild.sh's recipe named plain `mihrab`, built
# with makepkg in an Arch container for x86_64 and aarch64, each package and
# each repository database signed with the key in the gpg keyring
# ($GNUPGHOME) that signs the apt and dnf repositories. Users add it with
#
#   [mihrab]
#   Server = https://mihrabhq.github.io/packages/arch/$arch
#
# in /etc/pacman.conf, after trusting the key (pacman-key --add, --lsign-key).
# Needs docker; run after build-repos.sh, which empties <out>.
set -eu

in=$(cd "$1" && pwd)
mkdir -p "$2"
out=$(cd "$2" && pwd)
here=$(cd "$(dirname "$0")" && pwd)

set -- "$in"/Mihrab-*-amd64.deb
[ -e "$1" ] || { echo "no amd64 .deb in $in" >&2; exit 1; }
version=$(dpkg-deb -f "$1" Version)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
gpg --batch --armor --export-secret-keys > "$work/key.asc"

docker run --rm -e VERSION="$version" \
  -v "$in:/in:ro" -v "$out:/out" -v "$here:/packaging:ro" -v "$work:/work:ro" \
  archlinux:latest sh /packaging/arch-inside.sh
echo "pacman repository for Mihrab $version in $out/arch"
