import { MUSIC } from '../config/music';

/**
 * One bar of metronome at the source tempo, as samples: a click on every beat, the first
 * accented by pitch and level. Pure, so the bar is testable; `metronomeBar` wraps it in
 * an AudioBuffer for the context. The bar loops with the music from the same start time
 * under the same rate automation (see `MusicSystem`), which is what keeps it on the beat
 * whatever the level's tempo does — a scheduled click per beat would have to be re-placed
 * at every rate change, and a beat missed on a long frame is a beat the player counts.
 */
export function metronomeSamples(sampleRate: number, bpm = MUSIC.sourceBpm, beats = MUSIC.beatsPerBar): Float32Array<ArrayBuffer> {
  const m = MUSIC.metronome;
  const beatFrames = sampleRate * 60 / bpm;
  const out = new Float32Array(Math.round(beatFrames * beats));
  const clickFrames = Math.round(m.clickSec * sampleRate);
  for (let beat = 0; beat < beats; beat++) {
    const start = Math.round(beat * beatFrames);
    const hz = beat === 0 ? m.accentHz : m.beatHz;
    const level = beat === 0 ? m.accentLevel : m.beatLevel;
    for (let i = 0; i < clickFrames && start + i < out.length; i++) {
      const t = i / sampleRate;
      // A 1 ms rise keeps the click from being a step; the decay is what makes it a click.
      const envelope = Math.min(1, i / (sampleRate * 0.001)) * Math.exp(-t / (m.clickSec / 4));
      out[start + i] = Math.sin(2 * Math.PI * hz * t) * level * envelope;
    }
  }
  return out;
}

/** The bar as a mono buffer on `context`, one bar long at the source tempo. */
export function metronomeBar(context: BaseAudioContext): AudioBuffer {
  const samples = metronomeSamples(context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
