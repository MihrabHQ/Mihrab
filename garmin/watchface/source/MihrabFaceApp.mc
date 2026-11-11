import Toybox.Application;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

(:background)
class MihrabFaceApp extends Application.AppBase {
    private var _view as MihrabFaceView?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // Nothing to do here: the background service is registered in
        // getInitialView, where a watch face's foreground starts.
    }

    function onStop(state as Dictionary?) as Void {
    }

    (:typecheck(disableBackgroundCheck))
    function getInitialView() as [Views] or [Views, InputDelegates] {
        if (Background has :registerForPhoneAppMessageEvent) {
            Background.registerForPhoneAppMessageEvent();
        }
        var view = new MihrabFaceView();
        _view = view;
        return [view, new MihrabFaceDelegate(view)];
    }

    function getServiceDelegate() as [ServiceDelegate] {
        return [new MihrabService()];
    }

    // The service stored a message: draw it.
    (:typecheck(disableBackgroundCheck))
    function onBackgroundData(data as PersistableType) as Void {
        WatchUi.requestUpdate();
    }
}

function getApp() as MihrabFaceApp {
    return Application.getApp() as MihrabFaceApp;
}
