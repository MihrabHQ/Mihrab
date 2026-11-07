// The face: the time, the date, and under them the next prayer — its name,
// its time, and how long until it, written as the phone's Minimal page
// writes it: "5h 49m" with the unit letters small, and inside the last
// five minutes "4m 37s", ticking. The face is drawn once a minute; inside
// those minutes the countdown alone is redrawn every second (a partial
// update, inside its own clip, which is what a watch face's second hand
// is allowed), so the rest of the screen and the battery are left alone.
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class MihrabFaceView extends WatchUi.WatchFace {
    // Where the countdown was last drawn: [x, y, w, h], for the partial update.
    private var _countdownBox as [Number, Number, Number, Number]?;

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
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        _countdownBox = null;

        var nowMoment = Time.now();
        var now = nowMoment.value();
        var clock = System.getClockTime();
        var settings = System.getDeviceSettings();

        // The time, large, a little above the middle.
        var hour = clock.hour;
        var suffix = "";
        if (!settings.is24Hour) {
            suffix = hour < 12 ? "am" : "pm";
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        var timeText = hour.format("%d") + ":" + clock.min.format("%02d");
        var timeFont = Graphics.FONT_NUMBER_THAI_HOT;
        var timeY = h * 0.36;
        dc.drawText(cx, timeY, timeFont, timeText, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (suffix.length() > 0) {
            var tw = dc.getTextWidthInPixels(timeText, timeFont);
            dc.drawText(cx + tw / 2 + 4, timeY + dc.getFontHeight(timeFont) / 4, Graphics.FONT_TINY, suffix, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        // The date above it.
        var date = Gregorian.info(nowMoment, Time.FORMAT_MEDIUM);
        var dateText = date.day_of_week + " " + date.day.format("%d") + " " + date.month;
        dc.drawText(cx, h * 0.16, Graphics.FONT_SMALL, dateText, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // A hairline between the time and the prayer.
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w * 0.25, h * 0.56, w * 0.75, h * 0.56);

        // The next prayer.
        var next = Mihrab.next(now);
        if (next == null) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var why = Mihrab.times() == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded;
            dc.drawText(cx, h * 0.70, Graphics.FONT_SMALL, WatchUi.loadResource(why) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }
        var index = next[0];
        var at = next[1];
        var label = Mihrab.name(index) + "  " + Mihrab.clock(at);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.65, Graphics.FONT_SMALL, label, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        drawCountdown(dc, cx, (h * 0.79).toNumber(), at - now);

        // Days without a message from the phone: a quiet mark, not a wall.
        if (Mihrab.stale(now)) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.91, Graphics.FONT_XTINY, WatchUi.loadResource(Rez.Strings.Stale) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // Every second, between the minute's full draws: only the countdown,
    // and only inside the last five minutes, when it has seconds to show.
    function onPartialUpdate(dc as Dc) as Void {
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
        // The box is the widest the countdown gets ("4m 59s" with seconds,
        // or hours and minutes), so a shorter one clears the longer one.
        var boxW = dc.getTextWidthInPixels("88h 88m", figureFont) + 2 * dc.getTextWidthInPixels("m", unitFont) + gap + 8;
        _countdownBox = [cx - boxW / 2, top, boxW, figureH];

        var x = cx - width / 2;
        for (var i = 0; i < pieces.size(); i++) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, top, figureFont, pieces[i][0], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(pieces[i][0], figureFont);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            // The small letter sits on the figures' baseline.
            dc.drawText(x, top + figureH - unitH, unitFont, pieces[i][1], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(pieces[i][1], unitFont) + gap;
        }
    }
}
