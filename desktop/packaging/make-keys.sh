#!/bin/sh
# The two keys MihrabHQ/packages publishes with — run once, by the
# maintainer, on his own machine. Nothing here is printed except public keys.
#
#   sh desktop/packaging/make-keys.sh
#
# 1. A signing key for the apt and dnf repositories (ed25519, no passphrase:
#    the workflow signs unattended). The secret half goes straight into the
#    repository secret PACKAGES_SIGNING_KEY and into ~/.mihrab-keys/ (keep a
#    copy somewhere safe, e.g. a password manager: if it is lost, everyone
#    who added the repository has to fetch the new key).
# 2. An SSH key for the AUR account. The secret half goes into AUR_SSH_KEY;
#    the public half is printed, to paste into the AUR account's settings
#    (My Account → SSH Public Key).
#
# Needs gpg, ssh-keygen and gh (signed in, with admin on MihrabHQ/packages).
set -eu

REPO=MihrabHQ/packages
DIR="$HOME/.mihrab-keys"
mkdir -p "$DIR" && chmod 700 "$DIR"

# Short: gpg-agent's socket lives in it, and a long temp path breaks it.
GNUPGHOME="$(mktemp -d /tmp/mk.XXXXXX)"
export GNUPGHOME
trap 'rm -rf "$GNUPGHOME"' EXIT

if [ ! -f "$DIR/packages-signing.asc" ]; then
  gpg --batch --pinentry-mode loopback --passphrase '' \
    --quick-gen-key "Mihrab packages <hassan15015099@gmail.com>" ed25519 sign never 2>/dev/null
  gpg --batch --armor --export-secret-keys > "$DIR/packages-signing.asc"
  chmod 600 "$DIR/packages-signing.asc"
fi
gh secret set PACKAGES_SIGNING_KEY -R "$REPO" < "$DIR/packages-signing.asc"
echo "PACKAGES_SIGNING_KEY is set. The key's fingerprint:"
gpg --batch --import "$DIR/packages-signing.asc" 2>/dev/null
gpg --batch --list-keys --with-colons | awk -F: '/^fpr:/ { print "  " $10; exit }'

if [ ! -f "$DIR/aur" ]; then
  ssh-keygen -q -t ed25519 -N '' -C "mihrab-bin AUR publishing" -f "$DIR/aur"
fi
gh secret set AUR_SSH_KEY -R "$REPO" < "$DIR/aur"
echo
echo "AUR_SSH_KEY is set. Paste this into https://aur.archlinux.org (My Account → SSH Public Key):"
echo
cat "$DIR/aur.pub"
echo
echo "Both secret keys are also in $DIR — keep a copy somewhere safe."
