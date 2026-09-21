// The strings the UI builds out of numbers — for the HUD, the sheets, and the
// labels VoiceOver reads.
//
// Written out rather than delegated to toLocaleString: Hermes' Intl support
// varies by build, and a score that silently loses its separators on one engine
// and keeps them on another is exactly the kind of thing nobody tests.
//
// It imports nothing, for §6.7's reason: a label is a claim about what is on
// screen, and a claim that can only be read off a device is a claim nobody
// checks. AC-902's tray label is built here rather than inside `Tray.js` so
// `node --test` can read it.

/**
 * `'worklet'` because the HUD's count-up formats the number on the UI thread
 * (components/Hud.js): Reanimated drives the TextInput's `text` prop from a
 * worklet, and a worklet may only call other worklets. It remains an ordinary
 * function on the JS side — the directive adds a capability, it does not remove
 * one — so the sheets and the tests call it unchanged. The alternative was a
 * second copy of the grouping rule inside the worklet, and a second copy is a
 * second opinion.
 */
export function formatScore(value) {
  'worklet';
  const digits = String(Math.max(0, Math.trunc(value)));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/**
 * Count agreement, in ONE place.
 *
 * Eight sites were deciding it separately, and FOUR of them were wrong: the
 * tray's VoiceOver label said `1 cells`, its visible counter said `1 CELLS`,
 * the abilities button said `1 charges` and the Records screen said `1 turns`.
 * The other four were right — the frozen tray, the Dart counter, and two
 * strings whose count is a constant that can never be one. That is §6.3's
 * shape exactly: the copies that agreed are what made the copies that did not
 * look survivable.
 *
 * `many` is spelled out rather than always suffixed, so a plural the `s` rule
 * does not reach has somewhere to go without a second helper appearing beside
 * this one. The uppercase chrome labels are exactly that case: `MOVE` + `s` is
 * `MOVEs`, which is why they pass both forms.
 */
function pluralNoun(count, one, many) {
  return count === 1 ? one : (many === undefined ? `${one}s` : many);
}

/** `1 cell`, `3 cells` — the count and its noun, agreeing. */
export function plural(count, one, many) {
  return `${count} ${pluralNoun(count, one, many)}`;
}

/**
 * AC-902 — what VoiceOver reads off the tray.
 *
 * It lives here rather than in the component because it is DELIBERATELY more
 * detailed than the silhouette strip a sighted player sees (AC-902b): the
 * species names are the information, not decoration, so this is a label that
 * has to be checkable, and a function inside a file that imports Reanimated is
 * not (§6.7).
 */
export function trayLabel(queue, cells, frozen) {
  if (frozen > 0) {
    return `Nothing arrives for ${frozen} more ${pluralNoun(frozen, 'turn')}.`;
  }
  if (queue.length === 0) return 'Next arrival: nothing queued.';
  const parts = queue.map((a) => {
    const where = a.size === 1 ? `column ${a.x + 1}` : `columns ${a.x + 1} to ${a.x + a.size}`;
    return `${a.type} at ${where}`;
  });
  return `Next arrival: ${parts.join(', ')}. ${plural(cells, 'cell')}.`;
}

/**
 * A `YYYY-MM-DD` day key as `21 Sep`, for the recent-runs list (AC-1011b).
 *
 * Written out for the same reason `formatScore` does its own digit grouping:
 * Hermes' Intl support varies by build, and a date that silently loses its
 * month name on one engine is exactly the kind of thing nobody tests. It also
 * keeps this module importing nothing, so the Records screen's one piece of
 * arithmetic stays checkable in `node --test`.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(day) {
  const parts = String(day).split('-');
  const month = MONTHS[Number(parts[1]) - 1];
  if (parts.length !== 3 || !month || !Number(parts[2])) return String(day);
  return `${Number(parts[2])} ${month}`;
}
