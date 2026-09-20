// Number formatting for the HUD and the sheets.
//
// Written out rather than delegated to toLocaleString: Hermes' Intl support
// varies by build, and a score that silently loses its separators on one engine
// and keeps them on another is exactly the kind of thing nobody tests.

export function formatScore(value) {
  const digits = String(Math.max(0, Math.trunc(value)));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}
