/**
 * App Store, iPhone 6.9″: ten panels (Apple's cap), 1320×2868.
 * App Store Connect scales these to every smaller iPhone class.
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { phonePanels } from './_phone.mjs';

export const W = 1320;
export const H = 2868;
export const face = 'sf';
export const out = path.join(ROOT, 'branding/store-panels/appstore-iphone');

const P = phonePanels({ kind: 'iphone', raw: 'ios', tabletKind: 'ipad', tabletRaw: 'ipad' });
export const panels = [P.hero, P.accuracy, P.mushaf, P.tilawah, P.understand, P.hifz, P.remember, P.dayIos, P.devices];
