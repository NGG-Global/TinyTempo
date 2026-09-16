import Phaser from 'phaser';
import { reducedMotion } from '@/core/motionPreference';
import type { AudioEngine } from '@/audio/AudioEngine';
import { sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { MUSIC } from '@/config/music';
import { TaskSequence } from '@/game/TaskSequence';
import { SceneKey } from '@/config/scenes';
import { LAYOUT } from '@/config/design';
import { RHYTHM } from '@/config/rhythm';
import { BaseScene } from '@/core/BaseScene';
import { isTouchPrimary } from '@/core/shell';
import { RoundController, type Phase } from '@/game/RoundController';
import type { RoundResult } from '@/game/scoring';
import { TapInput, type Tap } from '@/input/TapInput';
import { MaterialKey } from '@/textures/materials';
import type { Judgement } from '@/rhythm/judge';
import { beatsPlayed, countIn, markFor, trackGeometry, type Mark } from '@/game/beatTrack';
import { levelSpec, meanAccuracy, starsFor, type LevelSpec } from '@/game/levels';
import {
  abandonAttempt, beginAttempt, canBeginAttempt, createAttemptId, finishAttempt, healthHud, loadHealth,
  redeemFill, redeemHeart, saveHealth, viewHealth,
} from '@/game/health';
import { monetization, PRODUCT, purchaseFeedback, rewardedFeedback, track } from '@/monetization';
import { loadProgress, recordResult, saveProgress, type LevelOutcome } from '@/game/progress';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { drawHeart, drawMap, drawRestart, drawSpeaker } from '@/ui/icons';
import { faces } from '@/ui/light';
import { mix, shade, starColour } from '@/ui/colour';
import { CHROME, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { drawPanel, placeSurface, Rect, surface } from '@/ui/panel';
import { Feedback } from '@/ui/feedback';
import { arrive, settle, squash } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';
import { drawStarMark, prizeColour, STAR_PRIZE } from '@/ui/star';
import { chorusGlow, starAge, starImpactAge, starPose } from '@/ui/starReveal';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { VIGNETTES } from '@/vignettes/registry';
import type { Vignette } from '@/vignettes/Vignette';
import { clamp01, easeOut } from '@/vignettes/motion';

/** Watch is a timber plaque; Your turn is the coral block the thumb already knows. */
type TurnCue = 'none' | 'watch' | 'play';

/**
 * The beat track's metrics, in design units at scale 1. The beads are deliberately larger
 * than the map's area pips: this row is the only thing on screen that says whose turn it
 * is, so it has to read at arm's length rather than merely be present.
 */
const TRACK = {
  beadGap: 58,
  beadRadius: 19,
  plateHeight: 72,
  plateDepth: 7,
  plateRadius: 28,
  pipGap: 30,
  pipRadius: 6,
} as const;

/** Composes the existing engine with registered visual vignettes. No judgement rules live here. */
export class PlayScene extends BaseScene {
  private audio: AudioEngine | null = null;
  private controller: RoundController | null = null;
  private taps!: TapInput;
  private vignette!: Vignette;
  /** The level is fixed for the scene's life; one vignette, tasks ramping in tempo and density. */
  private spec: LevelSpec = levelSpec(1);
  private taskIndex = 0;
  private get task() { return this.spec.tasks[this.taskIndex]!; }
  private results: number[] = [];
  private summaryShown = false;
  private levelCleared = false;
  /** Computed and persisted the instant the last task resolves; the summary only displays it. */
  private outcome: LevelOutcome | null = null;
  private saveFailed = false;
  /** Set once gameplay actually begins; refunds use the same id so a double-finish cannot restore two hearts. */
  private attemptId: string | null = null;
  private heartRefunded = false;
  private emptyTracked = false;
  private watchOfferTracked = false;
  private purchaseOfferTracked = false;
  private commerceBusy = false;
  private watchClaims = 0;
  private get definition() { return VIGNETTES.find(v => v.id === this.spec.vignette) ?? VIGNETTES[0]!; }
  private stars!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  /** Hung behind the phase word so Watch and Your turn are different objects, not just colours. */
  private turnSign!: Phaser.GameObjects.Graphics;
  private accuracy!: Phaser.GameObjects.Text;
  private kept!: Phaser.GameObjects.Text;
  private turn: TurnCue = 'none';
  /** Judgements that scored in the early window while the example was still on screen. */
  private heldJudgements: Judgement[] = [];
  /** The three pucks — map, restart, mute — drawn as one baked graphic. */
  private chrome!: Phaser.GameObjects.Graphics;
  private actionRoot!: Phaser.GameObjects.Container;
  private action!: Phaser.GameObjects.Graphics;
  private actionSurface!: Phaser.GameObjects.TileSprite;
  private actionLabel!: Phaser.GameObjects.Text;
  private actionHint!: Phaser.GameObjects.Text;
  private actionHeart!: Phaser.GameObjects.Graphics;
  private actionRect = new Phaser.Geom.Rectangle();
  private actionCaption = '';
  private actionPressedAt = -Infinity;
  private actionPressDirty = false;
  private actionShownAt = -Infinity;
  private refillRoot!: Phaser.GameObjects.Container;
  private refill!: Phaser.GameObjects.Graphics;
  private refillLabel!: Phaser.GameObjects.Text;
  private refillHint!: Phaser.GameObjects.Text;
  private refillPrice!: Phaser.GameObjects.Text;
  private refillMark!: Phaser.GameObjects.Graphics;
  private refillRect = new Phaser.Geom.Rectangle();
  private refillPressedAt = -Infinity;
  private mapAt = { x: 0, y: 0 };
  private restartAt = { x: 0, y: 0 };
  private muteAt = { x: 0, y: 0 };
  private muted = false;
  private puckPressed: 'map' | 'restart' | 'mute' | null = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  private fx!: Feedback;
  private starFx!: Feedback;
  private starsLanded = 0;
  private marks!: Phaser.GameObjects.Graphics;
  private taskMarks!: Phaser.GameObjects.Graphics;
  private curtain!: SceneCurtain;
  private summaryAt = -Infinity;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }
  private debug!: Phaser.GameObjects.Text;
  private controlSize = 96;
  private uiScale = 1;
  private headlineY = 0;
  private headlineSize = 0;
  private headlineAt = -Infinity;
  private outcomes: Mark[] = [];
  /** The row of beads under the action: the pattern, the turn and the verdict in one object. */
  private trackY = 0;
  private trackWidth = 0;
  private verdictY = 0;
  private struckIndex = -1;
  private struckAt = -Infinity;
  private extraAt = -Infinity;
  private turnAt = -Infinity;
  private verdict!: Phaser.GameObjects.Text;
  private verdictAt = -Infinity;
  private headlineColour = 0x243e35;
  private sequence: TaskSequence | null = null;
  /** Beat-aligned table slide between tasks; the next task and the music's new tempo both start at `next`. */
  private transition: { slide: number; swap: number; next: number; swapped: boolean } | null = null;
  private replayOffset: number | null = null;
  private attempts = 0;
  private demoCount = 0;
  private finishUnlock = Infinity;
  private startRequest = 0;
  private disposed = false;
  private starting = false;
  private lastJudgement = '';
  private replay: { roundId: number; targets: readonly number[]; next: number } | null = null;
  private replayPanel: HTMLElement | null = null;
  private pump: ReturnType<typeof setInterval> | null = null;
  /** Last Date.now() we re-read storage on the out-of-hearts WATCH plaque. */
  private watchPollAt = 0;
  private readonly debugMode = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');

  public constructor() { super(SceneKey.Play); }

  protected override build(): void {
    this.disposed = false;
    this.starting = false;
    const data = this.sys.settings.data as { level?: number; autoStart?: boolean } | undefined;
    const requested = data?.level ?? (import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('level')) : 0);
    this.spec = levelSpec(Number.isInteger(requested) && requested >= 1 ? requested : 1);
    this.vignette = this.definition.create(this);
    const ink = this.definition.ink;
    this.stars = this.add.graphics().setDepth(9);
    this.fx = new Feedback(this, 5);
    this.starFx = new Feedback(this, 12);
    this.turnSign = this.add.graphics().setDepth(11);
    this.headline = display(this, this.definition.intro, { size: 88, colour: ink, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.accuracy = body(this, '', { size: 34, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(11);
    this.kept = label(this, '', { size: 22, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.chrome = this.add.graphics().setDepth(10);
    this.actionRoot = this.add.container(0, 0).setDepth(10);
    this.action = this.add.graphics();
    this.actionSurface = surface(this, MaterialKey.cloth, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, PALETTE.coral, 0.35);
    this.actionLabel = display(this, '', { size: 40, colour: SHELL.cream, align: 'center' }).setOrigin(0.5);
    this.actionHint = label(this, '+1', { size: 22, colour: SHELL.cream, align: 'center' }).setOrigin(1, 0.5);
    this.actionHeart = this.add.graphics();
    this.actionRoot.add([this.action, this.actionSurface, this.actionLabel, this.actionHint, this.actionHeart]);
    this.refillRoot = this.add.container(0, 0).setDepth(10);
    this.refill = this.add.graphics();
    this.refillLabel = label(this, 'REFILL', { size: 28, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5);
    this.refillHint = label(this, 'RESTORE 5', { size: 20, colour: PALETTE.ink, align: 'center' }).setOrigin(1, 0.5);
    this.refillPrice = body(this, '', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5);
    this.refillMark = this.add.graphics();
    this.refillRoot.add([this.refill, this.refillLabel, this.refillHint, this.refillPrice, this.refillMark]);
    this.marks = this.add.graphics().setDepth(8);
    this.verdict = display(this, '', { size: 38, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.taskMarks = this.add.graphics().setDepth(11);
    this.curtain = new SceneCurtain(this);
    this.debug = this.text('', 16, 'monospace').setVisible(this.debugMode);
    if (this.debugMode) this.installReplayPanel();
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.pump = setInterval(() => this.tick(), RHYTHM.pumpMs);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pageHide);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    // Arriving from the map: audio is already unlocked and loaded.
    // Reveal the illustration before starting the four-beat preparation. Navigation
    // motion must never obscure a musical cue or move an already-running rhythm grid.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal(() => {
      if (data?.autoStart) void this.startRound();
    }));
  }
  private text(value: string, size: number, fontFamily: string): Phaser.GameObjects.Text {
    return this.add.text(0, 0, value, { fontFamily, fontSize: `${size}px`, color: `#${this.definition.ink.toString(16).padStart(6, '0')}` });
  }
  protected override layout(): void {
    const { safe } = this.viewport;
    this.vignette.layout(this.viewport);
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    const left = safe.centerX - 310 * s;
    const top = safe.top;
    const ink = this.definition.ink;
    // The phase cue and task beads are the whole HUD. Level metadata lives on the map.
    this.headlineY = top + 84 * s;
    this.headlineSize = (this.controller?.active ? 48 : 88) * s;
    resize(this.headline, this.headlineSize, this.headlineColour);
    this.headline.setPosition(safe.centerX, this.headlineY).setLineSpacing(-12 * s);
    this.drawTurnSign();
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    const gap = Math.max(88 * s, this.controlSize + 4 * s);
    this.muteAt = { x: safe.right - 56 * s, y: top + 66 * s };
    this.restartAt = { x: this.muteAt.x - gap, y: this.muteAt.y };
    this.mapAt = { x: safe.left + 56 * s, y: this.muteAt.y };
    this.drawChrome(s, 0);
    this.puckDirty = true;
    this.debug.setPosition(left, top + 360 * s).setFontSize(16 * s);
    // Same offset as the old drag track: an absolute distance from the thumb, so a tall
    // handset does not leave the beads floating in the middle of the frame.
    this.trackY = safe.bottom - LAYOUT.trackOffsetFromBottom * s;
    this.trackWidth = Math.min(620 * s, safe.width - 80 * s);
    this.verdictY = this.trackY - TRACK.plateHeight * s / 2 - 34 * s;
    this.verdict.setPosition(safe.centerX, this.verdictY);
    resize(this.verdict, 38 * s, this.verdictColour());
    // Tighter than the menu's Play block, so the result plaque still fits above it.
    const blockH = Math.max(96 * s, this.controlSize);
    const refillH = Math.max(88 * s, this.controlSize);
    this.actionRect.setTo(
      safe.centerX - CHROME.block.width * s / 2,
      safe.bottom - 72 * s - blockH,
      CHROME.block.width * s,
      blockH,
    );
    this.refillRect.setTo(
      this.actionRect.x,
      this.actionRect.y - 12 * s - refillH,
      this.actionRect.width,
      refillH,
    );
    this.drawAction(0);
    this.actionPressDirty = true;
    resize(this.accuracy, 34 * s, ink, STYLE.current, false);
    this.placeWaitCopy();
    resize(this.kept, 22 * s, PALETTE.coral, STYLE.current, false);
    this.kept.setPosition(safe.centerX, this.trackY + 52 * s);
    this.drawStars();
    this.drawTaskMarks();
  }
  private drawChrome(s: number, press: number): void {
    const g = this.chrome.clear();
    const sinkOf = (key: 'map' | 'restart' | 'mute') => (this.puckPressed === key ? press : 0);
    for (const [key, at] of [['map', this.mapAt], ['restart', this.restartAt], ['mute', this.muteAt]] as const) {
      drawPuck(g, at.x, at.y, s, sinkOf(key));
    }
    const ink = this.definition.ink;
    const r = CHROME.puckRadius * s;
    drawMap(g, this.mapAt.x, this.mapAt.y + puckSink(s, sinkOf('map')), r * 0.42, ink);
    drawRestart(g, this.restartAt.x, this.restartAt.y + puckSink(s, sinkOf('restart')), r * 0.44, ink);
    drawSpeaker(g, this.muteAt.x, this.muteAt.y + puckSink(s, sinkOf('mute')), r * 0.5, ink, this.muted);
  }

  /**
   * The one coral block. Pause, retry and the result all used to be a faint caption
   * under the vignette; every other screen puts that action on a block the thumb
   * already knows. At zero hearts a cream refill sits above Watch.
   */
  private drawAction(press: number, refillPress = 0): void {
    const shown = this.actionCaption !== '';
    const watching = shown && this.actionCaption === 'WATCH';
    this.actionRoot.setVisible(shown);
    this.refillRoot.setVisible(watching);
    if (!shown) {
      this.refill.clear();
      this.refillMark.clear();
      return;
    }
    const s = this.uiScale;
    const g = this.action.clear();
    const r = this.actionRect;
    drawPanel(g, r, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press, hero: true });
    const sink = CHROME.block.depth * s * press * 0.8;
    placeSurface(this.actionSurface, r, s, sink);
    this.actionHint.setVisible(watching);
    this.actionHeart.setVisible(watching);
    this.actionLabel.setText(this.actionCaption);
    if (watching) {
      resize(this.actionLabel, 32 * s, SHELL.cream);
      this.actionLabel.setPosition(r.centerX, r.centerY - 16 * s + sink);
      this.actionHint.setText('+1');
      resize(this.actionHint, 22 * s, SHELL.cream);
      this.actionHint.setPosition(r.centerX - 4 * s, r.centerY + 22 * s + sink);
      this.actionHeart.clear();
      drawHeart(this.actionHeart, r.centerX + 18 * s, r.centerY + 22 * s + sink, 10 * s, SHELL.cream);
      this.drawRefill(refillPress);
    } else {
      this.actionHeart.clear();
      this.refill.clear();
      this.refillMark.clear();
      resize(this.actionLabel, 40 * s, SHELL.cream);
      this.actionLabel.setPosition(r.centerX, r.centerY + sink);
    }
    this.placeWaitCopy();
  }

  private drawRefill(press: number): void {
    const s = this.uiScale;
    const r = this.refillRect;
    const refill = this.refill.clear();
    drawPanel(refill, r, s, { fill: SHELL.bench, depth: 12, press });
    const sink = 12 * s * press * 0.8;
    this.refillLabel.setText('REFILL');
    resize(this.refillLabel, 26 * s, PALETTE.ink);
    this.refillLabel.setPosition(r.centerX, r.centerY - 14 * s + sink);
    this.refillHint.setText('RESTORE 5');
    resize(this.refillHint, 18 * s, PALETTE.ink, STYLE.current, false);
    const priceText = monetization().productPrice(PRODUCT.heartRefill) ?? '';
    const hintX = priceText.length > 0 ? r.centerX - 36 * s : r.centerX - 4 * s;
    this.refillHint.setPosition(hintX, r.centerY + 20 * s + sink);
    this.refillMark.clear();
    drawHeart(this.refillMark, hintX + 16 * s, r.centerY + 20 * s + sink, 9 * s, PALETTE.coral);
    this.refillPrice.setText(priceText);
    resize(this.refillPrice, 18 * s, PALETTE.muted, STYLE.current, false);
    this.refillPrice.setPosition(r.centerX + 70 * s, r.centerY + 20 * s + sink);
    this.refillPrice.setVisible(priceText.length > 0);
  }

  private placeWaitCopy(): void {
    const s = this.uiScale;
    const y = this.actionCaption === 'WATCH'
      ? this.refillRect.y - 28 * s
      : this.trackY + 28 * s;
    this.accuracy.setPosition(this.viewport.safe.centerX, y);
  }

  private setAction(caption: string): void {
    if (this.actionCaption === caption) return;
    if (caption !== '' && this.actionCaption === '') this.actionShownAt = performance.now() / 1000;
    this.actionCaption = caption;
    this.drawAction(0);
    this.actionPressDirty = true;
  }
  private blocked(): boolean { return document.hidden || (isTouchPrimary() && this.scale.isLandscape); }
  private now(): number { return this.audio?.clock.now() ?? performance.now() / 1000; }

  private async startRound(): Promise<void> {
    // Gate before tearing anything down: a denied restart must not kill a paid run.
    if (!canBeginAttempt(loadHealth(), loadProgress(), this.spec.level, Date.now(), monetization().premium())) {
      if (this.controller?.active) return;
      this.showNoHearts();
      return;
    }
    const request = ++this.startRequest;
    this.replay = null;
    this.replayOffset = null;
    this.transition = null;
    this.lastJudgement = '';
    this.taskIndex = 0;
    this.results = [];
    this.summaryShown = false;
    this.levelCleared = false;
    this.outcome = null;
    this.saveFailed = false;
    this.attemptId = null;
    this.heartRefunded = false;
    this.emptyTracked = false;
    this.watchOfferTracked = false;
    this.purchaseOfferTracked = false;
    this.kept.setVisible(false);
    this.stars.clear();
    this.setTurn('none');
    this.controller?.dispose();
    this.audio?.cancel();
    this.audio?.music.stop();
    this.vignette.pause();
    this.accuracy.setText('');
    this.setAction('');
    this.finishUnlock = Infinity;
    this.demoCount = 0;
    if (this.blocked()) return;
    this.starting = true;
    try {
      if (!this.controller) {
        this.audio = sharedAudio(this);
        this.audio.context.addEventListener('statechange', this.audioState);
        this.muted = this.audio.muted;
        this.drawChrome(this.uiScale, 0);
        this.controller = new RoundController(this.audio, {
          phase: phase => this.showPhase(phase),
          cue: cue => {
            // Leftover demonstration beats that land after respond are consumed by the
            // controller; never start the example on the tool the player already holds.
            if (cue.kind !== 'action') return;
            const phase = this.controller?.phase;
            if (phase !== 'demonstrate' && phase !== 'prepare') return;
            this.vignette.onDemonstrationBeat(cue.time);
            this.demoCount++;
          },
          tap: () => {
            this.vignette.onPlayerHit(this.now());
            this.releaseHeldJudgements();
          },
          judgement: result => this.showJudgement(result),
          complete: result => this.showResult(result),
          interrupted: () => this.showPause(),
        });
      }
      await this.audio!.unlock();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      await this.audio!.music.load();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.starting = false;
      this.audio!.setSounds(this.definition.sounds(this.audio!.context));
      const origin = this.audio!.music.start(); // fresh sources: every level starts at the base tempo
      if (this.disposed || request !== this.startRequest || this.blocked()) {
        this.audio!.music.stop();
        return;
      }
      // Spend only once audio is running: a failed unlock/load above never reaches here.
      const attemptId = createAttemptId(this.spec.level);
      const begun = beginAttempt(loadHealth(), loadProgress(), this.spec.level, attemptId, Date.now(), monetization().premium());
      if (!begun.ok) {
        this.audio!.music.stop();
        this.showNoHearts();
        return;
      }
      saveHealth(begun.health);
      this.attemptId = attemptId;
      this.heartRefunded = false;
      this.sequence = new TaskSequence(this.task.bpm, origin, 1);
      this.beginTask(origin);
    } catch (error) {
      if (this.disposed || request !== this.startRequest) return;
      this.starting = false;
      this.controller?.dispose();
      this.audio?.cancel();
      this.audio?.music.stop();
      console.error('Unable to start round', error);
      this.setTurn('none');
      this.changeHeadline('No sound');
      this.setAction('Retry');
    }
  }
  private beginTask(startAt: number): void {
    this.attempts++;
    this.demoCount = 0;
    this.finishUnlock = Infinity;
    this.accuracy.setText('');
    this.outcomes = this.task.pattern.hits.map(() => 'pending');
    this.heldJudgements = [];
    this.struckIndex = -1;
    this.struckAt = this.extraAt = this.verdictAt = -Infinity;
    this.verdict.setAlpha(0);
    this.controller!.start(this.task.pattern, this.task.bpm, this.audio!.context.currentTime, performance.now(), startAt, this.task.leadBeats);
    this.vignette.reset(this.controller!.plan!);
    if (this.replayOffset !== null) {
      const plan = this.controller!.plan!;
      this.replay = { roundId: plan.id, targets: this.replayTargets(), next: 0 };
    }
    this.drawTaskMarks();
  }
  private handleTap(tap: Tap): void {
    if (this.blocked() || this.curtain.active) return;
    const near = (at: { x: number; y: number }) => Math.abs(tap.x - at.x) < this.controlSize / 2 && Math.abs(tap.y - at.y) < this.controlSize / 2;
    if (near(this.muteAt)) {
      this.pressPuck('mute');
      if (this.audio) this.muted = toggleMute(this.audio);
      return;
    }
    if (near(this.restartAt)) { this.pressPuck('restart'); void this.startRound(); return; }
    if (near(this.mapAt)) { this.pressPuck('map'); this.leaveForMap(); return; }
    if (this.actionCaption === 'WATCH' && Phaser.Geom.Rectangle.Contains(this.refillRect, tap.x, tap.y)) {
      this.refillPressedAt = performance.now() / 1000;
      this.actionPressDirty = true;
      void this.buyFill();
      return;
    }
    if (this.actionCaption !== '' && Phaser.Geom.Rectangle.Contains(this.actionRect, tap.x, tap.y)) {
      this.actionPressedAt = performance.now() / 1000;
      this.actionPressDirty = true;
      if (this.actionCaption === 'WATCH') { void this.watchAd(); return; }
      if (this.actionCaption === 'Map') { this.leaveForMap(); return; }
    }
    const phase = this.controller?.phase ?? 'idle';
    if (phase === 'idle' || phase === 'paused') {
      if (this.actionCaption === 'WATCH') return;
      if (this.actionCaption === 'Map') { this.leaveForMap(); return; }
      if (!this.starting) void this.startRound();
      return;
    }
    if (phase === 'result') {
      // Cleared: back to the road, centred on what just opened. Failed: straight into another go.
      if (this.summaryShown) { if (this.levelCleared) this.leaveForMap(); else void this.startRound(); }
      return;
    }
    if (!this.audio || !this.controller?.active) return;
    this.audio.clock.refresh();
    this.controller.tap(this.audio.clock.input(tap.timestamp), this.audio.context.currentTime, performance.now());
  }
  private pressPuck(key: 'map' | 'restart' | 'mute'): void {
    this.puckPressed = key;
    this.puckPressedAt = performance.now() / 1000;
    this.puckDirty = true;
  }
  private tick(): void {
    if (!this.audio || this.blocked()) return;
    if (this.audio.context.state !== 'running') { this.interrupt(); return; }
    this.audio.clock.refresh();
    const transition = this.transition;
    if (transition && this.now() >= transition.swap && !transition.swapped) {
      if (this.audio.context.currentTime > transition.next - RHYTHM.leadSec) { this.interrupt(); return; }
      transition.swapped = true;
      this.taskIndex++;
      // The music speeds up on the same downbeat the next count-in starts, so the grid and
      // the stems change tempo together. Every task's plan is whole beats, so `next` is on a beat.
      this.audio.music.setRate(this.task.bpm / MUSIC.sourceBpm, transition.next);
      this.sequence = new TaskSequence(this.task.bpm, transition.next, 1);
      this.beginTask(transition.next);
    }
    if (transition && this.now() >= transition.next) this.transition = null;
    this.replayTick();
    if (this.controller?.active) this.controller.tick(this.now(), performance.now());
  }
  /** Development-only integration exercise: actual DOM mouse events go through TapInput. */
  private installReplayPanel(): void {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:8px;top:108px;z-index:20;display:flex;flex-direction:column;gap:6px;max-width:118px;';
    for (const mode of ['Accurate replay', 'Good replay', 'Rough replay', 'Spam replay'] as const) {
      const button = document.createElement('button');
      button.textContent = mode;
      button.style.cssText = 'padding:9px;border:1px solid #243e35;background:#eee8d8;color:#243e35;font:11px monospace;';
      button.addEventListener('click', () => { void this.runReplay(mode === 'Accurate replay' ? 0 : mode === 'Good replay' ? 0.08 : mode === 'Spam replay' ? -1 : 0.24); });
      panel.appendChild(button);
    }
    const mute = document.createElement('button');
    mute.textContent = 'music';
    mute.style.cssText = 'padding:6px;font:11px monospace';
    mute.addEventListener('click', () => {
      const music = this.audio?.music;
      if (!music) return;
      music.setGain(music.gain === 0 ? MUSIC.masterGain : 0);
      mute.style.opacity = music.gain === 0 ? '0.45' : '1';
    });
    panel.appendChild(mute);
    document.body.appendChild(panel);
    this.replayPanel = panel;
  }
  private async runReplay(offsetSec: number): Promise<void> {
    const request = this.startRequest + 1;
    await this.startRound();
    if (request !== this.startRequest || !this.controller?.active || !this.controller.plan) return;
    const plan = this.controller.plan;
    this.replayOffset = offsetSec;
    this.replay = { roundId: plan.id, targets: this.replayTargets(), next: 0 };
  }
  private replayTargets(): readonly number[] {
    const plan = this.controller!.plan!;
    return this.replayOffset === -1
      ? Array.from({ length: Math.ceil((plan.end + 3 * 60 / plan.bpm - plan.start) / 0.04) }, (_, i) => plan.start + i * 0.04)
      : plan.targets.map(time => time + this.replayOffset!);
  }
  private replayTick(): void {
    const replay = this.replay;
    if (!replay || replay.roundId !== this.controller?.plan?.id || this.controller.phase === 'paused') { this.replay = null; return; }
    const target = replay.targets[replay.next];
    if (target === undefined || this.now() < target) return;
    replay.next++;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const options = { bubbles: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.58, button: 0 };
    canvas.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
  }
  public override update(): void {
    const now = this.now();
    this.vignette.update(now);
    const slide = this.transition;
    if (slide && now >= slide.slide && now < slide.next) {
      const p = slide.swapped ? (now - slide.swap) / (slide.next - slide.swap) : (now - slide.slide) / (slide.swap - slide.slide);
      this.vignette.translate(this.viewport.full.width * (slide.swapped ? 1 - easeOut(p) : -(Math.min(1, Math.max(0, p)) ** 3)));
    }
    const still = this.reducedMotion;
    const entry = still || this.headlineAt < 0 ? { rise: 0, alpha: 1 } : arrive(now - this.headlineAt, 0.4);
    const playing = this.controller?.active;
    const endReveal = this.controller?.phase === 'result'
      ? easeOut((now - (this.finishUnlock - this.definition.endingSec) - 0.28) / 0.3) : 1;
    // setFontSize re-measures and re-rasterises the text canvas; only pay for it on change.
    const headlineSize = (playing ? 48 : 88) * this.uiScale;
    if (headlineSize !== this.headlineSize) { this.headlineSize = headlineSize; resize(this.headline, headlineSize, this.headlineColour); }
    this.headline.setAlpha(entry.alpha * endReveal).setY(this.headlineY + entry.rise * 16 * this.uiScale);
    this.drawTurnSign();
    if (this.summaryShown) {
      this.accuracy.setAlpha(still ? 1 : easeOut((now - this.summaryAt) / 0.45));
      this.animateStars(now);
    } else { this.accuracy.setAlpha(1); }
    this.drawBeatTrack(now);
    const wall = performance.now() / 1000;
    const puckPress = pressAmount(wall, this.puckPressedAt);
    if (puckPress > 0.001 || this.puckDirty) {
      this.drawChrome(this.uiScale, Math.max(0, puckPress));
      this.puckDirty = puckPress > 0.001;
      if (!this.puckDirty) this.puckPressed = null;
    }
    const actionPress = pressAmount(wall, this.actionPressedAt);
    const refillPress = pressAmount(wall, this.refillPressedAt);
    if (actionPress > 0.001 || refillPress > 0.001 || this.actionPressDirty) {
      this.drawAction(Math.max(0, actionPress), Math.max(0, refillPress));
      this.actionPressDirty = actionPress > 0.001 || refillPress > 0.001;
    }
    if (this.actionCaption !== '') {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(wall - this.actionShownAt, 0.5);
      this.actionRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
      this.refillRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
    } else {
      this.actionRoot.setY(0).setAlpha(1);
      this.refillRoot.setY(0).setAlpha(1);
    }
    if (this.actionCaption === 'WATCH' && !this.summaryShown) {
      const wall = Date.now();
      // localStorage parse every frame showed up in the play-scene profile; the
      // countdown is mm:ss, so a quarter-second poll is tighter than the display.
      if (wall - this.watchPollAt >= 250) {
        this.watchPollAt = wall;
        const health = loadHealth();
        if (
          !this.starting && !this.commerceBusy
          && canBeginAttempt(health, loadProgress(), this.spec.level, wall, monetization().premium())
        ) {
          void this.startRound();
          return;
        }
        const wait = healthHud(viewHealth(health), { premium: monetization().premium() }).wait ?? '';
        if (this.accuracy.text !== wait) this.accuracy.setText(wait);
      }
    }
    // The verdict word rises and fades; one instance, so a quick double replaces rather
    // than stacks.
    const said = now - this.verdictAt;
    if (said >= 0 && said < 0.55) {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(said, 0.45);
      this.verdict.setAlpha(alpha * (1 - Math.max(0, (said - 0.35) / 0.2)))
        .setY(this.verdictY - (1 - rise) * 18 * this.uiScale);
    } else if (this.verdict.alpha !== 0) this.verdict.setAlpha(0);
    if (this.controller?.phase === 'result' && !this.transition && now >= this.finishUnlock && !this.summaryShown) this.showSummary();
    if (this.debugMode) {
      const music = this.audio?.music;
      this.debug.setText(`${this.definition.id} L${this.spec.level} t${this.taskIndex + 1}/${this.spec.tasks.length} ${this.task.bpm}bpm tier${this.task.tier} clear${this.spec.clearAccuracy} rate${music?.playbackRate ?? 1} attempt ${this.attempts} · ${this.controller?.phase ?? 'idle'}\nvoices ${this.audio?.activeSources ?? 0} · handlers ${this.input.listenerCount(Phaser.Input.Events.POINTER_DOWN)} · objects ${this.children.length}\n${this.controller?.result?.accuracy.toFixed(0) ?? '—'}% · ${this.audio?.clock.mode ?? 'locked'} · ${this.game.loop.actualFps.toFixed(0)} fps\n${this.lastJudgement}\nmusic ${music?.activeSources ?? 0} · run ${music?.playbackGeneration ?? 0} · loops ${music?.completedLoops ?? 0}\nstart ${music?.startTime?.toFixed(3) ?? '—'} · length ${music?.duration.toFixed(6) ?? '—'}\ngain ${(music?.gain ?? MUSIC.masterGain).toFixed(3)} · lead ${music?.leadInSeconds.toFixed(3) ?? '—'}`);
    }
  }
  private changeHeadline(text: string, colour = this.definition.ink): void {
    if (this.headline.text === text && this.headlineColour === colour) return;
    this.headlineAt = this.now();
    this.headlineColour = colour;
    this.headline.setText(text).setAlpha(0).setY(this.headlineY + 16 * this.uiScale);
    resize(this.headline, this.headlineSize, colour);
    this.drawTurnSign();
  }
  private setTurn(turn: TurnCue): void {
    this.turn = turn;
    this.drawTurnSign();
  }
  private drawTurnSign(): void {
    const g = this.turnSign.clear();
    if (this.turn === 'none' || this.headline.text === '') {
      this.turnSign.setAlpha(0);
      return;
    }
    const s = this.uiScale;
    const padX = 26 * s;
    const padY = 10 * s;
    const w = Math.max(this.headline.displayWidth + padX * 2, 168 * s);
    const h = Math.max(this.headline.displayHeight + padY * 2, 52 * s);
    const x = this.viewport.safe.centerX - w / 2;
    const y = this.headline.y - padY;
    drawPanel(g, new Rect(x, y, w, h), s, {
      fill: this.turn === 'play' ? PALETTE.coral : SHELL.wood,
      depth: 8,
      radius: 22,
      hero: this.turn === 'play',
    });
    this.turnSign.setAlpha(1);
  }
  private showPhase(phase: Phase): void {
    this.vignette.onPhase(phase, this.now());
    // A lead-in longer than the level's opening bar is the breather, and it is the only
    // place in a level where nothing is being asked of the player.
    const resting = this.task.leadBeats > RHYTHM.leadInBeats;
    if (phase === 'prepare') {
      this.setTurn('watch');
      this.changeHeadline(resting ? 'Breathe' : 'Watch', SHELL.cream);
      this.setAction('');
    }
    if (phase === 'demonstrate') {
      this.setTurn('watch');
      this.changeHeadline('Watch', SHELL.cream);
    }
    // The demonstration runs straight into the response, so this flip is the only thing
    // that tells the player their turn has started. It cannot be deferred a frame. The
    // plaque, the word and the beat track's beads all turn over together.
    if (phase === 'respond') {
      this.turnAt = this.now();
      this.setTurn('play');
      this.changeHeadline('Your turn', SHELL.cream);
      this.setAction('');
      this.demoCount = 0;
      this.struckIndex = -1;
      this.struckAt = this.extraAt = -Infinity;
    }
  }
  private showJudgement(result: Judgement): void {
    this.lastJudgement = `${result.kind} ${result.grade} ${result.deltaMs?.toFixed(0) ?? '—'} ms`;
    if (result.index !== null) this.outcomes[result.index] = markFor(result);
    // An extra tap belongs to no beat, so it shakes the whole row rather than marking one.
    // Held until respond: sinking the nail or flashing Perfect during Watch is the glitch.
    if (this.controller?.phase !== 'respond') {
      this.heldJudgements.push(result);
      return;
    }
    this.presentJudgement(result);
  }
  private presentJudgement(result: Judgement): void {
    this.vignette.onAccuracy(result, this.now());
    // The action sound is scheduled before the tap is graded, so a reaction to the
    // grade needs its own voice. Sound sets that declare neither accent stay silent.
    const now = this.now();
    if (result.kind === 'extra') this.audio?.playAccent(now, 'scrape');
    else if (result.kind === 'omission') this.audio?.playAccent(now, 'judder');
    if (result.kind === 'extra') this.extraAt = now;
    else if (result.kind === 'hit' && result.index !== null) { this.struckIndex = result.index; this.struckAt = now; }
    this.sayVerdict(result, now);
  }
  private releaseHeldJudgements(): void {
    const pending = this.heldJudgements;
    this.heldJudgements = [];
    for (const result of pending) this.presentJudgement(result);
  }

  /**
   * One word at the action, replaced rather than stacked: a quick double would otherwise
   * pile two on top of each other, which the design notes warn against.
   */
  private sayVerdict(result: Judgement, now: number): void {
    const word = result.kind === 'extra' ? 'Miss' : result.grade;
    const colour = this.verdictColour(result);
    this.verdictAt = now;
    this.verdict.setText(word);
    resize(this.verdict, 38 * this.uiScale, colour);
    if (result.grade === 'Perfect' && result.kind === 'hit' && !this.reducedMotion) {
      const { centres } = this.beads();
      const x = this.viewport.safe.centerX + (centres[result.index ?? 0] ?? 0);
      this.fx.burst('sparks', x, this.trackY, [PALETTE.coral, SHELL.cream], 8);
    }
  }
  private verdictColour(result?: Judgement): number {
    if (!result) return this.definition.ink;
    // A darker grey than the track's, because the word is read against whatever the
    // vignette has behind it — on the pale stages the palette's muted all but disappears.
    return result.grade === 'Perfect' ? PALETTE.coral : result.grade === 'Good' ? this.definition.ink : PALETTE.muted;
  }
  /** The bead centres the track is drawn at, so a burst lands on the bead it belongs to. */
  private beads(): { readonly centres: readonly number[]; readonly radius: number } {
    return trackGeometry(this.outcomes.length, this.trackWidth, TRACK.beadGap * this.uiScale, TRACK.beadRadius * this.uiScale);
  }
  /**
   * The beat track. During the example the beads fill as the pattern sounds; on the
   * player's turn the plate turns coral, they empty, and each is struck as it is answered.
   * It replaces a row of dots that only a DEV build with `?debug` ever drew, which is why
   * a shipping player could not tell a Perfect from a Miss — or tell whose turn it was.
   */
  private drawBeatTrack(now: number): void {
    const g = this.marks.clear();
    const phase = this.controller?.phase;
    // The finished row stays up through the ending and goes only when the summary claims
    // the band: the moment the last beat lands is exactly when a player wants to read it.
    if (!phase || phase === 'idle' || phase === 'paused' || this.summaryShown) return;
    const { safe } = this.viewport;
    const s = this.uiScale;
    const still = this.reducedMotion;
    const plan = this.controller?.plan ?? null;
    const ink = this.definition.ink;
    const watching = phase === 'prepare' || phase === 'demonstrate';
    const answering = phase === 'respond';
    const { centres, radius } = this.beads();
    // An extra tap rattles the whole row: it answered no beat, so it marks none.
    const rattle = still ? 0 : settle(now - this.extraAt, 90, 18) * 3 * s;
    const played = beatsPlayed(plan, now);
    const y = this.trackY;

    // The plate. Paper while the game is playing, warmed to coral the moment the turn
    // passes over: the second signal behind the headline, and the one in the player's
    // eyeline, since that is where the beads they are about to strike already are. It is
    // cut to its own phrase rather than to the frame, so a long phrase reads as a long one.
    const span = (centres.at(-1) ?? 0) + radius + 34 * s;
    const width = Math.min(Math.max(span * 2, 220 * s), safe.width - 48 * s);
    const height = TRACK.plateHeight * s;
    const plate = new Rect(safe.centerX - width / 2 + rattle, y - height / 2, width, height);
    const heat = answering ? (still ? 1 : clamp01((now - this.turnAt) / 0.12)) : 0;
    const rest = mix(PALETTE.paper, SHELL.wood, 0.34);
    const hot = mix(PALETTE.paper, PALETTE.coral, 0.42);
    const face = mix(rest, hot, easeOut(heat));
    drawPanel(g, plate, s, { fill: face, depth: TRACK.plateDepth, radius: TRACK.plateRadius });
    if (answering) {
      // A painted line inside the face, the same device the menu's one action carries.
      const inset = 7 * s;
      g.lineStyle(2 * s, PALETTE.coral, 0.7)
        .strokeRoundedRect(plate.x + inset, plate.y + inset, plate.width - inset * 2, plate.height - inset * 2, (TRACK.plateRadius - 7) * s);
    }

    for (let i = 0; i < centres.length; i++) {
      const x = safe.centerX + centres[i]! + rattle;
      const mark = this.outcomes[i] ?? 'pending';
      // A bead swells when the player's tap lands on it.
      const swell = !still && i === this.struckIndex ? squash(now - this.struckAt, 0.22, 0.45) : 0;
      const r = radius * (1 + swell);
      // A miss keeps the empty socket — nothing was put there — and is struck through.
      const lit = watching ? i < played : mark === 'perfect' || mark === 'good';
      const colour = mark === 'perfect' ? PALETTE.coral : ink;
      if (lit) {
        // Good sits inside a full ring, so a Perfect and a Good read apart at a glance.
        const f = faces(colour);
        const fill = mark === 'good' ? r * 0.62 : r;
        g.fillStyle(f.edge, 1).fillCircle(x, y + 2.5 * s, fill);
        g.fillStyle(f.face, 1).fillCircle(x, y, fill);
        g.fillStyle(f.rim, 0.85).fillCircle(x - fill * 0.3, y - fill * 0.35, fill * 0.3);
        if (mark === 'good') g.lineStyle(2.5 * s, shade(ink, -0.1), 0.7).strokeCircle(x, y, r);
      } else {
        // Waiting: a socket sunk into the plate, ringed in coral while it is the player's.
        // Sunk rather than filled: a socket the beat has not arrived in yet.
        g.fillStyle(shade(face, -0.22), 1).fillCircle(x, y, r);
        g.fillStyle(shade(face, 0.04), 1).fillCircle(x, y + r * 0.1, r * 0.88);
        const ring = mark === 'miss' ? PALETTE.muted : answering ? PALETTE.coral : shade(ink, 0.1);
        g.lineStyle(3.5 * s, ring, mark === 'miss' ? 0.95 : answering ? 1 : 0.4).strokeCircle(x, y, r);
        // Struck out in the ink rather than in the grey of the ring, or the bar vanishes
        // into the very bead it is there to cancel.
        if (mark === 'miss') g.lineStyle(4 * s, shade(PALETTE.ink, -0.1), 1).lineBetween(x - r * 1.2, y, x + r * 1.2, y);
      }
    }

    // The count-in: the last four ticks before the example, so the opening bar is not
    // dead air. A breather shows nothing until its final four beats.
    const pips = countIn(plan, now);
    if (pips !== null) {
      const gap = TRACK.pipGap * s;
      const pipY = plate.y - 22 * s;
      for (let i = 0; i < 4; i++) {
        const x = safe.centerX + (i - 1.5) * gap;
        if (i < pips) g.fillStyle(ink, 0.9).fillCircle(x, pipY, TRACK.pipRadius * s);
        else g.lineStyle(2.5 * s, ink, 0.35).strokeCircle(x, pipY, TRACK.pipRadius * s);
      }
    }
  }
  private showResult(result: RoundResult): void {
    const strong = result.accuracy >= this.definition.successAccuracy;
    this.sequence!.complete(result.accuracy);
    this.results[this.taskIndex] = result.accuracy;
    const ending = this.sequence!.ending(this.controller!.plan!.end, this.definition.endingHoldBeats);
    const contact = ending.contact;
    this.vignette.finish(strong, contact, result.accuracy);
    this.audio!.playFinish(contact, strong);
    this.finishUnlock = contact + this.definition.endingSec;
    const last = this.taskIndex >= this.spec.tasks.length - 1;
    this.transition = last ? null : { ...ending, swapped: false };
    if (last) {
      this.audio!.music.setRate(1, ending.next); // back to the source tempo on the next downbeat
      // Record here, not when the summary draws. The summary waits out the coda, and a
      // notification in that window used to route through interrupt() and discard a
      // cleared level entirely.
      this.recordOutcome();
    }
    const partial = this.definition.partial;
    const copy = strong ? this.definition.success : partial && result.accuracy >= partial.minAccuracy ? partial.copy : this.definition.rough;
    this.setTurn('none');
    this.changeHeadline(copy[0]);
    this.accuracy.setText(this.debugMode ? `${Math.round(result.accuracy)}%` : '');
    this.setAction('');
  }
  /** Idempotent: the level is scored and saved once, however often this is reached. */
  private recordOutcome(): void {
    if (this.outcome) return;
    const outcome = recordResult(loadProgress(), this.spec.level, meanAccuracy(this.results));
    this.outcome = outcome;
    this.levelCleared = outcome.cleared;
    this.saveFailed = outcome.cleared && !saveProgress(outcome.progress);
    if (this.attemptId !== null) {
      const finished = finishAttempt(loadHealth(), this.attemptId, outcome.stars);
      this.heartRefunded = finished.refunded;
      saveHealth(finished.health);
    }
  }
  private showSummary(): void {
    this.summaryShown = true;
    this.summaryAt = this.now();
    this.starsLanded = 0;
    this.replay = null;
    const accuracy = meanAccuracy(this.results);
    this.recordOutcome();
    const outcome = this.outcome!;
    this.setTurn('none');
    this.changeHeadline(this.saveFailed ? 'Couldn’t save' : outcome.cleared ? 'Cleared' : 'Again?');
    this.accuracy.setText(`${Math.round(accuracy)}%`);
    this.kept.setText('HEART KEPT').setVisible(this.heartRefunded);
    this.setAction(outcome.cleared ? 'Continue' : 'Try again');
    this.drawStars();
    this.drawTaskMarks();
  }
  /** Quiet progress, not another score counter: a row of beads, the done ones filled. Uses completed tasks, never frame time. */
  private drawTaskMarks(): void {
    const s = this.uiScale, { safe } = this.viewport;
    const count = this.spec.tasks.length;
    const gap = 20 * s, y = safe.top + 58 * s;
    const g = this.taskMarks.clear();
    const f = faces(this.definition.ink);
    for (let i = 0; i < count; i++) {
      const x = safe.centerX + (i - (count - 1) / 2) * gap;
      const done = i < this.taskIndex || this.summaryShown;
      const current = i === this.taskIndex && !this.summaryShown;
      const r = (current ? 5.5 : 4.5) * s;
      g.fillStyle(f.edge, done || current ? 1 : 0.25).fillCircle(x, y + 1.5 * s, r);
      g.fillStyle(done ? f.face : current ? f.lit : SHELL.puck, done || current ? 1 : 0.6).fillCircle(x, y, r);
      if (done || current) g.fillStyle(f.rim, 0.8).fillCircle(x - r * 0.3, y - r * 0.35, r * 0.28);
    }
  }
  private starAt(k: number): { x: number; y: number } {
    return { x: this.viewport.safe.centerX + (k - 1) * 64 * this.uiScale, y: this.trackY - 14 * this.uiScale };
  }
  private drawStars(): void {
    this.stars.clear();
    if (!this.summaryShown) {
      this.kept.setVisible(false);
      return;
    }
    const s = this.uiScale;
    const { safe } = this.viewport;
    // One cream plaque: stars above, the percentage below. They used to float on the
    // timber of the bench, which is why empty outlines vanished and the score looked
    // like a caption from another screen.
    const plateW = 268 * s, plateH = (this.heartRefunded ? 128 : 100) * s;
    const plateY = this.heartRefunded ? this.trackY - 50 * s : this.trackY - plateH / 2;
    drawPanel(this.stars, new Rect(safe.centerX - plateW / 2, plateY, plateW, plateH), s, {
      fill: SHELL.puck, depth: 6, radius: 22,
    });
    const now = this.now();
    const earned = starsFor(meanAccuracy(this.results), this.spec);
    const empty = starColour(false, this.definition.ink, SHELL.puck);
    const exaggeration = STYLE.current.exaggeration;
    const still = this.reducedMotion;
    const chorus = still ? 0 : chorusGlow(now - this.summaryAt, earned);
    const radius = 20 * s;
    for (let k = 0; k < 3; k++) {
      const at = this.starAt(k);
      drawStarMark(this.stars, { x: at.x, y: at.y, radius, color: empty, pose: starPose(8, false, exaggeration) });
      if (k >= earned) continue;
      const age = starAge(now - this.summaryAt, k, still);
      if (age <= 0) continue;
      const pose = starPose(age, true, exaggeration);
      drawStarMark(this.stars, {
        x: at.x, y: at.y, radius, color: prizeColour(empty, pose.fill), pose,
        impactAge: starImpactAge(age, true), chorus,
      });
    }
  }
  /** Medals stamp left to right; an earned one throws confetti and sparks as it lands. */
  private animateStars(now: number): void {
    const earned = starsFor(meanAccuracy(this.results), this.spec);
    const still = this.reducedMotion;
    for (let k = 0; k < 3; k++) {
      const age = starAge(now - this.summaryAt, k, still);
      const pose = starPose(age, k < earned, STYLE.current.exaggeration);
      if (pose.landed && k >= this.starsLanded) {
        this.starsLanded = k + 1;
        const at = this.starAt(k);
        if (k < earned && !still) {
          this.starFx.burst('confetti', at.x, at.y - 8 * this.uiScale, [PALETTE.coral, SHELL.sun, SHELL.cream, STAR_PRIZE], 16);
          this.starFx.burst('sparks', at.x, at.y, [SHELL.sun, 0xffe7a0, PALETTE.coral], 10);
        }
      }
    }
    this.drawStars();
  }
  private leaveForMap(): void {
    if (this.curtain.active) return;
    this.persistAbandonedAttempt();
    // Stop outgoing action voices immediately; the shared music remains the bedding.
    this.controller?.dispose();
    this.transition = null;
    this.replay = null;
    this.audio?.cancel();
    this.audio?.music.setRate(1, this.audio.context.currentTime);
    this.curtain.cover(() => this.scene.start(SceneKey.Map, { focus: this.levelCleared ? this.spec.level + 1 : this.spec.level }));
  }
  private showNoHearts(): void {
    this.starting = false;
    if (monetization().premium()) return;
    this.setTurn('none');
    this.changeHeadline('No hearts');
    const wait = healthHud(viewHealth(loadHealth()), { premium: monetization().premium() }).wait;
    if (!this.summaryShown) this.accuracy.setText(wait === null ? '' : wait);
    this.setAction('WATCH');
    if (!this.emptyTracked) {
      this.emptyTracked = true;
      track('health_empty', { level: this.spec.level });
    }
    if (!this.watchOfferTracked) {
      this.watchOfferTracked = true;
      track('rewarded_offer_shown', { placement: 'play' });
    }
    if (!this.purchaseOfferTracked) {
      this.purchaseOfferTracked = true;
      track('purchase_offer_shown', { product: PRODUCT.heartRefill });
    }
  }

  private async watchAd(): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    const claimId = `play:${++this.watchClaims}`;
    try {
      const result = await monetization().showRewarded();
      if (result.ok) redeemHeart(claimId);
      if (this.disposed) return;
      if (!result.ok) {
        this.accuracy.setText(rewardedFeedback(result.reason));
        return;
      }
      void this.startRound();
    } finally {
      this.commerceBusy = false;
    }
  }

  private async buyFill(): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    try {
      const result = await monetization().purchase(PRODUCT.heartRefill);
      if (result.ok) {
        const filled = redeemFill(result.claimId);
        if (this.disposed) return;
        if (!filled.granted && filled.health.hearts <= 0) {
          this.accuracy.setText(purchaseFeedback('failed'));
          return;
        }
      } else {
        if (this.disposed) return;
        this.accuracy.setText(purchaseFeedback(result.reason));
        return;
      }
      if (this.disposed) return;
      void this.startRound();
    } finally {
      this.commerceBusy = false;
    }
  }

  private showPause(): void {
    this.vignette.pause();
    this.setTurn('none');
    this.changeHeadline('Paused');
    this.setAction('Resume');
  }
  private interrupt(): void {
    ++this.startRequest;
    this.replay = null;
    this.replayOffset = null;
    this.transition = null;
    const wasStarting = this.starting;
    this.starting = false;
    this.taps.reset();
    const wasEnding = this.controller?.phase === 'result';
    const wasRunning = this.controller !== null && this.controller.phase !== 'idle';
    this.controller?.interrupt('Paused');
    if (wasEnding || wasStarting) { this.controller?.dispose(); this.showPause(); }
    this.audio?.cancel();
    this.audio?.music.stop();
    // Freezing the idle illustration would leave it stuck until the next round begins.
    if (wasRunning || wasStarting) this.vignette.pause();
  }
  private persistAbandonedAttempt(): void {
    if (this.attemptId === null) return;
    saveHealth(abandonAttempt(loadHealth(), this.attemptId));
  }

  private readonly visibility = (): void => {
    if (document.hidden && !this.commerceBusy) this.interrupt();
  };
  private readonly pageHide = (): void => {
    if (!this.commerceBusy) this.interrupt();
  };
  private readonly audioState = (): void => { if (this.audio?.context.state !== 'running') this.interrupt(); };
  private checkOrientation(): void { if (this.blocked()) this.interrupt(); }
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    ++this.startRequest;
    if (this.pump !== null) clearInterval(this.pump);
    this.pump = null;
    this.persistAbandonedAttempt();
    this.taps.dispose();
    this.replayPanel?.remove();
    this.replayPanel = null;
    this.controller?.dispose();
    this.vignette.destroy();
    this.fx.destroy();
    this.starFx.destroy();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.pageHide);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.controller = null;
    this.audio?.context.removeEventListener('statechange', this.audioState);
    // The engine and its music belong to the game (see sharedAudio); only this scene's voices stop.
    this.audio?.cancel();
    this.audio = null;
  }
}
