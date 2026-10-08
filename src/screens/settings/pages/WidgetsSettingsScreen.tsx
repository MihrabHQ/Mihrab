/**
 * Settings → Widgets (Android).
 *
 * A page of its own again. It had one once, and lost it when #127 left it a
 * single slider — a destination, an icon and a tap for one control. It has
 * two families now, and they are not the same kind of setting:
 *
 *   • All widgets (`WidgetCard`): the background and the highlight, which
 *     every Mihrab widget follows.
 *   • Prayer times widget (`PrayerWidgetCard`): text colour, what is shown
 *     and the size of the times, which ONLY the prayer-times widgets read.
 *
 * On Appearance they were the bottom of a long page about the app's own
 * look; here they are the page, and the line between them is the point.
 * The same options are on each widget's own settings screen (touch and
 * hold → Settings), which `syncWidgetUiHints` reads back.
 */
import { PrayerWidgetCard } from '../PrayerWidgetCard';
import { SettingsPage } from '../SettingsPage';
import { WidgetCard } from '../WidgetCard';

export function WidgetsSettingsScreen() {
  return (
    <SettingsPage>
      <WidgetCard />
      <PrayerWidgetCard />
    </SettingsPage>
  );
}
