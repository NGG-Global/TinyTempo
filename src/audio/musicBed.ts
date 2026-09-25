import { MUSIC } from '../config/music';
import type { AudioEngine } from './AudioEngine';

/**
 * Which loop is supposed to be audible.
 *
 * There is only one gameplay track. The bed is which *job* it is doing: the shell
 * on settings and the map; the level's own source, started on a downbeat PlayScene
 * owns; or silence, so tap offset can hear its metronome. The title screen has a
 * second track and does not use this. Scenes name the bed. Starting a second
 * source without going through here is how the menu and a leftover level overlap.
 */
export type MusicBed = 'shell' | 'level' | 'silent';

export type MusicHost = Pick<AudioEngine, 'music' | 'context'>;

let bed: MusicBed = 'silent';
let token = 0;

export function currentMusicBed(): MusicBed { return bed; }

/** Test-only: the module holds the live bed across scenes, so each spec starts clean. */
export function resetMusicBedState(): void {
  bed = 'silent';
  token += 1;
}

/**
 * Whether an already-running source can stay on as the shell bed. Same track, rate 1,
 * already the shell: starting again would cut the loop for nothing, and is also how two
 * overlapping starts used to stack when a scene raced the previous fade.
 */
export function canReuseShell(activeSources: number, playbackRate: number, current: MusicBed): boolean {
  return current !== 'silent' && activeSources > 0 && playbackRate === 1;
}

/**
 * Switch the shared loop to a bed. `level` only records the mood — PlayScene has to
 * start the source on a future downbeat it will judge against, so this must not steal
 * that start. `silent` and `shell` own the source.
 */
export async function setMusicBed(
  engine: MusicHost,
  next: MusicBed,
  options?: { fadeSec?: number },
): Promise<void> {
  const fadeSec = options?.fadeSec ?? (next === 'silent' ? 0 : MUSIC.bedFadeSec);
  const mine = ++token;
  const { music, context } = engine;

  if (next === 'level') {
    bed = 'level';
    return;
  }

  if (next === 'silent') {
    bed = 'silent';
    const generation = music.playbackGeneration;
    if (music.activeSources > 0 && fadeSec > 0 && music.gain > 0) {
      music.setGain(0, fadeSec);
      await wait(fadeSec);
      if (mine !== token || music.playbackGeneration !== generation) return;
    }
    if (mine !== token) return;
    if (music.playbackGeneration === generation) music.stop();
    music.setGain(MUSIC.masterGain, 0);
    return;
  }

  if (context.state !== 'running') return;
  if (!music.ready) await music.load();
  if (mine !== token) return;
  if (context.state !== 'running') return;

  if (canReuseShell(music.activeSources, music.playbackRate, bed)) {
    bed = 'shell';
    if (music.gain !== MUSIC.masterGain) music.setGain(MUSIC.masterGain, fadeSec);
    return;
  }

  const generation = music.playbackGeneration;
  if (music.activeSources > 0) {
    if (fadeSec > 0 && music.gain > 0) {
      music.setGain(0, fadeSec);
      await wait(fadeSec);
      if (mine !== token || music.playbackGeneration !== generation) return;
    }
    if (music.playbackGeneration === generation) music.stop();
  }
  if (mine !== token) return;

  try {
    music.setGain(0, 0);
    music.start();
    music.setGain(MUSIC.masterGain, fadeSec);
    bed = 'shell';
  } catch {
    music.setGain(MUSIC.masterGain, 0);
  }
}

function wait(seconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, Math.max(0, seconds) * 1000);
  });
}
