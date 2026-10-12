/**
 * The hero as the kept launch picture shows it: at the prayer it is
 * counting from.
 *
 * The picture is a copy of the window (native/LaunchSnapshot.ts), and the
 * hero in it reads whatever the countdown said when it was taken. On the
 * next launch the hero then had to run from THAT — a few minutes behind
 * if the app was left a few minutes ago — and the first frame showed a
 * position the run was about to leave. So the hero is also drawn a second
 * time, out of sight under the real one, posed at the start of the
 * current interval: the countdown at the whole of it, the rail empty, the
 * sky at the prayer's hour. When the screen is kept, that pose is drawn
 * into the picture over the real hero. Every launch then opens on the
 * prayer and runs the whole way from it to now (launchWarp.ts) —
 * whatever has passed since, the first frame is never a stale "now".
 *
 * The real hero registers its posed twin here (TodayCard mounts it when
 * there is an interval to pose at), and the keeper asks for it drawn.
 */
import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';

type Pose = {
  ref: RefObject<HostInstance | null>;
  /** The interval the pose shows the start of. */
  fromAt: number;
  targetAt: number;
};

let pose: Pose | null = null;

export function registerPoseHero(p: Pose | null): void {
  pose = p;
}

export function hasPoseHero(): boolean {
  return pose != null && pose.ref.current != null;
}

/** Test seam. */
export function _resetPoseHeroForTests(): void {
  pose = null;
}

export type PosedHero = { file: string; x: number; y: number; targetAt: number; fromAt: number };

/**
 * Draw the posed hero to a file and say where it sits in the window (dp).
 * Null when there is none to draw.
 */
export async function capturePoseHero(): Promise<PosedHero | null> {
  const p = pose;
  const view = p?.ref.current;
  if (!p || !view) return null;
  // Lazy: view-shot is only ever needed here and on the share screen.
  const { captureRef } = await import('react-native-view-shot');
  const file = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
  const rect = await new Promise<{ x: number; y: number; w: number; h: number }>(resolve =>
    view.measureInWindow((x: number, y: number, w: number, h: number) => resolve({ x, y, w, h })),
  );
  if (!(rect.w > 0 && rect.h > 0)) return null;
  return { file, x: rect.x, y: rect.y, targetAt: p.targetAt, fromAt: p.fromAt };
}
