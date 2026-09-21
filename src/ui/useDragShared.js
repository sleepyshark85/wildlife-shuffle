// The shared values the drag runs on.
//
// They are created once per Game screen and handed to every animal, so the
// gesture worklet, the ghost and the blocked-animal rim all read the same
// numbers on the UI thread without a single React render (AC-831, AC-832).
//
// Per-drag state (origin, snapshot, armed) is NOT here — it lives inside each
// AnimalView. v1 kept one dragStartXRef for the whole board, so two fingers
// corrupted each other's origin (docs/v1-review.md D3, AC-409).

import { useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';

export function useDragShared() {
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostSize = useSharedValue(1);
  const ghostVisible = useSharedValue(0);
  const blockedId = useSharedValue('');
  /**
   * ui.md §5.5 — the origin recess: where the dragged animal came FROM.
   *
   * These live here, beside the ghost, for the same reason the ghost does:
   * they are board-level presentation written by a gesture worklet and read by
   * one view, with no React state in between (AC-423, AC-831).
   *
   * And they are cheaper than the ghost. The destination recomputes on every
   * touch frame because it is a question about where the finger is now; the
   * origin is fixed the instant the gesture starts, so `onBegin` writes it
   * once and `onFinalize` fades it. Nothing touches it in `onUpdate`.
   *
   * `originFill` carries the dragged animal's species fill so the recess can
   * be tinted 12% toward the piece in your hand — the thing that stops a board
   * with several vacated shapes on it from being ambiguous. It is a string
   * shared value because the worklet cannot look the species up.
   */
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const originSize = useSharedValue(1);
  const originFill = useSharedValue('#FFD166');
  const originAlpha = useSharedValue(0);
  /**
   * Bumped whenever the board or the layout changes under the finger. A drag
   * that spans a bump is cancelled rather than committed, because the columns
   * it was aimed at no longer mean what they meant when it started (AC-129) —
   * and because a turn resolved by somebody else's finger has already spent the
   * move this one was going to make (AC-409).
   */
  const epoch = useSharedValue(0);
  /** The input lock, mirrored onto the UI thread so onBegin can read it. */
  const inputOpen = useSharedValue(0);

  return useMemo(
    () => ({
      ghostX, ghostY, ghostSize, ghostVisible, blockedId, epoch, inputOpen,
      originX, originY, originSize, originFill, originAlpha,
    }),
    [ghostX, ghostY, ghostSize, ghostVisible, blockedId, epoch, inputOpen,
      originX, originY, originSize, originFill, originAlpha],
  );
}
