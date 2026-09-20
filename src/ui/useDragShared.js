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
  const ghostLegal = useSharedValue(1);
  const ghostVisible = useSharedValue(0);
  const blockedId = useSharedValue('');
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
    () => ({ ghostX, ghostY, ghostSize, ghostLegal, ghostVisible, blockedId, epoch, inputOpen }),
    [ghostX, ghostY, ghostSize, ghostLegal, ghostVisible, blockedId, epoch, inputOpen],
  );
}
