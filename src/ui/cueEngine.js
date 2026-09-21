// The cue player, with the platform taken out of it.
//
// `src/ui/cuePlayer.js` is thirty lines that hand this an adapter made of
// `expo-audio` and `expo-haptics`. Everything that could be WRONG rather than
// merely absent lives here, behind an injected adapter, so `node --test` can
// watch it happen:
//
//   * the audio session is configured BEFORE any player exists (AC-1105). Get
//     that order backwards and the first player opens on the default category,
//     which takes audio focus and stops the player's music — and no test that
//     only inspects `AUDIO_MODE` would notice.
//   * a toggle turned off silences its own channel and only its own, on the
//     very next cue and with nothing queued behind it (AC-1104).
//   * a cue that throws does not take the turn with it.
//
// The pattern is `src/ui/diagnostics.js`: module-level state written by a hook,
// read by a plain function that anything may call. That is what makes the grab
// cue affordable inside the gesture worklet — `fireCue` has a stable identity
// and touches no React state, so AC-831's "zero re-renders mid-drag" survives a
// `runOnJS` hop at `onBegin`.

import { AUDIO_MODE, cuePlan } from './cues.js';

/**
 * @param {object} adapter
 * @param {function} adapter.setAudioMode  (mode) => Promise
 * @param {function} adapter.createPlayer  (source) => player
 * @param {object}   adapter.sources       cue sound id -> bundled asset
 * @param {function} adapter.haptic        (HAPTIC id) => void
 */
export function makeCueEngine(adapter) {
  const players = new Map();
  let prefs = { sound: true, haptics: true };
  /** Only true once the session is configured. Nothing is created before it. */
  let ready = false;
  let starting = null;

  /**
   * AC-1105, as a sequence rather than as a constant.
   *
   * Idempotent: App mounts once but StrictMode runs its effects twice, and two
   * `setAudioModeAsync` calls racing each other is a state nobody wants to
   * reason about.
   */
  function start() {
    if (starting) return starting;
    starting = Promise.resolve()
      .then(() => adapter.setAudioMode(AUDIO_MODE))
      .then(() => {
        ready = true;
      })
      .catch(() => {
        // A device that refused the category is a device whose audio session we
        // do not understand, so we do not open a player on it. Haptics are a
        // separate channel and keep working (AC-1103's shape, for a different
        // reason). Nothing is logged: AC-1301.
        ready = false;
      });
    return starting;
  }

  function player(id) {
    let found = players.get(id);
    if (found) return found;
    const source = adapter.sources[id];
    if (source === undefined) return null;
    found = adapter.createPlayer(source);
    if (!found) return null;
    players.set(id, found);
    return found;
  }

  /**
   * One cue. Never throws, never returns a promise, never renders anything.
   *
   * The two channels are independent all the way down — a sound that fails does
   * not cost the haptic and vice versa — because AC-1104 is about independence
   * and a shared try/catch would quietly couple them at the one moment it
   * matters.
   */
  function fire(cue, rate = 1) {
    const plan = cuePlan(cue, prefs, rate);
    if (plan.sound !== null && ready) {
      try {
        const p = player(plan.sound);
        if (p) {
          // Set the rate before seeking: `setPlaybackRate` on some builds
          // restarts the item, and a seek that lands after it would be undone.
          if (p.setPlaybackRate) p.setPlaybackRate(plan.rate);
          const seek = p.seekTo(0);
          if (seek && typeof seek.catch === 'function') seek.catch(() => {});
          p.play();
        }
      } catch {
        // A cue is decoration. It may not take the turn with it.
      }
    }
    for (const h of plan.haptics) {
      try {
        adapter.haptic(h);
      } catch {
        // As above, and per-haptic: `perfect` fires two and the second must
        // still fire if the first is refused.
      }
    }
    return plan;
  }

  /** AC-1104: one assignment, no cache to invalidate, effective next cue. */
  function setPrefs(next) {
    prefs = { sound: Boolean(next && next.sound), haptics: Boolean(next && next.haptics) };
  }

  // There is no `stop()`. The app opens one audio session and eleven short
  // players and keeps them for its lifetime — a teardown nothing calls is dead
  // code, and dead code is how you end up with a cleanup path that has never
  // run being the first thing to run on a device.
  return { start, fire, setPrefs };
}
