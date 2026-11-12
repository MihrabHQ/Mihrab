// Written by garmin/tools/facefont.py — not by hand.
//
// The characters the face's own Text fonts hold, as [first, last] pairs in
// order. A line with a character outside them — Arabic, Greek, Thai — is
// written in the watch's own font instead (MihrabFaceView.mc, `pixelRows`).
import Toybox.Lang;

module MihrabFaceCover {
    const RANGES = [0x20, 0x7E, 0xA0, 0xAC, 0xAE, 0x148, 0x14A, 0x17F, 0x218, 0x21B, 0x374, 0x375, 0x37E, 0x37E, 0x384, 0x38A, 0x38C, 0x38C, 0x38E, 0x3A1, 0x3A3, 0x3CF, 0x3D5, 0x3D5, 0x3D7, 0x3D7, 0x400, 0x45F, 0x490, 0x491, 0x2013, 0x2014, 0x2019, 0x2019, 0x2026, 0x2026, 0x2212, 0x2212] as Array<Number>;

    // Whether every character of the text is in the Text fonts.
    function holds(text as String) as Boolean {
        var chars = text.toCharArray();
        var n = RANGES.size();
        for (var i = 0; i < chars.size(); i++) {
            var c = chars[i].toNumber();
            var ok = false;
            for (var r = 0; r < n && !ok; r += 2) {
                if (c < RANGES[r]) {
                    break;
                }
                ok = c <= RANGES[r + 1];
            }
            if (!ok) {
                return false;
            }
        }
        return true;
    }
}
