import Phaser from 'phaser';
import { applyCalibration, currentAudio, hushMusic, resetCalibration, sharedAudio, stopTheme } from '@/audio/sharedAudio';
import { activeCalibration, currentRoute, onRouteChange, syncClockCalibration } from '@/audio/audioRoute';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { CalibrationRun, CALIBRATION, type CalibrationVerdict } from '@/game/CalibrationRun';
import { formatOffset, instructionCopy, resultCopy } from '@/game/calibrationCopy';
import { track } from '@/monetization';
import { ROUTE_LABELS } from '@/game/routeCalibration';
import { CALIBRATION_TAPS } from '@/game/settings';
import { TapInput, type Tap } from '@/input/TapInput';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { drawBack } from '@/ui/icons';
import { drawPanel, BRASS } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive } from '@/ui/spring';
import { balanceWrap, body, display, label, resize, wrapWidth } from '@/ui/type';
import { drawCalibrationLane, type LaneFlash, type LaneTick } from '@/ui/calibrationLane';
import { drawStrikeCue, strikePose, strikeWord } from '@/ui/strikeCue';

/** Design-unit metrics for the one measurement this screen makes. */
/**
 * Past this, the platform's own reported lag is worth telling the player about.
 *
 * Wired output is a few tens of milliseconds and not worth a sentence. Bluetooth is a
 * fifth of a second, which is the difference between a rhythm game and a broken one — and
 * a player who has just been failing levels has no way to know that is why, or that this
 * screen is the answer.
 */
const WORTH_MENTIONING_MS = 80;

