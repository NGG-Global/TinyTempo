import Phaser from 'phaser';
import { breadcrumb, reportError, setErrorContext } from '@/core/errors';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import type { AudioEngine, FinishOutcome } from '@/audio/AudioEngine';
import { setMusicBed } from '@/audio/musicBed';
import { sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { samples } from '@/audio/samples';
import { MUSIC } from '@/config/music';
import { canPlaceNextTask, TaskSequence } from '@/game/TaskSequence';
import { SceneKey } from '@/config/scenes';
import { LAYOUT } from '@/config/design';
import { RHYTHM } from '@/config/rhythm';
import { BaseScene } from '@/core/BaseScene';
import { wrongOrientation } from '@/core/shell';
import { RoundController, pauseShouldShowSummary, type Phase } from '@/game/RoundController';
import { createRoundPlan, type RoundPlan } from '@/rhythm/RhythmScheduler';
import type { RoundResult } from '@/game/scoring';
import { TapInput, type Tap } from '@/input/TapInput';
import { MaterialKey } from '@/textures/materials';
import type { Judgement } from '@/rhythm/judge';
import { beatsPlayed, countIn, GHOST_FADE, ghostRing, handover, isFlawless, isLastRestBar, markFor, restCopy, restProgress, trackGeometry, turnCount, turnCountPose, type Handover, type Mark, type RestProgress } from '@/game/beatTrack';
import { breatherTask, levelSpec, meanAccuracy, starsFor, type Grid, type LevelSpec } from '@/game/levels';
import { areaFinale } from '@/game/finale';
import { advanceGroove, GROOVE_START, isMastered, type GrooveState } from '@/game/groove';
import { GrooveStage } from '@/ui/grooveStage';
import { MASTERY, masteryPose } from '@/ui/groove';
import { createGrooveVoices, type GrooveVoices } from '@/audio/grooveSounds';
import { objectiveContext, objectiveReport, recordObjectives } from '@/game/objectives';
import { syncAchievements } from '@/playgames/achievementSync';
import { appReview, createContinuation, type Continuation } from '@/review';
import { createFinaleSound } from '@/audio/finaleSounds';
import { PROGRESSION } from '@/config/progression';
import type { Pattern } from '@/rhythm/patterns';
import {
  abandonAttempt, beginAttempt, canBeginAttempt, canClaimDailyHeart, createAttemptId, finishAttempt,
  HEALTH, HEALTH_COPY, healthHud, heartProgress, type Health, loadHealth, redeemDailyHeart, redeemFill, redeemHeart, saveHealth, viewHealth,
} from '@/game/health';
import { monetization, PRODUCT, purchaseFeedback, rewardedFeedback, STORE_COPY, track } from '@/monetization';
import {
  guidedLevel, loadProgress, markDemonstrationSeen, markReplayTipSeen, markSubdivisionSeen, recordResult, saveProgress,
  markScrapbookSeen, seenDemonstration, seenReplayTip, seenScrapbook, seenSubdivisions, type LevelOutcome, type Progress,
} from '@/game/progress';
import { collectionCount, keepsakeEarned, ownedKeepsakes, type Keepsake } from '@/game/scrapbook';
import { drawKeepsake } from '@/ui/keepsakes';
import { introCopy, introGrid, SUBDIVISION_INTRO, SubdivisionIntroRun } from '@/game/subdivisionIntro';
import { totalStars, type EarnedStars } from '@/game/stars';
import { attemptMode, playAnalytics, type LevelRun, type SubdivisionIntroVisit } from '@/game/playAnalytics';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { drawHeart, drawInfinity, drawMap, drawRestart, drawSpeaker } from '@/ui/icons';
import { blockGeometry, blockWidth, columnRoom, drawBlock, TRACK, type Ghost } from '@/ui/turnBlock';
import { faces } from '@/ui/light';
import { hex, mix, shade, starColour } from '@/ui/colour';
import { CHROME, drawActionDisc, drawHeartRow, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { BRASS, drawPanel, placeSurface, Rect, surface } from '@/ui/panel';
import { Feedback } from '@/ui/feedback';
import { flawlessPose, socketGlint } from '@/ui/flourish';
import { Sheen } from '@/ui/sheen';
import { arrive, settle, squash } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';
import { drawStar, drawStarMark, drawStarSeat, prizeColour, STAR_PRIZE } from '@/ui/star';
import {
  chipSeat, KEEPSAKE_CARD, keepsakeCardHeight, medalSeat, planResult, PLATE, RESULT_ROWS, trayRect, type ResultPlan,
} from '@/ui/resultLayout';
import { nextGateChip, nextStarCopy, offersReplay, replayCopy, thresholdLabels, type GateChip } from '@/game/resultCopy';
import { dashes } from '@/ui/path';
import { chorusBurst, chorusGlow, plaqueJolt, plaquePose, starAge, starImpactAge, starPose } from '@/ui/starReveal';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { FinaleStage } from '@/ui/finaleStage';
import { VIGNETTES } from '@/vignettes/registry';
import { definitionForLap, type Vignette } from '@/vignettes/Vignette';
import { easeInOutCubic, easeOut } from '@/vignettes/motion';

/**
 * How far under the headline's top the breather's label hangs, in headline sizes: clear
 * of the display face's descenders and its outline, which the Text's own height pads.
 */
const REST_LABEL_DROP = 1.36;

/**
 * The first-run demonstration pass: one whole cycle at a teaching tempo, played by the
 * game before the player's first task ever begins.
 *
 * Deliberately not a scene, a modal or a script. It is the same block, the same act and
 * the same grid the level runs on, slowed down and answered by the game, so what the
 * player watches is exactly the thing they are about to be asked to do: struck above,
 * carried down, answered below. The turn cue is what teaches; this only runs it once
 * where nothing is at stake.
 */
const TEACH = {
  /** Fraction of the level's own tempo the pass plays at. */
  tempo: 0.75,
  /**
   * Whole bars, at the teaching tempo: one to count in, one demonstrated, one answered,
   * and one to let it land. Whole bars matter because the music's rate goes back to the
   * level's at the end of them, and a rate change off the bar line shifts the loop
   * against the grid every task afterwards runs on.
   */
  bars: 4,
  /**
   * How far ahead of the real task's downbeat the grid is handed to the controller. One
   * beat, the same headroom a task change takes — and at the teaching tempo a beat is
   * longer in wall-clock than the level's own, so the schedule has at least as much room.
   */
  swapBeats: 1,
} as const;

/**
 * Which half of the pass is on screen. The same three phases the controller reports, read
 * straight off the plan's own boundaries rather than kept anywhere — there is no second
 * phase machine, and the block cannot tell which one it is being driven by.
 */
function teachPhase(plan: RoundPlan, now: number): Phase {
  return now < plan.demo ? 'prepare' : now < plan.response ? 'demonstrate' : 'respond';
}

/**
 * When the rows under the plaque arrive, in seconds from the summary. The next star waits for
 * the last medal to land (about 0.85 s in), so the stars keep their own moment; the finale's
 * card follows its ribbon.
 */
const RESULT_REVEAL = {
  stripDelay: 0.9,
  finaleLag: 0.25,
} as const;

/**
 * An area finale's presentation beats, in seconds (`game/finale.ts`, `ui/finaleStage.ts`).
 * The title card is off the stage `cardClearBeats` before the first demonstration downbeat,
 * so it never covers the example; the payoff ribbon unrolls once the third medal has had
 * its moment, and a keepsake card earned by the same clear waits `keepsakeLag` behind it.
 */
const FINALE_PAYOFF = {
  cardClearBeats: 0.5,
  ribbonDelay: 1.0,
  keepsakeLag: 0.7,
  fanfareGain: 0.5,
  rollGain: 0.32,
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
  /** The cleared result's Continue, once it has been pressed: the review flow, then the map. */
  private continuation: Continuation | null = null;
  /** Set once gameplay actually begins; refunds use the same id so a double-finish cannot restore two hearts. */
  private attemptId: string | null = null;
  /** The analytics side of the same attempt: started once, finished or abandoned once. */
  private levelRun: LevelRun | null = null;
  private heartRefunded = false;
  private emptyTracked = false;
  /** Whether this screen has decided if it is the player's first empty bar, and what it decided. */
  private replayTipShown = false;
  private firstEmpty = false;
  private watchOfferTracked = false;
  private purchaseOfferTracked = false;
  private commerceBusy = false;
  private watchClaims = 0;
  private get definition() {
    return definitionForLap(VIGNETTES.find(v => v.id === this.spec.vignette) ?? VIGNETTES[0]!, this.spec.lap);
  }
  private stars!: Phaser.GameObjects.Graphics;
  private scoreValue!: Phaser.GameObjects.Text;
  private scoreNote!: Phaser.GameObjects.Text;
  /** Ceiling anchor the plaque and its ropes swing about; local (0,0) of `stars`. */
  private plaqueAt = { x: 0, y: 0 };
  private headline!: Phaser.GameObjects.Text;
  private accuracy!: Phaser.GameObjects.Text;
  private kept!: Phaser.GameObjects.Text;
  /** The room stepping back as the turn passes, so the block at the thumb comes forward. */
  private roomDim!: Phaser.GameObjects.Graphics;
  /** This level still shows the guiding ring, because the player has not cleared it yet. */
  private guided = false;
  /**
   * The first-run pass, while it is running. It owns the block and the grid until it
   * hands both to the controller; there is no new phase machine, only a plan and a
   * cursor over the cues and targets it already carries.
   */
  private teach: {
    readonly plan: RoundPlan;
    /** The real first task's downbeat, a whole number of bars after the pass began. */
    readonly taskAt: number;
    /** When the grid is handed over, far enough ahead of `taskAt` to schedule it. */
    readonly swapAt: number;
    /**
     * The pass's own row. `this.outcomes` belongs to the task the controller starts at
     * the swap, a beat before the pass lets go of the block.
     */
    readonly marks: Mark[];
    cue: number;
    answered: number;
    phase: Phase;
    swapped: boolean;
  } | null = null;
  /**
   * A finer grid's first meeting, while it runs (`game/subdivisionIntro.ts`). It is a
   * task in every way the controller, the act and the block can see — its own plan, its
   * own coda, the same transition — and in no way the level's: its result goes to `run`,
   * never to `results`, the sequence's accuracy or the level's analytics.
   */
  private intro: { readonly run: SubdivisionIntroRun; readonly visit: SubdivisionIntroVisit | null; readonly bpm: number } | null = null;
  /** The keepsake this run earned, if it earned one; revealed under the plaque. */
  private keepsake: Keepsake | null = null;
  /** The player's first keepsake on this device, whose card says what keepsakes are. */
  private keepsakeFirst = false;
  private keepsakeCard!: Phaser.GameObjects.Graphics;
  private keepsakeLabel!: Phaser.GameObjects.Text;
  private keepsakeName!: Phaser.GameObjects.Text;
  private keepsakeNote!: Phaser.GameObjects.Text;
  private keepsakeRect = new Phaser.Geom.Rectangle();
  /** How the result stacks on this frame: the plaque, the rows under it, the replay block. */
  private resultPlan: ResultPlan | null = null;
  /** The chips under the seats, the next-star strip and the finale's card, all the plaque's. */
  private chipLabels: Phaser.GameObjects.Text[] = [];
  private chipEarned: (boolean | null)[] = [null, null, null];
  private nextStarPlate!: Phaser.GameObjects.Graphics;
  private finalePlate!: Phaser.GameObjects.Graphics;
  private nextStar!: Phaser.GameObjects.Text;
  private finaleCount!: Phaser.GameObjects.Text;
  private finaleCountLabel!: Phaser.GameObjects.Text;
  private gateLabel!: Phaser.GameObjects.Text;
  private gateChip: GateChip | null = null;
  /** Stars this pass earned, read once when the summary opens. */
  private summaryStars: 0 | 1 | 2 | 3 = 0;
  /** A clear short of three stars: the wood block over Continue that plays the level again. */
  private replayOffered = false;
  private replayRoot!: Phaser.GameObjects.Container;
  private replayPlate!: Phaser.GameObjects.Graphics;
  private replaySurface!: Phaser.GameObjects.TileSprite;
  private replayLabel!: Phaser.GameObjects.Text;
  private replayRect = new Phaser.Geom.Rectangle();
  private replayPressedAt = -Infinity;
  private replayPressDirty = false;
  /** The top of the action block, which the card must stay above; kept for re-placing it. */
  /** Once the card has settled it is drawn once more and left alone, until a layout moves it. */
  private keepsakeSettled = false;
  private keepsakeStruck = false;
  /** The introduction's second line, under the headline: "3 inside the beat". */
  private introCaption!: Phaser.GameObjects.Text;
  /** An area finale's pennants, title card and payoff; null on every other level. */
  private finale: FinaleStage | null = null;
  /** This run cleared a finale, so the result carries the "Area complete" payoff. */
  private finaleCleared = false;
  /**
   * How locked in this pass is (`game/groove.ts`): read by the room's light, the block's
   * edge, the Perfect sparks and the accents, and by nothing that judges or scores.
   */
  private groove: GrooveState = GROOVE_START;
  /** The generic groove treatment: the warm pool behind the act and the rim on the block. */
  private grooveStage!: GrooveStage;
  /** The three accents, synthesized once per entry on the shared context. */
  private grooveVoices: GrooveVoices | null = null;
  /** The pass that finished was flawless on every scored task: the result's mastery payoff. */
  private mastered = false;
  /** When the mastery payoff is due on the audio clock; -Infinity when there is none. */
  private masteryAt = -Infinity;
  private masteryStruck = false;
  private masteryPlate!: Phaser.GameObjects.Graphics;
  private masteryLabel!: Phaser.GameObjects.Text;
  /** The context time the level's music started, which a finale's opening swell is keyed to. */
  private levelOrigin = -Infinity;
  /**
   * What the pass that finishes hands the daily objectives: Perfect hits and tasks answered
   * Perfect throughout. Summed here and reported once, at the record step, which is what
   * keeps objective analytics to one event per objective per level instead of one per hit.
   */
  private tally = { perfect: 0, flawless: 0 };
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
  /**
   * The tasks a miss is not reported on: the first of the level that still teaches, and a
   * finer grid's introduction, which is there to be heard and tried, not failed.
   */
  private get unfailable(): boolean { return this.intro !== null || (this.guided && this.taskIndex === 0); }
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
  private turnCallY = 0;
  private struckIndex = -1;
  private struckAt = -Infinity;
  private extraAt = -Infinity;
  private verdict!: Phaser.GameObjects.Text;
  private verdictAt = -Infinity;
  /** The count into the player's turn: "3 2 1 Go!", in the free band under the face. */
  private turnCall!: Phaser.GameObjects.Text;
  /**
   * The breather's words: "Halfway" or "Last bar" under the headline, "Rest" on the shelf,
   * and "3 bars to go" in the count-in's place under the face, which is free until the
   * demonstration's own bar.
   */
  private restLabel!: Phaser.GameObjects.Text;
  private restShelf!: Phaser.GameObjects.Text;
  private restCall!: Phaser.GameObjects.Text;
  /** The numeral currently rasterised, so the beat pays for `setText` and nothing else does. */
  private turnCalled: number | null = null;
  /** Whether the "Go!" of the current task has thrown its sparks; once per task, on the strike. */
  private goStruck = false;
  /** The word over the shelf for a task answered Perfect throughout, and when it was earned. */
  private flawless!: Phaser.GameObjects.Text;
  private flawlessAt = -Infinity;
  /** How many sockets the flawless sweep has passed and thrown sparks from. */
  private flawlessSwept = 0;
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
    // Assigned here, not left to the field initializers, which run once per instance. A
    // second visit inherited the last visit's attempt id, and a Resume id from a level the
    // player had already walked away from is exactly the duplicate analytics must not see.
    this.attemptId = null;
    this.outcome = null;
    this.continuation = null;
    this.levelRun = null;
    this.intro = null;
    this.keepsake = null;
    const data = this.sys.settings.data as { level?: number; autoStart?: boolean } | undefined;
    const requested = data?.level ?? (import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('level')) : 0);
    this.spec = levelSpec(Number.isInteger(requested) && requested >= 1 ? requested : 1);
    // The two facts that make a stack trace legible: which level, and which act drew it.
    setErrorContext('level', this.spec.level);
    setErrorContext('act', this.spec.vignette);
    this.vignette = this.definition.create(this, this.spec.lap);
    // Under the act and over its backdrop, so the room warms without covering anything in it.
    this.grooveStage = new GrooveStage(this);
    this.groove = GROOVE_START;
    this.grooveVoices = null;
    this.mastered = false;
    this.masteryAt = -Infinity;
    this.masteryStruck = false;
    const ink = this.definition.ink;
    this.stars = this.add.graphics().setDepth(9);
    this.fx = new Feedback(this, 5);
    this.starFx = new Feedback(this, 12);
    this.headline = display(this, this.definition.intro, { size: 88, colour: SHELL.cream, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.introCaption = display(this, '', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
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
    // Under the scrim and over the act: the workshop steps back for the turn, it is not
    // covered over. A vignette's own objects sit at negative depths.
    this.roomDim = this.add.graphics().setDepth(6).setAlpha(0);
    this.scrim = this.add.graphics().setDepth(7).setVisible(false);
    this.emptyHearts = this.add.graphics().setDepth(11).setVisible(false);
    this.marks = this.add.graphics().setDepth(8);
    this.verdict = display(this, '', { size: 38, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.turnCall = display(this, '', { size: 46, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.restLabel = label(this, '', { size: 22, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setAlpha(0).setDepth(12);
    this.restShelf = label(this, 'Rest', { size: 18, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.restCall = display(this, '', { size: 40, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.flawless = display(this, 'Flawless!', { size: 54, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.keepsakeCard = this.add.graphics().setDepth(11).setVisible(false);
    this.keepsakeLabel = label(this, 'New keepsake', { size: 20, colour: PALETTE.coral }).setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.keepsakeName = display(this, '', { size: 34, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.keepsakeNote = body(this, '', { size: 21, colour: PALETTE.muted }).setOrigin(0, 0).setDepth(11).setVisible(false);
    // The plaque's own words and the rows under it. Assigned on every entry, never appended to.
    this.chipLabels = [0, 1, 2].map(() => label(this, '', { size: PLATE.chip.text, colour: PALETTE.ink, align: 'center' })
      .setOrigin(0.5).setDepth(11).setVisible(false));
    this.chipEarned = [null, null, null];
    this.nextStarPlate = this.add.graphics().setDepth(9).setVisible(false);
    this.finalePlate = this.add.graphics().setDepth(9).setVisible(false);
    this.masteryPlate = this.add.graphics().setDepth(9).setVisible(false);
    this.masteryLabel = label(this, 'IN THE POCKET', { size: 24, colour: shade(BRASS, -0.62), align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.nextStar = body(this, '', { size: 30, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.finaleCount = display(this, '', { size: 48, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.finaleCountLabel = label(this, 'Stars', { size: 20, colour: PALETTE.muted }).setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.gateLabel = label(this, '', { size: 20, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.gateChip = null;
    this.replayRoot = this.add.container(0, 0).setDepth(10).setVisible(false);
    this.replayPlate = this.add.graphics();
    this.replaySurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.wood, 0.35);
    this.replayLabel = display(this, '', { size: 34, colour: SHELL.cream, align: 'center' }).setOrigin(0.5);
    this.replayRoot.add([this.replayPlate, this.replaySurface, this.replayLabel]);
    this.replayOffered = false;
    this.summaryStars = 0;
    this.resultPlan = null;
    this.flawlessAt = -Infinity;
    this.flawlessSwept = 0;
    this.goStruck = false;
    this.taskMarks = this.add.graphics().setDepth(11);
    // Assigned on every entry, like every field that holds scene objects.
    const finale = areaFinale(this.spec.level);
    this.finale = finale ? new FinaleStage(this, finale, this.starFx) : null;
    this.finaleCleared = false;
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
    this.grooveStage.layout(this.viewport);
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
    // Hangs from its top edge under the headline's actual bottom, placed per frame in
    // `update`: the headline is 48 units while a try plays and 88 between tries.
    this.introCaption.setPosition(safe.centerX, this.headlineY + this.headlineSize * 1.08);
    resize(this.introCaption, 30 * s, SHELL.cream);
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
    // The columns are centred on the rows and the owner slot eats a row's left end, so
    // what the beads may use is the row less that allowance. Without it the slot landed
    // on the first socket on a dense pattern, which is the one case where the answer is
    // not simply a wider row.
    this.trackWidth = columnRoom(Math.min(620 * s, safe.width - 48 * s), s);
    // Above the shelf, not above the face: the demonstration row now occupies the band
    // the verdict word used to sit in, and a word over the beads is a word over the cue.
    this.verdictY = this.trackY - (TRACK.plateHeight / 2 + TRACK.rowGap + TRACK.shelfHeight + 34) * s;
    this.verdict.setPosition(safe.centerX, this.verdictY);
    resize(this.verdict, 38 * s, this.verdictColour());
    // The flawless word takes the verdict's line: it is the verdict on the whole task.
    this.flawless.setPosition(safe.centerX, this.verdictY);
    resize(this.flawless, 54 * s, PALETTE.coral);
    // Under the player's row, not in the verdict's band above the shelf. The two would
    // otherwise want the same line at the same instant: a tap landing on the downbeat is
    // judged there and then, so the verdict would wipe the "Go!" for exactly the player
    // who got it right. Below the face is also the furthest point on the screen from the
    // act, which is where a count-in belongs — it is counting the player in, not narrating
    // the example. The band is free for it because the action block is hidden for the
    // whole of a task: `setAction('')` on both `prepare` and `respond`, which is every
    // phase the count can appear in. A resize leaves the numeral dressed at the old
    // scale, so the cache is dropped and the next beat re-dresses it.
    this.turnCallY = this.trackY + (TRACK.plateHeight / 2 + TRACK.plateDepth + 44) * s;
    this.turnCall.setPosition(safe.centerX, this.turnCallY);
    this.turnCalled = null;
    this.restCall.setPosition(safe.centerX, this.turnCallY);
    this.restLabel.setX(safe.centerX);
    resize(this.restCall, 40 * s, this.definition.ink);
    resize(this.restLabel, 22 * s, PALETTE.muted, STYLE.current, false);
    resize(this.restShelf, 18 * s, SHELL.cream, STYLE.current, false);
    this.placeBlocks();
    this.drawAction(0);
    this.actionPressDirty = true;
    this.scrim.clear().fillStyle(0x1a201c, 0.5).fillRect(full.x, full.y, full.width, full.height);
    this.roomDim.clear().fillStyle(PALETTE.ink, 1).fillRect(full.x, full.y, full.width, full.height);
    resize(this.accuracy, 34 * s, ink, STYLE.current, false);
    this.accuracy.setWordWrapWidth(Math.min(560 * s, safe.width - 64 * s), false);
    this.accuracy.setLineSpacing(-4 * s);
    this.placeWaitCopy();
    this.placeResult();
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
  private blocked(): boolean { return document.hidden || wrongOrientation(this.scale.isLandscape); }
  private now(): number { return this.audio?.clock.now() ?? performance.now() / 1000; }

  private async startRound(): Promise<void> {
    const health = loadHealth();
    const progress = loadProgress();
    const premium = monetization().premium();
    // An unfinished try that already spent keeps its heart: Resume and the restart puck
    // are the same attempt. Try-again after the plaque is a new one (`outcome` is set).
    const resumeId = this.outcome === null ? this.attemptId : null;
    // Gate before tearing anything down: a denied restart must not kill a paid run.
    if (!canBeginAttempt(health, progress, this.spec.level, Date.now(), premium, resumeId)) {
      if (this.controller?.active) return;
      this.showNoHearts();
      return;
    }
    const request = ++this.startRequest;
    breadcrumb('level started', { level: this.spec.level, act: this.spec.vignette, attempt: this.attempts + 1 });
    this.replay = null;
    this.replayOffset = null;
    this.transition = null;
    this.teach = null;
    // An introduction cut short by a pause or a restart plays again from its count-in:
    // it is only marked seen once a try has been judged.
    this.intro = null;
    this.setIntroCaption('');
    this.keepsake = null;
    this.keepsakeFirst = false;
    this.keepsakeSettled = this.keepsakeStruck = false;
    this.hideKeepsakeCard();
    this.finale?.reset();
    this.finaleCleared = false;
    // Groove is the pass's, never the level's: a restart starts it cold, and the room with it.
    this.setGroove(GROOVE_START);
    this.grooveStage.reset();
    this.mastered = false;
    this.masteryAt = -Infinity;
    this.masteryStruck = false;
    // A restart is a new pass: only the pass that finishes is counted.
    this.tally = { perfect: 0, flawless: 0 };
    this.lastJudgement = '';
    this.taskIndex = 0;
    this.results = [];
    this.summaryShown = false;
    this.replayOffered = false;
    this.summaryStars = 0;
    this.levelCleared = false;
    this.outcome = null;
    this.saveFailed = false;
    this.attemptId = resumeId;
    this.heartRefunded = false;
    this.emptyTracked = false;
    this.replayTipShown = this.firstEmpty = false;
    this.watchOfferTracked = false;
    this.purchaseOfferTracked = false;
    // Not `kept.setVisible(false)` and `stars.clear()`: the plaque is a Graphics *and*
    // three Text objects, and clearing the Graphics left the score and its caption — "On
    // the beat" — hanging over the middle of the act until a resize happened to run
    // `layout()`. `drawStars` is the one place that knows what the plaque is made of, so
    // adding a fourth piece to it cannot reintroduce this.
    this.drawStars();
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
      // The act's voices are built synchronously below, so the bank has to be decoded
      // first. It never rejects: a sample that did not arrive leaves that act on the
      // synthesized beat it shipped with, rather than starting the level silent.
      await samples.load(this.audio!.context);
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.starting = false;
      this.audio!.setSounds(this.definition.sounds(this.audio!.context));
      const origin = this.audio!.music.start(); // fresh sources: every level starts at the base tempo
      this.levelOrigin = origin;
      void setMusicBed(this.audio!, 'level');
      if (this.disposed || request !== this.startRequest || this.blocked()) {
        this.audio!.music.stop();
        return;
      }
      // Spend only once audio is running: a failed unlock/load above never reaches here.
      // The same id is idempotent, so Resume does not take a second heart.
      const attemptId = resumeId ?? createAttemptId(this.spec.level);
      const before = loadProgress();
      const begun = beginAttempt(loadHealth(), before, this.spec.level, attemptId, Date.now(), monetization().premium());
      if (!begun.ok) {
        this.audio!.music.stop();
        this.showNoHearts();
        return;
      }
      saveHealth(begun.health);
      this.attemptId = attemptId;
      // A resumed id continues its run rather than starting another: see playAnalytics.
      this.levelRun = playAnalytics.beginLevel({ spec: this.spec, progress: before, attemptId, heartSpent: begun.spent });
      this.heartRefunded = false;
      this.guided = guidedLevel(loadProgress()) === this.spec.level;
      this.sequence = new TaskSequence(this.task.bpm, origin, 1);
      const grid = introGrid(this.spec, seenSubdivisions());
      if (this.guided && !seenDemonstration()) this.beginTeach(origin);
      else if (grid !== null) this.beginIntro(grid, origin, before);
      else this.beginTask(origin);
    } catch (error) {
      if (this.disposed || request !== this.startRequest) return;
      this.starting = false;
      this.controller?.dispose();
      this.audio?.cancel();
      this.audio?.music.stop();
      console.error('Unable to start round', error);
      this.changeHeadline('No sound');
      this.setAction('Retry');
    }
  }
  /**
   * Play the loop once, in full, before the level's first task: four demonstrated beats,
   * the handover, four answered beats, and a bar to let it land. The game plays both
   * halves; the player watches.
   *
   * The music slows with it and goes back to the level's tempo on the bar line the real
   * task starts on, which is why the pass is whole bars. Nothing here judges, scores or
   * spends anything — the controller is not even running.
   */
  private beginTeach(origin: number): void {
    const bpm = this.task.bpm * TEACH.tempo;
    const beat = 60 / bpm;
    const plan = createRoundPlan(0, this.task.pattern, bpm, origin, RHYTHM.leadInBeats);
    const taskAt = origin + TEACH.bars * RHYTHM.beatsPerBar * beat;
    this.teach = {
      plan, taskAt, swapAt: taskAt - TEACH.swapBeats * beat,
      marks: this.task.pattern.hits.map(() => 'pending'),
      cue: 0, answered: 0, phase: 'prepare', swapped: false,
    };
    this.struckIndex = -1;
    this.struckAt = this.extraAt = this.verdictAt = -Infinity;
    this.audio!.music.setRate(bpm / MUSIC.sourceBpm, origin);
    // The demonstration half is the plan's own cues; the answered half is the game
    // sounding each target itself. Both go in ahead of time, like every other phrase.
    for (const cue of plan.cues) this.audio!.play(cue.time, cue.kind);
    for (const target of plan.targets) this.audio!.play(target, 'action');
    this.vignette.reset(plan);
    this.vignette.onPhase('prepare', origin);
    this.drawTaskMarks();
  }

  /** Advances the pass from the audio clock, and hands the grid to the controller. */
  private teachTick(now: number): void {
    const teach = this.teach;
    if (!teach) return;
    const { plan } = teach;
    while (teach.cue < plan.cues.length && plan.cues[teach.cue]!.time <= now) {
      const cue = plan.cues[teach.cue++]!;
      if (cue.kind === 'action') this.vignette.onDemonstrationBeat(cue.time);
    }
    const phase = teachPhase(plan, now);
    if (phase !== teach.phase) { teach.phase = phase; this.vignette.onPhase(phase, now); }
    while (teach.answered < plan.targets.length && plan.targets[teach.answered]! <= now) {
      this.struckIndex = teach.answered;
      this.struckAt = now;
      teach.marks[teach.answered++] = 'perfect';
      this.vignette.onPlayerHit(now);
      // Played, never judged: the act reacts exactly as it would to a perfect answer,
      // and the beat it answered travels with it, because some acts place by index.
      this.vignette.onAccuracy({ kind: 'hit', grade: 'Perfect', index: teach.answered - 1, deltaMs: 0 }, now);
    }
    if (!teach.swapped && now >= teach.swapAt) {
      // Same deadline the task change uses, on the clock the cues are scheduled against.
      if (!canPlaceNextTask(this.audio!.context.currentTime, teach.taskAt)) { this.interrupt(); return; }
      teach.swapped = true;
      // Seen, once the whole cycle has played. Marking it at the start would have spent
      // the one showing on a player who backed out during the count-in.
      markDemonstrationSeen();
      this.audio!.music.setRate(this.task.bpm / MUSIC.sourceBpm, teach.taskAt);
      this.sequence = new TaskSequence(this.task.bpm, teach.taskAt, 1);
      this.beginTask(teach.taskAt);
    }
    // The pass keeps the block until the real task's downbeat, so the answered row holds
    // rather than blinking back to empty a bar early.
    if (now >= teach.taskAt) this.teach = null;
  }
  /**
   * A finer grid's introduction, in front of the level's first task. The music slows to
   * the teaching tempo on the level's own opening downbeat and goes back to the level's on
   * the downbeat its first task starts, and everything between is whole bars — a count-in,
   * the demonstration and the answer, and the coda's hold — so the loop never slips
   * against the grid the level then runs on.
   */
  private beginIntro(grid: Grid, origin: number, progress: Progress): void {
    const bpm = this.task.bpm * SUBDIVISION_INTRO.tempo;
    this.intro = {
      run: new SubdivisionIntroRun(grid),
      visit: playAnalytics.beginSubdivisionIntro(grid, this.spec.level, attemptMode(progress, this.spec.level)),
      bpm,
    };
    this.audio!.music.setRate(bpm / MUSIC.sourceBpm, origin);
    this.beginIntroTry(origin);
  }

  /** One try: the level's count-in bar the first time, straight into the example on the retry. */
  private beginIntroTry(startAt: number): void {
    const intro = this.intro!;
    intro.run.begin();
    this.sequence = new TaskSequence(intro.bpm, startAt, 1);
    this.beginPlan(intro.run.pattern, intro.bpm, startAt, intro.run.retrying ? 0 : RHYTHM.leadInBeats);
    // After the plan starts: starting it runs `showPhase('prepare')`, which clears the headline.
    const copy = introCopy(intro.run.grid, intro.run.retrying);
    this.changeHeadline(copy.title);
    this.setIntroCaption(copy.caption);
  }

  private setIntroCaption(text: string): void {
    if (!this.introCaption || this.introCaption.text === text) return;
    this.introCaption.setText(text).setAlpha(text === '' ? 0 : this.headline.alpha);
  }

  /**
   * An introduction try was judged. It ends the way a task ends — the act's coda, the
   * slide, the next downbeat — so the level that follows cannot tell it happened, and its
   * accuracy goes to the introduction alone.
   */
  private showIntroResult(result: RoundResult): void {
    const intro = this.intro!;
    const next = intro.run.complete(result.accuracy);
    const ending = this.sequence!.ending(this.controller!.plan!.end, this.definition.endingHoldBeats);
    const strong = result.accuracy >= this.definition.successAccuracy;
    const partial = this.definition.partial;
    const outcome: FinishOutcome = strong ? 'success' : partial && result.accuracy >= partial.minAccuracy ? 'partial' : 'rough';
    this.vignette.finish(strong, ending.contact, result.accuracy);
    this.audio!.playFinish(ending.contact, outcome, ending.next);
    this.finishUnlock = ending.contact + this.definition.endingSec;
    this.transition = { ...ending, swapped: false };
    if (next === 'done') {
      // Seen once a try has been judged: the player has heard the example and answered it.
      markSubdivisionSeen(intro.run.grid);
      intro.visit?.complete(intro.run.tries, intro.run.best, intro.run.passed);
      this.changeHeadline(intro.run.passed ? 'Got it' : 'Let’s go');
      this.setIntroCaption('');
    } else {
      const copy = introCopy(intro.run.grid, true);
      this.changeHeadline(copy.title);
      this.setIntroCaption(copy.caption);
    }
    this.accuracy.setText(this.debugMode ? `${Math.round(result.accuracy)}%` : '');
    this.setAction('');
  }

  private beginTask(startAt: number): void {
    this.beginPlan(this.task.pattern, this.task.bpm, startAt, this.task.leadBeats);
    if (this.finale && this.taskIndex === 0) this.openFinale(startAt);
  }

  /**
   * A finale's opening: its lead-in is `PROGRESSION.finale.openingBars` long rather than
   * one bar, and it is all presentation — the title card hangs in it, a roll builds across
   * its last bar, and, when the level's music starts here, the loop swells from its floor to
   * full on the first demonstration downbeat. Every sound is scheduled on the context clock
   * at placement, like the cues; nothing here is judged or touches the grid.
   */
  private openFinale(startAt: number): void {
    const audio = this.audio!;
    const beat = 60 / this.task.bpm;
    const demo = startAt + this.task.leadBeats * beat;
    this.finale!.showTitle(startAt, demo - FINALE_PAYOFF.cardClearBeats * beat);
    const rollBeats = Math.min(this.task.leadBeats, RHYTHM.beatsPerBar);
    // The fanfare is about a second of synthesis. The ribbon wants it while the medals
    // are already moving; building it here, inside the opening lead-in, is the same work
    // done where a long frame cannot expire a target. The buffer is cached per context,
    // so the ribbon and a replay both reuse it.
    createFinaleSound(audio.context, 'fanfare');
    audio.playStinger(demo - rollBeats * beat, createFinaleSound(audio.context, 'roll', beat, rollBeats), FINALE_PAYOFF.rollGain);
    // After an introduction the loop is already at full level, and ducking it would read as
    // a fault rather than a build.
    if (startAt === this.levelOrigin) {
      audio.music.swell(MUSIC.masterGain * PROGRESSION.finale.musicFloor, MUSIC.masterGain, startAt, demo);
    }
  }

  private beginPlan(pattern: Pattern, bpm: number, startAt: number, leadBeats: number): void {
    this.attempts++;
    this.demoCount = 0;
    this.finishUnlock = Infinity;
    this.accuracy.setText('');
    this.outcomes = pattern.hits.map(() => 'pending');
    this.heldJudgements = [];
    this.struckIndex = -1;
    this.struckAt = this.extraAt = this.verdictAt = this.flawlessAt = -Infinity;
    this.flawlessSwept = 0;
    this.goStruck = false;
    this.verdict.setAlpha(0);
    this.turnCall.setAlpha(0);
    this.flawless.setAlpha(0);
    this.controller!.start(
      pattern, bpm, this.audio!.context.currentTime, performance.now(),
      // The trombone's note is always the plan. On a route that delays sound by more than
      // a tap's own judgement — Bluetooth, typically — every act's is: a voice started by
      // the tap would be heard on the next subdivision. Decided per task, since the route
      // can change mid-level and the judge is already reading the same clock.
      startAt, leadBeats, this.definition.gridAction === true || this.audio!.clock.tapVoiceLate,
    );
    this.vignette.reset(this.controller!.plan!);
    if (this.replayOffset !== null) {
      const plan = this.controller!.plan!;
      this.replay = { roundId: plan.id, targets: this.replayTargets(), next: 0 };
    }
    this.drawTaskMarks();
  }
  private handleTap(tap: Tap): void {
    // Continue pressed: the level is on its way out, through the review flow when there is
    // one. Every control is inert until the map, so a second tap cannot launch a second
    // sheet, and the pucks cannot start a restart the map would land on top of.
    if (this.blocked() || this.curtain.active || this.continuation?.busy) return;
    const near = (at: { x: number; y: number }) => Math.abs(tap.x - at.x) < this.controlSize / 2 && Math.abs(tap.y - at.y) < this.controlSize / 2;
    if (near(this.muteAt)) {
      this.pressPuck('mute');
      if (this.audio) this.muted = toggleMute(this.audio);
      return;
    }
    if (near(this.restartAt)) { this.pressPuck('restart'); void this.startRound(); return; }
    if (near(this.mapAt)) { this.pressPuck('map'); this.leaveForMap(); return; }
    // The wood block over Continue plays the same level again, by the restart puck's path.
    if (this.summaryShown && this.replayOffered && Phaser.Geom.Rectangle.Contains(this.replayRect, tap.x, tap.y)) {
      this.replayPressedAt = performance.now() / 1000;
      this.replayPressDirty = true;
      void this.startRound();
      return;
    }
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
    // The pass is the game showing the loop. A tap during it is a player reaching for a
    // turn that is not theirs yet, not a request to start the level over.
    if (this.teach) return;
    const phase = this.controller?.phase ?? 'idle';
    if (phase === 'idle' || phase === 'paused') {
      if (this.offeringHeart()) return;
      if (this.actionCaption === 'Map') { this.leaveForMap(); return; }
      if (this.outcome !== null) {
        if (!this.summaryShown) this.showSummary();
        return;
      }
      if (!this.starting) void this.startRound();
      return;
    }
    if (phase === 'result') {
      // Cleared: back to the road, centred on what just opened. Failed: straight into another go.
      if (this.summaryShown) { if (this.levelCleared) this.continueFromSummary(); else void this.startRound(); }
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
    if (this.disposed || !this.audio || this.blocked()) return;
    if (this.audio.context.state !== 'running') {
      // A Bluetooth rebuffer can suspend the context for a frame when the player first
      // sounds. Interrupting here ended the response while the demonstration — whose
      // voices were already scheduled — had played in time.
      this.audio.recover();
      return;
    }
    this.audio.clock.refresh();
    if (this.teach) this.teachTick(this.now());
    const transition = this.transition;
    if (transition && this.now() >= transition.swap && !transition.swapped) {
      // Read on the context clock, which is what the cues below are scheduled against;
      // this tick arrived on the audible one, an output latency behind it.
      if (!canPlaceNextTask(this.audio.context.currentTime, transition.next)) { this.interrupt(); return; }
      transition.swapped = true;
      const intro = this.intro;
      if (intro && intro.run.step === 'try') {
        // One more go at the introduction, on the same grid and at the same tempo.
        this.beginIntroTry(transition.next);
      } else {
        // Out of an introduction the level begins at its first task; otherwise, the next.
        if (intro) this.intro = null;
        else this.taskIndex++;
        // The music speeds up on the same downbeat the next count-in starts, so the grid and
        // the stems change tempo together. Every task's plan is whole beats, so `next` is on a beat.
        this.audio.music.setRate(this.task.bpm / MUSIC.sourceBpm, transition.next);
        this.sequence = new TaskSequence(this.task.bpm, transition.next, 1);
        this.beginTask(transition.next);
      }
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
    // Shutdown can still receive the frame that was already queued. Drawing into
    // objects the scene just destroyed throws, and that throw is reported as a crash
    // on the way out of a level.
    if (this.disposed) return;
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
    if (this.introCaption.text !== '') {
      // From the font size rather than the Text's height, which carries the outline's padding.
      this.introCaption.setAlpha(entry.alpha * endReveal).setY(this.headline.y + this.headlineSize * 1.08);
    }
    if (this.restLabel.text !== '') this.restLabel.setAlpha(entry.alpha).setY(this.headline.y + this.headlineSize * REST_LABEL_DROP);
    if (this.summaryShown) this.animateStars(now);
    else this.accuracy.setAlpha(1);
    this.drawKeepsakeCard(now);
    this.finale?.update(now, this.reducedMotion);
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
    const replayPress = pressAmount(wall, this.replayPressedAt);
    if (replayPress > 0.001 || this.replayPressDirty) {
      this.drawReplay(Math.max(0, replayPress));
      this.replayPressDirty = replayPress > 0.001;
    }
    if (this.offeringHeart()) this.premiumSheen.update(wall, !monetization().premium());
    if (this.actionCaption !== '') {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(wall - this.actionShownAt, 0.5);
      this.actionRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
      this.refillRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
      this.replayRoot.setY(rise * 24 * this.uiScale).setAlpha(alpha);
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
      this.debug.setText(`${this.definition.id} L${this.spec.level} t${this.taskIndex + 1}/${this.spec.tasks.length} ${this.task.bpm}bpm tier${this.task.tier} clear${this.spec.clearAccuracy} rate${music?.playbackRate ?? 1} attempt ${this.attempts} · ${this.controller?.phase ?? 'idle'}\nvoices ${this.audio?.activeSources ?? 0} · handlers ${this.input.listenerCount(Phaser.Input.Events.POINTER_DOWN)} · objects ${this.children.length}\n${this.controller?.result?.accuracy.toFixed(0) ?? '—'}% · ${this.audio?.clock.mode ?? 'locked'} · lag ${this.audio?.clock.reportedLagMs ?? 0}+${this.audio?.clock.calibrationMs ?? 0} ${this.audio?.clock.tapVoiceLate ? 'grid' : 'tap'} · ${this.game.loop.actualFps.toFixed(0)} fps\n${this.lastJudgement}\nmusic ${music?.activeSources ?? 0} · run ${music?.playbackGeneration ?? 0} · loops ${music?.completedLoops ?? 0}\nstart ${music?.startTime?.toFixed(3) ?? '—'} · length ${music?.duration.toFixed(6) ?? '—'}\ngain ${(music?.gain ?? MUSIC.masterGain).toFixed(3)} · lead ${music?.leadInSeconds.toFixed(3) ?? '—'}`);
    }
  }
  private changeHeadline(text: string, colour = SHELL.cream): void {
    if (this.headline.text === text && this.headlineColour === colour) return;
    this.headlineAt = this.now();
    this.headlineColour = colour;
    this.headline.setText(text).setAlpha(0).setY(this.headlineY + 16 * this.uiScale);
    resize(this.headline, this.headlineSize, colour);
  }
  /**
   * The breather's words, from where the rest is: the label under the headline and the
   * line under the face, and the headline itself turning to "Get ready" for the last bar.
   * `null` clears them — the demonstration has started, or this is not a breather.
   */
  private setRestWords(rest: RestProgress | null): void {
    const copy = rest ? restCopy(rest) : null;
    // A finale's pennants hang in exactly the band under the headline, so its breather says
    // "Breathe" and "Get ready" without the label that would sit on the line.
    const labelText = this.spec.finale ? '' : copy?.label.toUpperCase() ?? '';
    if (this.restLabel.text !== labelText) this.restLabel.setText(labelText).setAlpha(labelText === '' ? 0 : this.restLabel.alpha);
    const caption = copy?.caption ?? '';
    if (this.restCall.text !== caption) this.restCall.setText(caption);
    this.restCall.setAlpha(caption === '' ? 0 : 1);
    if (copy && this.headline.text !== copy.headline && (this.headline.text === 'Breathe' || this.headline.text === 'Get ready')) this.changeHeadline(copy.headline, SHELL.cream);
    if (!rest) this.restShelf.setAlpha(0);
  }
  /** Whether this task carries the level's breather: the one task past the first that waits. */
  private get resting(): boolean {
    return this.taskIndex > 0 && this.taskIndex === breatherTask(this.spec.tasks.length);
  }
  /**
   * No word says whose turn it is any more.
   *
   * Watch and Your turn were a headline at the top of the screen that flipped on the same
   * frame as the downbeat it announced, while the player's eyes were on the act and their
   * thumb was at the bottom. The block at the thumb says it instead, and says it
   * `RHYTHM.runwayBeats` early. The headline is kept for outcomes — Cleared, Again?, Paused, No hearts — which
   * are results rather than cues, and for the breather, which is the one place in a level
   * where nothing at all is being asked. Its last bar says "Get ready" (`setRestWords`): the
   * one headline that looks ahead, allowed there because the player's eyes are free — no
   * turn is changing hands, and the count-in's pips and the baton say the rest.
   */
  private showPhase(phase: Phase): void {
    this.vignette.onPhase(phase, this.now());
    // The breather is the one task past the first that waits; a finale's longer opening is
    // its title card, not a rest.
    const resting = this.resting;
    // An introduction keeps its two lines up through the count-in and the example, which is
    // what they describe, and lets go of them on the player's downbeat like every word here.
    const introducing = this.intro !== null;
    if (phase === 'prepare') {
      if (!introducing) this.changeHeadline(resting ? 'Breathe' : '', SHELL.cream);
      this.setAction('');
    }
    if (phase === 'demonstrate' && !introducing) this.changeHeadline('');
    if (phase !== 'prepare') this.setRestWords(null);
    if (phase === 'respond') {
      this.changeHeadline('');
      this.setIntroCaption('');
      this.setAction('');
      this.demoCount = 0;
      this.struckIndex = -1;
      this.struckAt = this.extraAt = -Infinity;
    }
  }
  private showJudgement(result: Judgement): void {
    this.lastJudgement = `${result.kind} ${result.grade} ${result.deltaMs?.toFixed(0) ?? '—'} ms`;
    // A missed beat on the level's very first task says nothing: no mark on the socket,
    // no judder, no Miss. The player cannot lose the loop before they have understood
    // it, and on this level nothing was spent to attempt it either — `protectedThrough`
    // already covers the opening levels, so there is no heart to skip.
    if (this.unfailable && result.kind === 'omission') return;
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
    // In an introduction an extra tap shakes the rows and nothing else: no scrape, no Miss.
    // The rattle already says "that one was not a beat", which is all a first try needs.
    if (this.intro && result.kind === 'extra') { this.extraAt = this.now(); return; }
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
    if (result.grade === 'Perfect' && result.kind === 'hit') {
      // At level 3 the room answers a Perfect too: the pool flares for a moment.
      if (this.groove.level >= 3) this.grooveStage.flare(now);
      if (!this.reducedMotion) {
        const { centres } = this.beads();
        const x = this.viewport.safe.centerX + (centres[result.index ?? 0] ?? 0);
        // Richer with the groove: a few more sparks, and the sun among them from level 2.
        const level = this.groove.level;
        this.fx.burst('sparks', x, this.trackY, level >= 2 ? [PALETTE.coral, SHELL.cream, SHELL.sun] : [PALETTE.coral, SHELL.cream], 8 + (level >= 2 ? 3 : 0) + (level >= 3 ? 3 : 0));
      }
    }
  }
  private verdictColour(result?: Judgement): number {
    if (!result) return this.definition.ink;
    // A darker grey than the track's, because the word is read against whatever the
    // vignette has behind it — on the pale stages the palette's muted all but disappears.
    return result.grade === 'Perfect' ? PALETTE.coral : result.grade === 'Good' ? this.definition.ink : PALETTE.muted;
  }
  /** The bead centres the track is drawn at, so a burst lands on the bead it belongs to. */
  private beads(count = this.outcomes.length): { readonly centres: readonly number[]; readonly radius: number } {
    return trackGeometry(count, this.trackWidth, TRACK.beadGap * this.uiScale, TRACK.beadRadius * this.uiScale);
  }
  /**
   * The turn block: the demonstration's shelf, the player's face, and the baton between
   * them. Everything on it is derived per frame from values the plan already carries —
   * there is no new state machine and no new timing source.
   *
   * The one property worth protecting in review: by the response downbeat *nothing new
   * appears*. The face has warmed, the sockets have lit left to right and the baton has
   * landed, all inside the demonstration's own last beats, because a cue that arrives on
   * the beat it announces arrives too late to wind up for.
   */
  private drawBeatTrack(now: number): void {
    const g = this.marks.clear();
    // The first-run pass owns the block until it hands the grid over; after that the
    // controller does. The block cannot tell the difference, and does not need to.
    const teach = this.teach;
    const phase = teach ? teachPhase(teach.plan, now) : this.controller?.phase;
    // The finished row stays up through the ending and goes only when the summary claims
    // the band: the moment the last beat lands is exactly when a player wants to read it.
    if (!phase || phase === 'idle' || phase === 'paused' || this.summaryShown) {
      this.roomDim.setAlpha(0);
      this.turnCall.setAlpha(0);
      this.flawless.setAlpha(0);
      this.setRestWords(null);
      // The room settles: a pause, the summary and the idle stage all show no groove,
      // and the state itself is the pass's, reset with it.
      this.grooveStage.show(0, now);
      this.grooveStage.update(now, null, this.reducedMotion);
      return;
    }
    const { safe } = this.viewport;
    const s = this.uiScale;
    const still = this.reducedMotion;
    const plan = teach ? teach.plan : this.controller?.plan ?? null;
    const marks = teach ? teach.marks : this.outcomes;
    const { centres, radius } = this.beads(marks.length);
    const turn = handover(plan, now);
    // An extra tap rattles both rows: it answered no beat, so it marks none, and the two
    // rows are one object.
    const rattle = still ? 0 : settle(now - this.extraAt, 90, 18) * 3 * s;

    // The rows are cut to the phrase rather than to the frame, so a long phrase reads as
    // a long one — and widened, where they must be, to keep the owner slot off the first
    // socket.
    const last = centres.at(-1) ?? 0;
    const span = last + radius + 34 * s;
    const beadSpan = last - (centres[0] ?? 0) + radius * 2;
    // A breather's task keeps the tiles' width from its rest through its response, so the
    // block does not change size inside the task.
    const resting = !teach && this.resting;
    const floor = resting ? TRACK.restWidth * s : 0;
    const width = Math.min(Math.max(span * 2, 220 * s, blockWidth(beadSpan, s), floor), safe.width - 48 * s);
    const geo = blockGeometry(safe.centerX, this.trackY, width, s);
    // The rest meter: four bar tiles for the breather's lead-in, from the plan's own lead
    // cues. It adds no cue and moves none.
    const rest = resting && !this.intro && phase === 'prepare' ? restProgress(plan, now) : null;
    this.setRestWords(rest);
    const beatSec = plan ? 60 / plan.bpm : 0.5;
    const barAge = rest && rest.beat >= 0 ? now - (rest.at - rest.beat * beatSec) : 0;
    const lastBar = isLastRestBar(rest);
    this.restShelf.setAlpha(rest && !lastBar ? 0.7 : 0).setPosition(geo.shelf.centerX, geo.shelfCentreY);

    drawBlock(g, geo, s, {
      centres,
      socketRadius: radius,
      played: beatsPlayed(plan, now),
      marks,
      turn,
      struck: { index: this.struckIndex, amount: still ? 0 : squash(now - this.struckAt, 0.22, 0.45) },
      rattle,
      still,
      ghost: this.ghostFor(plan, marks, turn, now),
      ink: this.definition.ink,
      landed: plan ? now - (plan.targets[0] ?? plan.response) : -Infinity,
      flawless: now - this.flawlessAt,
      rest: rest && {
        bar: rest.bar, beat: rest.beat, bars: rest.bars,
        pressAge: now - rest.at, barAge,
        // Back to the hammer slot over the last bar's first beat; under reduced motion it is there.
        returning: !lastBar ? 0 : still ? 1 : easeInOutCubic(Math.min(1, barAge / (beatSec * 0.9))),
      },
    });
    // The groove's rim on the face, and the room's breath, from the plan's own bar: the
    // demonstration downbeat is a bar line, so beat 1 is the level's beat 1.
    const bar = plan ? { origin: plan.demo, bpm: plan.bpm } : null;
    this.grooveStage.show(this.groove.level, now);
    this.grooveStage.drawRim(g, geo.face, TRACK.plateRadius * s, s, this.grooveStage.update(now, bar, still));
    this.drawFlawless(geo.face.centerX, centres, geo.faceCentreY, now);

    // The count-in: the last four ticks before the example, so the opening bar is not
    // dead air. A breather shows nothing until its final four beats.
    const pips = countIn(plan, now);
    if (pips !== null) {
      const ink = this.definition.ink;
      const gap = TRACK.pipGap * s;
      const pipY = geo.shelf.y - 22 * s;
      for (let i = 0; i < 4; i++) {
        const x = safe.centerX + (i - 1.5) * gap;
        if (i < pips) g.fillStyle(ink, 0.9).fillCircle(x, pipY, TRACK.pipRadius * s);
        else g.lineStyle(2.5 * s, ink, 0.35).strokeCircle(x, pipY, TRACK.pipRadius * s);
      }
    }
    this.drawTurnCall(plan, now);
    // The workshop steps back as the turn arrives, so the block comes forward without
    // anything on it having to get brighter.
    this.roomDim.setAlpha(turn.yours * 0.17);
  }

  /**
   * The count into the player's turn, under their own row: "3", "2", "1" on the beats
   * before their first target and "Go!" on the target itself.
   *
   * The block already says all of this, and says it early — but it says it in colour,
   * position and motion, and a player meeting it for the first time has nothing to hold
   * on to while it happens. Testers were still missing the downbeat with the whole
   * handover in front of them. A count-in is the one form of this everybody already
   * knows, so it is added as a count-in rather than as a label: on the grid and at the
   * thumb, under the row it is counting the player onto, so it reinforces where to look
   * instead of adding a second place to look. It sits below the face rather than in the
   * verdict's band above the shelf, because the two want the same line at the same
   * instant — a tap on the downbeat is judged there and then, and the verdict would wipe
   * the "Go!" for exactly the player who got it right.
   *
   * Two things keep it off the example. It is weighted — quiet at "3", where the
   * demonstration is still the thing to watch, and full only at "Go!", where the
   * demonstration is over. And the slot is occupied from the first numeral onward, so
   * "Go!" *replaces* the "1" in place rather than arriving on the beat it announces:
   * the block's property still holds, and by the downbeat nothing new appears.
   */
  private drawTurnCall(plan: RoundPlan | null, now: number): void {
    const call = plan && turnCount(plan, now);
    if (!plan || !call) {
      if (this.turnCall.alpha !== 0) this.turnCall.setAlpha(0);
      return;
    }
    const s = this.uiScale;
    const go = call.count === 0;
    const beat = 60 / plan.bpm;
    const still = this.reducedMotion;
    const pose = turnCountPose(call, beat, still);
    if (call.count !== this.turnCalled) {
      this.turnCalled = call.count;
      // setFontSize re-measures and re-rasterises, so the size is paid once per beat. The
      // numeral warms from the act's ink toward coral one strike at a time, so the count
      // is the row's colour arriving rather than a caption in a third colour.
      this.turnCall.setText(go ? 'Go!' : String(call.count));
      resize(this.turnCall, (36 + 18 * call.weight) * s, mix(this.definition.ink, PALETTE.coral, pose.heat));
    }
    // A strike rather than an entrance: each numeral drops in oversized and stamps down to
    // size on its beat, leaning alternate ways so three strikes read as three, and the
    // "Go!" stands up straight. All of it is f(age) from the clock the beat is on.
    this.turnCall.setAlpha(pose.alpha).setScale(pose.scale).setRotation(pose.tilt)
      .setY(this.turnCallY + pose.rise * s);
    if (pose.ring.alpha > 0.01) {
      // The ring a strike leaves, drawn on the block's own Graphics so it clears with it.
      const reach = (30 + 70 * pose.ring.spread) * s;
      this.marks.lineStyle((5 - 3.5 * pose.ring.spread) * s, mix(this.definition.ink, PALETTE.coral, pose.heat), pose.ring.alpha)
        .strokeCircle(this.viewport.safe.centerX, this.turnCallY, reach);
    }
    // The "Go!" throws sparks once, on its strike. Under reduced motion the word alone.
    if (go && !this.goStruck) {
      this.goStruck = true;
      if (!still) this.fx.burst('sparks', this.viewport.safe.centerX, this.turnCallY, [PALETTE.coral, SHELL.cream], 12);
    }
  }

  /**
   * The word for a flawless task, over the shelf, and the sparks the sweep throws from
   * each socket as it passes. The band of light and the glints themselves are drawn by
   * the block; this is the part that reaches for a Text and the particle emitters.
   */
  private drawFlawless(centreX: number, centres: readonly number[], faceY: number, now: number): void {
    const age = now - this.flawlessAt;
    const still = this.reducedMotion;
    const pose = flawlessPose(age, still);
    if (!pose) {
      if (this.flawless.alpha !== 0) this.flawless.setAlpha(0);
      return;
    }
    const s = this.uiScale;
    this.flawless.setAlpha(pose.alpha).setScale(pose.scale).setRotation(pose.tilt)
      .setY(this.verdictY + pose.rise * s);
    if (pose.glow > 0.01) {
      // A warm halo behind the word: Graphics cannot blur, so three fainter passes.
      const w = this.flawless.width * pose.scale;
      for (let i = 3; i >= 1; i--) {
        this.marks.fillStyle(0xffe7a0, pose.glow * 0.09 * i)
          .fillEllipse(this.viewport.safe.centerX, this.verdictY + pose.rise * s, w * (0.7 + 0.25 * i), 60 * s * (0.8 + 0.3 * i));
      }
    }
    if (still) return;
    // One burst per socket as the band reaches it, from where that socket is drawn.
    while (this.flawlessSwept < centres.length && socketGlint(age, this.flawlessSwept, centres.length) >= 0) {
      const x = centreX + centres[this.flawlessSwept]!;
      this.fx.burst('sparks', x, faceY, [SHELL.sun, 0xffe7a0, PALETTE.coral], 6);
      this.flawlessSwept++;
    }
  }

  /**
   * The guiding ring, on the level the player has not cleared yet: it contracts onto the
   * next socket over the beat before that socket is due. The ring says *where*; the beat
   * says *when*, which is why it never anticipates further than one beat and never shows
   * more than one at a time.
   */
  private ghostFor(plan: RoundPlan | null, marks: readonly Mark[], turn: Handover, now: number): Ghost | null {
    // The guided level and an introduction both show where the next beat is: in a new
    // rhythm the "where" is exactly what the player has not got yet.
    if ((!this.guided && !this.intro) || !plan || turn.yours <= 0.2) return null;
    // The next beat still ahead, not merely the next unanswered socket. A socket stays
    // unanswered until the judge expires it — and on the unfailable first task it is
    // never marked at all, which left the ring parked on a beat that had already gone.
    const index = marks.findIndex((mark, i) => mark === 'pending' && (plan.targets[i] ?? -Infinity) >= now - GHOST_FADE);
    const target = plan.targets[index];
    if (index < 0 || target === undefined) return null;
    const ring = ghostRing(target, 60 / plan.bpm, now);
    return ring.alpha <= 0.01 ? null : { index, radius: ring.radius, alpha: ring.alpha };
  }

  private showResult(result: RoundResult): void {
    if (this.intro) { this.showIntroResult(result); return; }
    const strong = result.accuracy >= this.definition.successAccuracy;
    this.sequence!.complete(result.accuracy);
    // Every beat Perfect: the one moment a task earns its own celebration. It reads the
    // marks the judge already left, so it can never disagree with the row under it, and
    // it takes the verdict's line — the last tap's "Perfect" is what it is summing up.
    this.tally.perfect += result.perfect;
    const flawless = isFlawless(this.outcomes);
    if (flawless) {
      this.tally.flawless++;
      this.flawlessAt = this.now();
      this.flawlessSwept = 0;
      this.verdictAt = -Infinity;
      this.verdict.setAlpha(0);
      vibrate('stamp');
    }
    this.results[this.taskIndex] = result.accuracy;
    this.levelRun?.task(this.taskIndex, result);
    // The one place groove moves: a scored task's verdict. The introduction and the
    // first-run pass never reach here, so neither can move it. Level 1 is the flourish
    // above and nothing more; from 2 the room answers (`grooveStage`), and a milestone
    // is reported once per run.
    const before = this.groove;
    this.setGroove(advanceGroove(before, { flawless }));
    if (this.groove.level > before.level) this.levelRun?.groove(this.groove.level, this.taskIndex);
    const ending = this.sequence!.ending(this.controller!.plan!.end, this.definition.endingHoldBeats);
    const contact = ending.contact;
    const last = this.taskIndex >= this.spec.tasks.length - 1;
    // The accents, on times the level already has: a chime on this coda's contact at
    // level 3, a shaker on the downbeat the next task's count-in starts on. Decorative,
    // through the same bus as every voice, and never on a beat the player is copying.
    if (this.audio && flawless && this.groove.level >= 2) {
      const voices = this.grooveVoices ??= createGrooveVoices(this.audio.context);
      if (this.groove.level >= 3) this.audio.playStinger(contact, voices.chime, 0.3);
      if (!last) this.audio.playStinger(ending.next, voices.shaker, 0.36);
    }
    // One decision, read twice: the words on the plaque and the coda that plays under
    // them are the same verdict, so an act with a middle ending never says one and
    // sounds the other.
    const partial = this.definition.partial;
    const outcome: FinishOutcome = strong ? 'success'
      : partial && result.accuracy >= partial.minAccuracy ? 'partial' : 'rough';
    this.vignette.finish(strong, contact, result.accuracy);
    // A coda has the room to itself until the next task's downbeat; after the last task
    // there is no next task, and it rings out under the summary.
    this.audio!.playFinish(contact, outcome, last ? undefined : ending.next);
    this.finishUnlock = contact + this.definition.endingSec;
    this.transition = last ? null : { ...ending, swapped: false };
    if (last) {
      this.audio!.music.setRate(1, ending.next); // back to the source tempo on the next downbeat
      // Record here, not when the summary draws. The summary waits out the coda, and a
      // notification in that window used to route through interrupt() and discard a
      // cleared level entirely.
      this.recordOutcome();
    }
    const copy = outcome === 'success' ? this.definition.success
      : outcome === 'partial' && partial ? partial.copy : this.definition.rough;
    this.changeHeadline(copy[0]);
    this.accuracy.setText(this.debugMode ? `${Math.round(result.accuracy)}%` : '');
    this.setAction('');
  }
  /** The groove state, and the act told of a change: only a change, so nothing is called per task. */
  private setGroove(next: GrooveState): void {
    const changed = next.level !== this.groove.level;
    this.groove = next;
    if (changed) this.vignette.onGroove?.(next.level, this.now());
  }
  /** Idempotent: the level is scored and saved once, however often this is reached. */
  private recordOutcome(): void {
    if (this.outcome) return;
    const accuracy = meanAccuracy(this.results);
    const before = loadProgress();
    const outcome = recordResult(before, this.spec.level, accuracy);
    this.outcome = outcome;
    // Every scored task flawless, on a cleared level: the result's one extra payoff. It
    // changes no star, threshold, heart or unlock; the scorer above never saw the groove.
    this.mastered = isMastered(this.groove, this.spec.tasks.length, outcome.cleared);
    // Beside the save, not the summary: this is the one step every finished run passes
    // exactly once, including the one a notification interrupts during its coda.
    this.levelRun?.finish(outcome, accuracy, this.mastered);
    this.levelCleared = outcome.cleared;
    this.saveFailed = outcome.cleared && !saveProgress(outcome.progress);
    // The player is told, but nobody else was: a device whose storage is blocked loses
    // every level it clears, and that is invisible from the outside without this.
    if (this.saveFailed) {
      reportError(new Error('Progress save failed'), {
        context: { level: this.spec.level, unlocked: outcome.progress.unlocked },
      });
    }
    // A keepsake is a fact about the saved stars, so one that did not save was not earned:
    // the card would promise a Scrapbook entry that the next launch could not find.
    const earned = keepsakeEarned(before, outcome.progress, this.spec.level);
    this.keepsake = earned !== null && !this.saveFailed ? earned : null;
    if (this.keepsake) {
      this.keepsakeFirst = !seenScrapbook();
      playAnalytics.collectibleUnlocked(this.keepsake, this.keepsakeFirst, ownedKeepsakes(outcome.progress).length);
    }
    // The daily objectives hear about the level once, here. Not when the save failed: stars
    // and clears the next launch will not find must not tick an objective either.
    if (!this.saveFailed) {
      const report = objectiveReport({
        level: this.spec.level, before, after: outcome.progress, cleared: outcome.cleared, stars: outcome.stars,
        perfect: this.tally.perfect, flawless: this.tally.flawless, keepsake: this.keepsake !== null,
      });
      playAnalytics.objectives(recordObjectives(report, Date.now(), objectiveContext(before)));
      // Play Games achievements follow the saved clears. Not when the save failed: an unlock
      // cannot be taken back, and the next launch would not find the clear that earned it.
      void syncAchievements(outcome.progress);
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
    // The longer note is shown once, here; after it, every later card is the short one.
    if (this.keepsake && this.keepsakeFirst) markScrapbookSeen();
    this.keepsakeStruck = false;
    this.starsLanded = 0;
    this.replay = null;
    const accuracy = meanAccuracy(this.results);
    this.recordOutcome();
    const outcome = this.outcome!;
    // A cleared finale names the area it closed, and the ribbon over the plaque says so.
    this.finaleCleared = this.finale !== null && outcome.cleared && !this.saveFailed;
    // The mastery payoff waits for the medals, and on a finale for the ribbon and its card:
    // Area complete is the bigger thing and goes first; this follows as the smaller one.
    this.masteryAt = this.mastered ? this.summaryAt + (this.finaleCleared ? MASTERY.finaleDelay : MASTERY.delay) : -Infinity;
    this.masteryStruck = false;
    this.changeHeadline(this.saveFailed ? 'Couldn’t save' : this.finaleCleared ? this.spec.areaName : outcome.cleared ? 'Cleared' : 'Again?');
    if (this.finaleCleared) {
      const at = this.summaryAt + FINALE_PAYOFF.ribbonDelay;
      this.finale!.settleLine(this.summaryAt);
      this.finale!.showComplete(at);
      // Scheduled at the heard time the ribbon unrolls, which on the context clock is the
      // same number: a sound placed at T is heard when `now()` reads T.
      if (this.audio) this.audio.playStinger(at, createFinaleSound(this.audio.context, 'fanfare'), FINALE_PAYOFF.fanfareGain);
    }
    this.scoreValue.setText(`${Math.round(accuracy)}%`);
    this.accuracy.setText('');
    this.kept.setVisible(this.heartRefunded);
    this.summaryStars = starsFor(accuracy, this.spec);
    this.replayOffered = offersReplay(outcome.cleared, this.summaryStars);
    const labels = thresholdLabels(this.spec);
    this.chipLabels.forEach((chip, k) => chip.setText(labels[k]!));
    this.chipEarned = [null, null, null];
    this.nextStar.setText(nextStarCopy(this.summaryStars, this.spec.starAccuracy) ?? '');
    this.replayLabel.setText(replayCopy(this.spec.level));
    if (this.finaleCleared) {
      const stars = totalStars(outcome.progress);
      this.finaleCount.setText(String(stars));
      this.gateChip = nextGateChip(this.spec.level, stars);
      this.gateLabel.setText(this.gateChip.text.toUpperCase());
    } else this.gateChip = null;
    this.setAction(outcome.cleared ? 'Continue' : 'Try again');
    // A milestone's review flow is prepared now, in the background, and launched from
    // Continue, never here: the celebration runs its course and the button is what asks.
    // Which clears are milestones is `review/appReview.ts`; this scene only reports the facts.
    const milestone = appReview().offer({
      level: this.spec.level, cleared: outcome.cleared, finale: this.finaleCleared, saved: !this.saveFailed,
    });
    if (milestone) breadcrumb('review offered', { milestone: milestone.id });
    // Placed now that the rows under the plaque are known, then drawn.
    this.placeResult();
    this.drawStars();
    this.drawTaskMarks();
  }
  /** Quiet progress, not another score counter: a row of beads, the done ones filled. Uses completed tasks, never frame time. */
  /**
   * Where the result goes on this frame: the plaque, the rows under it and the replay block
   * over Continue (`planResult`). Runs on every layout and again when the summary opens,
   * because what hangs under the plaque — a finale's card, the next star, a keepsake — is
   * only known then, and the plaque makes room for the rows rather than the rows for it.
   */
  private placeResult(): void {
    const s = this.uiScale, { safe } = this.viewport;
    const summary = this.summaryShown;
    const cardW = this.resultRowWidth();
    const replayH = Math.max(88 * s, this.controlSize);
    const frame = {
      s, width: safe.width - 40 * s, top: safe.top + 190 * s, preferredTop: safe.top + 300 * s,
      blockTop: this.actionRect.y, replayHeight: replayH,
    };
    const plan = planResult(frame, {
      refund: summary && this.heartRefunded,
      finale: summary && this.finaleCleared,
      mastery: summary && this.mastered,
      strip: summary && nextStarCopy(this.summaryStars, this.spec.starAccuracy) !== null,
      keepsake: summary && this.keepsake ? this.measureKeepsakeCard(cardW) : 0,
      replay: summary && this.replayOffered,
    });
    this.resultPlan = plan;
    this.plaqueAt = { x: safe.centerX, y: plan.anchorY };
    const card = plan.rows.find(row => row.kind === 'keepsake');
    if (card) this.keepsakeRect.setTo(safe.centerX - cardW / 2, card.y, cardW, card.height);
    this.keepsakeSettled = false;
    const replayW = Math.min(RESULT_ROWS.replayWidth * s, safe.width - 40 * s);
    if (plan.replayY === null) this.replayRect.setTo(0, 0, 0, 0);
    else this.replayRect.setTo(safe.centerX - replayW / 2, plan.replayY, replayW, replayH);
    // The finale's title card hangs where the bare plaque would, and its ribbon across the
    // plaque's top edge, wherever the rows under it have put that.
    const bare = planResult(frame, { refund: false, finale: false, strip: false, keepsake: 0, replay: false });
    this.finale?.layout({
      s, left: safe.left, right: safe.right, centerX: safe.centerX, ceiling: safe.top,
      lineY: safe.top + 128 * s,
      // On the result the headline is the area's name at full size; the line hangs under it.
      resultLineY: safe.top + 196 * s,
      cardY: bare.anchorY + bare.rope + bare.plaqueHeight / 2,
      ribbonY: plan.anchorY + plan.rope,
    });
    this.dressResult();
    this.drawReplay(0);
  }

  /** The rows under the plaque share its width, so the result reads as one column. */
  private resultRowWidth(): number {
    return Math.min(PLATE.width * this.uiScale, this.viewport.safe.width - 40 * this.uiScale);
  }

  /**
   * Sets the keepsake card's words and returns the height they need. The card was a fixed
   * height, and the first keepsake's note ran to a fourth line at a 393-point width and was
   * cut off by the card's own bottom edge.
   */
  private measureKeepsakeCard(width: number): number {
    const s = this.uiScale, keepsake = this.keepsake!;
    const count = collectionCount(this.outcome?.progress ?? loadProgress());
    resize(this.keepsakeLabel, 20 * s, PALETTE.coral, STYLE.current, false);
    this.keepsakeName.setText(keepsake.name);
    resize(this.keepsakeName, 34 * s, PALETTE.ink, STYLE.current, false);
    // The first says what just happened and where it went; after that, only the tally.
    this.keepsakeNote.setText(this.keepsakeFirst
      ? `Three stars on a level earn its keepsake. Yours are in the Scrapbook on the title screen.`
      : `In your Scrapbook · ${count.owned}/${count.total}`);
    resize(this.keepsakeNote, 21 * s, PALETTE.muted, STYLE.current, false);
    this.keepsakeNote.setWordWrapWidth(Math.max(80 * s, width - (28 + KEEPSAKE_CARD.art + 48) * s), false);
    return keepsakeCardHeight(KEEPSAKE_CARD.noteTop * s + this.keepsakeNote.height, s);
  }

  /** The result's type sizes, set on a layout and never per frame: a resize re-rasterises. */
  private dressResult(): void {
    const s = this.uiScale, k = this.resultPlan?.k ?? 1;
    resize(this.scoreValue, PLATE.scoreSize * s * k, PALETTE.ink);
    resize(this.scoreNote, PLATE.noteSize * s * k, PALETTE.muted, STYLE.current, false);
    resize(this.kept, 22 * s * k, shade(BRASS, -0.62), STYLE.current, false);
    for (const chip of this.chipLabels) resize(chip, PLATE.chip.text * s * k, PALETTE.ink, STYLE.current, false);
    this.chipEarned = [null, null, null];
    resize(this.nextStar, 30 * s, PALETTE.ink, STYLE.current, false);
    resize(this.finaleCount, 48 * s, PALETTE.ink);
    resize(this.finaleCountLabel, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.masteryLabel, 24 * s, shade(BRASS, -0.62), STYLE.current, false);
    resize(this.gateLabel, 20 * s, this.gateChip?.ink ?? PALETTE.ink, STYLE.current, false);
    resize(this.replayLabel, 34 * s, SHELL.cream);
  }

  /** Wood, not coral: Continue stays the one action the colour points to. */
  private drawReplay(press: number): void {
    const shown = this.summaryShown && this.replayOffered;
    this.replayRoot.setVisible(shown);
    const g = this.replayPlate.clear();
    if (!shown) return;
    const s = this.uiScale, r = this.replayRect;
    drawPanel(g, r, s, { fill: SHELL.wood, depth: 12, press });
    const sink = 12 * s * press * 0.8;
    placeSurface(this.replaySurface, r, s, sink);
    this.replayLabel.setPosition(r.centerX, r.centerY + sink);
  }

  /** The card is a Graphics *and* three Texts, the same lesson the plaque taught: hide them together. */
  private hideKeepsakeCard(): void {
    for (const part of [this.keepsakeCard, this.keepsakeLabel, this.keepsakeName, this.keepsakeNote]) part?.setVisible(false);
    this.keepsakeCard?.clear();
  }

  /**
   * The new keepsake, mounted on a card that rises into place after the medals. f(age) from
   * the summary's own clock, like the plaque; still under reduced motion. It asks for
   * nothing — the tap that moves on works from the first frame of the summary.
   */
  private drawKeepsakeCard(now: number): void {
    const keepsake = this.keepsake;
    const age = now - this.summaryAt - KEEPSAKE_CARD.delay - (this.finaleCleared ? FINALE_PAYOFF.keepsakeLag : 0)
      - (this.mastered ? MASTERY.keepsakeLag : 0);
    if (!this.summaryShown || !keepsake || age < 0) {
      if (this.keepsakeCard.visible) this.hideKeepsakeCard();
      return;
    }
    const still = this.reducedMotion;
    if (this.keepsakeSettled && (still || age > KEEPSAKE_CARD.rise + 0.3)) return;
    this.keepsakeSettled = still || age > KEEPSAKE_CARD.rise + 0.3;
    const s = this.uiScale;
    const pose = still ? { rise: 0, alpha: 1 } : arrive(age, KEEPSAKE_CARD.rise);
    const r = new Phaser.Geom.Rectangle(this.keepsakeRect.x, this.keepsakeRect.y + pose.rise * 40 * s, this.keepsakeRect.width, this.keepsakeRect.height);
    const g = this.keepsakeCard.clear().setVisible(true).setAlpha(pose.alpha);
    drawPanel(g, r, s, { fill: SHELL.cream, depth: 8, radius: 18, hero: true });
    // The keepsake on its own small mount, stamped down as the card arrives.
    const artSize = KEEPSAKE_CARD.art * s;
    const ax = r.x + 28 * s + artSize / 2, ay = r.y + Math.min(r.height / 2, 96 * s);
    const stamp = still ? 1 : squash(age - 0.25, 0.22, 0.45) * 0.12 + 1;
    g.fillStyle(SHELL.bench, 1).fillRoundedRect(ax - artSize / 2, ay - artSize / 2, artSize, artSize, 10 * s);
    drawKeepsake(g, keepsake.id, ax, ay, artSize * 0.86 * stamp, false, SHELL.bench);
    if (!this.keepsakeStruck && age >= 0.25) {
      this.keepsakeStruck = true;
      if (!still) this.fx.burst('sparks', ax, ay, [SHELL.sun, 0xffe7a0, PALETTE.coral], 10);
      vibrate('tap');
    }
    // The words were set and measured when the card was placed; the card is as tall as they are.
    const tx = ax + artSize / 2 + 24 * s;
    this.keepsakeLabel.setPosition(tx, r.y + 38 * s).setAlpha(pose.alpha).setVisible(true);
    this.keepsakeName.setPosition(tx, r.y + 78 * s).setAlpha(pose.alpha).setVisible(true);
    this.keepsakeNote.setPosition(tx, r.y + KEEPSAKE_CARD.noteTop * s).setAlpha(pose.alpha).setVisible(true);
  }

  private drawTaskMarks(): void {
    const s = this.uiScale, { safe } = this.viewport;
    const count = this.spec.tasks.length;
    const gap = 20 * s, y = safe.top + 58 * s;
    const g = this.taskMarks.clear();
    const f = faces(this.definition.ink);
    // A level with a breather marks its midpoint: a short tick between the last task before
    // the rest and the rest's own, with half a gap either side of it.
    const breather = breatherTask(count);
    const split = breather > 0 ? gap * 0.3 : 0;
    const at = (i: number) => safe.centerX + (i - (count - 1) / 2) * gap + (breather > 0 ? (i >= breather ? split : -split) : 0);
    if (breather > 0) {
      const tx = (at(breather - 1) + at(breather)) / 2;
      g.lineStyle(2.5 * s, PALETTE.muted, 0.9).lineBetween(tx, y - 7 * s, tx, y + 7 * s);
    }
    for (let i = 0; i < count; i++) {
      const x = at(i);
      const done = i < this.taskIndex || this.summaryShown;
      const current = i === this.taskIndex && !this.summaryShown && !this.intro;
      const r = (current ? 5.5 : 4.5) * s;
      g.fillStyle(f.edge, done || current ? 1 : 0.25).fillCircle(x, y + 1.5 * s, r);
      g.fillStyle(done ? f.face : current ? f.lit : SHELL.puck, done || current ? 1 : 0.6).fillCircle(x, y, r);
      if (done || current) g.fillStyle(f.rim, 0.8).fillCircle(x - r * 0.3, y - r * 0.35, r * 0.28);
    }
  }
  /** The plaque's own scale: the scene's, and the planner's on a short or narrow frame. */
  private get plateScale(): number { return this.uiScale * (this.resultPlan?.k ?? 1); }

  /** Medal `k` in the plaque's own space, measured from the ceiling anchor. */
  private medalLocal(k: number): { x: number; y: number } {
    const s = this.plateScale, seat = medalSeat(k as 0 | 1 | 2);
    return { x: seat.x * s, y: (this.resultPlan?.rope ?? 0) + seat.y * s };
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
   * The result plaque. It hangs from the ceiling on two ropes on its outer thirds, drops into
   * place, and takes a knock from each medal as it stamps. The medals seat in a recessed tray
   * near its top — the middle one larger and raised — each over a chip naming the accuracy
   * that earns it, so a missed star says what it would have taken; under the tray, the score.
   * They used to straddle the plaque's top edge, where the outer two crossed the ropes.
   *
   * Nothing here decides anything: `starsFor` has scored the level, `planResult` has placed
   * it and `starReveal.ts` supplies every pose as `f(t)`. **Everything the result is made
   * of is hidden here and nowhere else** — the chips, the rows under the plaque and the
   * replay block are as much the plaque as its score is.
   */
  private drawStars(): void {
    this.stars.clear().setPosition(0, 0).setRotation(0);
    const shown = this.summaryShown;
    this.kept.setVisible(shown && this.heartRefunded);
    this.scoreValue.setVisible(shown);
    this.scoreNote.setVisible(shown);
    for (const chip of this.chipLabels) chip.setVisible(shown);
    this.replayRoot.setVisible(shown && this.replayOffered);
    if (!shown || !this.resultPlan) {
      for (const plate of [this.nextStarPlate, this.finalePlate, this.masteryPlate]) plate.clear().setVisible(false);
      for (const text of [this.nextStar, this.finaleCount, this.finaleCountLabel, this.gateLabel, this.masteryLabel]) text.setVisible(false);
      return;
    }
    const plan = this.resultPlan;
    const s = this.plateScale;
    const still = this.reducedMotion;
    const age = this.now() - this.summaryAt;
    const earned = this.summaryStars;
    const exaggeration = STYLE.current.exaggeration;
    const pose = plaquePose(age, still);
    const mastery = masteryPose(this.now() - this.masteryAt, still);
    const jolt = still ? 0 : plaqueJolt(age, earned, exaggeration) + (mastery?.knock ?? 0);
    const plaqueH = plan.plaqueHeight;
    const drop = (pose.drop + jolt) * plaqueH;
    const width = PLATE.width * s;
    const top = plan.rope;
    const g = this.stars;
    g.setPosition(this.plaqueAt.x, this.plaqueAt.y + drop).setRotation(pose.tilt).setAlpha(pose.alpha);

    // Mastery: a brass ring opening behind the whole plaque, after the chorus has faded.
    // Behind the ropes and the plate, so it frames the result rather than crossing it.
    if (mastery && mastery.ring.alpha > 0.01) {
      const centre = { x: 0, y: top + plaqueH * 0.45 };
      const reach = width * (0.42 + 0.46 * mastery.ring.spread);
      g.lineStyle((16 - 11 * mastery.ring.spread) * s, BRASS, mastery.ring.alpha).strokeCircle(centre.x, centre.y, reach);
      g.lineStyle(4 * s, 0xffe7a0, mastery.ring.alpha * 0.7).strokeCircle(centre.x, centre.y, reach * 0.93);
    }

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

    drawRopes(g, s, top, [-PLATE.ropeX * s, PLATE.ropeX * s], PLATE.ropeEye);
    drawPanel(g, new Rect(-width / 2, top, width, plaqueH), s, {
      fill: SHELL.cream, depth: 12, radius: 40, hero: true,
    });
    // The tray: a bench-coloured hollow, its top edge in shadow and its lower lip catching the light.
    const tray = trayRect(), tr = PLATE.tray.radius * s, lip = PLATE.tray.shadow * s;
    const tx = tray.x * s, ty = top + tray.y * s, tw = tray.width * s, th = tray.height * s;
    g.fillStyle(shade(SHELL.bench, -0.18), 1).fillRoundedRect(tx, ty, tw, th, tr);
    g.fillStyle(SHELL.bench, 1).fillRoundedRect(tx, ty + lip, tw, th - lip, { tl: tr * 0.85, tr: tr * 0.85, bl: tr, br: tr });
    g.fillStyle(0xffffff, 0.4).fillRoundedRect(tx + tr, ty + th - 5 * s, tw - tr * 2, 3 * s, 1.5 * s);

    const empty = starColour(false, this.definition.ink, SHELL.cream);
    for (let k = 0; k < 3; k++) {
      const seat = medalSeat(k as 0 | 1 | 2);
      const at = { x: seat.x * s, y: top + seat.y * s }, radius = seat.radius * s;
      // An empty seat is a hollow, never a duller star: brass reads against hollow at any tone.
      drawStarSeat(g, at.x, at.y, radius, SHELL.bench, PALETTE.muted);
      let landed = false;
      if (k < earned) {
        const local = starAge(age, k, still);
        if (local > 0) {
          const medal = starPose(local, true, exaggeration);
          landed = medal.landed;
          drawStarMark(g, {
            x: at.x, y: at.y, radius, color: prizeColour(empty, medal.fill), pose: medal,
            // The medals glint together once for mastery, on the chorus's own bloom.
            impactAge: starImpactAge(local, true), chorus: still ? 0 : Math.max(chorusGlow(age, earned), mastery?.flash ?? 0),
          });
        }
      }
      this.drawChip(k as 0 | 1 | 2, s, top, landed, pose.tilt, drop, pose.alpha);
    }

    this.hangText(this.scoreValue, 0, top + PLATE.scoreY * s, pose.tilt, drop, pose.alpha);
    this.hangText(this.scoreNote, 0, top + PLATE.noteY * s, pose.tilt, drop, pose.alpha);
    if (this.heartRefunded) {
      // A refunded heart is brass on brass: a small struck plate, not a coral caption.
      const keptW = PLATE.keptWidth * s, keptH = PLATE.keptTall * s, keptY = top + PLATE.keptY * s;
      drawPanel(g, new Rect(-keptW / 2, keptY - keptH / 2, keptW, keptH), s, { fill: BRASS, depth: 5, radius: 18 });
      drawHeart(g, -keptW / 2 + 42 * s, keptY, 17 * s, PALETTE.coral);
      this.hangText(this.kept, 14 * s, keptY, pose.tilt, drop, pose.alpha);
    }
    this.drawResultRows(age, still);
    this.drawMasteryRow(mastery, still);
  }

  /**
   * The chip under seat `k`: ink with cream once its star has landed, a dashed outline
   * round the threshold until then. Hung from the plaque like the score, so it swings with it.
   */
  private drawChip(k: 0 | 1 | 2, s: number, top: number, earned: boolean, tilt: number, drop: number, alpha: number): void {
    const g = this.stars, chip = chipSeat(k);
    const w = chip.width * s, h = chip.height * s, cx = chip.x * s, cy = top + chip.y * s, r = h / 2;
    if (earned) g.fillStyle(PALETTE.ink, 1).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
    else {
      const outline: { x: number; y: number }[] = [];
      for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + i * Math.PI / 12; outline.push({ x: cx + w / 2 - r + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
      for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + i * Math.PI / 12; outline.push({ x: cx - w / 2 + r + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
      outline.push(outline[0]!);
      g.lineStyle(Math.max(1.5, 2.4 * s), PALETTE.muted, 1);
      for (const [a, b] of dashes(outline, 7 * s, 5 * s)) g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const text = this.chipLabels[k]!;
    if (this.chipEarned[k] !== earned) {
      this.chipEarned[k] = earned;
      text.setColor(hex(earned ? SHELL.cream : PALETTE.ink));
    }
    this.hangText(text, cx, cy, tilt, drop, alpha);
  }

  /**
   * The mastery plate under the plaque: brass, like a refunded heart's, with the words
   * and a star at each end. It stands on the frame, not on the ropes, and arrives with
   * the ring. Null pose means not yet, or never.
   */
  private drawMasteryRow(mastery: ReturnType<typeof masteryPose>, still: boolean): void {
    const row = this.resultPlan?.rows.find(r => r.kind === 'mastery');
    const g = this.masteryPlate.clear();
    if (!row || !mastery) {
      g.setVisible(false);
      this.masteryLabel.setVisible(false);
      return;
    }
    const s = this.uiScale, w = Math.min(RESULT_ROWS.replayWidth * s, this.resultRowWidth());
    const x = this.viewport.safe.centerX - w / 2;
    const rise = still ? 0 : mastery.label.rise, alpha = still ? 1 : mastery.label.alpha;
    const y = row.y + rise * 24 * s, cy = y + row.height / 2;
    g.setVisible(true).setAlpha(alpha);
    drawPanel(g, new Rect(x, y, w, row.height), s, { fill: BRASS, depth: 6, radius: 18 });
    drawStar(g, x + 44 * s, cy, 15 * s, STAR_PRIZE);
    drawStar(g, x + w - 44 * s, cy, 15 * s, STAR_PRIZE);
    this.masteryLabel.setPosition(this.viewport.safe.centerX, cy).setAlpha(alpha).setVisible(true);
  }

  /**
   * The rows under the plaque, in the planner's order. Each arrives once the medals have had
   * their moment — the next star as the last one lands, the finale's card with its ribbon —
   * and none of them swings: they stand on the frame, not on the ropes.
   */
  private drawResultRows(age: number, still: boolean): void {
    const plan = this.resultPlan!, s = this.uiScale;
    const w = this.resultRowWidth(), x = this.viewport.safe.centerX - w / 2;
    const arrival = (delay: number) => (still ? { rise: 0, alpha: 1 } : age < delay ? { rise: 1, alpha: 0 } : arrive(age - delay, 0.4));
    const strip = plan.rows.find(row => row.kind === 'strip');
    const g = this.nextStarPlate.clear().setVisible(strip !== undefined);
    if (strip) {
      const pose = arrival(RESULT_REVEAL.stripDelay);
      const y = strip.y + pose.rise * 24 * s, r = 20 * s, lip = 6 * s;
      g.setAlpha(pose.alpha);
      // A recess in the bench, like the tray: shadow along its top edge.
      g.fillStyle(shade(SHELL.bench, -0.16), 1).fillRoundedRect(x, y, w, strip.height, r);
      g.fillStyle(SHELL.bench, 1).fillRoundedRect(x, y + lip, w, strip.height - lip, { tl: r * 0.85, tr: r * 0.85, bl: r, br: r });
      const cy = y + (strip.height + lip) / 2;
      drawStarSeat(g, x + 54 * s, cy, 24 * s, SHELL.bench, PALETTE.muted);
      this.nextStar.setPosition(x + 96 * s, cy).setAlpha(pose.alpha).setVisible(true);
    } else this.nextStar.setVisible(false);

    const card = plan.rows.find(row => row.kind === 'finale');
    const f = this.finalePlate.clear().setVisible(card !== undefined && this.gateChip !== null);
    const chip = this.gateChip;
    if (card && chip) {
      const pose = arrival(FINALE_PAYOFF.ribbonDelay + RESULT_REVEAL.finaleLag);
      const y = card.y + pose.rise * 24 * s, cy = y + card.height / 2;
      f.setAlpha(pose.alpha);
      drawPanel(f, new Rect(x, y, w, card.height), s, { fill: SHELL.puck, depth: 8, radius: 22 });
      drawStar(f, x + 50 * s, cy, 24 * s, STAR_PRIZE);
      this.finaleCount.setPosition(x + 88 * s, cy).setAlpha(pose.alpha).setVisible(true);
      this.finaleCountLabel.setPosition(x + 88 * s + this.finaleCount.width + 12 * s, cy + 3 * s).setAlpha(pose.alpha).setVisible(true);
      // The next area's gate, in that area's own colours.
      const chipW = this.gateLabel.width + 44 * s, chipH = 52 * s, chipX = x + w - 24 * s - chipW;
      f.fillStyle(chip.ground, 1).fillRoundedRect(chipX, cy - chipH / 2, chipW, chipH, chipH / 2);
      f.lineStyle(2 * s, shade(chip.ground, -0.35), 1).strokeRoundedRect(chipX, cy - chipH / 2, chipW, chipH, chipH / 2);
      this.gateLabel.setPosition(chipX + chipW / 2, cy).setAlpha(pose.alpha).setVisible(true);
    } else for (const text of [this.finaleCount, this.finaleCountLabel, this.gateLabel]) text.setVisible(false);
  }

  /** Medals stamp left to right; an earned one throws confetti and sparks as it lands. */
  private animateStars(now: number): void {
    const earned = this.summaryStars;
    const still = this.reducedMotion;
    const summaryAge = now - this.summaryAt;
    const pose = plaquePose(summaryAge, still);
    const mastery = masteryPose(now - this.masteryAt, still);
    const drop = (pose.drop + (still ? 0 : plaqueJolt(summaryAge, earned, STYLE.current.exaggeration) + (mastery?.knock ?? 0)))
      * (this.resultPlan?.plaqueHeight ?? 0);
    // Mastery's one strike: the sting, a pulse and sparks over the plaque, as the ring opens.
    if (mastery && !this.masteryStruck) {
      this.masteryStruck = true;
      if (this.audio) {
        const voices = this.grooveVoices ??= createGrooveVoices(this.audio.context);
        this.audio.playStinger(this.masteryAt, voices.sting, 0.42);
      }
      vibrate('stamp');
      if (!still) {
        const crest = this.hangAt(0, (this.resultPlan?.rope ?? 0) + (this.resultPlan?.plaqueHeight ?? 0) * 0.45, pose.tilt, drop);
        this.starFx.burst('sparks', crest.x, crest.y, [BRASS, 0xffe7a0, SHELL.cream], 18);
      }
    }
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
        const crest = this.hangAt(0, this.resultPlan?.rope ?? 0, pose.tilt, drop);
        this.starFx.burst('confetti', crest.x, crest.y, [PALETTE.coral, SHELL.sun, SHELL.cream, STAR_PRIZE], 26);
      }
    }
    this.drawStars();
  }
  /**
   * The cleared result's Continue. Not `leaveForMap`, which the map puck and the mid-run
   * sheet also use: only this exit is where a review milestone's flow is launched, and
   * it goes to the map on every branch — unavailable, refused, failed or slow included.
   */
  private continueFromSummary(): void {
    if (this.curtain.active) return;
    this.continuation ??= createContinuation(
      async () => {
        const result = await appReview().launch();
        if (result !== 'skipped') breadcrumb('review launched', { result });
      },
      () => { if (!this.disposed) this.leaveForMap(); },
    );
    void this.continuation.run();
  }
  private leaveForMap(): void {
    if (this.curtain.active) return;
    this.persistAbandonedAttempt();
    // Stop outgoing action voices immediately. The map will claim this loop as the
    // shell bed at rate 1 rather than starting a second source over it.
    this.controller?.dispose();
    this.transition = null;
    this.replay = null;
    this.audio?.cancel();
    this.audio?.music.setRate(1, this.audio.context.currentTime);
    // The stars this run added are the map's to deliver: they fly from this level's plate
    // into the collection on the bench, and the count there does not move until they land.
    const outcome = this.outcome;
    const before = outcome?.bestBefore == null ? 0 : starsFor(outcome.bestBefore, this.spec);
    const after = outcome ? starsFor(outcome.progress.best[this.spec.level] ?? 0, this.spec) : 0;
    const earned: EarnedStars | undefined = this.levelCleared && after > before ? { level: this.spec.level, before, after } : undefined;
    this.curtain.cover(() => this.scene.start(SceneKey.Map, { focus: this.levelCleared ? this.spec.level + 1 : this.spec.level, ...(earned ? { earned } : {}) }));
  }
  private showNoHearts(): void {
    this.starting = false;
    if (monetization().premium()) return;
    this.changeHeadline('No hearts');
    const health = loadHealth();
    // The first time ever, the line under the countdown says the rule in full: finished
    // levels are free, and the map is where they are. Said once; the map's sheet says
    // it too, and marks it as well, so whichever screen the player meets first is the
    // one that tells them.
    if (!this.replayTipShown) {
      this.replayTipShown = true;
      this.firstEmpty = !seenReplayTip();
      if (this.firstEmpty) markReplayTipSeen();
    }
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
    if (this.firstEmpty) {
      // Two lines, as ever: the countdown carries the rule and the note says what to do with it.
      return wait === null ? HEALTH_COPY.firstEmptyPlay : `Next one in ${wait} · ${HEALTH_COPY.firstEmptyLead}\n${HEALTH_COPY.firstEmptyPlay}`;
    }
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
    if (this.disposed) return;
    this.vignette.pause();
    this.setIntroCaption('');
    this.changeHeadline('Paused');
    this.setAction('Resume');
  }
  private interrupt(): void {
    // `pagehide` in main.ts destroys the game before this scene's own listener runs —
    // both are on the same snapshot — so this can be entered after shutdown has already
    // destroyed the act and the text. Touching them here is a throw on the way out.
    if (this.disposed) return;
    ++this.startRequest;
    this.replay = null;
    this.replayOffset = null;
    this.transition = null;
    const wasTeaching = this.teach !== null;
    this.teach = null;
    const wasStarting = this.starting;
    this.starting = false;
    this.taps.reset();
    const wasEnding = this.controller?.phase === 'result';
    const wasRunning = this.controller !== null && this.controller.phase !== 'idle';
    this.controller?.interrupt('Paused');
    this.audio?.cancel();
    this.audio?.music.stop();
    // The last task has already been scored: reveal the plaque rather than "Resume",
    // which would start a new try and could charge another heart for a finished run.
    if (pauseShouldShowSummary(wasEnding ? 'result' : 'paused', this.outcome !== null)) {
      this.vignette.pause();
      if (!this.summaryShown) this.showSummary();
      return;
    }
    if (wasEnding || wasStarting || wasTeaching) { this.controller?.dispose(); this.showPause(); }
    // Freezing the idle illustration would leave it stuck until the next round begins.
    if (wasRunning || wasStarting || wasTeaching) this.vignette.pause();
  }
  private persistAbandonedAttempt(): void {
    // A finished run has already closed, so this reports only a player leaving mid-level.
    this.levelRun?.abandon();
    if (this.attemptId === null) return;
    saveHealth(abandonAttempt(loadHealth(), this.attemptId));
  }

  private readonly visibility = (): void => {
    if (document.hidden && !this.commerceBusy) this.interrupt();
  };
  private readonly pageHide = (): void => {
    if (this.disposed || this.commerceBusy) return;
    this.interrupt();
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
    this.grooveStage.destroy();
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
