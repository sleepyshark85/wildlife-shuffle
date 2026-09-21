// AC-12xx · App Store readiness, the half of it a machine can settle.
//
// v1 shipped a manifest pointing at `./assets/favicon.png` with no `assets/`
// directory anywhere in the repository (docs/v1-review.md E). That is not a bug
// that gets fixed, it is a bug that gets made impossible: the file below walks
// `app.json` for EVERY path it names and asserts each one resolves, so any
// future reference to a file that does not exist fails the suite rather than
// the submission.
//
// The dimensions are not written down here either. They are read out of
// `ui.md` §11.1's own table, so a design that changes the splash size and a
// generator that does not are a failing test instead of a surprise on the
// shelf.
//
// What this file cannot check is whether the icon is any good. Nothing can.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COLORS } from '../src/ui/theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(f, 'utf8');
const APP = JSON.parse(read(path.join(ROOT, 'app.json'))).expo;

// ---- reading a PNG without a decoder -------------------------------------

/**
 * IHDR plus the chunk list. Enough to answer "what size, and is there alpha",
 * which is the whole of AC-1202 and half of AC-1201.
 *
 * PNG colour types: 0 grey, 2 truecolour, 3 palette, 4 grey+alpha, 6 RGBA. An
 * alpha CHANNEL is bit 2 of the type; a palette image can still carry
 * transparency through a `tRNS` chunk, which is why both are checked.
 */
