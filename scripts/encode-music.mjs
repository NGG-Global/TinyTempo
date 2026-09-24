/** Premix gameplay masters in float, then encode one MP3 per arrangement at 160 kb/s.
 * node scripts/encode-music.mjs [kbps] [--stems]
 * B's deliberate offline loop edit is recorded in bgm/arrangement-b/edit.json.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';

const args = process.argv.slice(2);
const WITH_STEMS = args.includes('--stems');
const KBPS = Number(args.find(a => !a.startsWith('--')) ?? 160);
if (![32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320].includes(KBPS)) throw new Error('Unsupported MP3 bitrate.');
const ROOT = fileURLToPath(new URL('../bgm/', import.meta.url));
const MIX_TARGET = join(ROOT, 'mix');
const MIX_PEAK = 0.97;
const B_EDIT = JSON.parse(readFileSync(join(ROOT, 'arrangement-b/edit.json'), 'utf8'));
const ARRANGEMENTS = [
  { id: 'a', directory: ROOT, output: 'tiny-tempo.mp3', names: ['0 Drums', '1 Bass', '2 Guitar', '3 Keyboard', '4 Percussion', '5 Synth', '6 Brass'] },
  { id: 'b', directory: join(ROOT, 'arrangement-b'), output: 'tiny-tempo-b.mp3', names: ['0 Lead Vocals', '1 Drums', '2 Bass', '3 Guitar', '4 Keyboard', '5 Synth', '6 Other', '7 Brass'], edit: B_EDIT },
];

function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: expected RIFF WAV`);
  let offset = 12, channels = 0, sampleRate = 0, bits = 0, format = 0, data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (offset + 8 + size > buf.length) throw new Error(`${path}: truncated WAV chunk`);
    if (id === 'fmt ') {
      format = buf.readUInt16LE(offset + 8); channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12); bits = buf.readUInt16LE(offset + 22);
    }
    if (id === 'data') data = buf.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!data || format !== 1 || bits !== 16 || channels !== 2 || ![32000, 44100, 48000].includes(sampleRate) || data.length % 4) {
    throw new Error(`${basename(path)}: expected 16-bit stereo PCM at 32/44.1/48 kHz`);
  }
  const frames = data.length / 4;
  if (!frames) throw new Error(`${path}: empty WAV`);
  const left = new Int16Array(frames), right = new Int16Array(frames);
  for (let i = 0; i < frames; i++) { left[i] = data.readInt16LE(i * 4); right[i] = data.readInt16LE(i * 4 + 2); }
  return { sampleRate, frames, left, right };
}

function encode(left, right, sampleRate, target) {
  const encoder = new Mp3Encoder(2, sampleRate, KBPS), chunks = [], block = 1152 * 8;
  for (let i = 0; i < left.length; i += block) {
    const out = encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
    if (out.length) chunks.push(Buffer.from(out.buffer, out.byteOffset, out.length));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length));
  writeFileSync(target, Buffer.concat(chunks));
  return statSync(target).size;
}

/** Keep a 64-bar interior passage. At the seam, fade the continuation into the new
 * opening over 80 ms, at the SAME musical positions. No overlapping decoded tracks at
 * runtime, no shortened bar, no inserted rest, no time stretch. Preroll isolates MP3
 * onset detection; postroll is a copy of the opening so encoding sees the loop seam.
 */
function editLoop(left, right, sampleRate, edit) {
  const start = Math.round((edit.sourceDownbeatSec + edit.skipBars * edit.beatsPerBar * 60 / edit.sourceBpm) * sampleRate);
  const frames = Math.round(edit.bars * edit.beatsPerBar * 60 / edit.sourceBpm * sampleRate);
  const seam = Math.round(edit.seamSec * sampleRate);
  const lead = Math.round(edit.prerollSec * sampleRate), tail = Math.round(edit.postrollSec * sampleRate);
  if (start < 0 || frames <= seam || start + frames + seam > left.length) throw new Error('B edit exceeds source material.');
  const out = [left, right].map(channel => {
    const loop = channel.slice(start, start + frames);
    for (let i = 0; i < seam; i++) {
      const weight = (1 - Math.cos(Math.PI * i / (seam - 1))) / 2;
      loop[i] = channel[start + frames + i] * (1 - weight) + loop[i] * weight;
    }
    // MP3's first attack is encoded after silence, whereas the loop end follows music.
    // Bring both sides to zero over 8 ms so that codec pre-echo cannot turn their
    // different histories into a click. Do not remove frames or shift the beat grid.
    const edge = Math.round(edit.edgeFadeSec * sampleRate);
    for (let i = 0; i < edge; i++) {
      const weight = (1 - Math.cos(Math.PI * i / (edge - 1))) / 2;
      loop[i] *= weight;
      loop[frames - 1 - i] *= weight;
    }
    const padded = new Float32Array(lead + frames + tail);
    padded.set(loop, lead); padded.set(loop.subarray(0, tail), lead + frames);
    return padded;
  });
  return { left: out[0], right: out[1], loopFrames: frames, editStartSec: start / sampleRate };
}

