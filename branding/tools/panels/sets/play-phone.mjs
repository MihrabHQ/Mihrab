/**
 * Google Play, phone: eight panels (Play's cap), 1080×1920 (9:16).
 */
import path from 'node:path';
import { ROOT } from '../kit.mjs';
import { phonePanels } from './_phone.mjs';

export const W = 1080;
export const H = 1920;
export const face = 'roboto';
export const out = path.join(ROOT, 'branding/store-panels/play-phone');

const P = phonePanels({ kind: 'android', raw: 'android' });
export const panels = [P.hero, P.accuracy, P.mushaf, P.tilawah, P.understand, P.hifz, P.remember, P.day];
