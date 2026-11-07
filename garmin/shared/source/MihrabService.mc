// The background service both apps run: it is what receives the phone's
// message when the app is not on screen (a data field outside an activity,
// a watch face in low power), keeps it, and wakes the app so it redraws.
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

(:background)
class MihrabService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onPhoneAppMessage(msg as Communications.PhoneAppMessage) as Void {
        var ok = MihrabStore.store(msg.data);
        // The foreground app, if it is running, hears of it in
        // onBackgroundData and redraws; the times are already in Storage.
        Background.exit(ok);
    }
}
