/**
 * The feed for earlier versions is built by Node, from the providers
 * (tools/compat-feed, the `compat-feed` workflow): installed apps of older
 * versions download what it writes, every day.
 *
 * Node cannot read React Native's entry file. So nothing the tool imports
 * — the three dataset providers and everything under them — may import
 * `react-native` at the top of a file. It did, for a day (2026-11-24: the
 * storage module took `Platform` that way, and the providers reach storage
 * through the clock's record); the job is scheduled, so no push showed it,
 * and the next morning's feed was not built.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function resolve(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
    const file = base + ext;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

/** The first chain of top-level imports from `starts` to a `react-native…` package, or null. */
function chainToReactNative(starts: string[]): string[] | null {
  const seen = new Set<string>();
  const queue: Array<[string, string[]]> = starts.map(s => [s, [s]]);
  while (queue.length > 0) {
    const [file, chain] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    // Value imports and re-exports only: `import type` is erased.
    const imports = text.matchAll(
      /^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm,
    );
    for (const m of imports) {
      const spec = m[1] ?? m[2];
      if (/^react-native(\/|-|$)/.test(spec)) return [...chain.map(c => path.relative(root, c)), spec];
      if (!spec.startsWith('.')) continue;
      const next = resolve(file, spec);
      if (next && /\.(ts|tsx|js)$/.test(next)) queue.push([next, [...chain, next]]);
    }
  }
  return null;
}

describe('the feed tool', () => {
  const tool = path.join(root, 'tools/compat-feed/build.ts');

  it('is what the workflow runs', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/compat-feed.yml'), 'utf8');
    expect(workflow).toContain('tools/compat-feed/build.ts');
  });

  it('reaches no top-level import of React Native, through anything it imports', () => {
    expect(chainToReactNative([tool])).toBeNull();
  });

  it('…and this would have said so: the storage module asks for it only when it opens the store', () => {
    const storage = fs.readFileSync(path.join(root, 'src/storage/appStorage.ts'), 'utf8');
    expect(storage).not.toMatch(/^import [^\n]* from 'react-native';/m);
    expect(storage).toMatch(/const \{ Platform \} = require\('react-native'\)/);
  });
});
