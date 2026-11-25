/*
 * This file is Mihrab's, not Notifee's (2026-11-25): added when the engine
 * came into this tree.
 */

package io.invertase.notifee;

import android.os.Bundle;
import androidx.annotation.Nullable;

/**
 * Whether a notification's event is worth starting JavaScript for.
 *
 * <p>With the app in front an event goes to the JavaScript that is running.
 * With it anywhere else, Notifee starts a headless task for every event —
 * and if nothing of React Native is running in the process, that starts all
 * of it: the engine, the bundle, the app's modules, some tens of megabytes
 * and a second of work, for a notification that has just been shown and
 * that JavaScript has nothing to say about.
 *
 * <p>The app knows which events it acts on; this module does not. So the app
 * may hand over a gate, asked once per event that would otherwise start a
 * headless task. Without one, or if it throws, the answer is yes: every
 * event is delivered, as Notifee always has.
 */
public final class BackgroundEvents {
  /** The app's answer for one event. */
  public interface Gate {
    /**
     * @param eventType a {@code NotificationEvent.TYPE_*}
     * @param notification the notification the event is about, as Notifee's bundle
     * @return false to leave JavaScript alone for this event
     */
    boolean wantsJavaScript(int eventType, @Nullable Bundle notification);
  }

  private static volatile Gate gate;

  private BackgroundEvents() {}

  /** Set once, from {@code Application.onCreate}: before any event can be posted. */
  public static void setGate(@Nullable Gate value) {
    gate = value;
  }

  static boolean wantsJavaScript(int eventType, @Nullable Bundle notification) {
    Gate g = gate;
    if (g == null) return true;
    try {
      return g.wantsJavaScript(eventType, notification);
    } catch (Throwable t) {
      return true;
    }
  }
}
