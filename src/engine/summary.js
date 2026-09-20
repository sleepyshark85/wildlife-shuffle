// The one place run statistics come from. gameplay.md §7.3a, AC-706b.
//
// Score and every statistic are read off the same events[] array. They cannot
// disagree, because there is nothing to keep in sync: a statistic counted at a
// second site is a defect even while it happens to agree.

/**
 * Fold a turn's (or a resolution's) event stream into score and statistics.
 *
 * `rowsCleared` is the sum of `n` across events, `longestChain` the highest
 * `step` in any event, `buffaloRetired` the count of retirements carried by
 * those same events.
 */
export function summariseEvents(events) {
  let score = 0;
  let rowsCleared = 0;
  let longestChain = 0;
  let buffaloShrinks = 0;
  let buffaloRetired = 0;
  let clearSteps = 0;
  let perfectClears = 0;
  let guardTrips = 0;

  for (const event of events) {
    switch (event.type) {
      case 'CLEAR_STEP':
        score += event.score;
        rowsCleared += event.clearedRows.length;
        longestChain = Math.max(longestChain, event.step);
        buffaloShrinks += event.shrunk.length;
        buffaloRetired += event.retiredIds.length;
        clearSteps += 1;
        break;
      case 'PERFECT_CLEAR':
        score += event.score;
        perfectClears += 1;
        break;
      case 'CHAIN_GUARD':
        guardTrips += 1;
        break;
      default:
        break;
    }
  }

  return {
    score,
    rowsCleared,
    longestChain,
    buffaloShrinks,
    buffaloRetired,
    clearSteps,
    perfectClears,
    guardTrips,
  };
}
