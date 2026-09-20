import type { VignetteSounds } from './AudioEngine';
import { recordedVoice, samples } from './samples';

type Voice = keyof VignetteSounds | 'note2';
const TAU = Math.PI * 2;
const LENGTH: Record<Voice, number> = { action: 0.42, note2: 0.42, success: 1.6, rough: 1.4, scrape: 0.16, judder: 0.3 };
const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
/** Bb2 and F2: the two notes the recorded takes play, for the fallback to agree with the slide. */
const NOTE_HZ = [116.54, 87.31] as const;

/**
 * A brass tone: a few harmonics with the upper ones arriving a moment after the
 * fundamental, and a little vibrato once the note has settled. It is what the act has
 * when the recorded takes have not arrived, and it is also what plays the success and
 * rough endings if those recordings are missing, so it has to sound like the same horn.
 */
function brass(t: number, hz: number, length: number): number {
  if (t < 0 || t > length) return 0;
  const attack = Math.min(1, t / 0.035);
  const release = Math.min(1, Math.max(0, (length - t) / 0.08));
  const vibrato = 1 + Math.sin(TAU * 5.5 * t) * 0.004 * Math.min(1, t / 0.25);
  const f = hz * vibrato;
  let v = 0;
  for (let h = 1; h <= 7; h++) {
    const bloom = Math.min(1, t / (0.02 + h * 0.012));
    v += Math.sin(TAU * f * h * t) * (1 / h) * (h % 2 ? 1 : 0.8) * bloom;
  }
  return v * 0.22 * attack * release;
}

export function synthesizeTrombone(sampleRate: number, kind: Voice): Float32Array {
  const duration = LENGTH[kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 4451, low = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.9 + noise * 0.1;
    let v = 0;
    if (kind === 'action') v = brass(t, NOTE_HZ[0], 0.38) + low * decay(t, 90) * 0.15;
    else if (kind === 'note2') v = brass(t, NOTE_HZ[1], 0.38) + low * decay(t, 90) * 0.15;
    else if (kind === 'success') {
      // A fanfare: three quick notes up and a held top.
      v = brass(t, NOTE_HZ[0], 0.18) + brass(t - 0.2, 146.83, 0.18) + brass(t - 0.4, 174.61, 0.18) + brass(t - 0.6, 233.08, 0.95);
    } else if (kind === 'rough') {
      // The sad slide: a note that sags down through a fifth and gives up.
      const p = Math.min(1, Math.max(0, (t - 0.15) / 0.9));
      const hz = NOTE_HZ[0] * (1 - 0.33 * p);
      v = brass(t, hz, 1.3) * (1 - p * 0.4) + low * decay(t - 1.1, 20) * 0.1;
    } else if (kind === 'scrape') {
      // Air through the horn with no note in it: a tap where no beat was.
      v = low * decay(t, 25) * 0.45 + noise * decay(t, 60) * 0.12;
    } else {
      // A beat left unplayed: the note cracks, a split tone that dies quickly.
      v = brass(t, NOTE_HZ[0] * 1.06, 0.26) * 0.6 * (1 + Math.sin(TAU * 31 * t) * 0.5) + noise * decay(t, 40) * 0.1;
    }
    const attack = Math.min(1, t / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    data[i] = Math.tanh(v * 1.1) * attack * release;
  }
  return data;
}

export function createTromboneSounds(context: AudioContext): VignetteSounds {
  const make = (kind: Voice): AudioBuffer => {
    const data = synthesizeTrombone(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  // Two takes, alternated: the engine hands them out one per sounding beat, which is the
  // act's whole premise. The synthesized fallback alternates the same two notes so the
  // slide still moves with what is heard when the recordings have not arrived.
  const recorded = recordedVoice(() => make('action'), ['trombone1', 'trombone2']);
  return {
    action: Array.isArray(recorded) ? recorded : [make('action'), make('note2')],
    success: samples.get('tromboneSuccess') ?? make('success'),
    rough: samples.get('tromboneFail') ?? make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
