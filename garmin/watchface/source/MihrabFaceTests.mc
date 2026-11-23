// What the face's own fonts can write, and what goes to the watch's instead
// (MihrabFaceCover.mc, written by garmin/tools/facefont.py); and the
// arrangements the face keeps from one start to the next.
import Toybox.Lang;
import Toybox.Test;

(:test)
module MihrabFaceTests {
    (:test)
    function ownFontsWriteLatinGreekAndCyrillic(logger as Logger) as Boolean {
        Test.assert(MihrabFaceCover.holds("Thu 12 Nov · 8°"));
        Test.assert(MihrabFaceCover.holds("Soluppgång"));
        Test.assert(MihrabFaceCover.holds("Öğle İkindi Yatsı Güneş"));
        Test.assert(MihrabFaceCover.holds("Lever du soleil"));
        Test.assert(MihrabFaceCover.holds("Чт 12 нояб. Магриб"));
        Test.assert(MihrabFaceCover.holds("Πέμ. 12 Νοέμ"));
        Test.assert(MihrabFaceCover.holds(""));
        return true;
    }

    (:test)
    function wordsTheyCannotWriteGoToTheWatchsFont(logger as Logger) as Boolean {
        Test.assert(!MihrabFaceCover.holds("الفجر"));
        Test.assert(!MihrabFaceCover.holds("木 11月12日"));
        Test.assert(!MihrabFaceCover.holds("พฤ. 12 พ.ย."));
        // One character outside is enough.
        Test.assert(!MihrabFaceCover.holds("Asr العصر"));
        return true;
    }

    // The arrangements kept for the next start (MihrabFaceLayouts.mc).
    (:test)
    function keptArrangementsAreFoundByTheirKey(logger as Logger) as Boolean {
        var list = MihrabFaceLayouts.read([["a", 2, 3, 2, 8, 4, 0], ["b", 4, 2, 1, 0, 0, 0]]);
        Test.assertEqual(list.size(), 2);
        Test.assertEqual(MihrabFaceLayouts.find(list, "b"), 1);
        Test.assertEqual(MihrabFaceLayouts.find(list, "c"), -1);
        // Nothing kept yet, or something that is not a list of entries.
        Test.assertEqual(MihrabFaceLayouts.read(null).size(), 0);
        Test.assertEqual(MihrabFaceLayouts.read("a").size(), 0);
        // An entry of another shape is left out, and the rest are read.
        list = MihrabFaceLayouts.read([["a", 2, 3], ["b", 4, 2, 1, 0, 0, 0], [7, 4, 2, 1, 0, 0, 0], ["d", 4, 2, -1, 0, 0, 0], ["e", 4, 2, "1", 0, 0, 0]]);
        Test.assertEqual(list.size(), 1);
        Test.assertEqual(MihrabFaceLayouts.find(list, "b"), 0);
        return true;
    }

    (:test)
    function theNewestArrangementIsFirstAndTheOldestFallsOff(logger as Logger) as Boolean {
        var list = [] as Array<Array>;
        for (var i = 0; i < MihrabFaceLayouts.KEEP + 2; i++) {
            list = MihrabFaceLayouts.put(list, -1, ["k" + i.toString(), i, 1, 0, 0, 0, 0]);
        }
        Test.assertEqual(list.size(), MihrabFaceLayouts.KEEP);
        Test.assertEqual(MihrabFaceLayouts.find(list, "k7"), 0);
        Test.assertEqual(MihrabFaceLayouts.find(list, "k1"), -1);
        // One the face comes back to moves to the front, once.
        var at = MihrabFaceLayouts.find(list, "k4");
        list = MihrabFaceLayouts.put(list, at, list[at]);
        Test.assertEqual(list.size(), MihrabFaceLayouts.KEEP);
        Test.assertEqual(MihrabFaceLayouts.find(list, "k4"), 0);
        Test.assertEqual(MihrabFaceLayouts.find(list, "k7"), 1);
        return true;
    }
}
