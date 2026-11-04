// What the Live Activity counts down to, worked out by the card itself
// (PrayerLiveActivityAttributes.swift, `ContentState.aim`). Run by run.sh
// inside a simulator. Every line prints ✓ or ✗; the exit status says which.

import Foundation
typealias CS = PrayerLiveActivityAttributes.ContentState
typealias Row = PrayerLiveActivityAttributes.Row
func row(_ k: String, _ m: Int, name: String = "") -> Row {
  Row(key: k, abbr: k, name: name.isEmpty ? k : name, time: String(format: "%02d:%02d", (m % 1440) / 60, m % 60), display: "", minutes: m)
}
var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "Europe/Stockholm")!
func date(_ key: String, _ m: Int) -> Date { WallClock.date(dateKey: key, minutes: m, calendar: cal)! }
let day = "2026-11-04"
let rows = [row("Fajr", 295, name: "الفجر"), row("Dhuhr", 696), row("Asr", 802), row("Maghrib", 954), row("Isha", 1072)]
let sun = row("Sunrise", 429)
let night = [row("FirstThird", 1250), row("Midnight", 1440 + 68), row("LastThird", 1440 + 246)]
var ok = true
func check(_ name: String, _ cond: Bool) { print((cond ? "✓ " : "✗ ") + name); if !cond { ok = false } }

// Pushed at 13:00: next is Asr 13:22.
var s = CS(nextLabel: "عصر", nextTime: "13:22", nextTimeDisplay: "13:22", nextEpochSeconds: date(day, 802).timeIntervalSince1970,
  prevEpochSeconds: date(day, 696).timeIntervalSince1970, nextKey: "Asr", rows: rows, sunriseRow: sun, extraRows: night,
  hijriLabel: "", locationLabel: "", accentHex: "#22c55e", systemTinted: false, tinted: nil, compactMode: false, showSunrise: true, showHijri: false, showLocation: false)
check("shown day from the pushed prayer", s.shownDayKey(calendar: cal) == day)
let a1 = s.aim(at: date(day, 800), calendar: cal)
check("still ahead: the pushed prayer", a1.key == "Asr" && a1.ahead)
let a2 = s.aim(at: date(day, 803), calendar: cal)
check("a minute after Asr: Maghrib, counting from Asr", a2.key == "Maghrib" && a2.ahead && a2.epoch == date(day, 954).timeIntervalSince1970 && a2.prevEpoch == date(day, 802).timeIntervalSince1970)
let a3 = s.aim(at: date(day, 1080), calendar: cal)
check("after Isha: the First Third (a night mark)", a3.key == "FirstThird" && a3.ahead)
let a4 = s.aim(at: date(day, 1440 + 70), calendar: cal)
check("past midnight: the Last Third, on the same shown day", a4.key == "LastThird" && a4.epoch == date(day, 1440 + 246).timeIntervalSince1970)
let a5 = s.aim(at: date(day, 1440 + 300), calendar: cal)
check("after the last event: nothing ahead, names the pushed prayer", !a5.ahead && a5.key == "Asr")
// Pushed after Isha: the shown day is tomorrow, next is tomorrow's Fajr.
let tmrw = "2026-11-05"
var t = s; t.nextKey = "Fajr"; t.nextEpochSeconds = date(tmrw, 295).timeIntervalSince1970; t.extraRows = nil
check("tomorrow's Fajr names tomorrow as the shown day", t.shownDayKey(calendar: cal) == tmrw)
let a6 = t.aim(at: date(tmrw, 300), calendar: cal)
check("after tomorrow's Fajr: Sunrise", a6.key == "Sunrise" && a6.epoch == date(tmrw, 429).timeIntervalSince1970)
// An Isha past midnight (minutes 1442) pushed as next: the shown day stays yesterday.
var i = s; i.nextKey = "Isha"; i.rows[4] = row("Isha", 1442); i.nextEpochSeconds = date(day, 1442).timeIntervalSince1970
check("an Isha at 00:02 keeps its own day", i.shownDayKey(calendar: cal) == day)
// Pointed: the pushed state follows the aim.
let p = s.pointed(at: a2)
check("pointed state carries the aim", p.nextKey == "Maghrib" && p.nextEpochSeconds == a2.epoch && p.nextLabel == "Maghrib")
// The clock-change night (25 Oct 2026, Stockholm): minutes stay the clock's.
let dst = "2026-10-25"
var d = s; d.nextKey = "Fajr"; d.rows = [row("Fajr", 320), row("Dhuhr", 690)]; d.sunriseRow = nil; d.extraRows = nil
d.nextEpochSeconds = date(dst, 320).timeIntervalSince1970
check("on the clock-change day the shown day is still right", d.shownDayKey(calendar: cal) == dst)
let a7 = d.aim(at: date(dst, 321), calendar: cal)
check("and the next event after it is placed on the clock", a7.key == "Dhuhr" && cal.component(.hour, from: Date(timeIntervalSince1970: a7.epoch)) == 11)
print(ok ? "AIM OK" : "AIM FAILED"); exit(ok ? 0 : 1)
