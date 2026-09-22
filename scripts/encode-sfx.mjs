/**
 * Encodes the long one-shot masters in sfx/masters/ to the MP3s the game ships.
 *
 * Percussive one-shots ship as delivered WAV and never come through here: an encoder
 * delay browsers disagree about is exactly the error a beat on the grid cannot afford
 * (docs/SOUND.md). What this is for is the other kind — a coda of several seconds, where
 * the container costs nothing musically and the WAV costs most of a megabyte. The three
 * clap endings are 1.6 MB of stereo WAV and 0.19 MB as MP3, beside a 2.4 MB music track.
 *
 * The masters stay the source of truth and are not bundled: nothing references them
 * through `import.meta.url`, so Vite never emits them. Pure JavaScript LAME (lamejs), the
 * same encoder the music uses, so no native encoder is required.
 *
 *   node scripts/encode-sfx.mjs [kbps]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';

const KBPS = Number(process.argv.slice(2).find(a => !a.startsWith('--')) ?? 160);
const SOURCE = new URL('../sfx/masters/', import.meta.url).pathname;
const TARGET = new URL('../sfx/', import.meta.url).pathname;

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

const masters = readdirSync(SOURCE).filter(f => f.endsWith('.wav')).sort();
if (!masters.length) throw new Error(`No WAV masters in ${SOURCE}`);
let from = 0, to = 0;
for (const file of masters) {
  const source = join(SOURCE, file);
  const wav = readWav(source);
  const name = file.replace(/\.wav$/, '.mp3');
  const size = encode(wav.left, wav.right, wav.sampleRate, join(TARGET, name));
  from += statSync(source).size;
  to += size;
  console.log(`${file} -> ${name} ${(size / 1024).toFixed(0)} KB, ${(wav.frames / wav.sampleRate).toFixed(2)} s at ${wav.sampleRate} Hz`);
}
console.log(`${masters.length} masters: ${(from / 1024).toFixed(0)} KB of WAV -> ${(to / 1024).toFixed(0)} KB of MP3 at ${KBPS} kbps`);
