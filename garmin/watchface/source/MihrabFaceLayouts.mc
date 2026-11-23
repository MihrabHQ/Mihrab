// The arrangements the face has found, kept so that a start does not
// search again (MihrabFaceView.mc, `arrange`): a short list in Storage,
// newest first, each
//
//   [ key, clock, rank 2, rank 3, above, below, forced ]
//
// — what the face showed (its key), and what the search came to for it:
// the clock's font, the two ranks' sizes, how far the gaps above and
// below the clock were opened, and 1 where nothing fitted and the
// smallest was kept regardless. A few are kept rather than one because a
// face goes back and forth between a few shapes — the temperature a
// degree up and down again, a message that comes and goes.
import Toybox.Lang;

module MihrabFaceLayouts {
    const KEEP = 6;
    const FIELDS = 7;

    // What Storage held, as a list of whole entries: anything that is not
    // one — nothing kept yet, another build's shape — is left out.
    function read(stored as Object?) as Array<Array> {
        var out = [] as Array<Array>;
        if (!(stored instanceof Array)) {
            return out;
        }
        for (var i = 0; i < stored.size() && out.size() < KEEP; i++) {
            var e = stored[i] as Object?;
            if (whole(e)) {
                out.add(e as Array);
            }
        }
        return out;
    }

    // A key and six numbers, none of them negative.
    function whole(e as Object?) as Boolean {
        if (!(e instanceof Array) || e.size() != FIELDS || !(e[0] instanceof String)) {
            return false;
        }
        for (var i = 1; i < FIELDS; i++) {
            var n = e[i];
            if (!(n instanceof Number) || n < 0) {
                return false;
            }
        }
        return true;
    }

    // Where the entry for a key is, or -1.
    function find(list as Array<Array>, key as String) as Number {
        for (var i = 0; i < list.size(); i++) {
            if (key.equals(list[i][0] as Object?)) {
                return i;
            }
        }
        return -1;
    }

    // The list with `entry` first, the one at `drop` (-1: none) gone, and
    // no more than KEEP in all: the oldest falls off the end.
    function put(list as Array<Array>, drop as Number, entry as Array) as Array<Array> {
        var out = [entry] as Array<Array>;
        for (var i = 0; i < list.size() && out.size() < KEEP; i++) {
            if (i != drop) {
                out.add(list[i]);
            }
        }
        return out;
    }
}
