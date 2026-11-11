// Run with `garmin/build.sh test`: the store, the next-prayer pick and the
// words, against the message the phone sends. Compiled in only with -t.
import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.Test;
import Toybox.Time;

(:test)
module MihrabTests {
    // Six times (the prayers and sunrise), two days, from a base instant.
    function sample(base as Number) as Dictionary {
        var t = [
            base + 5 * 3600, base + 7 * 3600, base + 12 * 3600, base + 15 * 3600, base + 18 * 3600, base + 20 * 3600,
            base + 29 * 3600, base + 31 * 3600, base + 36 * 3600, base + 39 * 3600, base + 42 * 3600, base + 44 * 3600,
        ];
        return { "v" => 2, "t" => t };
    }

    (:test)
    function storeKeepsAMessage(logger as Logger) as Boolean {
        Storage.clearValues();
        Test.assert(MihrabStore.store(sample(1000000)));
        var t = MihrabStore.times();
        Test.assert(t != null);
        Test.assertEqual(12, (t as Array<Number>).size());
        Test.assert(MihrabStore.receivedAt() > 0);
        return true;
    }

    (:test)
    function clockAndUnitsFollowThePhone(logger as Logger) as Boolean {
        Storage.clearValues();
        var base = 1000000;
        var m = sample(base);
        m.put("h12", 1);
        m.put("f", 0);
        MihrabStore.store(m);
        Test.assert(Mihrab.hour12());
        Test.assert(!Mihrab.fahrenheit());
        var c = Mihrab.clock(base);
        Test.assert(c.find("am") != null || c.find("pm") != null);
        m.put("h12", 0);
        m.put("f", 1);
        MihrabStore.store(m);
        Test.assert(!Mihrab.hour12());
        Test.assert(Mihrab.fahrenheit());
        Test.assert(Mihrab.clock(base).find("m") == null);
        return true;
    }

    (:test)
    function accentAndFullCountdown(logger as Logger) as Boolean {
        Storage.clearValues();
        Test.assertEqual(0x00AA55, Mihrab.accent());
        var m = sample(1000000);
        m.put("a", 0xFFAA00);
        MihrabStore.store(m);
        Test.assertEqual(0xFFAA00, Mihrab.accent());
        // As Gadgetbridge may deliver it: a Long or a Double, the flags too.
        m.put("a", 0x55AAFFl);
        m.put("h12", 1l);
        MihrabStore.store(m);
        Test.assertEqual(0x55AAFF, Mihrab.accent());
        Test.assert(Mihrab.hour12());
        m.put("a", 16755200.0d);
        MihrabStore.store(m);
        Test.assertEqual(0xFFAA00, Mihrab.accent());
        var t = Mihrab.hms(5 * 3600 + 49 * 60 + 12);
        Test.assertEqual("05", t[0]);
        Test.assertEqual("49", t[1]);
        Test.assertEqual("12", t[2]);
        var z = Mihrab.hms(-4);
        Test.assertEqual("00", z[0]);
        Test.assertEqual("00", z[2]);
        return true;
    }

    (:test)
    function storeRefusesJunk(logger as Logger) as Boolean {
        Storage.clearValues();
        Test.assert(!MihrabStore.store("hello"));
        Test.assert(!MihrabStore.store({ "v" => 1, "t" => [1, 2] }));
        Test.assert(!MihrabStore.store({ "v" => 2, "t" => [1, 2, 3, "x", 5, 6] }));
        // Version 1: five a day, no sunrise.
        Test.assert(!MihrabStore.store({ "v" => 1, "t" => [1, 2, 3, 4, 5, 6] }));
        // Not a whole number of days.
        Test.assert(!MihrabStore.store({ "v" => 2, "t" => [1, 2, 3, 4, 5, 6, 7] }));
        Test.assert(MihrabStore.times() == null);
        return true;
    }

