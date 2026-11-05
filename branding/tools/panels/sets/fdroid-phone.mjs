/**
 * F-Droid, phone: the ninth picture. Play caps phones at eight, F-Droid does
 * not, so its listing also gets the every-device panel — drawn with Android
 * frames and Roboto at Play's 1080×1920, as the sky's last hour.
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { phonePanels } from './_phone.mjs';

export const W = 1080;
export const H = 1920;
export const face = 'roboto';
export const sky = { i: 8, n: 9 };
export const out = path.join(ROOT, 'branding/store-panels/fdroid-phone');

const P = phonePanels({ kind: 'android', raw: 'android', tabletKind: 'tab', tabletRaw: 'android-tablet', lift: 12 });
export const panels = [P.devices];
