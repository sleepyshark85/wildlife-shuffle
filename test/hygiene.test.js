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
/** Strip comments so a grep does not fire on a file explaining the rule. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

test('AC-828 no animation is driven from React state', () => {
  // Every transform reads a shared value through useAnimatedStyle.
  const animated = SRC.filter((f) => /useAnimatedStyle/.test(read(f)));
  assert.ok(animated.length >= 3, 'the animated surfaces are not where expected');
  for (const file of animated) {
    assert.match(read(file), /from 'react-native-reanimated'/);
  }
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

test('AC-126 no device dimension is hard-coded in the source', () => {
  // The ladder is dimension-driven; the Duo's real point size is unpublished
  // and the circulating estimates disagree. A constant here would be a defect.
  const devices = /\b(466|678|626|890|669|951|313|852|393|430|932|440|956|402|874)\b/;
  for (const file of SRC) {
    const body = code(file);
    assert.ok(!devices.test(body), `${path.relative(ROOT, file)} hard-codes a device dimension`);
  }
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
