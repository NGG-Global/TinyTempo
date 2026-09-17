import Phaser from 'phaser';

import { breadcrumb, setErrorContext } from '@/core/errors';
import { Viewport } from '@/core/Viewport';

/**
 * Scene base class that owns the responsive layout lifecycle.
 *
 * Phaser hands a scene a fixed-size world on create and never mentions it
 * again. On mobile that is not enough: Android Chrome collapses its URL bar,
 * the on-screen keyboard opens, the device rotates, and the logical game size
 * changes underneath the scene. Subclasses therefore split scene setup in two:
 *
 * - {@link build} creates game objects. Called once.
 * - {@link layout} positions and sizes them. Called on create and again on
 *   every viewport change.
 *
 * Keeping the two apart means a resize never re-creates objects, and no scene
 * has to remember to subscribe to resize events or unsubscribe on shutdown.
 */
export abstract class BaseScene extends Phaser.Scene {
  /** Live layout frame. Valid from {@link build} onwards. */
  protected viewport!: Viewport;

  /**
   * Phaser lifecycle hook. Marked `final` by convention — subclasses override
   * {@link build} and {@link layout} instead, so the resize wiring below is
   * never accidentally dropped.
   */
  public create(): void {
    // Every scene passes through here, so the trail on a crash report reads as the
    // route the player took to reach it without a single call site saying so.
    breadcrumb('scene', { key: this.scene.key });
    setErrorContext('scene', this.scene.key);
    this.viewport = new Viewport(this.scale);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);

    this.build();
    this.layout();
  }

  /** Create game objects here. Runs once per scene start. */
  protected abstract build(): void;

  /**
   * Position and size game objects against `this.viewport`. Runs on create and
   * on every viewport change, so it must be idempotent and must not create
   * objects, register listeners, or start tweens.
   */
  protected abstract layout(): void;

  /**
   * Optional hook for work that must follow a resize but is not layout, such
   * as regenerating a texture at a new resolution.
   */
  protected onResize(): void {
    // Intentionally empty; subclasses may override.
  }

  private handleResize(): void {
    this.viewport.refresh();

    // The Scale Manager resizes the renderer, but scene cameras keep the size
    // they were created with. Without this, anything the camera clips or
    // centres — scroll bounds, `centerOn`, fades — uses stale dimensions.
    this.cameras.resize(this.viewport.width, this.viewport.height);

    this.layout();
    this.onResize();
  }

  private handleShutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
    // The Scale Manager outlives the scene, so an un-removed listener would
    // keep firing `layout()` against destroyed game objects.
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }
}
