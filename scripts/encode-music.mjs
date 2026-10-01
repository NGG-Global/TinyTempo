/**
 * Encodes the delivered WAV stems in bgm/ to the MP3s the game ships.
 *
 * The WAVs stay the source of truth (unmodified). Each gameplay track is one premixed
 * stereo MP3 in bgm/mix/, because nothing mixes stems at runtime: separate decodes cost
 * ~42 MiB of float PCM each, and roughly double that transiently, to play buffers at a
 * fixed relative level. Pass `--stems` to also write per-stem MP3s beside the masters,
 * which is what a future dynamic mix would need. Pure JavaScript LAME (lamejs), so no
 * native encoder is required. Re-run after replacing a stem, then measure the decoded
 * lead-in again (see docs/MUSIC.md).
 *
 *   node scripts/encode-music.mjs [kbps] [--stems] [--track a|b|theme]
 *
 * `--track theme` encodes the title theme alone (see `THEME_MASTER` below).
 *
 * A track marked `layered` also gets one MP3 per stem in bgm/mix/, at `LAYER_KBPS`, each
 * with the same head and the same scale as the premix, so the stems played together are
 * the premix to the sample and the game can bring them in one at a time. Those are what
 * the game loads for that track; the premix stays as the loudness reference.
 *
 * Without `--track` every track is encoded. Track A's encode is deterministic, so a
 * re-run with the same masters and bitrate writes the same bytes.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';

const args = process.argv.slice(2);
const WITH_STEMS = args.includes('--stems');
const ONLY = args.includes('--track') ? args[args.indexOf('--track') + 1] : null;
const KBPS = Number(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--track') ?? 160);
const ROOT = fileURLToPath(new URL('../bgm/', import.meta.url));
const MIX_TARGET = join(ROOT, 'mix');
/** A single stem is sparser than a mix and six of them ship at once; 128 kb/s keeps the set near 10 MB. */
const LAYER_KBPS = 128;
/** Sample peak a premix is normalised down to. Leaves ~0.26 dB before full scale. */
const MIX_PEAK = 0.97;
/** Every gameplay track is authored at this tempo in 4/4; `MUSIC.sourceBpm` in src/config/music.ts. */
const SOURCE_BPM = 120;

/**
 * One entry per gameplay track, mirroring `GAMEPLAY_TRACKS` in src/config/music.ts.
 *
 * `mix` holds the relative stem levels, keyed by the stem's name without its ordering
 * prefix ("3 Keyboard.wav" -> "Keyboard"); a stem with no weight is an error rather than
 * a silent omission. `bars` is what the loop has to be, and is only reported here — the
 * game's `normalizeLoop` is what enforces it. `headSec` is silence written in front of
 * the premix: track A's masters already carry 156 ms of room before the first downbeat,
 * track B's start on it, and an MP3 whose first transient sits in the very first granule
 * is where decoders disagree most about how much encoder delay to trim. A tenth of a
 * second of silence puts B's opening hit in the same regime as A's, inside the same
 * detection window, and `normalizeLoop` drops it at load like any other lead-in.
 * `gain` is the bus gain the track ships with; A's is the measured compensation for its
 * normalisation (see docs/MUSIC.md) and every other track is matched to A's heard level
 * by the report at the end of the run.
 */
const TRACKS = [
  {
    id: 'a', directory: ROOT, output: 'tiny-tempo.mp3', bars: 60, headSec: 0, gain: 0.5632,
    mix: { Drums: 1, Bass: 1, Guitar: 1, Keyboard: 1, Percussion: 1, Synth: 1, Brass: 1 },
  },
  {
    id: 'b', directory: join(ROOT, 'track-b'), output: 'tiny-tempo-b.mp3', bars: 54, headSec: 0.1, gain: 0.52, layered: true,
    mix: { Drums: 1, Bass: 1, Harmony: 1, 'Synth Lead': 1, Orchestral: 1, Risers: 1 },
  },
];

