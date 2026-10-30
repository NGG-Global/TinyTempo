import Phaser from 'phaser';
import { breadcrumb, reportError, setErrorContext } from '@/core/errors';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import type { AudioEngine, VignetteSounds } from '@/audio/AudioEngine';
import { setMusicBed } from '@/audio/musicBed';
import { outputSilent, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { syncClockCalibration } from '@/audio/audioRoute';
import { samples } from '@/audio/samples';
import { ENDLESS } from '@/config/endless';
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
import { batonLanding, beatsPlayed, countIn, handover, isFlawless, markFor, trackGeometry, type Mark } from '@/game/beatTrack';
import {
  applyAccuracy, createEndlessSequence, elapsedMs, ENDLESS_RULES, formatSurvival, LIVES_START, MILESTONES,
  type EndlessLives, type EndlessRunSummary, type EndlessSequence, type EndlessStep,
} from '@/game/endless';
import { loadEndlessProgress, recordEndlessRun, saveEndlessProgress, type RunRecorded } from '@/game/endlessProgress';
import { advanceLayers, OPENING_LAYERS } from '@/game/musicLayers';
import { trackForLevel } from '@/game/musicSelection';
import { loadProgress } from '@/game/progress';
import type { RoundResult } from '@/game/scoring';
import { barsFor, finishOutcome } from '@/game/taskVerdict';
import { TapInput, type Tap } from '@/input/TapInput';
import { track } from '@/monetization/analytics';
import { syncAchievements } from '@/playgames/achievementSync';
import { endlessLeaderboardOffered, openEndlessLeaderboard, recordEndlessScore } from '@/playgames/endless';
import { endlessSubmissionCopy } from '@/playgames/endlessLeaderboard';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { CHROME, drawActionDisc, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { Feedback, FxKey } from '@/ui/feedback';
import { TurnWords } from '@/ui/turnWords';
import { drawInfinity, drawMap, drawNote, drawSpeaker } from '@/ui/icons';
import { BRASS, drawPanel, placeSurface, Rect, surface } from '@/ui/panel';
import { punch } from '@/ui/punch';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { ScreenHint } from '@/ui/screenHint';
import { arrive, settle, squash } from '@/ui/spring';
import { blockGeometry, blockScale, blockWidth, columnRoom, columnShift, drawBlock, TRACK } from '@/ui/turnBlock';
import { planEndlessPlaque, type PlaqueFrame } from '@/ui/endlessPlaque';
import { balanceWrap, body, display, label, resize, wrapWidth } from '@/ui/type';
import { easeOut } from '@/vignettes/motion';
import { VIGNETTES } from '@/vignettes/registry';
import { definitionForLap, type Vignette, type VignetteDefinition } from '@/vignettes/Vignette';

/** The cloth texture's alpha over the Try again block, which the play disc shows through. */
const AGAIN_CLOTH_ALPHA = 0.35;

/** Why a run stopped being a ranked run. The analytics vocabulary, and the words on the plaque. */
type AbandonReason = 'user' | 'timing' | 'background' | 'orientation' | 'audio';

/**
 * Endless Mode: one continuous musical session, one rhythm task per act, each act's coda
 * running straight into the next act's demonstration, three Groove Lives, and a survival clock that is the audio clock's grid and nothing
 * else (`docs/ENDLESS_MODE.md`).
 *
 * The scene presents what `game/endless.ts` decides. It is deliberately not PlayScene: no
 * hearts, no stars, no summary plaque with medals, no restart sheet, no keepsakes, no
 * finale — and it must never grow them. What it shares with a level it shares by using the
 * same objects: the `RoundController`, the judge and the scorer, the turn block
 * (`ui/turnBlock.ts`) and its count-in, the acts from the registry, and the one
 * `AudioEngine` with its one `MusicSystem` running one loop for the whole run.
 *
 * Three rules that are easy to break from inside this file. **The music never restarts
 * between acts**: the loop started on the first count-in runs to the end of the run, its
 * rate and stems moved on bar lines only, and an act change is a plan placed on that grid.
 * **Nothing is added between acts**: the outgoing act's coda — its contact, hold and slide,
 * which complete whole bars — is the only rest, and the next act's demonstration starts on
 * the downbeat the slide lands on, exactly as one task follows another inside a level. **A run that is interrupted is not a run**: backgrounding, a stall, the wrong
 * orientation or a lost audio context invalidates it, once, with nothing recorded or sent.
 */
export class EndlessScene extends BaseScene {
  private audio: AudioEngine | null = null;
  private controller: RoundController | null = null;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private hint!: ScreenHint;
  private fx!: Feedback;
  private sequence: EndlessSequence | null = null;
  /** The step on stage, and the act drawing it. */
  private step: EndlessStep | null = null;
  private act: { readonly definition: VignetteDefinition; readonly vignette: Vignette; readonly step: EndlessStep } | null = null;
  /** The step after this one, drawn when this one resolves, so its act's voices are made during the coda. */
  private nextStep: EndlessStep | null = null;
  /** Each act's voices, synthesized once per scene life: the swap between acts pays no synthesis. */
  private sounds = new Map<string, VignetteSounds>();
  private lives: EndlessLives = LIVES_START;
  /** The ranked clock: the first demonstration downbeat, and the fatal response's end, on the grid. */
  private runStartSec = -Infinity;
  private runEndSec = -Infinity;
  private runId = '';
  private over = false;
  private invalid: AbandonReason | null = null;
  private vignettesScored = 0;
  private peakBpm = 0;
  private tally = { perfect: 0, good: 0, missed: 0, extras: 0 };
  private resultTaken = false;
  private recorded: RunRecorded | null = null;
  private saveFailed = false;
  private postingNote = '';
  /** Where an interrupted run's clock stood when it stopped, shown greyed; null when it never started. */
  private stoppedMs: number | null = null;
  /** The screen that opened Endless, and the one its way out goes back to. */
  private returnTo: typeof SceneKey.Map | typeof SceneKey.Menu = SceneKey.Map;
  private layers = OPENING_LAYERS;
  /** The beat-aligned slide between acts; `next` is the next act's demonstration downbeat. */
  private transition: { slide: number; swap: number; next: number; swapped: boolean; step: EndlessStep } | null = null;
  private finishUnlock = Infinity;
  private startRequest = 0;
  private starting = false;
  private disposed = false;
  private pump: ReturnType<typeof setInterval> | null = null;
  /** Judgements that scored in the early window while the example was still on screen. */
  private heldJudgements: Judgement[] = [];
  // HUD
  private timeText!: Phaser.GameObjects.Text;
  private timeShown = '';
  private tempoLabel!: Phaser.GameObjects.Text;
  private livesMark!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private headlineAt = -Infinity;
  private headlineY = 0;
  private headlineSize = 0;
  private caption!: Phaser.GameObjects.Text;
  // The turn block
  private marks!: Phaser.GameObjects.Graphics;
  private roomDim!: Phaser.GameObjects.Image;
  private roomPaper = -1;
  private outcomes: Mark[] = [];
  /** The count, the verdict word with its tag, and "Flawless!", as a level draws them (`ui/turnWords.ts`). */
  private words!: TurnWords;
  private struckIndex = -1;
  private struckAt = -Infinity;
  private struckPerfect = false;
  /** The x the block's column offsets are measured from (`columnShift`), for a burst at a socket. */
  private columnX = 0;
  private extraAt = -Infinity;
  private punchAt = -Infinity;
  private trackY = 0;
  private trackWidth = 0;
  /** The scale the turn block is drawn at: the scene's, times `BLOCK_SCALE`. */
  private blockS = 1;
  // Chrome
  private chrome!: Phaser.GameObjects.Graphics;
  private mapAt = { x: 0, y: 0 };
  private muteAt = { x: 0, y: 0 };
  private muted = false;
  private puckPressed: 'map' | 'mute' | null = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  private controlSize = 96;
  private uiScale = 1;
  // The leave sheet, over the running run
  private sheet!: Phaser.GameObjects.Graphics;
  private sheetTitle!: Phaser.GameObjects.Text;
  private sheetNote!: Phaser.GameObjects.Text;
  private sheetKeep!: Phaser.GameObjects.Text;
  private sheetLeave!: Phaser.GameObjects.Text;
  private sheetOpen = false;
  private keepRect = new Phaser.Geom.Rectangle();
  private leaveRect = new Phaser.Geom.Rectangle();
  private sheetRect = new Phaser.Geom.Rectangle();
  // The result plaque
  private plaque!: Phaser.GameObjects.Graphics;
  private plaqueEyebrow!: Phaser.GameObjects.Text;
  private plaqueTitle!: Phaser.GameObjects.Text;
  private plaqueTime!: Phaser.GameObjects.Text;
  private plaqueStats!: Phaser.GameObjects.Text;
  private plaqueBest!: Phaser.GameObjects.Text;
  private plaqueNote!: Phaser.GameObjects.Text;
  private againLabel!: Phaser.GameObjects.Text;
  private againSurface!: Phaser.GameObjects.TileSprite;
  private mapLabel!: Phaser.GameObjects.Text;
  private boardLabel!: Phaser.GameObjects.Text;
  private againRect = new Phaser.Geom.Rectangle();
  private mapRect = new Phaser.Geom.Rectangle();
  private boardRect = new Phaser.Geom.Rectangle();
  private plaqueShown = false;
  private plaqueAt = -Infinity;
  private pressedAt = -Infinity;
  private pressed: 'again' | 'map' | 'board' | 'keep' | 'leave' | null = null;
  private pressDirty = false;
  private boardBusy = false;
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Endless); }

  protected override build(): void {
    // Assigned here, never left to the field initializers: a second visit reuses the instance.
    this.disposed = false;
    this.starting = false;
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.returnTo = data?.from === SceneKey.Menu ? SceneKey.Menu : SceneKey.Map;
    this.audio = null;
    this.controller = null;
    this.sequence = null;
    this.step = null;
    this.act = null;
    this.nextStep = null;
    this.sounds = new Map();
    this.resetRun();
    this.muted = outputSilent(this);
    setErrorContext('level', 'endless');
    this.fx = new Feedback(this, 5);
    this.fx.prime('sparks', [PALETTE.coral, SHELL.cream]);
    this.headline = display(this, '', { size: 88, colour: SHELL.cream, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.caption = label(this, '', { size: 22, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setAlpha(0).setDepth(12);
    this.timeText = display(this, '0:00.0', { size: 54, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.timeShown = '0:00.0';
    this.tempoLabel = label(this, '', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setDepth(12);
    this.livesMark = this.add.graphics().setDepth(12);
    this.chrome = this.add.graphics().setDepth(10);
    this.roomDim = this.add.image(0, 0, FxKey.vignette).setDepth(6).setAlpha(0);
    this.roomPaper = -1;
    this.marks = this.add.graphics().setDepth(8);
    this.words = new TurnWords(this, this.fx, PALETTE.ink, 8);
    this.sheet = this.add.graphics().setDepth(40).setVisible(false);
    this.sheetTitle = display(this, 'Leave this run?', { size: 40, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.sheetNote = body(this, 'It ends here and is not ranked.', { size: 24, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.sheetKeep = display(this, 'Keep playing', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.sheetLeave = display(this, 'Leave', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(41).setVisible(false);
    this.plaque = this.add.graphics().setDepth(30).setVisible(false);
    // Every row hangs from its top edge: the plaque is stacked from the rows' measured heights.
    this.plaqueEyebrow = label(this, 'Endless Mode', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setDepth(31).setVisible(false);
    this.plaqueTitle = display(this, '', { size: 44, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5, 0).setDepth(31).setVisible(false);
    this.plaqueTime = display(this, '', { size: 84, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5, 0).setDepth(31).setVisible(false);
    this.plaqueStats = body(this, '', { size: 24, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setDepth(31).setVisible(false);
    this.plaqueBest = label(this, '', { size: 22, colour: shade(BRASS, -0.62), align: 'center' }).setOrigin(0.5, 0).setDepth(31).setVisible(false);
    this.plaqueNote = body(this, '', { size: 21, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setDepth(31).setVisible(false);
    this.againLabel = display(this, 'Try again', { size: 36, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.againSurface = surface(this, MaterialKey.cloth, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, PALETTE.coral, AGAIN_CLOTH_ALPHA).setDepth(31).setVisible(false);
    this.mapLabel = display(this, this.returnTo === SceneKey.Menu ? 'Home' : 'Map', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.boardLabel = label(this, 'Leaderboard', { size: 22, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.curtain = new SceneCurtain(this);
    // The first visit reads the rules before the run starts: closing the card is the start.
    this.hint = new ScreenHint(this, 'endless', how => { if (how === 'back') this.leaveRun(); else void this.start(); });
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.pump = setInterval(() => this.tick(), RHYTHM.pumpMs);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pageHide);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal(() => {
      if (!this.hint.showIfNew(performance.now() / 1000)) void this.start();
    }));
  }

  /** Everything one run owns, back to the start. Never the audio, the acts' voices or the chrome. */
  private resetRun(): void {
    this.lives = LIVES_START;
    this.runStartSec = this.runEndSec = -Infinity;
    this.runId = '';
    this.over = false;
    this.invalid = null;
    this.vignettesScored = 0;
    this.peakBpm = 0;
    this.tally = { perfect: 0, good: 0, missed: 0, extras: 0 };
    this.resultTaken = false;
    this.recorded = null;
    this.saveFailed = false;
    this.postingNote = '';
    this.stoppedMs = null;
    this.layers = OPENING_LAYERS;
    this.transition = null;
    this.nextStep = null;
    this.finishUnlock = Infinity;
    this.heldJudgements = [];
    this.outcomes = [];
    this.struckIndex = -1;
    this.struckAt = this.extraAt = this.punchAt = -Infinity;
    this.plaqueShown = false;
    this.plaqueAt = -Infinity;
    this.sheetOpen = false;
    this.boardBusy = false;
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.act?.vignette.layout(this.viewport);
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.muteAt = { x: safe.right - 56 * s, y: safe.top + 66 * s };
    this.mapAt = { x: safe.left + 56 * s, y: this.muteAt.y };
    // The clock sits where a level's task beads do, between the two pucks, with the tempo
    // under it; the lives hang under the map puck's row on the left.
    this.timeText.setPosition(safe.centerX, safe.top + 30 * s);
    resize(this.timeText, 54 * s, PALETTE.ink);
    this.tempoLabel.setPosition(safe.centerX, safe.top + 100 * s);
    resize(this.tempoLabel, 20 * s, PALETTE.muted, STYLE.current, false);
    this.headlineY = safe.top + 200 * s;
    this.headlineSize = (this.controller?.active ? 48 : 72) * s;
    resize(this.headline, this.headlineSize, SHELL.cream);
    this.headline.setPosition(safe.centerX, this.headlineY).setLineSpacing(-10 * s);
    this.caption.setPosition(safe.centerX, this.headlineY - 30 * s);
    resize(this.caption, 22 * s, SHELL.cream, STYLE.current, false);
    this.drawChrome(s, 0);
    this.drawLives();
    this.trackY = safe.bottom - LAYOUT.trackOffsetFromBottom * s;
    const b = this.blockS = blockScale(s);
    this.trackWidth = columnRoom(Math.min(620 * b, safe.width - 48 * s), b);
    this.columnX = safe.centerX + columnShift(b);
    this.words.layout(safe.centerX, this.trackY, s, b);
    this.roomDim.setPosition(full.centerX, (safe.top + safe.height * 0.42 + this.trackY) / 2)
      .setDisplaySize(full.width * 1.45, full.height * 1.55);
    this.placeSheet();
    this.placePlaque();
    this.hint.layout(this.viewport, s);
  }

  private get ink(): number { return this.act?.definition.ink ?? PALETTE.ink; }
  private blocked(): boolean { return document.hidden || wrongOrientation(this.scale.isLandscape); }
  private now(): number { return this.audio?.clock.now() ?? performance.now() / 1000; }
  private get stems(): number { const track = this.audio?.music.track; return track?.levelStems ?? track?.stems.length ?? 1; }

  // ---------------------------------------------------------------- the run

  /**
   * A fresh run from its count-in. Nothing is spent: no heart, no attempt. The audio is
   * unlocked and the track loaded exactly as a level does it, the first act is built, and
   * the loop starts at the first step's tempo with the metronome bar under it. The clock
   * does not start here: it starts on the first demonstration downbeat, after the count-in.
   */
  private async start(): Promise<void> {
    const request = ++this.startRequest;
    this.controller?.dispose();
    this.audio?.cancel();
    this.audio?.music.stop();
    this.act?.vignette.pause();
    this.resetRun();
    this.hidePlaque();
    this.hideSheet();
    this.words.reset();
    this.changeHeadline('');
    this.setCaption('');
    this.drawLives();
    this.showTime(0);
    if (this.blocked()) { this.changeHeadline('Turn your phone upright'); return; }
    this.starting = true;
    breadcrumb('endless started', { rules: ENDLESS_RULES.version });
    try {
      if (!this.controller) {
        this.audio = sharedAudio(this);
        this.audio.context.addEventListener('statechange', this.audioState);
        this.muted = this.audio.silent;
        this.drawChrome(this.uiScale, 0);
        this.controller = new RoundController(this.audio, {
          phase: phase => this.showPhase(phase),
          cue: cue => {
            if (cue.kind !== 'action') return;
            const phase = this.controller?.phase;
            if (phase !== 'demonstrate' && phase !== 'prepare') return;
            this.act?.vignette.onDemonstrationBeat(cue.time);
          },
          tap: () => { this.act?.vignette.onPlayerHit(this.now()); this.releaseHeldJudgements(); },
          judgement: result => this.showJudgement(result),
          complete: result => this.showResult(result),
          interrupted: () => this.invalidate('timing'),
        });
      }
      await this.audio!.unlock();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      await this.audio!.music.load(trackForLevel(ENDLESS.unlockLevel));
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      await samples.load(this.audio!.context);
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.starting = false;
      this.sequence = createEndlessSequence(ENDLESS_RULES);
      const first = this.sequence.next();
      this.mountAct(first);
      this.runId = `endless-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
      this.layers = OPENING_LAYERS;
      const origin = this.audio!.music.start(undefined, { layers: OPENING_LAYERS, metronome: true });
      this.audio!.music.setRate(first.bpm / MUSIC.sourceBpm, origin);
      void setMusicBed(this.audio!, 'level');
      if (this.disposed || request !== this.startRequest || this.blocked()) { this.audio!.music.stop(); return; }
      track('endless_started', { rules_version: ENDLESS_RULES.version, start_bpm: first.bpm });
      this.beginStep(first, origin, ENDLESS.countInBeats);
      this.runStartSec = this.controller!.plan!.demo;
    } catch (error) {
      if (this.disposed || request !== this.startRequest) return;
      this.starting = false;
      this.controller?.dispose();
      this.audio?.cancel();
      this.audio?.music.stop();
      console.error('Unable to start Endless Mode', error);
      this.invalidate('audio');
    }
  }

  /** Build a step's act on the stage, destroying whatever stood there. */
  private mountAct(step: EndlessStep): void {
    this.act?.vignette.destroy();
    const definition = definitionForLap(VIGNETTES[step.actIndex]!, step.lap);
    const vignette = definition.create(this, step.lap);
    vignette.layout(this.viewport);
    this.act = { definition, vignette, step };
    setErrorContext('act', definition.id);
    // The act's ink dresses the verdict and the count; re-dress them for it once, here.
    this.words.dress(definition.ink);
  }

  private soundsFor(definition: VignetteDefinition): VignetteSounds {
    let voices = this.sounds.get(definition.id);
    if (!voices) { voices = definition.sounds(this.audio!.context); this.sounds.set(definition.id, voices); }
    return voices;
  }

  /** One step's plan on the grid: the run's count-in before the first, nothing before the rest, then the task. */
  private beginStep(step: EndlessStep, startAt: number, leadBeats: number): void {
    const audio = this.audio!;
    // The active route's Tap offset, taken here and nowhere mid-task (see PlayScene.beginPlan).
    syncClockCalibration(audio.clock);
    if (!this.act || this.act.step !== step) this.mountAct(step);
    const { definition, vignette } = this.act!;
    this.step = step;
    this.peakBpm = Math.max(this.peakBpm, step.bpm);
    audio.setSounds(this.soundsFor(definition));
    this.outcomes = step.pattern.hits.map(() => 'pending');
    this.heldJudgements = [];
    this.struckIndex = -1;
    this.struckAt = this.extraAt = -Infinity;
    this.words.reset();
    this.resultTaken = false;
    this.controller!.start(
      step.pattern, step.bpm, audio.context.currentTime, performance.now(), startAt, leadBeats,
      definition.gridAction === true || audio.clock.tapVoiceLate,
    );
    vignette.reset(this.controller!.plan!);
    this.tempoLabel.setText(`${step.bpm} BPM · bar ${step.threshold}%`);
  }

  private showPhase(phase: Phase): void {
    const now = this.now();
    this.act?.vignette.onPhase(phase, now);
    if (phase === 'prepare') {
      // The act that is coming is named as it slides in, as the map names a stop. With no
      // rest between acts that is a single beat, so the name stays up through the
      // demonstration — which it describes — and goes on the player's downbeat.
      this.setCaption(this.vignettesScored === 0 ? 'First up' : 'Next');
      this.changeHeadline(this.act?.definition.title ?? '');
    }
    if (phase === 'respond') {
      this.setCaption('');
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
    const { centres } = this.beads();
    this.words.say(result, now, this.columnX + (centres[result.index ?? 0] ?? 0), this.reducedMotion);
  }
  private presentJudgement(result: Judgement): void {
    const now = this.now();
    this.act?.vignette.onAccuracy(result, now);
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
   * One act resolved. The lives move exactly once here, from the unrounded accuracy against
   * the step's bar; the act plays its own coda, the stems answer the result, and either the
   * next step is placed on the grid — the slide and the swap, its demonstration on the
   * downbeat the slide lands on — or the run is over and the clock stops on this response's last bar line.
   */
  private showResult(result: RoundResult): void {
    if (this.resultTaken || !this.step || !this.act || !this.audio || !this.controller?.plan) return;
    this.resultTaken = true;
    const step = this.step, plan = this.controller.plan, { definition, vignette } = this.act;
    const now = this.now();
    this.vignettesScored++;
    this.tally = { perfect: this.tally.perfect + result.perfect, good: this.tally.good + result.good, missed: this.tally.missed + result.missed, extras: this.tally.extras + result.extras };
    const outcome = applyAccuracy(this.lives, result.accuracy, step.threshold);
    this.lives = outcome.next;
    this.drawLives();
    // Every target Perfect and nothing extra: the flourish, as a level gives it. An
    // interrupted run is invalidated rather than capped, so there is no ceiling to check.
    if (isFlawless(this.outcomes) && result.extras === 0) this.words.flawlessNow(now);
    const elapsedSec = Math.max(0, Math.floor(now - this.runStartSec));
    track('endless_vignette_finished', { elapsed_sec: elapsedSec, step: step.index, bpm: step.bpm, accuracy: Math.round(result.accuracy), lives: this.lives.lives, role: step.role });
    if (outcome.event === 'lost') { track('endless_life_lost', { elapsed_sec: elapsedSec, lives: this.lives.lives }); vibrate('stamp'); }
    if (outcome.event === 'recovered') track('endless_recovered', { elapsed_sec: elapsedSec, lives: this.lives.lives });
    // The act's ending reads the step's own bar, so a step that keeps its life ends well
    // and one that costs a life never plays the success coda (`game/taskVerdict.ts`).
    // Presentation only: the life above is decided by `applyAccuracy` alone.
    const bars = barsFor(step.threshold);
    const partial = definition.partial;
    const finish = finishOutcome(result.accuracy, bars, partial !== undefined);
    const strong = finish === 'success';
    const ending = new TaskSequence(step.bpm, plan.start, 1).ending(plan.end, definition.endingHoldBeats);
    vignette.finish(strong, ending.contact, finish);
    if (strong) this.punchAt = ending.contact;
    this.layers = advanceLayers(this.layers, result.accuracy, this.stems, bars);
    this.finishUnlock = ending.contact + definition.endingSec;
    if (outcome.over) {
      this.over = true;
      this.runEndSec = plan.end;
      this.transition = null;
      this.audio.playFinish(ending.contact, finish);
      this.audio.music.setRate(1, ending.next);
      this.changeHeadline('Out of lives');
      this.recordRun();
      return;
    }
    this.nextStep = this.sequence!.next();
    // The next act's voices are synthesized now, under this act's coda, where nothing is
    // judged, rather than at the swap a single beat before its first demonstration beat.
    this.soundsFor(definitionForLap(VIGNETTES[this.nextStep.actIndex]!, this.nextStep.lap));
    this.audio.playFinish(ending.contact, finish, ending.next);
    this.transition = { ...ending, swapped: false, step: this.nextStep };
    const copy = finish === 'success' ? definition.success : finish === 'partial' && partial ? partial.copy : definition.rough;
    this.changeHeadline(outcome.event === 'lost' ? 'Life lost' : outcome.event === 'recovered' ? 'Life back' : copy[0]);
  }

  private tick(): void {
    if (this.disposed || !this.audio || this.blocked()) return;
    if (this.audio.context.state !== 'running') {
      // The engine silenced the context because the app left the screen — the activity's
      // own pause, which the page is not told about — and a run that was out of sight is
      // invalidated, as one behind a hidden page is.
      if (this.audio.background.hidden) { this.invalidate('background'); return; }
      this.audio.recover();
      return;
    }
    this.audio.clock.refresh();
    const transition = this.transition;
    if (transition && this.now() >= transition.swap && !transition.swapped) {
      // Read on the context clock, which the cues are scheduled against (see `canPlaceNextTask`).
      if (!canPlaceNextTask(this.audio.context.currentTime, transition.next)) { this.invalidate('timing'); return; }
      transition.swapped = true;
      // The tempo and the stems move on the next act's first demonstration downbeat, with
      // the grid, so a demonstration and its response are always at one tempo.
      this.audio.music.setRate(transition.step.bpm / MUSIC.sourceBpm, transition.next);
      this.audio.music.setLayers(this.layers, transition.next);
      // The incoming act is built now, slides in over the beat before `next`, and its plan
      // has no lead-in: its demonstration starts on `next`, as a level's next task does.
      this.beginStep(transition.step, transition.next, 0);
    }
    if (transition && this.now() >= transition.next) this.transition = null;
    if (this.controller?.active) this.controller.tick(this.now(), performance.now());
  }

  /** The run's facts, saved and sent, once. Idempotent by the run id. */
  private recordRun(): void {
    if (this.recorded || this.invalid) return;
    const summary: EndlessRunSummary = {
      runId: this.runId, rulesVersion: ENDLESS_RULES.version, elapsedMs: elapsedMs(this.runStartSec, this.runEndSec),
      vignettes: this.vignettesScored, peakBpm: this.peakBpm, ...this.tally,
    };
    const recorded = recordEndlessRun(loadEndlessProgress(), summary);
    this.recorded = recorded;
    this.saveFailed = !recorded.duplicate && !saveEndlessProgress(recorded.next);
    if (this.saveFailed) reportError(new Error('Endless record save failed'), { context: { elapsedMs: summary.elapsedMs } });
    breadcrumb('endless finished', { elapsedMs: summary.elapsedMs, vignettes: summary.vignettes, best: recorded.newBest });
    track('endless_finished', { elapsed_sec: Math.floor(summary.elapsedMs / 1000), vignettes: summary.vignettes, peak_bpm: summary.peakBpm, best: recorded.newBest ? 1 : 0, reason: 'game_over' });
    // Local first, then the services: the result never waits on either, and a failed save
    // sends nothing that the next launch could not find.
    if (!this.saveFailed) {
      void recordEndlessScore(summary.elapsedMs).then(outcome => {
        if (this.disposed) return;
        this.postingNote = endlessSubmissionCopy(outcome);
        if (this.plaqueShown) this.dressPlaque();
      });
      void syncAchievements(loadProgress(), recorded.record);
    }
  }

  /**
   * The run stops being a ranked run, once. Nothing is recorded or sent: the plaque says
   * so, and offers another go. A reason that arrives after the run is already over — the
   * player backgrounding the result — changes nothing.
   */
  private invalidate(reason: AbandonReason): void {
    // Nothing has started under the first visit's hint, so there is nothing to invalidate.
    if (this.disposed || this.invalid !== null || this.over || this.hint.open) return;
    this.invalid = reason;
    ++this.startRequest;
    this.starting = false;
    this.transition = null;
    this.nextStep = null;
    this.taps.reset();
    this.controller?.interrupt('Interrupted');
    this.audio?.cancel();
    this.audio?.music.stop();
    this.act?.vignette.pause();
    this.hideSheet();
    // Kept for the plaque only, greyed and unranked: nothing is recorded from it.
    this.stoppedMs = this.runStartSec > -Infinity ? Math.max(0, (this.now() - this.runStartSec) * 1000) : null;
    const elapsed = this.stoppedMs === null ? 0 : Math.floor(this.stoppedMs / 1000);
    breadcrumb('endless interrupted', { reason });
    track('endless_abandoned', { elapsed_sec: elapsed, vignettes: this.vignettesScored, reason });
    this.showPlaque();
  }

  // ---------------------------------------------------------------- input

  private handleTap(tap: Tap): void {
    if (this.blocked() || this.curtain.active) return;
    if (this.hint.open) { this.hint.tap(tap.x, tap.y, performance.now() / 1000); return; }
    const wall = performance.now() / 1000;
    if (this.sheetOpen) {
      if (this.keepRect.contains(tap.x, tap.y)) { this.press('keep', wall); this.hideSheet(); return; }
      if (this.leaveRect.contains(tap.x, tap.y)) { this.press('leave', wall); this.abandon(); return; }
      if (!this.sheetRect.contains(tap.x, tap.y)) this.hideSheet();
      return;
    }
    if (this.plaqueShown) {
      if (this.againRect.contains(tap.x, tap.y)) { this.press('again', wall); void this.start(); return; }
      if (this.mapRect.contains(tap.x, tap.y)) { this.press('map', wall); this.leaveRun(); return; }
      if (this.boardRect.width > 0 && this.boardRect.contains(tap.x, tap.y)) { this.press('board', wall); void this.openBoard(); return; }
      return;
    }
    const near = (at: { x: number; y: number }) => Math.abs(tap.x - at.x) < this.controlSize / 2 && Math.abs(tap.y - at.y) < this.controlSize / 2;
    if (near(this.muteAt)) {
      this.pressPuck('mute');
      if (this.audio) { toggleMute(this.audio); this.muted = this.audio.silent; }
      return;
    }
    if (near(this.mapAt)) {
      this.pressPuck('map');
      // Before the clock has started there is nothing to lose: straight back.
      if (this.runStartSec === -Infinity && !this.starting) { this.leaveRun(); return; }
      this.showSheet();
      return;
    }
    if (this.headline.text === 'Turn your phone upright' && !this.starting) { void this.start(); return; }
    if (!this.audio || !this.controller?.active) return;
    this.audio.clock.refresh();
    this.controller.tap(this.audio.clock.input(tap.timestamp), this.audio.context.currentTime, performance.now());
  }

  private press(what: 'again' | 'map' | 'board' | 'keep' | 'leave', wall: number): void {
    this.pressed = what;
    this.pressedAt = wall;
    this.pressDirty = true;
    vibrate('tap');
  }

  private pressPuck(key: 'map' | 'mute'): void {
    this.puckPressed = key;
    this.puckPressedAt = performance.now() / 1000;
    this.puckDirty = true;
  }

  /** The player chose to leave: not ranked, nothing recorded, straight to the map. */
  /**
   * Android's back in Endless is the map puck: before the run's clock has started it
   * leaves; during a run it asks first, on the same sheet, because leaving ends the run;
   * with the sheet up it is Keep playing; after the run, it goes to the map.
   */
  public handleBack(): boolean {
    if (this.disposed || this.curtain.active) return true;
    if (this.hint.back()) return true;
    if (this.sheetOpen) { this.hideSheet(); return true; }
    if (this.plaqueShown || this.over || this.invalid !== null) { this.leaveRun(); return true; }
    if (this.runStartSec === -Infinity && !this.starting) { this.leaveRun(); return true; }
    this.showSheet();
    return true;
  }

  private abandon(): void {
    if (this.over) { this.leaveRun(); return; }
    const elapsed = this.runStartSec > -Infinity ? Math.max(0, Math.floor(this.now() - this.runStartSec)) : 0;
    track('endless_abandoned', { elapsed_sec: elapsed, vignettes: this.vignettesScored, reason: 'user' });
    this.invalid = 'user';
    this.leaveRun();
  }

  /**
   * Back to the screen that opened Endless: the map, or the title screen when the run was
   * started from its Endless block. The loop goes back to rate 1 either way — the map
   * claims it as the shell bed (`musicBed.canReuseShell`), exactly as it does after a
   * level, and the title screen hushes it under its own theme.
   */
  private leaveRun(): void {
    if (this.curtain.active) return;
    ++this.startRequest;
    this.controller?.dispose();
    this.transition = null;
    this.audio?.cancel();
    this.audio?.music.setRate(1, this.audio.context.currentTime);
    this.curtain.cover(() => (this.returnTo === SceneKey.Menu
      ? this.scene.start(SceneKey.Menu)
      : this.scene.start(SceneKey.Map, { focus: loadProgress().unlocked })));
  }

  private async openBoard(): Promise<void> {
    if (this.boardBusy) return;
    this.boardBusy = true;
    try { await openEndlessLeaderboard(); } finally { this.boardBusy = false; }
  }

  // ---------------------------------------------------------------- drawing

  public override update(): void {
    if (this.disposed) return;
    this.tick();
    const now = this.now();
    const still = this.reducedMotion;
    this.hint.update(performance.now() / 1000, still);
    this.act?.vignette.update(now);
    const slide = this.transition;
    if (slide && this.act && now >= slide.slide && now < slide.next) {
      const p = slide.swapped ? (now - slide.swap) / (slide.next - slide.swap) : (now - slide.slide) / (slide.swap - slide.slide);
      this.act.vignette.translate(this.viewport.full.width * (slide.swapped ? 1 - easeOut(p) : -(Math.min(1, Math.max(0, p)) ** 3)));
    }
    if (!still && this.act) {
      const kick = punch(now - this.punchAt, 1, STYLE.current.exaggeration);
      if (kick !== 0) this.act.vignette.punch?.(kick * this.uiScale);
    }
    // The clock: the audio grid from the first downbeat, frozen on the fatal bar line.
    if (this.runStartSec > -Infinity) {
      const ms = this.over ? elapsedMs(this.runStartSec, this.runEndSec) : Math.max(0, (now - this.runStartSec) * 1000);
      this.showTime(ms);
    }
    const entry = still || this.headlineAt < 0 ? { rise: 0, alpha: 1 } : arrive(now - this.headlineAt, 0.4);
    const playing = this.controller?.active;
    const headlineSize = (playing ? 48 : 72) * this.uiScale;
    if (headlineSize !== this.headlineSize) { this.headlineSize = headlineSize; resize(this.headline, headlineSize, SHELL.cream); }
    this.headline.setAlpha(entry.alpha).setY(this.headlineY + entry.rise * 16 * this.uiScale);
    if (this.caption.text !== '') this.caption.setAlpha(entry.alpha);
    this.drawBeatTrack(now);
    const wall = performance.now() / 1000;
    const puckPress = pressAmount(wall, this.puckPressedAt);
    if (puckPress > 0.001 || this.puckDirty) {
      this.drawChrome(this.uiScale, Math.max(0, puckPress));
      this.puckDirty = puckPress > 0.001;
      if (!this.puckDirty) this.puckPressed = null;
    }
    const press = pressAmount(wall, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      if (this.sheetOpen) this.drawSheet(Math.max(0, press));
      if (this.plaqueShown) this.drawPlaque(Math.max(0, press));
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    }
    if (this.plaqueShown && !still && this.plaque.alpha < 1) {
      const rise = arrive(wall - this.plaqueAt, 0.4);
      for (const [part, alpha] of this.plaqueParts()) part.setAlpha(rise.alpha * alpha);
    }
    this.words.pose(now, still);
    if (this.over && !this.plaqueShown && now >= this.finishUnlock) this.showPlaque();
  }

  private showTime(ms: number): void {
    const text = formatSurvival(ms);
    if (text === this.timeShown) return;
    this.timeShown = text;
    this.timeText.setText(text);
  }

  private changeHeadline(text: string): void {
    if (this.headline.text === text) return;
    this.headlineAt = this.now();
    this.headline.setText(text).setAlpha(0).setY(this.headlineY + 16 * this.uiScale);
  }

  private setCaption(text: string): void {
    if (this.caption.text === text) return;
    this.caption.setText(text).setAlpha(text === '' ? 0 : 1);
  }

  private drawChrome(s: number, press: number): void {
    const g = this.chrome.clear();
    const sinkOf = (key: 'map' | 'mute') => (this.puckPressed === key ? press : 0);
    drawPuck(g, this.mapAt.x, this.mapAt.y, s, sinkOf('map'));
    drawPuck(g, this.muteAt.x, this.muteAt.y, s, sinkOf('mute'));
    const r = CHROME.puckRadius * s;
    drawMap(g, this.mapAt.x, this.mapAt.y + puckSink(s, sinkOf('map')), r * 0.42, PALETTE.ink);
    drawSpeaker(g, this.muteAt.x, this.muteAt.y + puckSink(s, sinkOf('mute')), r * 0.5, PALETTE.ink, this.muted);
  }

  /**
   * Groove Lives: three notes in a row under the clock. A held life is a filled coral
   * note; a lost one its hollow seat — a shape as well as a colour, so the count reads
   * without the hue. Drawn when they change, not per frame.
   */
  private drawLives(): void {
    const s = this.uiScale, { safe } = this.viewport;
    const g = this.livesMark.clear();
    const y = safe.top + 150 * s;
    const gap = 46 * s, r = 15 * s;
    for (let i = 0; i < ENDLESS.lives.max; i++) {
      const x = safe.centerX + (i - (ENDLESS.lives.max - 1) / 2) * gap;
      const held = i < this.lives.lives;
      if (held) {
        g.fillStyle(shade(PALETTE.coral, -0.5), 1).fillCircle(x, y + 2.5 * s, r);
        g.fillStyle(PALETTE.coral, 1).fillCircle(x, y, r);
        drawNote(g, x, y, r * 0.55, SHELL.cream);
      } else {
        g.lineStyle(Math.max(1.5, STYLE.current.outline * s * 0.45), PALETTE.muted, 0.8).strokeCircle(x, y, r);
        drawNote(g, x, y, r * 0.55, PALETTE.muted, 0.5);
      }
    }
  }

  private beads(count = this.outcomes.length): { readonly centres: readonly number[]; readonly radius: number } {
    return trackGeometry(count, this.trackWidth, TRACK.beadGap * this.blockS, TRACK.beadRadius * this.blockS);
  }

  /** The turn block, as a level draws it: the plan's own times, nothing kept. */
  private drawBeatTrack(now: number): void {
    const g = this.marks.clear();
    const phase = this.controller?.phase;
    if (!phase || phase === 'idle' || phase === 'paused' || this.plaqueShown) {
      this.roomDim.setAlpha(0);
      this.words.settle();
      return;
    }
    const { safe } = this.viewport;
    // Everything on the block is drawn at the block's scale; only the frame's margin is the scene's.
    const s = this.blockS;
    const still = this.reducedMotion;
    const plan = this.controller?.plan ?? null;
    const marks = this.outcomes;
    const { centres, radius } = this.beads(marks.length);
    const turn = handover(plan, now);
    const background = this.cameras.main.backgroundColor;
    const paper = background.alpha === 0 ? PALETTE.paper : background.color;
    if (paper !== this.roomPaper) { this.roomPaper = paper; this.roomDim.setTint(shade(paper, -0.62)); }
    const rattle = still ? 0 : settle(now - this.extraAt, 90, 18) * 3 * s;
    const last = centres.at(-1) ?? 0;
    const span = last + radius + 34 * s;
    const beadSpan = last - (centres[0] ?? 0) + radius * 2;
    const width = Math.min(Math.max(span * 2, 220 * s, blockWidth(beadSpan, s)), safe.width - 48 * this.uiScale);
    const geo = blockGeometry(safe.centerX, this.trackY, width, s);
    drawBlock(g, geo, s, {
      centres, socketRadius: radius, played: beatsPlayed(plan, now), marks, turn,
      struck: { index: this.struckIndex, amount: still ? 0 : squash(now - this.struckAt, 0.22, 0.45), age: now - this.struckAt, perfect: this.struckPerfect },
      rattle, still, ghost: null, ink: this.ink, paper,
      landed: now - batonLanding(plan),
      flawless: this.words.flawlessAge(now),
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






  // ---------------------------------------------------------------- the leave sheet

  private showSheet(): void {
    if (this.sheetOpen || this.plaqueShown) return;
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

  // ---------------------------------------------------------------- the result plaque

  private showPlaque(): void {
    if (this.plaqueShown) return;
    this.plaqueShown = true;
    this.plaqueAt = performance.now() / 1000;
    // The run's grid has stopped; so does the click under it. The stems ring on.
    this.audio?.music.stopMetronome();
    this.hideSheet();
    this.words.reset();
    this.roomDim.setAlpha(0);
    this.changeHeadline('');
    this.setCaption('');
    // The plaque carries the run's time and its own ways on, so the HUD goes: its clock
    // kept counting under an interrupted run's plaque and disagreed with it, and its
    // pucks sat dimmed under the scrim taking no taps.
    this.setHud(false);
    for (const [part, alpha] of this.plaqueParts()) part.setAlpha(this.reducedMotion ? alpha : 0);
    this.dressPlaque();
  }

  private hidePlaque(): void {
    this.plaqueShown = false;
    this.plaque.clear().setVisible(false);
    this.againSurface.setVisible(false);
    for (const text of this.plaqueTexts()) text.setVisible(false);
    this.setHud(true);
  }

  private setHud(visible: boolean): void {
    for (const part of [this.timeText, this.tempoLabel, this.livesMark, this.chrome]) part.setVisible(visible);
  }

  private plaqueTexts(): Phaser.GameObjects.Text[] {
    return [this.plaqueEyebrow, this.plaqueTitle, this.plaqueTime, this.plaqueStats, this.plaqueBest, this.plaqueNote, this.againLabel, this.mapLabel, this.boardLabel];
  }

  /**
   * Every part of the plaque and the alpha it rests at. The cloth over Try again rests at
   * its tint's own alpha, which is what lets the block's play disc show through it: faded
   * up to 1 with the rest, it covered the disc.
   */
  private plaqueParts(): [{ setAlpha(value: number): unknown }, number][] {
    return [[this.plaque, 1], [this.againSurface, AGAIN_CLOTH_ALPHA], ...this.plaqueTexts().map(text => [text, 1] as [Phaser.GameObjects.Text, number])];
  }

  /** Size the plaque's words, measure them and stack the plaque (`planEndlessPlaque`). */
  private placePlaque(): void {
    const s = this.uiScale, { safe } = this.viewport;
    resize(this.plaqueEyebrow, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.plaqueTitle, 44 * s, PALETTE.ink);
    // An unranked run's time is the clock where it stopped, greyed: shown, never counted.
    resize(this.plaqueTime, 84 * s, this.invalid ? PALETTE.muted : PALETTE.ink);
    resize(this.plaqueStats, 24 * s, PALETTE.muted, STYLE.current, false);
    resize(this.plaqueBest, 22 * s, shade(BRASS, -0.62), STYLE.current, false);
    resize(this.plaqueNote, 21 * s, PALETTE.muted, STYLE.current, false);
    const width = Math.min(600 * s, safe.width - 40 * s);
    balanceWrap(this.plaqueNote, width - 72 * s);
    resize(this.againLabel, 36 * s, SHELL.cream);
    resize(this.mapLabel, 30 * s, SHELL.cream);
    resize(this.boardLabel, 22 * s, PALETTE.ink, STYLE.current, false);
    const height = (text: Phaser.GameObjects.Text) => (text.text === '' ? 0 : text.displayHeight);
    const plan = planEndlessPlaque({
      s, safe, controlSize: this.controlSize,
      board: endlessLeaderboardOffered() && this.invalid === null,
      rows: {
        eyebrow: height(this.plaqueEyebrow), title: height(this.plaqueTitle), time: height(this.plaqueTime),
        stats: height(this.plaqueStats), best: height(this.plaqueBest), note: height(this.plaqueNote),
      },
    });
    const setRect = (rect: Phaser.Geom.Rectangle, frame: PlaqueFrame | null) => rect.setTo(frame?.x ?? 0, frame?.y ?? 0, frame?.width ?? 0, frame?.height ?? 0);
    setRect(this.againRect, plan.again);
    setRect(this.mapRect, plan.exit);
    setRect(this.boardRect, plan.board);
    this.plaqueFrame = { x: plan.frame.x, y: plan.frame.y, w: plan.frame.width, h: plan.frame.height };
    this.plaqueTops = plan.tops;
    if (this.plaqueShown) this.drawPlaque(0);
  }

  private plaqueFrame = { x: 0, y: 0, w: 0, h: 0 };
  private plaqueTops: { readonly [row: string]: number | null } = {};

  /** The words on the plaque, from the run's facts; set when it opens, and again when a posting lands. */
  private dressPlaque(): void {
    const invalid = this.invalid;
    const ms = this.runStartSec > -Infinity && this.runEndSec > -Infinity ? elapsedMs(this.runStartSec, this.runEndSec) : null;
    this.plaqueTitle.setText(invalid ? 'Run interrupted' : 'Out of lives');
    // No time row at all for a run whose clock never started, rather than a dash at 84 units.
    const shown = invalid ? this.stoppedMs : ms ?? 0;
    this.plaqueTime.setText(shown === null ? '' : formatSurvival(shown, true));
    const acts = `${this.vignettesScored} ${this.vignettesScored === 1 ? 'act' : 'acts'}`;
    this.plaqueStats.setText(invalid ? `${acts} · not ranked` : `${acts} · peak ${this.peakBpm} BPM`);
    const recorded = this.recorded;
    if (invalid) {
      this.plaqueBest.setText('');
      this.plaqueNote.setText(invalid === 'orientation' ? 'The run stopped when the phone turned. Nothing was recorded.'
        : invalid === 'audio' ? 'Sound could not start. Nothing was recorded.'
          : 'The run was interrupted, so it is not ranked. Nothing was recorded.');
    } else {
      this.plaqueBest.setText(!recorded ? '' : this.saveFailed ? 'Couldn’t save this run' : recorded.newBest ? 'New best' : `Best ${formatSurvival(recorded.record.bestMs, true)}`);
      const badges = (recorded?.newMilestones ?? []).map(id => MILESTONES.find(m => m.id === id)?.sec).filter((sec): sec is number => sec !== undefined)
        .map(sec => `${sec / 60} min`);
      const lines = [];
      if (badges.length > 0) lines.push(`New badge: ${badges.join(', ')}`);
      if (this.postingNote !== '') lines.push(this.postingNote);
      this.plaqueNote.setText(lines.join('\n'));
    }
    if (this.plaqueShown) this.placePlaque();
  }

  private drawPlaque(press: number): void {
    const s = this.uiScale;
    const { x, y, w, h } = this.plaqueFrame;
    const g = this.plaque.clear().setVisible(true);
    g.fillStyle(0x1a201c, 0.45).fillRect(this.viewport.full.x, this.viewport.full.y, this.viewport.full.width, this.viewport.full.height);
    drawPanel(g, new Rect(x, y, w, h), s, { fill: SHELL.cream, depth: 12, radius: 32, hero: true });
    const centerX = x + w / 2;
    const rows: [Phaser.GameObjects.Text, number | null | undefined][] = [
      [this.plaqueEyebrow, this.plaqueTops.eyebrow], [this.plaqueTitle, this.plaqueTops.title], [this.plaqueTime, this.plaqueTops.time],
      [this.plaqueStats, this.plaqueTops.stats], [this.plaqueBest, this.plaqueTops.best], [this.plaqueNote, this.plaqueTops.note],
    ];
    for (const [text, top] of rows) {
      if (top === null || top === undefined) text.setVisible(false);
      else text.setPosition(centerX, top).setVisible(true);
    }
    // The mark beside the words it belongs to, not out at the plaque's corner.
    const eyebrowTop = this.plaqueTops.eyebrow;
    if (eyebrowTop !== null && eyebrowTop !== undefined) {
      drawInfinity(g, centerX - this.plaqueEyebrow.displayWidth / 2 - 26 * s, eyebrowTop + this.plaqueEyebrow.displayHeight / 2, 14 * s, PALETTE.coral);
    }
    const againPress = this.pressed === 'again' ? press : 0, mapPress = this.pressed === 'map' ? press : 0, boardPress = this.pressed === 'board' ? press : 0;
    drawPanel(g, this.againRect, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: againPress, hero: true });
    placeSurface(this.againSurface.setVisible(true), this.againRect, s, CHROME.block.depth * s * againPress * 0.8);
    const sink = CHROME.block.depth * s * againPress * 0.8;
    const span = this.againLabel.width + 60 * s;
    this.againLabel.setPosition(this.againRect.centerX - span / 2 + this.againLabel.width / 2, this.againRect.centerY + sink).setVisible(true);
    drawActionDisc(g, this.againRect.centerX + span / 2 - 22 * s, this.againRect.centerY + sink, 22 * s, s);
    drawPanel(g, this.mapRect, s, { fill: SHELL.wood, depth: 12, press: mapPress });
    this.mapLabel.setPosition(this.mapRect.centerX, this.mapRect.centerY + 12 * s * mapPress * 0.8).setVisible(true);
    if (this.boardRect.width > 0) {
      drawPanel(g, this.boardRect, s, { fill: SHELL.puck, depth: 8, press: boardPress });
      this.boardLabel.setPosition(this.boardRect.centerX, this.boardRect.centerY + 8 * s * boardPress * 0.8).setVisible(true);
    } else this.boardLabel.setVisible(false);
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
    this.act?.vignette.destroy();
    this.act = null;
    this.fx.destroy();
    this.sounds.clear();
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
