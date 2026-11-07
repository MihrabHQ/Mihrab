// The face, drawn for a MIP screen: solid ink on black, no gradients, no
// anti-aliased fills, nothing animating but the two figures that must —
// the seconds beside the time and, inside the last five minutes, the
// countdown. Those two are redrawn every second inside their own clips
// (a partial update); everything else once a minute.
//
//        Fri 7 Nov
//   12° Cloudy      4 532       weather · steps
//        16:42 07                 the time, the seconds small and grey
//   ────────────────
//        Asr  16:42               the next prayer
//          5h 49m                 the countdown as Minimal writes it
//        ⏱ 1:02:17                an activity's timer, while one runs
//
import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;
import Toybox.Weather;

class MihrabFaceView extends WatchUi.WatchFace {
    // Where the moving parts were last drawn: [x, y, w, h].
    private var _countdownBox as [Number, Number, Number, Number]?;
    private var _secondsBox as [Number, Number, Number, Number]?;

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

        var nowMoment = Time.now();
        var now = nowMoment.value();
        var clock = System.getClockTime();

        // The date.
        var date = Gregorian.info(nowMoment, Time.FORMAT_MEDIUM);
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.12).toNumber(), Graphics.FONT_TINY, date.day_of_week + " " + date.day.format("%d") + " " + date.month, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Weather on the left, steps on the right.
        var rowY = (h * 0.22).toNumber();
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText((w * 0.22).toNumber(), rowY, Graphics.FONT_TINY, weatherText(), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText((w * 0.78).toNumber(), rowY, Graphics.FONT_TINY, stepsText(), Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);

        // The time, with the seconds small and grey beside it.
        drawTime(dc, cx, (h * 0.40).toNumber(), clock);

        // A rule between the time and the prayer.
        dc.setColor(RULE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.25).toNumber(), (h * 0.555).toNumber(), (w * 0.75).toNumber(), (h * 0.555).toNumber());

        // The next prayer and the countdown.
        var next = Mihrab.next(now);
        if (next == null) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            var why = Mihrab.times() == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded;
            dc.drawText(cx, (h * 0.69).toNumber(), Graphics.FONT_TINY, WatchUi.loadResource(why) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.635).toNumber(), Graphics.FONT_SMALL, Mihrab.name(next[0]) + "  " + Mihrab.clock(next[1]), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            drawCountdown(dc, cx, (h * 0.755).toNumber(), next[1] - now);
        }

        // The foot: an activity's timer while one runs; otherwise, after
        // days without the phone, a word about it.
        var foot = activityTimerText();
        if (foot != null) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.89).toNumber(), Graphics.FONT_TINY, foot, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else if (Mihrab.stale(now)) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.89).toNumber(), Graphics.FONT_XTINY, WatchUi.loadResource(Rez.Strings.Stale) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
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

    private const TIME_FONT = Graphics.FONT_NUMBER_MEDIUM;
    private const SECONDS_FONT = Graphics.FONT_TINY;

    // "16:42" large, the seconds small and grey to its right, the pair
    // centred as a whole; "am"/"pm" under the seconds on a 12-hour clock.
    private function drawTime(dc as Dc, cx as Number, cy as Number, clock as System.ClockTime) as Void {
        var hour = clock.hour;
        var suffix = null;
        if (!System.getDeviceSettings().is24Hour) {
            suffix = hour < 12 ? "am" : "pm";
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        var timeText = hour.format("%d") + ":" + clock.min.format("%02d");
        var timeW = dc.getTextWidthInPixels(timeText, TIME_FONT);
        var secW = dc.getTextWidthInPixels("88", SECONDS_FONT);
        var suffixW = suffix == null ? 0 : dc.getTextWidthInPixels(suffix, SECONDS_FONT) + 4;
        var gap = 6;
        var x = cx - (timeW + gap + secW + suffixW) / 2;
        var timeH = dc.getFontHeight(TIME_FONT);
        var secH = dc.getFontHeight(SECONDS_FONT);
        var top = cy - timeH / 2;
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, top, TIME_FONT, timeText, Graphics.TEXT_JUSTIFY_LEFT);
        // The seconds sit on the figures' baseline.
        var secTop = top + timeH - secH - timeH / 10;
        _secondsBox = [x + timeW + gap, secTop, secW + 2, secH];
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + timeW + gap, secTop, SECONDS_FONT, clock.sec.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        if (suffix != null) {
            dc.drawText(x + timeW + gap + secW + 4, secTop, SECONDS_FONT, suffix, Graphics.TEXT_JUSTIFY_LEFT);
        }
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
        var unitH = dc.getFontHeight(unitFont);
        var top = cy - figureH / 2;
        var boxW = dc.getTextWidthInPixels("88h 88m", figureFont) + 2 * dc.getTextWidthInPixels("m", unitFont) + gap + 8;
        _countdownBox = [cx - boxW / 2, top, boxW, figureH];

        var x = cx - width / 2;
        for (var i = 0; i < pieces.size(); i++) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, figureFont, pieces[i][0], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(pieces[i][0], figureFont);
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top + figureH - unitH, unitFont, pieces[i][1], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(pieces[i][1], unitFont) + gap;
        }
    }

    // "12° Cloudy", from the watch's weather (Gadgetbridge feeds it from
    // the phone's weather app); "--" without any.
    private function weatherText() as String {
        if (!(Toybox has :Weather) || !(Weather has :getCurrentConditions)) {
            return "--";
        }
        var c = Weather.getCurrentConditions();
        if (c == null || c.temperature == null) {
            return "--";
        }
        var t = c.temperature as Numeric;
        if (System.getDeviceSettings().temperatureUnits == System.UNIT_STATUTE) {
            t = t * 9 / 5 + 32;
        }
        var word = c.condition == null ? "" : " " + conditionWord(c.condition as Number);
        return t.format("%d") + "°" + word;
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

    // "1:02:17" while an activity's timer runs; null otherwise.
    private function activityTimerText() as String? {
        if (!(Activity has :getActivityInfo)) {
            return null;
        }
        var info = Activity.getActivityInfo();
        if (info == null || !(info has :timerState) || info.timerState != Activity.TIMER_STATE_ON || info.timerTime == null) {
            return null;
        }
        var s = (info.timerTime as Number) / 1000;
        var hh = s / 3600;
        var mm = (s % 3600) / 60;
        var ss = s % 60;
        var text = hh > 0 ? hh.format("%d") + ":" + mm.format("%02d") : mm.format("%d");
        return "⏱ " + text + ":" + ss.format("%02d");
    }
}
