import Phaser from 'phaser';
import type { AudioEngine } from '@/audio/AudioEngine';
import { hushMusic, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { RHYTHM } from '@/config/rhythm';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { wrongOrientation } from '@/core/shell';
import { beatsPlayed, countIn, GHOST_FADE, ghostRing, handover, markFor, trackGeometry, type Mark } from '@/game/beatTrack';
import { RoundController, type Phase } from '@/game/RoundController';
import { coach, completeTutorial, isPlayersWindow, momentOf, TUTORIAL, TutorialRun, type Coach } from '@/game/TutorialRun';
import { TapInput, type Tap } from '@/input/TapInput';
import type { Judgement } from '@/rhythm/judge';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import { MaterialKey } from '@/textures/materials';
import { CHROME, drawPuck, pressAmount } from '@/ui/chrome';
import { mix } from '@/ui/colour';
import { drawSpeaker } from '@/ui/icons';
import { drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { settle, squash } from '@/ui/spring';
import { batonCrossing, blockGeometry, blockWidth, columnRoom, drawBlock, faceLift, TRACK, type Ghost } from '@/ui/turnBlock';
import { body, display, label, resize } from '@/ui/type';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';
import { VIGNETTES } from '@/vignettes/registry';

/** The words beside the two rows. The level shows none; the lesson is where they belong. */
const ROW_LABELS = { theirs: 'THE HAMMER', yours: 'YOU' } as const;

/**
 * A lesson on the same stage, the same audio clock and the same turn block as a level.
 *
 * The block is what says whose turn it is on every level, so it is what the lesson
 * teaches: the same two rows, the same token, drawn by the same `drawBlock`, with a
 * label on each row and a pointer that follows the token — and a sign above that names
 * the moment in words, from the same handover the block is drawn from. The tried pass
 * is judged by the level's own `RoundController`, so what passes here is what passes
 * there. Nothing is scored and nothing is spent.
 */
export class TutorialScene extends BaseScene {
  private run = new TutorialRun();
  private audio!: AudioEngine;
  private controller: RoundController | null = null;
  private illustration!: HammerNailVignette;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private panels!: Phaser.GameObjects.Graphics;
  private block!: Phaser.GameObjects.Graphics;
  private hand!: Phaser.GameObjects.Graphics;
  private signSurface!: Phaser.GameObjects.TileSprite;
  private actionSurface!: Phaser.GameObjects.TileSprite;
  private heading!: Phaser.GameObjects.Text;
  private copy!: Phaser.GameObjects.Text;
  private stepLabel!: Phaser.GameObjects.Text;
  private actionLabel!: Phaser.GameObjects.Text;
  private replayLabel!: Phaser.GameObjects.Text;
  private skipLabel!: Phaser.GameObjects.Text;
  private theirsLabel!: Phaser.GameObjects.Text;
  private yoursLabel!: Phaser.GameObjects.Text;
  private sign = new Phaser.Geom.Rectangle();
  private action = new Phaser.Geom.Rectangle();
  private replay = new Phaser.Geom.Rectangle();
  private skip = new Phaser.Geom.Rectangle();
  private mute = { x: 0, y: 0 };
  private s = 1;
  private target = 88;
  private trackY = 0;
  private trackWidth = 0;
  private started = false;
  private busy = false;
  private paused = false;
  private disposed = false;
  private request = 0;
  private pump: ReturnType<typeof setInterval> | null = null;
  /** The watched pass's cursor over the plan it is playing. The tried pass has the controller. */
  private watching: { cue: number; answered: number; phase: Phase } | null = null;
  private marks: Mark[] = [];
  private struckIndex = -1;
  private struckAt = -Infinity;
  private rattleAt = -Infinity;
  private pressedAt = -Infinity;
  private lastFrame = 0;
  private lastCopy = '';

  public constructor() { super(SceneKey.Tutorial); }

  protected override build(): void {
    this.run = new TutorialRun();
    this.controller = null;
    this.watching = null;
    this.marks = [];
    this.started = this.busy = this.paused = this.disposed = false;
    this.lastCopy = '';
    this.pressedAt = this.struckAt = this.rattleAt = -Infinity;
    this.struckIndex = -1;
    this.illustration = new HammerNailVignette(this, true);
    this.audio = sharedAudio(this);
    hushMusic(this);
    this.audio.setSounds(VIGNETTES[0]!.sounds(this.audio.context));
    this.panels = this.add.graphics().setDepth(10);
    this.signSurface = surface(this, MaterialKey.wood, this.sign, 1, SHELL.wood, 0.5).setDepth(11);
    this.actionSurface = surface(this, MaterialKey.cloth, this.action, 1, PALETTE.coral, 0.35).setDepth(11);
    this.block = this.add.graphics().setDepth(12);
    this.hand = this.add.graphics().setDepth(15);
    this.heading = display(this, 'Listen', { size: 56, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.copy = body(this, '', { size: 30, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.stepLabel = body(this, '', { size: 25, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.actionLabel = display(this, '', { size: 38, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.replayLabel = body(this, 'Watch again', { size: 28, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.skipLabel = body(this, 'Skip', { size: 28, colour: PALETTE.ink }).setOrigin(0.5).setDepth(12);
    this.theirsLabel = label(this, ROW_LABELS.theirs, { size: 21, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(13);
    this.yoursLabel = label(this, ROW_LABELS.yours, { size: 21, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(13);
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal(() => { void this.startWatch(); }));
    // The judge runs off a steady pump as it does in a level: a dropped frame must not
    // expire a target the player answered in time.
    this.pump = setInterval(() => this.pumpTick(), RHYTHM.pumpMs);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.interrupt);
    this.audio.context.addEventListener('statechange', this.audioState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = this.s = Math.min(safe.width / 720, safe.height / 1150);
    this.target = Math.max(88 * s, 48 * this.viewport.unitScale);
    // The block needs the band the old bead row had and the shelf's above it, so the
    // bench sits higher than a level's; the act is smaller here and reads fine there.
    this.illustration.layout(this.viewport, Math.min(safe.top + safe.height * 0.6, safe.bottom - 520 * s));
    this.sign.setTo(safe.centerX - 250 * s, safe.top + 134 * s, 500 * s, 108 * s);
    this.heading.setPosition(this.sign.centerX, this.sign.centerY);
    resize(this.heading, 56 * s, SHELL.cream);
    this.copy.setPosition(safe.centerX, safe.top + 268 * s);
    resize(this.copy, 30 * s, PALETTE.ink, STYLE.current, false);
    this.copy.setWordWrapWidth(680 * s);
    this.stepLabel.setPosition(safe.centerX, safe.top + 68 * s);
    resize(this.stepLabel, 25 * s, PALETTE.muted, STYLE.current, false);
    this.skip.setTo(safe.left + 12 * s, safe.top + 68 * s - this.target / 2, this.target, this.target);
    this.skipLabel.setPosition(this.skip.centerX, this.skip.centerY);
    resize(this.skipLabel, 28 * s, PALETTE.ink, STYLE.current, false);
    this.mute = { x: safe.right - 56 * s, y: safe.top + 68 * s };
    // The face sits where a level puts it relative to the thumb, and the labels take
    // the band around it.
    this.trackY = safe.bottom - 300 * s;
    this.trackWidth = columnRoom(Math.min(620 * s, safe.width - 48 * s), s);
    resize(this.theirsLabel, 21 * s, PALETTE.ink, STYLE.current, false);
    resize(this.yoursLabel, 21 * s, PALETTE.ink, STYLE.current, false);
    this.action.setTo(safe.centerX - 280 * s, safe.bottom - 194 * s, 560 * s, Math.max(100 * s, this.target));
    this.replay.setTo(safe.centerX - 180 * s, safe.bottom - this.target, 360 * s, this.target);
    this.replayLabel.setPosition(this.replay.centerX, this.replay.centerY);
    resize(this.replayLabel, 28 * s, PALETTE.ink, STYLE.current, false);
    resize(this.actionLabel, 38 * s, SHELL.cream);
    this.paint(this.now());
  }

  private now(): number { this.audio.clock.refresh(); return this.audio.clock.now(); }
  private blocked(): boolean { return document.hidden || wrongOrientation(this.scale.isLandscape); }
  private get trying(): boolean { return this.run.step === 'try' && this.run.verdict === null && this.controller !== null; }

  /** The watched pass: the game plays the hammer's half and then answers its own call. */
  private async startWatch(): Promise<void> {
    const request = ++this.request;
    this.busy = true;
    this.stop();
    try {
      await this.audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      if (this.blocked()) { this.interrupt(); return; }
      this.paused = false;
      this.started = true;
      const plan = this.run.watch(Math.max(this.now(), this.audio.context.currentTime));
      this.watching = { cue: 0, answered: 0, phase: 'prepare' };
      this.resetMarks(plan);
      this.illustration.reset(plan);
      this.illustration.onPhase('prepare', this.now());
      // Both halves go in ahead of time, like every other phrase: the count and the
      // hammer's beats from the plan, and the answer as the game sounding each target.
      for (const cue of plan.cues) this.audio.play(cue.time, cue.kind);
      for (const target of plan.targets) this.audio.play(target, 'action');
      this.lastFrame = performance.now();
    } catch {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.paused = true;
    }
  }

  /** The tried pass, judged by the level's own controller. */
  private async startTry(resumed = false): Promise<void> {
    const request = ++this.request;
    this.busy = true;
    this.stop();
    try {
      await this.audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      if (this.blocked()) { this.interrupt(); return; }
      this.paused = false;
      this.started = true;
      this.controller ??= new RoundController(this.audio, {
        phase: phase => this.illustration.onPhase(phase, this.now()),
        cue: cue => {
          if (cue.kind !== 'action') return;
          const phase = this.controller?.phase;
          if (phase === 'prepare' || phase === 'demonstrate') this.illustration.onDemonstrationBeat(cue.time);
        },
        tap: () => { this.struckAt = this.now(); this.illustration.onPlayerHit(this.struckAt); },
        judgement: result => this.judged(result),
        complete: () => this.completeTry(),
        interrupted: () => this.interrupt(),
      });
      const contextNow = this.audio.context.currentTime;
      const startAt = Math.max(this.now(), contextNow) + TUTORIAL.leadSec;
      this.controller.start(TUTORIAL.pattern, TUTORIAL.bpm, contextNow, performance.now(), startAt, TUTORIAL.leadBeats);
      const plan = this.controller.plan!;
      if (resumed) this.run.tries--;
      this.run.try(plan);
      this.resetMarks(plan);
      this.illustration.reset(plan);
      this.lastFrame = performance.now();
    } catch {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.paused = true;
    }
  }

  private resetMarks(plan: RoundPlan): void {
    this.marks = plan.pattern.hits.map(() => 'pending');
    this.struckIndex = -1;
    this.struckAt = this.rattleAt = -Infinity;
  }

  /** Silence whatever pass is running. The lesson's own state is left for the caller. */
  private stop(): void {
    this.audio.cancel();
    this.controller?.dispose();
    this.watching = null;
  }

  private judged(result: Judgement): void {
    const now = this.now();
    this.run.judged(result);
    if (result.index !== null) this.marks[result.index] = markFor(result);
    if (result.kind === 'hit' && result.index !== null) this.struckIndex = result.index;
    // An extra tap answered no beat, so it marks none and both rows shake.
    if (result.kind === 'extra') this.rattleAt = now;
    if (this.controller?.phase === 'respond') this.illustration.onAccuracy(result, now);
  }

  private completeTry(): void {
    const verdict = this.run.complete();
    const now = this.now();
    // The hammer closes the try the way a level closes a task: struck home on a pass,
    // bent on a miss. Contact is a moment ahead so the swing has room to wind up.
    const contact = now + 0.28;
    this.illustration.finish(verdict === 'clear', contact);
    this.audio.playFinish(contact, verdict === 'clear');
    this.controller?.dispose();
  }

  private pumpTick(): void {
    if (this.disposed || this.paused || this.busy || !this.trying || this.blocked()) return;
    if (this.audio.context.state !== 'running') { this.audio.recover(); return; }
    this.controller!.tick(this.now(), performance.now());
  }

  public override update(): void {
    if (this.disposed) return;
    const frame = performance.now();
    // A stalled watched pass has silently played on without its picture; the tried
    // pass has the controller's own stall guard.
    if (this.started && !this.paused && (this.blocked() || (this.watching && frame - this.lastFrame > 500))) this.interrupt();
    this.lastFrame = frame;
    const now = this.now();
    if (this.started && !this.paused && !this.busy) {
      if (this.watching) this.watchTick(now);
      if (this.trying) this.controller!.tick(now, frame);
      this.illustration.update(now);
    }
    this.paint(now);
  }

  /** Advances the watched pass from the audio clock: the hammer's beats, then the game's answer. */
  private watchTick(now: number): void {
    const watching = this.watching;
    const plan = this.run.plan;
    if (!watching || !plan) return;
    while (watching.cue < plan.cues.length && plan.cues[watching.cue]!.time <= now) {
      const cue = plan.cues[watching.cue++]!;
      if (cue.kind === 'action') this.illustration.onDemonstrationBeat(cue.time);
    }
    const phase: Phase = now < plan.demo ? 'prepare' : now < plan.response ? 'demonstrate' : 'respond';
    if (phase !== watching.phase) { watching.phase = phase; this.illustration.onPhase(phase, now); }
    while (watching.answered < plan.targets.length && plan.targets[watching.answered]! <= now) {
      const index = watching.answered++;
      this.struckIndex = index;
      this.struckAt = now;
      this.marks[index] = 'perfect';
      this.illustration.onPlayerHit(now);
      this.illustration.onAccuracy({ kind: 'hit', grade: 'Perfect', index, deltaMs: 0 }, now);
    }
    if (now >= plan.end) this.watching = null;
  }

  private paint(now: number): void {
    const s = this.s;
    let words: Coach = coach(this.run, now);
    if (this.paused) {
      words = { heading: 'Take your time', copy: 'The lesson is paused.\nTap below to pick it up where it was.', action: 'Resume', side: 'none' };
    } else if (this.busy || !this.started) {
      words = { ...words, action: 'Getting ready…' };
    }
    const signature = [words.heading, words.copy, words.action, this.run.step, this.run.tries, this.paused].join('|');
    if (signature !== this.lastCopy) {
      this.lastCopy = signature;
      this.heading.setText(words.heading);
      this.copy.setText(words.copy);
      this.actionLabel.setText(words.action ?? '');
      this.stepLabel.setText(this.run.step === 'watch' ? '1 / 2 · WATCH' : this.run.step === 'try' ? '2 / 2 · YOUR TRY' : 'READY');
    }
    const g = this.panels.clear();
    // The sign takes the side's colour: timber for the hammer's turn, coral for yours,
    // and the mix while the token is crossing, so the sign and the face agree.
    const signFill = words.side === 'yours' ? PALETTE.coral : words.side === 'handover' ? mix(SHELL.wood, PALETTE.coral, 0.55) : SHELL.wood;
    drawPanel(g, this.sign, s, { fill: signFill, depth: 12, hero: true });
    this.signSurface.setTint(signFill);
    placeSurface(this.signSurface, this.sign, s);
    const showAction = words.action !== null;
    this.actionLabel.setVisible(showAction);
    this.actionSurface.setVisible(showAction);
    if (showAction) {
      const press = Math.max(0, pressAmount(now, this.pressedAt));
      drawPanel(g, this.action, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press, hero: true });
      const sink = CHROME.block.depth * s * press * 0.8;
      this.actionSurface.setTint(PALETTE.coral);
      placeSurface(this.actionSurface, this.action, s, sink);
      this.actionLabel.setPosition(this.action.centerX, this.action.centerY + sink);
    }
    drawPuck(g, this.mute.x, this.mute.y, s);
    drawSpeaker(g, this.mute.x, this.mute.y, 17 * s, PALETTE.ink, this.audio.muted);
    // Watch again is offered once a pass is over, never while one is playing or judging.
    this.replayLabel.setVisible(this.started && !this.busy && !this.paused && showAction);
    this.drawTurnBlock(now, words);
  }

  /**
   * The level's own block, with the two things a level leaves out: a word on each row,
   * and a pointer that follows the token. Everything else is `drawBlock`, so what the
   * player learns to read here is exactly what they will read on level 1.
   */
  private drawTurnBlock(now: number, words: Coach): void {
    const g = this.block.clear();
    this.hand.clear();
    const { safe } = this.viewport;
    const s = this.s;
    const still = reducedMotion();
    const plan = this.run.plan;
    const live = this.started && !this.paused && !this.busy && plan !== null;
    const count = plan?.pattern.hits.length ?? TUTORIAL.pattern.hits.length;
    const { centres, radius } = trackGeometry(count, this.trackWidth, TRACK.beadGap * s, TRACK.beadRadius * s);
    const last = centres.at(-1) ?? 0;
    const span = last + radius + 34 * s;
    const beadSpan = last - (centres[0] ?? 0) + radius * 2;
    const width = Math.min(Math.max(span * 2, 220 * s, blockWidth(beadSpan, s)), safe.width - 48 * s);
    const geo = blockGeometry(safe.centerX, this.trackY, width, s);
    const turn = live ? handover(plan, now) : { runway: 0, yours: 0 };
    // Held on the answered picture once a pass is over, so the verdict can be read
    // against the row it is about.
    const marks = this.marks.length === count ? this.marks : Array.from({ length: count }, () => 'pending' as Mark);
    const rattle = still ? 0 : settle(now - this.rattleAt, 90, 18) * 3 * s;
    drawBlock(g, geo, s, {
      centres, socketRadius: radius,
      played: live ? beatsPlayed(plan, now) : 0,
      marks, turn,
      struck: { index: this.struckIndex, amount: still ? 0 : squash(now - this.struckAt, 0.22, 0.45) },
      rattle, still,
      ghost: live ? this.ghostFor(plan!, marks, turn.yours, now) : null,
      ink: VIGNETTES[0]!.ink,
    });
    const lift = faceLift(turn, still);
    const theirsAlpha = 1 - 0.5 * turn.yours;
    this.theirsLabel.setPosition(geo.shelf.centerX + rattle, geo.shelf.y - 22 * s).setAlpha(theirsAlpha);
    // Below the plate's thickness, which grows with the lift, not just below its face.
    this.yoursLabel.setPosition(geo.face.centerX + rattle, geo.face.y + geo.face.height + (TRACK.plateDepth + 20) * s);
    // The count-in, above the shelf's word: the opening bar is not dead air.
    const pips = live ? countIn(plan, now) : null;
    if (pips !== null) {
      const pipY = geo.shelf.y - 52 * s;
      for (let i = 0; i < 4; i++) {
        const x = safe.centerX + (i - 1.5) * TRACK.pipGap * s;
        if (i < pips) g.fillStyle(PALETTE.ink, 0.9).fillCircle(x, pipY, TRACK.pipRadius * s);
        else g.lineStyle(2.5 * s, PALETTE.ink, 0.35).strokeCircle(x, pipY, TRACK.pipRadius * s);
      }
    }
    if (!live) return;
    // The pointer: a coral arrowhead at the right end of whichever row the token is on,
    // travelling with it. It is the lesson's one addition to the block's own cue, so a
    // player looking for "where do I look" has an answer that moves when the answer does.
    const t = batonCrossing(turn, still);
    const px = geo.face.x + geo.face.width + 30 * s + rattle;
    const py = geo.shelfCentreY + (geo.faceCentreY - lift - geo.shelfCentreY) * t;
    const beat = 60 / (plan?.bpm ?? TUTORIAL.bpm);
    const pulse = still ? 0 : Math.max(0, Math.sin(((now % beat) / beat) * Math.PI * 2)) * 4 * s;
    const pr = 16 * s;
    g.fillStyle(mix(PALETTE.coral, PALETTE.ink, 0.45), 1).fillTriangle(px + pulse + 2 * s, py + 3 * s, px + pulse + pr * 1.6, py - pr + 3 * s, px + pulse + pr * 1.6, py + pr + 3 * s);
    g.fillStyle(PALETTE.coral, 1).fillTriangle(px + pulse, py, px + pulse + pr * 1.6, py - pr, px + pulse + pr * 1.6, py + pr);
    // During the watched answer, the finger is the one tapping; the player sees a hand
    // where theirs will be.
    if (this.run.step === 'watch' && words.side === 'yours') this.drawHand(now, px + pr * 2.2, geo.faceCentreY - lift);
  }

  /** The guiding ring level 1 shows, on the next beat still ahead of the player. */
  private ghostFor(plan: RoundPlan, marks: readonly Mark[], yours: number, now: number): Ghost | null {
    if (yours <= 0.2) return null;
    const index = marks.findIndex((mark, i) => mark === 'pending' && (plan.targets[i] ?? -Infinity) >= now - GHOST_FADE);
    const target = plan.targets[index];
    if (index < 0 || target === undefined) return null;
    const ring = ghostRing(target, 60 / plan.bpm, now);
    return ring.alpha <= 0.01 ? null : { index, radius: ring.radius, alpha: ring.alpha };
  }

  private drawHand(now: number, x: number, y: number): void {
    const g = this.hand;
    const s = this.s;
    const age = now - this.struckAt;
    const bounce = reducedMotion() ? 0 : age >= 0 && age < 0.4 ? Math.sin(age / 0.4 * Math.PI) * 10 : Math.sin(now * 3) * 4;
    const top = y - 30 * s - bounce * s;
    // A cream mitten with an extended finger, outlined like the game's tools.
    g.lineStyle(5 * s, PALETTE.ink).fillStyle(SHELL.cream);
    g.fillRoundedRect(x - 19 * s, top + 22 * s, 61 * s, 60 * s, 20 * s).strokeRoundedRect(x - 19 * s, top + 22 * s, 61 * s, 60 * s, 20 * s);
    g.fillRoundedRect(x - 16 * s, top - 16 * s, 23 * s, 67 * s, 11 * s).strokeRoundedRect(x - 16 * s, top - 16 * s, 23 * s, 67 * s, 11 * s);
    g.fillStyle(SHELL.cream).fillRect(x - 13 * s, top + 25 * s, 20 * s, 27 * s);
    g.lineStyle(3 * s, PALETTE.ink).lineBetween(x + 17 * s, top + 30 * s, x + 17 * s, top + 45 * s);
    if (age >= 0 && age < 0.3) g.lineStyle(4 * s, PALETTE.coral, 1 - age / 0.3).strokeCircle(x - 4 * s, top - 18 * s, (18 + age * 65) * s);
  }

  private handleTap(tap: Tap): void {
    if (this.disposed || this.curtain.active || this.blocked()) return;
    const contains = (r: Phaser.Geom.Rectangle) => Phaser.Geom.Rectangle.Contains(r, tap.x, tap.y);
    if (contains(this.skip)) { this.leave(false); return; }
    if (Math.abs(tap.x - this.mute.x) < this.target / 2 && Math.abs(tap.y - this.mute.y) < this.target / 2) { toggleMute(this.audio); return; }
    if (this.busy) return;
    if (this.paused) {
      if (contains(this.action)) void this.resume();
      return;
    }
    const now = this.now();
    if (this.trying) {
      // A gameplay tap, judged as a level would judge it. One that arrives before the
      // player's window is the mistake the lesson is for, so it is counted and the rows
      // shake rather than nothing happening at all.
      const plan = this.controller!.plan;
      const input = this.audio.clock.input(tap.timestamp);
      const result = this.controller!.tap(input, this.audio.context.currentTime, performance.now());
      if (result === null && !isPlayersWindow(plan, input)) { this.run.earlyTap(); this.rattleAt = now; }
      return;
    }
    const words = coach(this.run, now);
    if (words.action === null) return;
    if (this.replayLabel.visible && contains(this.replay)) { void this.startWatch(); return; }
    if (!contains(this.action)) return;
    this.pressedAt = now;
    if (words.action === 'Let’s play') this.leave(true);
    else void this.startTry();
  }

  private async resume(): Promise<void> {
    if (!this.started || (this.run.step === 'watch' && momentOf(this.run.plan, this.now()) !== 'after')) { await this.startWatch(); return; }
    if (this.run.step === 'try' && this.run.verdict === null) { await this.startTry(true); return; }
    // Between passes there is nothing to restart: the words and the block are still up.
    this.paused = false;
    this.illustration.onPhase('idle', this.now());
  }

  private leave(complete: boolean): void {
    ++this.request;
    this.stop();
    this.illustration.pause();
    this.paused = true;
    if (complete) { completeTutorial(); this.registry.set('tutorial-complete', true); }
    this.curtain.cover(() => this.scene.start(SceneKey.Map));
  }

  private readonly interrupt = (): void => {
    if (this.disposed || this.paused) return;
    ++this.request;
    this.busy = false;
    this.paused = true;
    this.stop();
    this.illustration.pause();
    this.taps.reset();
  };
  private readonly visibility = (): void => { if (document.hidden) this.interrupt(); };
  private readonly audioState = (): void => { if (this.started) this.audio.recover(); };

  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.request;
    if (this.pump !== null) clearInterval(this.pump);
    this.pump = null;
    this.stop();
    this.controller = null;
    this.taps.dispose();
    this.illustration.destroy();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.interrupt);
    this.audio.context.removeEventListener('statechange', this.audioState);
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }
}
