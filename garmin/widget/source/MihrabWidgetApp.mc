// The widget: a glance with the next prayer and the countdown, a page with
// today's five, and — the reason it exists — two published complications
// that Face It watch faces and any Connect IQ face can show: "Next prayer"
// (Asr 16:42) and "Until prayer" (49m, one unit). Garmin's own built-in
// faces cannot take an app's complications (they run no Connect IQ), so a
// face that shows the countdown is either Mihrab's own or a third
// party's; this is the third-party path.
//
// A complication is refreshed by whoever publishes it, and a background
// runs at most every five minutes, so "Until prayer" is exact at each
// refresh and up to five minutes behind between them; "Next prayer" only
// changes when the prayer does.
import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Complications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

(:background, :glance)
module MihrabPublish {
    const NEXT = 0;
    const UNTIL = 1;
    const REFRESH_SECONDS = 300;

    // Publishes both complications for `now`. Safe anywhere; a watch that
    // has no complications, or refuses, is ignored.
    function publish(now as Number) as Void {
        if (!(Toybox has :Complications) || !(Complications has :updateComplication)) {
            return;
        }
        var next = Mihrab.next(now);
        var nextText = "--";
        var untilText = "--";
        var label = "";
        if (next != null) {
            label = Mihrab.name(next[0]);
            nextText = label + " " + Mihrab.clock(next[1]);
            untilText = Mihrab.countdownOneUnit(next[1] - now);
        }
        try {
            Complications.updateComplication(NEXT, { :value => nextText });
            Complications.updateComplication(UNTIL, { :value => untilText, :shortLabel => label });
        } catch (e) {
            System.println("complication: " + e.getErrorMessage());
        }
    }
}

(:background)
class MihrabWidgetService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onPhoneAppMessage(msg as Communications.PhoneAppMessage) as Void {
        var ok = MihrabStore.store(msg.data);
        MihrabPublish.publish(Time.now().value());
        Background.exit(ok);
    }

    function onTemporalEvent() as Void {
        MihrabPublish.publish(Time.now().value());
        Background.exit(null);
    }
}

(:background, :glance)
class MihrabWidgetApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    (:typecheck([disableBackgroundCheck, disableGlanceCheck]))
    function getInitialView() as [Views] or [Views, InputDelegates] {
        register();
        MihrabPublish.publish(Time.now().value());
        var view = new MihrabWidgetView();
        return [view, new MihrabWidgetDelegate(view)];
    }

    (:typecheck(disableBackgroundCheck))
    function getGlanceView() as [GlanceView] or [GlanceView, GlanceViewDelegate] or Null {
        register();
        return [new MihrabGlance()];
    }

    (:typecheck(disableGlanceCheck))
    function getServiceDelegate() as [ServiceDelegate] {
        return [new MihrabWidgetService()];
    }

    (:typecheck([disableBackgroundCheck, disableGlanceCheck]))
    function onBackgroundData(data as PersistableType) as Void {
        WatchUi.requestUpdate();
    }

    // The phone's messages, and a wake every five minutes to republish.
    private function register() as Void {
        if (Background has :registerForPhoneAppMessageEvent) {
            Background.registerForPhoneAppMessageEvent();
        }
        Background.registerForTemporalEvent(new Time.Duration(MihrabPublish.REFRESH_SECONDS));
    }
}
