/**
 * The site's dates are the same on every Node. Hindi's gained a comma in a
 * later CLDR, and a page built on a Mac was "out of date" on CI all of one
 * day (scripts/copy/figures.js, `steady`).
 */
import fs from 'fs';
import path from 'path';

const figures = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'copy', 'figures.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'hi', 'index.html'), 'utf8');

describe('the site’s dates', () => {
  it('every date Intl writes for the pages goes through `steady`', () => {
    expect(figures.match(/return steady\(new Intl\.DateTimeFormat\(/g)).toHaveLength(3);
    expect(figures).not.toMatch(/return new Intl\.DateTimeFormat\(/);
    expect(figures).toMatch(/return lang === 'hi' \? text\.replace\(\/,\/g, ''\) : text;/);
  });

  it('the Hindi page carries no comma between a month and its year', () => {
    expect(page).not.toMatch(/[ऀ-ॿ]॰?, 20\d\d/);
    expect(page).toMatch(/[ऀ-ॿ] 20\d\d/);
  });
});