const TUNE = {
  countHeight: 480,
  countWidth: 432,
  /** Inside the count card: the strike ring's centre, the count-in word under it, and the count's centre. */
  ringTop: 150,
  cueTop: 224,
  countTop: 348,
  resultHeight: 132,
  laneHeight: 64,
  laneGap: 26,
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
 * refines the first result rather than starting over. Reset returns the active route to uncalibrated without a second
 * run, which is the only way back to an uncalibrated clock short of measuring the inverse.
 * Music is silent here so the metronome is the only beat. `CalibrationRun` owns the maths;
 * this scene owns the screen and the audio.
 *
 * **The beat can be seen coming** (`ui/strikeCue.ts`): a ball hops off a ring after every click
 * and lands on it with the next, with the count-in's words under it — *Listen*, 3, 2, 1,
 * *Tap!* — so the player knows when to strike before the first measured beat rather than
 * finding the pulse by ear while already being measured. The four beads it replaced lit on
 * each click and so said only where the beat had been.
 *
 * **The player sees where every tap lands** (`ui/calibrationLane.ts`): a lane under the count
 * with the beat at its centre drops a tick at each tap's residual as it happens, so early,
 * late and uneven are visible before the result says so, and a tap that fell outside the
 * window flashes the edge it fell past. The result names its reason — the taps' spread, too
 * few landed, too uneven — and what changed from the offset before. **Keep stays on the
 * screen**: a run after it is a check against the kept offset, which the residual design
 * makes free, and reads *Spot on* when the taps land within `CALIBRATION.spotOnMs`. The back
 * puck is the way out.
 */
export class CalibrateScene extends BaseScene {
  private backdrop!: Backdrop;
  private plates!: Phaser.GameObjects.Graphics;
  private controls!: Phaser.GameObjects.Graphics;
  private strike!: Phaser.GameObjects.Graphics;
  private cue!: Phaser.GameObjects.Text;
  private lane!: Phaser.GameObjects.Graphics;
  private laneEarly!: Phaser.GameObjects.Text;
  private laneLate!: Phaser.GameObjects.Text;
  private headline!: Phaser.GameObjects.Text;
  private instruction!: Phaser.GameObjects.Text;
  private counted!: Phaser.GameObjects.Text;
  private countedOf!: Phaser.GameObjects.Text;
  private countedNote!: Phaser.GameObjects.Text;
  private current!: Phaser.GameObjects.Text;
  private resultNote!: Phaser.GameObjects.Text;
  private resultValue!: Phaser.GameObjects.Text;
  private backMark!: Phaser.GameObjects.Graphics;
  private buttons: Record<'run' | 'keep' | 'retry' | 'reset', Button> = null!;
  private backAt = { x: 0, y: 0 };
  private backRect = new Phaser.Geom.Rectangle();
  private countRect = new Phaser.Geom.Rectangle();
  private laneRect = new Phaser.Geom.Rectangle();
  private resultRect = new Phaser.Geom.Rectangle();
  private strikeAt = { x: 0, y: 0 };
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private phase: Phase = 'idle';
  /** The active route's own measurement, or null: that route has never been calibrated. */
  private calibrated: number | null = null;
  /** What the clock subtracts on the active route: its measurement, or 0. Runs are residuals against it. */
  private calibrationMs = 0;
  private stopWatchingRoute: (() => void) | null = null;
  private measuredMs: number | null = null;
  /** What the last run found, for the result's reason and the analytics. */
  private verdict: CalibrationVerdict | null = null;
  /** The ticks on the lane: each landed tap's residual and when it landed, on the frame clock. */
  private ticks: { readonly residualMs: number; readonly at: number }[] = [];
  private flash: { readonly side: LaneFlash['side']; readonly at: number } | null = null;
  /** The offset kept this visit, if any: the next run checks it rather than measures afresh. */
  private kept: number | null = null;
  /** Whether the run in hand, or the result shown, is a check of a kept offset. */
  private checking = false;
  private run: CalibrationRun | null = null;
  private pressedAt = -Infinity;
  private pressed: Button | 'back' | null = null;
  private pressDirty = false;
  private enteredAt = 0;
  /** Set by shutdown: `start` awaits the unlock, and the player may have gone back meanwhile. */
  private disposed = false;
  private request = 0;
  private headlineAt = { x: 0, y: 0 };
  /** The instruction's wrap width, kept so a phase change re-balances the new words at the same room. */
  private instructionRoom = 0;
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Calibrate); }

  protected override build(): void {
    this.disposed = false;
    this.request += 1;
    this.phase = 'idle';
    this.run = null;
    this.measuredMs = null;
    this.verdict = null;
    this.ticks = [];
    this.flash = null;
    this.kept = null;
    this.checking = false;
    this.pressed = null;
    this.pressedAt = -Infinity;
    this.readRoute();
    // A run measures one route. If the route changes mid-run, or between a run and Keep,
    // the measurement belongs to the old one, so it is dropped rather than filed under the new.
    this.stopWatchingRoute = onRouteChange(() => this.routeChanged());
    this.enteredAt = performance.now() / 1000;
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.3, y: 0.2 }, glowAlpha: 0.6 });
    this.plates = this.add.graphics();
    this.controls = this.add.graphics().setDepth(2);
    this.strike = this.add.graphics().setDepth(2);
    this.cue = display(this, '', { size: 50, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5).setDepth(3).setVisible(false);
    this.lane = this.add.graphics().setDepth(2);
    this.laneEarly = label(this, 'EARLY', { size: 18, colour: PALETTE.muted, align: 'left' }).setOrigin(0, 0.5).setDepth(3);
    this.laneLate = label(this, 'LATE', { size: 18, colour: PALETTE.muted, align: 'right' }).setOrigin(1, 0.5).setDepth(3);
    this.backMark = this.add.graphics().setDepth(3);
    this.headline = display(this, 'Tap offset', { size: 56, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(1);
    this.instruction = body(this, instructionCopy('idle', false), {
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
      reset: this.button('Reset', false, 24),
    };
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.refreshCopy();
    // The metronome is the only pulse on this screen: leftover shell or level music
    // would be a second beat, and the measurement would chase it. The title theme too,
    // which Settings now carries when the title screen opened it.
    stopTheme(currentAudio(this));
    hushMusic(this);
  }

  /** The active route's offset, and the live clock put on it: this screen judges nothing, so any time is a boundary. */
  private readRoute(): void {
    this.calibrated = activeCalibration();
    this.calibrationMs = this.calibrated ?? 0;
    const audio = currentAudio(this);
    if (audio) syncClockCalibration(audio.clock);
  }

  private routeChanged(): void {
    if (this.phase === 'counting') currentAudio(this)?.cancel();
    this.run = null;
    this.measuredMs = null;
    this.verdict = null;
    this.ticks = [];
    this.flash = null;
    this.kept = null;
    this.checking = false;
    this.phase = 'idle';
    this.readRoute();
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
    const s = Math.min(safe.width / 720, safe.height / 1150);
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
    resize(this.instruction, 30 * s, PALETTE.muted, STYLE.current, false);
    this.instructionRoom = Math.min(520 * s, width);
    balanceWrap(this.instruction, this.instructionRoom);
    this.instruction.setPosition(safe.centerX, bandTop);
    this.countRect.setTo(
      safe.centerX - TUNE.countWidth * s / 2, centre - TUNE.countHeight * s / 2,
      TUNE.countWidth * s, TUNE.countHeight * s,
    );
    // The strike ring at the top of the card, the count-in's word under it, the count below.
    this.strikeAt = { x: this.countRect.centerX, y: this.countRect.y + TUNE.ringTop * s };
    resize(this.cue, 50 * s, PALETTE.coral);
    this.cue.setPosition(this.countRect.centerX, this.countRect.y + TUNE.cueTop * s);
    // Flat, not dressed: at this size the headline's outline turns a reading into a logo,
    // and the card behind it is already doing the work of setting it off the paper.
    resize(this.counted, 132 * s, PALETTE.ink);
    resize(this.countedOf, 62 * s, PALETTE.muted, STYLE.current, false);
    const span = this.counted.width + this.countedOf.width;
    const countY = this.countRect.y + TUNE.countTop * s;
    this.counted.setPosition(this.countRect.centerX - span / 2 + this.counted.width, countY);
    this.countedOf.setPosition(this.counted.x, countY + 14 * s);
    resize(this.countedNote, 22 * s, PALETTE.muted, STYLE.current, false);
    this.countedNote.setPosition(this.countRect.centerX, this.countRect.bottom - 36 * s);
    // The lane under the count, as wide as the card, and the route line under that.
    this.laneRect.setTo(this.countRect.x, this.countRect.bottom + TUNE.laneGap * s, this.countRect.width, TUNE.laneHeight * s);
    resize(this.laneEarly, 18 * s, PALETTE.muted, STYLE.current, false);
    resize(this.laneLate, 18 * s, PALETTE.muted, STYLE.current, false);
    this.laneEarly.setPosition(this.laneRect.x + 4 * s, this.laneRect.bottom + 16 * s);
    this.laneLate.setPosition(this.laneRect.right - 4 * s, this.laneRect.bottom + 16 * s);
    // Wrapped as a guard, not as a layout: the line fits on one at every offset the
    // clamp allows, and this only stops a longer wording from running off the screen.
    wrapWidth(this.current, Math.min(620 * s, width));
    resize(this.current, 27 * s, PALETTE.muted, STYLE.current, false);
    this.current.setPosition(safe.centerX, this.laneRect.bottom + 52 * s);

    // The two small controls sit inside the result strip, right-aligned.
    const smallW = Math.max(152 * s, control);
    const smallH = Math.max(88 * s, control);
    const smallY = this.resultRect.centerY - smallH / 2;
    this.buttons.retry.rect.setTo(this.resultRect.right - 20 * s - smallW, smallY, smallW, smallH);
    this.buttons.keep.rect.setTo(this.buttons.retry.rect.x - 12 * s - smallW, smallY, smallW, smallH);
    const resetW = Math.max(176 * s, control);
    this.buttons.reset.rect.setTo(
      safe.centerX - resetW / 2, this.buttons.run.rect.y - 20 * s - smallH, resetW, smallH,
    );
    this.resultNote.setPosition(this.resultRect.x + 26 * s, this.resultRect.centerY - 24 * s);
    resize(this.resultNote, 19 * s, PALETTE.muted, STYLE.current, false);
    this.fitResultNote();
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
      const shown = name === 'run' ? !measured
        : name === 'reset' ? this.phase === 'idle' && this.calibrated !== null
        : measured && (name === 'retry' || this.phase === 'measured');
      button.text.setVisible(shown);
      if (!shown) continue;
      const p = this.pressed === button ? press : 0;
      const depth = button.hero ? CHROME.block.depth : 10;
      drawPanel(g, button.rect, s, {
        fill: button.hero ? PALETTE.coral : name === 'retry' ? SHELL.bench : SHELL.cream,
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
    const instruction = instructionCopy(this.phase, this.kept !== null);
    if (this.instruction.text !== instruction) {
      this.instruction.setText(instruction);
      if (this.instructionRoom > 0) balanceWrap(this.instruction, this.instructionRoom);
    }
    this.counted.setText(String(this.run?.count ?? (measured ? CALIBRATION_TAPS : 0)));
    this.countedNote.setText(this.phase === 'counting' ? 'Taps landed' : 'Tap on the beat');
    const reported = currentAudio(this)?.clock.reportedLagMs ?? 0;
    // Which route this measures, because a run calibrates that route and no other.
    const route = currentRoute();
    const now = this.kept !== null ? `saved ${formatOffset(this.kept)} · run again to check`
      : this.calibrated === null ? 'not calibrated yet' : `currently ${formatOffset(this.calibrated)}`;
    const named = route === 'unknown' ? `${now.charAt(0).toUpperCase()}${now.slice(1)}` : `${ROUTE_LABELS[route]} · ${now}`;
    this.current.setText(reported >= WORTH_MENTIONING_MS && this.kept === null ? `${named} · your device adds about ${reported} ms` : named);
    this.buttons.run.text.setText(this.phase === 'counting' ? 'Stop' : this.kept !== null ? 'Check' : 'Start');
    const copy = resultCopy(this.verdict, this.calibrated, this.checking);
    this.resultNote.setText(copy.note);
    this.fitResultNote();
    this.resultValue.setText(copy.value);
    this.drawControls(0);
  }

  /** The reason shrinks rather than running under Keep on a narrow handset. */
  private fitResultNote(): void {
    const room = this.buttons.keep.rect.x - 12 * this.uiScale - this.resultNote.x;
    this.resultNote.setScale(room > 0 && this.resultNote.width > room ? room / this.resultNote.width : 1);
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
    this.drawStrike();
    this.drawLane(now);
  }

  /** The lane is on screen in every phase: empty before a run, filling during it, and kept under the result. */
  private drawLane(now: number): void {
    const still = this.reducedMotion;
    const ticks: LaneTick[] = this.ticks.map(tick => ({ residualMs: tick.residualMs, age: now - tick.at }));
    const flash = this.flash === null ? null : { side: this.flash.side, age: now - this.flash.at };
    drawCalibrationLane(this.lane.clear(), this.laneRect, this.uiScale, ticks, flash, still);
  }

  /**
   * The strike cue: the ball resting on its ring until a run, then hopping off every click
   * and landing on the next, with the count-in's word under it. Heard clock, not
   * currentTime: the clicks are scheduled on the write clock and reach the speaker an
   * output-lag later. A cue on currentTime lands before the sound, and a player tapping
   * with it would measure a negative offset that undoes a real calibration.
   */
  private drawStrike(): void {
    const s = this.uiScale;
    const g = this.strike.clear();
    const still = this.reducedMotion;
    const audio = currentAudio(this);
    if (this.phase !== 'counting' || !audio || !this.run) {
      drawStrikeCue(g, this.strikeAt.x, this.strikeAt.y, s, { height: 0, landing: 0 }, false);
      this.cue.setVisible(false).setScale(1);
      return;
    }
    audio.clock.refresh();
    const elapsed = this.run.beatAt(audio.clock.now());
    const pose = strikePose(elapsed, this.run.period, still);
    drawStrikeCue(g, this.strikeAt.x, this.strikeAt.y, s, pose, elapsed >= CALIBRATION.leadBeats);
    const word = strikeWord(elapsed);
    this.cue.setVisible(word !== null);
    if (word !== null && this.cue.text !== word) this.cue.setText(word);
    // The word kicks with the landing, so "Tap!" says *now* on every beat and not only once.
    this.cue.setScale(still ? 1 : 1 + 0.22 * pose.landing);
    if (audio.clock.now() > this.run.end) this.finish();
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
      else if (name === 'reset') this.resetOffset();
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
    const request = ++this.request;
    try {
      // This tap is the gesture, so a player who reached settings before ever pressing
      // PLAY can still calibrate.
      await audio.unlock();
    } catch {
      if (this.disposed || request !== this.request) return;
      this.phase = 'failed';
      this.measuredMs = null;
      this.refreshCopy();
      return;
    }
    // The unlock can take up to three seconds, and Back is live throughout: a run that
    // began after the player left would schedule sixteen clicks under Settings and write
    // to Texts the display list has destroyed.
    if (this.disposed || request !== this.request) return;
    audio.clock.refresh();
    // The run's residuals are against what the clock subtracts, so the two must agree.
    this.readRoute();
    this.phase = 'counting';
    this.measuredMs = null;
    this.verdict = null;
    this.ticks = [];
    this.flash = null;
    this.checking = this.kept !== null;
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
    const outcome = this.run.place(at);
    const wall = performance.now() / 1000;
    if (outcome === 'early' || outcome === 'late') {
      // Fell past the window: the edge it fell past lights, and the count stays.
      this.flash = { side: outcome, at: wall };
      return;
    }
    if (outcome !== 'landed') return;
    this.ticks.push({ residualMs: this.run.residualsMs[this.run.count - 1]!, at: wall });
    vibrate('hit');
    if (this.run.complete) this.finish();
    else this.refreshCopy();
  }

  private finish(): void {
    currentAudio(this)?.cancel();
    const verdict = this.run?.verdict() ?? null;
    this.run = null;
    this.verdict = verdict;
    this.measuredMs = verdict?.kind === 'measured' ? verdict.offsetMs : null;
    this.phase = this.measuredMs === null ? 'failed' : 'measured';
    if (verdict !== null) {
      track('calibration_measured', {
        route: currentRoute(),
        outcome: verdict.kind === 'measured' ? 'measured' : verdict.kind === 'few' ? 'few_taps' : 'uneven',
        offset_ms: verdict.kind === 'measured' ? verdict.offsetMs : 0,
        spread_ms: Math.round(verdict.kind === 'few' ? 0 : verdict.spreadMs),
        reported_ms: currentAudio(this)?.clock.reportedLagMs ?? 0,
        check: this.checking ? 1 : 0,
      });
    }
    this.refreshCopy();
  }

  /**
   * Keep the measurement for the active route, and stay: the next run is a check against
   * it, which the residual design makes free — a right offset reads near zero. Leaving here
   * sent a player who wanted to be sure back through Settings to run it again.
   */
  private keep(): void {
    if (this.measuredMs === null) return;
    const before = this.calibrated;
    // The active route only; every other route keeps its own measurement.
    applyCalibration(sharedAudio(this), this.measuredMs);
    this.readRoute();
    vibrate('stamp');
    track('calibration_kept', {
      route: currentRoute(), offset_ms: this.measuredMs, change_ms: Math.round(this.measuredMs - (before ?? 0)), check: this.checking ? 1 : 0,
    });
    this.kept = this.measuredMs;
    this.measuredMs = null;
    this.verdict = null;
    this.checking = false;
    this.phase = 'idle';
    this.refreshCopy();
  }

  private retry(): void {
    this.measuredMs = null;
    this.verdict = null;
    this.phase = 'idle';
    this.refreshCopy();
    void this.start();
  }

  /**
   * Drop a kept offset without measuring the inverse. The next Start still samples as a
   * residual against zero, so a second run is a fresh measurement rather than a refinement
   * of a number the player just threw away.
   */
  private resetOffset(): void {
    resetCalibration(currentAudio(this));
    this.readRoute();
    this.measuredMs = null;
    this.verdict = null;
    this.ticks = [];
    this.kept = null;
    this.checking = false;
    this.phase = 'idle';
    this.refreshCopy();
  }

  /** Android's back is this screen's own back puck (`core/backButton.ts`). */
  public handleBack(): boolean {
    this.leave();
    return true;
  }

  private leave(): void {
    if (this.curtain.active) return;
    currentAudio(this)?.cancel();
    // Opened from the map's route note, the way back is the map; from Settings, Settings.
    const data = this.sys.settings.data as { returnTo?: string } | undefined;
    if (data?.returnTo === SceneKey.Map) { this.curtain.cover(() => this.scene.start(SceneKey.Map)); return; }
    this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: this.enteredFrom() }));
  }

  /** Settings is always the way back; it remembers where the player came from itself. */
  private enteredFrom(): string {
    const data = this.sys.settings.data as { from?: string } | undefined;
    return data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
  }

  private shutdown(): void {
    this.disposed = true;
    this.request += 1;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.stopWatchingRoute?.();
    this.stopWatchingRoute = null;
    currentAudio(this)?.cancel();
    this.taps.dispose();
    this.backdrop.destroy();
  }
}
