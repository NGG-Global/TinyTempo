import Phaser from 'phaser';
import { isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { samples } from '@/audio/samples';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { TapInput, type Tap } from '@/input/TapInput';
import { tutorialComplete } from '@/game/TutorialRun';
import { MaterialKey } from '@/textures/materials';
import { shade } from '@/ui/colour';
import { CHROME, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { drawGear } from '@/ui/gear';
import { drawPlay, drawSpeaker } from '@/ui/icons';
import { faces } from '@/ui/light';
import { drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive, settle } from '@/ui/spring';
import { display, resize } from '@/ui/type';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';
import type { Vignette } from '@/vignettes/Vignette';

const MENU = {
  sign: { width: 560, height: 328, top: 110, ropeInset: 150 },
  /** Beats per second of the sign's tempo beads: the game's own 120 BPM. */
  beatHz: 2, dots: 4,
} as const;

/**
 * Title screen. Owns the first audio gesture: PLAY unlocks the shared AudioEngine and
 * loads the music before the map starts, so play begins on the same tap.
 *
 * The title is an object rather than a heading: a sign hung from the top edge on two
 * ropes, swinging as one rigid body about the ceiling. The action is a block sitting on
 * the bench, and the two utility controls are pucks. Nothing here is a column of text.
 */
export class MenuScene extends BaseScene {
  private illustration!: Vignette;
  private sign!: Phaser.GameObjects.Container;
  private ropes!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Graphics;
  private boardSurface!: Phaser.GameObjects.TileSprite;
  private beads!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private button!: Phaser.GameObjects.Graphics;
  private buttonSurface!: Phaser.GameObjects.TileSprite;
  private playLabel!: Phaser.GameObjects.Text;
  private tutorialButton!: Phaser.GameObjects.Graphics;
  private tutorialSurface!: Phaser.GameObjects.TileSprite;
  private tutorialLabel!: Phaser.GameObjects.Text;
  private tutorialRect = new Phaser.Geom.Rectangle();
  private pucks!: Phaser.GameObjects.Graphics;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private enteredAt = 0;
  private uiScale = 1;
  private ceilingY = 0;
  private buttonRect = new Phaser.Geom.Rectangle();
  private boardRect = new Phaser.Geom.Rectangle();
  private controlSize = 96;
  private muteAt = { x: 0, y: 0 };
  private setupAt = { x: 0, y: 0 };
  private beadRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private pressedAt = -Infinity;
  private pressDirty = false;
  private puckPressed: 'mute' | 'setup' | null = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  private muted = false;
  private busy = false;
  private disposed = false;
  private request = 0;

  public constructor() { super(SceneKey.Menu); }

  protected override build(): void {
    this.disposed = false;
    this.busy = false;
    this.pressedAt = this.puckPressedAt = -Infinity;
    this.puckPressed = null;
    this.muted = isMuted(this);
    // The hammer's idle sway doubles as the title illustration; it never receives a plan.
    this.illustration = new HammerNailVignette(this, true);

    this.sign = this.add.container(0, 0);
    this.ropes = this.add.graphics();
    this.board = this.add.graphics();
    this.boardSurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.wood, 0.7);
    this.beads = this.add.graphics();
    this.headline = display(this, 'Tiny\nTempo', { size: 82, colour: SHELL.cream, align: 'center' }).setOrigin(0.5, 0);
    this.sign.add([this.ropes, this.board, this.boardSurface, this.beads, this.headline]);

    this.button = this.add.graphics();
    this.buttonSurface = surface(this, MaterialKey.cloth, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, PALETTE.coral, 0.35);
    this.playLabel = display(this, 'Play', { size: 40, colour: SHELL.cream, align: 'center' }).setOrigin(0.5);
    this.tutorialButton = this.add.graphics();
    this.tutorialSurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.wood, 0.7);
    this.tutorialLabel = display(this, 'How to play', { size: 32, colour: SHELL.cream, align: 'center' }).setOrigin(0.5);
    this.pucks = this.add.graphics();

    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.enteredAt = performance.now() / 1000;
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    this.illustration.layout(this.viewport);
    const s = this.uiScale = Math.min(safe.width / 720, safe.height / 1150);

    // The sign. Local space has its origin at the ceiling anchor so the whole object
    // swings about the point it hangs from.
    this.ceilingY = full.y - 4 * s;
    const ropeLength = safe.top + MENU.sign.top * s - this.ceilingY;
    const w = MENU.sign.width * s, h = MENU.sign.height * s;
    this.boardRect.setTo(-w / 2, ropeLength, w, h);
    this.sign.setPosition(safe.centerX, this.ceilingY);
    this.ropes.clear();
    drawRopes(this.ropes, s, ropeLength, [-MENU.sign.ropeInset * s, MENU.sign.ropeInset * s], 9);
    this.board.clear();
    drawPanel(this.board, this.boardRect, s, { fill: SHELL.wood, depth: 14, hero: true });
    placeSurface(this.boardSurface, this.boardRect, s);
    // Pack from the inner face so the two-line title cannot sit on the tempo beads.
    const facePad = 32 * s;
    resize(this.headline, 82 * s, SHELL.cream);
    this.headline.setLineSpacing(-8 * s).setPosition(0, this.boardRect.y + facePad);
    this.beadRow = {
      x: -1.5 * 34 * s,
      y: this.boardRect.bottom - facePad - 8 * s,
      gap: 34 * s,
      radius: 6 * s,
    };

    // Utility pucks, top right, inside the safe frame and clear of the sign's swing.
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    // Both pucks stay right of the sign's ropes even at full swing.
    this.muteAt = { x: safe.right - 56 * s, y: safe.top + 66 * s };
    this.setupAt = { x: this.muteAt.x - Math.max(88 * s, this.controlSize + 4 * s), y: this.muteAt.y };
    this.drawPucks(s, 0);
    this.puckDirty = true;

    // The block sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(CHROME.block.height * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - CHROME.block.width * s / 2, safe.bottom - CHROME.block.fromBottom * s - height, CHROME.block.width * s, height);
    this.drawButton(0, s);
    resize(this.playLabel, 40 * s, SHELL.cream);
    this.tutorialRect.setTo(safe.centerX - 200 * s, this.buttonRect.y - this.controlSize - 24 * s, 400 * s, this.controlSize);
    drawPanel(this.tutorialButton.clear(), this.tutorialRect, s, { fill: SHELL.wood, depth: 8 });
    placeSurface(this.tutorialSurface, this.tutorialRect, s);
    this.tutorialLabel.setPosition(this.tutorialRect.centerX, this.tutorialRect.centerY);
    resize(this.tutorialLabel, 32 * s, SHELL.cream);
  }

  private drawPucks(s: number, press: number): void {
    const g = this.pucks.clear();
    const sinkOf = (key: 'mute' | 'setup') => (this.puckPressed === key ? press : 0);
    drawPuck(g, this.muteAt.x, this.muteAt.y, s, sinkOf('mute'));
    drawPuck(g, this.setupAt.x, this.setupAt.y, s, sinkOf('setup'));
    const r = CHROME.puckRadius * s;
    drawSpeaker(g, this.muteAt.x, this.muteAt.y + puckSink(s, sinkOf('mute')), r * 0.5, PALETTE.ink, this.muted);
    drawGear(g, this.setupAt.x, this.setupAt.y + puckSink(s, sinkOf('setup')), r * 0.52, PALETTE.ink, 1);
  }

  /** The block sinks on the tap and springs back: one press, one rebound, then still. */
  private drawButton(press: number, s: number): void {
    const g = this.button.clear();
    const r = this.buttonRect;
    drawPanel(g, r, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press, hero: true });
    const sink = CHROME.block.depth * s * press * 0.8;
    placeSurface(this.buttonSurface, r, s, sink);
    const labelX = r.centerX + 22 * s;
    this.playLabel.setPosition(labelX, r.centerY + sink);
    const iconX = labelX - this.playLabel.displayWidth / 2 - 34 * s;
    g.fillStyle(0x000000, 0.18).fillCircle(iconX, r.centerY + sink, 22 * s);
    drawPlay(g, iconX + 2 * s, r.centerY + sink, 12 * s, SHELL.cream);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    this.illustration.update(now);
    const s = this.uiScale;
    const t = STYLE.current;
    const still = reducedMotion();
    const age = now - this.enteredAt;

    // The sign drops in on its ropes and swings itself quiet; at rest it drifts a little.
    const entry = still ? { rise: 0, alpha: 1 } : arrive(age - 0.1, 0.9);
    const swing = still ? 0 : settle(age - 0.3, 5.2, 1.6) * 0.06 * t.exaggeration + Math.sin(now * 0.7) * 0.012 * t.exaggeration;
    this.sign.setPosition(this.viewport.safe.centerX, this.ceilingY - entry.rise * 260 * s).setRotation(swing).setAlpha(entry.alpha);

    const press = pressAmount(now, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      this.drawButton(Math.max(0, press), s);
      // One last frame at rest, then stop: the block is otherwise static geometry.
      this.pressDirty = press > 0.001;
    }
    const puckPress = pressAmount(now, this.puckPressedAt);
    if (puckPress > 0.001 || this.puckDirty) {
      this.drawPucks(s, Math.max(0, puckPress));
      this.puckDirty = puckPress > 0.001;
      if (!this.puckDirty) this.puckPressed = null;
    }

    // Four beads on the game's own pulse: the sign says what the game is before the copy does.
    const g = this.beads.clear();
    const beat = still ? 0 : Math.floor(now * MENU.beatHz) % MENU.dots;
    const phase = still ? 0 : (now * MENU.beatHz) % 1;
    for (let i = 0; i < MENU.dots; i++) {
      const lit = still ? i === 0 : i === beat;
      const grow = lit ? 1 + (1 - phase) ** 2 * 0.7 * t.exaggeration : 1;
      const colour = lit ? PALETTE.coral : shade(SHELL.wood, -0.25);
      const f = faces(colour);
      const x = this.beadRow.x + i * this.beadRow.gap, r = this.beadRow.radius * grow;
      g.fillStyle(f.edge, 1).fillCircle(x, this.beadRow.y + 2.5 * s, r);
      g.fillStyle(f.face, 1).fillCircle(x, this.beadRow.y, r);
      g.fillStyle(f.rim, 0.8).fillCircle(x - r * 0.3, this.beadRow.y - r * 0.35, r * 0.3);
    }
  }

  private handleTap(tap: Tap): void {
    if (this.curtain.active || this.busy) return;
    const half = this.controlSize / 2;
    if (Math.abs(tap.x - this.muteAt.x) < half && Math.abs(tap.y - this.muteAt.y) < half) {
      this.muted = toggleMute(sharedAudio(this));
      this.puckPressed = 'mute';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      return;
    }
    if (Math.abs(tap.x - this.setupAt.x) < half && Math.abs(tap.y - this.setupAt.y) < half) {
      this.puckPressed = 'setup';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: SceneKey.Menu }));
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.buttonRect, tap.x, tap.y)) {
      this.pressedAt = performance.now() / 1000;
      this.pressDirty = true;
      void this.play();
    }
    if (Phaser.Geom.Rectangle.Contains(this.tutorialRect, tap.x, tap.y)) void this.play(true);
  }
  private async play(tutorial = false): Promise<void> {
    if (this.busy) return;
    const request = ++this.request;
    this.busy = true;
    this.playLabel.setText('…');
    try {
      const audio = sharedAudio(this);
      await audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.playLabel.setText('…');
      await audio.music.load();
      if (this.disposed || request !== this.request) return;
      // Warmed here and awaited where it is used. The map is several taps from a level,
      // which is long enough to decode 180 KB without anyone waiting on it.
      void samples.load(audio.context);
      this.playLabel.setText('Play');
      const needsTutorial = tutorial || !(this.registry.get('tutorial-complete') || tutorialComplete());
      this.curtain.cover(() => this.scene.start(needsTutorial ? SceneKey.Tutorial : SceneKey.Map));
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.playLabel.setText('Retry');
      console.error('Unable to prepare music', error);
    }
  }
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.request;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.taps.dispose();
    this.illustration.destroy();
  }
}
