// The face, drawn for a MIP screen: solid ink on black, no gradients, no
// anti-aliased fills, nothing animating but what must — the seconds and,
// inside the last five minutes, the countdown. Those are redrawn every
// second inside their own clips (a partial update); everything else once
// a minute.
//
//            Sat 7 Nov                  the date
//           👣 004532                   today's steps
//   ☁ 8°                  am
//   16°/7°   16:42        07            the weather · the time · the seconds
//            ━━━──                      the battery, as wide as the figures
//          Asr  16:42                   the next prayer
//            5h 49m                     the countdown as Minimal writes it
//      times may be out of date         after days without the phone
//
// Laid out, not placed: every row's fonts are chosen and the rows stacked
// so that each one's ink — measured for the widest thing it can show, not
// what it shows now — lies inside the dial. The search gives the clock the
// largest font first, then the prayer and its countdown, then the rest;
// the first arrangement in which everything fits is kept until what the
// face shows changes its shape (another language, a message, the weather).
//
import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;
import Toybox.Weather;

class MihrabFaceView extends WatchUi.WatchFace {
    private const INK = Graphics.COLOR_WHITE;
    private const DIM = Graphics.COLOR_LT_GRAY;
    private const RULE = Graphics.COLOR_DK_GRAY;
    private const SUN = Graphics.COLOR_YELLOW;

    // The weather and footprint icons' box, square.
    private const ICON = 16;
    // Between rows, and between the time and its side columns.
    private const ROW_GAP = 4;
    // Between the steps' row and the clock, as much of these as fits, the
    // largest first: the clock stands apart from the rows above it.
    private var _clockGaps as Array<Number> = [18, 14, 11] as Array<Number>;
    private var _clockGap as Number = 4;
    // The least room above the clock a clock size may leave: a size that
    // fits only by touching the steps' row is a size too large.
    private const MIN_CLOCK_GAP = 8;
    private const SIDE_GAP = 4;
    // Kept clear of the dial's edge, inside the ring.
    private const EDGE = 7;
    // The ring round the edge: its radius in from the edge, its width.
    private const RING_IN = 3;
    private const RING_PEN = 4;
    // The battery bar under the time, thick enough to read its colour.
    private const RULE_PEN = 3;
    // The bar under the time sits this far below its baseline: the
    // clock's own figures have no descent, so close under them.
    private const RULE_DROP = 3;
    // What the rows under the clock start below its baseline, less the
    // row gap: the room the plain rule under the time took before it was
    // the battery, kept so that nothing under it moved.
    private const UNDER_CLOCK = 7;

    // Weather icon kinds.
    private const W_SUN = 0;
    private const W_PARTLY = 1;
    private const W_CLOUD = 2;
    private const W_RAIN = 3;
    private const W_SNOW = 4;
    private const W_SLEET = 5;
    private const W_STORM = 6;
    private const W_FOG = 7;
    private const W_WIND = 8;

    // The candidates, best first. The clock's figures:
    // The app's Roboto figures, tallest first (garmin/tools/clockfont.py),
    // then Garmin's smallest number font should none fit.
    private var _clockFontIds as Array<ResourceId> = [
        Rez.Fonts.Clock76, Rez.Fonts.Clock70, Rez.Fonts.Clock64, Rez.Fonts.Clock60, Rez.Fonts.Clock56,
        Rez.Fonts.Clock53, Rez.Fonts.Clock50, Rez.Fonts.Clock47, Rez.Fonts.Clock44, Rez.Fonts.Clock40
    ] as Array<ResourceId>;
    // The prayer line and the countdown's figures; or, with no prayer to
    // show, the message's font and how many lines it may take.
    private var _mihrabFonts as Array<[Graphics.FontType, Graphics.FontType]> = [
        [Graphics.FONT_SMALL, Graphics.FONT_MEDIUM],
        [Graphics.FONT_SMALL, Graphics.FONT_MEDIUM],
        [Graphics.FONT_TINY, Graphics.FONT_MEDIUM],
        [Graphics.FONT_TINY, Graphics.FONT_SMALL],
        [Graphics.FONT_XTINY, Graphics.FONT_TINY]
    ] as Array<[Graphics.FontType, Graphics.FontType]>;
    private var _messageFonts as Array<[Graphics.FontType, Number]> = [
        [Graphics.FONT_SMALL, 1], [Graphics.FONT_TINY, 1], [Graphics.FONT_SMALL, 2],
        [Graphics.FONT_TINY, 2], [Graphics.FONT_XTINY, 2], [Graphics.FONT_XTINY, 3]
    ] as Array<[Graphics.FontType, Number]>;
    // The rest: date, the stale message, the weather now, the small side text (high
    // and low, am/pm), the seconds, the steps.
    private var _otherFonts as Array<Array<Graphics.FontType>> = [
        [Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_SMALL],
        [Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_TINY],
        [Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_TINY],
        [Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY]
    ] as Array<Array<Graphics.FontType>>;

    // What the face shows this minute.
    private var _w as Number = 0;
    private var _h as Number = 0;
    private var _dateText as String = "";
    private var _staleText as String? = null;
    private var _hour12 as Boolean = false;
    private var _hourText as String = "";
    private var _weather as Array = [-1, "--", "", 0];
    private var _next as [Number, Number]? = null;
    private var _reasonText as String? = null;
    // The options from the phone (Mihrab.face()), and what they say.
    private var _face as Number = 0;
    private var _seconds as Boolean = true;
    private var _weatherOn as Boolean = true;
    private var _shortCount as Boolean = false;
    private var _row as Number = 0;

    // The layout, and what it was made for.
    private var _key as String = "";
    private var _fDate as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fStale as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fClock as Graphics.FontType = Graphics.FONT_NUMBER_MILD;
    private var _fNow as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fSide as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fSeconds as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fSteps as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fPrayer as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fCount as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fMessage as Graphics.FontType = Graphics.FONT_XTINY;
    private var _staleLines as Array<String>? = null;
    private var _reasonLines as Array<String>? = null;
    // Baselines of the rows (a message's: its first line's).
    private var _bDate as Number = 0;
    private var _bStale as Number = 0;
    private var _bClock as Number = 0;
    private var _bPrayer as Number = 0;
    private var _bCount as Number = 0;
    private var _bSteps as Number = 0;
    // The side columns' widths and offsets above the clock's baseline.
    private var _leftW as Number = 0;
    private var _rightW as Number = 0;
    private var _upperOff as Number = 0;
    private var _suffixOff as Number = 0;
    // The weather beside the clock, or on the steps' row.
    private var _weatherBeside as Boolean = true;

    // Where the moving parts were last drawn: [x, y, w, h].
    private var _countdownBox as [Number, Number, Number, Number]?;
    private var _secondsBox as [Number, Number, Number, Number]?;

    function initialize() {
        WatchFace.initialize();
    }

    function onLayout(dc as Dc) as Void {
    }

    function onShow() as Void {
    }

    function onHide() as Void {
    }

    function onExitSleep() as Void {
    }

