// The face, drawn for a MIP screen: solid ink on black, no gradients, no
// anti-aliased fills, nothing animating but the two figures that must —
// the seconds beside the time and, inside the last five minutes, the
// countdown. Those two are redrawn every second inside their own clips
// (a partial update); everything else once a minute.
//
//      Fri 7 Nov  👣4 532         the date · today's steps
//    8°C Cloudy  10°/4°           the weather now · today's high/low
//       16:42 07                  the time as large as fits, centred;
//       ────────                  the seconds small and grey beside it
//        Asr  16:42               the next prayer
//          5h 49m                 the countdown as Minimal writes it
//         00:00:00                an activity's timer, grey when idle
//
import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;
import Toybox.Weather;

class MihrabFaceView extends WatchUi.WatchFace {
    // Where the moving parts were last drawn: [x, y, w, h].
    private var _countdownBox as [Number, Number, Number, Number]?;
    private var _secondsBox as [Number, Number, Number, Number]?;
    private var _timerBox as [Number, Number, Number, Number]?;
    private var _timerFont as Graphics.FontDefinition = Graphics.FONT_TINY;

    private const INK = Graphics.COLOR_WHITE;
    private const DIM = Graphics.COLOR_LT_GRAY;
    private const RULE = Graphics.COLOR_DK_GRAY;

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
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;

        if (dc has :clearClip) {
            dc.clearClip();
        }
        dc.setColor(INK, Graphics.COLOR_BLACK);
        dc.clear();
        _countdownBox = null;
        _secondsBox = null;
        _timerBox = null;

        var nowMoment = Time.now();
        var now = nowMoment.value();
        var clock = System.getClockTime();

        var row = Graphics.FONT_TINY;

