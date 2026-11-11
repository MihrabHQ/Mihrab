// The face, drawn for a MIP screen — a reflective panel that is always on,
// shows 64 colours and nothing in between, and is read in daylight at a
// glance and at night by a dim backlight. So: white ink on black for
// everything that is read; the app's accent for the two things that are
// its own (the next prayer, the way to it); grey only for what is read
// second (the seconds, am/pm, the day's high and low) and never for a
// track's only ink; no anti-aliasing, no gradients, lines two pixels or
// more; and nothing moving but the seconds and the countdown, each
// redrawn inside its own small clip (a partial update) from values kept
// since the minute's full draw — no storage read, no layout, once a
// second.
//
//                 ·  ╷  ·                    the day round the edge (below)
//               Wed 11 Nov                   the date (or the Hijri date)
//             ☁ 8°  16°/7°                   the weather
//                              am
//            9:41              07            the time · the seconds
//            Asr  16:42                      the next prayer
//             05:49:12                       the countdown
//              👣 4532                       today's steps
//               ▭ 87%                        the battery
//
// After days without the phone the weather's row says the times may be
// out of date (the weather is the phone's too); with no times at all the
// prayer's two rows say to open Mihrab.
//
// THE DAY ROUND THE EDGE is the app's Track bent into the bezel, the way
// Garmin's own faces carry a gauge there: the twenty-four hours once
// round, midnight at the foot and noon at the top, so the sun climbs the
// left side and comes down the right. The night is a thin grey line and
// the day (sunrise to Maghrib) a white one; each prayer is a tick at its
// own time; the next one is a ring in the accent, as on the app's Track;
// the stretch from now to it is drawn thick in the accent and shortens as
// it nears; and a bead — the sun's yellow by day, white by night — is the
// time now. It is drawn once a minute.
//
// Laid out, not placed: each row's font is chosen and the rows stacked so
// that every row's ink — measured for the widest thing it can show, not
// what it shows now — lies inside the ring. Arrangements are tried from
// the best down (the clock's size counts most, then the small rows'), and
// the first in which everything fits is kept until what the face shows
// changes its shape (another language, a message, the weather coming or
// going).
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
    private const TRACK = Graphics.COLOR_DK_GRAY;
    private const SUN = Graphics.COLOR_YELLOW;

    // The weather and footprint icons' box, square.
    private const ICON = 16;
    // The battery glyph: its body, and the nub at its end.
    private const CELL_W = 20;
    private const CELL_H = 10;

    // The ring: its radius in from the dial's edge, the pens of its line
    // and of the stretch ahead, a prayer's tick, the bead and the ring at
    // the next prayer.
    private const RING_IN = 6;
    private const RING_PEN = 2;
    private const AHEAD_PEN = 6;
    private const TICK_IN = 9;
    private const TICK_PEN = 3;
    private const BEAD = 5;
    // What the rows keep clear of the dial's edge: the ring and its ticks.
    private const INSET = 18;

    // Between the figures and the column to their right.
    private const SIDE_GAP = 4;
    // Between rows, top to bottom: date–weather, above the clock, under
    // it, prayer–countdown, above the foot row.
    private const GAP_SMALL = 2;
    private const GAP_CLOCK = 6;
    private const GAP_UNDER = 8;
    private const GAP_COUNT = 6;
    private const GAP_FOOT = 7;
    // The most each gap is opened by once the fonts are chosen (half of
    // it between rows that belong together).
    private const AIR_MAX = 16;

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

    // The clock's figures: the app's Roboto, tallest first
    // (garmin/tools/clockfont.py), then Garmin's smallest number font
    // should none fit.
    private var _clockFontIds as Array<ResourceId> = [
        Rez.Fonts.Clock76, Rez.Fonts.Clock70, Rez.Fonts.Clock64, Rez.Fonts.Clock60, Rez.Fonts.Clock56,
        Rez.Fonts.Clock53, Rez.Fonts.Clock50, Rez.Fonts.Clock47, Rez.Fonts.Clock44, Rez.Fonts.Clock40
    ] as Array<ResourceId>;
    // The countdown's figures and the seconds', the same Roboto: the two
    // things redrawn every second, in fonts whose box is their ink, so
    // the clip a partial update is charged for is no taller than what it
    // draws (clockfont.py has the arithmetic).
    private var _countFontIds as Array<ResourceId> = [
        Rez.Fonts.Count20, Rez.Fonts.Count24, Rez.Fonts.Count28
    ] as Array<ResourceId>;
    private var _fSeconds as Graphics.FontType = Graphics.FONT_XTINY;
    // The small rows' fonts, smallest first, and the arrangements tried,
    // best first: which of them the date, the weather, the next prayer
    // and the foot row (steps, battery) take, and which of the
    // countdown's sizes goes with them. Whatever arrangement fits is then
    // grown row by row as far as the dial has room (`layout`), up to
    // these caps. The side text — am/pm, the high and low — is the
    // smallest font throughout: it is read second.
    private var _rowFonts as Array<Graphics.FontType> = [
        Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_SMALL, Graphics.FONT_MEDIUM
    ] as Array<Graphics.FontType>;
    private var _sets as Array<Array<Number>> = [
        [1, 1, 2, 1, 2],
        [1, 1, 2, 1, 1],
        [0, 0, 1, 0, 1],
        [0, 0, 0, 0, 0]
    ] as Array<Array<Number>>;
    private var _caps as Array<Number> = [2, 2, 3, 2, 2] as Array<Number>;
    // The order rows are grown in: the next prayer, the date, the
    // countdown, the foot, the weather.
    private var _growOrder as Array<Number> = [2, 0, 4, 3, 1] as Array<Number>;
    private const F_SIDE = Graphics.FONT_XTINY;

    // What the face shows this minute.
    private var _w as Number = 0;
    private var _h as Number = 0;
    private var _dateText as String = "";
    private var _staleText as String? = null;
    private var _reasonText as String? = null;
    private var _hour12 as Boolean = false;
    private var _hourText as String = "";
    private var _weather as Array = [-1, "", "", 0];
    private var _next as [Number, Number]? = null;
    // What the phone has asked to be left off (Mihrab.mc, OPT_).
    private var _showSteps as Boolean = true;
    private var _showSeconds as Boolean = true;
    // Kept for the second-by-second draws, which read nothing: when the
    // next prayer is, and the accent.
    private var _nextAt as Number = 0;
    private var _accent as Number = 0x00AA55;

    // The layout, and what it was made for.
    private var _key as String = "";
    private var _fClock as Graphics.FontType = Graphics.FONT_NUMBER_MILD;
    private var _fDate as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fWeather as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fPrayer as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fCount as Graphics.FontType = Graphics.FONT_XTINY;
    private var _fFoot as Graphics.FontType = Graphics.FONT_XTINY;
    // Baselines of the rows (a message's: its first line's).
    private var _bDate as Number = 0;
    private var _bWeather as Number = 0;
    private var _bClock as Number = 0;
    private var _bPrayer as Number = 0;
    private var _bCount as Number = 0;
    private var _bSteps as Number = 0;
    private var _bFoot as Number = 0;
    // The column right of the figures (am/pm, the seconds): its width.
    private var _rightW as Number = 0;
    // The countdown's measures, taken once at layout: "88:88:88", a pair
    // of figures, a colon. Its figures are all one width, so the three
    // pairs stand where they stood a second ago and nothing is measured
    // in the second-by-second draw.
    private var _countW as Number = 0;
    private var _countPairW as Number = 0;
    private var _countColonW as Number = 0;
    // The watch has said the second-by-second draws cost more than a face
    // is allowed (MihrabFaceDelegate): no seconds, and the countdown to
    // the minute, until the face next goes to sleep and is given the
    // chance again. Better that than figures the system has stopped
    // redrawing, frozen at whatever second it gave up.
    private var _overBudget as Boolean = false;
    private var _reasonLines as Array<String>? = null;
    private var _staleLines as Array<String>? = null;

    // Where the moving parts were last drawn: [x, y, w, h].
    private var _countdownBox as [Number, Number, Number, Number]?;
    private var _secondsBox as [Number, Number, Number, Number]?;

    function initialize() {
        WatchFace.initialize();
        _fSeconds = WatchUi.loadResource(Rez.Fonts.Seconds15) as Graphics.FontReference;
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
        _overBudget = false;
        WatchUi.requestUpdate();
    }

    // From the delegate: the partial updates ran over the power budget.
    function overBudget() as Void {
        _overBudget = true;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) as Void {
        _w = dc.getWidth();
        _h = dc.getHeight();

        if (dc has :clearClip) {
            dc.clearClip();
        }
        // Solid pixels only: an anti-aliased edge is a dither on this panel.
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(false);
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
        // The Hijri date in its place, or beside it without the weekday —
        // as the phone asks, and only once it has sent one for today.
        var dateStyle = Mihrab.dateStyle();
        if (dateStyle != 0) {
            var hijri = MihrabHijri.text(now, dateStyle == 2);
            if (hijri != null) {
                _dateText = dateStyle == 1 ? hijri : date.day.format("%d") + " " + date.month + " · " + hijri;
            }
        }
        _showSteps = !Mihrab.option(MihrabStore.OPT_NO_STEPS);
        _showSeconds = !Mihrab.option(MihrabStore.OPT_NO_SECONDS) && !_overBudget;
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
        // Left off, or none to show: no row for it.
        _weather = Mihrab.option(MihrabStore.OPT_NO_WEATHER) ? [-1, "", "", 0] : weatherParts(nowMoment);
        _next = Mihrab.next(now);
        _nextAt = _next == null ? 0 : (_next as [Number, Number])[1];
        _accent = Mihrab.accent();
        _reasonText = null;
        if (_next == null) {
            _reasonText = WatchUi.loadResource(Mihrab.times() == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded) as String;
            // Which already says to open the app: no word about old times too.
            _staleText = null;
        }

        var key = (_w.toString() + "|" + _dateText + "|" + (_staleText == null ? "" : _staleText) + "|" + (_hour12 ? "12" : "24")
            + "|" + _hourText.length().toString() + "|" + (_weather[0] as Number).toString() + "|" + (_weather[1] as String)
            + "|" + (_weather[2] as String) + "|" + (_reasonText == null ? "" : _reasonText)
            + "|" + (_showSteps ? "s" : "") + (_showSeconds ? "c" : "")
            + "|" + System.getDeviceSettings().systemLanguage.toString()) as String;
        if (!key.equals(_key)) {
            layout(dc);
            _key = key;
        }

        drawRing(dc, now, clock);

        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        drawRow(dc, _dateText, _fDate, _bDate);
        // Under the date: the weather, or the word about old times.
        var staleLines = _staleLines;
        if (_staleText != null && staleLines != null) {
            drawLines(dc, staleLines, _fWeather, _bWeather);
        } else {
            drawWeather(dc);
        }
        drawClock(dc, clock.min.format("%02d"), clock.sec, suffix);

        // The next prayer and the countdown, or why there is none.
        var next = _next;
        var reasonLines = _reasonLines;
        if (next != null) {
            drawPrayer(dc, Mihrab.name(next[0]), Mihrab.clock(next[1]));
            drawCountdown(dc, next[1] - now);
        } else if (reasonLines != null) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            drawLines(dc, reasonLines, _fPrayer, _bPrayer);
        }

        // At the foot: the steps, and the battery under them.
        drawFoot(dc);
    }

    // Every second between the minute's full draws: the seconds and the
    // countdown, each inside its own clip, from what onUpdate kept.
    function onPartialUpdate(dc as Dc) as Void {
        var sbox = _secondsBox;
        if (sbox != null) {
            dc.setClip(sbox[0], sbox[1], sbox[2], sbox[3]);
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
            dc.clear();
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(sbox[0], _bClock - Graphics.getFontAscent(_fSeconds), _fSeconds, System.getClockTime().sec.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        }
        var box = _countdownBox;
        if (box != null && _nextAt > 0) {
            var left = _nextAt - Time.now().value();
            // Past it: the minute's full draw moves on to the next prayer.
            if (left >= 0) {
                dc.setClip(box[0], box[1], box[2], box[3]);
                dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
                dc.clear();
                drawCountdown(dc, left);
            }
        }
        dc.clearClip();
    }

    // ---- Measuring ----

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

    private function up(f as Graphics.FontType) as Number {
        return Graphics.getFontAscent(f);
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

    private function widest(dc as Dc, lines as Array<String>, f as Graphics.FontType) as Number {
        var w = 0;
        for (var i = 0; i < lines.size(); i++) {
            var lw = textW(dc, lines[i], f);
            w = lw > w ? lw : w;
        }
        return w;
    }

    // The widest name the prayer row can show in this language.
    private function widestName(dc as Dc, f as Graphics.FontType) as Number {
        var w = 0;
        for (var i = 0; i < Mihrab.PER_DAY; i++) {
            var nw = textW(dc, Mihrab.name(i), f);
            w = nw > w ? nw : w;
        }
        return w;
    }

    // ---- Laying out ----
    //
    // A box of half-width hw lies inside a circle of radius r exactly
    // while its top and bottom are within sqrt(r² − hw²) of the middle: so
    // each row allows a range of heights for the stack's start, and the
    // stack fits where all the ranges meet. One pass per arrangement.

    private var _round as Boolean = true;
    private var _lo as Number = 0;
    private var _hi as Number = 0;

    private function fit(hw as Number, top as Number, bottom as Number) as Boolean {
        var r = _w / 2 - INSET;
        if (hw > r) {
            return false;
        }
        var reach = _round ? Math.sqrt(r * r - hw * hw).toNumber() : _h / 2 - INSET;
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

    // Tries the arrangements best first and takes the first in which every
    // row lies inside the ring, then fills the dial from it (`fill`). A step down in the small rows costs as
    // much as two in the clock: the clock is read from furthest away, but
    // not at any price to the line that says which prayer is next. Should
    // none fit, the smallest of all is kept, placed as well as it can be.
    private function layout(dc as Dc) as Void {
        _round = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
        var clocks = _clockFontIds.size() + 1;
        var sets = _sets.size();
        // The clock's figures: [width for this hour and the widest minutes, height].
        var cm = [] as Array<Array<Number>>;
        for (var c = 0; c < clocks; c++) {
            var f = clockFont(c);
            cm.add([textW(dc, _hourText + ":88", f), up(f)]);
        }
        // The countdown's sizes, each loaded once for every arrangement.
        var counts = [] as Array<Graphics.FontType>;
        for (var i = 0; i < _countFontIds.size(); i++) {
            counts.add(WatchUi.loadResource(_countFontIds[i]) as Graphics.FontReference);
        }
        var worst = clocks - 1 + 2 * (sets - 1);
        for (var cost = 0; cost <= worst; cost++) {
            for (var s = 0; s < sets; s++) {
                var c = cost - 2 * s;
                if (c >= 0 && c < clocks && place(dc, c, cm[c], _sets[s], counts, 0, 0, false)) {
                    fill(dc, c, cm[c], _sets[s], counts);
                    return;
                }
            }
        }
        place(dc, clocks - 1, cm[clocks - 1], _sets[sets - 1], counts, 0, 0, true);
    }

    // An arrangement fits; now the rest of the dial. What stopped the
    // fonts growing was the widest row — the clock, across the middle —
    // not the height, and a stack sized for it leaves a round dial empty
    // at the top and the foot. So, with the clock as it is: each small
    // row is grown a size at a time while everything still fits (the next
    // prayer first, then the date, the countdown, the foot, the weather);
    // and then the gaps are opened, above the clock and below it each as
    // far as its own end row still clears the ring.
    private function fill(dc as Dc, c as Number, clock as Array<Number>, set as Array<Number>, counts as Array<Graphics.FontType>) as Void {
        var pick = [set[0], set[1], set[2], set[3], set[4]] as Array<Number>;
        var grew = true;
        while (grew) {
            grew = false;
            for (var g = 0; g < _growOrder.size(); g++) {
                var row = _growOrder[g];
                if (pick[row] < _caps[row]) {
                    pick[row] += 1;
                    if (place(dc, c, clock, pick, counts, 0, 0, false)) {
                        grew = true;
                    } else {
                        pick[row] -= 1;
                    }
                }
            }
        }
        var above = 0;
        for (var a = AIR_MAX; a > 0 && above == 0; a -= 2) {
            if (place(dc, c, clock, pick, counts, a, 0, false)) {
                above = a;
            }
        }
        var below = 0;
        for (var b = AIR_MAX; b > 0 && below == 0; b -= 2) {
            if (place(dc, c, clock, pick, counts, above, b, false)) {
                below = b;
            }
        }
        // Whatever was tried last and failed left nothing behind; this is
        // the arrangement that stands.
        place(dc, c, clock, pick, counts, above, below, true);
    }

    // Stacks the rows for clock c and the picked fonts, with the gaps
    // above and below the clock opened by that much, and keeps the
    // arrangement if every row fits (or, forced, regardless).
    private function place(dc as Dc, c as Number, clock as Array<Number>, pick as Array<Number>, counts as Array<Graphics.FontType>, above as Number, below as Number, force as Boolean) as Boolean {
        var fDate = _rowFonts[pick[0]];
        var fWeather = _rowFonts[pick[1]];
        var fPrayer = _rowFonts[pick[2]];
        var fFoot = _rowFonts[pick[3]];
        var fCount = counts[pick[4]];
        var full = 2 * (_w / 2 - INSET);
        _lo = -10000;
        _hi = 10000;
        var ok = true;
        var y = 0;

        // The date.
        var bDate = y + up(fDate);
        ok = fit(textW(dc, _dateText, fDate) / 2, y, bDate + 2) && ok;
        y = bDate;

        // The weather, when there is any — or, after days without the
        // phone, a word about that in its place: the weather comes from
        // the phone too, and is as old as the times.
        var bWeather = y;
        var staleLines = null;
        var stale = _staleText;
        var weatherW = weatherWidth(dc, fWeather);
        if (stale != null) {
            staleLines = wrap(dc, stale, fWeather, full * 2 / 3, 2);
            if (staleLines == null) {
                if (!force) {
                    return false;
                }
                staleLines = [stale];
            }
            var staleH = up(fWeather) + Graphics.getFontDescent(fWeather);
            y += GAP_SMALL + above / 2;
            bWeather = y + up(fWeather);
            ok = fit(widest(dc, staleLines, fWeather) / 2, y, y + staleLines.size() * staleH) && ok;
            y += staleLines.size() * staleH - Graphics.getFontDescent(fWeather);
        } else if (weatherW > 0) {
            y += GAP_SMALL + above / 2;
            bWeather = y + up(fWeather);
            ok = fit(weatherW / 2, y, bWeather + 2) && ok;
            y = bWeather;
        }

        // The clock, with the column to its right: am/pm over the seconds.
        var rightW = 0;
        if (_showSeconds) {
            rightW = textW(dc, "88", _fSeconds);
        }
        if (_hour12) {
            var sw = textW(dc, "pm", F_SIDE);
            rightW = sw > rightW ? sw : rightW;
        }
        var group = clock[0] + (rightW > 0 ? SIDE_GAP + rightW : 0);
        y += GAP_CLOCK + above;
        var bClock = y + clock[1];
        ok = fit(group / 2, y, bClock) && ok;
        y = bClock;

        // The next prayer and the countdown; or the message in their place.
        var bPrayer = 0;
        var bCount = 0;
        var reasonLines = null;
        var reason = _reasonText;
        if (reason == null) {
            y += GAP_UNDER + below;
            bPrayer = y + up(fPrayer);
            var prayerW = widestName(dc, fPrayer) + textW(dc, "  ", fPrayer) + textW(dc, _hour12 ? "12:88 pm" : "88:88", fPrayer);
            ok = fit(prayerW / 2, y, bPrayer + Graphics.getFontDescent(fPrayer) / 2) && ok;
            y = bPrayer + GAP_COUNT + below / 2;
            bCount = y + up(fCount);
            ok = fit(textW(dc, "88:88:88", fCount) / 2, y, bCount) && ok;
            y = bCount;
        } else {
            reasonLines = wrap(dc, reason, fPrayer, full * 3 / 4, 3);
            if (reasonLines == null) {
                if (!force) {
                    return false;
                }
                reasonLines = [reason];
            }
            var lineH = up(fPrayer) + Graphics.getFontDescent(fPrayer);
            y += GAP_UNDER + below;
            bPrayer = y + up(fPrayer);
            ok = fit(widest(dc, reasonLines, fPrayer) / 2, y, y + reasonLines.size() * lineH) && ok;
            y += reasonLines.size() * lineH - Graphics.getFontDescent(fPrayer);
        }

        // The foot: the steps, and under them the battery — two short
        // rows, not one long one. The dial narrows towards its foot, and
        // a row as wide as both together has to stop well short of it;
        // each alone can go nearly to the ring.
        var bSteps = y;
        if (_showSteps) {
            y += GAP_FOOT + below;
            bSteps = y + up(fFoot);
            ok = fit(stepsWidth(dc, fFoot) / 2, y, bSteps + 1) && ok;
            y = bSteps + GAP_SMALL + below / 2;
        } else {
            y += GAP_FOOT + below;
        }
        var bFoot = y + up(fFoot);
        ok = fit(batteryWidth(dc, fFoot) / 2, y, bFoot + 1) && ok;
        y = bFoot;

        if (!ok && !force) {
            return false;
        }
        // The stack centred, as far as the ranges allow.
        var start = _h / 2 - y / 2;
        if (ok) {
            start = start < _lo ? _lo : (start > _hi ? _hi : start);
        }
        _fClock = clockFont(c);
        _fDate = fDate;
        _fWeather = fWeather;
        _fPrayer = fPrayer;
        _fCount = fCount;
        _countW = textW(dc, "88:88:88", fCount);
        _countPairW = textW(dc, "88", fCount);
        _countColonW = textW(dc, ":", fCount);
        _fFoot = fFoot;
        _bDate = start + bDate;
        _bWeather = start + bWeather;
        _bClock = start + bClock;
        _bPrayer = start + bPrayer;
        _bCount = start + bCount;
        _bSteps = start + bSteps;
        _bFoot = start + bFoot;
        _rightW = rightW;
        _reasonLines = reasonLines;
        _staleLines = staleLines;
        return true;
    }

    // The weather row's width in font f: the icon, the temperature now,
    // the high and low; 0 with none to show.
    private function weatherWidth(dc as Dc, f as Graphics.FontType) as Number {
        var nowText = _weather[1] as String;
        if (nowText.length() == 0) {
            return 0;
        }
        var w = textW(dc, nowText, f);
        if ((_weather[0] as Number) >= 0) {
            w += ICON + 3;
        }
        var range = _weather[2] as String;
        if (range.length() > 0) {
            w += 8 + textW(dc, range, F_SIDE);
        }
        return w;
    }

    // The foot rows' widths in font f, each for the most it can show.
    private function stepsWidth(dc as Dc, f as Graphics.FontType) as Number {
        return ICON + 3 + textW(dc, "88888", f);
    }

    private function batteryWidth(dc as Dc, f as Graphics.FontType) as Number {
        return CELL_W + 2 + 4 + textW(dc, "100%", f);
    }

    // ---- Drawing ----

    // Text centred on the dial, on baseline b.
    private function drawRow(dc as Dc, text as String, f as Graphics.FontType, b as Number) as Void {
        dc.drawText(_w / 2, b - up(f), f, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Lines centred on the dial, the first on baseline b.
    private function drawLines(dc as Dc, lines as Array<String>, f as Graphics.FontType, b as Number) as Void {
        var lineH = up(f) + Graphics.getFontDescent(f);
        for (var i = 0; i < lines.size(); i++) {
            drawRow(dc, lines[i], f, b + i * lineH);
        }
    }

    // The weather: the icon, the temperature now in white, the day's high
    // and low after it in grey, centred together.
    private function drawWeather(dc as Dc) as Void {
        var f = _fWeather;
        var total = weatherWidth(dc, f);
        if (total <= 0) {
            return;
        }
        var b = _bWeather;
        var x = _w / 2 - total / 2;
        var kind = _weather[0] as Number;
        var nowText = _weather[1] as String;
        var range = _weather[2] as String;
        if (kind >= 0) {
            drawWeatherIcon(dc, kind, (_weather[3] as Number) == 1, x, b - up(f) / 2 - ICON / 2 + 2);
            x += ICON + 3;
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, b - up(f), f, nowText, Graphics.TEXT_JUSTIFY_LEFT);
        x += textW(dc, nowText, f);
        if (range.length() > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + 8, b - up(F_SIDE), F_SIDE, range, Graphics.TEXT_JUSTIFY_LEFT);
        }
    }

    // The clock's figures with the colon in the accent, and to their
    // right am/pm over the seconds; the group centred.
    private function drawClock(dc as Dc, minutes as String, seconds as Number, suffix as String?) as Void {
        var b = _bClock;
        var f = _fClock;
        var timeW = textW(dc, _hourText + ":" + minutes, f);
        var group = timeW + (_rightW > 0 ? SIDE_GAP + _rightW : 0);
        var x = _w / 2 - group / 2;
        var top = b - up(f);
        var hourW = textW(dc, _hourText, f);
        var colonW = textW(dc, ":", f);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, f, _hourText, Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(x + hourW + colonW, top, f, minutes, Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(_accent, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + hourW, top, f, ":", Graphics.TEXT_JUSTIFY_LEFT);

        var sideX = x + timeW + SIDE_GAP;
        var secUp = up(_fSeconds);
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        // Without the seconds there is no box for the partial update. The
        // box is the figures' own height: their font has nothing above them.
        if (_showSeconds) {
            _secondsBox = [sideX, b - secUp, textW(dc, "88", _fSeconds) + 1, secUp];
            dc.drawText(sideX, b - secUp, _fSeconds, seconds.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        }
        if (suffix != null) {
            // Over the seconds; on the baseline when there are none.
            var sb = _showSeconds ? b - secUp - 3 : b;
            dc.drawText(sideX, sb - up(F_SIDE), F_SIDE, suffix, Graphics.TEXT_JUSTIFY_LEFT);
        }
    }

    // The next prayer: its name in the accent, its time in white, the two
    // centred together.
    private function drawPrayer(dc as Dc, name as String, time as String) as Void {
        var f = _fPrayer;
        var gap = textW(dc, "  ", f);
        var nameW = textW(dc, name, f);
        var x = _w / 2 - (nameW + gap + textW(dc, time, f)) / 2;
        var top = _bPrayer - up(f);
        dc.setColor(_accent, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, f, name, Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + nameW + gap, top, f, time, Graphics.TEXT_JUSTIFY_LEFT);
    }

    // The countdown in full, "05:49:12", the figures white and the colons
    // in the accent, centred: one string, then the two colons over it —
    // three draws and no measuring, since this runs every second. Over
    // the power budget it is drawn to the minute, "05:49", and leaves no
    // box for the partial update to come back to.
    private function drawCountdown(dc as Dc, remaining as Number) as Void {
        var parts = Mihrab.hms(remaining);
        var f = _fCount;
        var top = _bCount - up(f);
        var width = _overBudget ? _countW - _countPairW - _countColonW : _countW;
        var x = _w / 2 - width / 2;
        if (!_overBudget) {
            // The figures' own height and no more: see clockfont.py.
            _countdownBox = [x - 1, top, width + 2, up(f)];
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, f, _overBudget ? parts[0] + ":" + parts[1] : parts[0] + ":" + parts[1] + ":" + parts[2], Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(_accent, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + _countPairW, top, f, ":", Graphics.TEXT_JUSTIFY_LEFT);
        if (!_overBudget) {
            dc.drawText(x + 2 * _countPairW + _countColonW, top, f, ":", Graphics.TEXT_JUSTIFY_LEFT);
        }
    }

    // The foot: a footprint and today's steps, and under them a battery
    // and what is left of it — each an icon and a figure, as Garmin's own
    // faces write theirs, each centred on its own row. The battery's fill
    // is green, then yellow, orange and red as it runs down; the figure
    // stays white.
    private function drawFoot(dc as Dc) as Void {
        var f = _fFoot;
        if (_showSteps) {
            var steps = stepCount().format("%d");
            var sx = _w / 2 - (ICON + 3 + textW(dc, steps, f)) / 2;
            dc.setColor(_accent, Graphics.COLOR_TRANSPARENT);
            drawFootprints(dc, sx, _bSteps - up(f) / 2 + 2 - ICON / 2);
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(sx + ICON + 3, _bSteps - up(f), f, steps, Graphics.TEXT_JUSTIFY_LEFT);
        }
        var b = _bFoot;
        var pct = System.getSystemStats().battery;
        pct = pct < 0.0 ? 0.0 : (pct > 100.0 ? 100.0 : pct);
        var pctText = (pct + 0.5).toNumber().format("%d") + "%";
        var x = _w / 2 - (CELL_W + 2 + 4 + textW(dc, pctText, f)) / 2;
        // The cell: a white outline, a nub, and the charge inside it.
        var cy = b - up(f) / 2 + 2 - CELL_H / 2;
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawRectangle(x, cy, CELL_W, CELL_H);
        dc.fillRectangle(x + CELL_W, cy + 3, 2, CELL_H - 6);
        var inner = ((CELL_W - 4) * pct / 100.0 + 0.5).toNumber();
        if (inner > 0) {
            dc.setColor(batteryColor(pct), Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x + 2, cy + 2, inner, CELL_H - 4);
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + CELL_W + 2 + 4, b - up(f), f, pctText, Graphics.TEXT_JUSTIFY_LEFT);
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

    // ---- The day round the edge ----

    // Where a time of day sits on the ring, in drawArc's degrees (0 at
    // three o'clock, counter-clockwise): midnight at the foot, the hours
    // clockwise, noon at the top.
    private function degreesOf(secondsOfDay as Number) as Number {
        var d = 270 - (secondsOfDay * 360 / 86400);
        return d < 0 ? d + 360 : d;
    }

    private function secondsOfDay(epoch as Number) as Number {
        var info = Gregorian.info(new Time.Moment(epoch), Time.FORMAT_SHORT);
        return info.hour * 3600 + info.min * 60 + info.sec;
    }

    // A point on the ring at `degrees`, `inward` pixels in from it.
    private function ringPoint(degrees as Number, inward as Number) as [Number, Number] {
        var r = _w / 2 - RING_IN - inward;
        var a = Math.toRadians(degrees);
        return [_w / 2 + (r * Math.cos(a) + (Math.cos(a) < 0 ? -0.5 : 0.5)).toNumber(), _h / 2 - (r * Math.sin(a) + (Math.sin(a) < 0 ? -0.5 : 0.5)).toNumber()];
    }

    // Clockwise from one time of day to another; nothing when they are
    // the same place (drawArc would draw the whole circle).
    private function arc(dc as Dc, from as Number, to as Number) as Void {
        if (from != to) {
            dc.drawArc(_w / 2, _h / 2, _w / 2 - RING_IN, Graphics.ARC_CLOCKWISE, from, to);
        }
    }

    // The twenty-four hours round the edge — see the head of this file.
    // Square screens have no edge to run round and go without.
    private function drawRing(dc as Dc, now as Number, clock as System.ClockTime) as Void {
        if (!_round) {
            return;
        }
        var cx = _w / 2;
        var cy = _h / 2;
        var r = _w / 2 - RING_IN;
        // The night: the whole way round, thin and grey.
        dc.setPenWidth(RING_PEN);
        dc.setColor(TRACK, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, r);

        var times = Mihrab.times();
        var next = _next;
        if (times == null || next == null) {
            return;
        }
        // The day the next prayer belongs to: after Isha that is
        // tomorrow, whose times are within minutes of today's.
        var day = (next[0] / Mihrab.PER_DAY) * Mihrab.PER_DAY;
        var nowDeg = degreesOf(clock.hour * 3600 + clock.min * 60 + clock.sec);

        // The day, sunrise (Fajr, when the app shows no sunrise) to
        // Maghrib: white over the grey.
        var rise = times[day + Mihrab.SUNRISE] > 0 ? times[day + Mihrab.SUNRISE] : times[day];
        var set = times[day + 4];
        var daylight = false;
        if (rise > 0 && set > rise) {
            var riseDeg = degreesOf(secondsOfDay(rise));
            var setDeg = degreesOf(secondsOfDay(set));
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            arc(dc, riseDeg, setDeg);
            var nowSec = clock.hour * 3600 + clock.min * 60 + clock.sec;
            daylight = nowSec >= secondsOfDay(rise) && nowSec < secondsOfDay(set);
        }

        // From now to the next prayer, thick, in the accent.
        var nextDeg = degreesOf(secondsOfDay(next[1]));
        if (next[1] - now < 86400) {
            dc.setPenWidth(AHEAD_PEN);
            dc.setColor(_accent, Graphics.COLOR_TRANSPARENT);
            arc(dc, nowDeg, nextDeg);
        }

        // A tick at each prayer (sunrise is where the line turns white).
        dc.setPenWidth(TICK_PEN);
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < Mihrab.PER_DAY; i++) {
            var at = times[day + i];
            if (i == Mihrab.SUNRISE || at <= 0 || day + i == next[0]) {
                continue;
            }
            var deg = degreesOf(secondsOfDay(at));
            var outer = ringPoint(deg, -2);
            var inner = ringPoint(deg, TICK_IN);
            dc.drawLine(outer[0], outer[1], inner[0], inner[1]);
        }

        // The next prayer: a ring in the accent, as on the app's Track.
        var at = ringPoint(nextDeg, 0);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(at[0], at[1], BEAD + 2);
        dc.setPenWidth(2);
        dc.setColor(_accent, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(at[0], at[1], BEAD);

        // Now: the bead, the sun's yellow by day and white by night, with
        // a black edge to stand off the line it rides.
        var bead = ringPoint(nowDeg, 0);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(bead[0], bead[1], BEAD + 2);
        dc.setColor(daylight ? SUN : INK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(bead[0], bead[1], BEAD);
        dc.setPenWidth(1);
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

// The system's word that the second-by-second draws have cost more than a
// watch face is allowed (30 ms a second, averaged over a minute): it stops
// asking for them, and whatever they drew stays as it was. The face is
// told, and draws without seconds.
class MihrabFaceDelegate extends WatchUi.WatchFaceDelegate {
    private var _view as MihrabFaceView;

    function initialize(view as MihrabFaceView) {
        WatchFaceDelegate.initialize();
        _view = view;
    }

    function onPowerBudgetExceeded(info as WatchUi.WatchFacePowerInfo) as Void {
        System.println("over the power budget: " + info.executionTimeAverage + " ms average, " + info.executionTimeLimit + " allowed");
        _view.overBudget();
    }
}
