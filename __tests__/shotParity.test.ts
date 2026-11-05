/**
 * The README and the site show the same pictures, and they drift.
 *
 * Both galleries are the store panels (branding/tools/panels), written by
 * one script, publish.py: the README gets branding/readme/*.jpg, the site
 * docs/assets/img/panels/. Nothing else should put a picture in either, so
 * the README may show only what publish.py writes, and every picture it
 * shows must exist. (The old screenshot pairs — the same PNG copied to two
 * paths — once drifted when one copy was retaken and the other was not;
 * the shared generator is what stops that now.)
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
const publish = readFileSync(
  path.join(ROOT, 'branding', 'tools', 'panels', 'publish.py'),
  'utf-8',
);

describe('the README gallery and the site gallery come from one generator', () => {
  const shown = [...readme.matchAll(/branding\/readme\/([\w.-]+\.(?:png|jpg))/g)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i);

  it('shows the cross-platform panels', () => {
    expect(shown).toEqual(
      expect.arrayContaining(['xplat.jpg', 'panels-phone.jpg', 'panels-wide.jpg']),
    );
  });

  it.each(shown)('%s exists and is written by publish.py', f => {
    expect(existsSync(path.join(ROOT, 'branding', 'readme', f))).toBe(true);
    expect(publish).toContain(f);
  });
});

describe('the alt text names widgets the shot contains', () => {
  /*
   * The Android widget shot has said one thing and shown another before:
   * its alt text once named a khatmah widget the picture did not carry.
   * Since the 2026-10-29 retake the shot DOES carry it — Continue reading,
   * with today's khatmah portion — beside the times, the log, the next
   * prayer and the Hijri date. A test cannot look at the picture, but it
   * can hold every language to naming the two widgets that came in with
   * that retake, so the alt text cannot fall behind it again.
   */
  const strings = JSON.parse(
    readFileSync(path.join(ROOT, 'scripts', 'site', 'strings.json'), 'utf-8'),
  ) as Record<
    string,
    { shots: { items: Record<string, { alt: string; cap: string }> } }
  >;

  const KHATMAH = /khatmah|khatma|khatam|hatm|jatma|ختم|ختمة|хатм|खत्म|ख़त्म|খতম|通读/i;
  const HIJRI = /hijri|hijriah|hicri|hégire|hégira|hidschri|хиджр|هجري|ہجری|হিজরি|हिजरी|伊斯兰历/i;

  it.each(Object.keys(strings))('%s names the khatmah and the Hijri date', code => {
    const alt = strings[code].shots.items['widgets-android'].alt;
    expect(alt).toMatch(KHATMAH);
    expect(alt).toMatch(HIJRI);
  });
});
