/**
 * react-native-view-shot on the desktop: the main process captures the
 * element's rectangle of the window (webContents.capturePage), so what is
 * saved is exactly what is drawn, fonts and all.
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, findNodeHandle } from 'react-native';
import { desktop } from './desktop';

function nodeOf(ref) {
  const target = ref && typeof ref === 'object' && 'current' in ref ? ref.current : ref;
  if (!target) return null;
  if (typeof target.capture === 'function' && target.__node) return target.__node;
  if (target instanceof Element) return target;
  const n = findNodeHandle(target);
  return n instanceof Element ? n : null;
}

export async function captureRef(ref, options = {}) {
  const d = desktop();
  const node = nodeOf(ref);
  if (!d || !node) throw new Error('captureRef: nothing to capture');
  // Two frames, so a view that was just laid out has also been painted.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const r = node.getBoundingClientRect();
  const rect = {
    x: Math.floor(r.left),
    y: Math.floor(r.top),
    width: Math.ceil(r.width),
    height: Math.ceil(r.height),
  };
  return d.capture.rect(rect, {
    format: options.format ?? 'png',
    quality: options.quality ?? 1,
    result: options.result ?? 'tmpfile',
    width: options.width,
    height: options.height,
  });
}

export const captureScreen = options =>
  captureRef(typeof document !== 'undefined' ? document.body : null, options);
export const releaseCapture = async uri => {
  const d = desktop();
  if (d && typeof uri === 'string' && uri.startsWith('/')) await d.fs.unlink(uri).catch(() => undefined);
};

const ViewShot = forwardRef(function ViewShot({ options, children, style, ...rest }, ref) {
  const inner = useRef(null);
  useImperativeHandle(ref, () => ({
    capture: () => captureRef(inner, options),
    get __node() {
      return inner.current;
    },
  }));
  return React.createElement(View, { ref: inner, style, collapsable: false, ...rest }, children);
});

export default ViewShot;
