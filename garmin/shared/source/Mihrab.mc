// Shared by the watch face and the data field: the prayer times the phone
// sent, and what to show for them.
//
// THE MESSAGE. Mihrab on the phone asks Gadgetbridge to deliver, to each
// of the two watch apps (by its UUID), one small message:
//
//   { "v": 2, "t": [ fajr, sunrise, dhuhr, asr, maghrib, isha, fajr, ... ],
//     "h12": 0, "f": 0, "a": 0x00AA55 }
//
// `t` is epoch seconds (UTC), six per day — the five prayers and sunrise,
// as the app's own schedule lists them — today first and then the days
// after it: three days as the phone sends it, but any multiple of six is
// read. A time that does not occur at the latitude, or sunrise when the
// app is set not to show it, is 0 and is skipped. Version 1 (five a day,
// no sunrise) is not read: its times sit under another key, so a watch
// updated before the phone says to open Mihrab rather than misplace them. The whole
// message has to fit Gadgetbridge's limit for a watch-app message (about
// 260 bytes once encoded and encrypted), which is why it is numbers and
// nothing else: names, and the zone, are the watch's.
//
// The watch keeps the times in Storage and counts down on its own; the
// phone sends again whenever it rebuilds its own schedule (daily, and on
// any change of place or method), so a watch that missed a message is at
// most a day behind and says so.
import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// What the background service needs: the keys and the store. Nothing here
// may touch resources or the UI, which a background process has none of.
(:background, :glance)
module MihrabStore {
    // Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha.
    const PER_DAY = 6;
    // Version 1 kept five a day under "t"; this key leaves them unread.
    const KEY_TIMES = "t6";
    const KEY_RECEIVED = "r";
    const KEY_HOUR12 = "h12";
    const KEY_FAHRENHEIT = "f";
    const KEY_ACCENT = "a";

    // Takes the phone's message (the data of a PhoneAppMessage) and keeps
    // it. Returns whether it was a message this version reads.
    function store(data as Object?) as Boolean {
        if (!(data instanceof Dictionary)) {
            return false;
        }
        var version = data.get("v");
        var times = data.get("t");
        if (!(version instanceof Number) || version < 2 || !(times instanceof Array)
            || times.size() < PER_DAY || times.size() % PER_DAY != 0) {
            return false;
        }
        var kept = [] as Array<Number>;
        for (var i = 0; i < times.size(); i++) {
            var t = times[i];
            if (t instanceof Number) {
                kept.add(t);
            } else if (t instanceof Long) {
                kept.add(t.toNumber());
            } else {
                return false;
            }
        }
        Storage.setValue(KEY_TIMES, kept as Array<Storage.ValueType>);
        Storage.setValue(KEY_RECEIVED, Time.now().value());
        // The app's clock (Settings → Appearance) and the thermometer of
        // the place it is set to; absent from an older app's message.
        Storage.setValue(KEY_HOUR12, flag(data.get("h12") as Object?));
        Storage.setValue(KEY_FAHRENHEIT, flag(data.get("f") as Object?));
        // The app's accent, 0xRRGGBB on the watch's palette.
        var accent = data.get("a");
        if (accent instanceof Number && accent >= 0 && accent <= 0xFFFFFF) {
            Storage.setValue(KEY_ACCENT, accent);
        }
        return true;
    }

    // 1/true → 1, 0/false → 0, anything else (absent) → -1.
    function flag(v as Object?) as Number {
        if (v instanceof Boolean) {
            return v ? 1 : 0;
        }
        if (v instanceof Number) {
            return v != 0 ? 1 : 0;
        }
        return -1;
    }

    function storedFlag(key as String) as Number {
        var v = Storage.getValue(key);
        return v instanceof Number ? v : -1;
    }

    // The stored times, or null.
    function times() as Array<Number>? {
        var t = Storage.getValue(KEY_TIMES);
        if (t instanceof Array && t.size() >= PER_DAY) {
            return t as Array<Number>;
        }
        return null;
    }

    // When the last message came, epoch seconds, or 0.
    function receivedAt() as Number {
        var r = Storage.getValue(KEY_RECEIVED);
        return r instanceof Number ? r : 0;
    }
}

// The foreground's reading of the store.
(:background, :glance)
module Mihrab {
    const PER_DAY = MihrabStore.PER_DAY;

    // After this long without a message the times are shown as stale.
    const STALE_SECONDS = 3 * 24 * 3600;

    function times() as Array<Number>? {
        return MihrabStore.times();
    }

    // The next prayer at `now` (epoch seconds): [index into times, epoch],
    // or null when the stored times are all past (or there are none).
    function next(now as Number) as [Number, Number]? {
        var t = times();
        if (t == null) {
            return null;
        }
        for (var i = 0; i < t.size(); i++) {
            var at = t[i];
            if (at > 0 && at > now) {
                return [i, at];
            }
        }
        return null;
    }

    // The prayer whose time is last past at `now`: the one "now" belongs to.
    function current(now as Number) as [Number, Number]? {
        var t = times();
        if (t == null) {
            return null;
        }
        var found = null;
        for (var i = 0; i < t.size(); i++) {
            var at = t[i];
            if (at > 0 && at <= now) {
                found = [i, at];
            }
        }
        return found;
    }

    // The index of sunrise within a day.
    const SUNRISE = 1;