function readPng(file) {
  const buf = readFileSync(file);
  assert.deepEqual(
    [...buf.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    `${path.basename(file)} is not a PNG`,
  );
  const chunks = [];
  for (let at = 8; at + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(at);
    chunks.push({ type: buf.toString('latin1', at + 4, at + 8), at: at + 8, len });
    at += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  assert.ok(ihdr, `${path.basename(file)} has no IHDR`);
  return {
    width: buf.readUInt32BE(ihdr.at),
    height: buf.readUInt32BE(ihdr.at + 4),
    bitDepth: buf[ihdr.at + 8],
    colourType: buf[ihdr.at + 9],
    interlace: buf[ihdr.at + 12],
    types: chunks.map((c) => c.type),
    buf,
  };
}

/** One pixel of a filter-0, non-interlaced truecolour PNG. */
function pixelAt(png, x, y) {
  assert.equal(png.colourType, 2, 'pixelAt only reads truecolour');
  assert.equal(png.interlace, 0, 'pixelAt only reads non-interlaced');
  const idat = [];
  for (let at = 8; at + 8 <= png.buf.length; ) {
    const len = png.buf.readUInt32BE(at);
    if (png.buf.toString('latin1', at + 4, at + 8) === 'IDAT') {
      idat.push(png.buf.subarray(at + 8, at + 8 + len));
    }
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = png.width * 3;
  const row = y * (stride + 1);
  assert.equal(raw[row], 0, 'this reader only handles filter type 0');
  const i = row + 1 + x * 3;
  return `#${raw.subarray(i, i + 3).toString('hex').toUpperCase()}`;
}

// ---- AC-1201: the four files, at the sizes the design states --------------

/**
 * `ui.md` §11.1's table, parsed.
 *
 * Restating "1024 x 1024" in this file would make the test and the design two
 * sources for one number, which is the shape §6.3 of the process doc exists
 * about. Here the design is the source and the test is a reader, so a design
 * change that the assets do not follow fails rather than diverges.
 */
function specTable() {
  const doc = read(path.join(ROOT, 'docs/v2/ui.md'));
  const section = doc.slice(doc.indexOf('### 11.1'), doc.indexOf('### 11.2'));
  const rows = [];
  for (const line of section.split('\n')) {
    const m = /^\|\s*`([\w-]+\.png)`\s*\|\s*(\d+)\s*×\s*(\d+)\s*\|/.exec(line);
    if (m) rows.push({ file: m[1], width: Number(m[2]), height: Number(m[3]) });
  }
  return rows;
}

test('AC-1201 ui.md §11.1 still names four assets — the table this file reads', () => {
  // The parser above returns [] for a table it cannot read, and every
  // assertion built on [] passes vacuously. This is the guard: a silent
  // reformatting of §11.1 must break the suite loudly rather than quietly
  // switch off everything below (§6.2).
  const rows = specTable();
  assert.equal(rows.length, 4, `parsed ${rows.length} rows from ui.md §11.1, expected 4`);
  assert.deepEqual(
    rows.map((r) => r.file).sort(),
    ['adaptive-icon.png', 'favicon.png', 'icon.png', 'splash.png'],
  );
});

test('AC-1201 assets/ exists and holds every file at the size ui.md §11.1 states', () => {
  const dir = path.join(ROOT, 'assets');
  assert.ok(existsSync(dir) && statSync(dir).isDirectory(), 'assets/ does not exist');
  for (const row of specTable()) {
    const file = path.join(dir, row.file);
    assert.ok(existsSync(file), `assets/${row.file} is missing`);
    const png = readPng(file);
    assert.deepEqual(
      { width: png.width, height: png.height },
      { width: row.width, height: row.height },
      `assets/${row.file} is ${png.width} x ${png.height}, ui.md §11.1 says ${row.width} x ${row.height}`,
    );
  }
});

// ---- AC-1202: no alpha, square corners ------------------------------------

test('AC-1202 icon.png has no alpha channel and no transparency chunk', () => {
  const png = readPng(path.join(ROOT, 'assets/icon.png'));
  // Bit 2 of the colour type is the alpha channel: types 4 and 6 carry one.
  assert.equal(png.colourType & 4, 0, `icon.png colour type ${png.colourType} carries alpha`);
  // ...and a palette or greyscale image can carry transparency in `tRNS`.
  assert.ok(!png.types.includes('tRNS'), 'icon.png has a tRNS transparency chunk');
  assert.equal(png.bitDepth, 8, `icon.png bit depth is ${png.bitDepth}`);
});

test('AC-1202 icon.png has square corners: all four are the ground colour', () => {
  const png = readPng(path.join(ROOT, 'assets/icon.png'));
  const corners = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ].map(([x, y]) => pixelAt(png, x, y));
  // ui.md §11.1: ground `#16212C`, which is COLORS.board. A rounded icon is
  // made by punching the corners out, and whatever is punched in — white,
  // black, or a composited edge — is not this.
  assert.deepEqual(corners, new Array(4).fill(COLORS.board.toUpperCase()));
});

test('AC-1202 every shipped PNG is opaque, not only the icon', () => {
  for (const row of specTable()) {
    const png = readPng(path.join(ROOT, 'assets', row.file));
    assert.equal(png.colourType & 4, 0, `${row.file} carries an alpha channel`);
    assert.ok(!png.types.includes('tRNS'), `${row.file} has a tRNS chunk`);
  }
});

// ---- AC-1203: every path app.json names resolves ---------------------------

/** Every string anywhere in `app.json` that looks like a repository path. */
function referencedPaths(node, at = 'expo', out = []) {
  if (typeof node === 'string') {
    if (node.startsWith('./') || node.startsWith('../')) out.push({ at, value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => referencedPaths(v, `${at}[${i}]`, out));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) referencedPaths(v, `${at}.${k}`, out);
  }
  return out;
}

test('AC-1203 every asset path app.json references resolves to a file that exists', () => {
  const refs = referencedPaths(APP);
  // v1's manifest named exactly one asset and it did not exist. A version of
  // this test that only walked what was there would have passed on a manifest
  // naming nothing at all, so the count is asserted first.
  assert.ok(refs.length >= 4, `app.json names only ${refs.length} paths`);
  const missing = refs.filter((r) => !existsSync(path.join(ROOT, r.value)));
  assert.deepEqual(
    missing.map((r) => `${r.at} -> ${r.value}`),
    [],
    'app.json references files that do not exist',
  );
});

test('AC-1203 the manifest actually names all four assets', () => {
  const named = new Set(referencedPaths(APP).map((r) => path.basename(r.value)));
  for (const row of specTable()) {
    assert.ok(named.has(row.file), `app.json never references ${row.file}`);
  }
});

test('AC-1201 nothing in assets/ is unreferenced dead weight', () => {
  // The sounds are loaded by `require()` from the cue player rather than from
  // the manifest, so they are matched against the source instead.
  const src = readdirSync(path.join(ROOT, 'src/ui'))
    .map((f) => path.join(ROOT, 'src/ui', f))
    .filter((f) => f.endsWith('.js'))
    .map(read)
    .join('\n');
  const named = new Set(referencedPaths(APP).map((r) => path.basename(r.value)));
  const orphans = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (!named.has(entry) && !src.includes(entry)) {
        orphans.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, 'assets'));
  assert.deepEqual(orphans, [], `assets nothing references: ${orphans.join(', ')}`);
});

// ---- AC-1204 / AC-1205 / AC-1211: the manifest ----------------------------

test('AC-1204 ios.supportsTablet is present and supportsTabletMode is absent', () => {
  assert.equal(typeof APP.ios.supportsTablet, 'boolean');
  // `supportsTabletMode` was never an Expo key. It is checked across the whole
  // manifest rather than just `ios`, because the way it came back last time was
  // somebody putting it somewhere else.
  assert.ok(
    !read(path.join(ROOT, 'app.json')).includes('supportsTabletMode'),
    'app.json still mentions supportsTabletMode',
  );
});

test('AC-1205 the splash is configured, and on the background the design names', () => {
  const entry = (APP.plugins || []).find(
    (p) => (Array.isArray(p) ? p[0] : p) === 'expo-splash-screen',
  );
  assert.ok(Array.isArray(entry), 'expo-splash-screen is listed with no options');
  const opts = entry[1];
  assert.equal(opts.image, './assets/splash.png');
  assert.equal(opts.resizeMode, 'contain');
  assert.equal(opts.backgroundColor, COLORS.bg);
});

test('AC-1205 no white flash: the splash ground and the app ground are one colour', () => {
  // The seam between the splash and the first React frame is only invisible if
  // the two are the same colour. Three places have to agree and all three are
  // derived from `COLORS.bg` rather than typed: the splash plugin, the
  // manifest's own backgroundColor, and the screen's root style.
  const entry = (APP.plugins || []).find(
    (p) => (Array.isArray(p) ? p[0] : p) === 'expo-splash-screen',
  );
  assert.equal(APP.backgroundColor, COLORS.bg);
  assert.equal(entry[1].backgroundColor, COLORS.bg);
  assert.match(read(path.join(ROOT, 'App.js')), /backgroundColor: COLORS\.bg/);
  // ...and the splash image's own top-left pixel is that colour too, so a
  // regenerated image on a different ground shows up here rather than on a
  // phone.
  const png = readPng(path.join(ROOT, 'assets/splash.png'));
  assert.equal(pixelAt(png, 0, 0), COLORS.bg.toUpperCase());
});

test('AC-1211 userInterfaceStyle is dark and nothing overrides it per platform', () => {
  assert.equal(APP.userInterfaceStyle, 'dark');
  for (const platform of ['ios', 'android']) {
    const scheme = (APP[platform] || {}).userInterfaceStyle;
    assert.ok(
      scheme === undefined || scheme === 'dark',
      `${platform}.userInterfaceStyle is ${scheme}`,
    );
  }
});

/** Every shipped `.js`, comments stripped — the same shape as hygiene.test.js. */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.js')) out.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  out.push(path.join(ROOT, 'App.js'), path.join(ROOT, 'index.js'));
  return out.map((f) => ({
    file: path.relative(ROOT, f),
    body: read(f)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1'),
  }));
}

