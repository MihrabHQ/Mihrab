/**
 * `react-native` on the desktop: react-native-web, plus what it lacks.
 *
 * react-native-web covers the components and most APIs. The additions here
 * are the ones the app reaches for that have no web counterpart — each is
 * the smallest honest stand-in, not an emulation.
 */
import * as RNW from 'react-native-web/dist/index';
import { NativeModules } from 'react-native-web/dist/index';

export * from 'react-native-web/dist/index';

const desktop = () => (typeof window !== 'undefined' ? window.mihrabDesktop : undefined);

/** TurboModules are the app's own NativeModules on the desktop. */
export const TurboModuleRegistry = {
  get: name => NativeModules[name] ?? null,
  getEnforcing: name => {
    const m = NativeModules[name];
    if (!m) throw new Error(`TurboModuleRegistry.getEnforcing(...): '${name}' could not be found.`);
    return m;
  },
};

/**
 * Alert.alert shows a real dialog. react-native-web's does nothing at all,
 * which silently drops every "are you sure?" the app asks.
 */
export const Alert = {
  alert(title, message, buttons, options) {
    const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    const cancelIndex = list.findIndex(b => b.style === 'cancel');
    const d = desktop();
    if (!d) {
      list[list.length - 1]?.onPress?.();
      return;
    }
    d.dialog
      .alert(
        title ?? '',
        message ?? '',
        list.map(b => b.text ?? 'OK'),
        cancelIndex >= 0 ? cancelIndex : list.length === 1 ? 0 : -1,
      )
      .then(i => {
        if (i >= 0 && i < list.length) list[i].onPress?.();
        else options?.onDismiss?.();
      });
  },
  prompt() {
    // Not used by the app; present so a call is a no-op, not a crash.
  },
};

/** Android-only; the desktop asks nothing of the OS for these. */
export const PermissionsAndroid = {
  PERMISSIONS: new Proxy({}, { get: (_t, k) => `android.permission.${String(k)}` }),
  RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  check: async () => false,
  request: async () => 'denied',
  requestMultiple: async perms => Object.fromEntries(perms.map(p => [p, 'denied'])),
};

/** iOS semantic colours have no meaning here; callers fall back. */
export const PlatformColor = () => undefined;
export const DynamicColorIOS = ({ light }) => light;
export const ToastAndroid = { show() {}, showWithGravity() {}, SHORT: 0, LONG: 1 };
export const ActionSheetIOS = { showActionSheetWithOptions() {}, showShareActionSheetWithOptions() {} };
export const Settings = { get: () => undefined, set() {}, watchKeys: () => 0, clearWatch() {} };

/** Links leave the app for the system browser / mail client. */
export const Linking = {
  ...RNW.Linking,
  openURL: async url => {
    const d = desktop();
    if (d) {
      const ok = await d.app.openExternal(url);
      if (!ok) throw new Error(`Cannot open ${url}`);
      return;
    }
    return RNW.Linking.openURL(url);
  },
  canOpenURL: async url => /^(https?|mailto|geo|tel):/.test(url),
  openSettings: async () => undefined,
  sendIntent: async () => undefined,
};

/**
 * Headless tasks are how Android runs JS with no UI (widget refresh, the
 * adhan-mute action). There is no such process here — the page is always
 * the one running — so registering one is accepted and ignored.
 */
const headless = new Set(['registerHeadlessTask', 'startHeadlessTask', 'cancelHeadlessTask']);
export const AppRegistry = new Proxy(RNW.AppRegistry, {
  get(target, key) {
    if (headless.has(key)) return () => undefined;
    const v = target[key];
    return typeof v === 'function' ? v.bind(target) : v;
  },
});

/**
 * BackHandler: the phones' hardware back, from a keyboard and mouse.
 *
 * Esc, Alt+← and the mouse's back button all press "back". Handlers run
 * newest first until one says it handled it, exactly as Android runs them —
 * so the app's own back rules (useAndroidSubScreenBack) and React
 * Navigation's goBack apply unchanged. Esc in a text field is left to the
 * field.
 */
const backHandlers = [];

function pressBack() {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    try {
      if (backHandlers[i]()) return true;
    } catch (e) {
      console.error('[BackHandler]', e);
    }
  }
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => {
    const t = e.target instanceof Element ? e.target : null;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const esc = e.key === 'Escape' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
    const altLeft = e.key === 'ArrowLeft' && e.altKey && !e.metaKey && !e.ctrlKey;
    if ((esc || altLeft) && pressBack()) e.preventDefault();
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 3 && pressBack()) e.preventDefault();
  });
}

export const BackHandler = {
  addEventListener(type, handler) {
    if (type !== 'hardwareBackPress') return { remove() {} };
    backHandlers.push(handler);
    return {
      remove() {
        const i = backHandlers.lastIndexOf(handler);
        if (i >= 0) backHandlers.splice(i, 1);
      },
    };
  },
  removeEventListener(type, handler) {
    const i = backHandlers.lastIndexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  },
  exitApp() {},
};
