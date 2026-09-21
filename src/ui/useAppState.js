// AC-1013: the one moment the in-progress run is written to disk.
//
// On `AppState` transition to `inactive` or `background`, and nowhere else.
// Not per turn, not on a timer, not from the render path — which is the whole
// of AC-1002, and precisely what v1 got wrong: it serialised the entire board
// on a 1 Hz `setInterval` whose `[store]` dependency array rebuilt the interval
// on every render, for the life of the run (`GameScreen.js:53-72` at v1 HEAD).
//
// The subscription is created once and torn down on unmount. `onLeave` is read
// through a ref rather than listed as a dependency for exactly the reason v1's
// interval was wrong: the callback closes over the current board, so it changes
// every turn, and depending on it would rebuild the subscription every turn.
// A ref makes the handler stable AND current, which is the pair the dependency
// array cannot give you.
//
// The trade-off is stated in the design and accepted: a hard crash mid-run
// loses the run, where v1's timer would have lost at most a second.
// Backgrounding is constant and crashing is rare, and the alternative is
// writing to disk forever during play to insure against something that should
// not happen. If crash-loss shows up in real use the fix is a write on the turn
// boundary after a long gap — not a 1 Hz timer.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const LEAVING = new Set(['inactive', 'background']);

export function useOnBackground(onLeave) {
  const latest = useRef(onLeave);
  // Updated after the commit rather than during render: render stays free of
  // side effects, and the handler is current by the time anything can fire it.
  useEffect(() => {
    latest.current = onLeave;
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (LEAVING.has(next)) latest.current();
    });
    return () => {
      if (subscription && typeof subscription.remove === 'function') subscription.remove();
    };
  }, []);
}
