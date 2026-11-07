// Run with `garmin/build.sh test`: the store, the next-prayer pick and the
// words, against the message the phone sends. Compiled in only with -t.
import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.Test;
import Toybox.Time;

(:test)
module MihrabTests {
    // Five prayers, two days, from a base instant.
    function sample(base as Number) as Dictionary {
        var t = [
            base + 5 * 3600, base + 12 * 3600, base + 15 * 3600, base + 18 * 3600, base + 20 * 3600,
            base + 29 * 3600, base + 36 * 3600, base + 39 * 3600, base + 42 * 3600, base + 44 * 3600,
        ];
        return { "v" => 1, "t" => t };
    }

    (:test)
    function storeKeepsAMessage(logger as Logger) as Boolean {
        Storage.clearValues();
        Test.assert(MihrabStore.store(sample(1000000)));
        var t = MihrabStore.times();
        Test.assert(t != null);
        Test.assertEqual(10, (t as Array<Number>).size());
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
    function storeRefusesJunk(logger as Logger) as Boolean {
        Storage.clearValues();
        Test.assert(!MihrabStore.store("hello"));
        Test.assert(!MihrabStore.store({ "v" => 1, "t" => [1, 2] }));
        Test.assert(!MihrabStore.store({ "v" => 1, "t" => [1, 2, 3, "x", 5] }));
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
        Test.assertEqual(2, (n as [Number, Number])[0]);
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
        return true;
    }

    (:test)
    function namesCycleThroughTheDay(logger as Logger) as Boolean {
        Test.assertEqual(Mihrab.name(0), Mihrab.name(5));
        Test.assertEqual(Mihrab.name(4), Mihrab.name(9));
        Test.assertNotEqual(Mihrab.name(0), Mihrab.name(1));
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
            t.add(b + 11 * 3600 + 39 * 60);
            t.add(b + 13 * 3600 + 24 * 60);
            t.add(b + 15 * 3600 + 5 * 60);
            t.add(b + 17 * 3600 + 2 * 60);
        }
        Test.assert(MihrabStore.store({ "v" => 1, "t" => t }));
        return true;
    }
}
