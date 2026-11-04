#!/bin/sh
# The apt and dnf repositories, built from one release's files.
#
#   build-repos.sh <in> <out>
#
# <in> holds the release's Mihrab-*.deb and Mihrab-*.rpm. <out> becomes the
# whole site served at $MIHRAB_REPO_URL (https://mihrabhq.github.io/packages):
#
#   deb/          dists/stable (InRelease, Release, Release.gpg) and pool/
#   rpm/          the rpms, signed, and repodata/ (repomd.xml signed)
#   mihrab.asc    the signing key, armoured (dnf, zypper)
#   mihrab.gpg    the same key as a keyring (apt's signed-by)
#   mihrab.sources, mihrab.repo   what a system adds to use them
#   version.txt   the version served, so the publisher knows when to rebuild
#
# The signing key is the one secret key in the gpg keyring ($GNUPGHOME). Only
# the latest version is kept: one version is all apt and dnf need to update,
# and it keeps the site well under GitHub Pages' 1 GB.
#
# Needs: apt-utils (apt-ftparchive), createrepo-c, rpm (rpmsign), gpg.
set -eu

in=$(cd "$1" && pwd)
out=$2
url=${MIHRAB_REPO_URL:-https://mihrabhq.github.io/packages}

key=$(gpg --batch --list-secret-keys --with-colons | awk -F: '/^fpr:/ { print $10; exit }')
[ -n "$key" ] || { echo "no secret key in the keyring" >&2; exit 1; }

set -- "$in"/Mihrab-*.deb
[ -e "$1" ] || { echo "no .deb in $in" >&2; exit 1; }
version=$(dpkg-deb -f "$1" Version)
set -- "$in"/Mihrab-*.rpm
[ -e "$1" ] || { echo "no .rpm in $in" >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out/deb/pool/main/m/mihrab" "$out/rpm"
out=$(cd "$out" && pwd)

# ---- apt -------------------------------------------------------------------
# Named as Debian names them (name_version_arch.deb): apt-ftparchive picks
# each architecture's files by that name.
for f in "$in"/Mihrab-*.deb; do
  cp "$f" "$out/deb/pool/main/m/mihrab/$(dpkg-deb -f "$f" Package)_$(dpkg-deb -f "$f" Version)_$(dpkg-deb -f "$f" Architecture).deb"
done
(
  cd "$out/deb"
  for arch in amd64 arm64; do
    d=dists/stable/main/binary-$arch
    mkdir -p "$d"
    apt-ftparchive --arch "$arch" packages pool > "$d/Packages"
    gzip -9kn "$d/Packages"
  done
  apt-ftparchive \
    -o APT::FTPArchive::Release::Origin=Mihrab \
    -o APT::FTPArchive::Release::Label=Mihrab \
    -o APT::FTPArchive::Release::Suite=stable \
    -o APT::FTPArchive::Release::Codename=stable \
    -o APT::FTPArchive::Release::Architectures="amd64 arm64" \
    -o APT::FTPArchive::Release::Components=main \
    -o APT::FTPArchive::Release::Description="Mihrab for Debian, Ubuntu and their family" \
    release dists/stable > dists/stable/Release.new
  mv dists/stable/Release.new dists/stable/Release
  gpg --batch --yes --local-user "$key" --clearsign -o dists/stable/InRelease dists/stable/Release
  gpg --batch --yes --local-user "$key" -abs -o dists/stable/Release.gpg dists/stable/Release
)

# ---- dnf / zypper ----------------------------------------------------------
cp "$in"/Mihrab-*.rpm "$out/rpm/"
for f in "$out"/rpm/*.rpm; do
  GPG_TTY= rpmsign --define "_gpg_name $key" --define "_gpg_path ${GNUPGHOME:-$HOME/.gnupg}" --addsign "$f" >/dev/null
done
createrepo_c --quiet "$out/rpm"
gpg --batch --yes --local-user "$key" --armor --detach-sign -o "$out/rpm/repodata/repomd.xml.asc" "$out/rpm/repodata/repomd.xml"

# ---- what a system adds ----------------------------------------------------
gpg --batch --armor --export "$key" > "$out/mihrab.asc"
gpg --batch --export "$key" > "$out/mihrab.gpg"
cat > "$out/mihrab.sources" <<EOF
Types: deb
URIs: $url/deb
Suites: stable
Components: main
Signed-By: /usr/share/keyrings/mihrab.gpg
EOF
cat > "$out/mihrab.repo" <<EOF
[mihrab]
name=Mihrab
baseurl=$url/rpm
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=$url/mihrab.asc
EOF
echo "$version" > "$out/version.txt"
echo "repositories for Mihrab $version in $out"
