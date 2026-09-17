import Phaser from 'phaser';
import { applyCalibration, currentAudio, sharedAudio } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { CalibrationRun, CALIBRATION } from '@/game/CalibrationRun';
import { CALIBRATION_TAPS, loadSettings } from '@/game/settings';
import { TapInput, type Tap } from '@/input/TapInput';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { drawBack } from '@/ui/icons';
import { faces } from '@/ui/light';
import { drawPanel, BRASS } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';

/** Design-unit metrics for the one measurement this screen makes. */
const TUNE = {
  countHeight: 300,
  countWidth: 432,
  beadGap: 76,
  beadRadius: 20,
  resultHeight: 132,
} as const;

type Phase = 'idle' | 'counting' | 'measured' | 'failed';
interface Button { readonly rect: Phaser.Geom.Rectangle; readonly text: Phaser.GameObjects.Text; readonly hero: boolean }

/**
 * Tap offset, on its own screen.
 *
 * It used to be the first row of Settings: a value, a button and four beads on a 118-unit
 * card, with the whole settings list still competing for the eye while the player was
 * being asked to hold a beat for sixteen seconds. Measuring latency is the one thing in
 * the game that needs the screen to itself, so it has it, and Settings keeps the result.
 *
 * The measurement is a *residual* against the offset already in force, so running it twice
 * refines the first result rather than starting over. `CalibrationRun` owns that maths;
 * this scene owns the screen and the audio.
 */
