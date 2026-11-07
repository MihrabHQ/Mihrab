// The face, drawn for a MIP screen: solid ink on black, no gradients, no
// anti-aliased fills, nothing animating but what must — the seconds, an
// activity's running timer and, inside the last five minutes, the
// countdown. Those are redrawn every second inside their own clips (a
// partial update); everything else once a minute.
//
//            Sat 7 Nov                  the date
//            00:00:00                   the activity timer, grey at rest
//   ☁ 8°                  am
//   16°/7°   16:42        07            the weather · the time · the seconds
//            ─────
//          Asr  16:42                   the next prayer
//            5h 49m                     the countdown as Minimal writes it
//           👣 004532                   today's steps
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
    // Where the moving parts were last drawn: [x, y, w, h].
    private var _countdownBox as [Number, Number, Number, Number]?;
    private var _secondsBox as [Number, Number, Number, Number]?;
    private var _timerBox as [Number, Number, Number, Number]?;

    private const INK = Graphics.COLOR_WHITE;
    private const DIM = Graphics.COLOR_LT_GRAY;
    private const RULE = Graphics.COLOR_DK_GRAY;
    private const SUN = Graphics.COLOR_YELLOW;

    private const ROW_FONT = Graphics.FONT_TINY;
    private const SMALL_FONT = Graphics.FONT_XTINY;
    private const SECONDS_FONT = Graphics.FONT_TINY;
    private const TIMER_FONT = Graphics.FONT_TINY;
    // The weather icon's box, square.
    private const ICON = 16;

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

        // The date.
        var date = Gregorian.info(nowMoment, Time.FORMAT_MEDIUM);
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.125).toNumber(), ROW_FONT, date.day_of_week + " " + date.day.format("%d") + " " + date.month, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // The activity timer, always there — white while it runs, grey at
        // rest — unless, after days without the phone, a word about that
        // has to take its place.
        var timerY = (h * 0.225).toNumber();
        var timer = activityTimer();
        if (timer[1] || !Mihrab.stale(now)) {
            drawTimer(dc, cx, timerY, timer);
        } else {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, timerY, SMALL_FONT, WatchUi.loadResource(Rez.Strings.Stale) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        // The time, the weather to its left and the seconds to its right,
        // and a rule under the figures as wide as they are.
        var baseline = (h * 0.54).toNumber();
        var figures = drawTime(dc, cx, baseline, clock, nowMoment);
        dc.setColor(RULE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(figures[0], baseline + 5, figures[0] + figures[1] + 1, baseline + 5);

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

        // Today's steps, at the foot.
        drawSteps(dc, cx, (h * 0.865).toNumber());
    }

    // Every second between the minute's full draws: the seconds, a
    // running timer, and the countdown once it has seconds to show.
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
                dc.drawText(dc.getWidth() / 2, tbox[1], TIMER_FONT, timer[0], Graphics.TEXT_JUSTIFY_CENTER);
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

    // The timer centred on (cx, cy). Remembers where.
    private function drawTimer(dc as Dc, cx as Number, cy as Number, timer as [String, Boolean]) as Void {
        var top = cy - dc.getFontHeight(TIMER_FONT) / 2;
        var boxW = dc.getTextWidthInPixels("00:00:00", TIMER_FONT) + 4;
        _timerBox = [cx - boxW / 2, top, boxW, dc.getFontHeight(TIMER_FONT)];
        dc.setColor(timer[1] ? INK : DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, top, TIMER_FONT, timer[0], Graphics.TEXT_JUSTIFY_CENTER);
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

    // "16:42" in the largest number font that fits the dial with the
    // weather on its left and the seconds on its right, the three centred
    // together on cx. On the left, the weather's icon and the temperature
    // now, and under them today's high and low on the figures' baseline;
    // on the right the seconds on that baseline, "am"/"pm" above them on a
    // 12-hour clock. Returns the figures' [x, width].
    private function drawTime(dc as Dc, cx as Number, baseline as Number, clock as System.ClockTime, now as Time.Moment) as [Number, Number] {
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
        var gap = 5;
        var w = dc.getWidth();
        var h = dc.getHeight();

        var weather = weatherParts(now);
        var kind = weather[0] as Number;
        var nowText = weather[1] as String;
        var rangeText = weather[2] as String;
        var nowW = dc.getTextWidthInPixels(nowText, ROW_FONT);
        var leftW = (kind >= 0 ? ICON + 3 : 0) + nowW;
        var rangeW = dc.getTextWidthInPixels(rangeText, SMALL_FONT);
        if (rangeW > leftW) {
            leftW = rangeW;
        }
        var secW = dc.getTextWidthInPixels("88", SECONDS_FONT);
        var rightW = secW;
        if (suffix != null && dc.getTextWidthInPixels(suffix, SMALL_FONT) > rightW) {
            rightW = dc.getTextWidthInPixels(suffix, SMALL_FONT);
        }
        // The side columns reach this far above the baseline.
        var upperBase = baseline - Graphics.getFontAscent(SMALL_FONT) - 2;
        var sideTop = upperBase - Graphics.getFontAscent(ROW_FONT);
        var half = halfChord(w, h, sideTop);
        var halfB = halfChord(w, h, baseline);
        if (halfB < half) {
            half = halfB;
        }

        var fonts = [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD] as Array<Graphics.FontDefinition>;
        var font = Graphics.FONT_NUMBER_MILD;
        // Sized for this hour's digits and the widest minutes, so the size
        // holds through the hour.
        var widest = hour.format("%d") + ":88";
        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i];
            // The figures' visible top: the font's ascent carries some
            // headroom above them.
            var topY = baseline - Graphics.getFontAscent(f) * 3 / 4;
            var groupW = leftW + gap + dc.getTextWidthInPixels(widest, f) + gap + rightW;
            if (topY > (h * 0.29).toNumber() && groupW / 2 + 4 <= half) {
                font = f;
                break;
            }
        }
        var timeW = dc.getTextWidthInPixels(timeText, font);
        var x = cx - (leftW + gap + timeW + gap + rightW) / 2 + leftW + gap;
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, baseline - Graphics.getFontAscent(font), font, timeText, Graphics.TEXT_JUSTIFY_LEFT);

        // Right: the seconds on the baseline, am/pm above.
        var secTop = baseline - Graphics.getFontAscent(SECONDS_FONT);
        var secX = x + timeW + gap;
        _secondsBox = [secX, secTop, secW + 2, Graphics.getFontAscent(SECONDS_FONT) + Graphics.getFontDescent(SECONDS_FONT)];
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(secX, secTop, SECONDS_FONT, clock.sec.format("%02d"), Graphics.TEXT_JUSTIFY_LEFT);
        if (suffix != null) {
            dc.drawText(secX, upperBase - Graphics.getFontAscent(SMALL_FONT), SMALL_FONT, suffix, Graphics.TEXT_JUSTIFY_LEFT);
        }

        // Left: the icon and the temperature now; under them high/low.
        var right = x - gap;
        if (rangeText.length() > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(right, baseline - Graphics.getFontAscent(SMALL_FONT), SMALL_FONT, rangeText, Graphics.TEXT_JUSTIFY_RIGHT);
        } else {
            upperBase = baseline;
        }
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(right, upperBase - Graphics.getFontAscent(ROW_FONT), ROW_FONT, nowText, Graphics.TEXT_JUSTIFY_RIGHT);
        if (kind >= 0) {
            // Centred on the figures' visible middle.
            var mid = upperBase - Graphics.getFontAscent(ROW_FONT) * 3 / 8;
            drawWeatherIcon(dc, kind, (weather[3] as Number) == 1, right - nowW - 3 - ICON, mid - ICON / 2);
        }
        return [x, timeW];
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

    // A footprint and today's steps as six figures, "004532", centred on
    // (cx, cy) in the largest font that fits the dial there: the figures
    // the count uses white (its own zeros too, and the one of a count of
    // none), the unused leading zeros grey.
    private function drawSteps(dc as Dc, cx as Number, cy as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var steps = stepCount();
        var text = steps.format("%06d");
        var lead = 0;
        while (lead < text.length() - 1 && (text.substring(lead, lead + 1) as String).equals("0")) {
            lead++;
        }
        var fonts = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var font = Graphics.FONT_XTINY;
        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i];
            var bottom = cy + Graphics.getFontAscent(f) / 2;
            if (ICON + 4 + dc.getTextWidthInPixels("000000", f) + 8 <= 2 * halfChord(w, h, bottom)) {
                font = f;
                break;
            }
        }
        var textW = dc.getTextWidthInPixels(text, font);
        var x = cx - (ICON + 4 + textW) / 2;
        dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
        drawFootprints(dc, x, cy - ICON / 2);
        x += ICON + 4;
        var zeros = text.substring(0, lead) as String;
        if (zeros.length() > 0) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, cy, font, zeros, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            x += dc.getTextWidthInPixels(zeros, font);
        }
        if (lead < text.length()) {
            dc.setColor(INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, cy, font, text.substring(lead, text.length()) as String, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
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

    // Today's steps (0 when the watch has none to give), at most 999999.
    private function stepCount() as Number {
        var steps = ActivityMonitor.getInfo().steps;
        if (steps == null) {
            return 0;
        }
        var n = steps as Number;
        return n > 999999 ? 999999 : n;
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
