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
//            ─────
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
    private const SIDE_GAP = 5;
    // Kept clear of the dial's edge, inside the ring.
    private const EDGE = 9;
    // The ring round the edge: its radius in from the edge, its width.
    private const RING_IN = 3;
    private const RING_PEN = 4;
    // The rule under the time, thick enough to carry the accent.
    private const RULE_PEN = 2;
    // The rule under the time sits this far below its baseline.
    private const RULE_DROP = 5;

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
    private var _clockFonts as Array<Graphics.FontDefinition> = [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD] as Array<Graphics.FontDefinition>;
    // The prayer line and the countdown's figures; or, with no prayer to
    // show, the message's font and how many lines it may take.
    private var _mihrabFonts as Array<[Graphics.FontDefinition, Graphics.FontDefinition]> = [
        [Graphics.FONT_SMALL, Graphics.FONT_NUMBER_MILD],
        [Graphics.FONT_SMALL, Graphics.FONT_LARGE],
        [Graphics.FONT_SMALL, Graphics.FONT_MEDIUM],
        [Graphics.FONT_TINY, Graphics.FONT_MEDIUM],
        [Graphics.FONT_TINY, Graphics.FONT_SMALL],
        [Graphics.FONT_XTINY, Graphics.FONT_TINY]
    ] as Array<[Graphics.FontDefinition, Graphics.FontDefinition]>;
    private var _messageFonts as Array<[Graphics.FontDefinition, Number]> = [
        [Graphics.FONT_SMALL, 1], [Graphics.FONT_TINY, 1], [Graphics.FONT_SMALL, 2],
        [Graphics.FONT_TINY, 2], [Graphics.FONT_XTINY, 2], [Graphics.FONT_XTINY, 3]
    ] as Array<[Graphics.FontDefinition, Number]>;
    // The rest: date, the stale message, the weather now, the small side text (high
    // and low, am/pm), the seconds, the steps.
    private var _otherFonts as Array<Array<Graphics.FontDefinition>> = [
        [Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_SMALL],
        [Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_TINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_TINY],
        [Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_TINY],
        [Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY, Graphics.FONT_XTINY]
    ] as Array<Array<Graphics.FontDefinition>>;

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

    // The layout, and what it was made for.
    private var _key as String = "";
    private var _fDate as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fStale as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fClock as Graphics.FontDefinition = Graphics.FONT_NUMBER_MILD;
    private var _fNow as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fSide as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fSeconds as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fSteps as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fPrayer as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fCount as Graphics.FontDefinition = Graphics.FONT_XTINY;
    private var _fMessage as Graphics.FontDefinition = Graphics.FONT_XTINY;
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
        _weather = weatherParts(nowMoment);
        _next = Mihrab.next(now);
        _reasonText = null;
        if (_next == null) {
            _reasonText = WatchUi.loadResource(Mihrab.times() == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded) as String;
        }

        var key = (_w.toString() + "|" + _dateText + "|" + (_staleText == null ? "" : _staleText) + "|" + (_hour12 ? "12" : "24")
            + "|" + _hourText.length().toString() + "|" + (_weather[0] as Number).toString() + "|" + (_weather[1] as String)
            + "|" + (_weather[2] as String) + "|" + (_reasonText == null ? "" : _reasonText)
            + "|" + System.getDeviceSettings().systemLanguage.toString()) as String;
        if (!key.equals(_key)) {
            layout(dc);
            _key = key;
        }

        var accent = Mihrab.accent();

        // The ring: the way from the last prayer to the next, in the
        // app's accent, as the app's own track draws it.
        drawRing(dc, now, accent);

        // The date.
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        drawRow(dc, _dateText, _fDate, _bDate);

        // At the foot, after days without the phone, a word about that.
        var staleLines = _staleLines;
        if (_staleText != null && staleLines != null) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            drawLines(dc, staleLines, _fStale, _bStale);
        }

        // The time with the weather and the seconds, and a rule under the
        // figures as wide as they are.
        var figures = drawClock(dc, clock.min.format("%02d"), clock.sec, suffix, accent);
        dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(figures[0], _bClock + RULE_DROP, figures[1] + 1, RULE_PEN);

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

        // Today's steps.
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
        dc.setClip(box[0], box[1], box[2], box[3]);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        drawCountdown(dc, next[1] - now, Mihrab.accent());
        dc.clearClip();
    }

    // ---- Measuring ----

    // How far a font's figures reach above the baseline. The ascent keeps
    // room for accents above the figures; these are measured on the
    // Enduro 3's fonts, with a margin (and the whole ascent where unknown).
    private function figuresUp(f as Graphics.FontDefinition) as Number {
        var a = Graphics.getFontAscent(f);
        var k = 88;
        if (f == Graphics.FONT_NUMBER_THAI_HOT) {
            k = 74;
        } else if (f == Graphics.FONT_NUMBER_HOT) {
            k = 77;
        } else if (f == Graphics.FONT_NUMBER_MEDIUM) {
            k = 73;
        } else if (f == Graphics.FONT_NUMBER_MILD) {
            k = 100;
        }
        return (a * k + 99) / 100;
    }

    private function textW(dc as Dc, s as String, f as Graphics.FontDefinition) as Number {
        return dc.getTextWidthInPixels(s, f);
    }

    // The text as lines no wider than maxW, at most maxLines of them, or
    // null when it cannot be (a word wider than a line, too many lines).
    private function wrap(dc as Dc, text as String, f as Graphics.FontDefinition, maxW as Number, maxLines as Number) as Array<String>? {
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

    // The widest of a text's wrapped lines.
    private function widest(dc as Dc, lines as Array<String>, f as Graphics.FontDefinition) as Number {
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
        var clocks = [] as Array<Array<Number>>;
        for (var c = 0; c < _clockFonts.size(); c++) {
            var f = _clockFonts[c];
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
                var countW = textW(dc, "88:88:88", fC);
                mihrab.add([Graphics.getFontAscent(fP), Graphics.getFontDescent(fP), prayerW, figuresUp(fC), countW]);
            }
        } else {
            for (var m = 0; m < _messageFonts.size(); m++) {
                var fM = _messageFonts[m][0];
                var lines = wrap(dc, _reasonText as String, fM, full, _messageFonts[m][1]);
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

        for (var c = 0; c < clocks.size(); c++) {
            for (var m = 0; m < mihrab.size(); m++) {
                if (mihrab[m] == null) {
                    continue;
                }
                for (var o = 0; o < others.size(); o++) {
                    var staleVariants = others[o][15] as Array;
                    for (var s = 0; s < staleVariants.size(); s++) {
                        if (staleVariants[s] == null && _staleText != null) {
                            continue;
                        }
                        if (place(c, m, o, s, clocks[c], mihrab[m] as Array, others[o], false)) {
                            return;
                        }
                    }
                }
            }
        }
        // Nothing fits: the smallest of everything, as near the middle as
        // it can be, the messages on one line however wide.
        var lastM = mihrab.size() - 1;
        while (lastM > 0 && mihrab[lastM] == null) {
            lastM--;
        }
        var mm = mihrab[lastM];
        if (mm == null) {
            var fM = _messageFonts[lastM][0];
            mm = [Graphics.getFontAscent(fM), Graphics.getFontDescent(fM), textW(dc, _reasonText as String, fM), [_reasonText as String]];
        }
        var lastO = others.size() - 1;
        place(clocks.size() - 1, lastM, lastO, 0, clocks[clocks.size() - 1], mm as Array, others[lastO], true);
    }

    // The date, the stale message, the side columns and the steps in one
    // set of fonts: [date up, down, width, (unused), (unused), left width, left up, upper offset, right width, right up,
    // suffix offset, steps up, down, width, stale line height, stale
    // variants ([up, down, width, lines] for one and two lines, null where
    // it will not wrap)].
    private function measureOthers(dc as Dc, fonts as Array<Graphics.FontDefinition>, full as Number) as Array {
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

        // The seconds, and am/pm above them.
        var rightW = textW(dc, "88", fSeconds);
        var rightUp = figuresUp(fSeconds);
        var suffixOff = 0;
        if (_hour12) {
            var sw = textW(dc, "pm", fSide);
            rightW = rightW > sw ? rightW : sw;
            suffixOff = figuresUp(fSeconds) + 3 + Graphics.getFontDescent(fSide);
            rightUp = suffixOff + figuresUp(fSide);
        }

        // The steps behind the footprint, centred on the figures' middle.
        var stepsUp = figuresUp(fSteps);
        var sUp = stepsUp > stepsUp / 2 + ICON / 2 ? stepsUp : stepsUp / 2 + ICON / 2;
        var sDown = ICON / 2 - stepsUp / 2;
        sDown = sDown > 0 ? sDown : 0;

        // The stale message on one line or two.
        var lineH = Graphics.getFontAscent(fStale) + Graphics.getFontDescent(fStale);
        var stale = [null] as Array;
        if (_staleText != null) {
            stale = [] as Array;
            for (var n = 1; n <= 2; n++) {
                var lines = wrap(dc, _staleText as String, fStale, full, n);
                if (lines == null) {
                    stale.add(null);
                } else {
                    stale.add([Graphics.getFontAscent(fStale), (lines.size() - 1) * lineH + Graphics.getFontDescent(fStale), widest(dc, lines, fStale), lines]);
                }
            }
        }

        return [
            Graphics.getFontAscent(fDate), Graphics.getFontDescent(fDate), textW(dc, _dateText, fDate),
            0, 0,
            leftW, leftUp, upperOff, rightW, rightUp, suffixOff,
            sUp, sDown, ICON + 4 + textW(dc, "000000", fSteps),
            lineH, stale
        ];
    }

    // One arrangement, stacked top to bottom: keeps it and returns true
    // when every row lies inside the dial (or when forced).
    private function place(c as Number, m as Number, o as Number, s as Number, cm as Array<Number>, mm as Array, om as Array, force as Boolean) as Boolean {
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

        // The steps, under the date.
        bases[5] = y + (om[11] as Number);
        ok = fit((om[13] as Number) / 2 + 1, y, bases[5] + (om[12] as Number)) && ok;
        y = bases[5] + (om[12] as Number) + ROW_GAP;

        // The clock row: the weather, the figures and the seconds, centred
        // together; the rule under the figures.
        var digitsW = cm[0];
        var clockUp = cm[1];
        var leftW = om[5] as Number;
        var leftUp = om[6] as Number;
        var rightW = om[8] as Number;
        var rightUp = om[9] as Number;
        up = clockUp > leftUp ? clockUp : leftUp;
        up = up > rightUp ? up : rightUp;
        var b = y + up;
        bases[2] = b;
        var group = leftW + SIDE_GAP + digitsW + SIDE_GAP + rightW;
        var gx = -group / 2;
        var lx = abs(gx) > abs(gx + leftW) ? abs(gx) : abs(gx + leftW);
        var dx0 = gx + leftW + SIDE_GAP;
        var dx = abs(dx0) > abs(dx0 + digitsW) ? abs(dx0) : abs(dx0 + digitsW);
        var rx = abs(gx + group);
        ok = fit(lx, b - leftUp, b) && ok;
        ok = fit(dx, b - clockUp, b + RULE_DROP + RULE_PEN) && ok;
        ok = fit(rx, b - rightUp, b) && ok;
        y = b + RULE_DROP + RULE_PEN + ROW_GAP;

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
        _fClock = _clockFonts[c];
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
        _upperOff = om[7] as Number;
        _suffixOff = om[10] as Number;
        return true;
    }

    // ---- Drawing ----

    // Text centred on the dial, on baseline b.
    private function drawRow(dc as Dc, text as String, f as Graphics.FontDefinition, b as Number) as Void {
        dc.drawText(_w / 2, b - Graphics.getFontAscent(f), f, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Lines centred on the dial, the first on baseline b.
    private function drawLines(dc as Dc, lines as Array<String>, f as Graphics.FontDefinition, b as Number) as Void {
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
        var group = _leftW + SIDE_GAP + timeW + SIDE_GAP + _rightW;
        var x = _w / 2 - group / 2 + _leftW + SIDE_GAP;
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
        var secUp = figuresUp(_fSeconds);
        _secondsBox = [secX, b - secUp - 1, textW(dc, "88", _fSeconds) + 2, secUp + 2];
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(secX, b - Graphics.getFontAscent(_fSeconds), _fSeconds, seconds.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        if (suffix != null) {
            dc.drawText(secX, b - _suffixOff - Graphics.getFontAscent(_fSide), _fSide, suffix, Graphics.TEXT_JUSTIFY_LEFT);
        }

        // Left: the icon and the temperature now; under them high/low.
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
        var text = stepCount().format("%06d");
        var lead = 0;
        while (lead < text.length() - 1 && (text.substring(lead, lead + 1) as String).equals("0")) {
            lead++;
        }
        var x = _w / 2 - (ICON + 4 + textW(dc, text, f)) / 2;
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
