import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.WatchUi;

// The glance: one line, "Asr 16:42 · 49m".
(:glance)
class MihrabGlance extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.clear();
        var h = dc.getHeight();
        var now = Time.now().value();
        var next = Mihrab.next(now);
        dc.drawText(0, h / 4, Graphics.FONT_GLANCE, WatchUi.loadResource(Rez.Strings.NextLong) as String, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        var line = next == null
            ? (WatchUi.loadResource(Rez.Strings.OpenMihrab) as String)
            : Mihrab.name(next[0]) + " " + Mihrab.clock(next[1]) + " · " + Mihrab.countdown(next[1] - now);
        dc.drawText(0, 3 * h / 4, Graphics.FONT_GLANCE_NUMBER, line, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

// The page: today's five, the next one marked, the countdown under them.
class MihrabWidgetView extends WatchUi.View {
    function initialize() {
        View.initialize();
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var now = Time.now().value();
        var next = Mihrab.next(now);
        var times = Mihrab.times();
        if (times == null || next == null) {
            var why = times == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded;
            dc.drawText(w / 2, h / 2, Graphics.FONT_SMALL, WatchUi.loadResource(why) as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }
        // The day the next prayer belongs to: its five, Fajr to Isha.
        var day = next[0] / Mihrab.PER_DAY;
        var rowH = dc.getFontHeight(Graphics.FONT_SMALL) + 2;
        var top = h / 2 - (Mihrab.PER_DAY * rowH) / 2 - rowH / 2;
        for (var i = 0; i < Mihrab.PER_DAY; i++) {
            var index = day * Mihrab.PER_DAY + i;
            var at = times[index];
            var isNext = index == next[0];
            dc.setColor(isNext ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var y = top + i * rowH;
            dc.drawText(w * 0.28, y, Graphics.FONT_SMALL, Mihrab.name(i), Graphics.TEXT_JUSTIFY_LEFT);
            dc.drawText(w * 0.72, y, Graphics.FONT_SMALL, at > 0 ? Mihrab.clock(at) : "—", Graphics.TEXT_JUSTIFY_RIGHT);
            if (isNext) {
                dc.drawText(w * 0.28 - 12, y, Graphics.FONT_SMALL, "›", Graphics.TEXT_JUSTIFY_RIGHT);
            }
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, top + Mihrab.PER_DAY * rowH + rowH / 2, Graphics.FONT_MEDIUM, Mihrab.countdown(next[1] - now), Graphics.TEXT_JUSTIFY_CENTER);
    }
}
