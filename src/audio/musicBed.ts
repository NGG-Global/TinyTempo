import { MUSIC, type TrackId } from '../config/music';
import type { AudioEngine } from './AudioEngine';

/**
 * Which loop is supposed to be audible.
 *
 * The bed is which *job* the gameplay loop is doing: the shell on settings and the map;
 * the level's own source, started on a downbeat PlayScene owns; or silence, so tap
 * offset can hear its metronome. The title screen has a second track and does not use
 * this. Scenes name the bed, and a shell scene also names the track it wants — the
 * frontier's chapter — so a return to the map after a level from another chapter fades
 * that level's track out and starts the road's. Starting a second source without going
 * through here is how the menu and a leftover level overlap.
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
 * Whether an already-running source can stay on as the shell bed. The wanted track, rate
 * 1, already the shell: starting again would cut the loop for nothing, and is also how two
 * overlapping starts used to stack when a scene raced the previous fade. A leftover level
 * from another chapter is not the shell, however smoothly it is running.
 */
export function canReuseShell(activeSources: number, playbackRate: number, current: MusicBed, sameTrack = true): boolean {
  return current !== 'silent' && activeSources > 0 && playbackRate === 1 && sameTrack;
}

/**
 * Switch the shared loop to a bed. `level` only records the mood — PlayScene has to
 * start the source on a future downbeat it will judge against, so this must not steal
 * that start. `silent` and `shell` own the source. `track` names what the shell should
 * play; left out, the shell keeps the track that is loaded.
 */
export async function setMusicBed(
  engine: MusicHost,
  next: MusicBed,
  options?: { fadeSec?: number; track?: TrackId },
): Promise<void> {
  const fadeSec = options?.fadeSec ?? (next === 'silent' ? 0 : MUSIC.bedFadeSec);
  const mine = ++token;
  const { music, context } = engine;

  if (next === 'level') {
    bed = 'level';
    // A hush may still be fading the bus toward zero — the map's `openLevel` fades over
    // `bedFadeSec`, and under reduced motion the curtain is quicker than that fade — and
    // its early return below deliberately leaves the gain where it found it, since the
    // source that superseded it owns the mix now. That source is this level's, started a
    // moment ago by PlayScene, which never touches the bus; so the level takes the gain
    // back here, or it plays its whole run with the stems and the metronome at zero.
    if (music.gain === 0) music.setGain(music.trackGain, 0);
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
    music.setGain(music.trackGain, 0);
    return;
  }

  if (context.state !== 'running') return;
  const track = options?.track ?? music.selectedTrack;
  const sameTrack = music.trackId === track;

  if (sameTrack && music.ready && canReuseShell(music.activeSources, music.playbackRate, bed, sameTrack)) {
    bed = 'shell';
    if (music.gain !== music.trackGain) music.setGain(music.trackGain, fadeSec);
    // A leftover level's sources carry the level's mix: the stems it had earned and the
    // metronome bar under them. The shell hears every stem and no click, so the road after
    // a level is the same room as the road before it.
    if (music.activeLayers < music.stemCount) music.setLayers(music.stemCount, context.currentTime, fadeSec);
    music.stopMetronome();
    return;
  }

  // Whatever is running — the other chapter's loop, or this one at a level's tempo — goes
  // out under the fade before the next source starts; only then is a different track
  // fetched, so the old loop is released before the new decode is held.
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
    if (!sameTrack || !music.ready) await music.load(track);
    if (mine !== token) return;
    if (context.state !== 'running') return;
    music.setGain(0, 0);
    music.start();
    music.setGain(music.trackGain, fadeSec);
    bed = 'shell';
  } catch {
    music.setGain(music.trackGain, 0);
  }
}

function wait(seconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, Math.max(0, seconds) * 1000);
  });
}
