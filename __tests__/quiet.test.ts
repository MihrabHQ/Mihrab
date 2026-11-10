import { _resetQuietForTests, quiet, recentQuiet } from '../src/utils/quiet';

beforeEach(() => _resetQuietForTests());

it('keeps what was ignored, with the place and the message', () => {
  quiet('sync/folderSync', new SyntaxError('Unexpected end of JSON input'));
  quiet('storage/x', 'plain string');
  quiet('storage/y', { code: 7 });
  const kept = recentQuiet();
  expect(kept.map(k => k.where)).toEqual(['sync/folderSync', 'storage/x', 'storage/y']);
  expect(kept[0].message).toBe('SyntaxError: Unexpected end of JSON input');
  expect(kept[1].message).toBe('plain string');
  expect(kept[2].message).toBe('{"code":7}');
  expect(typeof kept[0].at).toBe('number');
});

it('never throws, whatever it is handed', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const hostile = {
    get message(): string {
      throw new Error('no');
    },
  };
  expect(() => {
    quiet('a', circular);
    quiet('b', undefined);
    quiet('c', null);
    quiet('d', hostile);
    quiet('e', Symbol('s'));
  }).not.toThrow();
  expect(recentQuiet()).toHaveLength(5);
});

it('keeps only the last fifty, and long messages short', () => {
  for (let i = 0; i < 120; i++) quiet(`p${i}`, new Error('x'.repeat(2000)));
  const kept = recentQuiet();
  expect(kept).toHaveLength(50);
  expect(kept[0].where).toBe('p70');
  expect(kept.at(-1)!.where).toBe('p119');
  expect(kept[0].message.length).toBeLessThanOrEqual(300);
});

it('hands out a copy: a reader cannot change the record', () => {
  quiet('a', new Error('one'));
  (recentQuiet() as unknown[]).length = 0;
  expect(recentQuiet()).toHaveLength(1);
});
