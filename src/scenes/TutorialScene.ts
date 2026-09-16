import Phaser from 'phaser';
import type { AudioEngine } from '@/audio/AudioEngine';
import { sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { isTouchPrimary } from '@/core/shell';
import { completeTutorial, TUTORIAL, TutorialRun } from '@/game/TutorialRun';
import { TapInput, type Tap } from '@/input/TapInput';
import { MaterialKey } from '@/textures/materials';
import { CHROME, drawPuck, pressAmount } from '@/ui/chrome';
import { drawSpeaker } from '@/ui/icons';
import { drawDisc, drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { body, display, resize } from '@/ui/type';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';
import { VIGNETTES } from '@/vignettes/registry';

/** A lesson on the same stage and audio clock as the game, with no score or deadline. */
export class TutorialScene extends BaseScene {
  private run = new TutorialRun();
  private audio!: AudioEngine;
  private illustration!: HammerNailVignette;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private panels!: Phaser.GameObjects.Graphics;
  private beads!: Phaser.GameObjects.Graphics;
  private hand!: Phaser.GameObjects.Graphics;
  private signSurface!: Phaser.GameObjects.TileSprite;
  private actionSurface!: Phaser.GameObjects.TileSprite;
  private heading!: Phaser.GameObjects.Text;
  private copy!: Phaser.GameObjects.Text;
  private stepLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private actionLabel!: Phaser.GameObjects.Text;
  private replayLabel!: Phaser.GameObjects.Text;
  private skipLabel!: Phaser.GameObjects.Text;
  private beatLabels: Phaser.GameObjects.Text[] = [];
  private sign = new Phaser.Geom.Rectangle();
  private action = new Phaser.Geom.Rectangle();
  private replay = new Phaser.Geom.Rectangle();
  private skip = new Phaser.Geom.Rectangle();
  private mute = { x: 0, y: 0 };
  private s = 1;
  private target = 88;
  private rowY = 0;
  private started = false;
  private busy = false;
  private paused = false;
  private disposed = false;
  private request = 0;
  private demoHits = 0;
  private response = false;
  private pressedAt = -Infinity;
  private struckAt = -Infinity;
  private lastFrame = 0;
  private lastCopy = '';

  public constructor() { super(SceneKey.Tutorial); }

  protected override build(): void {
    this.run = new TutorialRun();
    this.started = this.busy = this.paused = this.disposed = false;
    this.lastCopy = '';
    this.pressedAt = this.struckAt = -Infinity;
    this.illustration = new HammerNailVignette(this, true);
    this.audio = sharedAudio(this);
    this.audio.music.stop();
    this.audio.setSounds(VIGNETTES[0]!.sounds(this.audio.context));
    this.panels = this.add.graphics().setDepth(10);
    this.signSurface = surface(this, MaterialKey.wood, this.sign, 1, SHELL.wood, 0.5).setDepth(11);
    this.actionSurface = surface(this, MaterialKey.cloth, this.action, 1, PALETTE.coral, 0.35).setDepth(11);
    this.beads = this.add.graphics().setDepth(12);
    this.hand = this.add.graphics().setDepth(15);
    this.heading = display(this, 'Watch', { size: 56, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.copy = body(this, '', { size: 32, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.stepLabel = body(this, '', { size: 26, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.hint = body(this, '', { size: 29, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.actionLabel = display(this, '', { size: 38, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.replayLabel = body(this, 'Watch again', { size: 28, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.skipLabel = body(this, 'Skip', { size: 28, colour: PALETTE.ink }).setOrigin(0.5).setDepth(12);
    this.beatLabels = ['TAP', 'TAP', 'WAIT', 'TAP'].map(text => body(this, text, { size: 23, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(13));
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal(() => { void this.startDemo(false); }));
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.interrupt);
    this.audio.context.addEventListener('statechange', this.audioState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = this.s = Math.min(safe.width / 720, safe.height / 1150);
    this.illustration.layout(this.viewport, Math.min(safe.top + safe.height * 0.68, safe.bottom - 450 * s));
    this.target = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.sign.setTo(safe.centerX - 250 * s, safe.top + 134 * s, 500 * s, 108 * s);
    this.heading.setPosition(this.sign.centerX, this.sign.centerY);
    resize(this.heading, 56 * s, SHELL.cream);
    this.copy.setPosition(safe.centerX, safe.top + 272 * s);
    resize(this.copy, 32 * s, PALETTE.ink, STYLE.current, false);
    this.copy.setWordWrapWidth(640 * s);
    this.stepLabel.setPosition(safe.centerX, safe.top + 68 * s);
    resize(this.stepLabel, 25 * s, PALETTE.muted, STYLE.current, false);
    this.skip.setTo(safe.left + 12 * s, safe.top + 68 * s - this.target / 2, this.target, this.target);
    this.skipLabel.setPosition(this.skip.centerX, this.skip.centerY);
    resize(this.skipLabel, 28 * s, PALETTE.ink, STYLE.current, false);
    this.mute = { x: safe.right - 56 * s, y: safe.top + 68 * s };
    this.rowY = safe.bottom - 366 * s;
    this.hint.setPosition(safe.centerX, safe.bottom - 260 * s);
    resize(this.hint, 29 * s, PALETTE.ink, STYLE.current, false);
    this.hint.setWordWrapWidth(640 * s);
    this.action.setTo(safe.centerX - 280 * s, safe.bottom - 194 * s, 560 * s, Math.max(100 * s, this.target));
    this.replay.setTo(safe.centerX - 180 * s, safe.bottom - this.target, 360 * s, this.target);
    this.replayLabel.setPosition(this.replay.centerX, this.replay.centerY);
    resize(this.replayLabel, 28 * s, PALETTE.ink, STYLE.current, false);
    resize(this.actionLabel, 38 * s, SHELL.cream);
    this.beatLabels.forEach((label, i) => {
      label.setPosition(safe.centerX + (i - 1.5) * 130 * s, this.rowY + 31 * s);
      resize(label, 23 * s, PALETTE.ink, STYLE.current, false);
    });
    this.paint(this.now());
  }

  private now(): number { this.audio.clock.refresh(); return this.audio.clock.now(); }
  private blocked(): boolean { return document.hidden || (isTouchPrimary() && this.scale.isLandscape); }
  private get demo(): boolean { return this.run.step === 'slow-demo' || this.run.step === 'fast-demo'; }

  private async startDemo(fast: boolean): Promise<void> {
    const request = ++this.request;
    this.busy = true;
    this.audio.cancel();
    try {
      await this.audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      if (this.blocked()) { this.interrupt(); return; }
      this.paused = false;
      this.started = true;
      this.run.demo(Math.max(this.now(), this.audio.context.currentTime), fast);
      this.demoHits = 0;
      this.response = false;
      this.struckAt = -Infinity;
      this.illustration.reset(this.run.plan);
      this.illustration.onPhase('demonstrate', this.now());
      // Both the example and the illustrated finger's answer are scheduled before playback.
      for (const cue of this.run.plan.cues) this.audio.play(cue.time, cue.kind);
      for (const target of this.run.plan.targets) this.audio.play(target, 'action');
      this.lastFrame = performance.now();
    } catch {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.paused = true;
    }
  }

  private beginPractice(): void {
    this.audio.cancel();
    const now = this.now();
    this.run.practice(now);
    this.struckAt = -Infinity;
    this.illustration.reset(this.run.plan);
    this.illustration.onPhase('respond', now);
  }

  public override update(): void {
    if (this.disposed) return;
    const frame = performance.now();
    if (this.started && !this.paused && (this.blocked() || (this.demo && frame - this.lastFrame > 500))) this.interrupt();
    this.lastFrame = frame;
    const now = this.now();
    if (this.started && !this.paused && !this.busy) {
      if (this.demo) {
        if (!this.response && now >= this.run.plan.response) {
          this.response = true;
          this.illustration.onPhase('respond', this.run.plan.response);
        }
        while (this.response && this.demoHits < this.run.plan.targets.length && now >= this.run.plan.targets[this.demoHits]!) {
          const at = this.run.plan.targets[this.demoHits]!;
          this.playerHit(at, this.demoHits++);
        }
        this.run.tick(now);
      }
      this.illustration.update(now);
    }
    this.paint(now);
  }

  private playerHit(now: number, index: number): void {
    this.struckAt = now;
    this.pressedAt = now;
    this.illustration.onPlayerHit(now);
    this.illustration.onAccuracy({ kind: 'hit', grade: 'Perfect', index, deltaMs: 0 }, now);
  }

  private paint(now: number): void {
    const { step } = this.run;
    const practice = step === 'practice';
    const ready = practice && now >= this.run.due;
    const response = this.demo && this.response;
    const gamePace = step === 'fast-demo' || step === 'complete';
    let title = response || practice ? 'Your turn' : 'Watch';
    let copy = response ? 'The finger copies the rhythm.\nOne tap anywhere makes one hit.' : 'Watch the hammer. Listen to the rhythm.\nTap, tap, wait, tap.';
    let hint = response ? 'Same rhythm. Same spaces between taps.' : 'Just watch for now. Your turn comes next.';
    let action = response ? 'Tap anywhere' : 'Example playing…';
    if (step === 'practice-ready') {
      title = 'Now you try'; copy = 'Copy the same three taps.\nThe glowing bead shows when to tap.';
      hint = 'Take your time. Practice waits for you.'; action = 'Try it yourself';
    } else if (practice) {
      copy = 'Tap anywhere once when a bead glows.\nLeave the quiet beat empty.';
      hint = ready ? `Tap ${this.run.hits + 1} of 3 · Waiting for you` : this.run.practiceBeat(now) === 2 ? 'Quiet beat · Wait… then one more tap.' : 'Keep the space between taps. Get ready…';
      action = ready ? 'Tap now' : 'Wait for the glow';
    } else if (step === 'practice-done') {
      title = 'You’ve got it!'; copy = 'Three taps, with a quiet beat in between.\nNow watch how it flows at game speed.';
      hint = 'In a level, the rhythm keeps moving.'; action = 'See game pace';
    } else if (gamePace) {
      copy = 'Your turn starts on the very next beat.\nKeep the same pace through the quiet beat.';
      hint = `${TUTORIAL.gameBpm} beats per minute · The game’s starting pace`;
      if (step === 'complete') {
        title = 'Ready to play'; copy = 'Watch first. Then tap the same rhythm.\nOne tap per hit. Leave the gaps quiet.';
        hint = 'Levels get faster. Follow each new example.'; action = 'Let’s play';
      }
    }
    if (this.paused) {
      title = 'Take your time'; copy = 'Your lesson is paused.\nTap below to pick it up again.';
      hint = 'We’ll restart this part together.'; action = 'Resume tutorial';
    } else if (this.busy || !this.started) { action = 'Getting ready…'; }
    const signature = [title, copy, hint, action, step, this.paused].join('|');
    if (signature !== this.lastCopy) {
      this.lastCopy = signature;
      this.heading.setText(title); this.copy.setText(copy); this.hint.setText(hint); this.actionLabel.setText(action);
      this.stepLabel.setText(gamePace ? '3 / 3 · GAME PACE' : step === 'slow-demo' ? '1 / 3 · WATCH & COPY' : '2 / 3 · YOUR TRY');
    }
    const s = this.s;
    const g = this.panels.clear();
    const coral = !this.paused && (practice || response);
    drawPanel(g, this.sign, s, { fill: coral ? PALETTE.coral : SHELL.wood, depth: 12, hero: true });
    this.signSurface.setTint(coral ? PALETTE.coral : SHELL.wood);
    placeSurface(this.signSurface, this.sign, s);
    const press = Math.max(0, pressAmount(now, this.pressedAt));
    const active = this.paused || !this.demo || response;
    const fill = active ? PALETTE.coral : SHELL.wood;
    drawPanel(g, this.action, s, { fill, depth: CHROME.block.depth, press, hero: true });
    const sink = CHROME.block.depth * s * press * 0.8;
    this.actionSurface.setTint(fill);
    placeSurface(this.actionSurface, this.action, s, sink);
    this.actionLabel.setPosition(this.action.centerX, this.action.centerY + sink);
    drawPuck(g, this.mute.x, this.mute.y, s);
    drawSpeaker(g, this.mute.x, this.mute.y, 17 * s, PALETTE.ink, this.audio.muted);
    this.replayLabel.setVisible(this.started && !this.busy && !this.paused);
    this.drawBeats(now, ready);
    this.drawHand(now, response || ready);
  }

  private drawBeats(now: number, ready: boolean): void {
    const g = this.beads.clear(), s = this.s, cx = this.viewport.safe.centerX;
    drawPanel(g, new Phaser.Geom.Rectangle(cx - 294 * s, this.rowY - 53 * s, 588 * s, 110 * s), s, { fill: SHELL.puck, depth: 7 });
    const plan = this.run.plan;
    const start = this.response ? plan.response : plan.demo;
    const beat = this.demo ? Math.floor((now - start) / (60 / plan.bpm)) : this.run.practiceBeat(now);
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * 130 * s, y = this.rowY - 12 * s;
      const active = this.started && !this.paused && ((this.demo && beat === i)
        || (this.run.step === 'practice' && ((ready && TUTORIAL.pattern.hits[this.run.hits] === i) || (i === 2 && beat === 2))));
      const hitIndex = TUTORIAL.pattern.hits.indexOf(i);
      const done = hitIndex >= 0 && !this.demo && hitIndex < this.run.hits;
      const colour = done ? PALETTE.ink : active ? PALETTE.coral : SHELL.cream;
      if (active && i !== 2) {
        const pulse = reducedMotion() ? 0 : (Math.sin(now * 6) + 1) * 2;
        g.lineStyle(3 * s, PALETTE.coral).strokeCircle(x, y, (31 + pulse) * s);
      }
      if (i === 2) {
        g.lineStyle(3 * s, active ? PALETTE.coral : PALETTE.muted).strokeCircle(x, y, 23 * s);
        g.lineBetween(x - 9 * s, y, x + 9 * s, y);
      } else {
        drawDisc(g, x, y, 23 * s, s, { fill: colour, depth: 4 });
        if (done) {
          g.lineStyle(4 * s, SHELL.cream).beginPath().moveTo(x - 10 * s, y).lineTo(x - 3 * s, y + 7 * s).lineTo(x + 12 * s, y - 8 * s).strokePath();
        } else if (active && ready) {
          g.fillStyle(SHELL.cream).fillCircle(x, y, 6 * s);
        }
      }
    }
  }

  private drawHand(now: number, visible: boolean): void {
    const g = this.hand.clear();
    if (!visible || this.paused || this.busy) return;
    const age = now - this.struckAt;
    const s = this.s;
    const bounce = reducedMotion() ? 0 : age >= 0 && age < 0.4 ? Math.sin(age / 0.4 * Math.PI) * 10 : Math.sin(now * 3) * 5;
    const x = this.action.right - 30 * s, y = this.action.top + (8 - bounce) * s;
    // A cream mitten with an extended finger, outlined like the game's tools.
    g.lineStyle(5 * s, PALETTE.ink).fillStyle(SHELL.cream);
    g.fillRoundedRect(x - 19 * s, y + 22 * s, 61 * s, 60 * s, 20 * s).strokeRoundedRect(x - 19 * s, y + 22 * s, 61 * s, 60 * s, 20 * s);
    g.fillRoundedRect(x - 16 * s, y - 16 * s, 23 * s, 67 * s, 11 * s).strokeRoundedRect(x - 16 * s, y - 16 * s, 23 * s, 67 * s, 11 * s);
    g.fillStyle(SHELL.cream).fillRect(x - 13 * s, y + 25 * s, 20 * s, 27 * s);
    g.lineStyle(3 * s, PALETTE.ink).lineBetween(x + 17 * s, y + 30 * s, x + 17 * s, y + 45 * s);
    if (age >= 0 && age < 0.3) g.lineStyle(4 * s, PALETTE.coral, 1 - age / 0.3).strokeCircle(x - 4 * s, y - 18 * s, (18 + age * 65) * s);
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
    if (this.replayLabel.visible && contains(this.replay)) { void this.startDemo(this.run.step === 'fast-demo' || this.run.step === 'complete'); return; }
    const now = this.now();
    if (this.run.step === 'practice') {
      this.pressedAt = now;
      if (this.run.tap(now)) {
        this.audio.play(this.audio.context.currentTime, 'action');
        this.playerHit(now, this.run.hits - 1);
      }
      return;
    }
    if (!contains(this.action)) return;
    this.pressedAt = now;
    if (this.run.step === 'practice-ready') this.beginPractice();
    else if (this.run.step === 'practice-done') void this.startDemo(true);
    else if (this.run.step === 'complete') this.leave(true);
  }

  private async resume(): Promise<void> {
    if (this.demo || !this.started) { await this.startDemo(this.run.step === 'fast-demo'); return; }
    const request = ++this.request;
    this.busy = true;
    try {
      await this.audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      if (this.blocked()) return;
      this.paused = false;
      this.lastFrame = performance.now();
      if (this.run.step === 'practice') this.beginPractice();
      else this.illustration.onPhase('respond', this.now());
    } catch {
      if (!this.disposed && request === this.request) this.busy = false;
    }
  }

  private leave(complete: boolean): void {
    ++this.request;
    this.audio.cancel();
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
    this.audio.cancel();
    this.illustration.pause();
    this.taps.reset();
  };
  private readonly visibility = (): void => { if (document.hidden) this.interrupt(); };
  private readonly audioState = (): void => { if (this.started) this.audio.recover(); };

  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.request;
    this.audio.cancel();
    this.taps.dispose();
    this.illustration.destroy();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.interrupt);
    this.audio.context.removeEventListener('statechange', this.audioState);
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }
}
