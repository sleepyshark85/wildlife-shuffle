// AC-15xx · the light theme, and the natural background (ui.md §16).
//
// Two kinds of test live here and they are not interchangeable.
//
// The first kind holds `src/ui/theme.js` to `docs/v2/theme-contrast.mjs`. The
// script is the designer's own derivation and the palette is the one the app
// actually paints with; they were written separately and either can drift. The
// script is run AS A SUBPROCESS and the shipped values are held to what it
// PRINTS — the same pattern `test/presentation.test.js` uses for `budget.mjs`,
// and for the same reason: the script calls `process.exit`, so importing it
// would end the test run on the spot. Asserting the doc's numbers against the
// doc would be the design agreeing with itself while the app shipped something
// else.
//
// The second kind is about the layering, and it cannot be a colour check at
// all. AC-1507 says the background "cannot be behind an animal", which is a
// claim about what is opaque and what order things paint in. §6.7's question —
// *what would this look like wrong while the state is right?* — has a specific
// answer for a theme, and it is: every value is correct and one of them is
// being read from the wrong ground.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOARD } from '../src/engine/constants.js';
import { ORDER, Z } from '../src/ui/stacking.js';
import {
  CELL_ALPHA,
  TEXTURE_ROWS,
  paintedCell,
  textureFor,
  texturedRow,
  translucent,
} from '../src/ui/texture.js';
import { DEFAULT_THEME, THEME, brighten, contrast, edgeLit } from '../src/ui/theme.js';
import { cosmeticsFor } from '../src/ui/cosmetics.js';
import { defaultSave, withSettings } from '../src/ui/progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
/** The same comment strip `test/hygiene.test.js` uses: a file may explain a
 *  rule without the grep for that rule firing on the explanation. */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** ui.md §16.1's ramp: the four drawable species, in size order. */
const RAMP = ['rat', 'fox', 'elk', 'elephant'];
/** WCAG 1.4.11. These are solid shapes, not glyphs, so 3:1 and not 4.5:1. */
const SHAPE_FLOOR = 3;
/** AC-1508, the owner's "not too strong" made checkable. */
const TEXTURE_CEIL = 1.25;

/** sRGB source-over, the composite a screen does. Its own arithmetic (§6.2). */
function compose(fg, alpha, bg) {
  const ch = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [f, b] = [ch(fg), ch(bg)];
  return `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha))
    .toString(16).padStart(2, '0')).join('')}`;
}

/** CIE L*, computed here rather than imported, so the ramp has its own witness. */
function lightness(hex) {
  const channel = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const v = parseInt(hex.slice(1), 16);
  const y = 0.2126 * channel((v >> 16) & 255)
    + 0.7152 * channel((v >> 8) & 255)
    + 0.0722 * channel(v & 255);
  return y <= 216 / 24389 ? (y * 24389) / 27 : Math.cbrt(y) * 116 - 16;
}

// ---- AC-1504 · the script is the QA surface ------------------------------

/**
 * Run `docs/v2/theme-contrast.mjs` and parse what it printed.
 *
 * `execFileSync` throws on a non-zero exit, so reaching the end of this
 * function is AC-1504's assertion: the script passed. Everything after it is
 * the second half — that the values it passed ON are the values the app ships.
 */
