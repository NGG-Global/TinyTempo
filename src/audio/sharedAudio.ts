import Phaser from 'phaser';
import { AudioEngine } from './AudioEngine';
import { clampCalibration, loadSettings, saveSettings } from '../game/settings';
import { setMusicBed } from './musicBed';

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
  engine.clock.calibrationMs = settings.calibrationMs;
  if (settings.muted) engine.toggleMute();
  scene.registry.set(KEY, engine);
  scene.game.events.once(Phaser.Core.Events.DESTROY, () => { engine.dispose(); scene.registry.remove(KEY); });
  return engine;
}

export function currentAudio(scene: Phaser.Scene): AudioEngine | null {
  const engine: unknown = scene.registry.get(KEY);
  return engine instanceof AudioEngine ? engine : null;
}

/**
 * Mute before the engine exists. The menu can be on screen with no AudioContext yet — it is
 * created by the PLAY gesture — so the setting, not the engine, is what a control reads first.
 */
export function isMuted(scene: Phaser.Scene): boolean {
  return currentAudio(scene)?.muted ?? loadSettings().muted;
}

/** Mute is a setting, not per-session state, so every toggle persists it. */
export function toggleMute(engine: AudioEngine): boolean {
  engine.toggleMute();
  saveSettings({ ...loadSettings(), muted: engine.muted });
  return engine.muted;
}

/**
 * Applies a calibration offset to the live clock, when there is one, and persists it.
 * Settings can reset the offset before PLAY has ever created the engine; the save is
 * still the source of truth for the next boot.
 */
export function applyCalibration(engine: AudioEngine | null, calibrationMs: number): boolean {
  const value = clampCalibration(calibrationMs);
  if (engine) engine.clock.calibrationMs = value;
  return saveSettings({ ...loadSettings(), calibrationMs: value });
}

/** Shell scenes call this on create. No-ops until PLAY has unlocked the context. */
export function ensureShellMusic(scene: Phaser.Scene): void {
  const audio = currentAudio(scene);
  if (!audio || audio.context.state !== 'running') return;
  void setMusicBed(audio, 'shell');
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
