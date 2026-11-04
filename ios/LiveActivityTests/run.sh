#!/bin/sh
# The Live Activity's own arithmetic (`ContentState.aim`), run inside a booted
# iOS simulator: ActivityKit exists nowhere else, so this cannot be a plain
# `swift test`. Compiles the attributes file with the contract it reads and
# AimTests.swift as the program, then runs it with `simctl spawn`.
#
#   ios/LiveActivityTests/run.sh            # any booted simulator
#   ios/LiveActivityTests/run.sh <udid>
set -e
here=$(cd "$(dirname "$0")" && pwd)
ios="$here/.."
sim=${1:-booted}
out=$(mktemp -d)
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
arch=$(uname -m | sed 's/x86_64/x86_64/; s/arm64/arm64/')
xcrun swiftc -sdk "$sdk" -target "$arch-apple-ios16.1-simulator" -o "$out/aimtest" \
  "$ios/MihrabLiveActivity/PrayerLiveActivityAttributes.swift" \
  "$ios/Contract/WallClock.swift" \
  "$ios/Contract/WidgetContract.generated.swift" \
  "$here/main.swift"
xcrun simctl spawn "$sim" "$out/aimtest"
