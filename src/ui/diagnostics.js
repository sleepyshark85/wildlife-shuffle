// The diagnostic log.
//
// The owner asked for this after a bug they could see and could not describe:
// every animal that arrived from the tray rendered at opacity 0, so the board
// filled with correctly-placed invisible animals. What they could report was
// "animals don't drop" and "new animals disappear" — two symptoms of one cause,
// and neither of them the cause. It took a scripted DOM dump to find it.
//
// So this log is built to make exactly that class of fault obvious: it prints
// the engine's board and the RENDERED board side by side, per animal, with the
// rendered opacity, and shouts when the two disagree or when something on the
// board is not visible. A log that could not have caught the bug that caused it
// is the wrong log.
//
// Three rules it keeps:
//
//  1. **No `console`, ever.** AC-1301 forbids it in a render path and a hygiene
//     test enforces that. This accumulates text in memory and hands it to the
//     player to copy; nothing is written to a stream.
//  2. **Off by default, and absent from a production bundle.** `available()` is
//     `__DEV__`, so in a release build the toggle does not appear and `enabled`
//     can never become true.
//  3. **No timer, no render-path work.** It is called once per turn from the
//     lock the state layer already owns (AC-828), and when it is off the call
//     returns on its first line.

import { BOARD } from '../engine/constants.js';
import { formatScore } from './format.js';

/** Enough turns to cover "it went wrong a little while ago". */
const MAX_TURNS = 40;

const probes = new Map();
let enabled = false;
let turns = [];
let run = null;

/**
 * RN and Metro define `__DEV__`; a production bundle sets it false. Same probe
 * as chainGuard.js — the engine may not import from here and vice versa.
 */
export function diagnosticsAvailable() {
  return typeof globalThis.__DEV__ !== 'undefined' && globalThis.__DEV__ === true;
}

export function diagnosticsEnabled() {
  return enabled;
}

/**
 * @param {boolean} on
 * @param {function} [dev] injected for testing, exactly as chainGuard.js does
 *                         it — Node has no `__DEV__`, so without this the
 *                         whole facility would be untestable off a device.
 */
export function setDiagnosticsEnabled(on, dev = diagnosticsAvailable) {
  enabled = Boolean(on) && dev();
  if (!enabled) {
    turns = [];
    probes.clear();
  }
}

/**
 * Each animal offers a reader for its own rendered state. Registered from an
 * effect, never from render, and only while the log is on — an off log costs
 * one boolean check per animal per turn and nothing else.
 */
export function registerProbe(id, read) {
  probes.set(id, read);
}

export function releaseProbe(id) {
  probes.delete(id);
}

export function clearDiagnostics() {
  turns = [];
}

/**
 * One turn, recorded after the lock ends — which is the moment the structural
 * animation has finished, so a rendered value that still disagrees with the
 * engine is a real disagreement rather than a frame of animation.
 */
export function recordTurn(entry) {
  if (!enabled) return;
  run = { seed: entry.seed };

  const rows = entry.animals.map((animal) => {
    const probe = probes.get(animal.id);
    let rendered = null;
    try {
      rendered = probe ? probe() : null;
    } catch {
      rendered = null; // a probe that throws must never take the turn with it
    }
    return { animal, rendered };
  });

  turns.push({
    turn: entry.turn,
    action: entry.action,
    score: entry.score,
    gained: entry.gained,
    lockMs: entry.lockMs,
    rows,
  });
  if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
}

const pad = (value, width) => String(value).padEnd(width);

function place(x, y, size) {
  return `r${String(y).padStart(2)} c${String(x).padStart(2)} w${size}`;
}

function turnReport(record) {
  const lines = [];
  const move = record.action === 'MOVE' ? 'MOVE' : 'PASS';
  const gained = record.gained > 0 ? `  +${record.gained}` : '';
  lines.push(
    `--- turn ${record.turn}  ${move}  score ${formatScore(record.score)}${gained}` +
      `  lock ${record.lockMs}ms`,
  );

  // An animal still in flight from the tray is not "invisible", it is arriving
  // — its handover is scheduled for the end of the timeline and the lock ends
  // before that (AC-824f). What this log exists to catch is an alpha that never
  // comes back, and by the next turn nothing is arriving any more.
  const probed = record.rows.filter((r) => r.rendered);
  const settled = probed.filter((r) => !r.rendered.arriving);
  const visible = settled.filter((r) => r.rendered.alpha > 0.01).length;
  const misplaced = probed.filter(
    (r) => r.rendered.row !== r.animal.y || r.rendered.col !== r.animal.x,
  ).length;

  const arriving = probed.length - settled.length;
  let summary =
    `    engine ${record.rows.length} animals · rendered ${probed.length} · visible ${visible}` +
    (arriving ? ` · arriving ${arriving}` : '');
  if (settled.length && visible < settled.length) {
    summary += `   *** ${settled.length - visible} ON THE BOARD BUT INVISIBLE ***`;
  }
  if (misplaced) summary += `   *** ${misplaced} IN THE WRONG PLACE ***`;
  lines.push(summary);

  if (record.rows.length) {
    lines.push(`    ${pad('id', 10)}${pad('type', 10)}${pad('engine', 14)}${pad('rendered', 14)}alpha`);
  }
  for (const { animal, rendered } of record.rows) {
    const id = String(animal.id);
    const short = id.length > 9 ? `…${id.slice(-8)}` : id;
    const engine = place(animal.x, animal.y, animal.size);
    let note = '';
    if (!rendered) note = '  <- not rendered';
    else if (rendered.arriving) note = '  (arriving)';
    else if (rendered.alpha <= 0.01) note = '  <- INVISIBLE';
    else if (rendered.row !== animal.y || rendered.col !== animal.x) note = '  <- MOVED';
    else if (rendered.cells !== animal.size) note = '  <- WRONG WIDTH';
    lines.push(
      `    ${pad(short, 10)}${pad(animal.type, 10)}${pad(engine, 14)}` +
        `${pad(rendered ? place(rendered.col, rendered.row, rendered.cells) : '—', 14)}` +
        `${rendered ? rendered.alpha.toFixed(2) : '—'}${note}`,
    );
  }
  return lines.join('\n');
}

/**
 * The whole log as text, for the player to select and send.
 *
 * The seed is the most valuable line in it, and since the habitats collapsed it
 * is the ONLY line needed: with the seed alone the run replays headlessly
 * (AC-320c), so a report becomes a reproduction.
 */
export function diagnosticsReport() {
  if (!enabled) return 'Diagnostics are off.';
  if (!turns.length) return 'Diagnostics are on. Play a turn and it will appear here.';
  const head = [
    'Wildlife Shuffle — diagnostic log',
    `seed        ${run.seed}`,
    `board       ${BOARD.width} x ${BOARD.height}`,
    `replay      node tools/play.mjs --seed ${run.seed}`,
    `turns kept  last ${turns.length} of ${MAX_TURNS}`,
    '',
  ].join('\n');
  return `${head}${turns.map(turnReport).join('\n')}`;
}