        // The date in grey, then a footprint and today's steps, the pair
        // centred together.
        var date = Gregorian.info(nowMoment, Time.FORMAT_MEDIUM);
        var dateText = date.day_of_week + " " + date.day.format("%d") + " " + date.month;
        var steps = stepsText();
        var icon = 16;
        var dateW = dc.getTextWidthInPixels(dateText, row);
        var stepsW = dc.getTextWidthInPixels(steps, row);
        var x = cx - (dateW + 14 + icon + 3 + stepsW) / 2;
        var y1 = (h * 0.125).toNumber();
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y1, row, dateText, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        x += dateW + 14;
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        drawFootprints(dc, x, y1 - icon / 2);
        dc.drawText(x + icon + 3, y1, row, steps, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        // The weather now in white, today's high and low in grey.
        var weather = weatherParts();
        var nowW = dc.getTextWidthInPixels(weather[0], row);
        var rangeW = weather[1].length() == 0 ? 0 : 10 + dc.getTextWidthInPixels(weather[1], row);
        x = cx - (nowW + rangeW) / 2;
        var y2 = (h * 0.225).toNumber();
        dc.drawText(x, y2, row, weather[0], Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        if (rangeW > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + nowW + 10, y2, row, weather[1], Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        // The time, with the seconds small and grey beside it, and a
        // rule under the figures as wide as they are.
        var baseline = (h * 0.54).toNumber();
        var timeW = drawTime(dc, cx, baseline, clock);
        dc.setColor(RULE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(cx - timeW / 2, baseline + 5, cx + timeW / 2 + 1, baseline + 5);

        // The next prayer and the countdown.
        var next = Mihrab.next(now);
        if (next == null) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            var why = Mihrab.times() == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded;
            dc.drawText(cx, (h * 0.69).toNumber(), Graphics.FONT_TINY, WatchUi.loadResource(why) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.64).toNumber(), Graphics.FONT_SMALL, Mihrab.name(next[0]) + "  " + Mihrab.clock(next[1]), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            drawCountdown(dc, cx, (h * 0.755).toNumber(), next[1] - now);
        }

        // The foot: the activity timer, always there — white while it
        // runs, grey at rest — unless, after days without the phone, a
        // word about that has to take its place.
        var timer = activityTimer();
        if (timer[1] || !Mihrab.stale(now)) {
            drawTimer(dc, timer);
        } else {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.87).toNumber(), Graphics.FONT_XTINY, WatchUi.loadResource(Rez.Strings.Stale) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // The timer, small: the larger of two fonts that fits the dial
    // where they sit, centred, from h*0.845 down. Remembers where.
    private function drawTimer(dc as Dc, timer as [String, Boolean]) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var top = (h * 0.845).toNumber();
        var fonts = [Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var font = Graphics.FONT_XTINY;
        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i];
            var textW = dc.getTextWidthInPixels("00:00:00", f);
            var bottom = top + Graphics.getFontAscent(f);
            if (bottom < h - 4 && textW + 8 <= 2 * halfChord(w, h, bottom)) {
                font = f;
                break;
            }
        }
        _timerFont = font;
        var boxW = dc.getTextWidthInPixels("00:00:00", font) + 4;
        _timerBox = [w / 2 - boxW / 2, top, boxW, dc.getFontHeight(font)];
        dc.setColor(timer[1] ? INK : DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, top, font, timer[0], Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Half the width of a round dial at row y (the whole width if square).
    private function halfChord(w as Number, h as Number, y as Number) as Number {
        if (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND) {
            return w / 2;
        }
        var r = w / 2;
        var d = y - h / 2;
        var sq = r * r - d * d;
        return sq <= 0 ? 0 : Math.sqrt(sq).toNumber();
    }

    // Every second between the minute's full draws: the seconds, and the
    // countdown once it has seconds of its own to show.
    function onPartialUpdate(dc as Dc) as Void {
        var sbox = _secondsBox;
        if (sbox != null) {
            dc.setClip(sbox[0], sbox[1], sbox[2], sbox[3]);
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
            dc.clear();
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(sbox[0], sbox[1], SECONDS_FONT, System.getClockTime().sec.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
            dc.clearClip();
        }
        var tbox = _timerBox;
        if (tbox != null) {
            var timer = activityTimer();
            if (timer[1]) {
                dc.setClip(tbox[0], tbox[1], tbox[2], tbox[3]);
                dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
                dc.clear();
                dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
                dc.drawText(dc.getWidth() / 2, tbox[1], _timerFont, timer[0], Graphics.TEXT_JUSTIFY_CENTER);
                dc.clearClip();
            }
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
        var remaining = next[1] - now;
        if (remaining >= Mihrab.SECONDS_UNDER) {
            return;
        }
        dc.setClip(box[0], box[1], box[2], box[3]);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        drawCountdown(dc, dc.getWidth() / 2, box[1] + box[3] / 2, remaining);
        dc.clearClip();
    }

    private const SECONDS_FONT = Graphics.FONT_TINY;

    // "16:42" in the largest number font whose figures, with the seconds
    // beside them, fit the dial at this height; the figures centred on
    // cx, the seconds small and grey to their right on the same baseline,
    // "am"/"pm" stacked above the seconds on a 12-hour clock. Returns the
    // figures' width.
    private function drawTime(dc as Dc, cx as Number, baseline as Number, clock as System.ClockTime) as Number {
        var hour = clock.hour;
        var suffix = null;
        if (Mihrab.hour12()) {
            suffix = hour < 12 ? "am" : "pm";
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        var timeText = hour.format("%d") + ":" + clock.min.format("%02d");
        var gap = 4;
        var secW = dc.getTextWidthInPixels("88", SECONDS_FONT);
        var fonts = [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD] as Array<Graphics.FontDefinition>;
        var font = Graphics.FONT_NUMBER_MILD;
        var w = dc.getWidth();
        var h = dc.getHeight();
        // Sized for this hour's digits and the widest minutes, so the
        // size holds through the hour.
        var widest = hour.format("%d") + ":88";
        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i];
            var fw = dc.getTextWidthInPixels(widest, f);
            // The figures' visible top (the font's ascent carries some
            // headroom above them); the seconds hang off the right, so
            // check the narrower of that row and the baseline.
            var topY = baseline - Graphics.getFontAscent(f) * 3 / 4;
            var half = halfChord(w, h, topY);
            var halfB = halfChord(w, h, baseline);
            if (halfB < half) {
                half = halfB;
            }
            if (topY > (h * 0.27).toNumber() && fw / 2 + gap + secW + 3 <= half) {
                font = f;
                break;
            }
        }
        var timeW = dc.getTextWidthInPixels(timeText, font);
        var x = cx - timeW / 2;
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, baseline - Graphics.getFontAscent(font), font, timeText, Graphics.TEXT_JUSTIFY_LEFT);
        // The seconds share the figures' baseline.
        var secTop = baseline - Graphics.getFontAscent(SECONDS_FONT);
        var secX = x + timeW + gap;
        _secondsBox = [secX, secTop, secW + 2, Graphics.getFontAscent(SECONDS_FONT) + Graphics.getFontDescent(SECONDS_FONT)];
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(secX, secTop, SECONDS_FONT, clock.sec.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        if (suffix != null) {
            dc.drawText(secX, secTop - Graphics.getFontAscent(SECONDS_FONT), Graphics.FONT_XTINY, suffix, Graphics.TEXT_JUSTIFY_LEFT);
        }
        return timeW;
    }

    // "5h 49m": the figures large, the unit letters small on the same
    // baseline, centred as a whole on cx. Remembers where it was drawn.
    private function drawCountdown(dc as Dc, cx as Number, cy as Number, remaining as Number) as Void {
        var pieces = Mihrab.pieces(remaining);
        var figureFont = Graphics.FONT_LARGE;
        var unitFont = Graphics.FONT_XTINY;
        var gap = 6;
        var width = 0;
        for (var i = 0; i < pieces.size(); i++) {
            width += dc.getTextWidthInPixels(pieces[i][0], figureFont) + dc.getTextWidthInPixels(pieces[i][1], unitFont);
            if (i > 0) {
                width += gap;
            }
        }
        var figureH = dc.getFontHeight(figureFont);
        var top = cy - figureH / 2;
        // The unit letters sit on the figures' baseline.
        var unitTop = top + Graphics.getFontAscent(figureFont) - Graphics.getFontAscent(unitFont);
        var boxW = dc.getTextWidthInPixels("88h 88m", figureFont) + 2 * dc.getTextWidthInPixels("m", unitFont) + gap + 8;
        _countdownBox = [cx - boxW / 2, top, boxW, figureH];

        var x = cx - width / 2;
        for (var i = 0; i < pieces.size(); i++) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, figureFont, pieces[i][0], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(pieces[i][0], figureFont);
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, unitTop, unitFont, pieces[i][1], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(pieces[i][1], unitFont) + gap;
        }
    }

    // ["8°C Cloudy", "10°/4°"] from the watch's weather (Gadgetbridge
    // feeds it from the phone's weather app), in the unit of the place the
    // Mihrab app is set to; ["--", ""] without any.
    private function weatherParts() as [String, String] {
        if (!(Toybox has :Weather) || !(Weather has :getCurrentConditions)) {
            return ["--", ""];
        }
        var c = Weather.getCurrentConditions();
        if (c == null || c.temperature == null) {
            return ["--", ""];
        }
        var word = c.condition == null ? "" : " " + conditionWord(c.condition as Number);
        var f = Mihrab.fahrenheit();
        var now = degrees(c.temperature as Numeric, f) + (f ? "°F" : "°C") + word;
        var range = "";
        if (c.highTemperature != null && c.lowTemperature != null) {
            range = degrees(c.highTemperature as Numeric, f) + "°/" + degrees(c.lowTemperature as Numeric, f) + "°";
        }
        return [now, range];
    }

    // A temperature the watch keeps in Celsius, rounded, in the unit asked.
    private function degrees(celsius as Numeric, fahrenheit as Boolean) as String {
        var v = celsius.toFloat();
        if (fahrenheit) {
            v = v * 9.0 / 5.0 + 32.0;
        }
        return Math.round(v).toNumber().format("%d");
    }

    // Two footprints, 16 px square, top-left at (x, y): a sole and a
    // heel each, the right foot a step ahead.
    private function drawFootprints(dc as Dc, x as Number, y as Number) as Void {
        dc.fillEllipse(x + 4, y + 7, 3, 5);
        dc.fillCircle(x + 4, y + 14, 2);
        dc.fillEllipse(x + 12, y + 4, 3, 5);
        dc.fillCircle(x + 12, y + 11, 2);
    }

    // A short word for the condition; the rarer ones fall into the nearest.
    private function conditionWord(condition as Number) as String {
        switch (condition) {
            case Weather.CONDITION_CLEAR:
            case Weather.CONDITION_MOSTLY_CLEAR:
            case Weather.CONDITION_PARTLY_CLEAR:
            case Weather.CONDITION_FAIR:
                return WatchUi.loadResource(Rez.Strings.WClear) as String;
            case Weather.CONDITION_PARTLY_CLOUDY:
            case Weather.CONDITION_MOSTLY_CLOUDY:
            case Weather.CONDITION_CLOUDY:
            case Weather.CONDITION_THIN_CLOUDS:
                return WatchUi.loadResource(Rez.Strings.WCloudy) as String;
            case Weather.CONDITION_SNOW:
            case Weather.CONDITION_LIGHT_SNOW:
            case Weather.CONDITION_HEAVY_SNOW:
            case Weather.CONDITION_WINTRY_MIX:
            case Weather.CONDITION_RAIN_SNOW:
            case Weather.CONDITION_LIGHT_RAIN_SNOW:
            case Weather.CONDITION_HEAVY_RAIN_SNOW:
            case Weather.CONDITION_CHANCE_OF_SNOW:
            case Weather.CONDITION_CHANCE_OF_RAIN_SNOW:
            case Weather.CONDITION_FLURRIES:
            case Weather.CONDITION_ICE_SNOW:
            case Weather.CONDITION_SLEET:
            case Weather.CONDITION_HAIL:
                return WatchUi.loadResource(Rez.Strings.WSnow) as String;
            case Weather.CONDITION_THUNDERSTORMS:
            case Weather.CONDITION_SCATTERED_THUNDERSTORMS:
            case Weather.CONDITION_CHANCE_OF_THUNDERSTORMS:
                return WatchUi.loadResource(Rez.Strings.WStorm) as String;
            case Weather.CONDITION_FOG:
            case Weather.CONDITION_HAZY:
            case Weather.CONDITION_MIST:
            case Weather.CONDITION_HAZE:
            case Weather.CONDITION_SMOKE:
            case Weather.CONDITION_DUST:
            case Weather.CONDITION_SAND:
            case Weather.CONDITION_VOLCANIC_ASH:
                return WatchUi.loadResource(Rez.Strings.WFog) as String;
            case Weather.CONDITION_WINDY:
            case Weather.CONDITION_SANDSTORM:
            case Weather.CONDITION_HURRICANE:
            case Weather.CONDITION_TROPICAL_STORM:
            case Weather.CONDITION_TORNADO:
                return WatchUi.loadResource(Rez.Strings.WWindy) as String;
            default:
                return WatchUi.loadResource(Rez.Strings.WRain) as String;
        }
    }

    // Today's steps, thousands spaced: "4 532".
    private function stepsText() as String {
        var info = ActivityMonitor.getInfo();
        var steps = info.steps;
        if (steps == null) {
            return "--";
        }
        var n = steps as Number;
        if (n < 1000) {
            return n.format("%d");
        }
        return (n / 1000).format("%d") + " " + (n % 1000).format("%03d");
    }

    // The activity timer as "00:00:00", and whether it is running.
    private function activityTimer() as [String, Boolean] {
        var ms = 0;
        var running = false;
        if (Activity has :getActivityInfo) {
            var info = Activity.getActivityInfo();
            if (info != null && info.timerTime != null) {
                ms = info.timerTime as Number;
                running = (info has :timerState) && info.timerState == Activity.TIMER_STATE_ON;
            }
        }
        var s = ms / 1000;
        var text = (s / 3600).format("%02d") + ":" + ((s % 3600) / 60).format("%02d") + ":" + (s % 60).format("%02d");
        return [text, running];
    }
}
