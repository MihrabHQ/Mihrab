/**
 * Microsoft Store: six panels, 3840×2160 (16:9; the Store takes up to ten
 * and recommends 4K). The Windows app's own page in a Windows window.
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { widePanels } from './_wide.mjs';

export const W = 3840;
export const H = 2160;
export const face = 'roboto';
export const out = path.join(ROOT, 'branding/store-panels/msstore');

const P = widePanels({ kind: 'window', raw: 'desktop', phoneKind: 'android', phoneRaw: 'android' });
export const panels = [P.hero, P.accuracy, P.spread, P.remember, P.month, P.devices];