    function onEnterSleep() as Void {
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) as Void {
        _w = dc.getWidth();
        _h = dc.getHeight();
        var cx = _w / 2;

        if (dc has :clearClip) {
            dc.clearClip();
        }
        dc.setColor(INK, Graphics.COLOR_BLACK);
        dc.clear();
        _countdownBox = null;
        _secondsBox = null;

        var nowMoment = Time.now();
        var now = nowMoment.value();
        var clock = System.getClockTime();

        // What to show.
        var date = Gregorian.info(nowMoment, Time.FORMAT_MEDIUM);
        _dateText = date.day_of_week + " " + date.day.format("%d") + " " + date.month;
        _staleText = Mihrab.stale(now) ? WatchUi.loadResource(Rez.Strings.Stale) as String : null;
        _hour12 = Mihrab.hour12();
        var hour = clock.hour;
        var suffix = null;
        if (_hour12) {
            suffix = hour < 12 ? "am" : "pm";
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        _hourText = hour.format("%d");
        _face = Mihrab.face();
        _seconds = (_face & Mihrab.FACE_NO_SECONDS) == 0;
        _weatherOn = (_face & Mihrab.FACE_NO_WEATHER) == 0;
        _shortCount = (_face & Mihrab.FACE_SHORT) != 0;
        _row = Mihrab.faceRow(_face);
        _weather = _weatherOn ? weatherParts(nowMoment) : [-1, "", "", 0];
        _next = Mihrab.next(now);
        _reasonText = null;
        if (_next == null) {
            _reasonText = WatchUi.loadResource(Mihrab.times() == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded) as String;
            // Which already says to open the app: no word about old times too.
            _staleText = null;
        }

        var key = (_w.toString() + "|" + _dateText + "|" + (_staleText == null ? "" : _staleText) + "|" + (_hour12 ? "12" : "24")
            + "|" + _hourText.length().toString() + "|" + (_weather[0] as Number).toString() + "|" + (_weather[1] as String)
            + "|" + (_weather[2] as String) + "|" + (_reasonText == null ? "" : _reasonText)
            + "|" + System.getDeviceSettings().systemLanguage.toString() + "|" + _face.toString()) as String;
        if (!key.equals(_key)) {
            layout(dc);
            _key = key;
        }

        var accent = Mihrab.accent();

        // The ring: the way from the last prayer to the next, in the
        // app's accent, as the app's own track draws it.
        if ((_face & Mihrab.FACE_NO_RING) == 0) {
            drawRing(dc, now, accent);
        }

        // The date.
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        drawRow(dc, _dateText, _fDate, _bDate);

        // At the foot, after days without the phone, a word about that.
        var staleLines = _staleLines;
        if (_staleText != null && staleLines != null) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            drawLines(dc, staleLines, _fStale, _bStale);
        }

        // The time with the weather and the seconds, and the battery under
        // the figures as wide as they are.
        var figures = drawClock(dc, clock.min.format("%02d"), clock.sec, suffix, accent);
        drawBattery(dc, figures[0], figures[1] + 1, accent);

        // The next prayer and the countdown, or why there is none.
        var next = _next;
        var reasonLines = _reasonLines;
        if (next != null) {
            drawPrayer(dc, Mihrab.name(next[0]), Mihrab.clock(next[1]), accent);
            drawCountdown(dc, next[1] - now, accent);
        } else if (reasonLines != null) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            drawLines(dc, reasonLines, _fMessage, _bPrayer);
        }

