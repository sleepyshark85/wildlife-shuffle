// AC-216's other half, and AC-1309.
//
// The engine emits a CHAIN_GUARD event and returns; it never calls console,
// never throws and never performs I/O (AC-216). Somebody has to be responsible
// for that event being seen, and this is that somebody: in development it
// throws, surfacing as a redbox; in release it is recorded on the run record and
// the run is flagged, without interrupting the player.
//
// A run that trips the guard does not write a high score (AC-504e): the engine
// was in a state the rules do not describe, so its score is not trustworthy.

/** RN and Metro define __DEV__; Node and production bundles do not. */
export function isDevelopment() {
  return typeof globalThis.__DEV__ !== 'undefined' && globalThis.__DEV__ === true;
}

/**
 * @param {object[]} events   a resolved turn's event stream
 * @param {object} context    { seed, turn } — AC-217's diagnostic payload
 * @param {function} [dev]    injected for testing; defaults to the real __DEV__
 * @returns {object|null}     the record to flag the run with, or null
 * @throws in development, so the fault surfaces immediately
 */
export function inspectChainGuard(events, context, dev = isDevelopment) {
  const guard = events.find((event) => event.type === 'CHAIN_GUARD');
  if (!guard) return null;

  const record = {
    steps: guard.steps,
    phase: guard.phase,
    seed: context.seed,
    turn: context.turn,
  };

  if (dev()) {
    throw new Error(
      `CHAIN_GUARD: the clear loop reached ${record.steps} steps in phase ${record.phase} ` +
        `(seed ${record.seed}, turn ${record.turn}). Gravity is not settling, or a clear ` +
        'is not removing. The engine is broken.',
    );
  }
  return record;
}
