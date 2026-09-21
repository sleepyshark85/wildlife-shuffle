#!/usr/bin/env node
// Render assets/sounds/*.wav from the SOUNDS table in src/ui/cues.js.
//
// The cues are synthesised rather than sampled because there is no sound
// designer on this project and no licensed library, and because a table of five
// numbers per cue is something `node --test` can assert AC-1101's "distinct"
// against. Eleven opaque .wav files are not.
//
// Deterministic: same table in, byte-identical files out. Run it after changing
// SOUNDS and commit the result; `test/cues.test.js` checks that every cue has a
// file and that the file is a well-formed mono 16-bit RIFF of the right length.
//
//   node tools/make-sounds.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMPLE_RATE, SOUNDS } from '../src/ui/cues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'sounds');

/** 4 ms of attack. Without it every cue starts on a step and clicks. */
const ATTACK_MS = 4;

function wave(kind, phase) {
  const p = phase - Math.floor(phase); // 0..1 of one cycle
  if (kind === 'sine') return Math.sin(2 * Math.PI * p);
  if (kind === 'square') return p < 0.5 ? 1 : -1;
  if (kind === 'triangle') return 4 * Math.abs(p - 0.5) - 1;
  throw new Error(`unknown waveform: ${kind}`);
}

/**
 * One cue, as Int16 PCM.
 *
 * The frequency sweeps linearly from `from` to `to`, and the phase is
 * accumulated rather than recomputed from `t` — recomputing it makes a sweep
 * discontinuous at every sample and turns a glide into a buzz.
 */
export function render(spec, rate = SAMPLE_RATE) {
  const frames = Math.round((spec.ms / 1000) * rate);
  const pcm = new Int16Array(frames);
  const attack = Math.max(1, Math.round((ATTACK_MS / 1000) * rate));
  let phase = 0;
  for (let i = 0; i < frames; i += 1) {
    const p = frames === 1 ? 0 : i / (frames - 1);
    const hz = spec.from + (spec.to - spec.from) * p;
    phase += hz / rate;
    // Attack, then an exponential decay to silence by the final sample, so
    // nothing ends on a step either.
    const env = Math.min(1, i / attack) * (Math.exp(-4 * p) - Math.exp(-4)) / (1 - Math.exp(-4));
    const v = wave(spec.wave, phase) * spec.gain * env;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return pcm;
}

/** A canonical 44-byte-header mono 16-bit RIFF/WAVE file. */
export function wavFile(pcm, rate = SAMPLE_RATE) {
  const data = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i += 1) data.writeInt16LE(pcm[i], i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [id, spec] of Object.entries(SOUNDS)) {
    const file = wavFile(render(spec));
    writeFileSync(path.join(OUT, `${id}.wav`), file);
    total += file.length;
    process.stdout.write(
      `${id.padEnd(10)} ${spec.wave.padEnd(9)} ${String(spec.from).padStart(5)}` +
        ` -> ${String(spec.to).padStart(5)} Hz  ${String(spec.ms).padStart(4)} ms` +
        `  ${String(file.length).padStart(6)} bytes\n`,
    );
  }
  process.stdout.write(`\n${Object.keys(SOUNDS).length} cues, ${total} bytes total\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