    (:test)
    function nextIsTheFirstFutureTime(logger as Logger) as Boolean {
        Storage.clearValues();
        var base = 1000000;
        MihrabStore.store(sample(base));
        var n = Mihrab.next(base + 13 * 3600);
        Test.assert(n != null);
        Test.assertEqual(3, (n as [Number, Number])[0]);
        Test.assertEqual(base + 15 * 3600, (n as [Number, Number])[1]);
        // Past the last stored time there is no next.
        Test.assert(Mihrab.next(base + 50 * 3600) == null);
        // A 0 (a time that does not occur) is skipped.
        var m = sample(base);
        var mt = m["t"] as Array<Number>;
        mt[0] = 0;
        MihrabStore.store(m);
        var first = Mihrab.next(base);
        Test.assertEqual(1, (first as [Number, Number])[0]);
        // Sunrise is counted down to, after Fajr; off (0), it is skipped.
        MihrabStore.store(sample(base));
        Test.assertEqual(Mihrab.SUNRISE, (Mihrab.next(base + 6 * 3600) as [Number, Number])[0]);
        mt = m["t"] as Array<Number>;
        mt[0] = base + 5 * 3600;
        mt[1] = 0;
        MihrabStore.store(m);
        Test.assertEqual(2, (Mihrab.next(base + 6 * 3600) as [Number, Number])[0]);
        return true;
    }

    (:test)
    function namesCycleThroughTheDay(logger as Logger) as Boolean {
        Test.assertEqual(Mihrab.name(0), Mihrab.name(6));
        Test.assertEqual(Mihrab.name(5), Mihrab.name(11));
        Test.assertNotEqual(Mihrab.name(0), Mihrab.name(1));
        Test.assertNotEqual(Mihrab.name(Mihrab.SUNRISE), Mihrab.name(2));
        return true;
    }

    (:test)
    function countdownWords(logger as Logger) as Boolean {
        Test.assertEqual("2h 18m", Mihrab.countdown(2 * 3600 + 18 * 60));
        Test.assertEqual("1h 0m", Mihrab.countdown(3600));
        Test.assertEqual("18m", Mihrab.countdown(18 * 60));
        // Whole minutes, as the phone counts: 17 minutes 59 seconds is 17m.
        Test.assertEqual("17m", Mihrab.countdown(17 * 60 + 59));
        Test.assertEqual("2h 18m", Mihrab.countdown(2 * 3600 + 18 * 60 + 59));
        Test.assertEqual("5m", Mihrab.countdown(5 * 60));
        // The last five minutes tick in seconds, as the phone's Minimal page.
        Test.assertEqual("4m 59s", Mihrab.countdown(5 * 60 - 1));
        Test.assertEqual("1m 05s", Mihrab.countdown(65));
        Test.assertEqual("37s", Mihrab.countdown(37));
        Test.assertEqual("0s", Mihrab.countdown(-5));
        // One unit, for the narrowest places.
        Test.assertEqual("2h", Mihrab.countdownOneUnit(2 * 3600 + 18 * 60));
        Test.assertEqual("18m", Mihrab.countdownOneUnit(18 * 60));
        Test.assertEqual("4m", Mihrab.countdownOneUnit(4 * 60 + 59));
        Test.assertEqual("37s", Mihrab.countdownOneUnit(37));
        return true;
    }

    (:test)
    function staleAfterDaysWithoutAMessage(logger as Logger) as Boolean {
        Storage.clearValues();
        Test.assert(Mihrab.stale(Time.now().value()));
        MihrabStore.store(sample(1000000));
        var now = Time.now().value();
        Test.assert(!Mihrab.stale(now));
        Test.assert(Mihrab.stale(now + 4 * 24 * 3600));
        return true;
    }

