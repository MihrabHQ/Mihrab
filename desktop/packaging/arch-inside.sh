#!/bin/sh
# The inside of build-arch.sh: runs in an archlinux container, with the
# release's .debs at /in, this folder at /packaging, the signing key at
# /work/key.asc and the site at /out. $VERSION is the release's version.
set -eu

pacman -Syu --noconfirm --needed base-devel >/dev/null
gpg --batch --import /work/key.asc 2>/dev/null
key=$(gpg --batch --list-secret-keys --with-colons | awk -F: '/^fpr:/ { print $10; exit }')

# The recipe downloads from the release; here it reads the same files.
mkdir -p "/build/rel/v$VERSION"
cp /in/Mihrab-*.deb "/build/rel/v$VERSION/"
MIHRAB_RELEASES=file:///build/rel MIHRAB_PKGNAME=mihrab \
  sh /packaging/aur/make-pkgbuild.sh "$VERSION" /in/Mihrab-*-amd64.deb /in/Mihrab-*-arm64.deb /build/pkg
useradd -m builder
mkdir -p /build/out-x86_64 /build/out-aarch64
chown -R builder /build

for carch in x86_64 aarch64; do
  # Packaging only — the .deb is already built for the architecture — so
  # aarch64 is made here too, by telling makepkg that is where it is.
  sed "s/^CARCH=.*/CARCH=\"$carch\"/" /etc/makepkg.conf > "/build/makepkg-$carch.conf"
  su builder -c "cd /build/pkg && PKGDEST=/build/out-$carch makepkg -f --nodeps --noconfirm --config /build/makepkg-$carch.conf" >/dev/null
  dir="/out/arch/$carch"
  mkdir -p "$dir"
  cp /build/out-"$carch"/*.pkg.tar.zst "$dir/"
  for p in "$dir"/*.pkg.tar.zst; do
    gpg --batch --yes --local-user "$key" --detach-sign --no-armor "$p"
  done
  repo-add -q --sign --key "$key" "$dir/mihrab.db.tar.gz" "$dir"/*.pkg.tar.zst
  # Pages serves files, not links: mihrab.db and mihrab.files as copies.
  for f in mihrab.db mihrab.db.sig mihrab.files mihrab.files.sig; do
    if [ -L "$dir/$f" ]; then cp --remove-destination "$(readlink -f "$dir/$f")" "$dir/$f"; fi
  done
done
chmod -R a+rX /out/arch
