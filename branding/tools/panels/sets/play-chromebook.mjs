/**
 * Google Play, Chromebook: the tablet story in a laptop, 2560×1440 (16:9;
 * Play asks for 1080–7680 px a side).
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { widePanels } from './_wide.mjs';

export const W = 2560;
export const H = 1440;
export const face = 'roboto';
export const out = path.join(ROOT, 'branding/store-panels/play-chromebook');

const P = widePanels({ kind: 'laptop', raw: 'android-tablet' });
export const panels = [P.hero, P.spread, P.tilawah, P.remember, P.month, P.devices];
