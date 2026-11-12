// What the face's own fonts can write, and what goes to the watch's instead
// (MihrabFaceCover.mc, written by garmin/tools/facefont.py).
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
}
