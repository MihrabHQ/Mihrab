/**
 * @notifee/react-native on the desktop.
 *
 * The enums are notifee's own (its type modules are plain JS); the calls go
 * to the main process, which keeps the triggers and shows the notifications
 * (electron/notifications.js). When one is delivered, this side plays its
 * sound — the adhan — because the page owns audio, and hands the event to
 * whatever the app registered with onForegroundEvent / onBackgroundEvent.
 */
import { desktop } from './desktop';
import { playNotificationSound } from '../native/notificationSound';

export * from '@notifee/react-native/dist/types/Notification';
export * from '@notifee/react-native/dist/types/NotificationAndroid';
export * from '@notifee/react-native/dist/types/NotificationIOS';
export * from '@notifee/react-native/dist/types/Trigger';

const AUTHORIZED = 1;
const ENABLED = 1;

const d = desktop();
const foreground = new Set();
let background = null;
let foregroundService = null;

if (d) {
  d.notifications.onEvent(event => {
    if (event.type === 3 /* DELIVERED */ && event.sound && event.sound !== 'default') {
      void playNotificationSound(event.sound, event.detail?.notification);
    }
    const payload = { type: event.type, detail: event.detail };
    if (foreground.size > 0) {
      for (const fn of foreground) fn(payload);
    } else if (background) {
      void background(payload);
    }
  });
}

const call = (name, ...args) => (d ? d.notifications[name](...args) : Promise.resolve(undefined));

const settings = () => ({
  authorizationStatus: AUTHORIZED,
  android: { alarm: ENABLED },
  ios: {},
  web: {},
});

const notifee = {
  async requestPermission() {
    return settings();
  },
  async getNotificationSettings() {
    return settings();
  },
  async createChannel(channel) {
    return call('createChannel', channel);
  },
  async createChannels(channels) {
    for (const c of channels) await call('createChannel', c);
  },
  async getChannel(id) {
    return call('getChannel', id);
  },
  async getChannels() {
    return (await call('getChannels')) ?? [];
  },
  async deleteChannel(id) {
    return call('deleteChannel', id);
  },
  async isChannelCreated(id) {
    return (await call('getChannel', id)) != null;
  },
  async isChannelBlocked() {
    return false;
  },
  async createTriggerNotification(notification, trigger) {
    return call('createTrigger', notification, trigger);
  },
  async displayNotification(notification) {
    if (notification?.android?.asForegroundService && foregroundService) {
      // The download service on Android. Here the download simply runs in
      // the page, so the task is started and left to settle by itself.
      void Promise.resolve(foregroundService(notification)).catch(() => undefined);
    }
    return call('display', notification);
  },
  async getTriggerNotificationIds() {
    return ((await call('triggers')) ?? []).map(t => t.notification.id);
  },
  async getTriggerNotifications() {
    return (await call('triggers')) ?? [];
  },
  async getDisplayedNotifications() {
    return (await call('displayed')) ?? [];
  },
  async cancelNotification(id) {
    await call('cancelTriggers', [id]);
    await call('cancelDisplayed', [id]);
  },
  async cancelTriggerNotification(id) {
    return call('cancelTriggers', [id]);
  },
  async cancelTriggerNotifications(ids) {
    return call('cancelTriggers', ids ?? null);
  },
  async cancelDisplayedNotification(id) {
    return call('cancelDisplayed', [id]);
  },
  async cancelDisplayedNotifications(ids) {
    return call('cancelDisplayed', ids ?? null);
  },
  async cancelAllNotifications() {
    await call('cancelTriggers', null);
    await call('cancelDisplayed', null);
  },
  async setNotificationCategories(categories) {
    return call('setCategories', categories);
  },
  async getNotificationCategories() {
    return (await call('getCategories')) ?? [];
  },
  onForegroundEvent(fn) {
    foreground.add(fn);
    return () => foreground.delete(fn);
  },
  onBackgroundEvent(fn) {
    background = fn;
  },
  async getInitialNotification() {
    return null;
  },
  registerForegroundService(fn) {
    foregroundService = fn;
  },
  async stopForegroundService() {},
  async openAlarmPermissionSettings() {},
  async openBatteryOptimizationSettings() {},
  async openNotificationSettings() {},
  async openPowerManagerSettings() {},
  async isBatteryOptimizationEnabled() {
    return false;
  },
  async getPowerManagerInfo() {
    return { activity: null, manufacturer: null, model: null, version: null };
  },
  async setBadgeCount() {},
  async getBadgeCount() {
    return 0;
  },
  async incrementBadgeCount() {},
  async decrementBadgeCount() {},
  async hideNotificationDrawer() {},
};

export default notifee;
