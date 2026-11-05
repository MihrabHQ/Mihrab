/**
 * App Store, iPad 13″: seven panels, 2752×2064 (landscape).
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { widePanels } from './_wide.mjs';

export const W = 2752;
export const H = 2064;
export const face = 'sf';
export const out = path.join(ROOT, 'branding/store-panels/appstore-ipad');

const P = widePanels({ kind: 'ipad', raw: 'ipad', phoneKind: 'iphone', phoneRaw: 'ios' });
export const panels = [P.hero, P.accuracy, P.spread, P.tilawah, P.remember, P.month, P.devices];
