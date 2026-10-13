/** The clock jumping, told by the hero's ticks — see src/utils/clockJumps.ts. */
import {
  _resetClockJumpsForTests,
  CLOCK_JUMP_MS,
  forgetClockTicks,
  noteClockTick,
  onClockJump,
} from '../src/utils/clockJumps';

beforeEach(_resetClockJumpsForTests);

it('tells the watchdog when a tick lands far from a second after the last', () => {
  const heard = jest.fn();
  onClockJump(heard);
  let t = 1_000_000;
  noteClockTick(t);
  for (let i = 0; i < 5; i++) noteClockTick((t += 1000));
  // A late tick (the thread was busy) is not a jump.
  noteClockTick((t += 1500));
  expect(heard).not.toHaveBeenCalled();
  // The clock set back a day.
  noteClockTick((t -= 30 * 3600_000));
  expect(heard).toHaveBeenCalledTimes(1);
  // And forward, by just over the threshold.
  noteClockTick((t += 1000 + CLOCK_JUMP_MS));
  expect(heard).toHaveBeenCalledTimes(2);
});

it('does not take the first tick after a pause for a jump', () => {
  const heard = jest.fn();
  onClockJump(heard);
  noteClockTick(1_000_000);
  forgetClockTicks();
  noteClockTick(5_000_000);
  expect(heard).not.toHaveBeenCalled();
});

it('is wired: the hero ticks it, the watchdog hears it', () => {
  const fs = require('fs');
  const path = require('path');
  const card = fs.readFileSync(path.join(__dirname, '..', 'src/screens/home/TodayCard.tsx'), 'utf-8');
  const home = fs.readFileSync(path.join(__dirname, '..', 'src/screens/HomeScreen.tsx'), 'utf-8');
  expect(card).toMatch(/noteClockTick\(t\);/);
  expect(card).toMatch(/forgetClockTicks\(\);/);
  expect(home).toMatch(/const off = onClockJump\(tick\);/);
});
