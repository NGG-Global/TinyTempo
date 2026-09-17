import Phaser from 'phaser';
import { breadcrumb, reportError, setErrorContext } from '@/core/errors';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import type { AudioEngine } from '@/audio/AudioEngine';
import { sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { MUSIC } from '@/config/music';
import { canPlaceNextTask, TaskSequence } from '@/game/TaskSequence';
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
  abandonAttempt, beginAttempt, canBeginAttempt, canClaimDailyHeart, createAttemptId, finishAttempt,
  HEALTH, HEALTH_COPY, healthHud, heartProgress, type Health, loadHealth, redeemDailyHeart, redeemFill, redeemHeart, saveHealth, viewHealth,
} from '@/game/health';
import { monetization, PRODUCT, purchaseFeedback, rewardedFeedback, STORE_COPY, track } from '@/monetization';
import { loadProgress, recordResult, saveProgress, type LevelOutcome } from '@/game/progress';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { drawHeart, drawInfinity, drawMap, drawRestart, drawSpeaker } from '@/ui/icons';
import { faces } from '@/ui/light';
import { mix, shade, starColour } from '@/ui/colour';
import { CHROME, drawActionDisc, drawHeartRow, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { BRASS, drawPanel, placeSurface, Rect, surface } from '@/ui/panel';
import { Feedback } from '@/ui/feedback';
import { Sheen } from '@/ui/sheen';
import { arrive, settle, squash } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';
import { drawStarMark, prizeColour, STAR_PRIZE } from '@/ui/star';
import { chorusBurst, chorusGlow, plaqueJolt, plaquePose, starAge, starImpactAge, starPose } from '@/ui/starReveal';
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
/**
 * The result plaque, in design units at scale 1. It hangs from two ropes above the
 * vignette and the medals straddle its top edge, half on the board and half off it, so
 * the brass reads as struck into the plaque rather than laid out on a shelf.
 */
const PLATE = {
  width: 624,
  ropeLength: 130,
  /** From the plaque's top edge down to the centre of a medal. */
  medalY: 22,
  medalRadius: 62,
  medalGap: 202,
  /** Local offsets from the plaque's top edge. */
  scoreY: 162,
  noteY: 228,
  keptY: 282,
  height: 268,
  keptHeight: 328,
  keptWidth: 300,
} as const;

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
  private scoreValue!: Phaser.GameObjects.Text;
  private scoreNote!: Phaser.GameObjects.Text;
  /** Ceiling anchor the plaque and its ropes swing about; local (0,0) of `stars`. */
  private plaqueAt = { x: 0, y: 0 };
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
  private plusOne!: Phaser.GameObjects.Text;
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
  private premiumRoot!: Phaser.GameObjects.Container;
  private premiumPlate!: Phaser.GameObjects.Graphics;
  private premiumLabel!: Phaser.GameObjects.Text;
  private premiumPrice!: Phaser.GameObjects.Text;
  private premiumSheen!: Sheen;
  private premiumRect = new Phaser.Geom.Rectangle();
  private premiumPressedAt = -Infinity;
  /** Dims the vignette behind the out-of-hearts offer, so the offer is the only lit thing. */
  private scrim!: Phaser.GameObjects.Graphics;
  private emptyHearts!: Phaser.GameObjects.Graphics;
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
  private headlineColour = SHELL.cream;
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
    // The two facts that make a stack trace legible: which level, and which act drew it.
    setErrorContext('level', this.spec.level);
    setErrorContext('act', this.spec.vignette);
    this.vignette = this.definition.create(this, this.spec.lap);
    const ink = this.definition.ink;
    this.stars = this.add.graphics().setDepth(9);
    this.fx = new Feedback(this, 5);
    this.starFx = new Feedback(this, 12);
    this.turnSign = this.add.graphics().setDepth(11);
    this.headline = display(this, this.definition.intro, { size: 88, colour: SHELL.cream, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.accuracy = body(this, '', { size: 34, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(11);
    this.kept = label(this, 'Heart kept', { size: 22, colour: shade(BRASS, -0.62), align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.scoreValue = display(this, '', { size: 104, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.scoreNote = label(this, 'On the beat', { size: 22, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.chrome = this.add.graphics().setDepth(10);
    this.actionRoot = this.add.container(0, 0).setDepth(10);
    this.action = this.add.graphics();
    this.actionSurface = surface(this, MaterialKey.cloth, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, PALETTE.coral, 0.35);
    this.actionLabel = display(this, '', { size: 40, colour: SHELL.cream, align: 'center' }).setOrigin(0.5);
    this.actionHint = label(this, '', { size: 22, colour: SHELL.cream }).setOrigin(0, 0.5);
    this.plusOne = display(this, '+1', { size: 36, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setVisible(false);
    this.actionHeart = this.add.graphics();
    this.actionRoot.add([this.action, this.actionSurface, this.actionLabel, this.actionHint, this.plusOne, this.actionHeart]);
    this.refillRoot = this.add.container(0, 0).setDepth(10);
    this.refill = this.add.graphics();
    this.refillLabel = label(this, 'REFILL', { size: 28, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5);
    this.refillHint = label(this, 'RESTORE 5', { size: 20, colour: PALETTE.ink, align: 'center' }).setOrigin(1, 0.5);
    this.refillPrice = body(this, '', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5);
    this.refillMark = this.add.graphics();
    this.refillRoot.add([this.refill, this.refillLabel, this.refillHint, this.refillPrice, this.refillMark]);
    this.premiumRoot = this.add.container(0, 0).setDepth(10);
    this.premiumPlate = this.add.graphics();
    this.premiumLabel = display(this, 'Premium', { size: 36, colour: SHELL.cream, outline: shade(BRASS, -0.62), align: 'center' }).setOrigin(0.5);
    this.premiumPrice = label(this, '', { size: 23, colour: shade(BRASS, -0.62), align: 'center' }).setOrigin(0.5);
    this.premiumSheen = new Sheen(this, 10);
    this.premiumRoot.add([this.premiumPlate, this.premiumLabel, this.premiumPrice]);
    this.scrim = this.add.graphics().setDepth(7).setVisible(false);
    this.emptyHearts = this.add.graphics().setDepth(11).setVisible(false);
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
    const { safe, full } = this.viewport;
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
    this.placeBlocks();
    this.drawAction(0);
    this.actionPressDirty = true;
    this.scrim.clear().fillStyle(0x1a201c, 0.5).fillRect(full.x, full.y, full.width, full.height);
    resize(this.accuracy, 34 * s, ink, STYLE.current, false);
    this.accuracy.setWordWrapWidth(Math.min(560 * s, safe.width - 64 * s), false);
    this.accuracy.setLineSpacing(-4 * s);
    this.placeWaitCopy();
    // The plaque hangs from just under the headline. It is clamped off the action block
    // rather than centred, because on a tall handset the block stays by the thumb and the
    // space that opens up belongs to the vignette, not to the result.
    const plaqueH = (this.heartRefunded ? PLATE.keptHeight : PLATE.height) * s;
    const rig = PLATE.ropeLength * s + plaqueH;
    const bandTop = safe.top + 300 * s;
    const bandBottom = this.actionRect.y - 44 * s;
    // Hangs just under the headline on a 16:9 frame, and takes a fifth of whatever a taller
    // handset adds — enough that the plaque does not float at the top of a long screen,
    // little enough that the space left under it still belongs to the act.
    const free = Math.max(0, bandBottom - bandTop - rig);
    this.plaqueAt = { x: safe.centerX, y: Math.max(safe.top + 220 * s, bandTop + free * 0.22) };
    this.drawStars();
    this.drawTaskMarks();
  }
  /**
   * Where the blocks sit. Two arrangements, because the out-of-hearts screen is not the
   * result screen with an extra button on it: the offer wants a tall Watch with the two
   * paid ways out beneath it, and the headline drops to make room for the empty hearts.
   */
  private placeBlocks(): void {
    const s = this.uiScale;
    const { safe } = this.viewport;
    const offering = this.offeringHeart();
    const width = CHROME.block.width * s;
    const left = safe.centerX - width / 2;
    if (offering) {
      const pairH = Math.max(128 * s, this.controlSize);
      const pairY = safe.bottom - 84 * s - pairH;
      const gap = 16 * s;
      const half = (width - gap) / 2;
      this.refillRect.setTo(left, pairY, half, pairH);
      this.premiumRect.setTo(left + half + gap, pairY, half, pairH);
      const blockH = Math.max(156 * s, this.controlSize);
      this.actionRect.setTo(left, pairY - 24 * s - blockH, width, blockH);
      this.headlineY = safe.top + 304 * s;
    } else {
      const blockH = Math.max(96 * s, this.controlSize);
      this.actionRect.setTo(left, safe.bottom - 72 * s - blockH, width, blockH);
      this.refillRect.setTo(0, 0, 0, 0);
      this.premiumRect.setTo(0, 0, 0, 0);
      this.headlineY = safe.top + 84 * s;
    }
    this.headline.setY(this.headlineY);
    this.premiumSheen.place(this.premiumRect, Math.min(this.premiumRect.height / 2, STYLE.current.radius * s), 4.2);
    this.drawEmptyHearts();
    this.placeWaitCopy();
  }

  /** Five outlines over the dimmed vignette: what is gone, stated before what it costs. */
  private drawEmptyHearts(): void {
    const offering = this.offeringHeart();
    this.emptyHearts.setVisible(offering);
    this.scrim.setVisible(offering);
    const g = this.emptyHearts.clear();
    if (!offering) return;
    const s = this.uiScale;
    const view = viewHealth(loadHealth());
    drawHeartRow(g, {
      centreX: this.viewport.safe.centerX, y: this.viewport.safe.top + 247 * s,
      count: view.maxHearts, radius: 23 * s, gap: 60 * s,
      filled: view.hearts, part: heartProgress(view),
      full: PALETTE.coral, empty: SHELL.cream, emptyAlpha: 0.18, emptyOutline: SHELL.cream,
    });
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
    const offering = this.offeringHeart();
    this.actionRoot.setVisible(shown);
    this.refillRoot.setVisible(offering);
    this.premiumRoot.setVisible(offering && !monetization().premium());
    this.premiumSheen.setVisible(offering && !monetization().premium());
    if (!shown) {
      this.refill.clear();
      this.refillMark.clear();
      this.premiumPlate.clear();
      return;
    }
    const s = this.uiScale;
    const g = this.action.clear();
    const r = this.actionRect;
    drawPanel(g, r, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press, hero: true });
    const sink = CHROME.block.depth * s * press * 0.8;
    placeSurface(this.actionSurface, r, s, sink);
    this.actionHint.setVisible(offering);
    this.actionHeart.clear();
    if (offering) {
      // A rewarded watch is an offer, not a verdict: the disc says a video starts, the
      // second line says how long it takes, and the chip says exactly what it buys.
      const discR = 44 * s;
      const discX = r.x + 30 * s + discR;
      drawActionDisc(g, discX, r.centerY + sink, discR, s);
      const today = this.actionCaption === 'TODAY';
      this.actionLabel.setText(today ? 'Today' : STORE_COPY.watchTitle);
      resize(this.actionLabel, 50 * s, SHELL.cream);
      this.actionLabel.setOrigin(0, 0.5).setPosition(discX + discR + 26 * s, r.centerY - 22 * s + sink);
      this.actionHint.setText(today ? STORE_COPY.dailyTerms : STORE_COPY.watchNow);
      resize(this.actionHint, 22 * s, mix(SHELL.cream, PALETTE.coral, 0.2), STYLE.current, false);
      this.actionHint.setOrigin(0, 0.5).setPosition(discX + discR + 26 * s, r.centerY + 26 * s + sink);
      // The chip: a struck recess on the block's own colour, so it reads as part of it.
      const chipW = 116 * s, chipH = 64 * s;
      const chipX = r.right - 26 * s - chipW;
      g.fillStyle(shade(PALETTE.coral, -0.5), 0.55)
        .fillRoundedRect(chipX, r.centerY - chipH / 2 + sink, chipW, chipH, 18 * s);
      this.plusOne.setVisible(true);
      resize(this.plusOne, 36 * s, SHELL.cream);
      this.plusOne.setPosition(chipX + 38 * s, r.centerY + sink);
      drawHeart(this.actionHeart, chipX + chipW - 34 * s, r.centerY + sink, 17 * s, SHELL.cream, 1, shade(PALETTE.coral, -0.6));
      this.drawRefill(refillPress);
      this.drawPremium(0);
    } else {
      this.plusOne.setVisible(false);
      this.refill.clear();
      this.refillMark.clear();
      this.premiumPlate.clear();
      this.actionHint.setVisible(false);
      this.actionLabel.setText(this.actionCaption);
      resize(this.actionLabel, 40 * s, SHELL.cream);
      // Continue carries the same disc the map's next-level block does, on the right of
      // the word: the level is over and this is the way on, not a retry.
      const forward = this.actionCaption === 'Continue';
      const discR = forward ? 30 * s : 0;
      const span = this.actionLabel.width + (forward ? discR * 2 + 20 * s : 0);
      this.actionLabel.setOrigin(0.5).setPosition(r.centerX - span / 2 + this.actionLabel.width / 2, r.centerY + sink);
      if (forward) drawActionDisc(g, r.centerX + span / 2 - discR, r.centerY + sink, discR, s);
    }
    this.placeWaitCopy();
  }

  /** The left half of the pair under Watch: the same five hearts, bought outright. */
  private drawRefill(press: number): void {
    const s = this.uiScale;
    const r = this.refillRect;
    const g = this.refill.clear();
    if (r.width <= 0) { this.refillMark.clear(); return; }
    drawPanel(g, r, s, { fill: SHELL.bench, depth: 12, press });
    const sink = 12 * s * press * 0.8;
    this.refillLabel.setText(`Refill ${HEALTH.max}`);
    resize(this.refillLabel, 34 * s, PALETTE.ink, STYLE.current, false);
    this.refillLabel.setPosition(r.centerX, r.centerY - 18 * s + sink);
    const price = monetization().productPrice(PRODUCT.heartRefill) ?? '';
    this.refillPrice.setText(price);
    resize(this.refillPrice, 25 * s, PALETTE.muted, STYLE.current, false);
    this.refillPrice.setPosition(r.centerX, r.centerY + 24 * s + sink).setVisible(price !== '');
    this.refillHint.setVisible(false);
    this.refillMark.clear();
  }

  /** The right half: the offer that ends the wait rather than paying it off once. */
  private drawPremium(press: number): void {
    const s = this.uiScale;
    const r = this.premiumRect;
    const g = this.premiumPlate.clear();
    if (r.width <= 0 || monetization().premium()) return;
    drawPanel(g, r, s, { fill: BRASS, depth: 12, press, hero: true, frame: SHELL.cream });
    const sink = 12 * s * press * 0.8;
    const cream = SHELL.cream;
    resize(this.premiumLabel, 36 * s, cream);
    const markR = 20 * s;
    const span = markR * 2 + 12 * s + this.premiumLabel.width;
    drawInfinity(g, r.centerX - span / 2 + markR, r.centerY - 18 * s + sink, markR, cream);
    this.premiumLabel.setPosition(r.centerX - span / 2 + markR * 2 + 12 * s + this.premiumLabel.width / 2, r.centerY - 18 * s + sink);
    const price = monetization().productPrice(PRODUCT.premium);
    this.premiumPrice.setText(price === null ? 'No ads' : `${price} · no ads`);
    resize(this.premiumPrice, 23 * s, shade(BRASS, -0.62), STYLE.current, false);
    this.premiumPrice.setPosition(r.centerX, r.centerY + 24 * s + sink);
  }

  private placeWaitCopy(): void {
    const s = this.uiScale;
    const offering = this.offeringHeart();
    const y = offering ? this.viewport.safe.top + 470 * s : this.trackY + 28 * s;
    this.accuracy.setPosition(this.viewport.safe.centerX, y);
    // Cream on the dimmed vignette; the act's own ink everywhere else.
    resize(this.accuracy, (offering ? 30 : 34) * s, offering ? SHELL.cream : this.definition.ink, STYLE.current, false);
  }

  private setAction(caption: string): void {
    if (this.actionCaption === caption) return;
    if (caption !== '' && this.actionCaption === '') this.actionShownAt = performance.now() / 1000;
    this.actionCaption = caption;
    this.placeBlocks();
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
    breadcrumb('level started', { level: this.spec.level, act: this.spec.vignette, attempt: this.attempts + 1 });
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
    if (this.offeringHeart() && Phaser.Geom.Rectangle.Contains(this.refillRect, tap.x, tap.y)) {
      this.refillPressedAt = performance.now() / 1000;
      this.actionPressDirty = true;
      void this.buyFill();
      return;
    }
    if (this.offeringHeart() && !monetization().premium()
      && Phaser.Geom.Rectangle.Contains(this.premiumRect, tap.x, tap.y)) {
      this.premiumPressedAt = performance.now() / 1000;
      this.actionPressDirty = true;
      void this.buyPremium();
      return;
    }
    if (this.actionCaption !== '' && Phaser.Geom.Rectangle.Contains(this.actionRect, tap.x, tap.y)) {
      this.actionPressedAt = performance.now() / 1000;
      this.actionPressDirty = true;
      if (this.actionCaption === 'TODAY') { this.claimToday(); return; }
      if (this.actionCaption === 'WATCH') { void this.watchAd(); return; }
      if (this.actionCaption === 'Map') { this.leaveForMap(); return; }
    }
    const phase = this.controller?.phase ?? 'idle';
    if (phase === 'idle' || phase === 'paused') {
      if (this.offeringHeart()) return;
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
    if (this.audio.context.state !== 'running') {
      // A Bluetooth rebuffer can suspend the context for a frame when the player first
      // sounds. Interrupting here ended the response while the demonstration — whose
      // voices were already scheduled — had played in time.
      this.audio.recover();
      return;
    }
    this.audio.clock.refresh();
    const transition = this.transition;
    if (transition && this.now() >= transition.swap && !transition.swapped) {
      // Read on the context clock, which is what the cues below are scheduled against;
      // this tick arrived on the audible one, an output latency behind it.
      if (!canPlaceNextTask(this.audio.context.currentTime, transition.next)) { this.interrupt(); return; }
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
    if (this.summaryShown) this.animateStars(now);
    else this.accuracy.setAlpha(1);
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
    const premiumPress = pressAmount(wall, this.premiumPressedAt);
    if (actionPress > 0.001 || refillPress > 0.001 || premiumPress > 0.001 || this.actionPressDirty) {
      this.drawAction(Math.max(0, actionPress), Math.max(0, refillPress));
      this.drawPremium(Math.max(0, premiumPress));
      this.actionPressDirty = actionPress > 0.001 || refillPress > 0.001 || premiumPress > 0.001;
    }
    if (this.offeringHeart()) this.premiumSheen.update(wall, !monetization().premium());
    if (this.actionCaption !== '') {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(wall - this.actionShownAt, 0.5);
      this.actionRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
      this.refillRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
    } else {
      this.actionRoot.setY(0).setAlpha(1);
      this.refillRoot.setY(0).setAlpha(1);
    }
    if (this.offeringHeart() && !this.summaryShown) {
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
        const copy = this.waitCopy(health);
        if (this.accuracy.text !== copy) this.accuracy.setText(copy);
        this.drawEmptyHearts();
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
  private changeHeadline(text: string, colour = SHELL.cream): void {
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
    // The sign exists to tell Watch from Your turn as two objects rather than two colours.
    // Outside a round there is no phase to tell apart, and a plate behind Cleared or No
    // hearts only boxes in a headline that the backdrop already sets off.
    if (this.headline.text === '' || this.turn === 'none') {
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
    this.turnSign.setAlpha(this.headline.alpha);
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
    // The player is told, but nobody else was: a device whose storage is blocked loses
    // every level it clears, and that is invisible from the outside without this.
    if (this.saveFailed) {
      reportError(new Error('Progress save failed'), {
        context: { level: this.spec.level, unlocked: outcome.progress.unlocked },
      });
    }
    if (this.attemptId !== null) {
      const finished = finishAttempt(loadHealth(), this.attemptId, outcome.stars);
      this.heartRefunded = finished.refunded;
      saveHealth(finished.health);
    }
  }
  private showSummary(): void {
    this.summaryShown = true;
    breadcrumb('level finished', {
      level: this.spec.level,
      accuracy: Math.round(meanAccuracy(this.results)),
      attempts: this.attempts,
    });
    this.summaryAt = this.now();
    this.starsLanded = 0;
    this.replay = null;
    const accuracy = meanAccuracy(this.results);
    this.recordOutcome();
    const outcome = this.outcome!;
    this.setTurn('none');
    this.changeHeadline(this.saveFailed ? 'Couldn’t save' : outcome.cleared ? 'Cleared' : 'Again?');
    this.scoreValue.setText(`${Math.round(accuracy)}%`);
    this.accuracy.setText('');
    this.kept.setVisible(this.heartRefunded);
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
  /** Medal `k` in the plaque's own space, measured from the ceiling anchor. */
  private medalLocal(k: number): { x: number; y: number } {
    const s = this.uiScale;
    return { x: (k - 1) * PLATE.medalGap * s, y: (PLATE.ropeLength + PLATE.medalY) * s };
  }

  /** The same point in world space, once the plaque has swung and taken its knocks. */
  private hangAt(lx: number, ly: number, tilt: number, drop: number): { x: number; y: number } {
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    return { x: this.plaqueAt.x + lx * cos - ly * sin, y: this.plaqueAt.y + drop + lx * sin + ly * cos };
  }

  /** Hangs a text from the same anchor, so the whole rig moves as one object. */
  private hangText(text: Phaser.GameObjects.Text, lx: number, ly: number, tilt: number, drop: number, alpha: number): void {
    const at = this.hangAt(lx, ly, tilt, drop);
    text.setPosition(at.x, at.y).setRotation(tilt).setAlpha(alpha);
  }

  /**
   * The result plaque. It was a small cream plate parked on the beat track with three
   * 20-unit stars in a row on it, which read as a caption rather than as the end of the
   * level. It now hangs from the ceiling on two ropes, drops into place, and the medals —
   * two and a half times the size, straddling its top edge — knock it down a little as
   * each one stamps. Nothing here decides anything: `starsFor` has already scored the
   * level and `starReveal.ts` supplies every pose as `f(t)`.
   */
  private drawStars(): void {
    this.stars.clear().setPosition(0, 0).setRotation(0);
    const shown = this.summaryShown;
    this.kept.setVisible(shown && this.heartRefunded);
    this.scoreValue.setVisible(shown);
    this.scoreNote.setVisible(shown);
    if (!shown) return;
    const s = this.uiScale;
    const still = this.reducedMotion;
    const age = this.now() - this.summaryAt;
    const earned = starsFor(meanAccuracy(this.results), this.spec);
    const exaggeration = STYLE.current.exaggeration;
    const pose = plaquePose(age, still);
    const jolt = still ? 0 : plaqueJolt(age, earned, exaggeration);
    const plaqueH = (this.heartRefunded ? PLATE.keptHeight : PLATE.height) * s;
    const drop = (pose.drop + jolt) * plaqueH;
    const width = Math.min(PLATE.width * s, this.viewport.safe.width - 40 * s);
    const top = PLATE.ropeLength * s;
    const g = this.stars;
    g.setPosition(this.plaqueAt.x, this.plaqueAt.y + drop).setRotation(pose.tilt).setAlpha(pose.alpha);

    // The chorus: a fan of light behind the whole plaque, thrown by the third medal only.
    const burst = still ? { scale: 0, alpha: 0, spin: 0 } : chorusBurst(age, earned);
    if (burst.alpha > 0.01) {
      const centre = { x: 0, y: top + plaqueH * 0.4 };
      const reach = width * 0.92 * burst.scale;
      for (let i = 0; i < 12; i++) {
        const a = burst.spin + i * Math.PI / 6;
        const spread = 0.09;
        g.fillStyle(0xffe7a0, burst.alpha * 0.5);
        g.fillTriangle(
          centre.x + Math.cos(a) * reach * 0.3, centre.y + Math.sin(a) * reach * 0.3,
          centre.x + Math.cos(a - spread) * reach, centre.y + Math.sin(a - spread) * reach,
          centre.x + Math.cos(a + spread) * reach, centre.y + Math.sin(a + spread) * reach,
        );
      }
    }

    drawRopes(g, s, top, [-width / 2 + 62 * s, width / 2 - 62 * s], 7);
    drawPanel(g, new Rect(-width / 2, top, width, plaqueH), s, {
      fill: SHELL.cream, depth: 12, radius: 40, hero: true,
    });

    const empty = starColour(false, this.definition.ink, SHELL.cream);
    const radius = PLATE.medalRadius * s;
    for (let k = 0; k < 3; k++) {
      const at = this.medalLocal(k);
      drawStarMark(g, { x: at.x, y: at.y, radius, color: empty, pose: starPose(8, false, exaggeration) });
      if (k >= earned) continue;
      const local = starAge(age, k, still);
      if (local <= 0) continue;
      const medal = starPose(local, true, exaggeration);
      drawStarMark(g, {
        x: at.x, y: at.y, radius, color: prizeColour(empty, medal.fill), pose: medal,
        impactAge: starImpactAge(local, true), chorus: still ? 0 : chorusGlow(age, earned),
      });
    }

    resize(this.scoreValue, 104 * s, PALETTE.ink);
    resize(this.scoreNote, 22 * s, PALETTE.muted, STYLE.current, false);
    this.hangText(this.scoreValue, 0, top + PLATE.scoreY * s, pose.tilt, drop, pose.alpha);
    this.hangText(this.scoreNote, 0, top + PLATE.noteY * s, pose.tilt, drop, pose.alpha);
    if (!this.heartRefunded) return;
    // A refunded heart is brass on brass: a small struck plate, not a coral caption.
    const keptW = PLATE.keptWidth * s, keptH = 60 * s, keptY = top + PLATE.keptY * s;
    drawPanel(g, new Rect(-keptW / 2, keptY - keptH / 2, keptW, keptH), s, { fill: BRASS, depth: 5, radius: 18 });
    drawHeart(g, -keptW / 2 + 42 * s, keptY, 17 * s, PALETTE.coral);
    resize(this.kept, 22 * s, shade(BRASS, -0.62), STYLE.current, false);
    this.hangText(this.kept, 14 * s, keptY, pose.tilt, drop, pose.alpha);
  }
  /** Medals stamp left to right; an earned one throws confetti and sparks as it lands. */
  private animateStars(now: number): void {
    const earned = starsFor(meanAccuracy(this.results), this.spec);
    const still = this.reducedMotion;
    const summaryAge = now - this.summaryAt;
    const pose = plaquePose(summaryAge, still);
    const drop = (pose.drop + (still ? 0 : plaqueJolt(summaryAge, earned, STYLE.current.exaggeration)))
      * (this.heartRefunded ? PLATE.keptHeight : PLATE.height) * this.uiScale;
    for (let k = 0; k < 3; k++) {
      const age = starAge(summaryAge, k, still);
      const medal = starPose(age, k < earned, STYLE.current.exaggeration);
      if (!medal.landed || k < this.starsLanded) continue;
      this.starsLanded = k + 1;
      if (k >= earned || still) continue;
      // The burst leaves from where the medal actually struck, which on a swinging
      // plaque is not where it was laid out.
      const local = this.medalLocal(k);
      const at = this.hangAt(local.x, local.y, pose.tilt, drop);
      this.starFx.burst('confetti', at.x, at.y - 8 * this.uiScale, [PALETTE.coral, SHELL.sun, SHELL.cream, STAR_PRIZE], 16);
      this.starFx.burst('sparks', at.x, at.y, [SHELL.sun, 0xffe7a0, PALETTE.coral], 10);
      vibrate('stamp');
      // A clean sweep throws one more burst, over the whole plaque rather than one medal.
      if (k === 2 && earned >= 3) {
        const crest = this.hangAt(0, PLATE.ropeLength * this.uiScale, pose.tilt, drop);
        this.starFx.burst('confetti', crest.x, crest.y, [PALETTE.coral, SHELL.sun, SHELL.cream, STAR_PRIZE], 26);
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
    const health = loadHealth();
    if (!this.summaryShown) this.accuracy.setText(this.waitCopy(health));
    this.setAction(canClaimDailyHeart(health) ? 'TODAY' : 'WATCH');
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

  /**
   * What the empty screen says under its headline. The countdown leads, because it is the
   * one fact that changes while the player is looking at it; the reminder that finished
   * levels stay open follows, since it is what makes waiting bearable.
   */
  private waitCopy(health: Health): string {
    const wait = healthHud(viewHealth(health), { premium: monetization().premium() }).wait;
    return wait === null ? HEALTH_COPY.playNote : `Next one in ${wait}\n${HEALTH_COPY.playNote}`;
  }

  private offeringHeart(): boolean {
    return this.actionCaption === 'WATCH' || this.actionCaption === 'TODAY';
  }

  private claimToday(): void {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    try {
      const result = redeemDailyHeart();
      if (this.disposed) return;
      if (!result.granted) {
        this.setAction('WATCH');
        this.accuracy.setText(HEALTH_COPY.playNote);
        return;
      }
      void this.startRound();
    } finally {
      this.commerceBusy = false;
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

  /**
   * Premium from the mid-run offer. Entitlement lifts the heart cost entirely, so a
   * successful purchase drops straight back into the level the player was stopped on —
   * the same landing a refill gets, for the same reason.
   */
  private async buyPremium(): Promise<void> {
    if (this.commerceBusy || this.curtain.active || monetization().premium()) return;
    this.commerceBusy = true;
    track('purchase_offer_shown', { product: PRODUCT.premium });
    try {
      const result = await monetization().purchase(PRODUCT.premium);
      if (this.disposed) return;
      if (!result.ok) {
        this.accuracy.setText(purchaseFeedback(result.reason));
        return;
      }
      vibrate('stamp');
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
  private readonly audioState = (): void => { this.audio?.recover(); };
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
    this.premiumSheen.destroy();
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