    // The name of the prayer (or sunrise) at an index into `times`, in the watch's
    // language. A table rather than string resources: the names are needed
    // in the background and the glance as well as on the page, and a
    // string resource lives in one scope only.
    function name(index as Number) as String {
        var names = NAMES[System.getDeviceSettings().systemLanguage];
        if (names == null) {
            names = NAMES[System.LANGUAGE_ENG] as Array<String>;
        }
        return (names as Array<String>)[index % PER_DAY];
    }

    const NAMES = {
        System.LANGUAGE_ENG => ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"],
        System.LANGUAGE_SWE => ["Fajr", "Soluppgång", "Dhuhr", "Asr", "Maghrib", "Isha"],
        System.LANGUAGE_DEU => ["Fadschr", "Sonnenaufgang", "Dhuhr", "Asr", "Maghrib", "Ischa"],
        System.LANGUAGE_FRE => ["Fajr", "Lever du soleil", "Dhuhr", "Asr", "Maghrib", "Isha"],
        System.LANGUAGE_SPA => ["Fayr", "Amanecer", "Dhuhr", "Asr", "Magrib", "Isha"],
        System.LANGUAGE_IND => ["Subuh", "Terbit", "Zuhur", "Asar", "Magrib", "Isya"],
        System.LANGUAGE_TUR => ["İmsak", "Güneş", "Öğle", "İkindi", "Akşam", "Yatsı"],
        System.LANGUAGE_RUS => ["Фаджр", "Восход", "Зухр", "Аср", "Магриб", "Иша"],
        System.LANGUAGE_ARA => ["الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"],
    } as Dictionary<Number, Array<String>>;

    // Whether the times are too old to trust (no message for days).
    function stale(now as Number) as Boolean {
        var r = MihrabStore.receivedAt();
        return r == 0 || now - r > STALE_SECONDS;
    }

    // Whether to write a 12-hour clock: as the Mihrab app does, once it
    // has said; before that, as the watch is set.
    function hour12() as Boolean {
        var f = MihrabStore.storedFlag(MihrabStore.KEY_HOUR12);
        return f == -1 ? !System.getDeviceSettings().is24Hour : f == 1;
    }

    // Whether the weather reads in Fahrenheit: where the app's place is
    // (the United States, Liberia and a few more), once it has said;
    // before that, as the watch is set.
    function fahrenheit() as Boolean {
        var f = MihrabStore.storedFlag(MihrabStore.KEY_FAHRENHEIT);
        return f == -1 ? System.getDeviceSettings().temperatureUnits == System.UNIT_STATUTE : f == 1;
    }

    // The app's accent as the phone sent it, else the app's green.
    function accent() as Number {
        var a = Storage.getValue(MihrabStore.KEY_ACCENT);
        return a instanceof Number ? a : 0x00AA55;
    }

    // The countdown in full, "05:49:12", hours, minutes and seconds.
    function hms(seconds as Number) as [String, String, String] {
        var safe = seconds < 0 ? 0 : seconds;
        return [(safe / 3600).format("%02d"), ((safe % 3600) / 60).format("%02d"), (safe % 60).format("%02d")];
    }

    // "16:42" or "4:42 pm", in the app's clock.
    function clock(epoch as Number) as String {
        var info = Gregorian.info(new Time.Moment(epoch), Time.FORMAT_SHORT);
        var hour = info.hour;
        var suffix = "";
        if (hour12()) {
            suffix = hour < 12 ? " am" : " pm";
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        return hour.format("%d") + ":" + info.min.format("%02d") + suffix;
    }

    // The seconds come in this close to the prayer — the last five minutes,
    // as the phone's Minimal page has it.
    const SECONDS_UNDER = 5 * 60;

    // The countdown as the phone's Minimal page writes it: "5h 49m", then
    // "49m", then inside the last five minutes "4m 37s" and "37s" — each
    // piece a figure and its unit letter, so a face can set the letters
    // small. Returns [[figure, unit], ...]; the seconds piece is last and
    // present only under SECONDS_UNDER.
    function pieces(seconds as Number) as Array<[String, String]> {
        var safe = seconds < 0 ? 0 : seconds;
        var h = safe / 3600;
        var m = (safe % 3600) / 60;
        var sec = safe % 60;
        var out = [] as Array<[String, String]>;
        if (safe < SECONDS_UNDER) {
            if (m > 0) {
                out.add([m.format("%d"), "m"]);
            }
            out.add([sec.format(m > 0 ? "%02d" : "%d"), "s"]);
            return out;
        }
        if (h > 0) {
            out.add([h.format("%d"), "h"]);
        }
        // Whole minutes, the seconds dropped — exactly as the phone's
        // Minimal page counts, so the two never disagree by a minute.
        out.add([m.format("%d"), "m"]);
        return out;
    }

    // The same as one string: "5h 49m", "4m 37s", "37s".
    function countdown(seconds as Number) as String {
        var ps = pieces(seconds);
        var text = "";
        for (var i = 0; i < ps.size(); i++) {
            text += (i > 0 ? " " : "") + ps[i][0] + ps[i][1];
        }
        return text;
    }

    // One unit only, for the narrowest places: "5h", "49m", "37s".
    function countdownOneUnit(seconds as Number) as String {
        var ps = pieces(seconds);
        var first = ps[0];
        return first[0] + first[1];
    }
}
