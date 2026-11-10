/**
 * The word reader's player on the desktop and in the browser
 * (desktop/web/native/wordPlayer.js). Before it there was none: holding a
 * word lit it and read nothing. These run it against a stand-in <audio>
 * whose clock the test moves, and check the contract the native players
 * keep: seek to the word, play, stop at its end, answer true; answer false
 * when cut short or when the media fails.
 */
jest.mock('../desktop/web/shims/desktop', () => ({ mediaUrl: (p: string) => `media:${p}` }), { virtual: false });

type Listener = (e?: unknown) => void;

class FakeAudio {
  static last: FakeAudio | null = null;
  preload = '';
  playbackRate = 1;
  readyState = 0;
  ended = false;
  paused = true;
  played: Array<{ from: number }> = [];
  private t = 0;
  private src: string | null = null;
  private listeners = new Map<string, Set<Listener>>();
  constructor() {
    FakeAudio.last = this;
  }
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    queueMicrotask(() => this.emit('seeked'));
  }
  /** The test's hand on the clock: playback reaches `t`. */
  advance(t: number) {
    this.t = t;
  }
  getAttribute(name: string) {
    return name === 'src' ? this.src : null;
  }
  setAttribute(name: string, v: string) {
    if (name === 'src') this.src = v;
  }
  load() {
    this.readyState = 0;
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('loadedmetadata');
    });
  }
  play() {
    this.paused = false;
    this.played.push({ from: this.t });
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
}

const frames: Array<() => void> = [];
(globalThis as Record<string, unknown>).Audio = FakeAudio;
(globalThis as Record<string, unknown>).requestAnimationFrame = (fn: () => void) => frames.push(fn);
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};

/** Let the loads, seeks and play() promises settle, then run one frame. */
async function tick() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const due = frames.splice(0);
  due.forEach(f => f());
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

const { WordPlayer } = require('../desktop/web/native/wordPlayer') as {
  WordPlayer: { play(p: string, s: number, e: number): Promise<boolean>; stop(): Promise<boolean> };
};

describe('the desktop word player', () => {
  it('seeks to the word, plays it, and stops at its end', async () => {
    const done = WordPlayer.play('/q/husary/002002.mp3', 1310, 2070);
    await tick();
    const a = FakeAudio.last!;
    expect(a.getAttribute('src')).toBe('media:/q/husary/002002.mp3');
    expect(a.played).toEqual([{ from: 1.31 }]);
    a.advance(1.8);
    await tick();
    expect(a.paused).toBe(false); // mid-word: still playing
    a.advance(2.071);
    await tick();
    await expect(done).resolves.toBe(true);
    expect(a.paused).toBe(true);
  });

  it('answers false when a newer hold cuts it short, and plays the new word', async () => {
    const first = WordPlayer.play('/q/husary/002002.mp3', 1310, 2070);
    await tick();
    const second = WordPlayer.play('/q/husary/002003.mp3', 8370, 9000);
    await expect(first).resolves.toBe(false);
    await tick();
    const a = FakeAudio.last!;
    expect(a.getAttribute('src')).toBe('media:/q/husary/002003.mp3');
    a.advance(9.01);
    await tick();
    await expect(second).resolves.toBe(true);
  });

  it('answers false when stopped', async () => {
    const p = WordPlayer.play('/q/husary/002002.mp3', 0, 500);
    await tick();
    await WordPlayer.stop();
    await expect(p).resolves.toBe(false);
  });

  it('answers false when the media fails', async () => {
    const p = WordPlayer.play('/q/husary/002004.mp3', 0, 500);
    await tick();
    FakeAudio.last!.emit('error');
    await expect(p).resolves.toBe(false);
  });
});
