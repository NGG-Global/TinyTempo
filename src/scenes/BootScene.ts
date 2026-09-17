import Phaser from 'phaser';

import { SceneKey } from '@/config/scenes';
import { setHaptics } from '@/core/haptics';
import { isTouchPrimary, setOrientationPromptVisible } from '@/core/shell';
import { loadSettings } from '@/game/settings';

/**
 * First scene. Applies runtime input tuning and installs the orientation
 * guard, then hands over to {@link SceneKey.Preload}.
 *
 * Kept separate from asset loading so that anything which must be true before
 * the first byte is fetched happens in one obvious place.
 */
export class BootScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.Boot);
  }

  public create(): void {
    this.configureTouchInput();
    // Haptics are read once here rather than per pulse: a vibration fires on a judged tap,
    // which is the one place in the game that must not touch storage.
    setHaptics(loadSettings().haptics);
    this.installOrientationGuard();

    this.scene.start(SceneKey.Preload);
  }

  /**
   * Touch tuning that has no equivalent in the game config.
   *
   * A finger never holds still. Without a movement threshold, the tiny drift
   * during a tap registers as a drag, so taps and drags become impossible to
   * tell apart. 10 game units is below the noise floor of a deliberate gesture
   * but above digitiser jitter.
   */
  private configureTouchInput(): void {
    this.input.dragDistanceThreshold = 10;
  }

  /**
   * Shows the "rotate your device" prompt while a touch device is held in
   * landscape.
   *
   * The Screen Orientation API can only lock orientation from fullscreen on
   * Android, and entering fullscreen requires a user gesture — so a portrait
   * game on the web has to ask rather than enforce. A native build declares
   * the lock in its manifest instead and never shows this.
   */
  private installOrientationGuard(): void {
    const update = (): void => {
      setOrientationPromptVisible(isTouchPrimary() && this.scale.isLandscape);
    };

    this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, update);
    // Rotation on Android does not always emit an orientation change before
    // the resize, so resize is treated as authoritative too.
    this.scale.on(Phaser.Scale.Events.RESIZE, update);

    // The guard is global for the lifetime of the game, so it is registered on
    // the game's event emitter rather than this scene's — Boot shuts down as
    // soon as it starts Preload.
    this.game.events.once(Phaser.Core.Events.DESTROY, () => {
      this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, update);
      this.scale.off(Phaser.Scale.Events.RESIZE, update);
    });

    update();
  }
}