test('AC-1211 the app renders dark regardless of the OS appearance setting', () => {
  // The manifest asks iOS for a dark app; this is why the ANSWER cannot matter.
  // Nothing in the source reads the system scheme, so there is no code path on
  // which a light system produces a light render — it is not a value the app
  // has, rather than a value the app ignores.
  const readers = /useColorScheme|Appearance\.|prefers-color-scheme|colorScheme/;
  for (const { file, body } of sources()) {
    assert.ok(!readers.test(body), `${file} reads the OS appearance`);
  }
});

// ---- AC-1209: zero network requests ---------------------------------------

test('AC-1209 no network primitive appears anywhere in shipped source', () => {
  const primitives = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\bWebSocket\b/,
    /EventSource/,
    /sendBeacon/,
    /navigator\.connection/,
    /\bhttps?:\/\//,
  ];
  const offenders = [];
  for (const { file, body } of sources()) {
    for (const re of primitives) if (re.test(body)) offenders.push(`${file}: ${re}`);
  }
  assert.deepEqual(offenders, [], `network calls in shipped source:\n  ${offenders.join('\n  ')}`);
});

test('AC-1209 no analytics, ads, tracking or remote-config dependency is installed', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const banned = /analytics|amplitude|segment|firebase|sentry|bugsnag|admob|applovin|facebook|appsflyer|adjust|mixpanel|posthog|tracking|expo-updates|expo-tracking/i;
  const found = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) =>
    banned.test(d));
  assert.deepEqual(found, [], `network-capable SDKs installed: ${found.join(', ')}`);
});

