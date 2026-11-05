/**
 * Mac App Store: six panels, 2880×1800 (16:10). The screens are the
 * app's desktop page (the same code the Mac app runs), in a laptop.
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { widePanels } from './_wide.mjs';

export const W = 2880;
export const H = 1800;
export const face = 'sf';
export const out = path.join(ROOT, 'branding/store-panels/appstore-mac');

const P = widePanels({ kind: 'laptop', raw: 'desktop', phoneKind: 'iphone', phoneRaw: 'ios' });
export const panels = [P.hero, P.accuracy, P.spread, P.remember, P.month, P.devices];
