// AC-13xx engineering hygiene, plus the source-tree half of AC-828/AC-830.
//
// These are greps, and they are here rather than in a checklist because v1
// shipped every one of these defects and nothing caught them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CUE_IDS } from '../src/ui/cues.js';
import { ORDER } from '../src/ui/stacking.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

const SRC = walk(path.join(ROOT, 'src'))
  .concat([path.join(ROOT, 'App.js'), path.join(ROOT, 'index.js')]);
const read = (f) => readFileSync(f, 'utf8');
/**
 * Strip comments so a grep does not fire on a file explaining the rule.
 *
 * Trailing comments count: `doThing(); // AC-414` used to survive the strip and
 * then read as a hard-coded 414 to the AC-126 audit. The `[^:]` guard keeps a
 * `https://` inside a string literal from being mistaken for a comment.
 */
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('AC-830 PanResponder is not imported anywhere', () => {
  for (const file of SRC) {
    assert.ok(!/PanResponder/.test(code(file)), `${path.relative(ROOT, file)} uses PanResponder`);
  }
});

test('AC-830 the drag is a Gesture.Pan from react-native-gesture-handler', () => {
  const joined = SRC.map(code).join('\n');
  assert.match(joined, /Gesture\.Pan\(\)/);
  assert.match(joined, /from 'react-native-gesture-handler'/);
});

test('AC-1301 no console call exists in any shipped source file', () => {
  for (const file of SRC) {
    assert.ok(!/\bconsole\s*\./.test(code(file)), `${path.relative(ROOT, file)} calls console`);
  }
});

test('AC-828/AC-211 the only timers in the app are the two the state layer owns', () => {
  const offenders = [];
  for (const file of SRC) {
    const body = code(file);
    const hits = (body.match(/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/g) || []).length;
    if (hits) offenders.push([path.relative(ROOT, file), hits]);
  }
  assert.deepEqual(offenders, [['src/ui/useGameRun.js', 2]],
    `timers found: ${JSON.stringify(offenders)}`);
  // ...and each one is cleared by its own effect's cleanup.
  const layer = read(path.join(ROOT, 'src/ui/useGameRun.js'));
  assert.equal((layer.match(/clearTimeout\(timer\)/g) || []).length, 2);
});

/**
 * Every `useAnimatedStyle(...)` call's source range, by brace/paren matching.
 * Anything inside one of these runs on the UI thread as a worklet.
 */
function animatedRanges(body) {
  const ranges = [];
  const needle = 'useAnimatedStyle(';
  for (let i = body.indexOf(needle); i !== -1; i = body.indexOf(needle, i + 1)) {
    let depth = 0;
    for (let j = i + needle.length - 1; j < body.length; j += 1) {
      if (body[j] === '(') depth += 1;
      else if (body[j] === ')') {
        depth -= 1;
        if (depth === 0) { ranges.push([i, j]); break; }
      }
    }
  }
  return ranges;
}

/** The value of every `transform:` key, with the offset it starts at. */
function transforms(body) {
  const found = [];
  const needle = 'transform:';
  for (let i = body.indexOf(needle); i !== -1; i = body.indexOf(needle, i + 1)) {
    const open = body.indexOf('[', i);
    if (open === -1) continue;
    let depth = 0;
    for (let j = open; j < body.length; j += 1) {
      if (body[j] === '[') depth += 1;
      else if (body[j] === ']') {
        depth -= 1;
        if (depth === 0) { found.push({ at: i, value: body.slice(open, j + 1) }); break; }
      }
    }
  }
  return found;
}

/**
 * AC-828, as a check that can actually fail.
 *
 * The previous version of this test filtered for files containing
 * `useAnimatedStyle` and then asserted those files import Reanimated — true by
 * construction for every file the filter could select, so only its count line
 * could ever fail. A check that cannot fail is not a check.
 *
 * This one states the property: a transform may read a variable ONLY inside a
 * `useAnimatedStyle` worklet. A transform outside one may contain literals and
 * nothing else. That is exactly the shape of the regression it has to catch —
 * `transform: [{ translateX: offset }]` where `offset` came from `useState` and
 * a timer moves it, which is how v1 animated.
 *
 * The test immediately below proves the audit fires, by planting exactly that
 * violation and asserting the audit reports it.
 */