test('AC-1209 the manifest enables no over-the-air update channel', () => {
  // `expo-updates` is the one network client an Expo app gets for free. It is
  // not installed, and this is the other half: a manifest that turns it on is
  // a manifest that will fetch a manifest on every launch.
  const updates = APP.updates;
  assert.ok(
    updates === undefined || updates.enabled === false,
    `app.json enables updates: ${JSON.stringify(updates)}`,
  );
});

test('AC-1205 the root view is the app ground, so there is no white first frame', () => {
  // `backgroundColor` in the manifest only reaches the native root view when
  // `expo-system-ui` is installed — without it `expo prebuild` prints
  // "ios.backgroundColor: Install expo-system-ui to enable this feature" and
  // drops the key, leaving the frame between the splash storyboard and React's
  // first paint at the template default. With it, the generated Info.plist
  // carries RCTRootViewBackgroundColor = 4279047195 = 0xFF0D141B.
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert.ok(pkg.dependencies['expo-system-ui'],
    'backgroundColor is set but expo-system-ui is not installed, so it does nothing');
  assert.equal(APP.backgroundColor, COLORS.bg);
});

test('ui.md §11.4 the audio plugin asks for no microphone and no background audio', () => {
  // `expo-audio` defaults to declaring NSMicrophoneUsageDescription,
  // UIBackgroundModes: audio and Android's RECORD_AUDIO. This game plays short
  // cues and records nothing, and a privacy declaration of "Data Not Collected"
  // beside a microphone permission is the same contradiction §11.4 refuses
  // NSUserTrackingUsageDescription for. Verified against `expo prebuild`: with
  // these four options the generated Info.plist carries no UsageDescription key
  // at all and no UIBackgroundModes.
  const entry = (APP.plugins || []).find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-audio');
  assert.ok(Array.isArray(entry), 'expo-audio is listed with no options, so it takes its defaults');
  assert.deepEqual(entry[1], {
    microphonePermission: false,
    recordAudioAndroid: false,
    enableBackgroundRecording: false,
    enableBackgroundPlayback: false,
  });
});

test('AC-1209 / ui.md §11.4 no tracking usage description is declared', () => {
  // Adding `NSUserTrackingUsageDescription` implies tracking that does not
  // happen, and the App Privacy declaration is "Data Not Collected".
  const plist = APP.ios.infoPlist || {};
  assert.equal(plist.NSUserTrackingUsageDescription, undefined);
  assert.equal(plist.ITSAppUsesNonExemptEncryption, false);
  // Nothing in the manifest may ask for a permission at all: the app collects
  // nothing, so every usage-description key is a question the reviewer should
  // not have to ask.
  const asks = Object.keys(plist).filter((k) => k.endsWith('UsageDescription'));
  assert.deepEqual(asks, [], `the manifest declares permissions: ${asks.join(', ')}`);
});
