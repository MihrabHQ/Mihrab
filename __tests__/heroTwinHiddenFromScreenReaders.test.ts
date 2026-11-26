/**
 * Today draws its hero twice while a launch picture is being kept: the
 * real one, and under it a posed twin, stopped at the start of the
 * prayer's interval, which is drawn to a file (`poseHero.ts`). The twin's
 * countdown is therefore old — "2 h 18 m" beside the true "1 h 3 m" on
 * 2026-11-26 — and a screen reader that reached it would read a wrong
 * time to next prayer aloud (AGENTS.md §1). It must stay hidden from
 * accessibility on both platforms, and untouchable.
 *
 * A raw `uiautomator dump` lists the twin all the same: it includes views
 * marked not important. That is the tool, not the app.
 */
import fs from 'fs';
import path from 'path';

const card = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'TodayCard.tsx'), 'utf8');

describe('the posed twin of Today’s hero', () => {
  it('is hidden from screen readers and takes no touches', () => {
    expect(card).toContain('ref={poseRef}');
    const twin = card.slice(card.indexOf('ref={poseRef}'));
    const head = twin.slice(0, twin.indexOf('style={{'));
    expect(head).toContain('pointerEvents="none"');
    expect(head).toContain('importantForAccessibility="no-hide-descendants"');
    expect(head).toContain('accessibilityElementsHidden');
  });

  it('is the only hero that is stopped: the real one is given no frozen clock', () => {
    const heroes = card.split('<HeroToday').slice(1).map(h => h.slice(0, h.indexOf('/>')));
    expect(heroes).toHaveLength(2);
    expect(heroes[0]).toContain('frozenAt={interval.fromAt}');
    expect(heroes[1]).not.toContain('frozenAt');
  });
});
