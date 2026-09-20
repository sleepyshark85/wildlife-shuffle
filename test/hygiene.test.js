// AC-13xx engineering hygiene, plus the source-tree half of AC-828/AC-830.
//
// These are greps, and they are here rather than in a checklist because v1
// shipped every one of these defects and nothing caught them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('AC-1302 every dependency in package.json is imported by the source', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  // react-dom and react-native-web are the Expo web target's peers: Metro
  // resolves them for the platform, no source file imports them by name.
  // Dropping web support is the only way to drop them.
  const platformPeers = new Set(['react-dom', 'react-native-web']);
  const joined = SRC.map(read).join('\n');
  const unused = [];
  for (const dep of Object.keys(pkg.dependencies)) {
    if (platformPeers.has(dep)) continue;
    const re = new RegExp(`from '${dep}(/[^']*)?'`);
    if (!re.test(joined)) unused.push(dep);
  }
  assert.deepEqual(unused, [], `unused dependencies: ${unused.join(', ')}`);
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
