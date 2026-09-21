// The board's stacking order, as data — and what a touch at a point reaches.
//
// WHY THIS MODULE EXISTS. The targeting scrim shipped with `zIndex: 2` over
// animals resting at `zIndex: 1`, with a comment directly above it asserting
// the opposite: "it sits under the animals, so a valid target's own press
// wins". The comment was the only place the claim lived, the suite was green,
// and Burrow and Migrate were unreachable by touch — every tap on a valid
// target hit the scrim and was read as "outside any valid target, cancel".
//
// That is §6.7 again, for the third consecutive time, and the reason it got
// through is the same every time: the STATE was right. `isTarget()` returned
// true, `onTarget` was wired correctly, the engine spent the charge the moment
// the handler was reached by keyboard. Nothing in the suite could evaluate
// what was on top of what.
//
// So z-order stops being a literal typed into two components and becomes a
// table with one owner, and "what does a tap reach" becomes a function. Both
// are pure and import nothing, for `trajectory.js`'s reason: a claim about the
// rendered surface that only a device can evaluate is a claim nobody checks.

/**
 * Every layer the board paints, with its z-index.
 *
 * THE ONE ORDERING CONSTRAINT THAT IS LOAD-BEARING: `animal` must be above
 * `targetScrim`, or the targeting state is unusable. `test/abilities-ui.test.js`
 * asserts it as arithmetic, and a hygiene test asserts the components read
 * these values rather than writing their own.
 *
 * `cells`, `pulse` and `clears` share 0 with the scrim and are separated by
 * document order alone — the scrim is painted after them, so it dims them, and
 * before the animals, so it does not dim those.
 */
export const Z = Object.freeze({
  cells: 0,
  pulse: 0,
  clears: 0,
  /** ui.md §13.3's 45% dim of the ground. Painted last of the 0s. */
  targetScrim: 0,
  recess: 1,
  animal: 1,
  ghost: 10,
  /** The arrival flight crosses from the tray into the board (AC-809). */
  flight: 5,
  /** The body in the player's hand clears everything. */
  grabbed: 20,
});

/** What a touch can land on. Everything else is paint. */
export const HIT = Object.freeze({
  TARGET: 'target',
  CANCEL: 'cancel',
  NONE: 'none',
});

/**
 * The topmost hittable candidate at a point.
 *
 * `order` is the child's index in the board's JSX, which is what breaks a tie
 * between two layers at the same z — React Native and the DOM both resolve a
 * z-index tie by document order, later wins.
 *
 * @param {{z:number, order:number, hit:string}[]} candidates layers covering
 *        the point, in any order.
 */
export function topmost(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (candidate.hit === HIT.NONE) continue;
    if (!best || candidate.z > best.z || (candidate.z === best.z && candidate.order > best.order)) {
      best = candidate;
    }
  }
  return best || { hit: HIT.NONE, z: -1, order: -1 };
}

/** The board's child order, as `Board.js` writes it. A hygiene test checks it. */
export const ORDER = Object.freeze({
  cells: 0,
  pulse: 1,
  clears: 2,
  targetScrim: 3,
  recess: 4,
  ghost: 5,
  /** Animals are the last children, so they are the last of the z=1 group. */
  animals: 6,
});

/**
 * What a tap at cell (x, y) reaches while `arming` is armed.
 *
 * Returns `{hit, id}` — HIT.TARGET with the animal's id when the tap commits
 * the ability, HIT.CANCEL when it backs out (AC-1414: a tap outside any valid
 * target cancels, and so does a tap on an animal that is not a valid target),
 * HIT.NONE when nothing is armed.
 *
 * EVERY animal carries an overlay while targeting, valid or not. That is not
 * tidiness: once the animals correctly sit ABOVE the scrim, an invalid target
 * with no overlay would swallow the tap into its own dead pan gesture and the
 * player would be stuck in a targeting state that no longer cancels.
 *
 * @param {object[]} animals   the board
 * @param {string|null} arming the armed ability id, or null
 * @param {Function} valid     `(ability, animal) => boolean`
 */
export function tapAt(animals, arming, valid, x, y) {
  if (!arming) return { hit: HIT.NONE, id: null };
  const under = animals.find(
    (a) => a.y === y && x >= a.x && x < a.x + a.size,
  );
  const candidates = [{ z: Z.targetScrim, order: ORDER.targetScrim, hit: HIT.CANCEL, id: null }];
  if (under) {
    candidates.push({
      z: Z.animal,
      order: ORDER.animals,
      hit: valid(arming, under) ? HIT.TARGET : HIT.CANCEL,
      id: under.id,
    });
  }
  const won = topmost(candidates);
  return { hit: won.hit, id: won.id === undefined ? null : won.id };
}
