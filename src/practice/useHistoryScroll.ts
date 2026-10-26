/**
 * A horizontal record that opens on today and reaches back on request.
 *
 * The scrolling rules PracticeHeatmap learned the hard way, as a hook, so
 * the strip (PracticeStrip) scrolls exactly as the grid does:
 *
 * - it opens parked on today, and keeps re-asserting that until a finger
 *   has moved it — Android re-anchors a right-to-left scroll view on every
 *   content change and tells nobody;
 * - dragging to the oldest column asks the owner for more history, and the
 *   dates under the thumb stay where they were when it arrives;
 * - a record that fits its card grows until it can be dragged at all.
 *
 * The heatmap keeps its own copy of this logic for now (its tests pin it);
 * the two should converge on this hook.
 */
import { useEffect, useRef } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from 'react-native';
import { maxOffset, offsetAfterGrowth, shouldLoadOlder, todayOffset } from './heatmapScroll';

/** How many times the record may grow only because it still fits the card. */
const GROWTH_ASKS = 3;

export function useHistoryScroll({
  columns,
  columnWidth,
  rtl,
  onReachOldest,
}: {
  /** How many columns are drawn now. */
  columns: number;
  /** One column, including the gap that follows it. */
  columnWidth: number;
  rtl: boolean;
  onReachOldest?: () => void;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const parked = useRef(false);
  const drawn = useRef(0);
  const offset = useRef(0);
  const asking = useRef(false);
  const contentWidth = useRef(0);
  const viewportWidth = useRef(0);
  const touched = useRef(false);
  const growthAsks = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const restingOffset = (content = contentWidth.current, view = viewportWidth.current) =>
    todayOffset(rtl, maxOffset(content, view));

  const parkOnToday = () => {
    const apply = () => scrollRef.current?.scrollTo({ x: restingOffset(), animated: false });
    apply();
    for (const delay of [0, 120]) {
      timers.current.push(
        setTimeout(() => {
          if (!touched.current) apply();
        }, delay),
      );
    }
  };
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const growIfItFits = () => {
    if (!onReachOldest || asking.current) return;
    if (growthAsks.current >= GROWTH_ASKS) return;
    if (viewportWidth.current <= 0 || contentWidth.current <= 0) return;
    if (contentWidth.current > viewportWidth.current + columnWidth) return;
    growthAsks.current += 1;
    onReachOldest();
  };

  const onSized = () => {
    if (columns === 0) return;
    if (!parked.current) {
      if (contentWidth.current <= 0) return;
      parked.current = true;
      drawn.current = columns;
      parkOnToday();
      growIfItFits();
      return;
    }
    if (columns === drawn.current) {
      if (!touched.current) parkOnToday();
      growIfItFits();
      return;
    }
    const added = columns - drawn.current;
    drawn.current = columns;
    if (added > 0 && asking.current) {
      scrollRef.current?.scrollTo({
        x: offsetAfterGrowth(rtl, offset.current, added, columnWidth),
        animated: false,
      });
      asking.current = false;
      return;
    }
    parkOnToday();
    growIfItFits();
  };
  useEffect(() => {
    if (parked.current) return;
    onSized();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const onContentSizeChange = (w: number) => {
    contentWidth.current = w;
    onSized();
  };
  const onLayout = (e: LayoutChangeEvent) => {
    viewportWidth.current = e.nativeEvent.layout.width;
  };
  const onScrollBeginDrag = () => {
    touched.current = true;
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    offset.current = contentOffset.x;
    contentWidth.current = contentSize.width;
    viewportWidth.current = layoutMeasurement.width;
    if (parked.current && !touched.current) {
      const want = restingOffset(contentSize.width, layoutMeasurement.width);
      if (Math.abs(contentOffset.x - want) > columnWidth) {
        scrollRef.current?.scrollTo({ x: want, animated: false });
        return;
      }
    }
    if (!parked.current || !onReachOldest || !touched.current) return;
    if (
      !shouldLoadOlder({
        rtl,
        offset: contentOffset.x,
        contentWidth: contentSize.width,
        viewportWidth: layoutMeasurement.width,
        columnWidth,
      })
    ) {
      return;
    }
    if (asking.current) return;
    asking.current = true;
    onReachOldest();
  };

  return { scrollRef, onContentSizeChange, onLayout, onScrollBeginDrag, onScroll };
}
