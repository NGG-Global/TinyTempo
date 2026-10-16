import Phaser from 'phaser';

export interface Tap { readonly x: number; readonly y: number; readonly timestamp: number }

export interface TapInputOptions {
  /**
   * How many fingers may be down at once, each tapping for itself. One by default, so a
   * second finger on a menu cannot press a second button. A rhythm screen takes two: with
   * one, a thumb still down as the other lands was dropped without a word — exactly how a
   * sixteenth pair 110 ms apart gets played — and the player saw a Miss for a tap they made.
   * Holding still never repeats: a finger taps once on its way down and not again until up.
   */
  readonly pointers?: 1 | 2;
}

/** Phaser unifies mouse/touch. Preserve the native timestamp, not Pointer.downTime. */
export class TapInput {
  private readonly held = new Set<number>();
  private readonly pointers: number;
  public constructor(private readonly scene: Phaser.Scene, private readonly receive: (tap: Tap) => void, options: TapInputOptions = {}) {
    this.pointers = options.pointers ?? 1;
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.down, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.up, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.up, this);
    window.addEventListener('touchcancel', this.reset);
    window.addEventListener('pointercancel', this.reset);
    window.addEventListener('blur', this.reset);
  }
  private down(pointer: Phaser.Input.Pointer): void {
    if (this.held.has(pointer.id) || this.held.size >= this.pointers || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.held.add(pointer.id);
    this.receive({ x: pointer.x, y: pointer.y, timestamp: pointer.event.timeStamp });
  }
  private up(pointer: Phaser.Input.Pointer): void {
    this.held.delete(pointer.id);
  }
  public readonly reset = (): void => { this.held.clear(); };
  public dispose(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.down, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.up, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.up, this);
    window.removeEventListener('touchcancel', this.reset);
    window.removeEventListener('pointercancel', this.reset);
    window.removeEventListener('blur', this.reset);
    this.reset();
  }
}
