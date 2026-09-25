/**
 * Encodes the delivered WAV stems in bgm/ to the MP3s the game ships.
 *
 * The WAVs stay the source of truth (161 MB, unmodified). The game loads one
 * premixed stereo track, `bgm/mix/tiny-tempo.mp3`, because nothing mixes stems at
 * runtime: seven separate decodes cost ~307 MiB of float PCM and roughly double
 * that transiently, to play seven buffers at a fixed relative level. Pass
 * `--stems` to also write the per-stem MP3s, which is what a future dynamic mix
 * would need. Pure JavaScript LAME (lamejs), so no native encoder is required.
 * Re-run after replacing a stem, then measure the decoded lead-in again
 * (see docs/MUSIC.md).
 *
 *   node scripts/encode-music.mjs [kbps] [--stems]
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';

const args = process.argv.slice(2);
const WITH_STEMS = args.includes('--stems');
const KBPS = Number(args.find(a => !a.startsWith('--')) ?? 160);
const SOURCE = new URL('../bgm/', import.meta.url).pathname;
const STEM_TARGET = join(SOURCE, 'mp3');
const MIX_TARGET = join(SOURCE, 'mix');
const MIX_NAME = 'tiny-tempo.mp3';
/**
 * Relative stem levels in the premix. Mirrors `MUSIC.mix` in src/config/music.ts,
 * which is the only other place these weights exist; keep the two in step.
 */
const MIX = { Drums: 1, Bass: 1, Guitar: 1, Keyboard: 1, Percussion: 1, Synth: 1, Brass: 1 };
/** Sample peak the premix is normalised to. Leaves ~0.26 dB before full scale. */
const MIX_PEAK = 0.97;
/** The bus gain the seven stems were played through, for the compensation report below. */
const PREVIOUS_MASTER_GAIN = 0.4;

function readWav(path) {
  const buf = readFileSync(path);
  let offset = 12, channels = 0, sampleRate = 0, bits = 0, data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = buf.readUInt16LE(offset + 10); sampleRate = buf.readUInt32LE(offset + 12); bits = buf.readUInt16LE(offset + 22); }
    if (id === 'data') { data = buf.subarray(offset + 8, offset + 8 + size); break; }
    offset += 8 + size + (size % 2);
  }
  if (!data || bits !== 16 || channels !== 2) throw new Error(`${basename(path)}: expected 16-bit stereo PCM`);
  const frames = data.length / 4;
  const left = new Int16Array(frames), right = new Int16Array(frames);
  for (let i = 0; i < frames; i++) { left[i] = data.readInt16LE(i * 4); right[i] = data.readInt16LE(i * 4 + 2); }
  return { sampleRate, frames, left, right };
}

function encode(left, right, sampleRate, target) {
  const encoder = new Mp3Encoder(2, sampleRate, KBPS);
  const chunks = [];
  const block = 1152 * 8;
  for (let i = 0; i < left.length; i += block) {
    const out = encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
    if (out.length) chunks.push(Buffer.from(out.buffer, out.byteOffset, out.length));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length));
  writeFileSync(target, Buffer.concat(chunks));
  return statSync(target).size;
}

/** Stem name as `MIX` keys it: "3 Keyboard.wav" -> "Keyboard". */
const stemName = file => basename(file, '.wav').replace(/^\d+\s*/, '');

const files = readdirSync(SOURCE).filter(f => f.endsWith('.wav')).sort();
if (!files.length) throw new Error(`No WAV masters in ${SOURCE}`);

// Sum in float, at full precision, and only then scale: summing seven stems that each
// peak near -3 dBFS overflows 16-bit, and clipping the sum would be irreversible.
let sampleRate = 0, frames = 0, sumL = null, sumR = null;
for (const file of files) {
  const name = stemName(file);
  const weight = MIX[name];
  if (weight === undefined) throw new Error(`${file}: no mix weight for stem "${name}". Add it to MIX and to MUSIC.mix.`);
  const wav = readWav(join(SOURCE, file));
  if (!sumL) {
    ({ sampleRate, frames } = wav);
    sumL = new Float32Array(frames); sumR = new Float32Array(frames);
  } else if (wav.sampleRate !== sampleRate || wav.frames !== frames) {
    throw new Error(`${file}: ${wav.frames} frames at ${wav.sampleRate} Hz, expected ${frames} at ${sampleRate}. The masters were not trimmed to one length.`);
  }
  for (let i = 0; i < frames; i++) { sumL[i] += wav.left[i] / 32768 * weight; sumR[i] += wav.right[i] / 32768 * weight; }
  if (WITH_STEMS) {
    mkdirSync(STEM_TARGET, { recursive: true });
    const target = join(STEM_TARGET, file.replace(/\.wav$/, '.mp3'));
    console.log(`${file} -> ${basename(target)} ${(encode(wav.left, wav.right, wav.sampleRate, target) / 1e6).toFixed(2)} MB`);
  }
}

let peak = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(sumL[i]), Math.abs(sumR[i]));
const scale = peak > MIX_PEAK ? MIX_PEAK / peak : 1;
const left = new Int16Array(frames), right = new Int16Array(frames);
for (let i = 0; i < frames; i++) {
  left[i] = Math.max(-32768, Math.min(32767, Math.round(sumL[i] * scale * 32768)));
  right[i] = Math.max(-32768, Math.min(32767, Math.round(sumR[i] * scale * 32768)));
}
mkdirSync(MIX_TARGET, { recursive: true });
const size = encode(left, right, sampleRate, join(MIX_TARGET, MIX_NAME));
console.log(`premix -> ${MIX_NAME} ${(size / 1e6).toFixed(2)} MB, ${frames} frames at ${sampleRate} Hz`);
console.log(`sum peak ${peak.toFixed(4)} (${(20 * Math.log10(peak)).toFixed(2)} dBFS), scaled by ${scale.toFixed(6)}`);
// The premix is normalised for SNR, so the bus has to give back what normalising took,
// or the track plays louder than the seven stems did.
console.log(`set MUSIC.masterGain to ${(PREVIOUS_MASTER_GAIN / scale).toFixed(4)} to keep the previous loudness`);
