#!/usr/bin/env node
// Headless run viewer. Plays a seeded run with the greedy harness in bot.mjs and
// prints each board as text, so the engine can be sanity-checked without a phone.
//
//   node tools/play.mjs --seed 42 --turns 30
//   node tools/play.mjs --seed 7 --difficulty tundra --turns 60 --every 10
//   node tools/play.mjs --seed 42 --turns 200 --quiet
//   node tools/play.mjs --pacing            # the AC-318 measurement
//
// This is a developer tool. It is not bundled into the app.

import { BOARD, DIFFICULTIES, STATUS } from '../src/engine/constants.js';
import { ACTIONS, createRun, queueCells, reduce, runRecord } from '../src/engine/engine.js';
import { chooseAction, measurePacing } from './bot.mjs';

const GLYPH = { rat: 'R', fox: 'F', elk: 'K', buffalo: 'B', elephant: 'E' };

function parseArgs(argv) {
  const args = { seed: 42, turns: 30, difficulty: 'savanna', every: 1, quiet: false, pacing: false };
  const numeric = { '--seed': 'seed', '--turns': 'turns', '--every': 'every' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (numeric[flag]) {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value)) throw new Error(`${flag} needs a number`);
      args[numeric[flag]] = value;
      i += 1;
    } else if (flag === '--difficulty') {
      args.difficulty = argv[i + 1];
      i += 1;
    } else if (flag === '--quiet') {
      args.quiet = true;
    } else if (flag === '--pacing') {
      args.pacing = true;
    } else if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  if (!DIFFICULTIES[args.difficulty]) {
    throw new Error(`--difficulty must be one of ${Object.keys(DIFFICULTIES).join(', ')}`);
  }
  return args;
}

function renderBoard(animals) {
  const grid = Array.from({ length: BOARD.height }, () => new Array(BOARD.width).fill('.'));
  for (const a of animals) {
    if (a.y < 0 || a.y >= BOARD.height) continue;
    for (let c = a.x; c < a.x + a.size; c++) grid[a.y][c] = GLYPH[a.type] || '?';
  }
  const lines = [];
  for (let y = BOARD.height - 1; y >= 0; y--) {
    let marker = '  ';
    if (y === BOARD.killLine) marker = 'XX';
    else if (y >= BOARD.dangerBandLow && y <= BOARD.dangerBandHigh) marker = '!!';
    lines.push(`${String(y).padStart(2)} ${marker} |${grid[y].join('')}|`);
  }
  lines.push(`        +${'-'.repeat(BOARD.width)}+`);
  lines.push(`         ${Array.from({ length: BOARD.width }, (_, i) => i % 10).join('')}`);
  return lines.join('\n');
}

function renderTray(queue) {
  const row = new Array(BOARD.width).fill('.');
  for (const a of queue) for (let c = a.x; c < a.x + a.size; c++) row[c] = GLYPH[a.type] || '?';
  return `|${row.join('')}|  ${queue.length} animals, ${queue.reduce((s, a) => s + a.size, 0)} cells`;
}

function describe(action) {
  if (!action) return 'none';
  if (action.type === ACTIONS.PASS) return 'PASS';
  // Animal ids are namespaced by run; the tail alone is enough to read here.
  const shortId = String(action.id).split('.').pop();
  return `MOVE #${shortId} -> x=${action.x}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/play.mjs [--seed N] [--turns N] [--difficulty meadow|savanna|tundra]\n' +
        '                          [--every N] [--quiet] [--pacing]\n',
    );
    return;
  }

  if (args.pacing) {
    const rows = measurePacing();
    const lines = ['AC-318 pacing — 30 seeds per difficulty, deterministic greedy bot',
      'A measurement, not a gate: AC-318 is a starting hypothesis (gameplay.md §5.7).', ''];
    lines.push('difficulty  median    mean   min   max   median score');
    for (const [difficulty, row] of Object.entries(rows)) {
      lines.push(
        `${difficulty.padEnd(11)}${String(row.median).padStart(6)}` +
          `${row.mean.toFixed(1).padStart(8)}${String(row.min).padStart(6)}` +
          `${String(row.max).padStart(6)}${String(row.medianScore).padStart(15)}`,
      );
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  let state = createRun({ seed: args.seed, difficulty: args.difficulty });
  const out = [];
  const log = (line) => out.push(line);

  log(`Wildlife Shuffle — seed ${args.seed}, ${args.difficulty}, ${args.turns} turns`);
  if (!args.quiet) {
    log('');
    log(`TURN ${state.turn} (start)   score 0`);
    log(renderBoard(state.animals));
    log(`tray  ${renderTray(state.queue)}`);
  }

  let played = 0;
  for (let i = 0; i < args.turns && state.status === STATUS.READY; i++) {
    const action = chooseAction(state);
    const turn = state.turn;
    const next = reduce(state, action);
    played += 1;

    if (!args.quiet && (turn % args.every === 0 || next.status !== STATUS.READY)) {
      const t = next.lastTurn;
      const clears = t.events.filter((e) => e.type === 'CLEAR_STEP');
      log('');
      log(
        `TURN ${turn}  ${describe(action)}  +${t.score}  score ${next.score}  ` +
          `streak ${next.streak} (x${t.streakMult})  chain ${t.longestChain}` +
          (t.perfectClear ? '  PERFECT CLEAR' : ''),
      );
      for (const step of clears) {
        log(
          `  step ${step.step}: rows [${step.rows.join(',')}] cleared [${step.clearedRows.join(',')}]` +
            (step.shrunk.length ? ` buffalo ${step.shrunk.map((s) => `${s.fromSize}->${s.toSize}`).join(',')}` : '') +
            `  +${step.score}`,
        );
      }
      log(renderBoard(next.animals));
      log(`tray  ${renderTray(next.queue)}  (${queueCells(next)} cells arriving next turn)`);
    }
    state = next;
  }

  const record = runRecord(state);
  log('');
  log(state.status === STATUS.GAME_OVER ? `GAME OVER on turn ${record.turns}` : `stopped after ${played} turns`);
  const survived = state.status === STATUS.GAME_OVER ? record.turns : played;
  log(
    `score ${record.score} · turns ${survived} · rows ${record.rowsCleared} · ` +
      `longest chain ${record.longestChain} · longest streak ${record.longestStreak} · ` +
      `buffalo retired ${record.buffaloRetired} · perfect clears ${record.perfectClears} · ` +
      `seed ${record.seed}`,
  );
  if (state.stats.chainGuardTrips > 0) {
    log(`!! chain guard tripped ${state.stats.chainGuardTrips}x — the engine is broken`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

main();
