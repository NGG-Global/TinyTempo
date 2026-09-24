import { MUSIC, type ArrangementId } from '../config/music';
import type { AudioEngine } from './AudioEngine';

/** Source ownership across scenes. Title playback remains a separate player. */
export type MusicBed = 'shell' | 'level' | 'silent';
export type MusicHost = Pick<AudioEngine, 'music' | 'context'>;
let bed: MusicBed = 'silent';
let token = 0;
export function currentMusicBed(): MusicBed { return bed; }
export function resetMusicBedState(): void { bed = 'silent'; token += 1; }

export function canReuseShell(activeSources: number, playbackRate: number, current: MusicBed, baseRate = 1): boolean {
  return current !== 'silent' && activeSources > 0 && playbackRate === baseRate;
}

/** Claim ownership BEFORE awaiting a fade/load, so a stale shell callback cannot stop
 * a new level. Only this boundary handoff changes arrangements. Level playback itself
 * starts later, from offset zero on PlayScene's future judgement-clock timestamp.
 */
export async function setMusicBed(
  engine: MusicHost, next: MusicBed,
  options?: { fadeSec?: number; arrangement?: ArrangementId },
): Promise<void> {
  const fadeSec = options?.fadeSec ?? (next === 'silent' ? 0 : MUSIC.bedFadeSec);
  const mine = ++token;
  const previous = bed;
  bed = next;
  const { music, context } = engine;
  // Existing callers may simply claim an already-prepared level source.
  if (next === 'level' && options?.arrangement === undefined) return;
  const desired = options?.arrangement ?? music.requestedArrangement;
  if (next === 'shell' && context.state !== 'running') return;

  if (next === 'shell' && desired === music.requestedArrangement && music.ready
      && canReuseShell(music.activeSources, music.playbackRate, previous, music.baseRate)) {
    if (music.gain !== music.defaultGain) music.setGain(music.defaultGain, fadeSec);
    return;
  }

  const generation = music.playbackGeneration;
  if (music.activeSources > 0 && fadeSec > 0 && music.gain > 0) {
    music.setGain(0, fadeSec);
    await new Promise<void>(resolve => { setTimeout(resolve, fadeSec * 1000); });
    if (mine !== token || music.playbackGeneration !== generation) return;
  }
  if (mine !== token) return;
  if (music.playbackGeneration === generation) music.stop();
  if (next === 'silent') { music.setGain(music.defaultGain, 0); return; }

  try {
    await music.load(desired);
    if (mine !== token) return;
    music.setGain(music.defaultGain, 0);
    if (next === 'level' || context.state !== 'running') return;
    music.setGain(0, 0);
    music.start();
    music.setGain(music.defaultGain, fadeSec);
  } catch {
    // Shell failures never reject into a scene's unobserved promise. PlayScene checks
    // ready and keeps its Retry UI for a missing A; B has its own A/silent fallback.
    if (mine === token) { music.setGain(music.defaultGain, 0); bed = 'silent'; }
  }
}
