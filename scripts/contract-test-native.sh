#!/usr/bin/env bash
# Run the widget contract fixtures through the Swift and Kotlin readers.
#
#   scripts/contract-test-native.sh          # both
#   scripts/contract-test-native.sh swift    # ios/Contract, with plain swiftc
#   scripts/contract-test-native.sh kotlin   # android/…/contract, on the JVM
#
# contract-tests/fixtures.json holds the answers the app's own TypeScript
# gives (`npm run contract-fixtures`); each platform must give the same.
# Neither half needs an Xcode project, an emulator or the Android build:
# the contract code depends on Foundation and org.json and nothing else.
set -euo pipefail
cd "$(dirname "$0")/.."

which="${1:-all}"

if [[ "$which" == all || "$which" == swift ]]; then
  out="$(mktemp -d)"
  trap 'rm -rf "$out"' EXIT
  swiftc -O -o "$out/contract-test" \
    ios/Contract/*.swift \
    contract-tests/swift/Registry.generated.swift \
    contract-tests/swift/main.swift
  "$out/contract-test" contract-tests/fixtures.json
fi

if [[ "$which" == all || "$which" == kotlin ]]; then
  ./android/gradlew -p contract-tests/kotlin test --console=plain
  echo "widget contract (Kotlin): tests passed"
fi
