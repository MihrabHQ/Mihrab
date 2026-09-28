// The widget contract fixtures, read by the Swift that the app, its widgets
// and its Live Activity compile (ios/Contract). Every answer must equal the
// one the app's own TypeScript gave (contract-tests/fixtures.json).
//
//   scripts/contract-test-native.sh swift
//
// Plain swiftc and Foundation, no Xcode project and no XCTest, so it runs on
// a Mac and on the Linux CI runner alike.

import Foundation

let path = CommandLine.arguments.dropFirst().first ?? "contract-tests/fixtures.json"
guard let data = FileManager.default.contents(atPath: path),
      let fixtures = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
else {
  FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
  exit(2)
}

var failures: [String] = []
var checked = 0

func check(_ ok: Bool, _ what: @autoclosure () -> String) {
  checked += 1
  if !ok { failures.append(what()) }
}

/// Sorted-key JSON text, so two values compare by content, not by layout.
func canonical(_ value: Any?) -> String {
  guard let value, !(value is NSNull) else { return "null" }
  guard let data = try? JSONSerialization.data(
    withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed])
  else { return "<unencodable>" }
  return String(decoding: data, as: UTF8.self)
}

func section(_ name: String) -> [[String: Any]] {
  (fixtures[name] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
}

func optionalInt(_ v: Any?) -> Int? { (v as? NSNumber)?.intValue }

func decode<T: Decodable>(_ type: T.Type, _ object: Any) -> T? {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: .fragmentsAllowed)
  else { return nil }
  return try? JSONDecoder().decode(type, from: data)
}

func calendar(_ zone: String) -> Calendar {
  var c = Calendar(identifier: .gregorian)
  guard let tz = TimeZone(identifier: zone) else {
    failures.append("unknown zone \(zone)")
    return c
  }
  c.timeZone = tz
  return c
}

// ── Decoding ──────────────────────────────────────────────────────────────

for c in section("decode") {
  let name = c["name"] as? String ?? "?"
  let type = c["type"] as? String ?? "?"
  guard let reader = contractReaders[type] else {
    failures.append("decode: no Swift reader for \(type)")
    continue
  }
  let input = (c["input"] as? String ?? "").data(using: .utf8)!
  let got: Any? = reader(input).flatMap {
    try? JSONSerialization.jsonObject(with: $0, options: .fragmentsAllowed)
  }
  let want = canonical(c["expected"])
  let have = canonical(got)
  check(want == have, "decode \(type) — \(name)\n    want \(want)\n    have \(have)")
}

// ── v2 → the v1 the renderers draw ────────────────────────────────────────

for c in section("adapt") {
  let name = c["name"] as? String ?? "?"
  let now = c["now"] as? [String: Any] ?? [:]
  let input = (c["input"] as? String ?? "").data(using: .utf8)!
  let have: Any? = (try? JSONDecoder().decode(WidgetContract.Payload.self, from: input)).flatMap {
    WidgetPayloadV1.object(
      from: $0,
      todayKey: now["todayKey"] as? String ?? "",
      nowMinutes: optionalInt(now["nowMinutes"]) ?? 0)
  }
  let want = canonical(c["expected"])
  let got = canonical(have)
  check(want == got, "adapt — \(name)\n    want \(want)\n    have \(got)")
}

// ── Time ──────────────────────────────────────────────────────────────────

for c in section("hhmm") {
  let text = c["text"] as? String ?? ""
  let want = optionalInt(c["minutes"])
  let have = WallClock.minutes(fromHHmm: text)
  check(want == have, "hhmm \"\(text)\": want \(String(describing: want)), have \(String(describing: have))")
}

for c in section("text") {
  let minutes = optionalInt(c["minutes"])
  guard let clock = decode(WidgetContract.Clock.self, c["clock"] ?? [:]) else {
    failures.append("text: unreadable clock \(canonical(c["clock"]))")
    continue
  }
  let want = c["text"] as? String ?? ""
  let have = WallClock.text(minutes, clock: clock)
  check(want == have, "text \(String(describing: minutes)) \(canonical(c["clock"])): want \"\(want)\", have \"\(have)\"")
}

for c in section("instants") {
  let zone = c["zone"] as? String ?? "UTC"
  let dateKey = c["dateKey"] as? String ?? ""
  let minutes = optionalInt(c["minutes"]) ?? 0
  let want = (c["epochMs"] as? NSNumber)?.int64Value
  let date = WallClock.date(dateKey: dateKey, minutes: minutes, calendar: calendar(zone))
  let have = date.map { Int64(($0.timeIntervalSince1970 * 1000).rounded()) }
  check(want == have, "instant \(zone) \(dateKey) +\(minutes): want \(String(describing: want)), have \(String(describing: have))")
}

for c in section("offsets") {
  let zone = c["zone"] as? String ?? "UTC"
  let dateKey = c["dateKey"] as? String ?? ""
  let want = optionalInt(c["utcOffsetMinutes"])
  let have = WallClock.utcOffsetMinutes(dateKey: dateKey, calendar: calendar(zone))
  check(want == have, "offset \(zone) \(dateKey): want \(String(describing: want)), have \(String(describing: have))")
}

for c in section("local") {
  let zone = c["zone"] as? String ?? "UTC"
  let epoch = (c["epochMs"] as? NSNumber)?.doubleValue ?? 0
  let at = Date(timeIntervalSince1970: epoch / 1000)
  let cal = calendar(zone)
  let wantKey = c["dateKey"] as? String
  let wantMinutes = optionalInt(c["minutes"])
  let haveKey = WallClock.dateKey(at, calendar: cal)
  let haveMinutes = WallClock.minutes(of: at, calendar: cal)
  check(wantKey == haveKey && wantMinutes == haveMinutes,
        "local \(zone) \(Int64(epoch)): want \(wantKey ?? "?") +\(String(describing: wantMinutes)), have \(haveKey) +\(haveMinutes)")
}

for c in section("stale") {
  let zone = c["zone"] as? String ?? "UTC"
  guard let day = decode(WidgetContract.Day.self, c["day"] ?? [:]) else {
    failures.append("stale: unreadable day \(canonical(c["day"]))")
    continue
  }
  let want = (c["stale"] as? NSNumber)?.boolValue
  let have = WallClock.isStale(day, calendar: calendar(zone))
  check(want == have, "stale \(zone) \(canonical(c["day"])): want \(String(describing: want)), have \(have)")
}

// ── Verdict ───────────────────────────────────────────────────────────────

if failures.isEmpty {
  print("widget contract (Swift): \(checked) checks passed")
  exit(0)
}
print("widget contract (Swift): \(failures.count) of \(checked) checks FAILED")
for f in failures { print("  ✗ \(f)") }
exit(1)
