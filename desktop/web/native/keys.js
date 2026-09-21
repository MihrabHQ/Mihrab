/**
 * MihrabKeyCommands on the desktop — the same keys the Mac reader takes,
 * from document keydown:
 *
 *   forward (next page):  ←  A  H
 *   back    (previous):   →  D  L
 *
 * Letters are ignored while anything editable has focus (a search field),
 * and the arrows only when the app has not claimed them (setArrowPriority),
 * exactly as on the Mac. Events go out through DeviceEventEmitter, which is
 * what NativeEventEmitter subscribes to.
 */
import { DeviceEventEmitter } from 'react-native-web/dist/index';

let arrowsClaimed = false;

const FORWARD = new Set(['ArrowLeft', 'a', 'h']);
const BACK = new Set(['ArrowRight', 'd', 'l']);

function editing(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const action = FORWARD.has(key) ? 'forward' : BACK.has(key) ? 'back' : null;
  if (!action) return;
  const arrow = key.startsWith('Arrow');
  if (editing(e.target)) return;
  if (arrow && !arrowsClaimed) return;
  if (arrow) e.preventDefault();
  DeviceEventEmitter.emit('MihrabKeyCommand', { action });
});

export const MihrabKeyCommands = {
  setArrowPriority(on) {
    arrowsClaimed = Boolean(on);
  },
  addListener() {},
  removeListeners() {},
};
