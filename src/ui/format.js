// Number formatting for the HUD and the sheets.
//
// Written out rather than delegated to toLocaleString: Hermes' Intl support
// varies by build, and a score that silently loses its separators on one engine
// and keeps them on another is exactly the kind of thing nobody tests.

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
