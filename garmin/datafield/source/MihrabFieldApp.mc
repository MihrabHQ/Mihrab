// The data field: one slot on any activity screen, or the data-field
// complication of a watch face that offers one, reading "Asr 1:23" — the
// next prayer and the time until it — and, inside its last minute, "now".
import Toybox.Activity;
import Toybox.Application;
import Toybox.Background;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

(:background)
class MihrabFieldApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    (:typecheck(disableBackgroundCheck))
    function getInitialView() as [Views] or [Views, InputDelegates] {
        if (Background has :registerForPhoneAppMessageEvent) {
            Background.registerForPhoneAppMessageEvent();
        }
        return [new MihrabField()];
    }

    function getServiceDelegate() as [ServiceDelegate] {
        return [new MihrabService()];
    }

    (:typecheck(disableBackgroundCheck))
    function onBackgroundData(data as PersistableType) as Void {
        WatchUi.requestUpdate();
    }
}

// "Asr 1h 23m" under the label, in the largest font the field's box
// takes; in a box too narrow for one line, the name over the countdown.
// Drawn here rather than by a simple field, which clips a long name
// ("Maghrib", "Fadschr") in a small box.
class MihrabField extends WatchUi.DataField {
    private var _label as String = "";
    private var _value as Array<String> = ["--"] as Array<String>;

    function initialize() {
        DataField.initialize();
        _label = WatchUi.loadResource(Rez.Strings.Label) as String;
    }

    function compute(info as Activity.Info) as Void {
        var now = Time.now().value();
        var next = Mihrab.next(now);
        _value = next == null
            ? ["--"] as Array<String>
            : [Mihrab.name(next[0]), Mihrab.countdown(next[1] - now)] as Array<String>;
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var bg = getBackgroundColor();
        var fg = bg == Graphics.COLOR_BLACK ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;
        dc.setColor(fg, bg);
        dc.clear();
        var pad = 4;
        var labelFont = Graphics.FONT_XTINY;
        var labelH = Graphics.getFontAscent(labelFont) + Graphics.getFontDescent(labelFont);
        // The label only when the box has room for it and one line below.
        var showLabel = h >= labelH + 2 * Graphics.getFontHeight(Graphics.FONT_XTINY) && dc.getTextWidthInPixels(_label, labelFont) <= w - 2 * pad;
        var top = showLabel ? labelH : 0;
        if (showLabel) {
            dc.drawText(w / 2, 0, labelFont, _label, Graphics.TEXT_JUSTIFY_CENTER);
        }
        var room = h - top;
        var oneLine = _value.size() == 1 ? _value[0] : _value[0] + " " + _value[1];
        var fonts = [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        // One line in the largest font that fits; the number fonts only
        // for figures, which "--" is and a name is not.
        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i];
            if (f == Graphics.FONT_NUMBER_MEDIUM && _value.size() > 1) {
                continue;
            }
            var lineH = Graphics.getFontAscent(f) + Graphics.getFontDescent(f);
            if (lineH <= room && dc.getTextWidthInPixels(oneLine, f) <= w - 2 * pad) {
                dc.drawText(w / 2, top + (room - lineH) / 2, f, oneLine, Graphics.TEXT_JUSTIFY_CENTER);
                return;
            }
        }
        // Two lines: the name over the countdown.
        if (_value.size() > 1) {
            for (var i = 1; i < fonts.size(); i++) {
                var f = fonts[i];
                var lineH = Graphics.getFontAscent(f) + Graphics.getFontDescent(f);
                if (2 * lineH <= room && dc.getTextWidthInPixels(_value[0], f) <= w - 2 * pad && dc.getTextWidthInPixels(_value[1], f) <= w - 2 * pad) {
                    var y = top + (room - 2 * lineH) / 2;
                    dc.drawText(w / 2, y, f, _value[0], Graphics.TEXT_JUSTIFY_CENTER);
                    dc.drawText(w / 2, y + lineH, f, _value[1], Graphics.TEXT_JUSTIFY_CENTER);
                    return;
                }
            }
        }
        // The smallest box of all: the countdown alone, which is the point.
        var last = _value[_value.size() - 1];
        dc.drawText(w / 2, top + room / 2, Graphics.FONT_XTINY, last, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}
