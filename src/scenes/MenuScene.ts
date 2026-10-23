import Phaser from 'phaser';
import { setMusicBed } from '@/audio/musicBed';
import { currentAudio, hushMusic, outputSilent, sharedAudio, shellTrack, stopTheme, toggleMute } from '@/audio/sharedAudio';
import { createImpactBuffers } from '@/audio/hammerSounds';
import { samples } from '@/audio/samples';
import { DAILY_TEMPO_AVAILABLE } from '@/config/dailyTempo';
import { ENDLESS } from '@/config/endless';
import { MUSIC, THEME } from '@/config/music';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { TapInput, type Tap } from '@/input/TapInput';
import { tutorialComplete, tutorialSeen } from '@/game/TutorialRun';
import { todaysRewards } from '@/game/dailyRewards';
import { endlessUnlocked } from '@/game/endless';
import { endlessRecord, loadEndlessProgress, markEndlessUnlockSeen, saveEndlessProgress } from '@/game/endlessProgress';
import { track } from '@/monetization/analytics';
import { endlessLeaderboardOffered, openEndlessLeaderboard } from '@/playgames/endless';
import { loadProgress, markPuckSeen, seenPuck, seenScrapbook, seenScreenHint } from '@/game/progress';
import { ownedKeepsakes } from '@/game/scrapbook';
import { MaterialKey } from '@/textures/materials';
import { BakedLayer, bakeOne } from '@/ui/bakedLayer';
import { shade } from '@/ui/colour';
import { CHROME, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { drawGear } from '@/ui/gear';
import { drawBook, drawChecklist, drawInfinity, drawPlay, drawSpeaker, drawSun } from '@/ui/icons';
import { EndlessCard } from '@/ui/endlessCard';
import { doneCount, loadObjectives, markObjectivesSeen, objectiveContext, unseenDone, type ObjectivesState } from '@/game/objectives';
import { ObjectivesCard } from '@/ui/objectivesCard';
import { menuRow } from '@/ui/menuRow';
import { drawStar, drawStarSeat, STAR_PRIZE } from '@/ui/star';
import { faces } from '@/ui/light';
import { drawPanel, placeSurface, surface } from '@/ui/panel';
import { PuckLabel } from '@/ui/puckLabel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { barPose, pulseAt, type Pulse } from '@/ui/musicPulse';
import { arrive, settle } from '@/ui/spring';
import { display, resize } from '@/ui/type';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';

const MENU = {
  sign: { width: 560, height: 328, top: 110, ropeInset: 150 },
  /**
   * The row over Play holds at most two blocks (`ui/menuRow.ts`): Daily Tempo first, then
   * Endless once it opens or How to play until the lesson is passed; the row is widened for
   * two only as far as keeps it clear of the objectives puck on its left.
   */
  /** One bead a beat, a bar across the sign: the theme's own 4/4. */
  dots: 4,
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
  private illustration!: HammerNailVignette;
  /** The bar the hammer last struck, and whether that count came from the theme. */
  private struckBar = 0;
  private struckOnMusic = false;
  /** The hammer's hit, synthesized once per AudioContext for the knock a stray tap lands. */
  private knockVoice: { context: AudioContext; buffer: AudioBuffer } | null = null;
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
  /**
   * Endless Mode's block, beside How to play once level 100 is cleared: the title screen
   * is where a player who has finished the road comes back to, and the map's puck alone
   * left the mode one screen and a scroll away from it.
   */
  private endlessButton!: Phaser.GameObjects.Graphics;
  private endlessSurface!: Phaser.GameObjects.TileSprite;
  private endlessLabel!: Phaser.GameObjects.Text;
  private endlessRect = new Phaser.Geom.Rectangle();
  private endlessCard!: EndlessCard;
  /** Read on entry: the mode is shipped and the save has cleared its level. */
  private endlessOpen = false;
  /**
   * Daily Tempo's block, first on the row whenever the mode is shipped: the thing that is
   * new every day, with today's stars on a chip and a coral dot until the day has had a run.
   * It opens the Daily card, whose Play is the audio gesture, so the theme carries on.
   */
  private dailyButton!: Phaser.GameObjects.Graphics;
  private dailySurface!: Phaser.GameObjects.TileSprite;
  private dailyLabel!: Phaser.GameObjects.Text;
  private dailyRect = new Phaser.Geom.Rectangle();
  private dailyOpen = false;
  private dailyStars: 0 | 1 | 2 | 3 = 0;
  private dailyDot = false;
  /**
   * How to play keeps its block until the lesson has been passed; after that it lives in
   * Settings → Help and the row is Endless's or nobody's, so nothing competes with Play.
   * A skip keeps it here: that player has not had the lesson and may still want it.
   */
  private lessonOnMenu = true;
  /** First-visit labels on the two pucks whose icons say least, until each has been opened. */
  private bookLabel!: PuckLabel;
  private objectivesLabel!: PuckLabel;
  /** A coral dot until the card has been opened once, on this screen or the map's. */
  private endlessDot = false;
  private endlessBoardBusy = false;
  private pucks!: Phaser.GameObjects.Graphics;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private enteredAt = 0;
  private uiScale = 1;
  /**
   * The block, the "How to play" plank and the pucks: static between presses, so each is a
   * raster at rest (`ui/bakedLayer.ts`) rather than ~5,000 commands tessellated a frame.
   * The sign is not: it drifts on its ropes all the time, and a raster turned every frame
   * would be resampled every frame.
   */
  private layers: BakedLayer[] = [];
  private primed = false;
  private ceilingY = 0;
  private buttonRect = new Phaser.Geom.Rectangle();
  private boardRect = new Phaser.Geom.Rectangle();
  private controlSize = 96;
  private muteAt = { x: 0, y: 0 };
  private setupAt = { x: 0, y: 0 };
  /** The Scrapbook, top left: the right-hand corner is the sign's rope at full swing. */
  private bookAt = { x: 0, y: 0 };
  /** A coral dot on the book while it holds keepsakes the player has never opened it to see. */
  private bookDot = false;
  /** Today's objectives, beside How to play: near the thumb and clear of the sign's swing. */
  private objectivesAt = { x: 0, y: 0 };
  private objectives!: ObjectivesState;
  private objectivesCard!: ObjectivesCard;
  private beadRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private pressedAt = -Infinity;
  private pressDirty = false;
  private puckPressed: 'mute' | 'setup' | 'book' | 'objectives' | 'endless' | 'daily' | null = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  private muted = false;
  private busy = false;
  private disposed = false;
  /** Leaving for a screen that plays the theme on, so shutting down must not stop it. */
  private keepTheme = false;
  private request = 0;

  public constructor() { super(SceneKey.Menu); }

  protected override build(): void {
    this.disposed = false;
    this.keepTheme = false;
    this.busy = false;
    this.pressedAt = this.puckPressedAt = -Infinity;
    this.puckPressed = null;
    this.knockVoice = null;
    this.muted = outputSilent(this);
    // Read, not stored: a player whose old save already three-starred a keepsake's level
    // sees the dot on their first launch after the Scrapbook shipped, and never again once
    // they have looked.
    this.bookDot = !seenScrapbook() && ownedKeepsakes(loadProgress()).length > 0;
    // Read on every entry, so a set that turned over at midnight is today's on the way back.
    this.objectives = loadObjectives(Date.now(), objectiveContext(loadProgress()));
    this.endlessOpen = ENDLESS.available && endlessUnlocked(loadProgress());
    this.lessonOnMenu = !(this.registry.get('tutorial-complete') === true || tutorialComplete());
    // Today's record, read on every entry: the chart turns over on the Daily Tempo day.
    this.dailyOpen = DAILY_TEMPO_AVAILABLE;
    const today = todaysRewards();
    this.dailyStars = today?.bestStars ?? 0;
    this.dailyDot = this.dailyOpen && (today?.runs ?? 0) === 0;
    this.bookLabel = new PuckLabel(this, 'Scrapbook', 20);
    this.objectivesLabel = new PuckLabel(this, 'Objectives', 20);
    this.endlessDot = this.endlessOpen && !loadEndlessProgress().seenUnlock;
    this.endlessBoardBusy = false;
    // The hammer's idle sway doubles as the title illustration; it never receives a plan.
    this.illustration = new HammerNailVignette(this, true);
    this.struckBar = Number.NaN;
    this.struckOnMusic = false;

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
    this.endlessButton = this.add.graphics().setVisible(this.endlessOpen);
    this.endlessSurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.wood, 0.7).setVisible(this.endlessOpen);
    this.endlessLabel = display(this, 'Endless', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setVisible(this.endlessOpen);
    this.dailyButton = this.add.graphics().setVisible(this.dailyOpen);
    this.dailySurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.wood, 0.7).setVisible(this.dailyOpen);
    this.dailyLabel = display(this, 'Daily Tempo', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setVisible(this.dailyOpen);
    this.pucks = this.add.graphics();
    this.layers = [this.button, this.tutorialButton, this.pucks, this.endlessButton, this.dailyButton].map(graphics => new BakedLayer(this, graphics));
    this.primed = false;
    this.objectivesCard = new ObjectivesCard(this);
    this.endlessCard = new EndlessCard(this, 30);

    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.enteredAt = performance.now() / 1000;
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => { this.curtain.reveal(); this.openTheme(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    const s = this.uiScale = Math.min(safe.width / 720, safe.height / 1150);
    // The raised hammer stays under the sign's foot, with room for the sign to swing.
    this.illustration.layout(this.viewport, undefined, safe.top + (MENU.sign.top + MENU.sign.height + 36) * s);

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
    this.bookAt = { x: safe.left + 56 * s, y: this.muteAt.y };
    this.puckDirty = true;

    // The block sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(CHROME.block.height * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - CHROME.block.width * s / 2, safe.bottom - CHROME.block.fromBottom * s - height, CHROME.block.width * s, height);
    this.drawButton(0, s);
    resize(this.playLabel, 40 * s, SHELL.cream);
    const rowY = this.buttonRect.y - this.controlSize - 24 * s;
    const row = menuRow({ daily: this.dailyOpen, endless: this.endlessOpen, lesson: this.lessonOnMenu }, safe.centerX, rowY, this.controlSize, s);
    const setRect = (rect: Phaser.Geom.Rectangle, frame: { x: number; y: number; width: number; height: number } | null) =>
      rect.setTo(frame?.x ?? 0, frame?.y ?? 0, frame?.width ?? 0, frame?.height ?? 0);
    setRect(this.tutorialRect, row.lesson);
    setRect(this.endlessRect, row.endless);
    setRect(this.dailyRect, row.daily);
    const lessonShown = row.lesson !== null;
    this.tutorialButton.clear();
    if (lessonShown) drawPanel(this.tutorialButton, this.tutorialRect, s, { fill: SHELL.wood, depth: 8 });
    this.layers[1]!.invalidate();
    this.tutorialSurface.setVisible(lessonShown);
    this.tutorialLabel.setVisible(lessonShown);
    placeSurface(this.tutorialSurface, this.tutorialRect, s);
    this.tutorialLabel.setPosition(this.tutorialRect.centerX, this.tutorialRect.centerY);
    resize(this.tutorialLabel, row.labelSize * s, SHELL.cream);
    if (this.endlessOpen) {
      placeSurface(this.endlessSurface, this.endlessRect, s);
      resize(this.endlessLabel, row.labelSize * s, SHELL.cream);
    }
    if (this.dailyOpen) {
      placeSurface(this.dailySurface, this.dailyRect, s);
      // The word shortens beside a second block, as the mock has it: "Daily" and its stars.
      this.dailyLabel.setText(row.blocks.length === 2 ? 'Daily' : 'Daily Tempo');
      resize(this.dailyLabel, row.labelSize * s, SHELL.cream);
    }
    // The objectives puck keeps the row's line whether or not the row has a block on it.
    this.objectivesAt = { x: safe.left + 56 * s, y: rowY + this.controlSize / 2 };
    this.drawPucks(s, 0);
    this.placeLabels(s);
    this.objectivesCard.layout(safe, full, s);
    this.endlessCard.layout(safe, full, s);
    // The first layout is under the curtain: rasterise now rather than on the reveal's frames.
    if (!this.primed) {
      this.primed = true;
      for (const layer of this.layers) layer.bake();
    }
  }

  /**
   * The pucks' first-visit labels. The objectives' tag goes right of its puck when the row
   * beside it is empty and over it when a block stands there, so it never sits on a control.
   */
  private placeLabels(s: number): void {
    const r = CHROME.puckRadius * s;
    this.bookLabel.place(this.bookAt.x, this.bookAt.y, r, 'below', s, !seenScreenHint('scrapbook'));
    const rowTaken = this.lessonOnMenu || this.endlessOpen || this.dailyOpen;
    this.objectivesLabel.place(this.objectivesAt.x, this.objectivesAt.y, r, rowTaken ? 'above' : 'right', s, !seenPuck('objectives'));
  }

  private drawPucks(s: number, press: number): void {
    const g = this.pucks.clear();
    const sinkOf = (key: 'mute' | 'setup' | 'book' | 'objectives' | 'endless' | 'daily') => (this.puckPressed === key ? press : 0);
    this.drawEndless(s, sinkOf('endless'));
    this.drawDaily(s, sinkOf('daily'));
    drawPuck(g, this.muteAt.x, this.muteAt.y, s, sinkOf('mute'));
    drawPuck(g, this.setupAt.x, this.setupAt.y, s, sinkOf('setup'));
    drawPuck(g, this.bookAt.x, this.bookAt.y, s, sinkOf('book'));
    const r = CHROME.puckRadius * s;
    drawBook(g, this.bookAt.x, this.bookAt.y + puckSink(s, sinkOf('book')), r * 0.56, PALETTE.ink, 1);
    if (this.bookDot) {
      const dx = this.bookAt.x + r * 0.72, dy = this.bookAt.y - r * 0.72 + puckSink(s, sinkOf('book'));
      g.fillStyle(PALETTE.coral, 1).fillCircle(dx, dy, 9 * s);
      g.lineStyle(3 * s, SHELL.cream, 1).strokeCircle(dx, dy, 9 * s);
    }
    drawSpeaker(g, this.muteAt.x, this.muteAt.y + puckSink(s, sinkOf('mute')), r * 0.5, PALETTE.ink, this.muted);
    if (this.objectivesAt.x !== 0) {
      const oy = this.objectivesAt.y + puckSink(s, sinkOf('objectives'));
      drawPuck(g, this.objectivesAt.x, this.objectivesAt.y, s, sinkOf('objectives'));
      drawChecklist(g, this.objectivesAt.x, oy, r * 0.5, PALETTE.ink, doneCount(this.objectives), STAR_PRIZE);
      if (unseenDone(this.objectives)) {
        const dx = this.objectivesAt.x + r * 0.72, dy = oy - r * 0.72;
        g.fillStyle(PALETTE.coral, 1).fillCircle(dx, dy, 9 * s);
        g.lineStyle(3 * s, SHELL.cream, 1).strokeCircle(dx, dy, 9 * s);
      }
    }
    drawGear(g, this.setupAt.x, this.setupAt.y + puckSink(s, sinkOf('setup')), r * 0.52, PALETTE.ink, 1);
    this.layers[2]?.invalidate();
  }

  /**
   * The sun, the word and a chip of today's stars centred together on the block, with a
   * coral dot on its corner until the day has had a run.
   */
  private drawDaily(s: number, press: number): void {
    if (!this.dailyOpen) return;
    const g = this.dailyButton.clear();
    const r = this.dailyRect;
    drawPanel(g, r, s, { fill: SHELL.wood, depth: 8, press });
    const sink = 8 * s * press * 0.8;
    placeSurface(this.dailySurface, r, s, sink);
    const glyph = 16 * s, gap = 10 * s;
    const chipW = 92 * s, chipH = 34 * s;
    const span = glyph * 2 + gap + this.dailyLabel.displayWidth + gap + chipW;
    const left = r.centerX - span / 2;
    drawSun(g, left + glyph, r.centerY + sink, glyph * 0.8, SHELL.cream);
    this.dailyLabel.setPosition(left + glyph * 2 + gap + this.dailyLabel.displayWidth / 2, r.centerY + sink);
    // Today's stars on a cream chip: brass where earned, hollow seats where not.
    const cx = left + span - chipW / 2, cy = r.centerY + sink;
    g.fillStyle(shade(SHELL.cream, -0.1), 1).fillRoundedRect(cx - chipW / 2, cy - chipH / 2 + 2 * s, chipW, chipH, chipH / 2);
    g.fillStyle(SHELL.cream, 1).fillRoundedRect(cx - chipW / 2, cy - chipH / 2, chipW, chipH, chipH / 2);
    for (let i = 0; i < 3; i++) {
      const sx = cx + (i - 1) * 24 * s;
      if (i < this.dailyStars) drawStar(g, sx, cy, 9 * s, STAR_PRIZE);
      else drawStarSeat(g, sx, cy, 9 * s, shade(SHELL.cream, -0.08), shade(SHELL.cream, -0.4));
    }
    if (this.dailyDot) {
      const dx = r.right - 10 * s, dy = r.y + 10 * s + sink;
      g.fillStyle(PALETTE.coral, 1).fillCircle(dx, dy, 9 * s);
      g.lineStyle(3 * s, SHELL.cream, 1).strokeCircle(dx, dy, 9 * s);
    }
    this.layers[4]?.invalidate();
  }

  /** The infinity and the word centred together on the block, with the unseen dot on its corner. */
  private drawEndless(s: number, press: number): void {
    if (!this.endlessOpen) return;
    const g = this.endlessButton.clear();
    const r = this.endlessRect;
    drawPanel(g, r, s, { fill: SHELL.wood, depth: 8, press });
    const sink = 8 * s * press * 0.8;
    placeSurface(this.endlessSurface, r, s, sink);
    const glyph = 18 * s, gap = 12 * s;
    const span = glyph * 2 + gap + this.endlessLabel.displayWidth;
    const left = r.centerX - span / 2;
    drawInfinity(g, left + glyph, r.centerY + sink, glyph, SHELL.cream);
    this.endlessLabel.setPosition(left + glyph * 2 + gap + this.endlessLabel.displayWidth / 2, r.centerY + sink);
    if (this.endlessDot) {
      const dx = r.right - 10 * s, dy = r.y + 10 * s + sink;
      g.fillStyle(PALETTE.coral, 1).fillCircle(dx, dy, 9 * s);
      g.lineStyle(3 * s, SHELL.cream, 1).strokeCircle(dx, dy, 9 * s);
    }
    this.layers[3]?.invalidate();
  }

  /** The block sinks on the tap and springs back: one press, one rebound, then still. */
  private drawButton(press: number, s: number): void {
    const g = this.button.clear();
    const r = this.buttonRect;
    drawPanel(g, r, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press, hero: true });
    const sink = CHROME.block.depth * s * press * 0.8;
    placeSurface(this.buttonSurface, r, s, sink);
    // The label sits right of centre by half the icon group, so icon and word together are centred on the block.
    const labelX = r.centerX + 28 * s;
    this.playLabel.setPosition(labelX, r.centerY + sink);
    const iconX = labelX - this.playLabel.displayWidth / 2 - 34 * s;
    g.fillStyle(0x000000, 0.18).fillCircle(iconX, r.centerY + sink, 22 * s);
    drawPlay(g, iconX + 2 * s, r.centerY + sink, 12 * s, SHELL.cream);
    this.layers[0]?.invalidate();
  }

  /**
   * The theme's beat, from the heard clock and the theme's playhead, measured at 120 BPM
   * with its first downbeat on the music's start (`THEME.bpm`). The frame clock at that
   * tempo stands in before the theme sounds and when it fails to load, so the beads never
   * stop. A muted theme is still playing under a silent bus, and keeps the beat.
   */
  private themePulse(frameSec: number): Pulse {
    const audio = currentAudio(this);
    if (audio && audio.context.state === 'running' && audio.theme.playing) {
      audio.clock.refresh();
      const position = audio.theme.playheadAt(audio.clock.now());
      if (position !== null) return pulseAt(position, THEME.bpm, 1, frameSec);
    }
    return pulseAt(null, THEME.bpm, 1, frameSec);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    const still = reducedMotion();
    const pulse = this.themePulse(now);
    const bar = barPose(pulse, THEME.beatsPerBar);
    // The hammer plays beat 1 of every bar: it winds up into the next bar line and lands on
    // it. A change of source — the theme arriving, or stopping — moves the count without a
    // blow, so it never strikes off the beat it has just found. A slow frame strikes late but
    // dated on its bar line, so the recoil is already under way. Still under reduced motion.
    if (still) {
      this.illustration.coverBeat(null);
    } else {
      this.illustration.coverBeat(now + bar.untilBarSec);
      if (pulse.onMusic === this.struckOnMusic && bar.bar !== this.struckBar) this.illustration.beatStrike(now - bar.sinceBarSec);
    }
    this.struckBar = bar.bar;
    this.struckOnMusic = pulse.onMusic;
    this.illustration.update(now);
    this.objectivesCard.update(now, reducedMotion());
    this.endlessCard.update(now, reducedMotion());
    const s = this.uiScale;
    const t = STYLE.current;
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
    const beat = still ? 0 : bar.beatInBar % MENU.dots;
    const phase = still ? 0 : bar.phase;
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
    bakeOne(this.layers);
  }

  private handleTap(tap: Tap): void {
    if (this.curtain.active || this.busy) return;
    // An open card takes every tap: its Close, or anywhere off it, puts it away.
    if (this.objectivesCard.tap(tap.x, tap.y)) { this.puckDirty = true; return; }
    const endlessTap = this.endlessCard.tap(tap.x, tap.y);
    if (endlessTap !== null) {
      if (endlessTap === 'start') void this.startEndless();
      else if (endlessTap === 'leaderboard') void this.openEndlessBoard();
      return;
    }
    if (this.dailyOpen && Phaser.Geom.Rectangle.Contains(this.dailyRect, tap.x, tap.y)) {
      this.puckPressed = 'daily';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      vibrate('tap');
      this.openDaily();
      return;
    }
    if (this.endlessOpen && Phaser.Geom.Rectangle.Contains(this.endlessRect, tap.x, tap.y)) {
      this.puckPressed = 'endless';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      vibrate('tap');
      this.showEndlessCard();
      this.openTheme();
      return;
    }
    const half = this.controlSize / 2;
    if (Math.abs(tap.x - this.objectivesAt.x) < half && Math.abs(tap.y - this.objectivesAt.y) < half) {
      this.puckPressed = 'objectives';
      this.puckPressedAt = performance.now() / 1000;
      this.objectives = markObjectivesSeen(Date.now(), objectiveContext(loadProgress()));
      this.puckDirty = true;
      markPuckSeen('objectives');
      this.placeLabels(this.uiScale);
      this.objectivesCard.show(this.objectives, Date.now(), performance.now() / 1000);
      this.openTheme();
      return;
    }
    if (Math.abs(tap.x - this.muteAt.x) < half && Math.abs(tap.y - this.muteAt.y) < half) {
      toggleMute(sharedAudio(this));
      this.muted = outputSilent(this);
      this.puckPressed = 'mute';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      // Unmuting on the title screen should leave something to hear, and this tap is
      // itself the gesture a cold start was missing.
      this.openTheme();
      return;
    }
    if (Math.abs(tap.x - this.setupAt.x) < half && Math.abs(tap.y - this.setupAt.y) < half) {
      this.puckPressed = 'setup';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      // Settings opened from here keeps the title theme: it plays on, uninterrupted.
      this.keepTheme = true;
      this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: SceneKey.Menu }));
      return;
    }
    if (Math.abs(tap.x - this.bookAt.x) < half && Math.abs(tap.y - this.bookAt.y) < half) {
      this.puckPressed = 'book';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      // So does the Scrapbook.
      this.keepTheme = true;
      this.curtain.cover(() => this.scene.start(SceneKey.Scrapbook, { from: SceneKey.Menu }));
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.buttonRect, tap.x, tap.y)) {
      this.pressedAt = performance.now() / 1000;
      this.pressDirty = true;
      void this.play();
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.tutorialRect, tap.x, tap.y)) { void this.play(true); return; }
    // Anything else is a tap that stays on the title screen: the hammer answers it. On a
    // cold start it is also the first gesture the page has had — which is all a browser
    // was waiting for.
    this.knock();
    this.openTheme();
  }
  /**
   * The title illustration answers a tap off every control with a blow on the nail.
   *
   * The blow is drawn at once, and its voice is the act's own hit through the engine's
   * effects bus, so the mute puck and the Effects level govern it like any voice in a
   * level. The voice is a stinger rather than `setSounds`: the engine's sound set belongs
   * to whichever level set it, and the menu has no business replacing it. On a cold start
   * the context is still suspended; a source started on a suspended context plays the
   * moment `openTheme`'s resume lands, so the first tap knocks late rather than silently.
   */
  private knock(): void {
    this.illustration.knock(performance.now() / 1000);
    vibrate('tap');
    const audio = sharedAudio(this);
    if (this.knockVoice?.context !== audio.context) {
      this.knockVoice = { context: audio.context, buffer: createImpactBuffers(audio.context).hit };
    }
    audio.playStinger(audio.context.currentTime, this.knockVoice.buffer, 0.65);
  }
  /**
   * Play the theme, if the platform will let us yet.
   *
   * On a return to the title screen the engine is already unlocked and this simply
   * starts. On a cold start there has been no gesture, so no audio may sound at all: the
   * attempt is silent, and the first tap on the menu tries again. Where a platform allows
   * playback without a gesture — a packaged WebView can — the unlock below succeeds and
   * the theme comes up on its own.
   */
  private openTheme(): void {
    if (!this.disposed && !this.busy) void this.wakeTheme();
  }

  /**
   * Bring the engine up far enough to sound, then play.
   *
   * Not `unlock()`: that races a three-second timeout, because it is called from a
   * gesture and a context that will not resume from one has genuinely failed. Here a
   * suspended context is the ordinary answer — a browser refuses audio until the page has
   * been touched — so the attempt is quiet and every tap on the menu asks again. Where
   * the platform does allow it, which a packaged WebView can, this is what lets the theme
   * come up on its own.
   *
   * This does construct the AudioContext before the PLAY gesture, which the menu used to
   * avoid. The reason it avoided it was that the mute puck must read a stored setting
   * rather than an engine — `outputSilent` still does, so that reason is intact, and a title
   * screen with a theme is a title screen that has something to do with a context.
   */
  private async wakeTheme(): Promise<void> {
    if (this.disposed || this.busy) return;
    const audio = sharedAudio(this);
    if (audio.context.state !== 'running') {
      try { await audio.context.resume(); } catch { return; }
    }
    // `busy` as well as `disposed`: a resume left pending from the title screen's own
    // create resolves the moment PLAY grants the gesture credit it was waiting for, and
    // that is precisely when the player is on their way out. Without this the theme
    // fetched 3.5 MB to start a track behind a closing curtain.
    if (this.disposed || this.busy || audio.context.state !== 'running') return;
    // The gameplay loop is the shell on the map and settings. Coming back to the title
    // with it still running is the overlap this screen used to ship: hush it, then the
    // theme is the only thing the menu plays. The hush is a fade, so starting the theme
    // on the same turn played both until the fade finished.
    await hushMusic(this, MUSIC.bedFadeSec);
    if (this.disposed || this.busy || audio.context.state !== 'running') return;
    await audio.theme.enter();
  }

  /**
   * Every way out stops the theme except the two that keep it: Settings and the Scrapbook
   * opened from here play it on (`ensureScreenMusic`), and the screen they open decides.
   */
  private closeTheme(): void {
    stopTheme(currentAudio(this));
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
      const track = shellTrack();
      // A first Play opens the lesson until it has been passed or skipped; after either it
      // is the title screen's own button, never a gate in front of every Play.
      const needsTutorial = tutorial || !(this.registry.get('tutorial-complete') || this.registry.get('tutorial-seen') || tutorialSeen());
      if (needsTutorial) {
        // The lesson hushes the loop and plays none of it, so it does not wait for the
        // loop's stems: decoding them cost a first player most of ten seconds on "…" before
        // their first tap. The load runs under the lesson instead — decoding is off the main
        // thread — and the map's bed and level 1 wait on this same pending load if it has
        // not finished by then. A failure here is the map's to retry, not the lesson's.
        audio.music.load(track).catch(() => { /* The map's bed and the level load it again. */ });
      } else {
        await audio.music.load(track);
        if (this.disposed || request !== this.request) return;
        // The gameplay loop is the shell bed from here: start it on the tap that unlocked
        // audio, so the map and settings share it rather than each starting a copy. The
        // title theme is a second track and leaves on closeTheme below.
        await setMusicBed(audio, 'shell', { track });
        if (this.disposed || request !== this.request) return;
      }
      // Warmed here and awaited where it is used. The map is several taps from a level,
      // which is long enough to decode 180 KB without anyone waiting on it.
      void samples.load(audio.context);
      this.playLabel.setText('Play');
      this.closeTheme();
      // Which door the lesson was entered by is the difference between a player who was
      // sent there and one who went looking; the tutorial's events carry it.
      const tutorialData = { source: tutorial ? 'menu' : 'first_play' } as const;
      this.curtain.cover(() => (needsTutorial ? this.scene.start(SceneKey.Tutorial, tutorialData) : this.scene.start(SceneKey.Map)));
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.playLabel.setText('Retry');
      console.error('Unable to prepare music', error);
    }
  }
  /**
   * The same card the map's Endless puck opens, so the mode reads the same from either
   * door: the best, the badges, Start and the leaderboard. Opening it is what marks the
   * unlock seen, on this screen as on the map.
   */
  private showEndlessCard(): void {
    const progress = loadProgress();
    const unlocked = endlessUnlocked(progress);
    const stored = loadEndlessProgress();
    const justUnlocked = unlocked && !stored.seenUnlock;
    if (justUnlocked) saveEndlessProgress(markEndlessUnlockSeen(stored));
    this.endlessDot = false;
    this.puckDirty = true;
    track('endless_opened', { unlocked: unlocked ? 1 : 0 });
    this.endlessCard.show({
      unlocked, cleared: Math.max(0, progress.unlocked - 1), record: endlessRecord(stored),
      leaderboard: endlessLeaderboardOffered(), justUnlocked,
    }, performance.now() / 1000);
  }

  /**
   * The Daily Tempo card. Its Play is the audio gesture, so nothing is unlocked here, and
   * the title theme carries on into the card as it does into Settings (`ensureScreenMusic`).
   */
  private openDaily(): void {
    if (this.busy || this.curtain.active) return;
    this.keepTheme = true;
    this.curtain.cover(() => this.scene.start(SceneKey.Daily, { from: SceneKey.Menu }));
  }

  /**
   * Start, from the card. The tap is the gesture the engine's unlock needs, so it is asked
   * here; a refusal still goes on, because Endless asks again and says so on its plaque,
   * with Try again as the next gesture. The run's way out comes back to this screen.
   */
  private async startEndless(): Promise<void> {
    if (this.busy || this.curtain.active) return;
    const request = ++this.request;
    this.busy = true;
    try { await sharedAudio(this).unlock(); } catch { /* Endless asks again, and names the failure. */ }
    if (this.disposed || request !== this.request) return;
    this.closeTheme();
    this.curtain.cover(() => this.scene.start(SceneKey.Endless, { from: SceneKey.Menu }));
  }

  private async openEndlessBoard(): Promise<void> {
    if (this.endlessBoardBusy) return;
    this.endlessBoardBusy = true;
    try { await openEndlessLeaderboard(); } finally { this.endlessBoardBusy = false; }
  }

  /**
   * Android's back on the title screen: an open card is put away; otherwise nothing here
   * takes it, and the app goes to the background, which is what back on a root screen does
   * (`core/backButton.ts`).
   */
  public handleBack(): boolean {
    if (this.disposed || this.curtain.active) return true;
    if (this.objectivesCard.open) { this.objectivesCard.hide(); return true; }
    if (this.endlessCard.open) { this.endlessCard.hide(); return true; }
    return false;
  }

  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.request;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    if (!this.keepTheme) this.closeTheme();
    this.taps.dispose();
    this.illustration.destroy();
  }
}
