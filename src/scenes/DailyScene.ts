import Phaser from 'phaser';
import { breadcrumb, setErrorContext } from '@/core/errors';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import type { AudioEngine, VignetteSounds } from '@/audio/AudioEngine';
import { setMusicBed } from '@/audio/musicBed';
import { ensureScreenMusic, outputSilent, sharedAudio, shellTrack, stopTheme, toggleMute } from '@/audio/sharedAudio';
import { syncClockCalibration } from '@/audio/audioRoute';
import { samples } from '@/audio/samples';
import { DAILY_REWARDS } from '@/config/dailyTempo';
import { MUSIC } from '@/config/music';
import { LAYOUT } from '@/config/design';
import { RHYTHM } from '@/config/rhythm';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { wrongOrientation } from '@/core/shell';
import { RoundController, type Phase } from '@/game/RoundController';
import { canPlaceNextTask, TaskSequence } from '@/game/TaskSequence';
import { batonLanding, beatsPlayed, countIn, handover, isFlawless, isLastRestBar, markFor, restCopy, restProgress, trackGeometry, type Mark } from '@/game/beatTrack';
import { bandBars, bandLabel, dailyChart, type DailyChart } from '@/game/dailyChart';
import { applyDailyRewards, timerMinutesFor, todaysRewards, type AppliedRewards, type DailyRewardRecord, type Stars } from '@/game/dailyRewards';
import { dailyTempoDay, msUntilNextDay, untilNextDayCopy, weekdayName } from '@/game/dayKey';
import { meanAccuracy, starsFor } from '@/game/levels';
import { advanceLayers, OPENING_LAYERS } from '@/game/musicLayers';
import { dailyObjectiveReport, objectiveContext, recordObjectives } from '@/game/objectives';
import { loadProgress } from '@/game/progress';
import { formatMinutes, loadReplayTimer, shelfView, type ShelfItemView } from '@/game/replayTimer';
import { scoreLabel } from '@/game/resultCopy';
import type { RoundResult } from '@/game/scoring';
import { KEEPSAKES, ownsKeepsake } from '@/game/scrapbook';
import { finishOutcome, levelBars } from '@/game/taskVerdict';
import { TapInput, type Tap } from '@/input/TapInput';
import { track } from '@/monetization/analytics';
import { queueCloudSave, startHeldTimerSynced } from '@/playgames/cloudSync';
import { dailyTempoLeaderboardOffered, openDailyTempoLeaderboard, recordDailyTempo } from '@/playgames/dailyTempo';
import { submissionCopy } from '@/playgames/leaderboard';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawActionDisc, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { planDailyCard } from '@/ui/dailyCard';
import { planDailyPlaque, type DailyPlaquePlan } from '@/ui/dailyPlaque';
import { Feedback, FxKey } from '@/ui/feedback';
import { drawBack, drawHeart, drawPause, drawRestart, drawSpeaker, drawSun } from '@/ui/icons';
import { drawKeepsake } from '@/ui/keepsakes';
import { drawPanel, placeSurface, Rect, surface } from '@/ui/panel';
import { dashes } from '@/ui/path';
import { punch } from '@/ui/punch';
import { chipSeat, medalSeat, PLATE, trayRect } from '@/ui/resultLayout';
import { ladderHeading, ladderRows, type LadderRow } from '@/ui/rewardLadder';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive, settle, squash } from '@/ui/spring';
import { drawStar, drawStarMark, drawStarSeat, STAR_PRIZE } from '@/ui/star';
import { starMeterPose } from '@/ui/starMeter';
import { starAge, starImpactAge, starPose } from '@/ui/starReveal';
import { drawTimerToken } from '@/ui/timerToken';
import { blockGeometry, blockScale, blockWidth, columnRoom, columnShift, drawBlock, TRACK } from '@/ui/turnBlock';
import { balanceWrap, body, display, label, resize, wrapWidth } from '@/ui/type';
import { TurnWords } from '@/ui/turnWords';
import { easeInOutCubic, easeOut } from '@/vignettes/motion';
import { VIGNETTES } from '@/vignettes/registry';
import { definitionForLap, type Vignette, type VignetteDefinition } from '@/vignettes/Vignette';

/** The cloth texture's alpha over the Play and Continue blocks, which the disc shows through. */
const BLOCK_CLOTH_ALPHA = 0.35;
/** The task beads over the meter: one a task, the current one larger, a tick at the breather. */
const BEAD = { radius: 5.5, current: 7, gap: 28 } as const;
/** The HUD's rows from the safe top, in design units: the pill shares the pucks' row. */
const HUD = { pillY: 66, beadsY: 118, starsY: 164, barY: 212, barHeight: 22, meterWordsY: 252, headlineY: 320 } as const;

type ScenePhase = 'card' | 'run' | 'result';
type AbandonReason = 'user' | 'timing' | 'background' | 'orientation' | 'audio';
type Pressed = 'play' | 'continue' | 'again' | 'exit' | 'start' | 'keep' | 'leave' | null;
type Puck = 'back' | 'board' | 'pause' | 'mute' | 'again' | null;

/** What the card and the result read of the day: the record, and the won timer on the shelf if any. */
interface DayFacts { readonly record: DailyRewardRecord | null; readonly won: ShelfItemView | null }

/**
 * Daily Tempo: one act, one chart drawn fresh each day and the same for everyone, stars like
 * a level's, free to play, with rewards that pay once a day (`docs/DAILY_TEMPO.md`). One
 * scene in three phases — the card the day is read from, the run, and the result — because
 * the run goes straight back to the card and the card is where a second run starts.
 *
 * The scene presents what `game/dailyChart.ts` and `game/dailyRewards.ts` decide. It is a
 * sibling of PlayScene and EndlessScene rather than a mode inside either: a level's scene
 * reads hearts, progress, gates, keepsakes, achievements and the music chapter off its level
 * number in some twenty-five places, and none of those exist for a chart, while Endless
 * forbids stars and tasks in a row by design. What the Daily shares with a level it shares by
 * using the same objects: the `RoundController`, the judge and the scorer, the turn block and
 * its count-in, the breather's tiles, the acts from the registry, the plaque's tray, and the
 * one `AudioEngine` with its one `MusicSystem`.
 *
 * Three rules. **A run is a level's loop**: one lead-in bar, then task after task on the bar
 * line, the breather at the midpoint of a long chart, the tempo and the stems moving on each
 * task's downbeat. **The meter moves once per finished task**, never per tap. **An
 * interrupted run is not a run** — backgrounding, a stall, the wrong orientation or a lost
 * audio context ends it once, with nothing scored, paid or sent — while the pause puck opens
 * a sheet over the run that goes on under it.
 */
