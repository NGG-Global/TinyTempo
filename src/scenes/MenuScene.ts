import Phaser from 'phaser';
import { setMusicBed } from '@/audio/musicBed';
import { arrangementForLevel } from '@/game/musicSelection';
import { currentAudio, hushMusic, isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { samples } from '@/audio/samples';
import { MUSIC } from '@/config/music';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { TapInput, type Tap } from '@/input/TapInput';
import { tutorialComplete } from '@/game/TutorialRun';
import { loadProgress, seenScrapbook } from '@/game/progress';
import { ownedKeepsakes } from '@/game/scrapbook';
import { MaterialKey } from '@/textures/materials';
import { shade } from '@/ui/colour';
import { CHROME, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { drawGear } from '@/ui/gear';
import { drawBook, drawChecklist, drawPlay, drawSpeaker } from '@/ui/icons';
import { doneCount, loadObjectives, markObjectivesSeen, objectiveContext, unseenDone, type ObjectivesState } from '@/game/objectives';
import { ObjectivesCard } from '@/ui/objectivesCard';
import { STAR_PRIZE } from '@/ui/star';
import { faces } from '@/ui/light';
import { drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive, settle } from '@/ui/spring';
import { display, resize } from '@/ui/type';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';
import type { Vignette } from '@/vignettes/Vignette';

const MENU = {
  sign: { width: 560, height: 328, top: 110, ropeInset: 150 },
  /** Beats per second of the sign's tempo beads: the game's own 120 BPM. */
  beatHz: 2, dots: 4,
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
  private illustration!: Vignette;
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
  private pucks!: Phaser.GameObjects.Graphics;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private enteredAt = 0;
  private uiScale = 1;
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
  private puckPressed: 'mute' | 'setup' | 'book' | 'objectives' | null = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  private muted = false;
  private busy = false;
  private disposed = false;
  private request = 0;

  public constructor() { super(SceneKey.Menu); }

  protected override build(): void {
    this.disposed = false;
    this.busy = false;
    this.pressedAt = this.puckPressedAt = -Infinity;
    this.puckPressed = null;
    this.muted = isMuted(this);
    // Read, not stored: a player whose old save already three-starred a keepsake's level
    // sees the dot on their first launch after the Scrapbook shipped, and never again once
    // they have looked.
    this.bookDot = !seenScrapbook() && ownedKeepsakes(loadProgress()).length > 0;
    // Read on every entry, so a set that turned over at midnight is today's on the way back.
    this.objectives = loadObjectives(Date.now(), objectiveContext(loadProgress()));
    // The hammer's idle sway doubles as the title illustration; it never receives a plan.
    this.illustration = new HammerNailVignette(this, true);

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
    this.pucks = this.add.graphics();
    this.objectivesCard = new ObjectivesCard(this);

    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.enteredAt = performance.now() / 1000;
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => { this.curtain.reveal(); this.openTheme(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    this.illustration.layout(this.viewport);
    const s = this.uiScale = Math.min(safe.width / 720, safe.height / 1150);

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
    this.drawPucks(s, 0);
    this.puckDirty = true;

    // The block sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(CHROME.block.height * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - CHROME.block.width * s / 2, safe.bottom - CHROME.block.fromBottom * s - height, CHROME.block.width * s, height);
    this.drawButton(0, s);
    resize(this.playLabel, 40 * s, SHELL.cream);
    this.tutorialRect.setTo(safe.centerX - 200 * s, this.buttonRect.y - this.controlSize - 24 * s, 400 * s, this.controlSize);
    drawPanel(this.tutorialButton.clear(), this.tutorialRect, s, { fill: SHELL.wood, depth: 8 });
    placeSurface(this.tutorialSurface, this.tutorialRect, s);
    this.tutorialLabel.setPosition(this.tutorialRect.centerX, this.tutorialRect.centerY);
    resize(this.tutorialLabel, 32 * s, SHELL.cream);
    this.objectivesAt = { x: safe.left + 56 * s, y: this.tutorialRect.centerY };
    this.drawPucks(s, 0);
    this.objectivesCard.layout(safe, full, s);
  }

  private drawPucks(s: number, press: number): void {
    const g = this.pucks.clear();
    const sinkOf = (key: 'mute' | 'setup' | 'book' | 'objectives') => (this.puckPressed === key ? press : 0);
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
  }

  public override update(): void {
    const now = performance.now() / 1000;
    this.illustration.update(now);
    this.objectivesCard.update(now, reducedMotion());
    const s = this.uiScale;
    const t = STYLE.current;
    const still = reducedMotion();
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
    const beat = still ? 0 : Math.floor(now * MENU.beatHz) % MENU.dots;
    const phase = still ? 0 : (now * MENU.beatHz) % 1;
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
  }

  private handleTap(tap: Tap): void {
    if (this.curtain.active || this.busy) return;
    // An open card takes every tap: its Close, or anywhere off it, puts it away.
    if (this.objectivesCard.tap(tap.x, tap.y)) { this.puckDirty = true; return; }
    const half = this.controlSize / 2;
    if (Math.abs(tap.x - this.objectivesAt.x) < half && Math.abs(tap.y - this.objectivesAt.y) < half) {
      this.puckPressed = 'objectives';
      this.puckPressedAt = performance.now() / 1000;
      this.objectives = markObjectivesSeen(Date.now(), objectiveContext(loadProgress()));
      this.puckDirty = true;
      this.objectivesCard.show(this.objectives, Date.now(), performance.now() / 1000);
      this.openTheme();
      return;
    }
    if (Math.abs(tap.x - this.muteAt.x) < half && Math.abs(tap.y - this.muteAt.y) < half) {
      this.muted = toggleMute(sharedAudio(this));
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
      this.closeTheme();
      this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: SceneKey.Menu }));
      return;
    }
    if (Math.abs(tap.x - this.bookAt.x) < half && Math.abs(tap.y - this.bookAt.y) < half) {
      this.puckPressed = 'book';
      this.puckPressedAt = performance.now() / 1000;
      this.puckDirty = true;
      this.closeTheme();
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
    // Anything else is a tap that stays on the title screen, and on a cold start it is
    // the first gesture the page has had — which is all a browser was waiting for.
    this.openTheme();
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
   * rather than an engine — `isMuted` still does, so that reason is intact, and a title
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
    // theme is the only thing the menu plays.
    hushMusic(this, MUSIC.bedFadeSec);
    await audio.theme.enter();
  }

  /** The title screen is the only place the theme plays, so every way out stops it. */
  private closeTheme(): void {
    currentAudio(this)?.theme.leave();
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
      await audio.music.load(arrangementForLevel(loadProgress().unlocked));
      if (this.disposed || request !== this.request) return;
      // The gameplay loop is the shell bed from here: start it on the tap that unlocked
      // audio, so the map and settings share it rather than each starting a copy. The
      // title theme is a second track and leaves on closeTheme below.
      await setMusicBed(audio, 'shell', { arrangement: arrangementForLevel(loadProgress().unlocked) });
      if (this.disposed || request !== this.request) return;
      // Warmed here and awaited where it is used. The map is several taps from a level,
      // which is long enough to decode 180 KB without anyone waiting on it.
      void samples.load(audio.context);
      this.playLabel.setText('Play');
      const needsTutorial = tutorial || !(this.registry.get('tutorial-complete') || tutorialComplete());
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
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.request;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.closeTheme();
    this.taps.dispose();
    this.illustration.destroy();
  }
}
