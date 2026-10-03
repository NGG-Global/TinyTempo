import Phaser from 'phaser';
import { AudioEngine } from './AudioEngine';
import { loadSettings, saveSettings, withVolume, type Settings, type VolumeBus } from '../game/settings';
import { clearActiveCalibration, saveActiveCalibration, syncClockCalibration } from './audioRoute';
import { setMusicBed } from './musicBed';
import { MUSIC, type TrackId } from '../config/music';
import { loadProgress } from '../game/progress';
import { trackForLevel } from '../game/musicSelection';

const KEY = 'audio';

/**
 * One AudioEngine for the whole game, held in the registry so the menu can unlock it
 * inside the PLAY gesture and the play scene can start immediately without a second tap.
 * The loop is one source, switched by `musicBed` between the shell, a level and silence;
 * only game destruction disposes the context.
 */
export function sharedAudio(scene: Phaser.Scene): AudioEngine {
  const existing = currentAudio(scene);
  if (existing) return existing;
  const engine = new AudioEngine();
  // The composition point, rather than the engine or the clock, is where a stored setting
  // belongs: neither of those should know that storage exists.
  const settings = loadSettings();
  // The active route's offset. An engine is made before any plan, so this is a boundary.
  syncClockCalibration(engine.clock);
  applyMix(engine, settings);
  scene.registry.set(KEY, engine);
  scene.game.events.once(Phaser.Core.Events.DESTROY, () => { engine.dispose(); scene.registry.remove(KEY); });
  return engine;
}

export function currentAudio(scene: Phaser.Scene): AudioEngine | null {
  const engine: unknown = scene.registry.get(KEY);
  return engine instanceof AudioEngine ? engine : null;
}

/**
 * Whether the speaker glyph should read as silent. The menu can be on screen with no
 * AudioContext yet — it is created by the PLAY gesture — so the setting, not the engine,
 * is what a control reads first. Both levels at zero are silent even when the mute is off.
 */
export function outputSilent(scene: Phaser.Scene): boolean {
  const engine = currentAudio(scene);
  if (engine) return engine.silent;
  const settings = loadSettings();
  return settings.muted || (settings.music === 0 && settings.sfx === 0);
}

/** Puts the stored levels, and the mute, onto a live engine. Does not write the save. */
export function applyMix(engine: AudioEngine, settings: Pick<Settings, 'music' | 'sfx' | 'muted'>): void {
  engine.setMusicVolume(settings.music);
  engine.setSfxVolume(settings.sfx);
  if (engine.muted !== settings.muted) engine.toggleMute();
}

/**
 * One level, persisted. Raising it while muted takes the mute off — see `withVolume` —
 * so the player hears the level they just set.
 */
export function setBusVolume(engine: AudioEngine | null, bus: VolumeBus, volume: number): Settings {
  const current = loadSettings();
  const next = withVolume(current, bus, volume);
  const changed = next.music !== current.music || next.sfx !== current.sfx || next.muted !== current.muted;
  if (engine && (changed || engine.musicVolume !== next.music || engine.sfxVolume !== next.sfx || engine.muted !== next.muted)) {
    applyMix(engine, next);
  }
  if (changed) saveSettings(next);
  return next;
}

/** Mute is a setting, not per-session state, so every toggle persists it. */
export function toggleMute(engine: AudioEngine): boolean {
  engine.toggleMute();
  saveSettings({ ...loadSettings(), muted: engine.muted });
  return engine.muted;
}

/**
 * Keeps a measured offset for the **active route only**, and puts it on the live clock when
 * there is one. Only screens that judge nothing call this — calibration and Settings — so
 * writing the clock here is never mid-phrase. Settings can reset the offset before PLAY has
 * ever created the engine; the save is still the source of truth for the next boot.
 */
export function applyCalibration(engine: AudioEngine | null, calibrationMs: number): boolean {
  const saved = saveActiveCalibration(calibrationMs);
  if (engine) syncClockCalibration(engine.clock);
  return saved;
}

/** The active route back to uncalibrated; every other route keeps its own measurement. */
export function resetCalibration(engine: AudioEngine | null): boolean {
  const saved = clearActiveCalibration();
  if (engine) syncClockCalibration(engine.clock);
  return saved;
}

/**
 * Shell scenes call this on create. No-ops until PLAY has unlocked the context. The
 * shell plays the frontier's chapter: the track the next new level will, so the road
 * and the level agree, and a replay from another chapter hands its track back here.
 */
export function ensureShellMusic(scene: Phaser.Scene): void {
  const audio = currentAudio(scene);
  // The road's screens never play the title theme: one that was carried from the title
  // screen into Settings fades out here, and a start still loading is cancelled.
  stopTheme(audio);
  if (!audio || audio.context.state !== 'running') return;
  void setMusicBed(audio, 'shell', { track: shellTrack() });
}

/**
 * The music a screen off the title screen or off the road plays: whichever it was opened
 * from. Settings, the Scrapbook and the pages under Settings keep the title theme when the
 * title screen opened them, and the gameplay loop when the road did — so the music says
 * where Back will take the player, and a trip into Settings from either never swaps one
 * track for the other and back again.
 */
export function ensureScreenMusic(scene: Phaser.Scene, openedFromTitle: boolean): void {
  if (openedFromTitle) void startTheme(sharedAudio(scene));
  else ensureShellMusic(scene);
}

/**
 * Bumped by every start and stop, so a start that is still waiting — on a resume, or on
 * the gameplay loop fading out under it — gives up if anything has asked for the theme to
 * stop meanwhile. Without it, opening Tap offset straight after Settings let Settings'
 * late start bring the theme up under the metronome.
 */
let themeRequest = 0;

export type ThemeHost = Pick<AudioEngine, 'theme' | 'context' | 'music'>;

/**
 * Play the title theme, carrying it on if it is already playing: `ThemeMusic.enter` does
 * nothing to a source that is running, which is what keeps the title screen's theme going,
 * uninterrupted, into Settings and the Scrapbook and back. The gameplay loop goes quiet
 * under it first, so the two never sound together.
 */
export async function startTheme(engine: ThemeHost): Promise<void> {
  const mine = ++themeRequest;
  if (engine.context.state !== 'running') {
    // Settled once the page has had a gesture, which the tap that opened this screen was.
    try { await engine.context.resume(); } catch { return; }
  }
  if (mine !== themeRequest || engine.context.state !== 'running') return;
  await setMusicBed(engine, 'silent', { fadeSec: MUSIC.bedFadeSec });
  if (mine !== themeRequest) return;
  await engine.theme.enter();
}

/** Fade the title theme out, and cancel a start that has not happened yet. */
export function stopTheme(engine: Pick<AudioEngine, 'theme'> | null): void {
  themeRequest++;
  engine?.theme.leave();
}

/** The gameplay track the shell plays: the frontier level's. */
export function shellTrack(): TrackId {
  return trackForLevel(loadProgress().unlocked);
}

/**
 * Tap offset, and the curtain into a level. `fadeSec` 0 is an immediate cut.
 * Resolves once the bed has actually stopped, so a caller that must not overlap it
 * — the title theme — can wait.
 */
export function hushMusic(scene: Phaser.Scene, fadeSec = 0): Promise<void> {
  const audio = currentAudio(scene);
  if (!audio) return Promise.resolve();
  return setMusicBed(audio, 'silent', { fadeSec });
}