export class CalibrateScene extends BaseScene {
  private backdrop!: Backdrop;
  private plates!: Phaser.GameObjects.Graphics;
  private controls!: Phaser.GameObjects.Graphics;
  private beats!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private instruction!: Phaser.GameObjects.Text;
  private counted!: Phaser.GameObjects.Text;
  private countedOf!: Phaser.GameObjects.Text;
  private countedNote!: Phaser.GameObjects.Text;
  private current!: Phaser.GameObjects.Text;
  private resultNote!: Phaser.GameObjects.Text;
  private resultValue!: Phaser.GameObjects.Text;
  private backMark!: Phaser.GameObjects.Graphics;
  private buttons: Record<'run' | 'keep' | 'retry', Button> = null!;
  private backAt = { x: 0, y: 0 };
  private backRect = new Phaser.Geom.Rectangle();
  private countRect = new Phaser.Geom.Rectangle();
  private resultRect = new Phaser.Geom.Rectangle();
  private beadRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private phase: Phase = 'idle';
  private calibrationMs = 0;
  private measuredMs: number | null = null;
  private run: CalibrationRun | null = null;
  private pressedAt = -Infinity;
  private pressed: Button | 'back' | null = null;
  private pressDirty = false;
  private enteredAt = 0;
  private headlineAt = { x: 0, y: 0 };
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Calibrate); }

  protected override build(): void {
    this.phase = 'idle';
    this.run = null;
    this.measuredMs = null;
    this.pressed = null;
    this.pressedAt = -Infinity;
    this.calibrationMs = loadSettings().calibrationMs;
    this.enteredAt = performance.now() / 1000;
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.3, y: 0.2 }, glowAlpha: 0.6 });
    this.plates = this.add.graphics();
    this.controls = this.add.graphics().setDepth(2);
    this.beats = this.add.graphics().setDepth(2);
    this.backMark = this.add.graphics().setDepth(3);
    this.headline = display(this, 'Tap offset', { size: 56, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(1);
    this.instruction = body(this, 'Tap anywhere on every beat. Eight taps and the workshop knows your device.', {
      size: 30, colour: PALETTE.muted, align: 'center',
    }).setOrigin(0.5, 0).setDepth(1);
    this.counted = display(this, '', { size: 132, colour: PALETTE.ink }).setOrigin(1, 0.5).setDepth(1);
    this.countedOf = display(this, `/${CALIBRATION_TAPS}`, { size: 62, colour: PALETTE.muted }).setOrigin(0, 0.5).setDepth(1);
    this.countedNote = label(this, 'Taps landed', { size: 22, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(1);
    this.current = body(this, '', { size: 27, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(1);
    this.resultNote = label(this, 'After eight taps', { size: 19, colour: PALETTE.muted }).setOrigin(0, 0.5).setDepth(3);
    this.resultValue = display(this, '', { size: 38, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(3);
    this.buttons = {
      run: this.button('Start', true, 48),
      keep: this.button('Keep', false, 24),
      retry: this.button('Retry', false, 24),
    };
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.refreshCopy();
  }

  private button(caption: string, hero: boolean, size: number): Button {
    const text = hero
      ? display(this, caption, { size, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(3)
      : label(this, caption, { size, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(3);
    return { rect: new Phaser.Geom.Rectangle(), text, hero };
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1200);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const left = safe.centerX - 322 * s;
    const width = 644 * s;
    // Header: the same puck-and-title pair Settings uses, so back is in one place.
    this.backAt = { x: left + CHROME.puckRadius * s, y: safe.top + 66 * s };
    this.backRect.setTo(this.backAt.x - control / 2, this.backAt.y - control / 2, control, control);
    resize(this.headline, 56 * s, PALETTE.ink);
    this.headlineAt = { x: this.backAt.x + (CHROME.puckRadius + 26) * s, y: this.backAt.y };
    this.headline.setPosition(this.headlineAt.x, this.headlineAt.y);

    // Start and the result share the footer: the run button is the thing to press until
    // there is a measurement, and then the measurement is. Only one is ever on screen, so
    // the screen never carries an empty strip where the other one will be.
    const heroH = Math.max(112 * s, control);
    const resultH = Math.max(TUNE.resultHeight * s, control + 44 * s);
    const footerBottom = safe.bottom - 56 * s;
    this.resultRect.setTo(left, footerBottom - resultH, width, resultH);
    this.buttons.run.rect.setTo(left, footerBottom - heroH, width, heroH);

    // Everything between the title and the footer belongs to the measurement.
    const bandTop = safe.top + 132 * s;
    const bandBottom = footerBottom - Math.max(heroH, resultH) - 32 * s;
    const centre = (bandTop + bandBottom) / 2;
    this.instruction.setWordWrapWidth(Math.min(520 * s, width), false);
    resize(this.instruction, 30 * s, PALETTE.muted, STYLE.current, false);
    this.instruction.setPosition(safe.centerX, bandTop);
    this.beadRow = {
      x: safe.centerX - 1.5 * TUNE.beadGap * s, y: centre - TUNE.countHeight * s / 2 - 44 * s,
      gap: TUNE.beadGap * s, radius: TUNE.beadRadius * s,
    };
    this.countRect.setTo(
      safe.centerX - TUNE.countWidth * s / 2, centre - TUNE.countHeight * s / 2,
      TUNE.countWidth * s, TUNE.countHeight * s,
    );
    // Flat, not dressed: at this size the headline's outline turns a reading into a logo,
    // and the card behind it is already doing the work of setting it off the paper.
    resize(this.counted, 132 * s, PALETTE.ink);
    resize(this.countedOf, 62 * s, PALETTE.muted, STYLE.current, false);
    const span = this.counted.width + this.countedOf.width;
    const countY = this.countRect.centerY - 12 * s;
    this.counted.setPosition(this.countRect.centerX - span / 2 + this.counted.width, countY);
    this.countedOf.setPosition(this.counted.x, countY + 14 * s);
    resize(this.countedNote, 22 * s, PALETTE.muted, STYLE.current, false);
    this.countedNote.setPosition(this.countRect.centerX, this.countRect.bottom - 36 * s);
    resize(this.current, 27 * s, PALETTE.muted, STYLE.current, false);
    this.current.setPosition(safe.centerX, this.countRect.bottom + 40 * s);

    // The two small controls sit inside the result strip, right-aligned.
    const smallW = Math.max(152 * s, control);
    const smallH = Math.max(88 * s, control);
    const smallY = this.resultRect.centerY - smallH / 2;
    this.buttons.retry.rect.setTo(this.resultRect.right - 20 * s - smallW, smallY, smallW, smallH);
    this.buttons.keep.rect.setTo(this.buttons.retry.rect.x - 12 * s - smallW, smallY, smallW, smallH);
    this.resultNote.setPosition(this.resultRect.x + 26 * s, this.resultRect.centerY - 24 * s);
    resize(this.resultNote, 19 * s, PALETTE.muted, STYLE.current, false);
    this.resultValue.setPosition(this.resultRect.x + 26 * s, this.resultRect.centerY + 18 * s);
    resize(this.resultValue, 38 * s, PALETTE.ink);

    this.drawPlates();
    this.drawControls(0);
    this.pressDirty = true;
  }

  /** The count card bakes once; only the beads and the pressed control redraw. */
  private drawPlates(): void {
    const s = this.uiScale;
    const g = this.plates.clear();
    drawPanel(g, this.countRect, s, { fill: SHELL.cream, depth: 12, hero: true, radius: 40 });
  }

  private drawControls(press: number): void {
    const s = this.uiScale;
    const g = this.controls.clear();
    const measured = this.phase === 'measured' || this.phase === 'failed';
    drawPuck(g, this.backAt.x, this.backAt.y, s, this.pressed === 'back' ? press : 0);
    this.backMark.clear();
    drawBack(this.backMark, this.backAt.x, this.backAt.y + puckSink(s, this.pressed === 'back' ? press : 0),
      CHROME.puckRadius * s * 0.44, PALETTE.ink);
    // The result strip is a dashed tray rather than another slab: it is a decision to make,
    // not a surface to press, and its two controls are the things that read as raised.
    this.resultNote.setVisible(measured);
    this.resultValue.setVisible(measured);
    if (measured) {
      const r = this.resultRect;
      const radius = 28 * s;
      g.fillStyle(SHELL.puck, 1).fillRoundedRect(r.x, r.y, r.width, r.height, radius);
      g.lineStyle(STYLE.current.outline * s * 0.4, shade(SHELL.puck, -0.4), 1).strokeRoundedRect(r.x, r.y, r.width, r.height, radius);
      g.lineStyle(2 * s, BRASS, 0.5).strokeRoundedRect(r.x + 7 * s, r.y + 7 * s, r.width - 14 * s, r.height - 14 * s, radius - 7 * s);
    }
    for (const [name, button] of Object.entries(this.buttons)) {
      const shown = name === 'run' ? !measured : measured && (name === 'retry' || this.phase === 'measured');
      button.text.setVisible(shown);
      if (!shown) continue;
      const p = this.pressed === button ? press : 0;
      const depth = button.hero ? CHROME.block.depth : 10;
      drawPanel(g, button.rect, s, {
        fill: button.hero ? PALETTE.coral : name === 'keep' ? SHELL.cream : SHELL.bench,
        depth, press: p, hero: button.hero,
        radius: Math.min(button.rect.height / 2, STYLE.current.radius * 1.4),
      });
      const size = button.hero ? 48 * s : 24 * s;
      resize(button.text, size, button.hero ? SHELL.cream : PALETTE.ink, STYLE.current, button.hero);
      button.text.setPosition(button.rect.centerX, button.rect.centerY + depth * s * p * 0.8);
    }
  }

  private refreshCopy(): void {
    const measured = this.phase === 'measured' || this.phase === 'failed';
    this.counted.setText(String(this.run?.count ?? (measured ? CALIBRATION_TAPS : 0)));
    this.countedNote.setText(this.phase === 'counting' ? 'Taps landed' : 'Tap on the beat');
    this.current.setText(`Currently ${formatOffset(this.calibrationMs)}`);
    this.buttons.run.text.setText(this.phase === 'counting' ? 'Stop' : 'Start');
    this.resultNote.setText(this.phase === 'failed' ? 'Measurement unclear' : 'After eight taps');
    this.resultValue.setText(this.phase === 'failed' ? 'Try it again' : formatOffset(this.measuredMs ?? this.calibrationMs));
    this.drawControls(0);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    const press = pressAmount(now, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      this.drawControls(press);
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    }
    const age = now - this.enteredAt;
    if (age < 1.1) {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(age, 0.7);
      this.headline.setPosition(this.headlineAt.x, this.headlineAt.y + rise * 30 * this.uiScale).setAlpha(alpha);
    }
    this.drawBeats();
  }

  /** Four beads on the count-in's own pulse, so the beat can be seen before it is heard. */
  private drawBeats(): void {
    if (this.phase !== 'counting') { this.beats.clear(); return; }
    const audio = currentAudio(this);
    if (!audio || !this.run) return;
    const g = this.beats.clear();
    const s = this.uiScale;
    const elapsed = this.run.beatAt(audio.context.currentTime);
    const beat = Math.floor(Math.max(0, elapsed));
    const phase = Math.max(0, elapsed) % 1;
    const still = this.reducedMotion;
    for (let i = 0; i < 4; i++) {
      const lit = i === beat % 4;
      const grow = lit && !still ? 1 + (1 - phase) ** 2 * 0.7 * STYLE.current.exaggeration : 1;
      const f = faces(lit ? PALETTE.coral : shade(SHELL.puck, -0.3));
      const x = this.beadRow.x + i * this.beadRow.gap, r = this.beadRow.radius * grow;
      g.fillStyle(f.edge, 1).fillCircle(x, this.beadRow.y + 3 * s, r);
      g.fillStyle(f.face, 1).fillCircle(x, this.beadRow.y, r);
      g.fillStyle(f.rim, 0.8).fillCircle(x - r * 0.3, this.beadRow.y - r * 0.35, r * 0.3);
    }
    if (audio.context.currentTime > this.run.end) this.finish();
  }

  /** Anywhere on the screen is a beat while counting; only the controls opt out. */
  private handleTap(tap: Tap): void {
    if (this.curtain.active) return;
    if (this.phase === 'counting' && !Phaser.Geom.Rectangle.Contains(this.buttons.run.rect, tap.x, tap.y)
      && !Phaser.Geom.Rectangle.Contains(this.backRect, tap.x, tap.y)) {
      this.recordTap(tap);
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.backRect, tap.x, tap.y)) {
      this.press('back');
      this.leave();
      return;
    }
    for (const [name, button] of Object.entries(this.buttons)) {
      if (!button.text.visible || !Phaser.Geom.Rectangle.Contains(button.rect, tap.x, tap.y)) continue;
      this.press(button);
      if (name === 'run') void this.runTapped();
      else if (name === 'keep') this.keep();
      else this.retry();
      return;
    }
  }

  private press(target: Button | 'back'): void {
    this.pressedAt = performance.now() / 1000;
    this.pressed = target;
    this.pressDirty = true;
    vibrate('tap');
  }

  private async runTapped(): Promise<void> {
    if (this.phase === 'counting') { this.finish(); return; }
    await this.start();
  }

  private async start(): Promise<void> {
    const audio = sharedAudio(this);
    try {
      // This tap is the gesture, so a player who reached settings before ever pressing
      // PLAY can still calibrate.
      await audio.unlock();
    } catch {
      this.phase = 'failed';
      this.measuredMs = null;
      this.refreshCopy();
      return;
    }
    audio.clock.refresh();
    this.phase = 'counting';
    this.measuredMs = null;
    this.run = new CalibrationRun(audio.context.currentTime + CALIBRATION.startLeadSec, this.calibrationMs);
    for (let beat = 0; beat < CALIBRATION.leadBeats + CALIBRATION.measureBeats; beat++) {
      audio.play(this.run.origin + beat * this.run.period, beat % 4 === 0 ? 'ready' : 'count');
    }
    this.refreshCopy();
  }

  private recordTap(tap: Tap): void {
    const audio = currentAudio(this);
    if (!audio || !this.run) return;
    audio.clock.refresh();
    const at = audio.clock.input(tap.timestamp);
    if (!this.run.tap(at)) return;
    vibrate('hit');
    if (this.run.complete) this.finish();
    else this.refreshCopy();
  }

  private finish(): void {
    currentAudio(this)?.cancel();
    const measured = this.run?.result() ?? null;
    this.run = null;
    this.measuredMs = measured;
    this.phase = measured === null ? 'failed' : 'measured';
    this.refreshCopy();
  }

  private keep(): void {
    if (this.measuredMs === null) return;
    this.calibrationMs = this.measuredMs;
    applyCalibration(sharedAudio(this), this.measuredMs);
    vibrate('stamp');
    this.measuredMs = null;
    this.phase = 'idle';
    this.refreshCopy();
    this.leave();
  }

  private retry(): void {
    this.measuredMs = null;
    this.phase = 'idle';
    this.refreshCopy();
    void this.start();
  }

  private leave(): void {
    if (this.curtain.active) return;
    currentAudio(this)?.cancel();
    this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: this.enteredFrom() }));
  }

  /** Settings is always the way back; it remembers where the player came from itself. */
  private enteredFrom(): string {
    const data = this.sys.settings.data as { from?: string } | undefined;
    return data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
  }

  private shutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    currentAudio(this)?.cancel();
    this.taps.dispose();
    this.backdrop.destroy();
  }
}

/** A typographic minus, to match the rest of the game's type rather than a hyphen. */
export function formatOffset(ms: number): string {
  return `${ms > 0 ? '+' : ''}${String(Math.round(ms)).replace('-', '−')} ms`;
}
