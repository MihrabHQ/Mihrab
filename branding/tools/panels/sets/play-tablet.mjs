/**
 * Google Play, 7- and 10-inch tablets: seven panels, 2560×1440 (16:9,
 * within Play's 320–3840 px). The same set goes in both tablet slots.
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { widePanels } from './_wide.mjs';

export const W = 2560;
export const H = 1440;
export const face = 'roboto';
export const out = path.join(ROOT, 'branding/store-panels/play-tablet');

const P = widePanels({ kind: 'tab', raw: 'android-tablet' });
export const panels = [P.hero, P.accuracy, P.spread, P.tilawah, P.remember, P.month, P.devices];