        // Today's steps, or the heart rate, or only the weather if it is there.
        drawSteps(dc, accent);
    }

    // Every second between the minute's full draws: the seconds and the
    // countdown.
    function onPartialUpdate(dc as Dc) as Void {
        var sbox = _secondsBox;
        if (sbox != null) {
            dc.setClip(sbox[0], sbox[1], sbox[2], sbox[3]);
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
            dc.clear();
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(sbox[0], _bClock - Graphics.getFontAscent(_fSeconds), _fSeconds, System.getClockTime().sec.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
            dc.clearClip();
        }
        var box = _countdownBox;
        if (box == null) {
            return;
        }
        var now = Time.now().value();
        var next = Mihrab.next(now);
        if (next == null) {
            return;
        }
        // The short countdown counts whole minutes until its last five,
        // which the minute's full draw keeps: nothing to do every second.
        if (_shortCount && next[1] - now > Mihrab.SECONDS_UNDER + 60) {
            return;
        }
        dc.setClip(box[0], box[1], box[2], box[3]);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        drawCountdown(dc, next[1] - now, Mihrab.accent());
        dc.clearClip();
    }

    // ---- Measuring ----

    // How far a font's figures reach above the baseline: its whole
    // ascent. Garmin's own fonts are not the same on every firmware — an
    // Enduro 3 draws them larger than the simulator's copies, with the
    // figures filling more of the ascent — so no share of it measured on
    // one is trusted on another. The clock's own figures (clockfont.py)
    // have no room above them, so for them the ascent is the ink.
    private function figuresUp(f as Graphics.FontType) as Number {
        return Graphics.getFontAscent(f);
    }

    // The clock's candidate c: one of the app's figures, loaded, or past
    // them Garmin's smallest number font.
    private function clockFont(c as Number) as Graphics.FontType {
        if (c < _clockFontIds.size()) {
            return WatchUi.loadResource(_clockFontIds[c]) as Graphics.FontReference;
        }
        return Graphics.FONT_NUMBER_MILD;
    }

    private function textW(dc as Dc, s as String, f as Graphics.FontType) as Number {
        return dc.getTextWidthInPixels(s, f);
    }

    // The text as lines no wider than maxW, at most maxLines of them, or
    // null when it cannot be (a word wider than a line, too many lines).
    private function wrap(dc as Dc, text as String, f as Graphics.FontType, maxW as Number, maxLines as Number) as Array<String>? {
        if (maxW <= 0) {
            return null;
        }
        if (textW(dc, text, f) <= maxW) {
            return [text];
        }
        var lines = [] as Array<String>;
        var line = "";
        var rest = text;
        while (rest.length() > 0) {
            var sp = rest.find(" ");
            var word = sp == null ? rest : rest.substring(0, sp) as String;
            rest = sp == null ? "" : rest.substring(sp + 1, rest.length()) as String;
            if (word.length() == 0) {
                continue;
            }
            if (textW(dc, word, f) > maxW) {
                return null;
            }
            var joined = line.length() == 0 ? word : line + " " + word;
            if (textW(dc, joined, f) <= maxW) {
                line = joined;
            } else {
                lines.add(line);
                line = word;
            }
        }
        if (line.length() > 0) {
            lines.add(line);
        }
        return lines.size() <= maxLines ? lines : null;
    }

    // ---- Laying out ----
    //
    // A box of half-width hw lies inside a round dial of radius r exactly
    // while its top and bottom are within sqrt(r² − hw²) of the middle:
    // so each box allows a range of heights for the stack, and the stack
    // fits where all the ranges meet. One pass per arrangement, no trying
    // heights one by one.

    private var _round as Boolean = true;
    private var _lo as Number = 0;
    private var _hi as Number = 0;

    private function abs(n as Number) as Number {
        return n < 0 ? -n : n;
    }

    // Narrows the stack's range of starting heights so that a box of
    // half-width hw, from top to bottom (relative to the stack's start),
    // lies inside the dial. False once the range is empty.
    private function fit(hw as Number, top as Number, bottom as Number) as Boolean {
        var r = _w / 2 - EDGE;
        if (hw > r) {
            return false;
        }
        var reach = _round ? Math.sqrt(r * r - hw * hw).toNumber() : _h / 2 - EDGE;
        var cy = _h / 2;
        var lo = cy - reach - top;
        var hi = cy + reach - bottom;
        if (lo > _lo) {
            _lo = lo;
        }
        if (hi < _hi) {
            _hi = hi;
        }
        return _lo <= _hi;
    }

    // The text in at most maxLines lines, as narrow as that allows (a
    // narrow block fits further from the middle of a round dial than one
    // line as wide as the dial), or null when it will not go into them.
    private function balanced(dc as Dc, text as String, f as Graphics.FontType, full as Number, maxLines as Number) as Array<String>? {
        var best = wrap(dc, text, f, full, maxLines);
        if (best == null) {
            return null;
        }
        var w = widest(dc, best, f) - 6;
        while (w > 0) {
            var lines = wrap(dc, text, f, w, maxLines);
            if (lines == null) {
                break;
            }
            best = lines;
            w = widest(dc, lines, f) - 6;
        }
        return best;
    }

    // The widest of a text's wrapped lines.
    private function widest(dc as Dc, lines as Array<String>, f as Graphics.FontType) as Number {
        var w = 0;
        for (var i = 0; i < lines.size(); i++) {
            var lw = textW(dc, lines[i], f);
            w = lw > w ? lw : w;
        }
        return w;
    }

    // Measures every candidate once, then tries the arrangements best
    // first — the clock's font, then the prayer's, then the rest — and
    // keeps the first in which every row lies inside the dial. Should
    // none, the smallest of all is kept, placed as well as it can be.
    private function layout(dc as Dc) as Void {
        _round = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
        var full = 2 * (_w / 2 - EDGE);
        var hasNext = _next != null;

        // The clock: [figures' width for this hour and the widest minutes, their height].
        // Each loaded only to be measured; the one kept is loaded again.
        var clocks = [] as Array<Array<Number>>;
        for (var c = 0; c <= _clockFontIds.size(); c++) {
            var f = clockFont(c);
            clocks.add([textW(dc, _hourText + ":88", f), figuresUp(f)]);
        }

        // The prayer: [line up, down, width, countdown up, width] for the
        // widest name and time and "88h 88m"; or the message: [up, down,
        // width, lines], null where it will not wrap into its lines.
        var mihrab = [] as Array<Array?>;
        if (hasNext) {
            for (var m = 0; m < _mihrabFonts.size(); m++) {
                var fP = _mihrabFonts[m][0];
                var fC = _mihrabFonts[m][1];
                var nameW = 0;
                for (var i = 0; i < Mihrab.PER_DAY; i++) {
                    var nw = textW(dc, Mihrab.name(i), fP);
                    nameW = nw > nameW ? nw : nameW;
                }
                var prayerW = nameW + textW(dc, "  " + (_hour12 ? "88:88 pm" : "88:88"), fP);
                var countW = textW(dc, _shortCount ? "88h 88m" : "88:88:88", fC);
                mihrab.add([Graphics.getFontAscent(fP), Graphics.getFontDescent(fP), prayerW, figuresUp(fC), countW]);
            }
        } else {
            for (var m = 0; m < _messageFonts.size(); m++) {
                var fM = _messageFonts[m][0];
                var lines = balanced(dc, _reasonText as String, fM, full, _messageFonts[m][1]);
                if (lines == null) {
                    mihrab.add(null);
                } else {
                    var lineH = Graphics.getFontAscent(fM) + Graphics.getFontDescent(fM);
                    mihrab.add([Graphics.getFontAscent(fM), (lines.size() - 1) * lineH + Graphics.getFontDescent(fM), widest(dc, lines, fM), lines]);
                }
            }
        }

        // The rest, per candidate: see measureOthers.
        var others = [] as Array<Array>;
        for (var o = 0; o < _otherFonts.size(); o++) {
            others.add(measureOthers(dc, _otherFonts[o], full));
        }

        // The weather beside the clock first; on the steps' row when that
        // lets the clock be larger. A smaller font never makes a row harder
        // to fit, so an arrangement is tried only once the same with the
        // smallest of everything after it has fitted: a clock too large
        // costs a few tries, not every arrangement under it.
        var lastM = mihrab.size() - 1;
        while (lastM > 0 && mihrab[lastM] == null) {
            lastM--;
        }
        var lastO = others.size() - 1;
        _clockGap = MIN_CLOCK_GAP;
        for (var c = 0; c < clocks.size(); c++) {
            // A message on more lines is narrower but taller, so for the
            // clock's own try every prayer or message arrangement is tried
            // with the smallest of the rest.
            var any = false;
            for (var m = 0; m < mihrab.size() && !any; m++) {
                any = tries(c, m, lastO, -1, clocks[c], mihrab, others);
            }
            if (!any) {
                continue;
            }
            for (var m = 0; m < mihrab.size(); m++) {
                if (mihrab[m] == null || !tries(c, m, lastO, -1, clocks[c], mihrab, others)) {
                    continue;
                }
                for (var beside = 1; beside >= 0; beside--) {
                    if (!tries(c, m, lastO, beside, clocks[c], mihrab, others)) {
                        continue;
                    }
                    for (var o = 0; o < others.size(); o++) {
                        var staleVariants = others[o][15] as Array;
                        for (var s = 0; s < staleVariants.size(); s++) {
                            if (staleVariants[s] == null && _staleText != null) {
                                continue;
                            }
                            if (place(c, m, o, s, beside == 1, clocks[c], mihrab[m] as Array, others[o], false, false)) {
                                // The arrangement fits. Now room above the
                                // clock: the largest gap that fits, the rows
                                // above in a smaller font if that is what it
                                // takes, rather than the clock crowded.
                                var keepO = o;
                                for (var g = 0; g < _clockGaps.size(); g++) {
                                    _clockGap = _clockGaps[g];
                                    var found = false;
                                    for (var o2 = o; o2 < others.size() && !found; o2++) {
                                        if ((others[o2][15] as Array)[s] == null && _staleText != null) {
                                            continue;
                                        }
                                        if (place(c, m, o2, s, beside == 1, clocks[c], mihrab[m] as Array, others[o2], false, false)) {
                                            keepO = o2;
                                            found = true;
                                        }
                                    }
                                    if (found) {
                                        break;
                                    }
                                    _clockGap = MIN_CLOCK_GAP;
                                }
                                place(c, m, keepO, s, beside == 1, clocks[c], mihrab[m] as Array, others[keepO], false, true);
                                _clockGap = ROW_GAP;
                                return;
                            }
                        }
                    }
                }
            }
        }
        // Nothing fits: the smallest of everything, as near the middle as
        // it can be, the messages on one line however wide.
        _clockGap = ROW_GAP;
        var mm = mihrab[lastM];
        if (mm == null) {
            var fM = _messageFonts[lastM][0];
            mm = [Graphics.getFontAscent(fM), Graphics.getFontDescent(fM), textW(dc, _reasonText as String, fM), [_reasonText as String]];
        }
        place(clocks.size() - 1, lastM, lastO, 0, false, clocks[clocks.size() - 1], mm as Array, others[lastO], true, true);
    }

    // Whether anything fits with this clock, these prayer fonts and these
    // others — the weather beside (1), on the steps' row (0) or either
    // (-1) — trying every stale variant, keeping nothing.
    private function tries(c as Number, m as Number, o as Number, beside as Number, cm as Array<Number>, mihrab as Array<Array?>, others as Array<Array>) as Boolean {
        var mm = mihrab[m];
        if (mm == null) {
            return false;
        }
        var staleVariants = others[o][15] as Array;
        for (var b = 1; b >= 0; b--) {
            if (beside != -1 && beside != b) {
                continue;
            }
            for (var s = 0; s < staleVariants.size(); s++) {
                if (staleVariants[s] == null && _staleText != null) {
                    continue;
                }
                if (place(c, m, o, s, b == 1, cm, mm as Array, others[o], false, false)) {
                    return true;
                }
            }
        }
        return false;
    }

    // The date, the stale message, the side columns and the steps in one
    // set of fonts: [date up, down, width, the weather's width on the steps' row,
    // its up * 1000 + down there, left width, left up, upper offset, right width, right up,
    // suffix offset, steps up, down, width, stale line height, stale
    // variants ([up, down, width, lines] for one and two lines, null where
    // it will not wrap)].
    private function measureOthers(dc as Dc, fonts as Array<Graphics.FontType>, full as Number) as Array {
        var fDate = fonts[0];
        var fStale = fonts[1];
        var fNow = fonts[2];
        var fSide = fonts[3];
        var fSeconds = fonts[4];
        var fSteps = fonts[5];

        // The weather, for its text now or "88°" and "88°/88°", whichever
        // is wider, so a change of a degree does not move the clock.
        var kind = _weather[0] as Number;
        var nowText = _weather[1] as String;
        var rangeText = _weather[2] as String;
        var nowW = textW(dc, nowText, fNow);
        if (!nowText.equals("--")) {
            var sample = textW(dc, "88°", fNow);
            nowW = nowW > sample ? nowW : sample;
        }
        var leftW = (kind >= 0 ? ICON + 3 : 0) + nowW;
        var upperOff = 0;
        if (rangeText.length() > 0) {
            var rw = textW(dc, rangeText, fSide);
            var sample = textW(dc, "88°/88°", fSide);
            rw = rw > sample ? rw : sample;
            leftW = leftW > rw ? leftW : rw;
            upperOff = figuresUp(fSide) + 3;
        }
        var nowUp = figuresUp(fNow);
        var leftUp = upperOff + nowUp;
        if (kind >= 0) {
            var iconTop = upperOff + nowUp / 2 + ICON / 2;
            leftUp = leftUp > iconTop ? leftUp : iconTop;
        }

        // No weather: nothing beside the clock or on the steps' row.
        if (!_weatherOn) {
            leftW = 0;
            leftUp = 0;
            upperOff = 0;
        }

        // The seconds, and am/pm above them (on the baseline without them).
        var rightW = _seconds ? textW(dc, "88", fSeconds) : 0;
        var rightUp = _seconds ? figuresUp(fSeconds) : 0;
        var suffixOff = 0;
        if (_hour12) {
            var sw = textW(dc, "pm", fSide);
            rightW = rightW > sw ? rightW : sw;
            suffixOff = _seconds ? figuresUp(fSeconds) + 3 + Graphics.getFontDescent(fSide) : 0;
            rightUp = suffixOff + figuresUp(fSide);
        }

        // The steps (or the heart rate) behind their icon, centred on the
        // figures' middle; nothing when the row is set to show neither.
        var stepsUp = figuresUp(fSteps);
        var sUp = stepsUp > stepsUp / 2 + ICON / 2 ? stepsUp : stepsUp / 2 + ICON / 2;
        var sDown = ICON / 2 - stepsUp / 2;
        sDown = sDown > 0 ? sDown : 0;
        var rowW = ICON + 4 + textW(dc, _row == Mihrab.ROW_HEART ? "888" : "000000", fSteps);
        if (_row == Mihrab.ROW_NONE) {
            sUp = 0;
            sDown = 0;
            rowW = 0;
        }

        // The stale message on one line or two.
        var lineH = Graphics.getFontAscent(fStale) + Graphics.getFontDescent(fStale);
        var stale = [null] as Array;
        if (_staleText != null) {
            stale = [] as Array;
            for (var n = 1; n <= 2; n++) {
                var lines = balanced(dc, _staleText as String, fStale, full, n);
                if (lines == null) {
                    stale.add(null);
                } else {
                    stale.add([Graphics.getFontAscent(fStale), (lines.size() - 1) * lineH + Graphics.getFontDescent(fStale), widest(dc, lines, fStale), lines]);
                }
            }
        }

        // The weather on the steps' row instead: icon, the temperature now,
        // the high and low, then a gap before the footprint.
        var inlineW = (kind >= 0 ? ICON + 3 : 0) + nowW;
        if (rangeText.length() > 0) {
            var rw = textW(dc, rangeText, fSide);
            var sample = textW(dc, "88°/88°", fSide);
            inlineW += 6 + (rw > sample ? rw : sample);
        }
        // The gap before the footprint, when there is one.
        inlineW += _row == Mihrab.ROW_NONE ? 0 : 14;
        var inlineUp = kind >= 0 && ICON / 2 + nowUp / 2 > nowUp ? ICON / 2 + nowUp / 2 : nowUp;
        var inlineDown = kind >= 0 ? ICON / 2 - nowUp / 2 : 0;
        inlineDown = inlineDown > 0 ? inlineDown : 0;
        if (!_weatherOn) {
            inlineW = 0;
            inlineUp = 0;
            inlineDown = 0;
        }

        return [
            Graphics.getFontAscent(fDate), Graphics.getFontDescent(fDate), textW(dc, _dateText, fDate),
            inlineW, inlineUp * 1000 + inlineDown,
            leftW, leftUp, upperOff, rightW, rightUp, suffixOff,
            sUp, sDown, rowW,
            lineH, stale
        ];
    }

    // One arrangement, stacked top to bottom: true when every row lies
    // inside the dial (or when forced), and then kept if asked to.
    private function place(c as Number, m as Number, o as Number, s as Number, beside as Boolean, cm as Array<Number>, mm as Array, om as Array, force as Boolean, keep as Boolean) as Boolean {
        _lo = -100000;
        _hi = 100000;
        var ok = true;
        var y = 0;
        var bases = new [6] as Array<Number>;

        // The date.
        var up = om[0] as Number;
        var down = om[1] as Number;
        bases[0] = y + up;
        ok = fit((om[2] as Number) / 2 + 1, y, bases[0] + down) && ok;
        y = bases[0] + down + ROW_GAP;

        // The steps, under the date, and the weather before them when it
        // is not beside the clock.
        var stepsUp = om[11] as Number;
        var stepsDown = om[12] as Number;
        var stepsW = om[13] as Number;
        if (!beside) {
            var inline = om[4] as Number;
            var iUp = inline / 1000;
            var iDown = inline % 1000;
            stepsUp = iUp > stepsUp ? iUp : stepsUp;
            stepsDown = iDown > stepsDown ? iDown : stepsDown;
            stepsW += om[3] as Number;
        }
        if (stepsW == 0) {
            // Nothing on the row: the clock under the date.
            bases[5] = y;
            y += _clockGap - ROW_GAP;
        } else {
            bases[5] = y + stepsUp;
            ok = fit(stepsW / 2 + 1, y, bases[5] + stepsDown) && ok;
            y = bases[5] + stepsDown + _clockGap;
        }

        // The clock row: the weather, the figures and the seconds, centred
        // together; the rule under the figures.
        var digitsW = cm[0];
        var clockUp = cm[1];
        var leftW = beside ? om[5] as Number : 0;
        var leftUp = beside ? om[6] as Number : 0;
        var rightW = om[8] as Number;
        var rightUp = om[9] as Number;
        up = clockUp > leftUp ? clockUp : leftUp;
        up = up > rightUp ? up : rightUp;
        var b = y + up;
        bases[2] = b;
        var leftPart = leftW > 0 ? leftW + SIDE_GAP : 0;
        var group = leftPart + digitsW + (rightW > 0 ? SIDE_GAP + rightW : 0);
        var gx = -group / 2;
        var lx = abs(gx) > abs(gx + leftW) ? abs(gx) : abs(gx + leftW);
        var dx0 = gx + leftPart;
        var dx = abs(dx0) > abs(dx0 + digitsW) ? abs(dx0) : abs(dx0 + digitsW);
        var rx = abs(gx + group);
        if (leftW > 0) {
            ok = fit(lx, b - leftUp, b) && ok;
        }
        // The bar under the figures, in the room above the prayer line that
        // the plain rule left (UNDER_CLOCK), so nothing under it moves.
        ok = fit(dx, b - clockUp, b + RULE_DROP + RULE_PEN) && ok;
        ok = fit(rx, b - rightUp, b) && ok;
        y = b + UNDER_CLOCK + ROW_GAP;

        // The prayer and its countdown, or the message.
        var hasNext = _next != null;
        bases[3] = y + (mm[0] as Number);
        ok = fit((mm[2] as Number) / 2 + 1, y, bases[3] + (mm[1] as Number)) && ok;
        y = bases[3] + (mm[1] as Number) + ROW_GAP;
        if (hasNext) {
            bases[4] = y + (mm[3] as Number);
            ok = fit((mm[4] as Number) / 2 + 1, y, bases[4]) && ok;
            y = bases[4] + ROW_GAP;
        } else {
            bases[4] = 0;
        }

        // At the foot, after days without the phone, a word about that.
        var stale = (om[15] as Array)[s] as Array?;
        bases[1] = 0;
        var total = y - ROW_GAP;
        if (_staleText != null && stale != null) {
            var sUp = stale[0] as Number;
            var sDown = stale[1] as Number;
            bases[1] = y + sUp;
            ok = fit((stale[2] as Number) / 2 + 1, y, bases[1] + sDown) && ok;
            total = bases[1] + sDown;
        }

        if (!ok && !force) {
            return false;
        }
        if (!keep) {
            return true;
        }
        // As near the middle as the ranges allow.
        var start = (_h - total) / 2;
        if (ok) {
            start = start < _lo ? _lo : (start > _hi ? _hi : start);
        }

        var others = _otherFonts[o];
        _fDate = others[0];
        _fStale = others[1];
        _fNow = others[2];
        _fSide = others[3];
        _fSeconds = others[4];
        _fSteps = others[5];
        _fClock = clockFont(c);
        if (hasNext) {
            _fPrayer = _mihrabFonts[m][0];
            _fCount = _mihrabFonts[m][1];
            _reasonLines = null;
        } else {
            _fMessage = _messageFonts[m][0];
            _reasonLines = mm[3] as Array<String>;
        }
        _staleLines = (_staleText != null && stale != null) ? stale[3] as Array<String> : null;
        _bDate = start + bases[0];
        _bStale = start + bases[1];
        _bClock = start + bases[2];
        _bPrayer = start + bases[3];
        _bCount = start + bases[4];
        _bSteps = start + bases[5];
        _leftW = leftW;
        _rightW = rightW;
        _weatherBeside = beside;
        _upperOff = om[7] as Number;
        _suffixOff = om[10] as Number;
        return true;
    }

    // ---- Drawing ----

    // The battery: a bar from x, w wide, under the figures — the charge
    // left in its colour (green, then yellow, orange and red as it runs
    // down), what has been used in grey.
    private function drawBattery(dc as Dc, x as Number, w as Number, accent as Number) as Void {
        var mode = Mihrab.faceBattery(_face);
        if (mode == Mihrab.BATTERY_OFF) {
            return;
        }
        if (mode == Mihrab.BATTERY_ACCENT) {
            // The plain rule it was before it was the battery.
            dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x, _bClock + 5, w, 2);
            return;
        }
        var pct = System.getSystemStats().battery;
        pct = pct < 0.0 ? 0.0 : (pct > 100.0 ? 100.0 : pct);
        var y = _bClock + RULE_DROP;
        var full = (w * pct / 100.0 + 0.5).toNumber();
        dc.setColor(RULE, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(x, y, w, RULE_PEN);
        if (full > 0) {
            dc.setColor(batteryColor(pct), Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x, y, full, RULE_PEN);
        }
    }

    private function batteryColor(pct as Float) as Number {
        if (pct > 50.0) {
            return Graphics.COLOR_GREEN;
        }
        if (pct > 25.0) {
            return Graphics.COLOR_YELLOW;
        }
        if (pct > 10.0) {
            return Graphics.COLOR_ORANGE;
        }
        return Graphics.COLOR_RED;
    }

    // Text centred on the dial, on baseline b.
    private function drawRow(dc as Dc, text as String, f as Graphics.FontType, b as Number) as Void {
        dc.drawText(_w / 2, b - Graphics.getFontAscent(f), f, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Lines centred on the dial, the first on baseline b.
    private function drawLines(dc as Dc, lines as Array<String>, f as Graphics.FontType, b as Number) as Void {
        var lineH = Graphics.getFontAscent(f) + Graphics.getFontDescent(f);
        for (var i = 0; i < lines.size(); i++) {
            drawRow(dc, lines[i], f, b + i * lineH);
        }
    }

    // The clock's figures, the weather to their left (icon and the
    // temperature now; under them the high and low on the baseline) and
    // the seconds to their right (am/pm above them on a 12-hour clock),
    // the three centred together; the colon in the accent. Returns the
    // figures' [x, width].
    private function drawClock(dc as Dc, minutes as String, seconds as Number, suffix as String?, accent as Number) as [Number, Number] {
        var b = _bClock;
        var timeText = _hourText + ":" + minutes;
        var timeW = textW(dc, timeText, _fClock);
        var leftPart = _leftW > 0 ? _leftW + SIDE_GAP : 0;
        var group = leftPart + timeW + (_rightW > 0 ? SIDE_GAP + _rightW : 0);
        var x = _w / 2 - group / 2 + leftPart;
        var top = b - Graphics.getFontAscent(_fClock);
        var hourW = textW(dc, _hourText, _fClock);
        var colonW = textW(dc, ":", _fClock);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, _fClock, _hourText, Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(x + hourW + colonW, top, _fClock, minutes, Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + hourW, top, _fClock, ":", Graphics.TEXT_JUSTIFY_LEFT);

        // Right: the seconds on the baseline, am/pm above.
        var secX = x + timeW + SIDE_GAP;
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        if (_seconds) {
            var secUp = figuresUp(_fSeconds);
            _secondsBox = [secX, b - secUp - 1, textW(dc, "88", _fSeconds) + 2, secUp + 2];
            dc.drawText(secX, b - Graphics.getFontAscent(_fSeconds), _fSeconds, seconds.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        } else {
            _secondsBox = null;
        }
        if (suffix != null) {
            dc.drawText(secX, b - _suffixOff - Graphics.getFontAscent(_fSide), _fSide, suffix, Graphics.TEXT_JUSTIFY_LEFT);
        }

        // Left: the icon and the temperature now; under them high/low.
        if (!_weatherBeside || !_weatherOn) {
            return [x, timeW];
        }
        var right = x - SIDE_GAP;
        var kind = _weather[0] as Number;
        var nowText = _weather[1] as String;
        var rangeText = _weather[2] as String;
        var upper = b - _upperOff;
        if (rangeText.length() > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(right, b - Graphics.getFontAscent(_fSide), _fSide, rangeText, Graphics.TEXT_JUSTIFY_RIGHT);
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(right, upper - Graphics.getFontAscent(_fNow), _fNow, nowText, Graphics.TEXT_JUSTIFY_RIGHT);
        if (kind >= 0) {
            var mid = upper - figuresUp(_fNow) / 2;
            drawWeatherIcon(dc, kind, (_weather[3] as Number) == 1, right - textW(dc, nowText, _fNow) - 3 - ICON, mid - ICON / 2);
        }
        return [x, timeW];
    }

    // The countdown in full, "05:49:12", the figures white and the colons
    // in the accent, centred. Remembers where it was drawn.
    private function drawCountdown(dc as Dc, remaining as Number, accent as Number) as Void {
        if (_shortCount) {
            drawShortCountdown(dc, remaining, accent);
            return;
        }
        var parts = Mihrab.hms(remaining);
        var f = _fCount;
        var cx = _w / 2;
        var colonW = textW(dc, ":", f);
        var width = textW(dc, parts[0], f) + textW(dc, parts[1], f) + textW(dc, parts[2], f) + 2 * colonW;
        var up = figuresUp(f);
        var boxW = textW(dc, "88:88:88", f) + 4;
        _countdownBox = [cx - boxW / 2, _bCount - up - 1, boxW, up + 2];
        var top = _bCount - Graphics.getFontAscent(f);
        var x = cx - width / 2;
        for (var i = 0; i < 3; i++) {
            if (i > 0) {
                dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
                dc.drawText(x, top, f, ":", Graphics.TEXT_JUSTIFY_LEFT);
                x += colonW;
            }
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, f, parts[i], Graphics.TEXT_JUSTIFY_LEFT);
            x += textW(dc, parts[i], f);
        }
    }

    // The countdown as the phone's Minimal page writes it, "5h 49m", the
    // figures white and the unit letters in the accent.
    private function drawShortCountdown(dc as Dc, remaining as Number, accent as Number) as Void {
        var ps = Mihrab.pieces(remaining);
        var f = _fCount;
        var cx = _w / 2;
        var space = textW(dc, " ", f);
        var width = 0;
        for (var i = 0; i < ps.size(); i++) {
            width += (i > 0 ? space : 0) + textW(dc, ps[i][0], f) + textW(dc, ps[i][1], f);
        }
        var up = figuresUp(f);
        var boxW = textW(dc, "88h 88m", f) + 4;
        _countdownBox = [cx - boxW / 2, _bCount - up - 1, boxW, up + 2];
        var top = _bCount - Graphics.getFontAscent(f);
        var x = cx - width / 2;
        for (var i = 0; i < ps.size(); i++) {
            if (i > 0) {
                x += space;
            }
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, f, ps[i][0], Graphics.TEXT_JUSTIFY_LEFT);
            x += textW(dc, ps[i][0], f);
            dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, f, ps[i][1], Graphics.TEXT_JUSTIFY_LEFT);
            x += textW(dc, ps[i][1], f);
        }
    }

    // The next prayer: its name in the accent, its time in white, the two
    // centred together.
    private function drawPrayer(dc as Dc, name as String, time as String, accent as Number) as Void {
        var f = _fPrayer;
        var gap = textW(dc, "  ", f);
        var nameW = textW(dc, name, f);
        var x = _w / 2 - (nameW + gap + textW(dc, time, f)) / 2;
        var top = _bPrayer - Graphics.getFontAscent(f);
        dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, f, name, Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + nameW + gap, top, f, time, Graphics.TEXT_JUSTIFY_LEFT);
    }

    // Round the edge, from twelve o'clock clockwise: a thin dark track,
    // and over it, thick in the accent, how far it is from the last
    // prayer to the next, with a white bead where it has got to. Square
    // screens have no edge to run round and go without.
    private function drawRing(dc as Dc, now as Number, accent as Number) as Void {
        if (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND) {
            return;
        }
        var cx = _w / 2;
        var cy = _h / 2;
        var r = _w / 2 - RING_IN;
        dc.setPenWidth(1);
        dc.setColor(RULE, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, r);
        var next = _next;
        var last = Mihrab.current(now);
        if (next == null || last == null || next[1] <= last[1]) {
            return;
        }
        var degrees = (360 * (now - last[1]) / (next[1] - last[1])).toNumber();
        degrees = degrees < 0 ? 0 : (degrees > 360 ? 360 : degrees);
        dc.setPenWidth(RING_PEN);
        dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
        if (degrees >= 360) {
            dc.drawCircle(cx, cy, r);
        } else if (degrees > 0) {
            dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, 90, 90 - degrees);
        }
        dc.setPenWidth(1);
        var a = Math.toRadians(90 - degrees);
        var bx = cx + (r * Math.cos(a)).toNumber();
        var by = cy - (r * Math.sin(a)).toNumber();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(bx, by, RING_PEN);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(bx, by, RING_PEN - 1);
    }

    // A footprint and today's steps as six figures, "004532": the figures
    // the count uses white (its own zeros too, and the one of a count of
    // none), the unused leading zeros grey.
    private function drawSteps(dc as Dc, accent as Number) as Void {
        var f = _fSteps;
        var b = _bSteps;
        var inline = !_weatherBeside && _weatherOn;
        if (_row == Mihrab.ROW_NONE) {
            if (inline) {
                drawInlineWeather(dc, _w / 2 - inlineWeatherW(dc) / 2, b);
            }
            return;
        }
        if (_row == Mihrab.ROW_HEART) {
            var hr = heartRate();
            var hrText = hr == null ? "--" : hr.format("%d");
            var hrW = ICON + 4 + textW(dc, hrText, f);
            var weatherW0 = inline ? inlineWeatherW(dc) : 0;
            var x0 = _w / 2 - (weatherW0 + hrW) / 2;
            if (inline) {
                drawInlineWeather(dc, x0, b);
                x0 += weatherW0;
            }
            dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
            drawHeart(dc, x0, b - figuresUp(f) / 2 - ICON / 2);
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 + ICON + 4, b - Graphics.getFontAscent(f), f, hrText, Graphics.TEXT_JUSTIFY_LEFT);
            return;
        }
        var text = stepCount().format("%06d");
        var lead = 0;
        while (lead < text.length() - 1 && (text.substring(lead, lead + 1) as String).equals("0")) {
            lead++;
        }
        var stepsW = ICON + 4 + textW(dc, text, f);
        var weatherW = inline ? inlineWeatherW(dc) : 0;
        var x = _w / 2 - (weatherW + stepsW) / 2;
        if (inline) {
            drawInlineWeather(dc, x, b);
            x += weatherW;
        }
        dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
        drawFootprints(dc, x, b - figuresUp(f) / 2 - ICON / 2);
        x += ICON + 4;
        var top = b - Graphics.getFontAscent(f);
        var zeros = text.substring(0, lead) as String;
        if (zeros.length() > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, f, zeros, Graphics.TEXT_JUSTIFY_LEFT);
            x += textW(dc, zeros, f);
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, f, text.substring(lead, text.length()) as String, Graphics.TEXT_JUSTIFY_LEFT);
    }

    // The weather on the steps' row: its width with the gap after it.
    private function inlineWeatherW(dc as Dc) as Number {
        var kind = _weather[0] as Number;
        var rangeText = _weather[2] as String;
        var w = (kind >= 0 ? ICON + 3 : 0) + textW(dc, _weather[1] as String, _fNow);
        if (rangeText.length() > 0) {
            w += 6 + textW(dc, rangeText, _fSide);
        }
        return w + (_row == Mihrab.ROW_NONE ? 0 : 14);
    }

    // The weather on the steps' row from x, on baseline b: the icon, the
    // temperature now in white, the high and low in grey.
    private function drawInlineWeather(dc as Dc, x as Number, b as Number) as Void {
        var kind = _weather[0] as Number;
        var nowText = _weather[1] as String;
        var rangeText = _weather[2] as String;
        if (kind >= 0) {
            drawWeatherIcon(dc, kind, (_weather[3] as Number) == 1, x, b - figuresUp(_fNow) / 2 - ICON / 2);
            x += ICON + 3;
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, b - Graphics.getFontAscent(_fNow), _fNow, nowText, Graphics.TEXT_JUSTIFY_LEFT);
        x += textW(dc, nowText, _fNow);
        if (rangeText.length() > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + 6, b - Graphics.getFontAscent(_fSide), _fSide, rangeText, Graphics.TEXT_JUSTIFY_LEFT);
        }
    }

    // [icon kind or -1, "8°", "16°/7°", 1 at night else 0] from the
    // watch's weather (Gadgetbridge feeds it from the phone's weather
    // app), in the unit of the place the Mihrab app is set to; [-1, "--",
    // "", 0] without any.
    private function weatherParts(moment as Time.Moment) as Array {
        if (!(Toybox has :Weather) || !(Weather has :getCurrentConditions)) {
            return [-1, "--", "", 0];
        }
        var c = Weather.getCurrentConditions();
        if (c == null || c.temperature == null) {
            return [-1, "--", "", 0];
        }
        var f = Mihrab.fahrenheit();
        var now = degrees(c.temperature as Numeric, f) + "°";
        var range = "";
        if (c.highTemperature != null && c.lowTemperature != null) {
            range = degrees(c.highTemperature as Numeric, f) + "°/" + degrees(c.lowTemperature as Numeric, f) + "°";
        }
        var kind = c.condition == null ? -1 : iconKind(c.condition as Number);
        return [kind, now, range, isNight(c, moment) ? 1 : 0];
    }

    // After sunset or before sunrise where the weather was observed.
    private function isNight(c as Weather.CurrentConditions, moment as Time.Moment) as Boolean {
        if (!(Weather has :getSunrise) || c.observationLocationPosition == null) {
            return false;
        }
        var where = c.observationLocationPosition as Position.Location;
        var rise = Weather.getSunrise(where, moment);
        var set = Weather.getSunset(where, moment);
        if (rise == null || set == null) {
            return false;
        }
        return moment.compare(rise) < 0 || moment.compare(set) > 0;
    }

    // A temperature the watch keeps in Celsius, rounded, in the unit asked.
    private function degrees(celsius as Numeric, fahrenheit as Boolean) as String {
        var v = celsius.toFloat();
        if (fahrenheit) {
            v = v * 9.0 / 5.0 + 32.0;
        }
        return Math.round(v).toNumber().format("%d");
    }

    // The icon for each of the watch's weather conditions.
    private function iconKind(condition as Number) as Number {
        switch (condition) {
            case Weather.CONDITION_CLEAR:
            case Weather.CONDITION_FAIR:
                return W_SUN;
            case Weather.CONDITION_MOSTLY_CLEAR:
            case Weather.CONDITION_PARTLY_CLEAR:
            case Weather.CONDITION_PARTLY_CLOUDY:
            case Weather.CONDITION_THIN_CLOUDS:
                return W_PARTLY;
            case Weather.CONDITION_MOSTLY_CLOUDY:
            case Weather.CONDITION_CLOUDY:
            case Weather.CONDITION_UNKNOWN:
                return W_CLOUD;
            case Weather.CONDITION_RAIN:
            case Weather.CONDITION_LIGHT_RAIN:
            case Weather.CONDITION_HEAVY_RAIN:
            case Weather.CONDITION_SHOWERS:
            case Weather.CONDITION_LIGHT_SHOWERS:
            case Weather.CONDITION_HEAVY_SHOWERS:
            case Weather.CONDITION_SCATTERED_SHOWERS:
            case Weather.CONDITION_CHANCE_OF_SHOWERS:
            case Weather.CONDITION_CLOUDY_CHANCE_OF_RAIN:
            case Weather.CONDITION_DRIZZLE:
            case Weather.CONDITION_FREEZING_RAIN:
            case Weather.CONDITION_UNKNOWN_PRECIPITATION:
                return W_RAIN;
            case Weather.CONDITION_SNOW:
            case Weather.CONDITION_LIGHT_SNOW:
            case Weather.CONDITION_HEAVY_SNOW:
            case Weather.CONDITION_CHANCE_OF_SNOW:
            case Weather.CONDITION_CLOUDY_CHANCE_OF_SNOW:
            case Weather.CONDITION_FLURRIES:
            case Weather.CONDITION_ICE_SNOW:
            case Weather.CONDITION_ICE:
                return W_SNOW;
            case Weather.CONDITION_WINTRY_MIX:
            case Weather.CONDITION_RAIN_SNOW:
            case Weather.CONDITION_LIGHT_RAIN_SNOW:
            case Weather.CONDITION_HEAVY_RAIN_SNOW:
            case Weather.CONDITION_CHANCE_OF_RAIN_SNOW:
            case Weather.CONDITION_CLOUDY_CHANCE_OF_RAIN_SNOW:
            case Weather.CONDITION_SLEET:
            case Weather.CONDITION_HAIL:
                return W_SLEET;
            case Weather.CONDITION_THUNDERSTORMS:
            case Weather.CONDITION_SCATTERED_THUNDERSTORMS:
            case Weather.CONDITION_CHANCE_OF_THUNDERSTORMS:
                return W_STORM;
            case Weather.CONDITION_FOG:
            case Weather.CONDITION_MIST:
            case Weather.CONDITION_HAZE:
            case Weather.CONDITION_HAZY:
            case Weather.CONDITION_SMOKE:
            case Weather.CONDITION_DUST:
            case Weather.CONDITION_SAND:
            case Weather.CONDITION_VOLCANIC_ASH:
                return W_FOG;
            case Weather.CONDITION_WINDY:
            case Weather.CONDITION_SQUALL:
            case Weather.CONDITION_SANDSTORM:
            case Weather.CONDITION_HURRICANE:
            case Weather.CONDITION_TROPICAL_STORM:
            case Weather.CONDITION_TORNADO:
                return W_WIND;
            default:
                return W_CLOUD;
        }
    }

    // The weather icon in a 16 px square, top-left at (x, y): solid
    // shapes in white, the sun yellow, a moon for clear skies at night.
    private function drawWeatherIcon(dc as Dc, kind as Number, night as Boolean, x as Number, y as Number) as Void {
        if (kind == W_SUN) {
            if (night) {
                drawMoon(dc, x + 8, y + 8, 6);
            } else {
                drawSun(dc, x + 8, y + 8, 3, 3);
            }
        } else if (kind == W_PARTLY) {
            if (night) {
                drawMoon(dc, x + 5, y + 5, 4);
            } else {
                drawSun(dc, x + 5, y + 5, 2, 2);
            }
            drawCloud(dc, x, y + 3);
        } else if (kind == W_CLOUD) {
            drawCloud(dc, x, y + 1);
        } else if (kind == W_RAIN) {
            drawCloud(dc, x, y - 2);
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            for (var i = 0; i < 3; i++) {
                dc.drawLine(x + 4 + 4 * i, y + 12, x + 2 + 4 * i, y + 16);
            }
        } else if (kind == W_SNOW) {
            drawCloud(dc, x, y - 2);
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x + 4, y + 13, 1);
            dc.fillCircle(x + 8, y + 15, 1);
            dc.fillCircle(x + 12, y + 13, 1);
        } else if (kind == W_SLEET) {
            drawCloud(dc, x, y - 2);
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawLine(x + 5, y + 12, x + 3, y + 16);
            dc.fillCircle(x + 9, y + 14, 1);
            dc.drawLine(x + 13, y + 12, x + 11, y + 16);
        } else if (kind == W_STORM) {
            drawCloud(dc, x, y - 2);
            dc.setColor(SUN, Graphics.COLOR_TRANSPARENT);
            dc.fillPolygon([[x + 9, y + 9], [x + 5, y + 14], [x + 8, y + 14], [x + 6, y + 18], [x + 12, y + 12], [x + 9, y + 12], [x + 11, y + 9]]);
        } else if (kind == W_FOG) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x + 1, y + 3, 14, 2);
            dc.fillRectangle(x + 3, y + 7, 13, 2);
            dc.fillRectangle(x, y + 11, 13, 2);
            dc.fillRectangle(x + 4, y + 15, 10, 1);
        } else if (kind == W_WIND) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x, y + 4, 11, 2);
            dc.drawArc(x + 11, y + 2, 3, Graphics.ARC_COUNTER_CLOCKWISE, 270, 180);
            dc.fillRectangle(x, y + 8, 15, 2);
            dc.fillRectangle(x, y + 12, 9, 2);
            dc.drawArc(x + 9, y + 15, 2, Graphics.ARC_CLOCKWISE, 90, 180);
        }
    }

    // A sun: a disc of radius r and eight rays of length ray.
    private function drawSun(dc as Dc, cx as Number, cy as Number, r as Number, ray as Number) as Void {
        dc.setColor(SUN, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r);
        var a = r + 2;
        var b = r + 1 + ray;
        var da = (a * 7) / 10;
        var db = (b * 7) / 10;
        dc.drawLine(cx, cy - a, cx, cy - b);
        dc.drawLine(cx, cy + a, cx, cy + b);
        dc.drawLine(cx - a, cy, cx - b, cy);
        dc.drawLine(cx + a, cy, cx + b, cy);
        dc.drawLine(cx - da, cy - da, cx - db, cy - db);
        dc.drawLine(cx + da, cy - da, cx + db, cy - db);
        dc.drawLine(cx - da, cy + da, cx - db, cy + db);
        dc.drawLine(cx + da, cy + da, cx + db, cy + db);
    }

    // A crescent: a disc with a black disc bitten out of it.
    private function drawMoon(dc as Dc, cx as Number, cy as Number, r as Number) as Void {
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx + r / 2 + 1, cy - r / 3 - 1, r - 1);
    }

    // A cloud, about 16 × 10 below (x, y + 3), edged in black so it reads
    // over a sun or moon behind it.
    private function drawCloud(dc as Dc, x as Number, y as Number) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x + 5, y + 9, 4);
        dc.fillCircle(x + 9, y + 7, 5);
        dc.fillCircle(x + 12, y + 10, 4);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x + 5, y + 9, 3);
        dc.fillCircle(x + 9, y + 7, 4);
        dc.fillCircle(x + 12, y + 10, 3);
        dc.fillRectangle(x + 3, y + 10, 11, 3);
    }

    // Two footprints, 16 px square, top-left at (x, y): a sole and a
    // heel each, the right foot a step ahead.
    private function drawFootprints(dc as Dc, x as Number, y as Number) as Void {
        dc.fillEllipse(x + 4, y + 7, 3, 5);
        dc.fillCircle(x + 4, y + 14, 2);
        dc.fillEllipse(x + 12, y + 4, 3, 5);
        dc.fillCircle(x + 12, y + 11, 2);
    }

    // A heart, 16 px square, top-left at (x, y).
    private function drawHeart(dc as Dc, x as Number, y as Number) as Void {
        dc.fillCircle(x + 5, y + 6, 4);
        dc.fillCircle(x + 11, y + 6, 4);
        dc.fillPolygon([[x + 1, y + 8], [x + 15, y + 8], [x + 8, y + 15]] as Array<[Numeric, Numeric]>);
    }

    // The heart rate now, else the latest the watch measured, or null.
    private function heartRate() as Number? {
        var info = Activity.getActivityInfo();
        if (info != null && info.currentHeartRate != null) {
            return info.currentHeartRate as Number;
        }
        if (ActivityMonitor has :getHeartRateHistory) {
            var sample = ActivityMonitor.getHeartRateHistory(1, true).next();
            if (sample != null && sample.heartRate != null && sample.heartRate != ActivityMonitor.INVALID_HR_SAMPLE) {
                return sample.heartRate as Number;
            }
        }
        return null;
    }

    // Today's steps (0 when the watch has none to give), at most 999999.
    private function stepCount() as Number {
        var steps = ActivityMonitor.getInfo().steps;
        if (steps == null) {
            return 0;
        }
        var n = steps as Number;
        return n > 999999 ? 999999 : n;
    }
}