function auditTransforms(body) {
  const ranges = animatedRanges(body);
  const inWorklet = (at) => ranges.some(([lo, hi]) => at > lo && at < hi);
  // A literal transform: only `key: 'string'` or `key: 123` entries.
  const literalOnly = /^\[\s*(\{\s*\w+\s*:\s*(?:'[^']*'|"[^"]*"|-?[\d.]+)\s*\}\s*,?\s*)+\]$/;
  const violations = [];
  for (const { at, value } of transforms(body)) {
    if (inWorklet(at)) continue;
    const flat = value.replace(/\s+/g, ' ').trim();
    if (!literalOnly.test(flat)) violations.push(flat);
  }
  return violations;
}

test('AC-828 a transform may read a variable only inside a worklet', () => {
  for (const file of SRC) {
    const violations = auditTransforms(code(file));
    assert.deepEqual(
      violations, [],
      `${path.relative(ROOT, file)} drives a transform from outside a useAnimatedStyle: ` +
        violations.join(' | '),
    );
  }
  // The property is only worth asserting if the app actually has animated
  // transforms to constrain. Four: the animal body, the ghost, and the sheet's
  // dim and rise.
  const worklets = SRC.reduce((n, f) => n + animatedRanges(code(f)).length, 0);
  assert.ok(worklets >= 4, `only ${worklets} useAnimatedStyle worklets found`);
});

test('AC-828 the audit fires on a planted violation', () => {
  // v1's shape: a transform driven by React state (docs/v1-review.md A1/A4).
  const planted = `
    function Bad() {
      const [offset, setOffset] = useState(0);
      useEffect(() => { setTimeout(() => setOffset(offset + 1), 16); });
      return <View style={{ transform: [{ translateX: offset }] }} />;
    }`;
  assert.deepEqual(auditTransforms(planted), ['[{ translateX: offset }]']);

  // ...and does NOT fire on the two shapes the app legitimately uses.
  const staticTransform = "const s = { transform: [{ rotate: '45deg' }] };";
  assert.deepEqual(auditTransforms(staticTransform), []);
  const worklet = `
    const s = useAnimatedStyle(() => ({
      transform: [{ translateX: tx.value }, { scale: 1 + 0.04 * grab.value }],
    }));`;
  assert.deepEqual(auditTransforms(worklet), []);
});

test('AC-829/AC-1304 babel.config.js lists the reanimated plugin LAST', () => {
  const babel = read(path.join(ROOT, 'babel.config.js'));
  const plugins = babel.match(/plugins:\s*\[([^\]]*)\]/);
  assert.ok(plugins, 'no plugins array in babel.config.js');
  const list = plugins[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  assert.equal(list[list.length - 1], 'react-native-reanimated/plugin');
});

test('AC-1302 every dependency in package.json is imported or is a live config plugin', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  // react-dom and react-native-web are the Expo web target's peers: Metro
  // resolves them for the platform, no source file imports them by name.
  // Dropping web support is the only way to drop them.
  const platformPeers = new Set(['react-dom', 'react-native-web']);
  // There are three ways a dependency can be USED, not one, and the rule is
  // widened rather than relaxed — each of these is still a use that something
  // checkable depends on:
  //
  //  1. imported by the source, which is the ordinary case;
  //  2. listed in `app.json`'s `plugins` — a config plugin is used by being
  //     named. Nothing in `src/` will ever `import 'expo-splash-screen'`, and
  //     the native splash (AC-1205) is built from that entry alone;
  //  3. named below, with the manifest key it turns on. `expo-system-ui` is
  //     autolinked and imported by nothing, and without it `expo prebuild`
  //     says so out loud — "ios.backgroundColor: Install expo-system-ui to
  //     enable this feature" — and drops the key on the floor. With it,
  //     `RCTRootViewBackgroundColor` comes out as 0xFF0D141B, which is
  //     AC-1205's "no white flash between splash and first frame".
  //
  // The third category is not an exception list: each entry names the key it
  // enables, and that key must be present. Remove `backgroundColor` from
  // app.json and the dependency becomes dead weight and this fails.
  const MANIFEST_ONLY = { 'expo-system-ui': 'backgroundColor' };
  const app = JSON.parse(read(path.join(ROOT, 'app.json'))).expo;
  const plugins = new Set(
    (app.plugins || []).map((entry) => (Array.isArray(entry) ? entry[0] : entry)),
  );
  const joined = SRC.map(read).join('\n');
  const unused = [];
  for (const dep of Object.keys(pkg.dependencies)) {
    if (platformPeers.has(dep) || plugins.has(dep)) continue;
    if (MANIFEST_ONLY[dep] && app[MANIFEST_ONLY[dep]] !== undefined) continue;
    const re = new RegExp(`from '${dep}(/[^']*)?'`);
    if (!re.test(joined)) unused.push(dep);
  }
  assert.deepEqual(unused, [], `unused dependencies: ${unused.join(', ')}`);

  // ...and a manifest-only dependency that is not installed is a manifest key
  // that silently does nothing, which is how this one was found.
  for (const [dep, key] of Object.entries(MANIFEST_ONLY)) {
    if (app[key] === undefined) continue;
    assert.ok(pkg.dependencies[dep], `app.json sets ${key} but ${dep} is not installed`);
  }

  // ...and the other direction, which is the half that lets a manifest point at
  // a package nobody installed: every plugin named in app.json is a dependency.
  const missing = [...plugins].filter((name) => !pkg.dependencies[name]);
  assert.deepEqual(missing, [], `config plugins with no dependency: ${missing.join(', ')}`);
});

test('AC-1303 every module under src/ is reachable from the entry point', () => {
  const byPath = new Map(SRC.map((f) => [path.resolve(f), f]));
  const seen = new Set();
  const queue = [path.resolve(ROOT, 'index.js')];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const body = read(file);
    for (const m of body.matchAll(/from '(\.[^']*)'/g)) {
      let target = path.resolve(path.dirname(file), m[1]);
      if (!byPath.has(target)) target = `${target}.js`;
      if (byPath.has(target)) queue.push(target);
    }
  }
  const orphans = SRC.filter((f) => !seen.has(path.resolve(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(orphans, [], `unreachable modules: ${orphans.join(', ')}`);
});

test('AC-1303 no module exports a symbol that nothing imports', () => {
  // The tester found four of these by hand — MIN_SCALE, TOUCH, statusCopy and
  // isDevelopment. Hand-finding is not a process, so here is the audit.
  const consumers = SRC.concat(walk(path.join(ROOT, 'test')));
  const everything = consumers.map(read).join('\n');
  const dead = [];
  for (const file of SRC) {
    const body = read(file);
    const names = new Set();
    for (const m of body.matchAll(/export\s+(?:const|function|let)\s+(\w+)/g)) names.add(m[1]);
    for (const m of body.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    for (const name of names) {
      const imported = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`);
      if (!imported.test(everything)) dead.push(`${path.relative(ROOT, file)}: ${name}`);
    }
  }
  assert.deepEqual(dead, [], `exported and imported nowhere:\n  ${dead.join('\n  ')}`);
});

/**
 * theme.js claims "every value here is read by something", because a normative
 * duration sitting unused means the spec's number and the shipped number are
 * free to disagree. That claim was a comment; this makes it a check.
 *
 * It replaces two tests that asserted `MOTION.flash === 320` and
 * `MOTION_SIZE.collapseScale === 0.85` — theme.js agreeing with itself, which
 * cannot fail on a behaviour regression and proves nothing about whether the
 * components consume the constants at all.
 */
test('AC-814 every normative motion number is read by something', () => {
  const theme = read(path.join(ROOT, 'src/ui/theme.js'));
  // SHIPPED code only. Counting the tests as consumers would let an assertion
  // about a constant keep that constant alive after the app stopped reading
  // it, which is the exact failure this audit exists to catch — verified by
  // hard-coding a drift value and watching this fire.
  const consumers = SRC.filter((f) => !f.endsWith('theme.js')).map(code).join('\n');

  const unused = [];
  for (const object of ['MOTION', 'MOTION_SIZE']) {
    const block = new RegExp(`export const ${object} = Object.freeze\\(\\{([\\s\\S]*?)\\n\\}\\)`);
    const body = theme.match(block);
    assert.ok(body, `${object} is not a frozen object literal any more`);
    for (const m of body[1].matchAll(/^\s{2}(\w+):/gm)) {
      const key = m[1];
      if (!new RegExp(`\\b${object}\\.${key}\\b`).test(consumers)) {
        unused.push(`${object}.${key}`);
      }
    }
  }
  assert.deepEqual(unused, [], `normative numbers nothing reads: ${unused.join(', ')}`);
});

/**
 * AC-910c. Slice 2 applied `allowFontScaling={false}` to all 32 `<Text>` in
 * the tree so the ladder's fixed chrome heights would hold; the designer has
 * since split the rule by surface (ui.md §10). Sheets and overlays are reading
 * surfaces and scale fully; the HUD scales within a fixed height by trading
 * labels for values; the board is spatial and never scales.
 *
 * So the flag belongs on HUD text and on board text, and nowhere else. Where a
 * fixed-height bar still has to bound its text it uses `maxFontSizeMultiplier`
 * — which is a cap, not an exemption: the text still grows, it just stops
 * before it clips, which is what AC-910 asks for.
 */
test('AC-910c allowFontScaling={false} appears only on HUD and board text', () => {
  const ALLOWED = new Set([
    'src/ui/components/Hud.js',          // the HUD itself
    'src/ui/components/AnimalView.js',   // board
    'src/ui/components/ClearLayer.js',   // board
    'src/ui/components/ArrivalFlight.js',// board
    'src/ui/components/Tray.js',         // the strip's animals are board
    'src/ui/components/Controls.js',     // the streak pill and buffalo chip
  ]);
  const offenders = [];
  for (const file of SRC) {
    if (!/allowFontScaling=\{false\}/.test(read(file))) continue;
    const rel = path.relative(ROOT, file);
    if (!ALLOWED.has(rel)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `text that refuses Dynamic Type: ${offenders.join(', ')}`);

  // The audit is only worth anything if the sheets really did lose it.
  for (const rel of [
    'src/ui/screens/Sheet.js',
    'src/ui/screens/GameOverSheet.js',
    'src/ui/screens/HomeScreen.js',
  ]) {
    assert.ok(
      !/allowFontScaling/.test(read(path.join(ROOT, rel))),
      `${rel} still pins its text size`,
    );
  }
});

/** The `{...}` block that starts at the first `{` at or after `from`. */
function blockAt(body, from) {
  const open = body.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) return { from: open, to: i + 1, text: body.slice(open, i + 1) };
    }
  }
  return null;
}

/**
 * The bug the owner found, as a standing check.
 *
 * An arriving animal that landed and then did not move produced an empty key
 * list, took the `if` arm of AnimalView's position effect, and never got its
 * opacity back — invisible for the rest of the run. Every test we had compared
 * POSITIONS, and the positions were right, so 194 unit tests, a 78-turn parity
 * run and a 296-drag measurement all passed over a board of correctly-placed
 * invisible animals.
 *
 * The invariant it broke: a shared value that expresses engine state — where
 * the animal is, how wide it is, whether it is on the board — is asserted on
 * every board change. Only a self-terminating ANNOUNCEMENT may live in one arm
 * of a branch, because if it never runs the value is already at rest.
 *
 * So: every value assigned inside that effect must be assigned at its top
 * level, or in both arms. The exemptions are listed by name with their reason,
 * which is the point — the next person adding one has to argue for it here.
 */
test('AC-808/AC-809 a resting property is asserted, not restored in one arm', () => {
  const file = path.join(ROOT, 'src/ui/components/AnimalView.js');
  const body = code(file);

  const effectStart = body.indexOf('useEffect(() => {', body.indexOf('homeX.value = x * cell') - 400);
  const effect = blockAt(body, effectStart);
  assert.ok(effect, 'could not find the position effect');
  assert.ok(effect.text.includes('tx.value'), 'found the wrong effect');

  const assigns = (text, name) => new RegExp(`\\b${name}\\.value\\s*=`).test(text);

  /**
   * The set of values this text assigns on EVERY path through it: top-level
   * statements, plus — for an `if`/`else` — only what both arms assign. A
   * one-armed `if` contributes nothing, because it might not run.
   */
  function alwaysAssigned(text, names) {
    let rest = '';
    const both = new Set();
    let i = 0;
    while (i < text.length) {
      const at = text.indexOf('if (', i);
      if (at === -1) { rest += text.slice(i); break; }
      rest += text.slice(i, at);
      const thenArm = blockAt(text, at);
      if (!thenArm) { rest += text.slice(at); break; }
      const after = text.slice(thenArm.to, thenArm.to + 12);
      if (/^\s*else\b/.test(after)) {
        const elseArm = blockAt(text, text.indexOf('else', thenArm.to));
        for (const n of names) {
          if (alwaysAssigned(thenArm.text, names).has(n)
            && alwaysAssigned(elseArm.text, names).has(n)) both.add(n);
        }
        i = elseArm.to;
      } else {
        i = thenArm.to;   // a one-armed if promises nothing
      }
    }
    const out = new Set(both);
    for (const n of names) if (assigns(rest, n)) out.add(n);
    return out;
  }

  const names = [...new Set(
    [...effect.text.matchAll(/\b(\w+)\.value\s*=/g)].map((m) => m[1]),
  )];
  assert.ok(names.includes('alpha'), 'the visibility value has been renamed');

  /**
   * Self-terminating ANNOUNCEMENTS. If they never run, the value is already at
   * rest, so a one-armed `if` is honest for them and only for them. Everything
   * else expresses engine state and must be asserted on every path — the rule
   * the owner's invisible-animals bug broke.
   */
  const ANNOUNCEMENTS = new Set(['squash']);

  const covered = alwaysAssigned(effect.text, names);
  const offenders = names.filter((n) => !ANNOUNCEMENTS.has(n) && !covered.has(n));
  assert.deepEqual(
    offenders.sort(), [],
    `assigned on only some paths through the position effect, so an animal ` +
      `that takes the other path never gets it: ${offenders.join(', ')}`,
  );
});

test('AC-126 no device dimension is hard-coded in the source', () => {
  // The ladder is dimension-driven; the Duo's real point size is unpublished
  // and the circulating estimates disagree. A constant here would be a defect.
  //
  // The list is every logical point dimension any iPhone has shipped at, in
  // either axis, plus the Duo estimates and the common Display Zoom sizes. The
  // first version of this test named only the large and foldable numbers, so a
  // hard-coded iPhone SE or mini dimension would have sailed through it.
  const WIDTHS = [320, 360, 375, 390, 393, 402, 414, 428, 430, 440, 466, 626, 669, 744];
  const HEIGHTS = [
    480, 504, 568, 667, 678, 693, 736, 780, 812, 844, 852, 874, 890, 896, 926, 932, 951, 956,
    1024, 1133,
  ];
  const devices = new RegExp(`\\b(${[...new Set([...WIDTHS, ...HEIGHTS])].join('|')})\\b`);
  for (const file of SRC) {
    const body = code(file);
    const hit = body.match(devices);
    assert.ok(
      !hit,
      `${path.relative(ROOT, file)} hard-codes the device dimension ${hit && hit[0]}`,
    );
  }
  // The audit is only meaningful if it would fire, so: prove it does.
  assert.match('const w = 393;', devices);
  assert.match('if (screenH === 852) {', devices);
  assert.equal(devices.test('const cell = Math.min(raw, 48);'), false);
});

test('AC-107 exactly one module computes a cell size', () => {
  const computing = SRC.filter((f) => /Math\.floor\(Math\.min\(/.test(code(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(computing, ['src/ui/layout.js']);
  // and every consumer receives it as a prop
  assert.match(read(path.join(ROOT, 'src/ui/screens/GameScreen.js')), /boardLayout\(/);
  assert.equal(
    SRC.filter((f) => /boardLayout\(/.test(code(f))).length,
    2, // layout.js defines it, GameScreen.js calls it. Nobody else.
  );
});

test('AC-215 no hook is called after a conditional return', () => {
  // The lint step enforces this properly (react-hooks/rules-of-hooks); this is
  // the cheap standing version, aimed at v1's exact shape (GamePreview.js:7-9).
  for (const file of SRC) {
    const lines = code(file).split('\n');
    let returned = -1;
    lines.forEach((line, i) => {
      if (/^\s{2}if\s*\(.*\)\s*return\b/.test(line)) returned = i;
      if (returned >= 0 && /^\s*const\s+\[?\w+.*=\s*use[A-Z]\w*\(/.test(line)) {
        assert.fail(`${path.relative(ROOT, file)}:${i + 1} calls a hook after a conditional return at :${returned + 1}`);
      }
    });
  }
});

/**
 * `src/ui/trajectory.js` is the one module `node --test` can sweep the
 * rendered motion with, and it can only do that because it imports nothing.
 *
 * Reanimated cannot be loaded in Node — its package `main` resolves to a file
 * that is not there — so a single import here would make the trajectory
 * untestable off a device again. That is not a hypothetical: the animals were
 * crossing each other on screen for a whole round with every test green,
 * precisely because nothing could evaluate the path they took.
 */
test('AC-808 the trajectory module stays loadable in Node', () => {
  const body = read(path.join(ROOT, 'src/ui/trajectory.js'));
  const imports = [...body.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0].trim());
  assert.deepEqual(imports, [], `trajectory.js must import nothing: ${imports.join(' | ')}`);

  // ...and it is the only definition of the path, so the UI thread and the
  // test cannot diverge. A second `rowAt` anywhere is the two-sources bug.
  const others = SRC.filter((f) => !f.endsWith('trajectory.js'))
    .filter((f) => /function\s+rowAt\b|function\s+bezierAt\b/.test(code(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(others, [], `a second copy of the trajectory: ${others.join(', ')}`);
});

/**
 * AC-11xx · sound and haptics, which is the same rule as the trajectory's.
 *
 * `expo-audio` and `expo-haptics` cannot load in Node, so every import of them
 * is a property that leaves `node --test`'s reach and becomes something only a
 * human with a phone can contradict (§6.7). The whole shape of this slice is an
 * attempt to keep that surface to one file, and these are the checks that stop
 * it growing back.
 */
test('AC-1101 the cue rules stay loadable in Node', () => {
  const body = read(path.join(ROOT, 'src/ui/cues.js'));
  const imports = [...body.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0].trim());
  assert.deepEqual(imports, [], `cues.js must import nothing: ${imports.join(' | ')}`);

  // `dueCount` and `chainRate` are worklets AND plain functions, for the reason
  // `rowAt` is: the UI thread and the test must evaluate the same rule.
  assert.match(body, /export function chainRate[\s\S]{0,60}'worklet'/);
  assert.match(body, /export function dueCount[\s\S]{0,80}'worklet'/);
});

test('AC-1103/AC-1105 the two native sound modules are reachable from one file', () => {
  const importers = SRC.filter((f) => /from 'expo-(audio|haptics)'/.test(code(f)))
    .map((f) => path.relative(ROOT, f))
    .sort();
  assert.deepEqual(importers, ['src/ui/cuePlayer.js']);

  // The session is configured once, from the specified value and not from a
  // literal written out beside it. A second call site is a second category,
  // and the one that ran last wins — which is how a player's music stops.
  const calls = SRC.map(code).join('\n').match(/setAudioModeAsync\s*\(/g) || [];
  assert.equal(calls.length, 1, `setAudioModeAsync is called from ${calls.length} places`);
  const player = code(path.join(ROOT, 'src/ui/cuePlayer.js'));
  assert.match(player, /setAudioMode:\s*\(mode\)\s*=>\s*setAudioModeAsync\(mode\)/);
  assert.match(
    read(path.join(ROOT, 'src/ui/cueEngine.js')),
    /adapter\.setAudioMode\(AUDIO_MODE\)/,
    'the engine no longer passes the specified audio mode',
  );

  // ...and the bundled cues are named in exactly one place too.
  const assets = SRC.filter((f) => /\.wav'/.test(code(f))).map((f) => path.relative(ROOT, f));
  assert.deepEqual(assets, ['src/ui/cuePlayer.js']);
});

/**
 * Every cue is actually WIRED to the moment it names.
 *
 * This is the hole the rest of the slice's tests leave open, and it is a big
 * one: `test/cues.test.js` can prove the plan schedules a clear cue and that
 * the engine plays what it is handed, and every one of those tests stays green
 * if nobody ever calls `useTurnCues` — or if the grab cue is deleted from the
 * gesture. Six of the eleven cues are not in the plan at all.
 *
 * So this is the connection check, and it is a grep because the connection is
 * a Reanimated worklet and a React hook, neither of which runs in Node.
 */
test('AC-1101 every cue is fired from the thing that knows the moment', () => {
  const byPath = new Map(SRC.map((f) => [path.relative(ROOT, f), f]));
  const elsewhere = SRC.filter((f) => path.relative(ROOT, f) !== 'src/ui/cues.js')
    .map(code)
    .join('\n');
  for (const id of CUE_IDS) {
    assert.match(
      elsewhere, new RegExp(`CUE\\.${id}\\b`),
      `the ${id} cue is defined and nothing ever fires it`,
    );
  }

  // The three that belong to the gesture, in the worklet that decides them:
  // grab on the lift (ui.md §5.4), drop and illegal on release. None of them
  // can be scheduled, because React never learns a drag began.
  const view = code(byPath.get('src/ui/components/AnimalView.js'));
  const begin = view.slice(view.indexOf('.onBegin('), view.indexOf('.onUpdate('));
  const finalize = view.slice(view.indexOf('.onFinalize('));
  assert.ok(begin.length > 0 && finalize.length > 0, 'the gesture no longer has these phases');
  assert.match(begin, /runOnJS\(fireCue\)\(CUE\.grab/);
  assert.match(finalize, /runOnJS\(fireCue\)\(CUE\.drop/);
  assert.match(finalize, /runOnJS\(fireCue\)\(CUE\.illegal/);
  // ...and a drag that lands where it started is a cancel, not a drop.
  const home = finalize.slice(finalize.indexOf('if (col === homeCol.value)'));
  assert.ok(home.length > 0, 'the zero-distance branch is gone');
  // `CUE.drop` and not `fireCue(CUE.drop`: the call site is
  // `runOnJS(fireCue)(CUE.drop, 1)`, so the tighter pattern matches nothing
  // anywhere and the check could only ever pass. (§6.2 — found by planting
  // exactly this fault and watching it escape.)
  assert.ok(
    !/CUE\.drop/.test(home.slice(0, home.indexOf('if (col >= sMin'))),
    'a drag that never moved plays the drop cue',
  );

  // The turn's schedule is actually played, and the one cue that is a fact
  // about the SAVE rather than about the turn is fired where that is decided.
  const screen = code(byPath.get('src/ui/screens/GameScreen.js'));
  assert.match(screen, /useTurnCues\(plan, clock\)/, 'the turn cue schedule is never played');
  assert.match(screen, /fireCue\(CUE\.newBest/);

  // The toggles reach the player at all. Without this line both switches move
  // and nothing happens, which is AC-1104 failing in the quietest possible way.
  const provider = code(byPath.get('src/ui/settings.js'));
  assert.match(provider, /startCues\(\)/, 'the audio session is never configured');
  assert.match(
    provider, /setCuePrefs\(\{[^}]*\bsound\b[^}]*\bhaptics\b[^}]*\}\)/,
    'the sound and haptics preferences never reach the player',
  );

  // Every haptic name the criteria use has a mapping onto UIKit's. A missing
  // one is a `notificationError` that silently does nothing on the one cue the
  // player is most entitled to feel.
  const player = code(byPath.get('src/ui/cuePlayer.js'));
  const map = player.slice(player.indexOf('const HAPTICS = {'));
  assert.ok(map.length > 0, 'the haptic mapping is gone');
  const mapped = map.slice(0, map.indexOf('};'));
  for (const id of ['selection', 'light', 'medium', 'heavy', 'success', 'error']) {
    assert.match(mapped, new RegExp(`\\b${id}:`), `no mapping for the ${id} haptic`);
  }

  // The scheduled half comes off the plan and nowhere else.
  const replay = code(byPath.get('src/ui/replay.js'));
  for (const id of ['clear', 'chain', 'land', 'shrink', 'retire', 'perfect', 'gameOver']) {
    assert.match(replay, new RegExp(`CUE\\.${id}\\b`), `${id} is not scheduled in the plan`);
  }
});

test('AC-1104 exactly one module decides whether a cue is silent', () => {
  // Two gates is §6.3's shape: they agree until they do not, and the one that
  // loses is a channel still making noise after the player switched it off.
  const deciders = SRC.filter((f) => /\bcueChannels\s*\(|\bcuePlan\s*\(/.test(code(f)))
    .map((f) => path.relative(ROOT, f))
    .sort();
  assert.deepEqual(deciders, ['src/ui/cueEngine.js', 'src/ui/cues.js']);

  // Nobody else reads the preference to decide for themselves. Two files may:
  // the provider that forwards it to the player, and the sheet that draws the
  // switch.
  const allowed = new Set(['src/ui/settings.js', 'src/ui/screens/SettingsSheet.js']);
  const readers = SRC.filter((f) => !allowed.has(path.relative(ROOT, f)))
    .filter((f) => /\.(sound|haptics)\b/.test(code(f)))
    .map((f) => path.relative(ROOT, f))
    .filter((rel) => rel !== 'src/ui/cues.js' && rel !== 'src/ui/cueEngine.js')
    .sort();
  assert.deepEqual(readers, [], `these decide for themselves: ${readers.join(', ')}`);
});

// ---- AC-10xx · persistence is a new failure surface ----------------------

/**
 * AC-1002, kept checkable as the app grows.
 *
 * "No storage write during a turn or from the render path" is not a property a
 * grep can read off an expression, so this constrains the thing that makes it
 * true instead: AsyncStorage is reachable from exactly one module, and that
 * module is reachable from exactly one more. v1's defect was the opposite
 * shape — the whole board serialised on a 1 Hz `setInterval` rebuilt by a
 * `[store]` dependency array on every render (`GameScreen.js:53-72` at v1
 * HEAD) — and it was possible because the screen could reach storage directly.
 */
test('AC-1002 AsyncStorage is reachable from exactly one module', () => {
  const importers = SRC.filter((f) => /@react-native-async-storage/.test(code(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(importers, ['src/ui/storage.js']);

  const consumers = SRC.filter((f) => /from '\.[^']*storage\.js'/.test(code(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(consumers, ['src/ui/progressStore.js']);
});

test('AC-1002 nothing on the turn path or in a component can write to disk', () => {
  // The engine, the state layer and every board component. A write from any of
  // them would be a write during a turn or from a render, by construction.
  const forbidden = SRC.filter((f) => {
    const rel = path.relative(ROOT, f);
    return rel.startsWith('src/engine/')
      || rel === 'src/ui/useGameRun.js'
      || rel === 'src/ui/replay.js'
      || rel === 'src/ui/trajectory.js'
      || (rel.startsWith('src/ui/components/') && rel !== 'src/ui/components/Controls.js');
  });
  assert.ok(forbidden.length > 10, 'the file selection stopped selecting anything');
  for (const file of forbidden) {
    const body = code(file);
    assert.ok(
      !/\b(writeText|removeText|readText|AsyncStorage|saveResume|finishRun)\b/.test(body),
      `${path.relative(ROOT, file)} touches storage`,
    );
  }
});

/**
 * AC-1013. The in-progress run is written on the AppState transition and
 * nowhere else, so there is exactly one call site and it is inside the
 * AppState hook's own callback.
 */
test('AC-1013 the resume is written from the AppState transition and nowhere else', () => {
  const appState = SRC.filter((f) => /\bAppState\b/.test(code(f))).map((f) => path.relative(ROOT, f));
  assert.deepEqual(appState, ['src/ui/useAppState.js']);

  const calls = SRC.map(code).join('\n').match(/\.saveResume\s*\(/g) || [];
  assert.equal(calls.length, 1, `saveResume is called from ${calls.length} places`);

  const screen = code(path.join(ROOT, 'src/ui/screens/GameScreen.js'));
  const at = screen.indexOf('useOnBackground(');
  assert.ok(at !== -1, 'GameScreen no longer registers an AppState handler');
  const handler = blockAt(screen, at);
  assert.ok(handler && /saveResume\(/.test(handler.text),
    'the resume write is not inside the AppState callback any more');

  // ...and the thing v1 did is absent: no interval anywhere, and the AppState
  // subscription has no dependency array that could rebuild it per render.
  const hook = code(path.join(ROOT, 'src/ui/useAppState.js'));
  assert.ok(!/setInterval/.test(hook));
  assert.match(hook, /addEventListener\('change'[\s\S]*?\}, \[\]\);/);
  assert.match(hook, /subscription\.remove/);
});

/**
 * AC-1011: an unlock "changes only appearance and has no effect on any rule,
 * spawn, or score". Structural, not promised — the engine has no import path
 * to the module that knows what an unlock is, and does not name one.
 */
test('AC-1011 the engine cannot see a cosmetic', () => {
  const engine = SRC.filter((f) => path.relative(ROOT, f).startsWith('src/engine/'));
  assert.ok(engine.length >= 8, 'the engine file list is empty');
  const ids = ['nightSavanna', 'tundraPalette', 'ratKing', 'goldenHerd'];
  for (const file of engine) {
    const body = code(file);
    assert.ok(!/from '\.\.\/ui\//.test(body), `${path.relative(ROOT, file)} imports from the UI`);
    for (const id of ids) {
      assert.ok(!body.includes(id), `${path.relative(ROOT, file)} names the unlock ${id}`);
    }
  }
  // The cosmetics module itself imports no state and no storage: it is a pure
  // function of the save, so nothing it returns can become a rule.
  const cosmetics = code(path.join(ROOT, 'src/ui/cosmetics.js'));
  const imports = [...cosmetics.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../engine/constants.js', './theme.js']);
});

/**
 * AC-1005/AC-1006 live in a module that must stay loadable by `node --test`,
 * for the same reason `trajectory.js` does: a corrupt save is only checkable
 * off-device if the parser can be handed a corrupt string in Node. A single
 * `react-native` import here would move AC-1005 out of reach and into the
 * hands of somebody with a phone and a file editor.
 */
test('AC-1005 the persistence rules stay loadable in Node', () => {
  for (const rel of ['src/ui/progress.js', 'src/ui/session.js', 'src/ui/cosmetics.js']) {
    const body = code(path.join(ROOT, rel));
    const imports = [...body.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const source of imports) {
      assert.ok(
        source.startsWith('.'),
        `${rel} imports the package '${source}', which takes AC-1005 off Node`,
      );
    }
    assert.ok(!/\bDate\.now\(|Math\.random\(/.test(body), `${rel} reads a clock or a die`);
  }
});


// ---- AC-14xx · Layer D ---------------------------------------------------

/**
 * §6.3, applied to the one predicate Layer D turned into a rule.
 *
 * "Is anything in the danger band" used to be a rendering question and lived in
 * `replay.js`. Last Stand made it a RULE as well, and the two readings must be
 * the same instant or the warning and the help stop being one event. Two
 * functions that agree are the bug shape rather than its absence, so there is
 * one, it is in the engine, and the UI imports it.
 */
test('AC-1408b the danger band has exactly one definition', () => {
  const owners = SRC.filter((f) => /function\s+inDangerBand\b/.test(code(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(owners, ['src/engine/abilities.js'],
    `a second copy of the danger-band predicate: ${owners.join(', ')}`);
  // ...and the UI really does read that one, rather than open-coding the rows.
  const board = code(path.join(ROOT, 'src/ui/components/Board.js'));
  assert.match(board, /inDangerBand\(animals\)/);
  assert.match(board, /from '\.\.\/\.\.\/engine\/abilities\.js'/);
});

/**
 * §6.7's second rule, applied to the abilities UI.
 *
 * The sheet's affordability, the four charge pips, the targeting copy and the
 * frozen tray are all claims about what is on screen, and all four have to be
 * checkable without a phone — `test/abilities-ui.test.js` evaluates every one
 * of them in Node. A single `react-native` or Reanimated import in
 * `src/ui/abilities.js` would move the whole set out of `node --test`'s reach
 * and into the hands of somebody with a device, which is exactly how the
 * invisible animals and the crossing animals both shipped.
 *
 * `src/ui/trajectory.js` is the precedent; this is the same rule for Layer D.
 */
test('AC-1415 the abilities UI rules stay loadable in Node', () => {
  const body = code(path.join(ROOT, 'src/ui/abilities.js'));
  const imports = [...body.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length > 0, 'the module stopped importing the engine');
  for (const source of imports) {
    assert.ok(
      source.startsWith('.'),
      `src/ui/abilities.js imports the package '${source}', which takes Layer D off Node`,
    );
  }
  assert.ok(!/\bDate\.now\(|Math\.random\(/.test(body), 'it reads a clock or a die');
});

/**
 * AC-1404, as a structural check rather than a promise.
 *
 * The switch has to be a parameter the measurement PASSES, not a default the
 * engine happens to hold: "the bot never presses the button" stopped being the
 * same claim as "abilities are not in the measurement" the moment Last Stand
 * existed, because Last Stand grants without being asked.
 */
test('AC-1404 the pacing harness disables abilities explicitly', () => {
  const bot = read(path.join(ROOT, 'tools/bot.mjs'));
  const at = bot.indexOf('export function measurePacing');
  assert.ok(at !== -1, 'measurePacing has moved');
  const body = bot.slice(at, bot.indexOf('\n}', at));
  assert.match(body, /createRun\(\{[^}]*abilities:\s*false/,
    'measurePacing creates runs without disabling abilities');
});

/**
 * AC-1403, as a grep over the engine rather than as a test of one path.
 *
 * "Spending costs no score" is a claim about every line that could write to
 * `score`, and there is exactly one: the fold of the event stream. A charge is
 * spent by writing `charges`, and nothing in the ability path may write to the
 * other field — a deduction anywhere would make the leaderboard reward never
 * using the mechanic.
 */
test('AC-1403 nothing in the engine ever lowers the score', () => {
  const engine = walk(path.join(ROOT, 'src/engine')).map(code).join('\n');
  const writes = [...engine.matchAll(/\bscore:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  const suspicious = writes.filter((w) => /-\s*\w/.test(w) && !/-\s*1\b/.test(w));
  assert.deepEqual(suspicious, [], `a score is written as a subtraction: ${suspicious.join(' | ')}`);
  // And the audit fires: this is the shape it exists to catch.
  const planted = 'return { ...state, score: state.score - COST, charges: state.charges - 1 };';
  const plantedWrites = [...planted.matchAll(/\bscore:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.equal(plantedWrites.filter((w) => /-\s*\w/.test(w)).length, 1);
});


// ---- the boundary the last three "right state, wrong appearance" bugs crossed

/**
 * §6.7, stated as a rule about SOURCE rather than about a rendered frame.
 *
 * All seven defects of the last round lived in the gap between a pure function
 * and the component that renders its value: `chargePips()` was asserted to
 * return 0.25 and the component multiplied it by 0.55; `frozenLabel()` was
 * asserted and nothing looked at the strip's style array; `isTarget()` was
 * asserted and nothing asked whether a target could be HIT.
 *
 * These four audits sit on the component side of that gap. None of them needs
 * a device, and each one fails on the exact fault it was written for.
 */

/** The board's stacking order may not be written down twice. */
test('AC-1414 the board components take their z-order from one table', () => {
  const owners = SRC.filter((f) => /\bconst Z = Object\.freeze/.test(code(f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(owners, ['src/ui/stacking.js'], `a second z-order table: ${owners.join(', ')}`);

  // No numeric zIndex anywhere in the board's own components. The scrim shipped
  // at a literal `zIndex: 2` over animals at a literal `zIndex: 1`, which is
  // two numbers in two files that nothing could compare.
  const board = ['src/ui/components/Board.js', 'src/ui/components/AnimalView.js',
    'src/ui/components/ClearLayer.js', 'src/ui/components/ArrivalFlight.js'];
  const literals = [];
  for (const rel of board) {
    for (const m of code(path.join(ROOT, rel)).matchAll(/zIndex:\s*([^,\n}]+)/g)) {
      if (!/\bZ\./.test(m[1])) literals.push(`${rel}: zIndex: ${m[1].trim()}`);
    }
  }
  assert.deepEqual(literals, [], `hard-coded z-order: ${literals.join(' | ')}`);
});

/**
 * The scrim's z is only half the story: two layers at the same z are separated
 * by document order, so the scrim must also be WRITTEN before the animals.
 */
test('AC-1414 the targeting scrim exists, and is painted before the animals', () => {
  const body = code(path.join(ROOT, 'src/ui/components/Board.js'));
  const scrim = body.indexOf('testID="target-scrim"');
  const animals = body.indexOf('animals.map(');
  assert.ok(scrim !== -1, 'the board has no cancel scrim, so a tap on empty board does nothing');
  assert.ok(animals !== -1, 'the board stopped rendering animals');
  assert.ok(scrim < animals,
    'the scrim is written after the animals, so it paints over them at equal z');
  // ...and the model's own order agrees with the file.
  assert.ok(ORDER.targetScrim < ORDER.animals);

  // The scrim is rendered on `arming` alone. Gating it on anything else would
  // leave a targeting state with no way to cancel by tapping the board, which
  // is half of AC-1414 and the half a keyboard user cannot work around.
  const gate = body.slice(Math.max(0, scrim - 120), scrim);
  assert.match(gate, /\{arming \? \(/,
    'the cancel scrim is gated on something other than `arming` being set');
});

/**
 * AC-1414's other half, and the one the stacking model cannot see.
 *
 * Once the animals correctly sit ABOVE the scrim, an animal that is not a valid
 * target must still take the tap and cancel — because in a real view tree it is
 * a hittable element whether or not anyone gave it a handler, so leaving it
 * without one does not let the tap "fall through" to the scrim. It swallows it,
 * and the player is stuck in a targeting state that no longer cancels.
 *
 * The model reports CANCEL either way, because a layer it is told is not
 * hittable simply is not a candidate. So this is a source check: EVERY animal
 * gets an overlay while targeting, and only the overlay's HANDLER varies.
 */
test('AC-1414 every animal takes the tap while targeting, valid or not', () => {
  const body = code(path.join(ROOT, 'src/ui/components/AnimalView.js'));
  const at = body.indexOf('target-');
  assert.ok(at !== -1, 'the targeting overlay has gone');

  // The overlay's own JSX gate, back to the `{`.
  const gateStart = body.lastIndexOf('{', body.lastIndexOf('<Pressable', at));
  const gate = body.slice(gateStart, body.indexOf('<Pressable', gateStart));
  assert.match(gate, /\{targeting \? \(/,
    `the overlay is gated on more than "is a targeting state open": ${gate.trim().slice(0, 80)}`);
  assert.ok(!/targeting\.valid\s*\?[\s\S]{0,40}<Pressable/.test(body),
    'an invalid target gets no overlay, so it swallows the tap and cancel stops working');

  // And the handler is what varies — cancel for an invalid one, never nothing.
  const overlay = body.slice(body.indexOf('<Pressable', gateStart),
    body.indexOf('/>', body.indexOf('<Pressable', gateStart)));
  assert.match(overlay, /onPress=\{targeting\.valid \? [\s\S]*? : onCancelTarget\}/,
    'an invalid target does not cancel on tap');
  assert.ok(!/disabled=\{!targeting\.valid\}/.test(overlay),
    'the invalid overlay is disabled, which makes it swallow the tap again');
});

/**
 * One `opacity` per style array.
 *
 * `Tray.js` shipped `[styles.strip, {...}, styles.frozenStrip, revealStyle]`
 * where the third entry set `opacity: 0.45` and the fourth set an animated
 * `opacity` — so the frozen grey-out was silently overwritten and the strip
 * rendered at full opacity under a label reading `FROZEN · 2`. Nothing could
 * see it, because both values were individually correct.
 */
function styleArrayEntries(text) {
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      entries.push(text.slice(start, i));
      start = i + 1;
    }
  }
  entries.push(text.slice(start));
  return entries.map((e) => e.trim()).filter(Boolean);
}

function opacitySources(body) {
  // Style names declared in this file's StyleSheet that set an opacity.
  const staticNames = new Set();
  for (const m of body.matchAll(/(\w+):\s*\{[^{}]*\bopacity:\s*[^,}]+/g)) staticNames.add(m[1]);
  // Animated style variables whose worklet sets an opacity.
  const animatedNames = new Set();
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*useAnimatedStyle\(([\s\S]*?)\}\)\);/g)) {
    if (/\bopacity:/.test(m[2])) animatedNames.add(m[1]);
  }

  /**
   * Split into TOP-LEVEL entries first. Counting name occurrences across the
   * whole array instead reported `[styles.inert, { backgroundColor: style.fill
   * }, bodyStyle]` as two, because a species palette called `style` collided
   * with an animated style called `style` in another component. An entry is
   * what the array actually composes, so an entry is what gets counted.
   */
  const contributes = (entry) => {
    const bare = entry.replace(/^[^?]*\?\s*/, '').replace(/^\w+\s*&&\s*/, '');
    if (animatedNames.has(bare)) return true;
    // An inline `opacity:` anywhere inside a conditional entry counts too:
    // `frozen ? { opacity: 0.45 } : null` is the same fault wearing a ternary.
    if (/\bopacity:/.test(entry)) return true;
    for (const name of animatedNames) {
      if (new RegExp(`(^|[?:&|(\\s])${name}(\\s|$|[:,)])`).test(entry)) return true;
    }
    for (const name of staticNames) {
      if (new RegExp(`styles\\.${name}\\b`).test(entry)) return true;
    }
    return /^\{[\s\S]*\bopacity:/.test(entry.replace(/\s+/g, ' '))
      || /(^|[{,]\s*)opacity:/.test(entry);
  };

  const offenders = [];
  for (const m of body.matchAll(/style=\{\[([\s\S]*?)\]\}/g)) {
    const sources = styleArrayEntries(m[1]).filter(contributes);
    if (sources.length > 1) {
      offenders.push(sources.join(' + ').replace(/\s+/g, ' ').slice(0, 90));
    }
  }
  return offenders;
}

test('AC-1410b a style array may set opacity from only one source', () => {
  for (const file of SRC) {
    const offenders = opacitySources(code(file));
    assert.deepEqual(
      offenders, [],
      `${path.relative(ROOT, file)} composes two opacities in one style array, and the later `
        + `one silently wins: ${offenders.join(' | ')}`,
    );
  }
});

test('AC-1410b the opacity audit fires on the shape that shipped', () => {
  // Tray.js, verbatim as it was.
  const planted = `
    const styles = StyleSheet.create({ frozenStrip: { opacity: 0.45 }, strip: { borderWidth: 1 } });
    const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
    const x = <View style={[styles.strip, styles.frozenStrip, revealStyle]} />;`;
  assert.equal(opacitySources(planted).length, 1, 'the audit missed the shipped fault');

  // ...and does not fire on the composed form that replaced it.
  const fixed = `
    const styles = StyleSheet.create({ strip: { borderWidth: 1 } });
    const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value * stripAlpha }));
    const x = <View style={[styles.strip, revealStyle]} />;`;
  assert.deepEqual(opacitySources(fixed), []);
});

/**
 * A component may not do arithmetic on a value a pure function already
 * composed. Both of these were real: the pip multiplied `restAlpha` by 0.55,
 * and nothing stopped it.
 */
test('AC-1415 the components render the composed value, never a factor of it', () => {
  const pips = code(path.join(ROOT, 'src/ui/components/AbilityButton.js'));
  assert.match(pips, /pipAlpha\(/, 'the pip stopped reading the composed opacity');
  assert.ok(!/restAlpha/.test(pips),
    'AbilityButton reaches past pipAlpha() into restAlpha, which is how 25% became 13.75%');

  const tray = code(path.join(ROOT, 'src/ui/components/Tray.js'));
  assert.match(tray, /trayStripOpacity\(/, 'the tray stopped reading the composed opacity');
  assert.ok(!/opacity:\s*0\.45/.test(tray), 'the frozen opacity is hard-coded in the component');
});


/**
 * §6.2, applied to the defect that was reported.
 *
 * The tray said `1 cells`, and the FIRST question was whether it was the only
 * one. It was not: the same shape was in the abilities button's VoiceOver
 * label (`1 charges`), on the Records screen (`1 turns`) and — found by this
 * audit rather than by reading — in the tray's own VISIBLE counter, which
 * showed a sighted player `1 CELLS` beside the silhouette.
 *
 * So the answer is an audit rather than four edits: a count may not be pasted
 * next to a noun that has to agree with it. `plural()` returns the whole
 * phrase, so a call to it leaves nothing for this to match.
 */
test('AC-902 no shipped string pastes a count next to a noun that must agree', () => {
  // An interpolation, optionally one word, then a count noun that ENDS the
  // phrase. The trailing guard is what keeps `on turn ${n}` — an ordinal, not
  // a count — out of it (src/ui/screens/HomeScreen.js).
  const bare = /\$\{[^}]*\}\s+(?:\w+\s+)?(cells?|charges?|turns?|moves?)\b(?!\s*(?:\$\{|\d))/i;
  const offenders = [];
  for (const file of SRC) {
    const hit = code(file).match(bare);
    if (hit) offenders.push(`${path.relative(ROOT, file)}: ${hit[0]}`);
  }
  assert.deepEqual(offenders, [], `a count that will read "1 cells":\n  ${offenders.join('\n  ')}`);

  // The audit is only meaningful if it would fire, so: prove it does, on each
  // of the four real shapes, and prove it does not on the fixed form.
  assert.match('`${cells} cells.`', bare);
  assert.match('`${cells} CELLS`', bare);
  assert.match('`Abilities, ${button.charges} charges`', bare);
  assert.match('`${run.turns} turns`', bare);
  assert.match('`Nothing arrives for ${frozen} more turns.`', bare);
  assert.equal(bare.test("`${plural(cells, 'cell')}.`"), false);
  assert.equal(bare.test('`on turn ${resume.turn} —`'), false);

  // ...and the components really do route through it, rather than agreeing
  // with a helper they do not call (§6.7: the pip asserted 25% and drew 13.75%).
  for (const [rel, pattern] of [
    ['src/ui/components/Tray.js', /plural\(cells, 'CELL', 'CELLS'\)/],
    ['src/ui/components/Tray.js', /trayLabel\(queue, cells, frozen\)/],
    ['src/ui/components/AbilityButton.js', /plural\(button\.charges, 'charge'\)/],
    ['src/ui/screens/RecordsScreen.js', /plural\(run\.turns, 'turn'\)/],
  ]) {
    assert.match(code(path.join(ROOT, rel)), pattern, `${rel} stopped reading plural()`);
  }
});

/**
 * §6.7's second rule, applied to AC-902.
 *
 * The label was built inside `Tray.js`, which imports Reanimated, so the one
 * string a VoiceOver user has instead of the strip could not be read by
 * `node --test` at all. It now lives in `src/ui/format.js`, and that module
 * stays importless so it keeps being checkable.
 */
test('AC-902 the labels stay loadable in Node', () => {
  const body = code(path.join(ROOT, 'src/ui/format.js'));
  const imports = [...body.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0].trim());
  assert.deepEqual(imports, [], `format.js must import nothing: ${imports.join(' | ')}`);
  assert.match(body, /export function trayLabel\(/, 'AC-902s label left the checkable module');
});