export class DailyScene extends BaseScene {
  private from: typeof SceneKey.Menu | typeof SceneKey.Map = SceneKey.Menu;
  private phase: ScenePhase = 'card';
  private day = '';
  private chart!: DailyChart;
  private definition!: VignetteDefinition;
  private audio: AudioEngine | null = null;
  private controller: RoundController | null = null;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private backdrop!: Backdrop;
  private fx!: Feedback;
  private act: Vignette | null = null;
  private sounds: VignetteSounds | null = null;
  private soundsFor = '';
  // The run
  private taskIndex = 0;
  private results: number[] = [];
  private tally = { perfect: 0, flawless: 0 };
  private layers = OPENING_LAYERS;
  private sequence: TaskSequence | null = null;
  private transition: { slide: number; swap: number; next: number; swapped: boolean } | null = null;
  private finishUnlock = Infinity;
  private over = false;
  private invalid: AbandonReason | null = null;
  private resultTaken = false;
  private startRequest = 0;
  private starting = false;
  private runStartedAt = 0;
  private disposed = false;
  private pump: ReturnType<typeof setInterval> | null = null;
  private heldJudgements: Judgement[] = [];
  // The HUD and the block
  private chrome!: Phaser.GameObjects.Graphics;
  private pill!: Phaser.GameObjects.Graphics;
  private pillText!: Phaser.GameObjects.Text;
  private beads!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private meterValue!: Phaser.GameObjects.Text;
  private meterLeft!: Phaser.GameObjects.Text;
  private meterNext!: Phaser.GameObjects.Text;
  private headline!: Phaser.GameObjects.Text;
  private headlineAt = -Infinity;
  private headlineY = 0;
  private restLabel!: Phaser.GameObjects.Text;
  private restCall!: Phaser.GameObjects.Text;
  private marks!: Phaser.GameObjects.Graphics;
  private roomDim!: Phaser.GameObjects.Image;
  private roomPaper = -1;
  private outcomes: Mark[] = [];
  /** The count, the verdict word with its tag, and "Flawless!", as a level draws them (`ui/turnWords.ts`). */
  private words!: TurnWords;
  private struckIndex = -1;
  private struckAt = -Infinity;
  private struckPerfect = false;
  private columnX = 0;
  private extraAt = -Infinity;
  private punchAt = -Infinity;
  private trackY = 0;
  private trackWidth = 0;
  private blockS = 1;
  private uiScale = 1;
  private controlSize = 96;
  private muted = false;
  private pucks: Partial<Record<Exclude<Puck, null>, { x: number; y: number }>> = {};
  private puckPressed: Puck = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  // The card
  private card!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private dateLine!: Phaser.GameObjects.Text;
  private actEyebrow!: Phaser.GameObjects.Text;
  private actName!: Phaser.GameObjects.Text;
  private actIntro!: Phaser.GameObjects.Text;
  private bestLabel!: Phaser.GameObjects.Text;
  private bestValue!: Phaser.GameObjects.Text;
  private ladderTitle!: Phaser.GameObjects.Text;
  private ladderAside!: Phaser.GameObjects.Text;
  private bandChip!: Phaser.GameObjects.Text;
  private rowLabels: Phaser.GameObjects.Text[] = [];
  private rowChips: Phaser.GameObjects.Text[] = [];
  private explainer!: Phaser.GameObjects.Text;
  private shelfEyebrow!: Phaser.GameObjects.Text;
  private shelfName!: Phaser.GameObjects.Text;
  private shelfNote!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;
  /** The length on the card's one token face (the explainer's or the shelf row's), and the toast's. */
  private tokenMinutes!: Phaser.GameObjects.Text;
  private toastMinutes!: Phaser.GameObjects.Text;
  private playLabel!: Phaser.GameObjects.Text;
  private playSurface!: Phaser.GameObjects.TileSprite;
  private footnote!: Phaser.GameObjects.Text;
  private playRect = new Rect();
  private startRect = new Rect();
  private pollAt = 0;
  // The leave sheet
  private sheet!: Phaser.GameObjects.Graphics;
  private sheetTitle!: Phaser.GameObjects.Text;
  private sheetNote!: Phaser.GameObjects.Text;
  private sheetKeep!: Phaser.GameObjects.Text;
  private sheetLeave!: Phaser.GameObjects.Text;
  private sheetOpen = false;
  private keepRect = new Rect();
  private leaveRect = new Rect();
  private sheetRect = new Rect();
  // The result
  private plaque!: Phaser.GameObjects.Graphics;
  private plaquePlan: DailyPlaquePlan | null = null;
  private resultHeadline!: Phaser.GameObjects.Text;
  private resultPill!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private scoreNote!: Phaser.GameObjects.Text;
  private chipTexts: Phaser.GameObjects.Text[] = [];
  private toastTitle!: Phaser.GameObjects.Text;
  private toastNote!: Phaser.GameObjects.Text;
  private toastStart!: Phaser.GameObjects.Text;
  private continueLabel!: Phaser.GameObjects.Text;
  private continueSurface!: Phaser.GameObjects.TileSprite;
  private exitLabel!: Phaser.GameObjects.Text;
  private interruptedNote!: Phaser.GameObjects.Text;
  private continueRect = new Rect();
  private exitRect = new Rect();
  private toastStartRect = new Rect();
  private applied: AppliedRewards | null = null;
  private resultAccuracy = 0;
  private resultStars: Stars = 0;
  private newBest = false;
  private postingNote = '';
  private resultAt = -Infinity;
  private pressed: Pressed = null;
  private pressedAt = -Infinity;
  private pressDirty = false;
  private boardBusy = false;
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Daily); }

  protected override build(): void {
    // Assigned here, never left to the field initializers: a second visit reuses the instance.
    this.disposed = false;
    this.starting = false;
    this.audio = null;
    this.controller = null;
    this.act = null;
    this.sounds = null;
    this.soundsFor = '';
    this.phase = 'card';
    this.plaquePlan = null;
    this.pucks = {};
    this.resetRun();
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.from = data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
    this.refreshChart();
    setErrorContext('level', 'daily');
    this.muted = outputSilent(this);
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.5, y: 0.16 }, glowAlpha: 0.55 });
    this.fx = new Feedback(this, 5);
    this.fx.prime('sparks', [PALETTE.coral, SHELL.cream]);
    const ink = PALETTE.ink, muted = PALETTE.muted, cream = SHELL.cream;
    // The card.
    this.card = this.add.graphics().setDepth(10);
    this.title = display(this, 'Daily Tempo', { size: 56, colour: ink }).setOrigin(0, 0.5).setDepth(12);
    this.dateLine = label(this, '', { size: 20, colour: muted }).setOrigin(0, 0.5).setDepth(12);
    this.actEyebrow = label(this, 'Today’s act', { size: 18, colour: muted }).setOrigin(0, 0.5).setDepth(12);
    this.actName = display(this, '', { size: 36, colour: ink }).setOrigin(0, 0.5).setDepth(12);
    this.actIntro = body(this, '', { size: 22, colour: muted }).setOrigin(0, 0.5).setDepth(12);
    this.bestLabel = label(this, 'Best today', { size: 18, colour: muted, align: 'right' }).setOrigin(1, 0.5).setDepth(12);
    this.bestValue = display(this, '', { size: 36, colour: ink, align: 'right' }).setOrigin(1, 0.5).setDepth(12);
    // The ladder's words are shared by the card and the result, so they sit over the result's plaque as well as the card.
    this.ladderTitle = label(this, '', { size: 22, colour: muted }).setOrigin(0, 0.5).setDepth(32);
    this.ladderAside = label(this, '', { size: 20, colour: muted, align: 'right' }).setOrigin(1, 0.5).setDepth(32);
    this.bandChip = label(this, '', { size: 18, colour: ink, align: 'right' }).setOrigin(1, 0.5).setDepth(32);
    this.rowLabels = [0, 1, 2].map(() => display(this, '', { size: 28, colour: ink }).setOrigin(0, 0.5).setDepth(32));
    this.rowChips = [0, 1, 2].map(() => label(this, '', { size: 18, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(32));
    this.explainer = body(this, 'A won timer waits on your shelf. Start it within an hour, whenever a level needs it. A better run makes it longer.', { size: 22, colour: muted }).setOrigin(0, 0).setDepth(12);
    this.shelfEyebrow = label(this, 'On your shelf', { size: 18, colour: muted }).setOrigin(0, 0.5).setDepth(12);
    this.shelfName = display(this, '', { size: 28, colour: ink }).setOrigin(0, 0.5).setDepth(12);
    this.shelfNote = body(this, '', { size: 22, colour: muted }).setOrigin(0, 0.5).setDepth(12);
    this.startLabel = label(this, 'Start', { size: 22, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.tokenMinutes = display(this, '', { size: 20, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.toastMinutes = display(this, '', { size: 20, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.playLabel = display(this, 'Play', { size: 40, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.playSurface = surface(this, MaterialKey.cloth, new Rect(0, 0, 10, 10), 1, PALETTE.coral, BLOCK_CLOTH_ALPHA).setDepth(11);
    this.footnote = body(this, '', { size: 22, colour: muted, align: 'center' }).setOrigin(0.5).setDepth(12);
    // The HUD and the block.
    this.chrome = this.add.graphics().setDepth(10);
    this.pill = this.add.graphics().setDepth(10);
    this.pillText = label(this, 'Daily Tempo', { size: 20, colour: cream }).setOrigin(0, 0.5).setDepth(12);
    this.beads = this.add.graphics().setDepth(10);
    this.meter = this.add.graphics().setDepth(10);
    this.meterValue = display(this, '—', { size: 34, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(12);
    this.meterLeft = label(this, 'On the beat', { size: 18, colour: muted }).setOrigin(0, 0.5).setDepth(12);
    this.meterNext = label(this, '', { size: 18, colour: muted, align: 'right' }).setOrigin(1, 0.5).setDepth(12);
    this.headline = display(this, '', { size: 48, colour: cream, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.restLabel = label(this, '', { size: 22, colour: muted, align: 'center' }).setOrigin(0.5, 0).setAlpha(0).setDepth(12);
    this.restCall = display(this, '', { size: 40, colour: ink, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.roomDim = this.add.image(0, 0, FxKey.vignette).setDepth(6).setAlpha(0);
    this.roomPaper = -1;
    this.marks = this.add.graphics().setDepth(8);
    this.words = new TurnWords(this, this.fx, ink, 8);
    // The leave sheet.
    this.sheet = this.add.graphics().setDepth(40).setVisible(false);
    this.sheetTitle = display(this, 'Leave this run?', { size: 40, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.sheetNote = body(this, 'It ends here, unscored. Today’s chart is still here to play again.', { size: 24, colour: muted, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.sheetKeep = display(this, 'Keep playing', { size: 30, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.sheetLeave = display(this, 'Leave', { size: 30, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    // The result.
    this.plaque = this.add.graphics().setDepth(30).setVisible(false);
    this.resultHeadline = display(this, '', { size: 72, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.resultPill = label(this, '', { size: 20, colour: cream }).setOrigin(0, 0.5).setDepth(32).setVisible(false);
    this.score = display(this, '', { size: PLATE.scoreSize, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.scoreNote = label(this, '', { size: PLATE.noteSize, colour: muted, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.chipTexts = [0, 1, 2].map(() => label(this, '', { size: PLATE.chip.text, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false));
    this.toastTitle = display(this, '', { size: 28, colour: cream }).setOrigin(0, 0.5).setDepth(32).setVisible(false);
    this.toastNote = body(this, '', { size: 21, colour: shade(cream, -0.18) }).setOrigin(0, 0.5).setDepth(32).setVisible(false);
    this.toastStart = label(this, 'Start', { size: 22, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.continueLabel = display(this, 'Continue', { size: 40, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.continueSurface = surface(this, MaterialKey.cloth, new Rect(0, 0, 10, 10), 1, PALETTE.coral, BLOCK_CLOTH_ALPHA).setDepth(31).setVisible(false);
    this.exitLabel = display(this, 'Back', { size: 30, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.interruptedNote = body(this, '', { size: 24, colour: muted, align: 'center' }).setOrigin(0.5, 0).setDepth(32).setVisible(false);
    this.curtain = new SceneCurtain(this);
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.pump = setInterval(() => this.tick(), RHYTHM.pumpMs);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pageHide);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    // The card keeps the music of the screen that opened it: the title theme from the title
    // screen, the road's loop from the map.
    ensureScreenMusic(this, this.from === SceneKey.Menu);
    const facts = this.dayFacts();
    track('daily_opened', { band: this.chart.band, runs: facts.record?.runs ?? 0, paid: facts.record?.paid ?? 0, source: this.from === SceneKey.Menu ? 'menu' : 'map' });
    // The card is drawn by the first `layout()`, which places the pucks it hangs from.
    this.setHud(false);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
  }

  /** Everything one run owns, back to the start. Never the audio, the act's voices or the card. */
  private resetRun(): void {
    this.taskIndex = 0;
    this.results = [];
    this.tally = { perfect: 0, flawless: 0 };
    this.layers = OPENING_LAYERS;
    this.sequence = null;
    this.transition = null;
    this.finishUnlock = Infinity;
    this.over = false;
    this.invalid = null;
    this.resultTaken = false;
    this.heldJudgements = [];
    this.outcomes = [];
    this.struckIndex = -1;
    this.struckAt = this.extraAt = this.punchAt = -Infinity;
    this.applied = null;
    this.postingNote = '';
    this.newBest = false;
    this.sheetOpen = false;
    this.boardBusy = false;
  }

  /** Today's chart and its act, from the day key alone. */
  private refreshChart(): void {
    this.day = dailyTempoDay();
    this.chart = dailyChart(this.day);
    this.definition = definitionForLap(VIGNETTES[this.chart.actIndex]!, this.chart.lap);
  }

  private dayFacts(now = Date.now()): DayFacts {
    const record = todaysRewards(now);
    const won = shelfView(loadReplayTimer(undefined, now), now).items.find(item => item.source === 'won' && item.state !== 'expired') ?? null;
    return { record, won };
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    this.act?.layout(this.viewport);
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    const puckY = safe.top + 66 * s;
    this.pucks = {
      back: { x: safe.left + 56 * s, y: puckY }, board: { x: safe.right - 56 * s, y: puckY },
      pause: { x: safe.left + 56 * s, y: puckY }, mute: { x: safe.right - 56 * s, y: puckY },
      again: { x: safe.right - 56 * s - (CHROME.puckRadius * 2 + 20) * s, y: puckY },
    };
    resize(this.title, 56 * s, PALETTE.ink);
    this.title.setPosition(this.pucks.back!.x + (CHROME.puckRadius + 26) * s, puckY);
    // The block, as a level draws it.
    this.trackY = safe.bottom - LAYOUT.trackOffsetFromBottom * s;
    const b = this.blockS = blockScale(s);
    this.trackWidth = columnRoom(Math.min(620 * b, safe.width - 48 * s), b);
    this.columnX = safe.centerX + columnShift(b);
    this.words.layout(safe.centerX, this.trackY, s, b);
    this.restCall.setPosition(safe.centerX, this.words.turnCallY);
    resize(this.restCall, 40 * b, this.ink);
    this.headlineY = safe.top + HUD.headlineY * s;
    resize(this.headline, 48 * s, SHELL.cream);
    this.headline.setPosition(safe.centerX, this.headlineY);
    resize(this.restLabel, 22 * s, PALETTE.muted, STYLE.current, false);
    this.restLabel.setPosition(safe.centerX, this.headlineY + 62 * s);
    this.roomDim.setPosition(full.centerX, (safe.top + safe.height * 0.42 + this.trackY) / 2).setDisplaySize(full.width * 1.45, full.height * 1.55);
    this.placeSheet();
    if (this.phase === 'card') this.drawCard();
    if (this.phase === 'run') { this.drawHud(); this.drawMeter(); this.drawBeads(); }
    if (this.phase === 'result') this.placePlaque();
    this.drawChrome(0);
  }

  private get ink(): number { return this.definition.ink; }
  private blocked(): boolean { return document.hidden || wrongOrientation(this.scale.isLandscape); }
  private now(): number { return this.audio?.clock.now() ?? performance.now() / 1000; }
  private get stems(): number { const track = this.audio?.music.track; return track?.levelStems ?? track?.stems.length ?? 1; }
  private get task() { return this.chart.tasks[this.taskIndex]!; }

  // ---------------------------------------------------------------- the card

  private showCard(): void {
    this.phase = 'card';
    // No run is coming: a start still loading its track must not land on the card.
    ++this.startRequest;
    this.starting = false;
    this.hidePlaque();
    this.hideSheet();
    this.setHud(false);
    this.act?.pause();
    this.act?.destroy();
    this.act = null;
    this.changeHeadline('');
    this.marks.clear();
    this.roomDim.setAlpha(0);
    this.words.reset();
    // The chart may have turned over during a run that crossed the day: the card reads it fresh.
    const day = dailyTempoDay();
    if (day !== this.day) this.refreshChart();
    this.drawCard();
    this.drawChrome(0);
  }

  private hideCard(): void {
    this.card.clear().setVisible(false);
    this.playSurface.setVisible(false);
    for (const text of this.cardTexts()) text.setVisible(false);
  }

  private cardTexts(): Phaser.GameObjects.Text[] {
    return [this.title, this.dateLine, this.actEyebrow, this.actName, this.actIntro, this.bestLabel, this.bestValue, this.ladderTitle, this.ladderAside, this.bandChip,
      ...this.rowLabels, ...this.rowChips, this.explainer, this.shelfEyebrow, this.shelfName, this.shelfNote, this.startLabel, this.tokenMinutes, this.playLabel, this.footnote];
  }

  private dateCopy(now = Date.now()): string {
    return `${weekdayName(this.day)} · New pattern in ${untilNextDayCopy(msUntilNextDay(now))}`.toUpperCase();
  }

  /** The card, from the chart and the day's facts: redrawn on layout, on a start from the shelf, and when the day turns. */
  private drawCard(): void {
    if (this.phase !== 'card' || !this.pucks.back) return;
    const s = this.uiScale, { safe } = this.viewport;
    const facts = this.dayFacts();
    const record = facts.record;
    const plan = planDailyCard({ s, safe, controlSize: this.controlSize, shelfRow: facts.won !== null });
    const k = s * plan.k;
    const g = this.card.clear().setVisible(true);
    const show = (text: Phaser.GameObjects.Text, x: number, y: number) => text.setPosition(x, y).setVisible(true);
    show(this.title, this.pucks.back!.x + (CHROME.puckRadius + 26) * s, this.pucks.back!.y);
    this.dateLine.setText(this.dateCopy());
    resize(this.dateLine, 20 * s, PALETTE.muted, STYLE.current, false);
    show(this.dateLine, this.title.x, plan.dateY);
    // The act's tile: its keepsake drawing, in colour once the player owns it, over its name.
    const tile = plan.tile, art = plan.art;
    drawPanel(g, new Rect(tile.x, tile.y, tile.width, tile.height), s, { fill: SHELL.cream, depth: 10, radius: 28 * plan.k });
    g.fillStyle(shade(SHELL.bench, -0.04), 1).fillRoundedRect(art.x, art.y, art.width, art.height, 22 * k);
    const keepsake = KEEPSAKES.find(entry => entry.vignette === this.chart.vignette && entry.lap === this.chart.lap) ?? KEEPSAKES.find(entry => entry.vignette === this.chart.vignette) ?? null;
    if (keepsake) drawKeepsake(g, keepsake.id, art.x + art.width / 2, art.y + art.height / 2, Math.min(art.height * 0.84, art.width * 0.5), !ownsKeepsake(loadProgress(), keepsake), shade(SHELL.bench, -0.04));
    const pad = 22 * k, wordsTop = art.y + art.height;
    resize(this.actEyebrow, 18 * k, PALETTE.muted, STYLE.current, false);
    show(this.actEyebrow, tile.x + pad, wordsTop + 30 * k);
    this.actName.setText(this.definition.title);
    resize(this.actName, 36 * k, PALETTE.ink);
    show(this.actName, tile.x + pad, wordsTop + 68 * k);
    this.actIntro.setText(this.definition.intro.replace(/\s*\n\s*/g, ' '));
    resize(this.actIntro, 22 * k, PALETTE.muted, STYLE.current, false);
    show(this.actIntro, tile.x + pad, wordsTop + 106 * k);
    resize(this.bestLabel, 18 * k, PALETTE.muted, STYLE.current, false);
    show(this.bestLabel, tile.x + tile.width - pad, wordsTop + 44 * k);
    const best = record && record.runs > 0 ? scoreLabel(record.best) : 'No run yet';
    this.bestValue.setText(best);
    resize(this.bestValue, (record && record.runs > 0 ? 36 : 26) * k, PALETTE.ink, STYLE.current, record !== null && record.runs > 0);
    show(this.bestValue, tile.x + tile.width - pad, wordsTop + 84 * k);
    const nameRoom = this.bestLabel.x - Math.max(this.bestLabel.width, this.bestValue.width) - 16 * k - this.actName.x;
    this.actName.setScale(this.actName.width > nameRoom ? nameRoom / this.actName.width : 1);
    this.actIntro.setScale(this.actIntro.width > nameRoom ? nameRoom / this.actIntro.width : 1);
    // The ladder.
    const paid = record?.paid ?? 0;
    this.drawLadder(g, plan.ladder, plan.ladderHead, plan.ladderRows, k, ladderRows(this.chart.starAccuracy, paid, paid, null), ladderHeading(paid, false));
    // The explainer, or the won timer waiting on the shelf.
    for (const text of [this.explainer, this.shelfEyebrow, this.shelfName, this.shelfNote, this.startLabel, this.tokenMinutes]) text.setVisible(false);
    this.startRect.setTo(0, 0, 0, 0);
    if (plan.explainer) {
      const r = plan.explainer;
      this.dashedBox(g, r, 24 * k, k);
      const tokenR = 36 * k, tokenX = r.x + 30 * k + tokenR;
      drawTimerToken(g, tokenX, r.y + r.height / 2 + 4 * k, tokenR, 'won', 0.65, k);
      this.tokenMinutes.setText(`${timerMinutesFor(this.chart.band, 2)}m`);
      resize(this.tokenMinutes, 18 * k, PALETTE.ink);
      show(this.tokenMinutes, tokenX, r.y + r.height / 2 + 4 * k);
      resize(this.explainer, 22 * k, PALETTE.muted, STYLE.current, false);
      const textX = tokenX + tokenR + 24 * k;
      wrapWidth(this.explainer, r.x + r.width - 24 * k - textX);
      show(this.explainer, textX, r.y + (r.height - this.explainer.height) / 2);
    } else if (plan.shelf && facts.won) {
      const r = plan.shelf, won = facts.won;
      drawPanel(g, new Rect(r.x, r.y, r.width, r.height), s, { fill: SHELL.cream, depth: 10, radius: 24 * plan.k });
      const tokenR = 42 * k, tokenX = r.x + 26 * k + tokenR, cy = r.y + r.height / 2;
      drawTimerToken(g, tokenX, cy + 4 * k, tokenR, won.state === 'expired' ? 'expired' : 'won', won.window, k);
      this.tokenMinutes.setText(won.compact);
      resize(this.tokenMinutes, 20 * k, PALETTE.ink);
      show(this.tokenMinutes, tokenX, cy + 4 * k);
      const bw = Math.max(140 * k, this.controlSize * 0.9), bh = Math.min(r.height - 44 * k, 80 * k);
      this.startRect.setTo(r.x + r.width - 24 * k - bw, cy - bh / 2, bw, bh);
      drawPanel(g, this.startRect, s, { fill: PALETTE.ink, depth: 8, radius: 18 * plan.k, press: this.pressed === 'start' ? pressAmount(performance.now() / 1000, this.pressedAt) : 0 });
      resize(this.startLabel, 22 * k, SHELL.cream, STYLE.current, false);
      show(this.startLabel, this.startRect.centerX, this.startRect.centerY);
      const textX = tokenX + tokenR + 22 * k, room = this.startRect.x - 16 * k - textX;
      resize(this.shelfEyebrow, 18 * k, PALETTE.muted, STYLE.current, false);
      show(this.shelfEyebrow, textX, cy - 40 * k);
      this.shelfName.setText(`${won.label} replay timer`);
      resize(this.shelfName, 28 * k, PALETTE.ink);
      show(this.shelfName, textX, cy - 6 * k);
      this.shelfName.setScale(this.shelfName.width > room ? room / this.shelfName.width : 1);
      this.shelfNote.setText(won.startWithin ? `${won.startWithin} or it’s gone` : 'Keeps until you start it');
      resize(this.shelfNote, 21 * k, PALETTE.muted, STYLE.current, false);
      show(this.shelfNote, textX, cy + 30 * k);
      this.shelfNote.setScale(this.shelfNote.width > room ? room / this.shelfNote.width : 1);
    }
    // Play, and the line under it.
    this.playRect.setTo(plan.play.x, plan.play.y, plan.play.width, plan.play.height);
    const press = this.pressed === 'play' ? pressAmount(performance.now() / 1000, this.pressedAt) : 0;
    drawPanel(g, this.playRect, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press, hero: true });
    placeSurface(this.playSurface.setVisible(true), this.playRect, s, CHROME.block.depth * s * press * 0.8);
    const sink = CHROME.block.depth * s * press * 0.8;
    this.playLabel.setText(record && record.runs > 0 ? 'Play again' : 'Play');
    resize(this.playLabel, 40 * s, SHELL.cream);
    const span = this.playLabel.width + 76 * s;
    show(this.playLabel, this.playRect.centerX - span / 2 + this.playLabel.width / 2, this.playRect.centerY + sink);
    drawActionDisc(g, this.playRect.centerX + span / 2 - 28 * s, this.playRect.centerY + sink, 28 * s, s);
    this.footnote.setText(paid >= 3 ? 'Today’s rewards are paid. Replays count for the leaderboard.' : 'Free to play. No heart needed.');
    resize(this.footnote, 22 * s, PALETTE.muted, STYLE.current, false);
    balanceWrap(this.footnote, safe.width - 48 * s);
    show(this.footnote, safe.centerX, plan.footnoteY);
  }

  /** A dashed rounded box: the explainer's, and a short tier's row on the result. */
  private dashedBox(g: Phaser.GameObjects.Graphics, r: { x: number; y: number; width: number; height: number }, radius: number, k: number, colour = shade(SHELL.bench, -0.35)): void {
    const steps = 12;
    const points: { x: number; y: number }[] = [];
    const corner = (cx: number, cy: number, from: number) => {
      for (let i = 0; i <= steps; i++) { const a = from + (i / steps) * Math.PI / 2; points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius }); }
    };
    corner(r.x + r.width - radius, r.y + radius, -Math.PI / 2);
    corner(r.x + r.width - radius, r.y + r.height - radius, 0);
    corner(r.x + radius, r.y + r.height - radius, Math.PI / 2);
    corner(r.x + radius, r.y + radius, Math.PI);
    points.push(points[0]!);
    g.lineStyle(2.5 * k, colour, 1);
    for (const [a, b] of dashes(points, 12 * k, 8 * k)) g.lineBetween(a.x, a.y, b.x, b.y);
  }

  /** The three reward rows, shared by the card and the result: glyphs, label, chip, and the state each is drawn in. */
  private drawLadder(
    g: Phaser.GameObjects.Graphics, frame: { x: number; y: number; width: number; height: number }, head: { x: number; y: number; width: number; height: number },
    rows: readonly { x: number; y: number; width: number; height: number }[], k: number, ladder: readonly LadderRow[], heading: { title: string; aside: string | null },
  ): void {
    const s = this.uiScale;
    drawPanel(g, new Rect(frame.x, frame.y, frame.width, frame.height), s, { fill: SHELL.cream, depth: 10, radius: 28 * (k / s) });
    this.ladderTitle.setText(heading.title.toUpperCase());
    resize(this.ladderTitle, 22 * k, PALETTE.muted, STYLE.current, false);
    this.ladderTitle.setPosition(head.x, head.y + head.height / 2 - 4 * k).setVisible(true);
    if (heading.aside) {
      this.ladderAside.setText(heading.aside.toUpperCase());
      resize(this.ladderAside, 20 * k, PALETTE.muted, STYLE.current, false);
      this.ladderAside.setPosition(head.x + head.width, head.y + head.height / 2 - 4 * k).setVisible(true);
      this.bandChip.setVisible(false);
    } else {
      this.ladderAside.setVisible(false);
      // The band's chip: three bars, the band's number of them filled, and its name.
      this.bandChip.setText(bandLabel(this.chart.band).toUpperCase());
      resize(this.bandChip, 18 * k, PALETTE.ink, STYLE.current, false);
      const barsW = 52 * k, chipW = this.bandChip.width + barsW + 44 * k, chipH = 44 * k;
      const cx = head.x + head.width - chipW, cy = head.y + head.height / 2 - 4 * k;
      g.lineStyle(2 * k, shade(SHELL.bench, -0.45), 1).strokeRoundedRect(cx, cy - chipH / 2, chipW, chipH, chipH / 2);
      const filled = bandBars(this.chart.band);
      for (let i = 0; i < 3; i++) {
        const bx = cx + 18 * k + i * 16 * k, bh = (10 + 6 * i) * k;
        g.fillStyle(i < filled ? PALETTE.ink : shade(SHELL.bench, -0.3), 1).fillRoundedRect(bx, cy + 10 * k - bh, 11 * k, bh, 2.5 * k);
      }
      this.bandChip.setPosition(cx + chipW - 18 * k, cy).setVisible(true);
    }
    ladder.forEach((row, i) => {
      const r = rows[i]!;
      const faded = row.state === 'earlier';
      const highlight = row.state === 'paid';
      if (row.state === 'short') {
        g.fillStyle(shade(SHELL.cream, -0.04), 1).fillRoundedRect(r.x, r.y, r.width, r.height, 20 * k);
        this.dashedBox(g, r, 20 * k, k);
      } else {
        drawPanel(g, new Rect(r.x, r.y, r.width, r.height), s, { fill: faded ? shade(SHELL.puck, -0.06) : SHELL.puck, depth: 6, radius: 20 * (k / s), ...(highlight ? { frame: SHELL.sun } : {}) });
      }
      const cy = r.y + r.height / 2;
      const alpha = faded ? 0.55 : 1;
      // The stars the tier asks for, at the left.
      for (let n = 0; n < row.stars; n++) drawStar(g, r.x + 30 * k + n * 26 * k, cy, 11 * k, STAR_PRIZE, alpha);
      // What it pays: a heart or a restart, then the timer at the tier's length.
      let gx = r.x + 128 * k;
      for (const glyph of row.glyphs) {
        if (glyph === 'heart') drawHeart(g, gx, cy, 16 * k, PALETTE.coral, alpha);
        else if (glyph === 'restart') {
          g.fillStyle(SHELL.cream, alpha).fillCircle(gx, cy, 17 * k);
          g.lineStyle(2 * k, PALETTE.ink, alpha).strokeCircle(gx, cy, 17 * k);
          drawRestart(g, gx, cy, 11 * k, PALETTE.ink, alpha);
        } else {
          drawTimerToken(g, gx, cy + 2 * k, 19 * k, 'won', 1, k * 0.7);
        }
        gx += 48 * k;
      }
      const labelText = this.rowLabels[i]!, chipText = this.rowChips[i]!;
      labelText.setText(row.label);
      resize(labelText, 28 * k, PALETTE.ink, STYLE.current, !faded);
      labelText.setAlpha(alpha).setPosition(gx - 6 * k, cy).setVisible(true);
      // The chip: the threshold on an ink pill, PAID on an ink pill with a tick, EARLIER as a ticked word.
      chipText.setText(row.chip);
      const inkPill = row.state === 'pending' || row.state === 'paid';
      resize(chipText, 18 * k, inkPill ? SHELL.cream : PALETTE.muted, STYLE.current, false);
      const tick = row.state === 'paid' || row.state === 'earlier';
      const pw = chipText.width + (tick ? 56 : 32) * k, ph = 40 * k;
      const px = r.x + r.width - 16 * k - pw;
      if (inkPill) g.fillStyle(PALETTE.ink, 1).fillRoundedRect(px, cy - ph / 2, pw, ph, ph / 2);
      else if (row.state === 'short') { g.lineStyle(2 * k, shade(SHELL.bench, -0.4), 1); this.dashedBox(g, { x: px, y: cy - ph / 2, width: pw, height: ph }, ph / 2, k); }
      if (tick) {
        const tx = px + 18 * k, colour = inkPill ? SHELL.cream : PALETTE.muted;
        g.lineStyle(3 * k, colour, 1).lineBetween(tx - 6 * k, cy, tx - 1.5 * k, cy + 5 * k).lineBetween(tx - 1.5 * k, cy + 5 * k, tx + 7 * k, cy - 6 * k);
      }
      chipText.setPosition(px + pw / 2 + (tick ? 12 * k : 0), cy).setAlpha(faded ? 0.8 : 1).setVisible(true);
      const room = px - 12 * k - labelText.x;
      labelText.setScale(labelText.width > room ? room / labelText.width : 1);
    });
  }

  // ---------------------------------------------------------------- the run

  /**
   * A fresh run from its count-in. Nothing is spent. The audio is unlocked and the track
   * loaded as a level does it, the act is built, and the loop starts at the first task's
   * tempo with the metronome bar under it; the first task waits its lead-in bar.
   */
  private async start(): Promise<void> {
    if (this.starting || this.curtain.active) return;
    const request = ++this.startRequest;
    this.controller?.dispose();
    this.audio?.cancel();
    this.audio?.music.stop();
    this.resetRun();
    this.hideCard();
    this.hidePlaque();
    this.hideSheet();
    this.phase = 'run';
    this.words.reset();
    this.changeHeadline('');
    this.setHud(true);
    this.drawHud();
    this.drawMeter();
    this.drawBeads();
    this.drawChrome(0);
    // The act stands on the stage while the track loads, so the screen is never bare.
    this.mountAct();
    if (this.blocked()) { this.changeHeadline('Turn your phone upright'); return; }
    this.starting = true;
    breadcrumb('daily started', { day: this.day, band: this.chart.band });
    const facts = this.dayFacts();
    try {
      if (!this.controller) {
        this.audio = sharedAudio(this);
        this.audio.context.addEventListener('statechange', this.audioState);
        this.muted = this.audio.silent;
        this.controller = new RoundController(this.audio, {
          phase: phase => this.showPhase(phase),
          cue: cue => {
            if (cue.kind !== 'action') return;
            const phase = this.controller?.phase;
            if (phase !== 'demonstrate' && phase !== 'prepare') return;
            this.act?.onDemonstrationBeat(cue.time);
          },
          tap: () => { this.act?.onPlayerHit(this.now()); this.releaseHeldJudgements(); },
          judgement: result => this.showJudgement(result),
          complete: result => this.showResult(result),
          interrupted: () => this.invalidate('timing'),
        });
      }
      const audio = this.audio!;
      await audio.unlock();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      // The title theme, where the card carried it, ends here: the run is judged against the loop.
      stopTheme(audio);
      await audio.music.load(shellTrack());
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      await samples.load(audio.context);
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.starting = false;
      if (!this.act) this.mountAct();
      this.attachSounds();
      this.layers = OPENING_LAYERS;
      const first = this.chart.tasks[0]!;
      const origin = audio.music.start(undefined, { layers: OPENING_LAYERS, metronome: true });
      audio.music.setRate(first.bpm / MUSIC.sourceBpm, origin);
      void setMusicBed(audio, 'level');
      if (this.disposed || request !== this.startRequest || this.blocked()) { audio.music.stop(); return; }
      this.runStartedAt = Date.now();
      track('daily_started', { band: this.chart.band, tasks: this.chart.tasks.length, peak_bpm: this.chart.peakBpm, replay: (facts.record?.runs ?? 0) > 0 ? 1 : 0 });
      this.beginTask(0, origin);
    } catch (error) {
      if (this.disposed || request !== this.startRequest) return;
      this.starting = false;
      this.controller?.dispose();
      this.audio?.cancel();
      this.audio?.music.stop();
      console.error('Unable to start the Daily Tempo', error);
      this.invalidate('audio');
    }
  }

  /** The day's act on the stage. Its voices are the audio's business (`attachSounds`). */
  private mountAct(): void {
    this.act?.destroy();
    const definition = this.definition;
    const act = definition.create(this, this.chart.lap);
    act.layout(this.viewport);
    this.act = act;
    setErrorContext('act', definition.id);
    // The act's ink dresses the verdict and the count; re-dress them for it once, here.
    this.words.dress(definition.ink);
  }

  /** The act's voices, synthesized once per scene life, on the engine the run plays through. */
  private attachSounds(): void {
    const definition = this.definition;
    if (this.soundsFor !== definition.id || !this.sounds) {
      this.sounds = definition.sounds(this.audio!.context);
      this.soundsFor = definition.id;
    }
    this.audio!.setSounds(this.sounds);
  }

  /** One task's plan on the grid, with its own lead-in: the opening bar, the breather, or none. */
  private beginTask(index: number, startAt: number): void {
    const audio = this.audio!;
    syncClockCalibration(audio.clock);
    this.taskIndex = index;
    const task = this.chart.tasks[index]!;
    this.outcomes = task.pattern.hits.map(() => 'pending');
    this.heldJudgements = [];
    this.struckIndex = -1;
    this.struckAt = this.extraAt = -Infinity;
    this.words.reset();
    this.resultTaken = false;
    this.finishUnlock = Infinity;
    this.sequence = new TaskSequence(task.bpm, startAt, 1);
    this.controller!.start(task.pattern, task.bpm, audio.context.currentTime, performance.now(), startAt, task.leadBeats, this.definition.gridAction === true || audio.clock.tapVoiceLate);
    this.act!.reset(this.controller!.plan!);
    this.drawBeads();
  }

  private showPhase(phase: Phase): void {
    const now = this.now();
    this.act?.onPhase(phase, now);
    if (phase === 'prepare' && this.taskIndex === 0) this.changeHeadline(this.definition.title);
    if (phase === 'respond') {
      this.changeHeadline('');
      this.struckIndex = -1;
      this.struckAt = this.extraAt = -Infinity;
      this.releaseHeldJudgements();
    }
  }

  private showJudgement(result: Judgement): void {
    if (result.index !== null) this.outcomes[result.index] = markFor(result);
    if (this.controller?.phase !== 'respond') { this.heldJudgements.push(result); return; }
    this.presentJudgement(result);
  }

  private sayVerdict(result: Judgement, now: number): void {
    const { centres } = this.beadRow();
    this.words.say(result, now, this.columnX + (centres[result.index ?? 0] ?? 0), this.reducedMotion);
  }
  private presentJudgement(result: Judgement): void {
    const now = this.now();
    this.act?.onAccuracy(result, now);
    if (result.kind === 'extra') { this.audio?.playAccent(now, 'scrape'); this.extraAt = now; }
    else if (result.kind === 'omission') this.audio?.playAccent(now, 'judder');
    else if (result.index !== null) {
      this.struckIndex = result.index;
      this.struckAt = now;
      this.struckPerfect = result.grade === 'Perfect';
      vibrate(result.grade === 'Perfect' ? 'hit' : 'tap');
      if (result.grade === 'Perfect') this.punchAt = now;
    }
    this.sayVerdict(result, now);
  }

  private releaseHeldJudgements(): void {
    const pending = this.heldJudgements;
    this.heldJudgements = [];
    for (const result of pending) this.presentJudgement(result);
  }



  /**
   * One task resolved: the result is kept, the meter moves, the act plays its coda against
   * the chart's own bar, the stems answer, and either the next task is placed on the grid or
   * the run is over and the result is scored once.
   */
  private showResult(result: RoundResult): void {
    if (this.resultTaken || !this.audio || !this.controller?.plan || !this.act) return;
    this.resultTaken = true;
    const plan = this.controller.plan, definition = this.definition;
    const now = this.now();
    this.results[this.taskIndex] = result.accuracy;
    this.tally.perfect += result.perfect;
    const flawless = isFlawless(this.outcomes) && result.extras === 0;
    if (flawless) {
      this.tally.flawless++;
      this.words.flawlessNow(now);
      vibrate('stamp');
    }
    this.drawMeter();
    const bars = levelBars(this.chart);
    const partial = definition.partial;
    const outcome = finishOutcome(result.accuracy, bars, partial !== undefined);
    const strong = outcome === 'success';
    this.layers = advanceLayers(this.layers, result.accuracy, this.stems, bars);
    const ending = this.sequence!.ending(plan.end, definition.endingHoldBeats);
    this.act.finish(strong, ending.contact, outcome);
    if (strong) this.punchAt = ending.contact;
    const last = this.taskIndex >= this.chart.tasks.length - 1;
    this.audio.playFinish(ending.contact, outcome, last ? undefined : ending.next);
    this.finishUnlock = ending.contact + definition.endingSec;
    this.transition = last ? null : { ...ending, swapped: false };
    const copy = outcome === 'success' ? definition.success : outcome === 'partial' && partial ? partial.copy : definition.rough;
    this.changeHeadline(copy[0]);
    if (last) {
      this.over = true;
      this.audio.music.setRate(1, ending.next);
      this.recordDaily();
    }
  }

  private tick(): void {
    if (this.disposed || !this.audio || this.phase !== 'run' || this.blocked()) return;
    if (this.audio.context.state !== 'running') {
      if (this.audio.background.hidden) { this.invalidate('background'); return; }
      this.audio.recover();
      return;
    }
    this.audio.clock.refresh();
    const transition = this.transition;
    if (transition && this.now() >= transition.swap && !transition.swapped) {
      if (!canPlaceNextTask(this.audio.context.currentTime, transition.next)) { this.invalidate('timing'); return; }
      transition.swapped = true;
      const next = this.chart.tasks[this.taskIndex + 1]!;
      // The tempo and the stems move on the next task's downbeat, with the grid.
      this.audio.music.setRate(next.bpm / MUSIC.sourceBpm, transition.next);
      this.audio.music.setLayers(this.layers, transition.next);
      this.beginTask(this.taskIndex + 1, transition.next);
    }
    if (transition && this.now() >= transition.next) this.transition = null;
    if (this.controller?.active) this.controller.tick(this.now(), performance.now());
  }

  /**
   * The run's facts, scored and paid once: the stars from the chart's own thresholds, the
   * day's rewards (`applyDailyRewards`), the leaderboard where it is offered, the day's
   * objectives, and the events. Local first; nothing here waits on Play Games.
   */
  private recordDaily(): void {
    if (this.applied || this.invalid) return;
    const accuracy = meanAccuracy(this.results);
    const stars = starsFor(accuracy, this.chart);
    const before = todaysRewards();
    const replay = (before?.runs ?? 0) > 0;
    this.newBest = accuracy > (before?.best ?? 0);
    const applied = applyDailyRewards({ stars, band: this.chart.band, accuracy }, Date.now());
    this.applied = applied;
    this.resultAccuracy = accuracy;
    this.resultStars = stars;
    // The shelf is in the cloud save: a won timer reaches the other device.
    if (applied.grants.timerMinutes !== null) queueCloudSave();
    breadcrumb('daily finished', { day: this.day, stars, accuracy: Math.round(accuracy), paid: applied.paidNow });
    track('daily_finished', { band: this.chart.band, stars, accuracy: Math.round(accuracy), paid: applied.paidNow, replay: replay ? 1 : 0 });
    for (let tier = applied.paidBefore + 1; tier <= applied.paidNow; tier++) {
      const heart = (DAILY_REWARDS.heartTiers as readonly number[]).includes(tier);
      track('daily_reward_paid', {
        band: this.chart.band, tier, hearts: heart ? 1 : 0, restart: DAILY_REWARDS.restartTier === tier ? 1 : 0,
        timer_minutes: tier === applied.paidNow ? applied.grants.timerMinutes ?? 0 : 0,
      });
    }
    recordObjectives(dailyObjectiveReport(this.chart, this.tally), Date.now(), objectiveContext(loadProgress()));
    if (dailyTempoLeaderboardOffered()) {
      // The run's start keeps a run that crossed the day's turn on the day it was played.
      void recordDailyTempo(accuracy, this.runStartedAt).then(outcome => {
        if (this.disposed) return;
        this.postingNote = submissionCopy(outcome);
        if (this.phase === 'result') this.dressPlaque();
      });
    }
  }

  /** The run stops being a run, once: nothing scored, paid or sent, and the result says so. */
  private invalidate(reason: AbandonReason): void {
    if (this.disposed || this.phase !== 'run' || this.invalid !== null || this.over) return;
    this.invalid = reason;
    ++this.startRequest;
    this.starting = false;
    this.transition = null;
    this.taps.reset();
    this.controller?.interrupt('Interrupted');
    this.audio?.cancel();
    this.audio?.music.stop();
    this.act?.pause();
    this.hideSheet();
    breadcrumb('daily interrupted', { reason });
    track('daily_abandoned', { reason, tasks_done: this.results.length });
    this.showPlaque();
  }

  // ---------------------------------------------------------------- input

  private handleTap(tap: Tap): void {
    if (this.blocked() || this.curtain.active) return;
    const wall = performance.now() / 1000;
    const near = (at: { x: number; y: number } | undefined) => at !== undefined && Math.abs(tap.x - at.x) < this.controlSize / 2 && Math.abs(tap.y - at.y) < this.controlSize / 2;
    if (this.phase === 'card') {
      if (near(this.pucks.back)) { this.pressPuck('back'); this.leave(); return; }
      if (dailyTempoLeaderboardOffered() && near(this.pucks.board)) { this.pressPuck('board'); void this.openBoard(); return; }
      if (this.startRect.width > 0 && this.startRect.contains(tap.x, tap.y)) { this.press('start', wall); this.startWonTimer(); return; }
      if (this.playRect.contains(tap.x, tap.y)) { this.press('play', wall); void this.start(); return; }
      return;
    }
    if (this.sheetOpen) {
      if (this.keepRect.contains(tap.x, tap.y)) { this.press('keep', wall); this.hideSheet(); return; }
      if (this.leaveRect.contains(tap.x, tap.y)) { this.press('leave', wall); this.abandon(); return; }
      if (!this.sheetRect.contains(tap.x, tap.y)) this.hideSheet();
      return;
    }
    if (this.phase === 'result') {
      if (near(this.pucks.back)) { this.pressPuck('back'); this.showCard(); return; }
      if (near(this.pucks.again)) { this.pressPuck('again'); void this.start(); return; }
      if (dailyTempoLeaderboardOffered() && this.invalid === null && near(this.pucks.board)) { this.pressPuck('board'); void this.openBoard(); return; }
      if (this.toastStartRect.width > 0 && this.toastStartRect.contains(tap.x, tap.y)) { this.press('start', wall); this.startWonTimer(); return; }
      if (this.continueRect.contains(tap.x, tap.y)) { this.press('continue', wall); if (this.invalid) void this.start(); else this.showCard(); return; }
      if (this.exitRect.width > 0 && this.exitRect.contains(tap.x, tap.y)) { this.press('exit', wall); this.showCard(); return; }
      return;
    }
    // The run.
    if (near(this.pucks.mute)) {
      this.pressPuck('mute');
      if (this.audio) { toggleMute(this.audio); this.muted = this.audio.silent; }
      return;
    }
    if (near(this.pucks.pause)) {
      this.pressPuck('pause');
      if (this.results.length === 0 && !this.controller?.active && !this.starting) { this.showCard(); return; }
      this.showSheet();
      return;
    }
    if (this.headline.text === 'Turn your phone upright' && !this.starting) { void this.start(); return; }
    if (!this.audio || !this.controller?.active) return;
    this.audio.clock.refresh();
    this.controller.tap(this.audio.clock.input(tap.timestamp), this.audio.context.currentTime, performance.now());
  }

  /** The won timer, started from the card or the result: it runs from now, and the row says so. */
  private startWonTimer(): void {
    const won = this.dayFacts().won;
    if (!won) return;
    const outcome = startHeldTimerSynced(won.id);
    if (outcome.started) vibrate('stamp');
    if (this.phase === 'card') this.drawCard();
    else this.dressPlaque();
  }

  private press(what: Pressed, wall: number): void {
    this.pressed = what;
    this.pressedAt = wall;
    this.pressDirty = true;
    vibrate('tap');
  }

  private pressPuck(key: Puck): void {
    this.puckPressed = key;
    this.puckPressedAt = performance.now() / 1000;
    this.puckDirty = true;
    vibrate('tap');
  }

  /**
   * Android's back: on the card it leaves; in a run before anything has been scored it goes
   * back to the card, and after that it asks on the sheet, since leaving ends the run; with
   * the sheet up it is Keep playing; on the result it is Continue.
   */
  public handleBack(): boolean {
    if (this.disposed || this.curtain.active) return true;
    if (this.phase === 'card') { this.leave(); return true; }
    if (this.sheetOpen) { this.hideSheet(); return true; }
    if (this.phase === 'result') { this.showCard(); return true; }
    if (this.results.length === 0 && !this.controller?.active && !this.starting) { this.showCard(); return true; }
    this.showSheet();
    return true;
  }

  /** The player chose to leave the run: unscored, and back to the card. */
  private abandon(): void {
    if (this.over) { this.showCard(); return; }
    ++this.startRequest;
    this.invalid = 'user';
    track('daily_abandoned', { reason: 'user', tasks_done: this.results.length });
    this.controller?.dispose();
    this.audio?.cancel();
    this.audio?.music.setRate(1, this.audio.context.currentTime);
    this.hideSheet();
    this.showCard();
    this.phase = 'card';
    this.invalid = null;
    this.resetRun();
    ensureScreenMusic(this, this.from === SceneKey.Menu);
  }

  /** Back to the screen that opened the Daily: the title screen or the map. */
  private leave(): void {
    if (this.curtain.active) return;
    ++this.startRequest;
    this.controller?.dispose();
    this.transition = null;
    this.audio?.cancel();
    this.curtain.cover(() => (this.from === SceneKey.Menu
      ? this.scene.start(SceneKey.Menu)
      : this.scene.start(SceneKey.Map, { focus: loadProgress().unlocked })));
  }

  private async openBoard(): Promise<void> {
    if (this.boardBusy) return;
    this.boardBusy = true;
    try { await openDailyTempoLeaderboard(); } finally { this.boardBusy = false; }
  }

  // ---------------------------------------------------------------- drawing

  public override update(): void {
    if (this.disposed) return;
    this.tick();
    const now = this.now();
    const wall = performance.now() / 1000;
    const still = this.reducedMotion;
    if (this.phase === 'card' && wall - this.pollAt >= 1) {
      // The clock under the title, once a second; a day that turned under the card redraws it whole.
      this.pollAt = wall;
      if (dailyTempoDay() !== this.day) { this.refreshChart(); this.drawCard(); }
      else { const copy = this.dateCopy(); if (copy !== this.dateLine.text) this.dateLine.setText(copy); }
    }
    this.act?.update(now);
    const slide = this.transition;
    if (slide && this.act && now >= slide.slide && now < slide.next) {
      const p = slide.swapped ? (now - slide.swap) / (slide.next - slide.swap) : (now - slide.slide) / (slide.swap - slide.slide);
      this.act.translate(this.viewport.full.width * (slide.swapped ? 1 - easeOut(p) : -(Math.min(1, Math.max(0, p)) ** 3)));
    }
    if (!still && this.act) {
      const kick = punch(now - this.punchAt, 1, STYLE.current.exaggeration);
      if (kick !== 0) this.act.punch?.(kick * this.uiScale);
    }
    const entry = still || this.headlineAt < 0 ? { rise: 0, alpha: 1 } : arrive(now - this.headlineAt, 0.4);
    this.headline.setAlpha(entry.alpha).setY(this.headlineY + entry.rise * 16 * this.uiScale);
    if (this.phase === 'run') this.drawBeatTrack(now);
    const puckPress = pressAmount(wall, this.puckPressedAt);
    if (puckPress > 0.001 || this.puckDirty) {
      this.drawChrome(Math.max(0, puckPress));
      this.puckDirty = puckPress > 0.001;
      if (!this.puckDirty) this.puckPressed = null;
    }
    const press = pressAmount(wall, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      if (this.phase === 'card') this.drawCard();
      if (this.sheetOpen) this.drawSheet(Math.max(0, press));
      if (this.phase === 'result') this.drawPlaque(Math.max(0, press));
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    } else if (this.phase === 'result' && !still && wall - this.resultAt < 2.5) {
      // The medals' reveal runs on the plaque's own clock for its first seconds.
      this.drawPlaque(0);
    }
    this.words.pose(now, still);
    if (this.phase === 'run' && this.over && now >= this.finishUnlock) this.showPlaque();
  }

  private changeHeadline(text: string): void {
    if (this.headline.text === text) return;
    this.headlineAt = this.now();
    this.headline.setText(text).setAlpha(0).setY(this.headlineY + 16 * this.uiScale);
  }

  /** The pucks of the phase: back and the leaderboard on the card, pause and mute in a run, back, again and the board on the result. */
  private drawChrome(press: number): void {
    const s = this.uiScale;
    const g = this.chrome.clear();
    const sinkOf = (key: Puck) => (this.puckPressed === key ? press : 0);
    const r = CHROME.puckRadius * s;
    const puck = (key: Exclude<Puck, null>, glyph: (x: number, y: number) => void) => {
      const at = this.pucks[key];
      if (!at) return;
      drawPuck(g, at.x, at.y, s, sinkOf(key));
      glyph(at.x, at.y + puckSink(s, sinkOf(key)));
    };
    const board = dailyTempoLeaderboardOffered();
    if (this.phase === 'card') {
      puck('back', (x, y) => drawBack(g, x, y, r * 0.42, PALETTE.ink));
      if (board) puck('board', (x, y) => this.drawPodium(g, x, y, r * 0.5));
    } else if (this.phase === 'run') {
      puck('pause', (x, y) => drawPause(g, x, y, r * 0.42, PALETTE.ink));
      puck('mute', (x, y) => drawSpeaker(g, x, y, r * 0.5, PALETTE.ink, this.muted));
    } else {
      puck('back', (x, y) => drawBack(g, x, y, r * 0.42, PALETTE.ink));
      puck('again', (x, y) => drawRestart(g, x, y, r * 0.44, PALETTE.ink));
      if (board && this.invalid === null) puck('board', (x, y) => this.drawPodium(g, x, y, r * 0.5));
    }
  }

  /** The leaderboard's glyph: three steps of a podium, the middle one crowned. */
  private drawPodium(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const w = r * 0.56;
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(x - w * 1.5, y - r * 0.1, w, r * 0.8);
    g.fillRect(x - w / 2, y - r * 0.5, w, r * 1.2);
    g.fillRect(x + w / 2, y + r * 0.1, w, r * 0.6);
    drawStar(g, x, y - r * 0.78, r * 0.2, PALETTE.ink);
  }

  private setHud(visible: boolean): void {
    for (const part of [this.pill, this.pillText, this.beads, this.meter, this.meterValue, this.meterLeft, this.meterNext]) part.setVisible(visible);
  }

  /** The mode's pill on the pucks' row, with its sun. */
  private drawHud(): void {
    const s = this.uiScale, { safe } = this.viewport;
    const g = this.pill.clear();
    resize(this.pillText, 20 * s, SHELL.cream, STYLE.current, false);
    const w = this.pillText.width + 76 * s, h = 48 * s, x = safe.centerX - w / 2, y = safe.top + HUD.pillY * s;
    g.fillStyle(shade(PALETTE.ink, -0.4), 1).fillRoundedRect(x, y - h / 2 + 3 * s, w, h, h / 2);
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x, y - h / 2, w, h, h / 2);
    drawSun(g, x + 28 * s, y, 11 * s, SHELL.sun);
    this.pillText.setPosition(x + 48 * s, y);
    this.meterLeft.setPosition(safe.centerX - 290 * s, safe.top + HUD.meterWordsY * s);
    resize(this.meterLeft, 18 * s, PALETTE.muted, STYLE.current, false);
    this.meterNext.setPosition(safe.centerX + 290 * s, safe.top + HUD.meterWordsY * s);
    resize(this.meterNext, 18 * s, PALETTE.muted, STYLE.current, false);
    this.meterValue.setPosition(safe.centerX, safe.top + HUD.meterWordsY * s);
    resize(this.meterValue, 34 * s, PALETTE.ink);
  }

  /** One bead a task, the current one larger, a tick at the breather: redrawn on each task. */
  private drawBeads(): void {
    if (this.phase !== 'run') return;
    const s = this.uiScale, { safe } = this.viewport;
    const g = this.beads.clear();
    const count = this.chart.tasks.length;
    const gap = BEAD.gap * s, y = safe.top + HUD.beadsY * s;
    const breather = this.chart.tasks.findIndex((task, i) => i > 0 && task.leadBeats > 0);
    const split = breather > 0 ? gap * 0.3 : 0;
    const at = (i: number) => safe.centerX + (i - (count - 1) / 2) * gap + (breather > 0 ? (i >= breather ? split : -split) : 0);
    if (breather > 0) {
      const tx = (at(breather - 1) + at(breather)) / 2;
      g.lineStyle(2.5 * s, PALETTE.muted, 0.9).lineBetween(tx, y - 7 * s, tx, y + 7 * s);
    }
    for (let i = 0; i < count; i++) {
      const x = at(i);
      const done = i < this.taskIndex || this.over;
      const current = i === this.taskIndex && !this.over;
      const r = (current ? BEAD.current : BEAD.radius) * s;
      if (done || current) g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, r);
      else g.lineStyle(2 * s, PALETTE.ink, 0.5).strokeCircle(x, y, r);
    }
  }

  /** The star meter: the bar, its notches, the stars over it, and the words under it. Moves once per finished task. */
  private drawMeter(): void {
    if (this.phase !== 'run') return;
    const s = this.uiScale, { safe } = this.viewport;
    const g = this.meter.clear();
    const pose = starMeterPose(this.results.length > 0 ? meanAccuracy(this.results) : null, this.chart.starAccuracy);
    const w = Math.min(580 * s, safe.width - 80 * s), h = HUD.barHeight * s;
    const x = safe.centerX - w / 2, y = safe.top + HUD.barY * s;
    g.fillStyle(shade(SHELL.bench, -0.08), 1).fillRoundedRect(x, y, w, h, h / 2);
    g.lineStyle(2 * s, shade(SHELL.bench, -0.4), 1).strokeRoundedRect(x, y, w, h, h / 2);
    if (pose.fill > 0.02) g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x, y, Math.max(h, w * pose.fill), h, h / 2);
    pose.notches.forEach((notch, i) => {
      const nx = x + w * notch;
      g.lineStyle(3 * s, shade(SHELL.bench, -0.55), 1).lineBetween(nx, y - 8 * s, nx, y + h + 8 * s);
      const sy = safe.top + HUD.starsY * s, lit = i < pose.lit;
      if (lit) drawStar(g, nx, sy, 20 * s, STAR_PRIZE);
      else drawStarSeat(g, nx, sy, 20 * s, shade(SHELL.bench, -0.06), shade(SHELL.bench, -0.4));
    });
    this.meterValue.setText(pose.label);
    this.meterNext.setText(pose.nextLabel);
  }

  private beadRow(count = this.outcomes.length): { readonly centres: readonly number[]; readonly radius: number } {
    return trackGeometry(count, this.trackWidth, TRACK.beadGap * this.blockS, TRACK.beadRadius * this.blockS);
  }

  /** The turn block, as a level draws it, the breather's tiles included. */
  private drawBeatTrack(now: number): void {
    const g = this.marks.clear();
    const phase = this.controller?.phase;
    if (!phase || phase === 'idle' || phase === 'paused' || this.phase !== 'run') {
      this.roomDim.setAlpha(0);
      this.words.settle();
      if (this.restCall.alpha !== 0) this.restCall.setAlpha(0);
      if (this.restLabel.alpha !== 0) this.restLabel.setAlpha(0);
      return;
    }
    const { safe } = this.viewport;
    const s = this.blockS;
    const still = this.reducedMotion;
    const plan = this.controller?.plan ?? null;
    const marks = this.outcomes;
    const { centres, radius } = this.beadRow(marks.length);
    const turn = handover(plan, now);
    const background = this.cameras.main.backgroundColor;
    const paper = background.alpha === 0 ? PALETTE.paper : background.color;
    if (paper !== this.roomPaper) { this.roomPaper = paper; this.roomDim.setTint(shade(paper, -0.62)); }
    const rattle = still ? 0 : settle(now - this.extraAt, 90, 18) * 3 * s;
    const last = centres.at(-1) ?? 0;
    const span = last + radius + 34 * s;
    const beadSpan = last - (centres[0] ?? 0) + radius * 2;
    const resting = this.taskIndex > 0 && this.task.leadBeats > 0;
    const floor = resting ? TRACK.restWidth * s : 0;
    const width = Math.min(Math.max(span * 2, 220 * s, blockWidth(beadSpan, s), floor), safe.width - 48 * this.uiScale);
    const geo = blockGeometry(safe.centerX, this.trackY, width, s);
    const rest = resting && phase === 'prepare' ? restProgress(plan, now) : null;
    this.setRestWords(rest);
    const beatSec = plan ? 60 / plan.bpm : 0.5;
    const barAge = rest && rest.beat >= 0 ? now - (rest.at - rest.beat * beatSec) : 0;
    const lastBar = isLastRestBar(rest);
    drawBlock(g, geo, s, {
      centres, socketRadius: radius, played: beatsPlayed(plan, now), marks, turn,
      struck: { index: this.struckIndex, amount: still ? 0 : squash(now - this.struckAt, 0.22, 0.45), age: now - this.struckAt, perfect: this.struckPerfect },
      rattle, still, ghost: null, ink: this.ink, paper,
      landed: now - batonLanding(plan),
      flawless: this.words.flawlessAge(now),
      rest: rest && {
        bar: rest.bar, beat: rest.beat, bars: rest.bars, pressAge: now - rest.at, barAge,
        returning: !lastBar ? 0 : still ? 1 : easeInOutCubic(Math.min(1, barAge / (beatSec * 0.9))),
      },
    });
    this.words.drawFlawless(geo.columnX, centres, geo.faceCentreY, now, still);
    const pips = countIn(plan, now);
    if (pips !== null) {
      const gap = TRACK.pipGap * s, pipY = geo.shelf.y - 22 * s;
      for (let i = 0; i < 4; i++) {
        const x = safe.centerX + (i - 1.5) * gap;
        if (i < pips) g.fillStyle(this.ink, 0.9).fillCircle(x, pipY, TRACK.pipRadius * s);
        else g.lineStyle(2.5 * s, this.ink, 0.35).strokeCircle(x, pipY, TRACK.pipRadius * s);
      }
    }
    this.words.drawCall(g, plan, now, paper, still);
    this.words.drawVerdictPill(g, now, paper, still);
    this.roomDim.setAlpha(turn.yours * 0.5);
  }

  /** The breather's words: the headline, its label, and the bars to go under the face. */
  private setRestWords(rest: ReturnType<typeof restProgress>): void {
    const copy = rest ? restCopy(rest) : null;
    const labelText = copy?.label.toUpperCase() ?? '';
    if (this.restLabel.text !== labelText) this.restLabel.setText(labelText);
    this.restLabel.setAlpha(labelText === '' ? 0 : 1);
    const caption = copy?.caption ?? '';
    if (this.restCall.text !== caption) this.restCall.setText(caption);
    this.restCall.setAlpha(caption === '' ? 0 : 1);
    if (copy && (this.headline.text === '' || this.headline.text === 'Breathe' || this.headline.text === 'Get ready' || this.headline.text === this.definition.success[0] || this.headline.text === this.definition.rough[0] || this.headline.text === this.definition.partial?.copy[0])) {
      if (this.headline.text !== copy.headline) this.changeHeadline(copy.headline);
    }
  }






  // ---------------------------------------------------------------- the leave sheet

  private showSheet(): void {
    if (this.sheetOpen || this.phase !== 'run') return;
    this.sheetOpen = true;
    this.placeSheet();
    this.drawSheet(0);
  }

  private hideSheet(): void {
    this.sheetOpen = false;
    this.sheet.clear().setVisible(false);
    for (const text of [this.sheetTitle, this.sheetNote, this.sheetKeep, this.sheetLeave]) text.setVisible(false);
  }

  private placeSheet(): void {
    const s = this.uiScale, { safe } = this.viewport;
    const w = Math.min(560 * s, safe.width - 40 * s), h = 330 * s;
    const x = safe.centerX - w / 2, y = this.words.verdictY - 60 * s - h;
    this.sheetRect.setTo(x, y, w, h);
    const bw = (w - 76 * s) / 2, bh = Math.max(88 * s, this.controlSize);
    this.keepRect.setTo(x + 28 * s, y + h - bh - 28 * s, bw, bh);
    this.leaveRect.setTo(x + w - 28 * s - bw, y + h - bh - 28 * s, bw, bh);
    resize(this.sheetTitle, 40 * s, PALETTE.ink);
    resize(this.sheetNote, 24 * s, PALETTE.muted, STYLE.current, false);
    wrapWidth(this.sheetNote, w - 56 * s);
    resize(this.sheetKeep, 30 * s, SHELL.cream);
    resize(this.sheetLeave, 30 * s, SHELL.cream);
    if (this.sheetOpen) this.drawSheet(0);
  }

  private drawSheet(press: number): void {
    const s = this.uiScale, { full } = this.viewport;
    const g = this.sheet.clear().setVisible(true);
    g.fillStyle(0x1a201c, 0.5).fillRect(full.x, full.y, full.width, full.height);
    drawPanel(g, this.sheetRect, s, { fill: SHELL.cream, depth: 12, radius: 32, hero: true });
    const r = this.sheetRect;
    this.sheetTitle.setPosition(r.centerX, r.y + 64 * s).setVisible(true);
    this.sheetNote.setPosition(r.centerX, r.y + 128 * s).setVisible(true);
    const keepPress = this.pressed === 'keep' ? press : 0, leavePress = this.pressed === 'leave' ? press : 0;
    drawPanel(g, this.keepRect, s, { fill: SHELL.wood, depth: 10, press: keepPress });
    drawPanel(g, this.leaveRect, s, { fill: PALETTE.coral, depth: 10, press: leavePress, hero: true });
    this.sheetKeep.setPosition(this.keepRect.centerX, this.keepRect.centerY + 10 * s * keepPress * 0.8).setVisible(true);
    this.sheetLeave.setPosition(this.leaveRect.centerX, this.leaveRect.centerY + 10 * s * leavePress * 0.8).setVisible(true);
  }

  // ---------------------------------------------------------------- the result

  private showPlaque(): void {
    if (this.phase === 'result') return;
    this.phase = 'result';
    ++this.startRequest;
    this.starting = false;
    this.resultAt = performance.now() / 1000;
    // The run's grid has stopped; so does the click under it. The stems ring on.
    this.audio?.music.stopMetronome();
    this.hideSheet();
    this.words.reset();
    this.roomDim.setAlpha(0);
    this.marks.clear();
    this.restCall.setAlpha(0);
    this.restLabel.setAlpha(0);
    this.changeHeadline('');
    this.setHud(false);
    // The coda has finished (`finishUnlock`), so the act leaves the stage: the result stands
    // on the paper alone, and a new run builds the act again.
    this.act?.pause();
    this.act?.destroy();
    this.act = null;
    this.drawChrome(0);
    this.dressPlaque();
  }

  private hidePlaque(): void {
    this.plaque.clear().setVisible(false);
    this.continueSurface.setVisible(false);
    for (const text of this.plaqueTexts()) text.setVisible(false);
    this.toastStartRect.setTo(0, 0, 0, 0);
    this.exitRect.setTo(0, 0, 0, 0);
    this.continueRect.setTo(0, 0, 0, 0);
  }

  private plaqueTexts(): Phaser.GameObjects.Text[] {
    return [this.resultPill, this.resultHeadline, this.score, this.scoreNote, ...this.chipTexts, this.ladderTitle, this.ladderAside, this.bandChip, ...this.rowLabels, ...this.rowChips,
      this.toastTitle, this.toastNote, this.toastStart, this.toastMinutes, this.continueLabel, this.exitLabel, this.interruptedNote];
  }

  /** The words on the result, from the run's facts; set when it opens, after a Start, and when a posting lands. */
  private dressPlaque(): void {
    const invalid = this.invalid;
    this.resultHeadline.setText(invalid ? 'Run interrupted' : this.resultStars === 3 ? 'Three stars' : this.resultStars > 0 ? 'Cleared' : 'Again?');
    this.score.setText(scoreLabel(this.resultAccuracy));
    const notes = ['On the beat'];
    if (this.newBest && this.resultStars > 0) notes.push('New best today');
    if (this.postingNote !== '') notes.push(this.postingNote);
    this.scoreNote.setText(notes.join(' · ').toUpperCase());
    this.interruptedNote.setText(invalid === 'orientation' ? 'The run stopped when the phone turned. Nothing was scored.'
      : invalid === 'audio' ? 'Sound could not start. Nothing was scored.'
        : 'The run was interrupted, so it was not scored. Today’s chart is still here.');
    this.placePlaque();
  }

  /** Size the result's words and stack the plaque (`planDailyPlaque`). */
  private placePlaque(): void {
    if (this.phase !== 'result') return;
    const s = this.uiScale, { safe } = this.viewport;
    const toast = this.applied !== null && this.applied.grants.timerMinutes !== null;
    const plan = this.plaquePlan = planDailyPlaque({ s, safe, controlSize: this.controlSize, toast, interrupted: this.invalid !== null });
    const k = s * plan.k;
    resize(this.resultHeadline, 72 * s, SHELL.cream);
    resize(this.score, PLATE.scoreSize * k, PALETTE.ink);
    resize(this.scoreNote, PLATE.noteSize * k, PALETTE.muted, STYLE.current, false);
    resize(this.continueLabel, 40 * s, SHELL.cream);
    resize(this.exitLabel, 30 * s, SHELL.cream);
    resize(this.interruptedNote, 24 * s, PALETTE.muted, STYLE.current, false);
    balanceWrap(this.interruptedNote, Math.min(560 * s, safe.width - 48 * s));
    this.continueRect.setTo(plan.action.x, plan.action.y, plan.action.width, plan.action.height);
    if (plan.exit) this.exitRect.setTo(plan.exit.x, plan.exit.y, plan.exit.width, plan.exit.height);
    else this.exitRect.setTo(0, 0, 0, 0);
    this.drawPlaque(0);
  }

  private drawPlaque(press: number): void {
    const plan = this.plaquePlan;
    if (!plan || this.phase !== 'result') return;
    const s = this.uiScale, { safe } = this.viewport;
    const k = s * plan.k;
    const still = this.reducedMotion;
    const age = performance.now() / 1000 - this.resultAt;
    const g = this.plaque.clear().setVisible(true);
    const centreX = safe.centerX;
    const show = (text: Phaser.GameObjects.Text, x: number, y: number) => text.setPosition(x, y).setVisible(true);
    // The pill names the mode and the act; the headline the verdict.
    this.resultPill.setText(`Daily Tempo · ${this.definition.title}`.toUpperCase());
    resize(this.resultPill, 20 * s, SHELL.cream, STYLE.current, false);
    const pw = Math.min(this.resultPill.width + 76 * s, safe.width - 40 * s), ph = 44 * s, px = centreX - pw / 2;
    this.resultPill.setScale(this.resultPill.width > pw - 76 * s ? (pw - 76 * s) / this.resultPill.width : 1);
    g.fillStyle(shade(PALETTE.ink, -0.4), 1).fillRoundedRect(px, plan.pillY - ph / 2 + 3 * s, pw, ph, ph / 2);
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(px, plan.pillY - ph / 2, pw, ph, ph / 2);
    drawSun(g, px + 26 * s, plan.pillY, 10 * s, SHELL.sun);
    show(this.resultPill, px + 46 * s, plan.pillY);
    show(this.resultHeadline, centreX, plan.headlineY + 30 * s);
    const actionPress = this.pressed === 'continue' ? press : 0;
    if (this.invalid !== null || !plan.plaque) {
      for (const text of [this.score, this.scoreNote, ...this.chipTexts, this.ladderTitle, this.ladderAside, this.bandChip, ...this.rowLabels, ...this.rowChips, this.toastTitle, this.toastNote, this.toastStart, this.toastMinutes]) text.setVisible(false);
      show(this.interruptedNote, centreX, plan.noteY ?? plan.headlineY + 120 * s);
      drawPanel(g, this.continueRect, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: actionPress, hero: true });
      placeSurface(this.continueSurface.setVisible(true), this.continueRect, s, CHROME.block.depth * s * actionPress * 0.8);
      this.continueLabel.setText('Try again');
      resize(this.continueLabel, 34 * s, SHELL.cream);
      show(this.continueLabel, this.continueRect.centerX, this.continueRect.centerY + CHROME.block.depth * s * actionPress * 0.8);
      const exitPress = this.pressed === 'exit' ? press : 0;
      drawPanel(g, this.exitRect, s, { fill: SHELL.wood, depth: 12, press: exitPress });
      show(this.exitLabel, this.exitRect.centerX, this.exitRect.centerY + 12 * s * exitPress * 0.8);
      return;
    }
    this.interruptedNote.setVisible(false);
    this.exitLabel.setVisible(false);
    // The plaque on its ropes, the tray, the medals and their chips, the score.
    const p = plan.plaque;
    const ropeXs = [centreX - PLATE.ropeX * k, centreX + PLATE.ropeX * k];
    g.save();
    g.translateCanvas(0, safe.y);
    drawRopes(g, s, plan.rope, ropeXs, 6);
    g.restore();
    drawPanel(g, new Rect(p.x, p.y, p.width, p.height), s, { fill: SHELL.cream, depth: 12, radius: 24 * plan.k, hero: true, frame: shade(SHELL.sun, 0.1) });
    const tray = trayRect();
    const trayX = centreX + tray.x * k, trayY = p.y + tray.y * k, trayW = tray.width * k, trayH = tray.height * k;
    g.fillStyle(shade(SHELL.bench, -0.1), 1).fillRoundedRect(trayX, trayY + PLATE.tray.shadow * k * 0.4, trayW, trayH, PLATE.tray.radius * k);
    g.fillStyle(SHELL.bench, 1).fillRoundedRect(trayX, trayY, trayW, trayH, PLATE.tray.radius * k);
    for (let i = 0; i < 3; i++) {
      const seat = medalSeat(i as 0 | 1 | 2), chip = chipSeat(i as 0 | 1 | 2);
      const x = centreX + seat.x * k, y = p.y + seat.y * k, radius = seat.radius * k;
      const earned = i < this.resultStars;
      drawStarSeat(g, x, y, radius, SHELL.bench, PALETTE.muted);
      if (earned) {
        const local = starAge(age, i, still);
        if (local > 0) {
          drawStarMark(g, { x, y, radius, color: STAR_PRIZE, pose: starPose(local, true, STYLE.current.exaggeration), impactAge: starImpactAge(local, true) });
        }
      } else {
        // The empty seat is drawn as a dashed star, as the mock has it: hollow says "not this time".
        const points = Array.from({ length: 11 }, (_, n) => {
          const a = -Math.PI / 2 + n * Math.PI / 5;
          const r = n % 2 === 0 ? radius * 0.92 : radius * 0.42;
          return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
        });
        g.lineStyle(3 * k, shade(SHELL.bench, -0.45), 1);
        for (const [a, b] of dashes(points, 9 * k, 6 * k)) g.lineBetween(a.x, a.y, b.x, b.y);
      }
      const chipText = this.chipTexts[i]!;
      chipText.setText(`${this.chart.starAccuracy[i]}%`);
      resize(chipText, PLATE.chip.text * k, earned ? SHELL.cream : PALETTE.muted, STYLE.current, false);
      const cx = centreX + chip.x * k, cy = p.y + chip.y * k, cw = chip.width * k, ch = chip.height * k;
      if (earned) g.fillStyle(PALETTE.ink, 1).fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, ch / 2);
      else this.dashedBox(g, { x: cx - cw / 2, y: cy - ch / 2, width: cw, height: ch }, ch / 2, k);
      show(chipText, cx, cy);
    }
    show(this.score, centreX, p.y + PLATE.scoreY * k);
    show(this.scoreNote, centreX, p.y + PLATE.noteY * k);
    this.scoreNote.setScale(this.scoreNote.width > p.width - 40 * k ? (p.width - 40 * k) / this.scoreNote.width : 1);
    // The ladder: this run's tiers paid, earlier ones earlier, the rest short.
    const applied = this.applied;
    const paidBefore = applied?.paidBefore ?? 0, paidNow = applied?.paidNow ?? 0;
    this.drawLadder(g, plan.ladder!, plan.ladderHead!, plan.ladderRows, k, ladderRows(this.chart.starAccuracy, paidBefore, paidNow, this.resultStars), ladderHeading(paidNow, true));
    // The toast: a timer won or lengthened, with Start, and the running time once it is started.
    this.toastStartRect.setTo(0, 0, 0, 0);
    if (plan.toast && applied && applied.grants.timerMinutes !== null) {
      const t = plan.toast;
      const won = this.dayFacts().won;
      const running = shelfView(loadReplayTimer(), Date.now()).running;
      drawPanel(g, new Rect(t.x, t.y, t.width, t.height), s, { fill: PALETTE.ink, depth: 10, radius: 24 * plan.k });
      const tokenR = 42 * k, tokenX = t.x + 26 * k + tokenR, cy = t.y + t.height / 2;
      const started = won === null;
      drawTimerToken(g, tokenX, cy + 4 * k, tokenR, started ? 'running' : 'won', started ? (running ? Math.min(1, running.leftMs / (applied.grants.timerMinutes * 60_000)) : 0) : won.window, k);
      this.toastMinutes.setText(started ? (running?.short ?? '') : won.compact);
      resize(this.toastMinutes, 20 * k, PALETTE.ink);
      show(this.toastMinutes, tokenX, cy + 4 * k);
      const minutes = formatMinutes(applied.grants.timerMinutes);
      this.toastTitle.setText(started ? (running ? `Timer running · ${running.label} left` : 'Timer started') : applied.timerUpgraded ? `Timer now ${minutes}` : `${minutes} timer won`);
      resize(this.toastTitle, 28 * k, SHELL.cream);
      this.toastNote.setText(started ? 'Restarts are free while it runs.' : 'On your shelf. Start it within 1 hr.');
      resize(this.toastNote, 21 * k, shade(SHELL.cream, -0.18), STYLE.current, false);
      const textX = tokenX + tokenR + 22 * k;
      let right = t.x + t.width - 24 * k;
      if (!started) {
        const bw = Math.max(140 * k, this.controlSize * 0.9), bh = Math.min(t.height - 44 * k, 80 * k);
        this.toastStartRect.setTo(t.x + t.width - 24 * k - bw, cy - bh / 2, bw, bh);
        const startPress = this.pressed === 'start' ? press : 0;
        drawPanel(g, this.toastStartRect, s, { fill: SHELL.cream, depth: 8, radius: 18 * plan.k, press: startPress });
        resize(this.toastStart, 22 * k, PALETTE.ink, STYLE.current, false);
        show(this.toastStart, this.toastStartRect.centerX, this.toastStartRect.centerY + 8 * k * startPress * 0.8);
        right = this.toastStartRect.x - 16 * k;
      } else this.toastStart.setVisible(false);
      const room = right - textX;
      show(this.toastTitle, textX, cy - 18 * k);
      this.toastTitle.setScale(this.toastTitle.width > room ? room / this.toastTitle.width : 1);
      wrapWidth(this.toastNote, room);
      show(this.toastNote, textX, cy + 22 * k);
    } else {
      for (const text of [this.toastTitle, this.toastNote, this.toastStart, this.toastMinutes]) text.setVisible(false);
    }
    // Continue.
    drawPanel(g, this.continueRect, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: actionPress, hero: true });
    placeSurface(this.continueSurface.setVisible(true), this.continueRect, s, CHROME.block.depth * s * actionPress * 0.8);
    const sink = CHROME.block.depth * s * actionPress * 0.8;
    this.continueLabel.setText('Continue');
    resize(this.continueLabel, 40 * s, SHELL.cream);
    const span = this.continueLabel.width + 76 * s;
    show(this.continueLabel, this.continueRect.centerX - span / 2 + this.continueLabel.width / 2, this.continueRect.centerY + sink);
    drawActionDisc(g, this.continueRect.centerX + span / 2 - 28 * s, this.continueRect.centerY + sink, 28 * s, s);
  }

  // ---------------------------------------------------------------- lifecycle

  private readonly visibility = (): void => { if (document.hidden) this.invalidate('background'); };
  private readonly pageHide = (): void => { if (!this.disposed) this.invalidate('background'); };
  private readonly audioState = (): void => { this.audio?.recover(); };
  private checkOrientation(): void { if (this.blocked() && !document.hidden) this.invalidate('orientation'); }

  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    ++this.startRequest;
    if (this.pump !== null) clearInterval(this.pump);
    this.pump = null;
    this.taps.dispose();
    this.controller?.dispose();
    this.act?.destroy();
    this.act = null;
    this.fx.destroy();
    this.backdrop.destroy();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.pageHide);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.controller = null;
    this.audio?.context.removeEventListener('statechange', this.audioState);
    this.audio?.cancel();
    this.audio = null;
  }
}