/** 16- or 24-bit stereo PCM to float. Track B's masters are 24-bit; A's are 16. */
function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${basename(path)}: expected a RIFF WAV`);
  let offset = 12, format = 0, channels = 0, sampleRate = 0, bits = 0, data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') { format = buf.readUInt16LE(offset + 8); channels = buf.readUInt16LE(offset + 10); sampleRate = buf.readUInt32LE(offset + 12); bits = buf.readUInt16LE(offset + 22); }
    if (id === 'data') { data = buf.subarray(offset + 8, offset + 8 + Math.min(size, buf.length - offset - 8)); break; }
    offset += 8 + size + (size % 2);
  }
  if (!data || format !== 1 || channels !== 2 || (bits !== 16 && bits !== 24)) throw new Error(`${basename(path)}: expected 16- or 24-bit stereo PCM`);
  const bytes = bits / 8, frames = Math.floor(data.length / (bytes * 2)), full = 1 << (bits - 1);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { const o = i * bytes * 2; left[i] = data.readIntLE(o, bytes) / full; right[i] = data.readIntLE(o + bytes, bytes) / full; }
  return { sampleRate, frames, left, right };
}

function toPcm16(channel, scale) {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(channel[i] * scale * 32768)));
  return out;
}

function encode(left, right, sampleRate, target, kbps = KBPS) {
  const encoder = new Mp3Encoder(2, sampleRate, kbps);
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

/** Stem name as `mix` keys it: "3 Keyboard.wav" -> "Keyboard". */
const stemName = file => basename(file, '.wav').replace(/^\d+\s*/, '');
const dB = value => (20 * Math.log10(value)).toFixed(2);

function premix(track) {
  const files = readdirSync(track.directory).filter(f => f.endsWith('.wav')).sort();
  if (!files.length) throw new Error(`No WAV masters in ${track.directory}`);
  // Sum in float, at full precision, and only then scale: stems that each peak near
  // -3 dBFS overflow 16-bit together, and clipping the sum would be irreversible.
  let sampleRate = 0, frames = 0, sumL = null, sumR = null;
  const stems = [];
  for (const file of files) {
    const name = stemName(file);
    const weight = track.mix[name];
    if (weight === undefined) throw new Error(`${file}: no mix weight for stem "${name}" of track ${track.id}. Add it to TRACKS.`);
    const wav = readWav(join(track.directory, file));
    if (!sumL) {
      ({ sampleRate, frames } = wav);
      sumL = new Float32Array(frames); sumR = new Float32Array(frames);
    } else if (wav.sampleRate !== sampleRate || wav.frames !== frames) {
      throw new Error(`${file}: ${wav.frames} frames at ${wav.sampleRate} Hz, expected ${frames} at ${sampleRate}. The masters were not trimmed to one length.`);
    }
    for (let i = 0; i < frames; i++) { sumL[i] += wav.left[i] * weight; sumR[i] += wav.right[i] * weight; }
    if (track.layered) stems.push({ file, name, weight, wav });
    if (WITH_STEMS) {
      const target = join(track.directory, 'mp3');
      mkdirSync(target, { recursive: true });
      const size = encode(toPcm16(wav.left, 1), toPcm16(wav.right, 1), sampleRate, join(target, file.replace(/\.wav$/, '.mp3')));
      console.log(`${file} -> ${(size / 1e6).toFixed(2)} MB`);
    }
  }
  let peak = 0, energy = 0;
  for (let i = 0; i < frames; i++) { peak = Math.max(peak, Math.abs(sumL[i]), Math.abs(sumR[i])); energy += sumL[i] * sumL[i] + sumR[i] * sumR[i]; }
  const scale = peak > MIX_PEAK ? MIX_PEAK / peak : 1;
  const rms = Math.sqrt(energy / (2 * frames)) * scale;
  const head = Math.round(track.headSec * sampleRate);
  const left = new Int16Array(head + frames), right = new Int16Array(head + frames);
  left.set(toPcm16(sumL, scale), head); right.set(toPcm16(sumR, scale), head);
  mkdirSync(MIX_TARGET, { recursive: true });
  const size = encode(left, right, sampleRate, join(MIX_TARGET, track.output));
  // The stems the game layers: the premix's own scale and head, so their sum is the premix.
  for (const stem of stems) {
    const stemL = new Int16Array(head + frames), stemR = new Int16Array(head + frames);
    stemL.set(toPcm16(stem.wav.left, scale * stem.weight), head); stemR.set(toPcm16(stem.wav.right, scale * stem.weight), head);
    const name = `${track.output.replace(/\.mp3$/, '')}-${stem.name.toLowerCase().replace(/\s+/g, '-')}.mp3`;
    const stemSize = encode(stemL, stemR, sampleRate, join(MIX_TARGET, name), LAYER_KBPS);
    console.log(`  layer ${stem.file} -> ${name} ${(stemSize / 1e6).toFixed(2)} MB at ${LAYER_KBPS} kb/s`);
  }
  const loop = track.bars * 4 * 60 / SOURCE_BPM;
  console.log(`track ${track.id}: ${files.length} stems -> ${track.output} ${(size / 1e6).toFixed(2)} MB, ${frames} frames at ${sampleRate} Hz = ${(frames / sampleRate).toFixed(6)} s against ${loop} s for ${track.bars} bars${head ? `, ${track.headSec} s of silence in front` : ''}`);
  console.log(`  sum peak ${peak.toFixed(4)} (${dB(peak)} dBFS), scaled by ${scale.toFixed(6)}; premix RMS ${dB(rms)} dBFS`);
  return { rms, scale };
}

/**
 * The title theme, `bgm/theme/home-page.wav`: a seamless 64.000 s loop, music to its last
 * sample. An MP3 cannot loop seamlessly on its own — the encoder writes silence in front of
 * the music and pads the end, and decoders disagree about trimming either — so the theme is
 * encoded with a known head of silence, for `ThemeMusic` to find the music's start the way
 * `detectLeadIn` finds the gameplay track's downbeat, and with the loop's own opening
 * written again after its end. The player loops exactly `THEME.loopSec` from the start it
 * finds, so the seam it jumps across is music on both sides, and a start found a few
 * milliseconds out shifts the loop without opening a gap in it.
 */
const THEME_MASTER = { path: join(ROOT, 'theme', 'home-page.wav'), output: join(ROOT, 'theme', 'home-page.mp3'), headSec: 0.1, tailSec: 0.25 };

function encodeTheme() {
  const wav = readWav(THEME_MASTER.path);
  const head = Math.round(THEME_MASTER.headSec * wav.sampleRate), tail = Math.round(THEME_MASTER.tailSec * wav.sampleRate);
  if (tail >= wav.frames) throw new Error('The theme is shorter than its seam copy.');
  const frames = head + wav.frames + tail;
  const left = new Float32Array(frames), right = new Float32Array(frames);
  left.set(wav.left, head); right.set(wav.right, head);
  left.set(wav.left.subarray(0, tail), head + wav.frames); right.set(wav.right.subarray(0, tail), head + wav.frames);
  let peak = 0, energy = 0;
  for (let i = 0; i < wav.frames; i++) { peak = Math.max(peak, Math.abs(wav.left[i]), Math.abs(wav.right[i])); energy += wav.left[i] ** 2 + wav.right[i] ** 2; }
  // As delivered: the theme peaks well under full scale, so it is not normalised, and its
  // level against the game is the player's bus gain (`THEME.gain`), not a change here.
  const size = encode(toPcm16(left, 1), toPcm16(right, 1), wav.sampleRate, THEME_MASTER.output);
  console.log(`theme: ${basename(THEME_MASTER.path)} -> ${basename(THEME_MASTER.output)} ${(size / 1e6).toFixed(2)} MB, ${wav.frames} frames at ${wav.sampleRate} Hz = ${(wav.frames / wav.sampleRate).toFixed(6)} s, ${THEME_MASTER.headSec} s head, ${THEME_MASTER.tailSec} s of the opening after the end`);
  console.log(`  peak ${peak.toFixed(4)} (${dB(peak)} dBFS), RMS ${dB(Math.sqrt(energy / (2 * wav.frames)))} dBFS`);
}

if (ONLY === 'theme' || ONLY === null) encodeTheme();
const selected = TRACKS.filter(t => ONLY === null || t.id === ONLY);
if (ONLY === 'theme') process.exit(0);
if (!selected.length) throw new Error(`No track "${ONLY}". Tracks: ${TRACKS.map(t => t.id).join(', ')}, theme.`);
const results = new Map(selected.map(track => [track.id, premix(track)]));

// Loudness is matched by measurement, not by ear. Track A's gain gives back what its
// normalisation took, so it plays at the level its stems did; every other track is set
// so its heard RMS equals A's, and the switch between chapters is not a jump.
const a = TRACKS[0];
const reference = results.get(a.id) ?? { rms: null };
if (reference.rms !== null) {
  console.log(`track a heard RMS ${dB(reference.rms * a.gain)} dBFS at gain ${a.gain}`);
  for (const track of selected) {
    if (track === a) continue;
    const gain = reference.rms * a.gain / results.get(track.id).rms;
    console.log(`set GAMEPLAY_TRACKS.${track.id}.gain to ${gain.toFixed(4)} to match track a's heard level (currently ${track.gain ?? 'unset'})`);
  }
} else {
  console.log('encode track a in the same run to get the matching gain for the others');
}
