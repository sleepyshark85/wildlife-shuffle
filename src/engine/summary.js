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
 * those same events, and `longestStreak` the settled streak the ADVANCE event
 * carries (AC-706e). There is no statistic that comes from anywhere else.
 *
 * `abilitiesUsed`, `chargesEarned` and `lastStands` are Layer D read the same
 * way: an ability use is an ACTION event and a granted charge is a CHARGE
 * event, so the HUD's pip, the run record's count and the engine's own
 * `state.charges` are three readings of one stream and cannot disagree.
 *
 * `mostRowsInStep` is the Golden Herd unlock's condition — "clear 4 rows in a
 * single step" (gameplay.md §9). It is the widest CLEAR_STEP the stream
 * carries, and it is folded HERE rather than counted at the unlock's own site
 * for the reason §6.3 records: a statistic incremented at a second site is a
 * defect even while it happens to agree.
 */
export function summariseEvents(events) {
  let score = 0;
  let rowsCleared = 0;
  let longestChain = 0;
  let mostRowsInStep = 0;
  let buffaloShrinks = 0;
  let buffaloRetired = 0;
  let clearSteps = 0;
  let perfectClears = 0;
  let longestStreak = 0;
  let guardTrips = 0;
  let abilitiesUsed = 0;
  let chargesEarned = 0;
  let lastStands = 0;

  for (const event of events) {
    switch (event.type) {
      case 'CLEAR_STEP':
        score += event.score;
        rowsCleared += event.clearedRows.length;
        longestChain = Math.max(longestChain, event.step);
        mostRowsInStep = Math.max(mostRowsInStep, event.clearedRows.length);
        buffaloShrinks += event.shrunk.length;
        buffaloRetired += event.retiredIds.length;
        clearSteps += 1;
        break;
      case 'PERFECT_CLEAR':
        score += event.score;
        perfectClears += 1;
        break;
      case 'ACTION':
        // Layer D. An ability use is an ACTION like a move is, so the count of
        // them comes off the stream with everything else rather than from a
        // counter somebody remembers to increment (§6.3).
        if (event.action === 'ABILITY') abilitiesUsed += 1;
        break;
      case 'CHARGE':
        chargesEarned += 1;
        if (event.reason === 'lastStand') lastStands += 1;
        break;
      case 'ADVANCE':
        // The streak is a turn-level fact, so the turn's own event carries it.
        longestStreak = Math.max(longestStreak, event.streak);
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
    mostRowsInStep,
    buffaloShrinks,
    buffaloRetired,
    clearSteps,
    perfectClears,
    longestStreak,
    guardTrips,
    abilitiesUsed,
    chargesEarned,
    lastStands,
  };
}