mkdirSync(MIX_TARGET, { recursive: true });
const reports = [];
for (const arrangement of ARRANGEMENTS) {
  const files = readdirSync(arrangement.directory).filter(f => f.toLowerCase().endsWith('.wav')).sort();
  const expected = arrangement.names.map(name => `${name}.wav`).sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error(`${arrangement.id}: expected exactly ${expected.join(', ')}`);
  let sampleRate = 0, frames = 0, sumL = null, sumR = null;
  for (const file of files) {
    const wav = readWav(join(arrangement.directory, file));
    if (!sumL) {
      ({ sampleRate, frames } = wav); sumL = new Float32Array(frames); sumR = new Float32Array(frames);
    } else if (wav.sampleRate !== sampleRate || wav.frames !== frames) {
      throw new Error(`${file}: ${wav.frames} frames at ${wav.sampleRate} Hz; expected ${frames} at ${sampleRate}. No independent padding or alignment allowed.`);
    }
    // Unity weights, unchanged for A. Never accumulate in Int16.
    for (let i = 0; i < frames; i++) { sumL[i] += wav.left[i] / 32768; sumR[i] += wav.right[i] / 32768; }
    console.log(`${arrangement.id}: ${file}: ${wav.frames} frames, ${wav.sampleRate} Hz, stereo PCM16`);
    if (WITH_STEMS) {
      const target = join(arrangement.directory, 'mp3'); mkdirSync(target, { recursive: true });
      encode(wav.left, wav.right, sampleRate, join(target, file.replace(/\.wav$/, '.mp3')));
    }
  }
  let loopFrames = frames, editStartSec = 0;
  if (arrangement.edit) ({ left: sumL, right: sumR, loopFrames, editStartSec } = editLoop(sumL, sumR, sampleRate, arrangement.edit));
  let peak = 0, energy = 0;
  for (let i = 0; i < sumL.length; i++) {
    peak = Math.max(peak, Math.abs(sumL[i]), Math.abs(sumR[i]));
    energy += sumL[i] ** 2 + sumR[i] ** 2;
  }
  if (!(peak > 0) || !Number.isFinite(energy)) throw new Error(`${arrangement.id}: silent or invalid sum`);
  const scale = peak > MIX_PEAK ? MIX_PEAK / peak : 1;
  const rms = Math.sqrt(energy / (sumL.length * 2));
  const left = new Int16Array(sumL.length), right = new Int16Array(sumL.length);
  for (let i = 0; i < left.length; i++) {
    left[i] = Math.max(-32768, Math.min(32767, Math.round(sumL[i] * scale * 32768)));
    right[i] = Math.max(-32768, Math.min(32767, Math.round(sumR[i] * scale * 32768)));
  }
  const size = encode(left, right, sampleRate, join(MIX_TARGET, arrangement.output));
  const gain = arrangement.id === 'a' ? 0.4 / scale : reports[0].normalizedRms * reports[0].recommendedGain / (rms * scale);
  const report = { id: arrangement.id, output: arrangement.output, bytes: size, kbps: KBPS, sourceFrames: frames,
    sourceSeconds: frames / sampleRate, sampleRate, channels: 2, bits: 16,
    encodedInputSeconds: left.length / sampleRate, loopFrames, editStartSec, peakBeforeNormalization: peak,
    normalizationFactor: scale, normalizedRms: rms * scale, recommendedGain: gain };
  reports.push(report); console.log(JSON.stringify(report, null, 2));
}
writeFileSync(join(MIX_TARGET, 'encoding-report.json'), JSON.stringify(reports, null, 2) + '\n');