function contrastReport() {
  // The script exits non-zero when a combination is under the floor, and
  // `execFileSync` throws on that — but its STDOUT is still the report, and
  // the agreement half of this file can be checked from a failing run just as
  // well as from a passing one. So the status is captured rather than thrown,
  // and the test that cares about it says so by name.
  let status = 0;
  let out = '';
  try {
    out = execFileSync('node', [path.join(ROOT, 'docs/v2/theme-contrast.mjs')], {
      encoding: 'utf8',
    });
  } catch (error) {
    status = error.status === undefined ? -1 : error.status;
    out = `${error.stdout || ''}${error.stderr || ''}`;
  }
  const themes = {};
  const accent = {};
  let current = null;
  for (const line of out.split('\n')) {
    const head = /^=== (\w+)\s+board (#[0-9A-Fa-f]{6})/.exec(line);
    if (head) {
      current = { name: head[1].toLowerCase(), board: head[2], species: {}, monotonic: null };
      themes[current.name] = current;
      continue;
    }
    if (!current) continue;
    const row = /^(\w+)\s+(\d)\s+(#[0-9A-Fa-f]{6})\s+(-?\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/
      .exec(line.trim());
    if (row) {
      current.species[row[1]] = {
        size: Number(row[2]),
        fill: row[3],
        lightness: Number(row[4]),
        fillRatio: Number(row[5]),
        edgeRatio: Number(row[6]),
        best: Number(row[7]),
      };
      continue;
    }
    const mono = /^lightness descends monotonically with size: (\w+)/.exec(line);
    if (mono) current.monotonic = mono[1];
    const texture = /^background texture (#[0-9A-Fa-f]{6}) vs board = ([\d.]+):1/.exec(line);
    if (texture) {
      current.texture = texture[1];
      current.textureRatio = Number(texture[2]);
    }
    // §16.2's accent section: `light  label #FFFFFF on accent #975C0F  5.45  4.5`
    const label = /^(dark|light)\s+label (#[0-9A-Fa-f]{6}) on accent (#[0-9A-Fa-f]{6})/.exec(line);
    if (label) accent[label[1]] = { ink: label[2], accent: label[3] };
  }
  return { out, status, themes, accent };
}

/**
 * AC-1504, first half and the one the AC states: the script exits 0.
 *
 * It is its own test because the script's scope is the DESIGNER's to widen —
 * §16.4 extended it to sweep every cosmetic against every ground a player can
 * be looking at — and a combination it now refuses is a real defect in the
 * shipped appearance, not a disagreement between the two files. Keeping it
 * separate means the failure names itself instead of arriving inside a test
 * about hex codes.
 */
test('AC-1504 node docs/v2/theme-contrast.mjs exits 0', () => {
  const { out, status } = contrastReport();
  assert.equal(status, 0,
    `theme-contrast.mjs exited ${status}. Its last lines were:\n`
    + `${out.split('\n').filter((l) => /FAIL/.test(l)).join('\n')}`);
  assert.match(out, /^PASS/m, `the script did not report PASS:\n${out}`);
});

test('AC-1504 the palette the app ships is the palette the script checked', () => {
  const { themes, accent } = contrastReport();
  assert.deepEqual(Object.keys(themes).sort(), ['dark', 'light'],
    `the script printed ${Object.keys(themes).length} themes, not two`);

  for (const [name, printed] of Object.entries(themes)) {
    const shipped = THEME[name];
    assert.ok(shipped, `the script checks a theme the app does not have: ${name}`);
    assert.equal(printed.board, shipped.colors.board, `${name}: board ground`);
    assert.equal(printed.texture, shipped.texture.grain, `${name}: background texture`);

    assert.equal(Object.keys(printed.species).length, 5,
      `${name}: the script checked ${Object.keys(printed.species).length} species`);
    for (const [species, row] of Object.entries(printed.species)) {
      const style = shipped.species[species];
      assert.ok(style, `${name}: the script checks a species the app does not draw: ${species}`);
      // The FILL is printed, so it is compared directly.
      assert.equal(style.fill, row.fill, `${name}/${species}: fill`);
      // The EDGE is not printed — its ratio is, which is the better test: the
      // shipped edge has to reproduce the number the script passed on.
      assert.equal(
        Number(contrast(style.edge, shipped.colors.board).toFixed(2)), row.edgeRatio,
        `${name}/${species}: the shipped edge does not produce the script's edge:board ratio`,
      );
      assert.equal(
        Number(contrast(style.fill, shipped.colors.board).toFixed(2)), row.fillRatio,
        `${name}/${species}: fill:board ratio`,
      );
    }

    assert.equal(printed.monotonic, 'YES', `${name}: the script found the ramp non-monotonic`);
    assert.equal(
      Number(contrast(shipped.texture.grain, shipped.colors.board).toFixed(3)),
      printed.textureRatio,
      `${name}: the shipped grain does not produce the script's texture ratio`,
    );
  }

  // §16.2's accent, which the script now checks against seven grounds at once.
  // The light accent moved from `#B06B12` to `#975C0F` because the first could
  // not carry a 4.5:1 button label in any ink, so this pair is exactly the
  // kind of value that drifts between a doc and a build.
  assert.deepEqual(Object.keys(accent).sort(), ['dark', 'light'],
    'the script stopped reporting the accent pair it checks');
  for (const [name, pair] of Object.entries(accent)) {
    assert.equal(THEME[name].colors.accent, pair.accent, `${name}: accent`);
    assert.equal(THEME[name].colors.inkOnAccent, pair.ink, `${name}: the ink ON the accent`);
    assert.ok(contrast(pair.ink, pair.accent) >= 4.5, `${name}: the primary button's label`);
    // AC-1516: the label is the ground's OPPOSITE, which is AC-1512's rule
    // applied to the accent — dark ink on the dark theme's LIGHT gold, white
    // on the light theme's dark one. A near-black label on a light-theme
    // accent passes the ratio and is the hazard pairing, so the ratio alone
    // is not the check.
    assert.equal(lightness(pair.ink) > lightness(pair.accent), name === 'light',
      `${name}: the ink on the accent is on the accent's own side of the ramp`);
    // AC-1517: a label on a washed card is `ink`, not `accent`, wherever the
    // accent cannot carry 4.5:1 on its own wash.
    const colors = THEME[name].colors;
    const alpha = Number(/[\d.]+(?=\)$)/.exec(colors.accentWash)[0]);
    const wash = compose(colors.accent, alpha, colors.bg);
    assert.ok(contrast(colors.labelOnWash, wash) >= 4.5,
      `${name}: a label on the accent wash reads at `
      + `${contrast(colors.labelOnWash, wash).toFixed(2)}:1`);
  }
});

// ---- AC-1502 / AC-1503 · the ramp and the floor ---------------------------

test('AC-1502 fill lightness descends with size in BOTH themes, buffalo off the ramp', () => {
  for (const theme of Object.values(THEME)) {
    const steps = RAMP.map((s) => lightness(theme.species[s].fill));
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(steps[i] < steps[i - 1],
        `${theme.name}: ${RAMP[i]} (L* ${steps[i].toFixed(0)}) is not darker than `
        + `${RAMP[i - 1]} (L* ${steps[i - 1].toFixed(0)})`);
    }
    // AC-1502 names the temptation by name: inverting on light would keep the
    // monotonicity and throw the meaning away. So the DIRECTION is asserted
    // against the same species in the other theme, not merely the ordering.
    assert.ok(lightness(theme.species.rat.fill) > lightness(theme.species.elephant.fill),
      `${theme.name}: the ramp is inverted — the elephant is lighter than the rat`);
  }
  // ...and the light ramp is the better spaced of the two, which §16.1 records
  // as an accident worth keeping: gaps of 13/12/13 against 18/7/16.
  const gaps = (name) => {
    const steps = RAMP.map((s) => lightness(THEME[name].species[s].fill));
    return steps.slice(1).map((v, i) => Math.round(steps[i] - v));
  };
  assert.deepEqual(gaps('light'), [13, 12, 13]);
  assert.deepEqual(gaps('dark'), [18, 7, 16]);
});

test('AC-1503 every species clears 3:1 on fill OR edge, in both themes', () => {
  const weak = [];
  for (const theme of Object.values(THEME)) {
    for (const [species, style] of Object.entries(theme.species)) {
      const fill = contrast(style.fill, theme.colors.board);
      const edge = contrast(style.edge, theme.colors.board);
      if (Math.max(fill, edge) < SHAPE_FLOOR) {
        weak.push(`${theme.name}/${species}: fill ${fill.toFixed(2)} edge ${edge.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(weak, [], `below the ${SHAPE_FLOOR}:1 shape floor: ${weak.join(', ')}`);

  // The specific case the floor exists for, and the reason it is stated
  // against the BETTER of the two rather than against the fill: a rat on bone
  // is a pale amber block at 1.68:1 on its fill alone.
  const rat = THEME.light.species.rat;
  assert.ok(contrast(rat.fill, THEME.light.colors.board) < 2,
    'the light rat now clears the floor on its fill, so the edge is no longer load-bearing');
  assert.ok(contrast(rat.edge, THEME.light.colors.board) >= 4,
    'the light rat’s edge is what makes it visible, and it has been weakened');
});

test('AC-1505 the buffalo is the only rimmed piece in either theme', () => {
  for (const theme of Object.values(THEME)) {
    // "Rimmed" means the edge is off the species' own hue family — a gold rim
    // on an ox-blood body. The checkable form: every other species' edge is
    // DARKER than its fill, and the buffalo's is not.
    for (const species of RAMP) {
      const style = theme.species[species];
      assert.ok(lightness(style.edge) < lightness(style.fill),
        `${theme.name}/${species} has a rim, and only the buffalo may`);
    }
    const buffalo = theme.species.buffalo;
    assert.ok(lightness(buffalo.edge) > lightness(buffalo.fill),
      `${theme.name}: the buffalo lost its rim, which is the whole of "a different kind of object"`);
  }
  // AC-1505's repricing, with the numbers that forced it.
  assert.equal(THEME.light.species.buffalo.edge, '#9C6D14');
  assert.equal(THEME.dark.species.buffalo.edge, '#E8B44A');
  assert.ok(contrast('#E8B44A', THEME.light.colors.board) < 2,
    'the dark gold would have held up on bone after all');
  assert.ok(contrast('#9C6D14', THEME.light.colors.board) >= SHAPE_FLOOR);
  // The gold the rest of the app uses for "not like the others" is the same
  // ink, so the rim and the Last Stand pulse cannot drift apart.
  for (const theme of Object.values(THEME)) {
    assert.equal(theme.colors.lastStand, theme.species.buffalo.edge, `${theme.name}: two golds`);
  }
});

// ---- AC-1506 · the recess, confirmed rather than assumed ------------------

test('AC-1506 the origin recess is a hole on BOTH grounds, by construction', () => {
  // §5.5 specifies it as "the cell ground darkened 55%", which is an overlay
  // rather than a colour — so the check is the arithmetic of that overlay on
  // each theme's own cell, not a hex anybody typed.
  const darkened = (hex, alpha) => {
    const v = parseInt(hex.slice(1), 16);
    const mix = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
      .map((c) => Math.round(c * (1 - alpha)));
    return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };
  for (const theme of Object.values(THEME)) {
    const alpha = Number(/[\d.]+(?=\)$)/.exec(theme.recess.darken)[0]);
    assert.equal(alpha, 0.55, `${theme.name}: the recess is no longer §5.5's 55%`);
    for (const ground of [theme.colors.cell, theme.colors.dangerBand]) {
      const hole = darkened(ground, alpha);
      assert.ok(lightness(hole) < lightness(ground),
        `${theme.name}: the recess is not darker than ${ground}, so it is not a hole`);
    }
  }
  // Measured, and it is the light theme that gets the STRONGER recess: 4.30:1
  // against its own cell where slate manages 1.25:1. The worry §16 recorded
  // was the other way round, so this is worth pinning.
  const hole = (name) => contrast(darkened(THEME[name].colors.cell, 0.55), THEME[name].colors.cell);
  assert.equal(Number(hole('light').toFixed(2)), 4.3);
  assert.equal(Number(hole('dark').toFixed(2)), 1.25);
  assert.ok(hole('light') > hole('dark'));
});

// ---- AC-1512 · High Contrast takes the ground's opposite ------------------

test('AC-1512 High Contrast borders, seams and the numeral chip flip with the ground', () => {
  for (const theme of Object.values(THEME)) {
    // The HC edge is on the far side of the ground: white on slate, near-black
    // on bone. A 2.5 pt white border on bone is what AC-1512 exists to stop.
    assert.ok(contrast(theme.colors.hcEdge, theme.colors.board) > 5,
      `${theme.name}: the High Contrast border does not read on its own board`);
    assert.equal(
      lightness(theme.colors.hcEdge) > lightness(theme.colors.board),
      theme.name === 'dark',
      `${theme.name}: the High Contrast border went the same way as its ground`,
    );
    // The seam under High Contrast is the same flip on the same ground.
    const seam = theme.colors.hcSeam.match(/\d+/g).slice(0, 3).map(Number);
    assert.equal(
      seam[0] > 128,
      theme.name === 'dark',
      `${theme.name}: the High Contrast seam went the same way as its ground`,
    );
    // The numeral chip flips with it, and stays AC-905b's "same answer
    // whatever is underneath".
    assert.ok(contrast(theme.numeral.ink, theme.numeral.chip) >= 4.5, `${theme.name}: numeral`);
    assert.equal(
      lightness(theme.numeral.chip) > lightness(theme.numeral.ink),
      theme.name === 'light',
      `${theme.name}: the numeral chip did not flip`,
    );
    // AC-425's origin outline is the same rule on the same ground.
    assert.match(theme.recess.highContrastEdge, /^rgba\(/);
    const rgb = theme.recess.highContrastEdge.match(/\d+/g).slice(0, 3).map(Number);
    const outline = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    assert.equal(
      lightness(outline) > lightness(theme.colors.cell),
      theme.name === 'dark',
      `${theme.name}: the High Contrast origin outline is on the ground's own side`,
    );
  }
  assert.equal(THEME.light.colors.hcEdge, '#14201A');
  assert.equal(THEME.dark.colors.hcEdge, '#FFFFFF');
});

test('ui.md §5.4 the grabbed edge steps AWAY from the ground in both themes', () => {
  // Brightening is not the property; separating is. On bone a brighter edge is
  // an edge closer to the board, so the same 12% has the opposite sign.
  for (const theme of Object.values(THEME)) {
    for (const species of RAMP) {
      const edge = theme.species[species].edge;
      const lit = edgeLit(edge, theme, 0.12);
      assert.notEqual(lit, edge, `${theme.name}/${species}: the grab does nothing`);
      assert.ok(
        contrast(lit, theme.colors.board) > contrast(edge, theme.colors.board),
        `${theme.name}/${species}: the lit edge is closer to the board than the resting one`,
      );
    }
  }
  // The underlying helper is unchanged and still clamps rather than wraps.
  assert.equal(brighten('#ffffff', 0.12), '#ffffff');
  assert.equal(brighten('#646464', -0.12), '#585858');
});

// ---- AC-1507 / AC-1511 · the background, structurally ---------------------

test('AC-1507 the background cannot be behind an animal: nothing above it is translucent', () => {
  // The claim is about LAYERING, so this is the layering. One: the texture is
  // the bottom of the stack and the first child written.
  assert.ok(ORDER.texture < ORDER.cells, 'the texture is not painted before the cells');
  assert.ok(ORDER.texture < ORDER.animals, 'the texture is not painted before the animals');
  assert.ok(Z.texture <= Z.cells && Z.texture < Z.animal, 'the texture is not at the bottom');

  const board = code('src/ui/components/Board.js');
  const ground = board.indexOf('<NaturalGround');
  const cells = board.indexOf('<BoardCells');
  const animals = board.indexOf('animals.map(');
  assert.ok(ground !== -1, 'the board has no natural ground');
  assert.ok(ground < cells && cells < animals,
    'the natural ground is not written before the cells and the animals');

  // Two: the ONLY alpha between the texture and the player is on the cell.
  assert.ok(CELL_ALPHA > 0 && CELL_ALPHA < 1, 'an empty cell must be semi-transparent');
  const species = Object.values(THEME).flatMap((t) => Object.values(t.species));
  for (const style of species) {
    for (const [what, value] of Object.entries(style)) {
      assert.match(value, /^#[0-9A-Fa-f]{6}$/,
        `an animal's ${what} is ${value}, which is not a fully opaque colour`);
    }
  }
  // Three: the layer itself never claims a z, so nothing it draws can rise.
  const layer = code('src/ui/components/NaturalGround.js');
  assert.ok(!/zIndex/.test(layer), 'the natural ground takes a zIndex, so it can be lifted');
  assert.match(layer, /pointerEvents: 'none'/, 'the natural ground can take a touch');
});

test('AC-1507 the cell keeps its specified colour after being made translucent', () => {
  // The failure this exists to catch is §6.7's exactly: the texture arrives,
  // every colour in the design is still correct, and the board is a different
  // colour because the cells are now half a board showing through.
  //
  // The composite is done HERE with its own arithmetic rather than by calling
  // something `paintedCell` also calls — a check that runs the code it is
  // checking is the code agreeing with itself (§6.2).
  const grounds = [
    ...Object.values(THEME).map((t) => [t.name, t.colors.cell, t.colors.board]),
    // AC-1011's board theme repaints both, and gets its own answer with no
    // second table — which is the point of solving it rather than typing it.
    ['nightSavanna', '#1B1533', '#151026'],
  ];
  for (const [name, cell, board] of grounds) {
    const painted = paintedCell(cell, board, CELL_ALPHA);
    const seen = compose(painted, CELL_ALPHA, board);
    for (let i = 1; i < 7; i += 2) {
      const want = parseInt(cell.slice(i, i + 2), 16);
      const got = parseInt(seen.slice(i, i + 2), 16);
      assert.ok(Math.abs(want - got) <= 1,
        `${name}: a cell painted ${painted} reads as ${seen}, not ${cell}`);
    }
  }
  // And the rgba form the component actually writes carries that alpha.
  assert.equal(translucent('#D4CBBA', CELL_ALPHA), 'rgba(212,203,186,0.5)');
});

test('AC-1511 the texture stops where the danger band starts', () => {
  assert.equal(TEXTURE_ROWS, BOARD.dangerBandLow);
  for (let y = 0; y < BOARD.height; y += 1) {
    assert.equal(texturedRow(y), y < BOARD.dangerBandLow, `row ${y}`);
  }
  // Rows 11-14, the three-competing-layers band, render flat.
  for (const y of [11, 12, 13, 14]) assert.equal(texturedRow(y), false, `row ${y} is textured`);
  assert.equal(texturedRow(10), true, 'the top playable row lost its ground');

  // ...and the cell layer reads the same predicate rather than a second range,
  // so the two halves of AC-1511 cannot drift apart.
  const cells = code('src/ui/components/BoardCells.js');
  assert.match(cells, /const textured = texturedRow\(y\)/);
  assert.match(cells, /const danger = !textured && !kill/);
});

test('AC-1508 both texture inks clear the 1.25:1 ceiling, on both their grounds', () => {
  const measured = [];
  for (const theme of Object.values(THEME)) {
    for (const [surface, ink, ground] of [
      ['board grain', theme.texture.grain, theme.colors.board],
      ['board tracks', theme.texture.tracks, theme.colors.board],
      ['app grain', theme.texture.app.grain, theme.colors.bg],
      ['app tracks', theme.texture.app.tracks, theme.colors.bg],
    ]) {
      const ratio = contrast(ink, ground);
      measured.push(`${theme.name} ${surface} ${ratio.toFixed(3)}`);
      assert.ok(ratio <= TEXTURE_CEIL,
        `${theme.name} ${surface}: ${ratio.toFixed(3)}:1 is over the ${TEXTURE_CEIL} ceiling`);
      assert.ok(ratio > 1.02, `${theme.name} ${surface}: ${ratio.toFixed(3)}:1 is not there at all`);
    }
  }
  assert.equal(measured.length, 8, `only ${measured.length} inks were measured`);
  // The app pair exists because the board pair BREACHES the ceiling on the app
  // ground — the owner's decision put the texture on Home, and Home's ground
  // is not the board's. If that ever stops being true the second pair is dead
  // weight and should go.
  assert.ok(contrast(THEME.light.texture.grain, THEME.light.colors.bg) > TEXTURE_CEIL,
    'the board grain now clears the ceiling on the app ground, so the app pair is redundant');
});

test('AC-1510 the ground comes from the seed, and does not move', () => {
  const a = textureFor('seed-a', 351, 429);
  const again = textureFor('seed-a', 351, 429);
  const b = textureFor('seed-b', 351, 429);
  assert.deepEqual(a, again, 'the same seed drew a different ground');
  assert.notDeepEqual(a, b, 'two seeds drew the same ground');
  assert.ok(a.grain.length > 20, `only ${a.grain.length} flecks on a board-sized region`);
  assert.ok(a.tracks.length >= 1 && a.tracks.length <= 7, `${a.tracks.length} sets of tracks`);

  // Everything is inside the region it was given, so nothing can paint over
  // the danger band by starting at its edge and running on.
  for (const fleck of a.grain) {
    assert.ok(fleck.x >= 0 && fleck.x <= 351, `a fleck at x ${fleck.x}`);
    assert.ok(fleck.y >= 0 && fleck.y <= 429, `a fleck at y ${fleck.y}`);
  }
  // Density follows area rather than being a fixed count, so a small phone and
  // a large one get the same-looking ground rather than the same number of marks.
  assert.ok(textureFor('s', 351, 200).grain.length < textureFor('s', 351, 429).grain.length);
  // A degenerate region draws nothing rather than dividing by zero.
  assert.deepEqual(textureFor('s', 0, 0), { grain: [], tracks: [] });

  // The two assertions above are the OBSERVABLE half, and on their own they
  // are a check that can only pass: a generator seeded from the clock produces
  // the same ground twice inside one millisecond, and both of them did when
  // that fault was planted. So determinism is also asserted STRUCTURALLY, the
  // way the engine's is — the module cannot read a clock or a die, and it
  // cannot import anything that only exists on a device.
  const source = code('src/ui/texture.js');
  assert.ok(!/\bDate\.now\(|\bMath\.random\(|\bperformance\./.test(source),
    'src/ui/texture.js reads a clock or a die, so the ground is not the seed\'s');
  for (const from of source.matchAll(/from '([^']+)'/g)) {
    assert.ok(from[1].startsWith('.'),
      `src/ui/texture.js imports the package '${from[1]}', which takes AC-1510 off Node`);
  }

  // No motion, ever: the layer that draws the marks holds no state (the AC-828
  // exemption in test/hygiene.test.js is conditional on exactly that).
  const layer = code('src/ui/components/NaturalGround.js');
  assert.ok(!/useState|useSharedValue|useEffect|withTiming|withRepeat/.test(layer),
    'the natural background can now animate');
});

// ---- AC-1501 · the theme is a persisted preference ------------------------

test('AC-1501 the app opens bright, and the theme is a preference like any other', () => {
  assert.equal(DEFAULT_THEME, 'light');
  assert.equal(defaultSave().settings.theme, 'light',
    'a player who has never opened Settings does not get the bright theme');

  // It reaches the presentation layer through the one object that already
  // decides appearance, so there is no second source for "what colour is this".
  for (const name of Object.keys(THEME)) {
    const save = { ...defaultSave(), settings: { ...defaultSave().settings, theme: name } };
    const skin = cosmeticsFor(save);
    assert.equal(skin.theme, THEME[name], `${name}: the save's theme was not honoured`);
    assert.equal(skin.colors.board, THEME[name].colors.board);
    assert.equal(skin.species.rat.fill, THEME[name].species.rat.fill);
  }

  // The Settings sheet writes the STRING rather than a boolean, and the store
  // refuses a coerced one. `withSettings` used to be `Boolean(value)` for
  // everything, which was right while every preference was a switch: it would
  // have stored `true` for "light", written a save cleanly, and discarded it
  // on the next launch — the setting saved and the records gone.
  const sheet = code('src/ui/screens/SettingsSheet.js');
  assert.match(sheet, /settings\.set\('theme', on \? 'dark' : 'light'\)/);
  const base = defaultSave();
  assert.equal(withSettings(base, 'theme', 'dark').settings.theme, 'dark');
  for (const bad of [true, false, 'midnight', null, undefined]) {
    assert.equal(withSettings(base, 'theme', bad).settings.theme, DEFAULT_THEME,
      `withSettings accepted theme: ${JSON.stringify(bad)}`);
  }
  // ...and a key that is not a preference at all buys nothing.
  assert.equal(withSettings(base, '__proto__', true), base);
  assert.equal(withSettings(base, 'sound', false).settings.sound, false,
    'the ordinary boolean preferences still write');
});

test('AC-1503 every cosmetic on every ground a player can assemble clears 3:1', () => {
  // `docs/v2/theme-contrast.mjs` sweeps this product from the DESIGN's tables.
  // This sweeps the same product through `cosmeticsFor`, which is what the
  // board actually paints with — so a palette the script cleared and the app
  // never applied, or applied from the wrong ramp, fails here rather than on a
  // phone. §16.4's two rules are what make the product finite: a cosmetic that
  // supplies a ground names the ramp it pairs with, and a cosmetic that
  // supplies a colour supplies one value per ramp.
  const earned = defaultSave();
  earned.lifetime.buffaloRetired = 10;
  earned.lifetime.rows = 500;
  earned.lifetime.mostRowsInStep = 4;
  earned.best.tundra = { score: 25000, chain: 0, turns: 0, rows: 0 };

  const combinations = [];
  for (const theme of Object.keys(THEME)) {
    for (const board of [null, 'nightSavanna']) {
      for (const palette of [null, 'tundraPalette']) {
        for (const animals of [null, 'ratKing', 'goldenHerd']) {
          const applied = {};
          if (board) applied.theme = board;
          if (palette) applied.palette = palette;
          if (animals) applied.animals = animals;
          combinations.push({
            label: `${theme}/${board || '-'}/${palette || '-'}/${animals || '-'}`,
            save: { ...earned, settings: { ...earned.settings, theme },
              unlocks: { announced: [], applied } },
          });
        }
      }
    }
  }
  assert.equal(combinations.length, 24, `the sweep covers ${combinations.length} combinations`);

  const weak = [];
  for (const { label, save } of combinations) {
    const skin = cosmeticsFor(save);
    for (const [species, style] of Object.entries(skin.species)) {
      const best = Math.max(
        contrast(style.fill, skin.colors.board),
        contrast(style.edge, skin.colors.board),
      );
      if (best < SHAPE_FLOOR) weak.push(`${label} ${species} ${best.toFixed(2)}`);
    }
    // AC-908 survives every one of them: size is still readable off lightness,
    // so a palette may not flatten the ramp on the ground it is applied to.
    const steps = RAMP.map((species) => lightness(skin.species[species].fill));
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(steps[i] < steps[i - 1], `${label}: the ramp breaks at ${RAMP[i]}`);
    }
  }
  assert.deepEqual(weak, [], `under the ${SHAPE_FLOOR}:1 floor:\n  ${weak.join('\n  ')}`);

  // AC-1519's second sentence, which the sweep above cannot see: a palette
  // with no table for a ramp falls back to the base ramp and clears the floor
  // while silently not being the cosmetic the player earned. So the tables are
  // checked for completeness directly, in the source that holds them.
  const cosmetics = code('src/ui/cosmetics.js');
  const palettes = cosmetics.slice(cosmetics.indexOf('const PALETTES'),
    cosmetics.indexOf('const BOARD_THEMES'));
  const tables = [...palettes.matchAll(/^\s{4}(\w+): Object\.freeze/gm)].map((m) => m[1]);
  assert.ok(tables.length > 0, 'no palette tables were found to check');
  assert.deepEqual([...new Set(tables)].sort(), Object.keys(THEME).sort(),
    'a palette does not supply one table per ramp (AC-1519)');
  assert.equal(tables.length % Object.keys(THEME).length, 0,
    `${tables.length} tables across the palettes is not a whole number of ramps`);
});

test('AC-1011 a dark board theme brings the ramp that can be seen on it', () => {
  // Night Savanna is a dark ground by definition, and the light ramp on it
  // leaves the elephant at 1.79:1 on fill and 1.15:1 on edge — under the 3:1
  // floor on both, which is an elephant nobody can see. The board theme names
  // an existing ramp rather than carrying a palette of its own.
  const save = defaultSave();
  save.lifetime.buffaloRetired = 10;
  const worn = {
    ...save,
    settings: { ...save.settings, theme: 'light' },
    unlocks: { announced: [], applied: { theme: 'nightSavanna' } },
  };
  const skin = cosmeticsFor(worn);
  assert.equal(skin.colors.board, '#151026', 'the board theme did nothing');
  assert.equal(skin.theme.name, 'light', 'the board theme changed the app theme');
  for (const [species, style] of Object.entries(skin.species)) {
    const best = Math.max(
      contrast(style.fill, skin.colors.board),
      contrast(style.edge, skin.colors.board),
    );
    assert.ok(best >= SHAPE_FLOOR,
      `nightSavanna/${species} reads at ${best.toFixed(2)}:1 on its own board`);
  }
});