    // The second message (Mihrab.mc): what to show, the Hijri dates, the
    // night marks — and that it leaves the times of the first alone.
    (:test)
    function extrasAreKeptBesideTheTimes(logger as Logger) as Boolean {
        Storage.clearValues();
        // A whole minute, as every time the phone sends is: a night mark's
        // kind rides in the seconds' place.
        var base = 999960;
        Test.assert(MihrabStore.store(sample(base)));
        Test.assertEqual(0, MihrabStore.options());
        Test.assertEqual(0, Mihrab.dateStyle());
        var noon = base + 12 * 3600;
        // Hide the steps, both dates, the field's bar; three days of Hijri
        // dates across a month's end; midnight and the last third tonight.
        var x = {
            "v" => 2, "x" => 1,
            "o" => MihrabStore.OPT_NO_STEPS | (2 << MihrabStore.OPT_DATE_SHIFT) | MihrabStore.OPT_FIELD_PROGRESS,
            "hj" => [noon, 29, 6, 1448, 30, 6, 1448, 1, 7, 1448],
            "n" => [base + 26 * 3600 + MihrabStore.NIGHT_LAST_THIRD, base + 23 * 3600 + MihrabStore.NIGHT_MIDNIGHT],
        };
        Test.assert(MihrabStore.store(x));
        Test.assertEqual(12, (MihrabStore.times() as Array<Number>).size());
        Test.assert(Mihrab.option(MihrabStore.OPT_NO_STEPS));
        Test.assert(!Mihrab.option(MihrabStore.OPT_NO_WEATHER));
        Test.assert(Mihrab.option(MihrabStore.OPT_FIELD_PROGRESS));
        Test.assertEqual(2, Mihrab.dateStyle());

        var h = MihrabStore.hijri(base + 10 * 3600) as [Number, Number, Number];
        Test.assertEqual(29, h[0]);
        h = MihrabStore.hijri(base + 30 * 3600) as [Number, Number, Number];
        Test.assertEqual(30, h[0]);
        h = MihrabStore.hijri(base + 50 * 3600) as [Number, Number, Number];
        Test.assertEqual(1, h[0]);
        Test.assertEqual(7, h[1]);
        // Past the days sent, and before them: none, not the nearest.
        Test.assert(MihrabStore.hijri(base + 80 * 3600) == null);
        Test.assert(MihrabStore.hijri(base - 3600) == null);
        Test.assert((MihrabHijri.text(base + 10 * 3600, false) as String).find("29") != null);

        // Soonest first, whatever order they came in; past ones dropped.
        var marks = MihrabStore.nightMarks(base + 20 * 3600);
        Test.assertEqual(2, marks.size());
        Test.assertEqual(MihrabStore.NIGHT_MIDNIGHT, marks[0][0]);
        Test.assertEqual(base + 23 * 3600, marks[0][1]);
        Test.assertEqual(MihrabStore.NIGHT_LAST_THIRD, marks[1][0]);
        Test.assertEqual(1, MihrabStore.nightMarks(base + 24 * 3600).size());
        Test.assertEqual(0, MihrabStore.nightMarks(base + 27 * 3600).size());

        // A second message with only the options leaves the rest.
        Test.assert(MihrabStore.store({ "v" => 2, "x" => 1, "o" => 0 }));
        Test.assertEqual(0, MihrabStore.options());
        Test.assert(MihrabStore.hijri(base + 10 * 3600) != null);
        return true;
    }

    (:test)
    function progressRunsFromTheLastTimeToTheNext(logger as Logger) as Boolean {
        Storage.clearValues();
        var base = 1000000;
        MihrabStore.store(sample(base));
        // Before the first time there is nothing to measure from.
        Test.assertEqual(0, Mihrab.progress(base));
        // Dhuhr at +12h, Asr at +15h.
        Test.assertEqual(0, Mihrab.progress(base + 12 * 3600));
        Test.assertEqual(500, Mihrab.progress(base + 13 * 3600 + 1800));
        Test.assertEqual(999, Mihrab.progress(base + 15 * 3600 - 10));
        return true;
    }
}

// Leaves today's times in Storage (Stockholm, early November), so the face
// can be looked at in the simulator after `build.sh test`: the simulator
// keeps an app's Storage between runs.
(:test)
module MihrabSeed {
    (:test)
    function seedToday(logger as Logger) as Boolean {
        var now = Time.now().value();
        var midnight = now - (now % 86400);
        var t = [] as Array<Number>;
        for (var d = 0; d < 4; d++) {
            var b = midnight + d * 86400;
            t.add(b + 5 * 3600 + 32 * 60);
            t.add(b + 7 * 3600 + 18 * 60);
            t.add(b + 11 * 3600 + 39 * 60);
            t.add(b + 13 * 3600 + 24 * 60);
            t.add(b + 15 * 3600 + 5 * 60);
            t.add(b + 17 * 3600 + 2 * 60);
        }
        Test.assert(MihrabStore.store({ "v" => 2, "t" => t }));
        return true;
    }
}
