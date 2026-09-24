/** Convert the delivered MP3 stems to clearly identified PCM working copies, not lossless masters.
 * node scripts/prepare-arrangement-b.mjs <directory containing the eight original MP3s>
 * Requires local FFmpeg only for this one-time import; the regular encoder remains JS-only.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = process.argv[2];
if (!source) throw new Error('Pass the directory containing the original Memory Match Groove MP3 stems.');
const target = fileURLToPath(new URL('../bgm/arrangement-b/', import.meta.url));
const names = ['0 Lead Vocals', '1 Drums', '2 Bass', '3 Guitar', '4 Keyboard', '5 Synth', '6 Other', '7 Brass'];
mkdirSync(target, { recursive: true });
const files = [];
for (const name of names) {
  const input = resolve(source, `${name}.mp3`);
  const output = join(target, `${name}.wav`);
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-map_metadata', '-1', '-c:a', 'pcm_s16le', output], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  files.push({ original: `${name}.mp3`, sha256: createHash('sha256').update(readFileSync(input)).digest('hex'), workingCopy: `${name}.wav` });
  console.log(`${name}.mp3 -> ${name}.wav (decoded working copy; original lossy quality unchanged)`);
}
writeFileSync(join(target, 'provenance.json'), JSON.stringify({
  delivery: 'Memory Match Groove Stems (121BPM).zip',
  archiveSha256: 'e286fc0841264057266da473198fa08745edb8026f9d0390cf495aedaed4add2',
  format: '16-bit stereo PCM working copies decoded from supplied MP3s; not original lossless masters',
  files,
}, null, 2) + '\n');
