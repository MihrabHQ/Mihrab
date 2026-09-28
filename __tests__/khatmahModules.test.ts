/**
 * The layers `quranState.ts` was split into only import downwards.
 *
 * The file's khatmah "lifecycle" and "schedule" sections called each other
 * both ways, so moving either one out as a block would have made an import
 * cycle (docs/rewrite-plan.md, 2.1). The functions themselves had none, so
 * the pure khatmah model was cut into layers instead — units and progress,
 * then the schedule, then the plan's status, then the edits the writers
 * make — with the store on top. What writes through the store sits above
 * it again (the reader's marks, 2.3; the khatmah's writers, 2.4) and is
 * imported from where it lives, never through the store. These pin that
 * order, so a helpful import in the wrong direction fails here rather than
 * as an `undefined` at module load.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/** Bottom first: each may import only from the layers before it. */
const LAYERS = [
  'quranTypes',
  'khatmahProgress',
  'khatmahSchedule',
  'khatmahStatus',
  'khatmahEdits',
];

/** Above the store: they write through it, so it must never import them. */
const CLIENTS = ['readerMarks', 'khatmahActions'];

const localImports = (name: string): string[] => {
  const src = readFileSync(
    join(__dirname, '..', 'src', 'quran', `${name}.ts`),
    'utf8',
  );
  return [
    ...src.matchAll(/^(?:import|export)[\s\S]*?from '\.\/([\w]+)';/gm),
  ].map(m => m[1]);
};

describe('the split store', () => {
  it.each(LAYERS.map((name, i) => [name, i] as const))(
    '%s imports no layer above it, and never the store',
    (name, i) => {
      const above = [...LAYERS.slice(i + 1), 'quranState'];
      for (const from of localImports(name)) {
        expect(above).not.toContain(from);
      }
    },
  );

  it.each(CLIENTS)(
    'the store imports nothing from %s, which writes through it',
    client => {
      expect(localImports('quranState')).not.toContain(client);
    },
  );

  it('the store re-exports nothing, so each name has one way in', () => {
    // During the split the store re-exported what had moved, so importers
    // could follow at their own pace (2.2). Step 2.5 pointed every one of
    // them at the module that holds the name; a re-export now would be a
    // second address for it, and the start of the next knot.
    const store = readFileSync(
      join(__dirname, '..', 'src', 'quran', 'quranState.ts'),
      'utf8',
    );
    expect(store).not.toMatch(/^export (type )?\{[^}]*\} from/m);
  });
});
