/**
 * AGENTS.md is read before any change, so it must not point at things that
 * are gone: every file, script and test it names exists.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const guide = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf-8');

describe('AGENTS.md', () => {
  const paths = [...new Set([...guide.matchAll(/`((?:src|scripts|docs|__tests__|fastlane)\/[^`\s]*|[A-Z_]+\.md)`/g)].map(m => m[1]))]
    // a pattern names a family of files, not one
    .filter(p => !p.includes('*') && !p.includes('<'));

  it.each(paths)('names %s, which exists', p => {
    expect(existsSync(path.join(ROOT, p.replace(/\/$/, '')))).toBe(true);
  });

  it('names the checks package.json runs as preflight', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(guide).toMatch(/npm run preflight/);
    expect(pkg.scripts.preflight).toMatch(/build-site\.js --check/);
    expect(pkg.scripts.preflight).toMatch(/build-copy\.js --check/);
    expect(pkg.scripts.preflight).toMatch(/jest/);
  });

  it('is what Claude Code loads', () => {
    expect(readFileSync(path.join(ROOT, '.claude', 'CLAUDE.md'), 'utf-8')).toMatch(/@\.\.\/AGENTS\.md/);
  });
});
