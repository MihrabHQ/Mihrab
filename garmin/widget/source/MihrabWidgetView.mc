import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// The glance: "Next prayer" over "Asr 16:42 · 49m", in the largest font
// the glance's width takes; without room for the countdown, the prayer
// and its time alone.
(:glance)
class MihrabGlance extends WatchUi.GlanceView {
    // The progress bar's height, at the foot.
    private const BAR = 2;

    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var now = Time.now().value();
        var next = Mihrab.next(now);
        var title = WatchUi.loadResource(Rez.Strings.NextLong) as String;
        dc.drawText(0, h / 4, fitting(dc, [title], [Graphics.FONT_GLANCE, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, w), title, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        var lines = [] as Array<String>;
        if (next == null) {
            lines.add(WatchUi.loadResource(Rez.Strings.OpenMihrab) as String);
        } else {
            drawProgress(dc, now);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var prayer = Mihrab.name(next[0]) + " " + Mihrab.clock(next[1]);
            lines.add(prayer + " · " + Mihrab.countdown(next[1] - now));
            lines.add(prayer);
        }
        var fonts = [Graphics.FONT_GLANCE_NUMBER, Graphics.FONT_GLANCE, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        // The fullest line in the largest font that takes it.
        for (var i = 0; i < lines.size(); i++) {
            for (var f = 0; f < fonts.size(); f++) {
                if (dc.getTextWidthInPixels(lines[i], fonts[f]) <= w) {
                    dc.drawText(0, 3 * h / 4, fonts[f], lines[i], Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
                    return;
                }
            }
        }
        var last = lines[lines.size() - 1];
        dc.drawText(0, 3 * h / 4, Graphics.FONT_XTINY, last, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // How far from the last prayer to the next, along the foot of the
    // glance: a grey track, the part gone by in the app's accent.
    private function drawProgress(dc as Dc, now as Number) as Void {
        var w = dc.getWidth();
        var y = dc.getHeight() - BAR;
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(0, y, w, BAR);
        var done = w * Mihrab.progress(now) / 1000;
        if (done > 0) {
            dc.setColor(Mihrab.accent(), Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(0, y, done, BAR);
        }
    }

    // The first font in which every text fits the width (else the last).
    private function fitting(dc as Dc, texts as Array<String>, fonts as Array<Graphics.FontDefinition>, w as Number) as Graphics.FontDefinition {
        for (var f = 0; f < fonts.size(); f++) {
            var ok = true;
            for (var i = 0; i < texts.size(); i++) {
                ok = ok && dc.getTextWidthInPixels(texts[i], fonts[f]) <= w;
            }
            if (ok) {
                return fonts[f];
            }
        }
        return fonts[fonts.size() - 1];
    }
}

// The page: the day's prayers and sunrise, the next one marked, the countdown under
// them. Laid out as a table — the marker, the names, the times — sized for
// the longest name and the widest time of the day, in the largest font
// whose rows all lie inside the round screen.
class MihrabWidgetView extends WatchUi.View {
    private const EDGE = 4;
    private const COLUMN_GAP = 12;
    private const MARK = "› ";
    // 0 the day's table; 1 the night marks, when the app has any on.
    private var _page as Number = 0;

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
            var why = WatchUi.loadResource(times == null ? Rez.Strings.OpenMihrab : Rez.Strings.TimesEnded) as String;
            drawMessage(dc, why);
            return;
        }

        // The day the next prayer belongs to: Fajr to Isha with sunrise,
        // unless the app is set not to show sunrise (its time is 0).
        var page = _page;
        var day = next[0] / Mihrab.PER_DAY;
        var names = [] as Array<String>;
        var clocks = [] as Array<String>;
        var indices = [] as Array<Number>;
        for (var i = 0; i < Mihrab.PER_DAY; i++) {
            var index = day * Mihrab.PER_DAY + i;
            var at = times[index];
            if (i == Mihrab.SUNRISE && at <= 0) {
                continue;
            }
            names.add(Mihrab.name(i));
            clocks.add(at > 0 ? Mihrab.clock(at) : "—");
            indices.add(index);
        }
        // The second page: the night marks the app has turned on that are
        // still ahead — Islamic midnight, the last third, the first third
        // — named with their times, in place of the day's table. A page of
        // their own because the table already fills the dial: two more
        // rows fit in no font (tried on the Enduro 3's 280 pixels).
        var marks = MihrabStore.nightMarks(now);
        if (marks.size() == 0) {
            page = 0;
        }
        var countdown = Mihrab.countdown(next[1] - now);
        if (page == 1) {
            names = [] as Array<String>;
            clocks = [] as Array<String>;
            indices = [] as Array<Number>;
            for (var i = 0; i < marks.size() && i < 3; i++) {
                names.add(MihrabHijri.night(marks[i][0]));
                clocks.add(Mihrab.clock(marks[i][1]));
                indices.add(-1);
            }
            countdown = "";
        }
        var rows = names.size();
        var accent = Mihrab.accent();

        var rowFonts = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var countFonts = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var rowFont = Graphics.FONT_XTINY;
        var countFont = Graphics.FONT_XTINY;
        var found = false;
        for (var r = 0; r < rowFonts.size() && !found; r++) {
            for (var c = 0; c < countFonts.size() && !found; c++) {
                if (fits(dc, names, clocks, countdown, rowFonts[r], countFonts[c])) {
                    rowFont = rowFonts[r];
                    countFont = countFonts[c];
                    found = true;
                }
            }
        }

        var table = tableWidths(dc, names, clocks, rowFont);
        var rowH = Graphics.getFontAscent(rowFont) + Graphics.getFontDescent(rowFont) + 2;
        var countH = Graphics.getFontAscent(countFont) + Graphics.getFontDescent(countFont);
        var top = (h - (rows * rowH + rowH / 2 + countH)) / 2;
        var x0 = w / 2 - table[3] / 2;
        for (var i = 0; i < rows; i++) {
            var isNext = indices[i] == next[0];
            var y = top + i * rowH;
            // The next prayer: its mark and its name in the app's accent,
            // as the face writes it; its time white. The rest grey, the
            // night marks a shade further back.
            if (isNext) {
                dc.setColor(accent, Graphics.COLOR_TRANSPARENT);
                dc.drawText(x0, y, rowFont, MARK, Graphics.TEXT_JUSTIFY_LEFT);
                dc.drawText(x0 + table[0], y, rowFont, names[i], Graphics.TEXT_JUSTIFY_LEFT);
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(x0 + table[3], y, rowFont, clocks[i], Graphics.TEXT_JUSTIFY_RIGHT);
                continue;
            }
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 + table[0], y, rowFont, names[i], Graphics.TEXT_JUSTIFY_LEFT);
            dc.drawText(x0 + table[3], y, rowFont, clocks[i], Graphics.TEXT_JUSTIFY_RIGHT);
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, top + rows * rowH + rowH / 2, countFont, countdown, Graphics.TEXT_JUSTIFY_CENTER);
        // Two dots at the left edge while there is a second page: which
        // of the two this is.
        if (marks.size() > 0) {
            for (var i = 0; i < 2; i++) {
                dc.setColor(i == page ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(EDGE + 8, h / 2 - 6 + i * 12, 3);
            }
        }
    }

    // The other page, when there is one: the day's table, or the night
    // marks. Whether it turned.
    function turnPage() as Boolean {
        if (MihrabStore.nightMarks(Time.now().value()).size() == 0) {
            return false;
        }
        _page = 1 - _page;
        WatchUi.requestUpdate();
        return true;
    }

    // [marker width, longest name, widest time, whole table] in a font.
    private function tableWidths(dc as Dc, names as Array<String>, clocks as Array<String>, f as Graphics.FontDefinition) as Array<Number> {
        var nameW = 0;
        var timeW = 0;
        for (var i = 0; i < names.size(); i++) {
            var nw = dc.getTextWidthInPixels(names[i], f);
            nameW = nw > nameW ? nw : nameW;
            var tw = dc.getTextWidthInPixels(clocks[i], f);
            timeW = tw > timeW ? tw : timeW;
        }
        var markW = dc.getTextWidthInPixels(MARK, f);
        return [markW, nameW, timeW, markW + nameW + COLUMN_GAP + timeW];
    }

    // Whether the table and the countdown, stacked and centred, lie
    // inside the screen in these fonts.
    private function fits(dc as Dc, names as Array<String>, clocks as Array<String>, countdown as String, rowFont as Graphics.FontDefinition, countFont as Graphics.FontDefinition) as Boolean {
        var h = dc.getHeight();
        var table = tableWidths(dc, names, clocks, rowFont);
        var rowH = Graphics.getFontAscent(rowFont) + Graphics.getFontDescent(rowFont) + 2;
        var countH = Graphics.getFontAscent(countFont) + Graphics.getFontDescent(countFont);
        var rows = names.size();
        var top = (h - (rows * rowH + rowH / 2 + countH)) / 2;
        if (top < EDGE) {
            return false;
        }
        for (var i = 0; i < rows; i++) {
            var y = top + i * rowH;
            if (!spans(dc, table[3] / 2, y, y + rowH - 2)) {
                return false;
            }
        }
        var cy = top + rows * rowH + rowH / 2;
        return spans(dc, dc.getTextWidthInPixels(countdown, countFont) / 2, cy, cy + countH);
    }

    // Whether a centred box of half-width hw from y0 to y1 lies inside.
    private function spans(dc as Dc, hw as Number, y0 as Number, y1 as Number) as Boolean {
        return hw <= halfAt(dc, y0) && hw <= halfAt(dc, y1);
    }

    // Half the screen's width, less the edge, at row y; -1 off it.
    private function halfAt(dc as Dc, y as Number) as Number {
        var w = dc.getWidth();
        var h = dc.getHeight();
        if (y < EDGE || y > h - EDGE) {
            return -1;
        }
        if (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND) {
            return w / 2 - EDGE;
        }
        var r = w / 2 - EDGE;
        var d = y - h / 2;
        var sq = r * r - d * d;
        return sq < 0 ? -1 : Math.sqrt(sq).toNumber();
    }

    // A message, wrapped onto as many lines as it needs, centred, in the
    // largest font in which it fits.
    private function drawMessage(dc as Dc, text as String) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var fonts = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        for (var f = 0; f < fonts.size(); f++) {
            var font = fonts[f];
            var lineH = Graphics.getFontAscent(font) + Graphics.getFontDescent(font);
            for (var n = 1; n <= 4; n++) {
                var top = (h - n * lineH) / 2;
                var width = halfAt(dc, top);
                var bottom = halfAt(dc, top + n * lineH);
                width = 2 * (bottom < width ? bottom : width);
                var lines = wrap(dc, text, font, width, n);
                if (lines != null) {
                    dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                    var y = (h - lines.size() * lineH) / 2;
                    for (var i = 0; i < lines.size(); i++) {
                        dc.drawText(w / 2, y + i * lineH, font, lines[i], Graphics.TEXT_JUSTIFY_CENTER);
                    }
                    return;
                }
            }
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h / 2, Graphics.FONT_XTINY, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // The text as lines no wider than maxW, at most maxLines, or null.
    private function wrap(dc as Dc, text as String, f as Graphics.FontDefinition, maxW as Number, maxLines as Number) as Array<String>? {
        if (maxW <= 0) {
            return null;
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
            if (dc.getTextWidthInPixels(word, f) > maxW) {
                return null;
            }
            var joined = line.length() == 0 ? word : line + " " + word;
            if (dc.getTextWidthInPixels(joined, f) <= maxW) {
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
}

// Up, down or a swipe: the other page, while there is one.
class MihrabWidgetDelegate extends WatchUi.BehaviorDelegate {
    private var _view as MihrabWidgetView;

    function initialize(view as MihrabWidgetView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onNextPage() as Boolean {
        return _view.turnPage();
    }

    function onPreviousPage() as Boolean {
        return _view.turnPage();
    }
}
