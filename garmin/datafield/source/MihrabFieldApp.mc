// The data field: one slot on any activity screen, or the data-field
// complication of a watch face that offers one, reading "Asr 1:23" — the
// next prayer and the time until it — and, inside its last minute, "now".
import Toybox.Activity;
import Toybox.Application;
import Toybox.Background;
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

class MihrabField extends WatchUi.SimpleDataField {
    function initialize() {
        SimpleDataField.initialize();
        label = WatchUi.loadResource(Rez.Strings.Label) as String;
    }

    function compute(info as Activity.Info) as Numeric or Duration or String or Null {
        var now = Time.now().value();
        var next = Mihrab.next(now);
        if (next == null) {
            return "--";
        }
        return Mihrab.name(next[0]) + " " + Mihrab.countdown(next[1] - now);
    }
}
