import Phaser from 'phaser';
import { reducedMotion } from '@/core/motionPreference';
import { MUSIC } from '@/config/music';
import { currentAudio, ensureShellMusic, hushMusic, isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { PROGRESSION } from '@/config/progression';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { areaOf, levelSpec, mapLastLevel, mapLevelState, type Area } from '@/game/levels';
import {
  canBeginAttempt, canClaimDailyHeart, formatCountdown, HEALTH, HEALTH_COPY, healthHud, heartProgress,
  levelToPolish, loadHealth, reconcile, redeemDailyHeart, redeemFill, redeemHeart, viewHealth, type Health,
} from '@/game/health';
import { monetization, PRODUCT, purchaseFeedback, rewardedFeedback, STORE_COPY, track } from '@/monetization';
import { loadProgress, markReplayTipSeen, seenReplayTip, type Progress } from '@/game/progress';
import { areaIndexOf, areaOpen, canPlayLevel, firstClosedArea, firstLevelOfArea, levelStars, starsRequired, totalStars, type EarnedStars, type StarGate } from '@/game/stars';
import { MaterialKey } from '@/textures/materials';
import { mix, shade, starColour } from '@/ui/colour';
import { CHROME, drawActionDisc, drawHeartRow, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { FxKey } from '@/ui/feedback';
import { dashes, smoothPath, type Point } from '@/ui/path';
import { drawGear } from '@/ui/gear';
import { drawBack, drawChevron, drawHeart, drawInfinity, drawPadlock, drawPlay, drawSpeaker } from '@/ui/icons';
import { castShadow, faces } from '@/ui/light';
import { BRASS, drawDisc, drawPanel, placeSurface, surface } from '@/ui/panel';
import { drawStar, drawStarMark, STAR_PRIZE } from '@/ui/star';
import { arrive, settle, spring, squash } from '@/ui/spring';
import { STAR_FLIGHT, flightDone, flightPath, starFlightAge, starFlightPose, starsLanded, tallyRing, trailAlpha } from '@/ui/starFlight';
import { body, display, label, resize } from '@/ui/type';
import { resizedScroll, scrollStep, stripBounds, stripInView } from '@/ui/navigation';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { Sheen } from '@/ui/sheen';
import { VIGNETTES } from '@/vignettes/registry';

/** Design-unit metrics of the road map; every one is multiplied by the viewport scale. */
const MAP = {
  step: 202, nodeRadius: 46, wobble: 0.27, topPad: 420, bottomPad: 660,
  roadWidth: 58, tapSlop: 14, friction: 5,
  /** Spline samples per level span. Enough that the curve reads smooth at any width. */
  smoothing: 14,
  /** Bands used for the haze ramp up each area and for the blend across a boundary. */
  hazeBands: 12, blendBands: 9, blendHeight: 120,
  /**
   * The map renders a window, not the whole road. It used to build one Phaser Text per
   * level from level 1, so a deep — or corrupt — frontier allocated thousands of them
   * on every entry and re-laid them out on every resize.
   */
  window: 48, history: 20,
  /**
   * The world is baked into strips of this many levels, and a strip the camera cannot
   * see is not drawn at all.
   *
   * Baking a Graphics buys freedom from *rebuild* cost, not from *render* cost: Phaser
   * walks a Graphics' whole command buffer and re-tessellates it on every frame it is
   * rendered, and it culls nothing by bounds. One Graphics holding the whole road was
   * 82,000 commands for a world 10,700 units tall showing 1,560 of them, and cost 25 ms
   * of main-thread time per frame — the entire 60 fps budget, ~85% of it spent on
   * geometry off the top and bottom of the screen.
   */
  stripLevels: 3,
  /**
   * How far above its own row a terrain motif, a plaque or a road dash may stand.
   *
   * Strips are baked bottom to top, so anything that overhangs a seam has to overhang
   * *downward*, into a strip already painted, or the strip above paints over it. Each of
   * those three is therefore claimed by the strip holding its topmost extent rather than
   * its centre, and this is that extent. Props are exempt: they are in the detail layer,
   * which every strip's ground is drawn before.
   */
  overhang: { motif: 24, plaque: 42 },
  /**
   * How far outside the camera a strip is still drawn. It has to clear the tallest thing
   * a strip can carry past its own edge, which is a prop: 128 design units at up to 1.36
   * scale, so roughly 175.
   */
  cullMargin: 260,
  /** The frontier puck hops once a bar at the game's own tempo. */
  hopSec: 1.6,
  sign: { width: 340, height: 92, top: 26, ropeInset: 40 },
  /**
   * The star gate: a barrier across the road at the foot of a closed area, with the
   * count it wants on a sign under the bar. The bar pivots on the left post and lifts
   * when the collection reaches the requirement.
   */
  barrier: { post: 14, height: 62, reach: 18, bar: 15, sign: { width: 150, height: 48 }, liftSec: 0.9, barFadeSec: 0.35 },
  /** The tally's star on the bench, and the beads row it shares. */
  tally: { star: 13 },
} as const;



/**
 * One baked slice of the world, and the node indices it owns.
 *
 * Two layers rather than one, because a strip must never paint over its neighbour: every
 * strip's `ground` is drawn before any strip's `detail`, so the terrain of the strip
 * above cannot land on top of a prop standing across the boundary below it.
 */
interface Strip {
  readonly ground: Phaser.GameObjects.Graphics;
  readonly detail: Phaser.GameObjects.Graphics;
  /** Node indices, `to` exclusive. Strips are level-aligned, so nothing has to be clipped. */
  readonly from: number;
  readonly to: number;
  /** The band this strip covers, from `stripBounds`. `top` is the smaller y: the road climbs. */
  top: number;
  bottom: number;
}

/**
 * Endless, scrollable road of levels grouped into themed areas. Pure presentation of
 * `levelSpec`/`Progress`: the map never decides difficulty, it only draws it.
 *
 * Everything except the frontier puck, the tap ripple and a live press is baked in
 * `layout()`, so the depth work — the raised road, cast shadows, terrain and scenery —
 * is never rebuilt per frame. It is not free per frame, though, which is what `MAP.stripLevels`
 * is about: the bake is split into strips and only the strips the camera can see are
 * drawn. The header is a sign hung over the road and the footer a
 * bench with the next level's block on it; both are fixed to the camera and drawn in
 * screen space, since a Container cannot hold a scroll factor.
 */
export class MapScene extends BaseScene {
  private progress!: Progress;
  private health!: Health;
  private shown = 0;
  /** Lowest level rendered. Node i is level `first + i`. */
  private first = 1;
  private firstBand = 0;
  private strips: Strip[] = [];
  private pulse!: Phaser.GameObjects.Graphics;
  private touch!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Image;
  private fibre!: Phaser.GameObjects.TileSprite;
  private signBack!: Phaser.GameObjects.Graphics;
  private signSurface!: Phaser.GameObjects.TileSprite;
  private status!: Phaser.GameObjects.Text;
  private healthCount!: Phaser.GameObjects.Text;
  private healthWait!: Phaser.GameObjects.Text;
  private healthMark!: Phaser.GameObjects.Graphics;
  private pucks!: Phaser.GameObjects.Graphics;
  private dock!: Phaser.GameObjects.Graphics;
  private dockSurface!: Phaser.GameObjects.TileSprite;
  private dockTitle!: Phaser.GameObjects.Text;
  private gateLabel!: Phaser.GameObjects.Text;
  private restScrim!: Phaser.GameObjects.Graphics;
  private restPlate!: Phaser.GameObjects.Graphics;
  private restSurface!: Phaser.GameObjects.TileSprite;
  private restControls!: Phaser.GameObjects.Graphics;
  private restSheen!: Sheen;
  private restTitle!: Phaser.GameObjects.Text;
  private restWait!: Phaser.GameObjects.Text;
  private restTexts: Record<string, Phaser.GameObjects.Text> = {};
  private restRect = new Phaser.Geom.Rectangle();
  private restWatchRect = new Phaser.Geom.Rectangle();
  private restRefillRect = new Phaser.Geom.Rectangle();
  private restDailyRect = new Phaser.Geom.Rectangle();
  private restPremiumRect = new Phaser.Geom.Rectangle();
  private restBackRect = new Phaser.Geom.Rectangle();
  private restTipRect = new Phaser.Geom.Rectangle();
  /** The first-time row on the sheet, for this visit to the map. Decided once, on entry. */
  private restTipFresh = false;
  private restTipOpen = false;
  /** The finished level the row offers, or null when every finished level has three stars. */
  private restTipLevel: number | null = null;
  private restShown = false;
  private restDailyOpen = false;
  private restAt = -Infinity;
  private restPressDirty = false;
  private restPressedAt = -Infinity;
  private restPressed: 'watch' | 'refill' | 'daily' | 'premium' | 'back' | 'tip' | null = null;
  private restBusy = false;
  /** A store or ad message under the sheet's controls; empty when there is nothing to say. */
  private restNote = '';
  private watchClaims = 0;
  private curtain!: SceneCurtain;
  private footerTop = 0;
  private lastHeight = 0;
  /**
   * What the baked world is a function of, so a resize that cannot have changed it does
   * not redraw it. Assigned in `build()`, never merely initialised: a second entry into
   * the scene makes fresh, empty strips, and a key left over from the first would skip
   * the one bake that fills them.
   */
  private bakeKey = '';
  private feedbackAt = -Infinity;
  private lockedIndex = -1;
  /** Every star on the road, as the map read it on entry. */
  private stars = 0;
  /** Per band: the have/need sign under a closed gate's bar. Culled with the area titles. */
  private gateTexts: Phaser.GameObjects.Text[] = [];
  private tally!: Phaser.GameObjects.Graphics;
  private tallyCount!: Phaser.GameObjects.Text;
  private tallyGoal!: Phaser.GameObjects.Text;
  private tallyAt = { x: 0, y: 0 };
  private flight!: Phaser.GameObjects.Graphics;
  /** The stars the level just finished added, still to fly in; null when nothing is owed. */
  private earned: EarnedStars | null = null;
  private flightSettled = true;
  /**
   * The count the tally shows. It trails `stars` by the stars still in the air, and
   * everything that reads the collection while a flight is on — the held frontier, the
   * live gate's sign, the dock — reads this, so nothing opens before the star that
   * opens it has landed.
   */
  private tallyShown = 0;
  private landedCount = 0;
  private landedAt = -Infinity;
  /**
   * The area whose gate is drawn live rather than baked: the first one closed to the
   * shown count on entry. Live because it is the one that can change this visit — its
   * sign counts the landings and its bar lifts — and the bake would have to be redone
   * every frame to show that.
   */
  private liveGate = -1;
  private gateLiftAt = -Infinity;
  private frontierIndex = -1;
  private dockRect = new Phaser.Geom.Rectangle();
  private blockRect = new Phaser.Geom.Rectangle();
  private signRect = new Phaser.Geom.Rectangle();
  private ceiling = { x: 0, y: 0 };
  private backAt = { x: 0, y: 0 };
  private setupAt = { x: 0, y: 0 };
  private muteAt = { x: 0, y: 0 };
  private muted = false;
  private numbers: Phaser.GameObjects.Text[] = [];
  private areaTitles: Phaser.GameObjects.Text[] = [];
  private nodes: Point[] = [];
  private road: Point[] = [];
  private uiScale = 1;
  private controlSize = 96;
  private worldHeight = 0;
  private hudHeight = 0;
  private scrollY = 0;
  private velocity = 0;
  private drag: { id: number; scrollable: boolean; lastY: number; lastAt: number; startX: number; startY: number; moved: boolean } | null = null;
  private touchAt = -Infinity;
  private touchPoint = { x: 0, y: 0 };
  private focus = 1;
  private centered = false;
  private disposed = false;
  private enteredAt = 0;
  private pressedAt = -Infinity;
  private pressDirty = false;
  private puckPressed: 'back' | 'setup' | 'mute' | null = null;
  private puckPressedAt = -Infinity;
  private puckDirty = false;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Map); }

  protected override build(): void {
    this.disposed = false;
    this.centered = false;
    this.drag = null;
    this.velocity = 0;
    this.feedbackAt = this.touchAt = this.pressedAt = this.puckPressedAt = -Infinity;
    this.lockedIndex = -1;
    this.puckPressed = null;
    this.muted = isMuted(this);
    this.progress = loadProgress();
    this.health = loadHealth();
    this.restShown = false;
    this.restDailyOpen = false;
    this.restTipFresh = !seenReplayTip();
    this.restTipOpen = false;
    this.restTipLevel = null;
    this.restAt = this.restPressedAt = -Infinity;
    this.restPressed = null;
    this.restBusy = false;
    const data = this.sys.settings.data as { focus?: number; earned?: EarnedStars } | undefined;
    this.focus = Math.max(1, Math.min(this.progress.unlocked, data?.focus ?? this.progress.unlocked));
    this.stars = totalStars(this.progress);
    const earned = data?.earned;
    this.earned = earned && Number.isInteger(earned.level) && earned.after > earned.before ? earned : null;
    // Under reduced motion the stars are simply already in the collection.
    this.flightSettled = this.earned === null || this.reducedMotion;
    this.tallyShown = this.flightSettled ? this.stars : this.stars - (this.earned!.after - this.earned!.before);
    this.landedCount = 0;
    this.landedAt = -Infinity;
    this.gateLiftAt = -Infinity;
    this.liveGate = firstClosedArea(this.tallyShown);
    const top = mapLastLevel(this.progress.unlocked);
    this.first = Math.max(1, Math.min(this.focus - MAP.history, top - MAP.window + 1));
    this.shown = Math.min(top, this.first + MAP.window - 1) - this.first + 1;
    // Bands are addressed absolutely, because the window rarely starts on a band edge.
    this.firstBand = Math.floor((this.first - 1) / PROGRESSION.areaSize);
    this.bakeKey = '';
    // Ground under every strip's detail, so a strip cannot paint over its neighbour. The
    // bands are filled in by `layout()`, which is where the world gets its size.
    this.strips = Array.from({ length: Math.max(1, Math.ceil(this.shown / MAP.stripLevels)) }, (_, j) => ({
      ground: this.add.graphics().setDepth(0),
      detail: this.add.graphics().setDepth(1),
      from: j * MAP.stripLevels,
      to: Math.min(this.shown, (j + 1) * MAP.stripLevels),
      top: 0, bottom: 0,
    }));
    // The frontier puck lives here, under the numbers, so it can hop without a baked copy beneath.
    this.pulse = this.add.graphics().setDepth(3);
    this.touch = this.add.graphics().setDepth(5);
    this.numbers = Array.from({ length: this.shown }, (_, i) => display(this, String(this.first + i), { size: 32, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(4));
    const areas = Math.floor((this.first + this.shown - 2) / PROGRESSION.areaSize) - this.firstBand + 1;
    this.areaTitles = Array.from({ length: areas }, () => display(this, '', { size: 30, colour: SHELL.cream }).setOrigin(0, 0.5).setDepth(2));
    // The pool of light stays put while the ground scrolls under it: a lamp over a table.
    this.glow = this.add.image(0, 0, FxKey.glow).setScrollFactor(0).setDepth(6).setAlpha(0.22);
    this.fibre = this.add.tileSprite(0, 0, 1, 1, MaterialKey.paper).setOrigin(0).setScrollFactor(0).setDepth(6).setAlpha(0.32 * STYLE.current.grain);
    this.signBack = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.signSurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.wood, 0.7).setScrollFactor(0).setDepth(10);
    this.status = display(this, '', { size: 40, colour: SHELL.cream, align: 'center' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(11);
    this.healthCount = display(this, '', { size: 28, colour: SHELL.cream, align: 'right' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
    this.healthWait = body(this, '', { size: 20, colour: SHELL.cream, align: 'right' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
    this.healthMark = this.add.graphics().setScrollFactor(0).setDepth(11);
    this.pucks = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.dock = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.dockSurface = surface(this, MaterialKey.parchment, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.puck, 0.5).setScrollFactor(0).setDepth(10);
    this.dockTitle = display(this, '', { size: 30, colour: PALETTE.ink }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(11);
    this.gateLabel = display(this, '', { size: 28, colour: SHELL.cream }).setOrigin(0, 0.5).setDepth(4);
    this.gateTexts = Array.from({ length: areas }, () => display(this, '', { size: 26, colour: SHELL.cream }).setOrigin(0, 0.5).setDepth(4).setVisible(false));
    this.tally = this.add.graphics().setScrollFactor(0).setDepth(11);
    this.tallyCount = display(this, '', { size: 30, colour: PALETTE.ink }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
    this.tallyGoal = body(this, '', { size: 22, colour: PALETTE.muted }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
    // Above the bench and the sign: a star in the air crosses both on its way down.
    this.flight = this.add.graphics().setScrollFactor(0).setDepth(13);
    this.restScrim = this.add.graphics().setScrollFactor(0).setDepth(19).setVisible(false);
    this.restPlate = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.restSurface = surface(this, MaterialKey.parchment, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.puck, 0.28).setScrollFactor(0).setDepth(20);
    this.restControls = this.add.graphics().setScrollFactor(0).setDepth(21);
    this.restSheen = new Sheen(this, 22);
    this.restSheen.node.setScrollFactor(0);
    this.restTitle = display(this, 'Out of hearts', { size: 68, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(22);
    this.restWait = body(this, '', { size: 28, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(22);
    this.restTexts = {
      dailyTitle: this.restText(body(this, STORE_COPY.dailyTitle, { size: 30, colour: PALETTE.ink }), 0, 0.5),
      dailyTerms: this.restText(body(this, STORE_COPY.dailyTerms, { size: 24, colour: PALETTE.muted }), 0, 0.5),
      dailyClaim: this.restText(label(this, 'Claim', { size: 24, colour: SHELL.cream, align: 'center' }), 0.5, 0.5),
      watch: this.restText(display(this, STORE_COPY.watchTitle, { size: 52, colour: SHELL.cream }), 0, 0.5),
      watchTerms: this.restText(label(this, STORE_COPY.watchTerms, { size: 22, colour: mix(SHELL.cream, PALETTE.coral, 0.2) }), 0, 0.5),
      watchPlus: this.restText(display(this, '+1', { size: 38, colour: SHELL.cream, align: 'center' }), 0.5, 0.5),
      refill: this.restText(display(this, STORE_COPY.refillShort, { size: 36, colour: PALETTE.ink }), 0, 0.5),
      refillPrice: this.restText(label(this, '', { size: 28, colour: PALETTE.ink, align: 'right' }), 1, 0.5),
      premium: this.restText(display(this, STORE_COPY.premiumHeadline, { size: 42, colour: SHELL.cream, outline: shade(BRASS, -0.62) }), 0, 0.5),
      premiumTerms: this.restText(body(this, `${STORE_COPY.premiumTitle} · ${STORE_COPY.premiumShort.toLowerCase()}`, { size: 25, colour: shade(BRASS, -0.62) }), 0, 0.5),
      premiumPrice: this.restText(label(this, '', { size: 26, colour: SHELL.cream, align: 'center' }), 0.5, 0.5),
      back: this.restText(display(this, 'Back to the map', { size: 36, colour: PALETTE.ink, align: 'center' }), 0.5, 0.5),
      note: this.restText(body(this, '', { size: 25, colour: PALETTE.coral, align: 'center' }), 0.5, 0.5),
      tipTitle: this.restText(display(this, HEALTH_COPY.firstEmptyTitle, { size: 32, colour: PALETTE.ink }), 0, 0.5),
      tipCopy: this.restText(body(this, '', { size: 23, colour: PALETTE.muted }), 0, 0),
      tipGo: this.restText(label(this, '', { size: 24, colour: SHELL.cream, align: 'center' }), 0.5, 0.5),
    };
    this.enteredAt = performance.now() / 1000;
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.wheel, this);
    window.addEventListener('blur', this.cancelDrag);
    window.addEventListener('touchcancel', this.cancelDrag);
    window.addEventListener('pointercancel', this.cancelDrag);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    ensureShellMusic(this);
  }

  /** Deterministic per index, so the terrain and scenery are identical on every layout. */
  private static noise(seed: number): number {
    let t = (seed * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    const oldScale = this.uiScale, oldHeader = this.hudHeight;
    this.uiScale = s;
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.hudHeight = safe.top + 144 * s;
    this.footerTop = safe.bottom - 210 * s;
    this.worldHeight = (MAP.topPad + MAP.bottomPad + (this.shown - 1) * MAP.step) * s + this.hudHeight;
    // Everything the bake reads, and nothing else. The height of the frame is not in it,
    // which is the point: `layout()` runs on every resize, and on Android the commonest
    // resize by far is Chrome collapsing its URL bar — one event per frame of the
    // animation, changing the height and nothing more. `uiScale` is
    // `min(safe.width / 720, safe.height / 1150)`, which the width pins on any handset, so
    // the road's scale, its world height and every node come out identical. Re-baking them
    // cost 11.8 ms a frame for fifteen frames — 177 ms of main-thread work per collapse,
    // to redraw geometry byte for byte the same as what was already on screen.
    this.bake(s);
    const size = Math.max(full.width, full.height) * 1.25;
    this.glow.setPosition(full.x + full.width * 0.38, full.y + full.height * 0.34).setDisplaySize(size, size)
      .setTint(mix(0xf6e6bc, areaOf(this.progress.unlocked).area.sky, 0.4));
    this.fibre.setPosition(full.x, full.y).setSize(full.width, full.height);
    this.drawSign(s, 0, 0);
    this.drawPucks(s, 0);
    this.drawDock(s, 0);
    this.drawRest(s, 0);
    this.pressDirty = this.puckDirty = this.restPressDirty = true;
    this.cameras.main.setBounds(0, 0, full.width, this.worldHeight);
    if (!this.centered) { this.centered = true; this.scrollTo(this.focus); }
    else this.scrollY = resizedScroll(this.scrollY, oldScale, s, oldHeader, this.hudHeight, this.lastHeight, full.height);
    this.lastHeight = full.height;
    this.drag = null;
    this.velocity = 0;
    this.clampScroll();
    this.cullStrips();
  }

  /**
   * Everything baked from the world, redone only when its key moves — or when `force`
   * says the collection changed under it: a flight that has landed, a gate that lifted.
   */
  private bake(s: number, force = false): void {
    const { safe, full } = this.viewport;
    const key = [s, this.worldHeight, full.x, full.width, safe.left, safe.right, safe.centerX, safe.width, this.first, this.shown].join('|');
    if (!force && key === this.bakeKey) return;
    this.bakeKey = key;
    // Level 1 sits at the bottom; the road climbs. x wanders left and right inside the safe frame.
    this.nodes = Array.from({ length: this.shown }, (_, i) => ({
      x: safe.centerX + Math.sin((this.first + i) * 0.9) * safe.width * MAP.wobble,
      y: this.worldHeight - (MAP.bottomPad + i * MAP.step) * s,
    }));
    // The road runs one span past the last node so it leaves the frame rather than stopping.
    const beyond: Point = { x: safe.centerX + Math.sin((this.first + this.shown) * 0.9) * safe.width * MAP.wobble, y: (this.nodes[this.shown - 1]?.y ?? 0) - MAP.step * s };
    this.road = smoothPath([...this.nodes, beyond], MAP.smoothing);
    // Strips are level-aligned and abut exactly, so the bake is partitioned rather than
    // clipped: every node, prop and road span belongs whole to one strip, and only the
    // terrain — the one thing that fills rather than sits — is cut at the seam.
    const bounds = stripBounds(this.shown, MAP.stripLevels, this.worldHeight, i => this.nodes[i]!.y, MAP.step * s);
    this.strips.forEach((strip, j) => {
      strip.top = bounds[j]!.top;
      strip.bottom = bounds[j]!.bottom;
    });
    this.frontierIndex = -1;
    for (const strip of this.strips) {
      this.drawTerrain(strip.ground.clear(), s, strip);
      const g = strip.detail.clear();
      this.drawRoad(g, s, strip);
      this.drawScenery(g, s, strip);
      this.drawPlaques(g, s, strip);
      this.drawNodes(g, s, strip);
    }
    this.drawGate(s);
    this.drawStarGates(s);
  }

  /**
   * Which strips and numbers are drawn at all, from the camera's own window.
   *
   * Phaser culls nothing by bounds — `willRender` asks about visibility and alpha, never
   * about where an object is — so an off-screen Graphics is walked and re-tessellated in
   * full every frame unless something says not to. This is that something, and it is the
   * whole point of the strips. The numbers ride along because each `Text` carries its own
   * texture, and a texture bind is the draw-call cost this project's conventions warn
   * about; 48 of them for the eight that are on screen is the same waste in another form.
   */
  private cullStrips(): void {
    const height = this.viewport.full.height;
    const margin = MAP.cullMargin * this.uiScale;
    const top = this.scrollY - margin;
    const bottom = this.scrollY + height + margin;
    for (const strip of this.strips) {
      const on = stripInView(strip, this.scrollY, height, margin);
      if (strip.ground.visible !== on) { strip.ground.setVisible(on); strip.detail.setVisible(on); }
    }
    for (let i = 0; i < this.numbers.length; i++) {
      const y = this.nodes[i]?.y ?? 0;
      const on = y > top && y < bottom;
      if (this.numbers[i]!.visible !== on) this.numbers[i]!.setVisible(on);
    }
    for (const title of this.areaTitles) {
      const on = title.y > top && title.y < bottom;
      if (title.visible !== on) title.setVisible(on);
    }
    for (const sign of this.gateTexts) {
      // A sign with no text is a gate that is open or off the window; it stays hidden.
      const on = sign.text !== '' && sign.y > top && sign.y < bottom;
      if (sign.visible !== on) sign.setVisible(on);
    }
  }

  /**
   * The star gate standing in front of this level, read against the *shown* count, or
   * null. Only an uncleared level in a closed area is ever held — in practice the
   * frontier at an area's first stop — so replays past a gate a restored save never
   * earned stay open, which is exactly what the gate asks for.
   */
  private heldBy(level: number): StarGate | null {
    if (levelStars(this.progress, level) > 0) return null;
    const area = areaIndexOf(level);
    if (areaOpen(area, this.tallyShown)) return null;
    const required = starsRequired(area);
    return { area, level: firstLevelOfArea(area), required, have: this.tallyShown, short: required - this.tallyShown };
  }

  /** The gate the shown count is working toward: the first one it does not open. */
  private goalGate(): StarGate {
    const area = firstClosedArea(this.tallyShown);
    const required = starsRequired(area);
    return { area, level: firstLevelOfArea(area), required, have: this.tallyShown, short: required - this.tallyShown };
  }

  /** World y of the road's boundary at the foot of an area, or null when it is off the window. */
  private boundaryY(area: number): number | null {
    const i = firstLevelOfArea(area) - this.first;
    if (i <= 0 || i >= this.shown) return i === 0 && this.shown > 0 ? this.nodes[0]!.y + MAP.step * this.uiScale / 2 : null;
    return (this.nodes[i - 1]!.y + this.nodes[i]!.y) / 2;
  }

  /**
   * One rendered band: the part of absolute area `firstBand + k` that falls inside the
   * window, as node indices, plus the area's own full level range for its sign.
   */
  private band(k: number): { area: Area; name: string; from: number; to: number; atBottom: boolean; atTop: boolean } {
    const size = PROGRESSION.areaSize;
    const absolute = this.firstBand + k;
    const last = this.first + this.shown - 1;
    const startLevel = Math.max(this.first, absolute * size + 1);
    const endLevel = Math.min(last, (absolute + 1) * size);
    const { area, name } = areaOf(absolute * size + 1);
    return {
      area, name,
      from: startLevel - this.first,
      to: endLevel - this.first,
      atBottom: startLevel <= this.first,
      atTop: endLevel >= last,
    };
  }

  /** Ground, haze up each area, a soft blend at every boundary, and per-area texture. */
  private drawTerrain(g: Phaser.GameObjects.Graphics, s: number, strip: Strip): void {
    const { full } = this.viewport;
    const size = PROGRESSION.areaSize;
    // Every fill here is a full-width band, so cutting one to the strip is a clamp on y.
    // The band's own geometry is unchanged — only the painted rectangle is cut — which is
    // what keeps the haze ramp and the boundary blend reading across a seam.
    const fill = (colour: number, alpha: number, y: number, h: number): void => {
      const t = Math.max(y, strip.top);
      const b = Math.min(y + h, strip.bottom);
      if (b <= t) return;
      g.fillStyle(colour, alpha).fillRect(full.x, t, full.width, b - t);
    };
    for (let k = 0; k < this.areaTitles.length; k++) {
      const band = this.band(k);
      const area = band.area;
      const first = this.nodes[band.from]!;
      const last = this.nodes[band.to]!;
      const isLast = band.atTop;
      const top = isLast ? 0 : last.y - MAP.step * s / 2;
      const bottom = band.atBottom ? this.worldHeight : first.y + MAP.step * s / 2;
      const height = bottom - top;
      fill(area.ground, 1, top, height);
      // Atmospheric recession: the far end of a band hazes toward its own sky colour.
      for (let b = 0; b < MAP.hazeBands; b++) {
        const t = b / MAP.hazeBands;
        const bandTop = top + height * t * 0.55;
        fill(mix(area.ground, area.sky, 0.32 * (1 - t)), 1, bandTop, height * 0.55 / MAP.hazeBands + 1);
      }
      this.drawTexture(g, area, this.firstBand + k, top, bottom, s, strip);
      if (!isLast) {
        const next = areaOf((this.firstBand + k + 1) * size + 1).area;
        const blend = MAP.blendHeight * s;
        const hazed = mix(area.ground, area.sky, 0.32);
        for (let b = 0; b < MAP.blendBands; b++) {
          const t = b / MAP.blendBands;
          // t = 0 is the boundary itself, so it starts on the neighbour's ground and
          // walks back into this area's. The other way round paints a slab.
          fill(mix(next.ground, hazed, t), 1, top + blend * t, blend / MAP.blendBands + 1);
        }
      }
    }
  }

  /** Plaques are drawn after the scenery, or a prop lands on top of the name. */
  private drawPlaques(g: Phaser.GameObjects.Graphics, s: number, strip: Strip): void {
    for (let k = 0; k < this.areaTitles.length; k++) {
      const band = this.band(k);
      const first = this.nodes[band.from]!;
      const bottom = band.atBottom ? this.worldHeight : first.y + MAP.step * s / 2;
      // A plaque belongs to one strip, not to every strip its band crosses: claimed by
      // its top, half-open, as `MAP.overhang` sets out.
      const claim = bottom - (72 + MAP.overhang.plaque) * s;
      if (claim < strip.top || claim >= strip.bottom) continue;
      this.placePlaque(g, band.area, band.name, k, bottom, s);
    }
  }

  /** A quiet repeating motif per area, so a band reads as ground rather than paint. */
  private drawTexture(g: Phaser.GameObjects.Graphics, area: Area, band: number, top: number, bottom: number, s: number, strip: Strip): void {
    const kind = band % 5;
    const ink = shade(area.ground, -0.14);
    const pale = shade(area.ground, 0.16);
    const rows = Math.max(1, Math.floor((bottom - top) / (76 * s)));
    for (let r = 0; r < rows; r++) {
      const y = bottom - (r + 0.5) * (bottom - top) / rows;
      // Rows are keyed to the band, not the strip, so the motif does not shift at a seam.
      // Claimed by the strip holding the row's *top* — see `MAP.overhang` — and half-open,
      // or a row on a seam is painted by both strips and its half-alpha slabs double up.
      const claim = y - MAP.overhang.motif * s;
      if (claim < strip.top || claim >= strip.bottom) continue;
      const jitter = MapScene.noise(band * 97 + r);
      for (let c = 0; c < 5; c++) {
        const x = this.viewport.full.x + (c + 0.5 + (MapScene.noise(band * 31 + r * 7 + c) - 0.5) * 0.6) * this.viewport.full.width / 5;
        // Keep the motif off the road so it never fights the ribbon for attention.
        if (Math.abs(x - this.roadXAt(y)) < MAP.roadWidth * s * 1.3) continue;
        const n = MapScene.noise(band * 13 + r * 5 + c);
        if (kind === 0) {
          g.lineStyle(2.5 * s, ink, 0.5);
          for (let t = -1; t <= 1; t++) g.lineBetween(x + t * 7 * s, y + 6 * s, x + t * 10 * s, y - (10 + n * 8) * s);
        } else if (kind === 1) {
          // Staggered slabs, courses offset by row, so it reads as laid paving.
          const off = (r % 2 ? 26 : -8) * s;
          g.fillStyle(shade(area.ground, -0.07), 0.5).fillRoundedRect(x - 36 * s + off, y - 17 * s, 70 * s, 33 * s, 4 * s);
          g.fillStyle(pale, 0.28).fillRect(x - 33 * s + off, y - 14 * s, 64 * s, 3 * s);
        } else if (kind === 2) {
          g.lineStyle(2.4 * s, ink, 0.32);
          g.beginPath();
          for (let a = 0; a <= 8; a++) g[a === 0 ? 'moveTo' : 'lineTo'](x - 36 * s + a * 9 * s, y + Math.sin(a * 0.8 + jitter * 6) * 5 * s);
          g.strokePath();
        } else if (kind === 3) {
          g.fillStyle(pale, 0.7).fillEllipse(x, y, (56 + n * 30) * s, 17 * s, 10);
        } else {
          g.fillStyle(shade(area.ground, -0.22), 0.55).fillEllipse(x, y, (18 + n * 12) * s, (11 + n * 5) * s, 8);
          g.fillStyle(pale, 0.35).fillEllipse(x - 3 * s, y - 3 * s, 8 * s, 5 * s, 6);
        }
      }
    }
  }

  /**
   * Road x at a world y. Node y is linear in the level index and the spline samples it
   * uniformly, so the index inverts directly — a scan here would be quadratic against
   * the terrain cells that call it.
   */
  private roadXAt(y: number): number {
    if (this.road.length === 0) return this.viewport.safe.centerX;
    const s = this.uiScale;
    const level = (this.worldHeight - MAP.bottomPad * s - y) / (MAP.step * s);
    const index = Math.round(level * MAP.smoothing);
    return (this.road[Math.max(0, Math.min(this.road.length - 1, index))] ?? this.road[0]!).x;
  }

  /** A painted wooden sign for the area name, on whichever side of the road has room for it. */
  private placePlaque(g: Phaser.GameObjects.Graphics, area: Area, name: string, index: number, bottom: number, s: number): void {
    const { safe } = this.viewport;
    const y = bottom - 72 * s;
    const roadX = this.roadXAt(y);
    const onLeft = roadX > safe.centerX;
    const h = 64 * s;
    // Size the sign to its own text: area names are authored, and a long one overflowed.
    const title = this.areaTitles[index]!.setText(name);
    resize(title, 30 * s, SHELL.cream);
    const pad = 52 * s;
    const w = Math.min(safe.width - 36 * s, Math.max(206 * s, title.width + pad));
    // Repeat areas gain a numeral (Grass VIII), so shrink rather than overflow the sign.
    if (title.width > w - pad) resize(title, 30 * s * (w - pad) / title.width, SHELL.cream);
    const x = onLeft ? safe.left + 18 * s : safe.right - 18 * s - w;
    const fill = mix(SHELL.wood, area.road, 0.35);
    drawPanel(g, new Phaser.Geom.Rectangle(x, y - h / 2, w, h), s, { fill, depth: 8 });
    // Painted grain, keyed on the band so no two signs match, and two screw heads.
    g.lineStyle(1.5 * s, shade(fill, -0.1), 0.5);
    for (let i = 0; i < 3; i++) {
      const gy = y + (i - 1) * h * 0.24;
      const wobble = (MapScene.noise(index * 7 + this.firstBand * 3 + i) - 0.5) * 6 * s;
      g.lineBetween(x + 14 * s, gy, x + w * 0.5, gy + wobble).lineBetween(x + w * 0.5, gy + wobble, x + w - 14 * s, gy);
    }
    for (const sx of [x + 16 * s, x + w - 16 * s]) {
      g.fillStyle(faces(BRASS).edge).fillCircle(sx, y - h / 2 + 17 * s, 4.5 * s);
      g.fillStyle(BRASS).fillCircle(sx, y - h / 2 + 16 * s, 4.5 * s);
    }
    title.setPosition(x + 24 * s, y);
  }

  /** The ribbon: a cast shadow, a casing, the surface, a top sheen and dashed markings. */
  private drawRoad(g: Phaser.GameObjects.Graphics, s: number, strip: Strip): void {
    const width = MAP.roadWidth * s;
    const outline = STYLE.current.outline * s * 0.55;
    const stroke = (path: readonly Point[], w: number, colour: number, alpha: number, dy = 0): void => {
      g.lineStyle(w, colour, alpha);
      g.beginPath();
      path.forEach((p, i) => g[i === 0 ? 'moveTo' : 'lineTo'](p.x, p.y + dy));
      g.strokePath();
    };
    const shadow = castShadow(6);
    // The shadow is one continuous path per strip, abutting its neighbours on a shared
    // point rather than overlapping them: it is the only stroke here drawn at an alpha
    // below 1, so a doubled segment at a seam would read as a dark tick under the road.
    const shadowTo = strip.to >= this.shown ? this.road.length : strip.to * MAP.smoothing + 1;
    stroke(this.road.slice(strip.from * MAP.smoothing, shadowTo), width + 10 * s, 0x1a1410, shadow.alpha, shadow.dy * s);
    // One stretch per level. A span that crosses an area boundary is split at its
    // midpoint, which is exactly where the ground changes, so surface and terrain
    // change on the same line instead of a node apart.
    const slices: [readonly Point[], number][] = [];
    for (let i = strip.from; i < strip.to; i++) {
      const from = Math.max(0, i * MAP.smoothing - 1);
      const to = i * MAP.smoothing + MAP.smoothing + 1;
      const here = areaOf(this.first + i).area.road;
      const next = areaOf(this.first + i + 1).area.road;
      if (here === next) { slices.push([this.road.slice(from, to), here]); continue; }
      const mid = i * MAP.smoothing + Math.floor(MAP.smoothing / 2);
      slices.push([this.road.slice(from, mid + 1), here], [this.road.slice(mid, to), next]);
    }
    // The outline goes down first for every slice, then the surfaces: drawn per slice, a
    // later slice's wider outline would leave a dark tick across the join before it.
    for (const [slice, colour] of slices) if (slice.length >= 2) stroke(slice, width + 6 * s + outline * 2, shade(colour, -0.6), 1);
    for (const [slice, colour] of slices) {
      if (slice.length < 2) continue;
      const f = faces(colour);
      stroke(slice, width + 6 * s, f.edge, 1);
      stroke(slice, width, f.face, 1);
      stroke(slice, width * 0.42, f.rim, 0.45, -width * 0.24);
    }
    for (const [from, to] of dashes(this.road, 26 * s, 30 * s)) {
      // Spaced along the whole road so the rhythm of the dashes never breaks at a seam,
      // then claimed by the strip holding the dash's upper end — `to`, since the road
      // climbs — so a dash across a seam hangs down onto a surface already laid.
      if (to.y < strip.top || to.y >= strip.bottom) continue;
      g.lineStyle(4 * s, 0xffffff, 0.45).lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  /** Props beside the road, each with a cast shadow. The shadows are the depth. */
  private drawScenery(g: Phaser.GameObjects.Graphics, s: number, strip: Strip): void {
    const { safe } = this.viewport;
    for (let i = strip.from; i < strip.to; i++) {
      const node = this.nodes[i]!;
      const y = node.y - MAP.step * s * 0.5;
      const roadX = this.roadXAt(y);
      // Keyed on the level, never on the node's slot in the window: the props either side
      // of a stretch of road have to be the same ones on the way back down it.
      const level = this.first + i;
      const { area } = areaOf(level);
      const kind = Math.floor((level - 1) / PROGRESSION.areaSize) % 5;
      const gapLeft = roadX - safe.left;
      const gapRight = safe.right - roadX;
      const sides: number[] = [];
      if (gapLeft > 150 * s) sides.push(-1);
      if (gapRight > 150 * s) sides.push(1);
      for (const side of sides) {
        const n = MapScene.noise(level * 17 + (side > 0 ? 3 : 11));
        if (n < 0.46) continue;
        const edge = side < 0 ? safe.left : safe.right;
        const x = edge - side * (52 + n * 40) * s;
        if (Math.abs(x - roadX) < MAP.roadWidth * s * 1.6) continue;
        const variant = MapScene.noise(level * 23 + (side > 0 ? 5 : 19)) < 0.5 ? 0 : 1;
        this.prop(g, kind, variant, x, y + (n - 0.5) * 46 * s, (0.74 + n * 0.62) * s, area);
      }
    }
  }

  /** Two silhouettes per area, so a band has variety without a sprite sheet. */
  private prop(g: Phaser.GameObjects.Graphics, kind: number, variant: number, x: number, y: number, k: number, area: Area): void {
    const ink = shade(area.ink, 0.06);
    const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): void => {
      g.fillTriangle(ax, ay, bx, by, cx, cy);
      g.fillTriangle(ax, ay, cx, cy, dx, dy);
    };
    const shadow = castShadow(6);
    g.fillStyle(0x1a1410, shadow.alpha).fillEllipse(x + shadow.dx * k, y + shadow.dy * k, (variant ? 62 : 74) * k, 19 * k, 10);
    if (kind === 0 && variant === 0) {
      // Pine: stacked canopy, each tier hazed a little further toward the sky.
      g.fillStyle(shade(0x4a6b3a, -0.15)).fillRect(x - 5 * k, y - 26 * k, 10 * k, 28 * k);
      for (let t = 0; t < 3; t++) {
        const w = (52 - t * 12) * k;
        const cy = y - (26 + t * 30) * k;
        g.fillStyle(mix(0x4a6b3a, area.sky, t * 0.14)).fillTriangle(x - w / 2, cy, x + w / 2, cy, x, cy - 42 * k);
      }
      g.fillStyle(0xffffff, 0.16).fillTriangle(x - 22 * k, y - 26 * k, x - 4 * k, y - 26 * k, x - 13 * k, y - 62 * k);
    } else if (kind === 0) {
      // Round bush, to break up a run of conifers.
      g.fillStyle(shade(0x4a6b3a, -0.2)).fillRect(x - 4 * k, y - 16 * k, 8 * k, 18 * k);
      g.fillStyle(0x5b7d45).fillCircle(x - 14 * k, y - 28 * k, 19 * k);
      g.fillStyle(0x5b7d45).fillCircle(x + 13 * k, y - 24 * k, 16 * k);
      g.fillStyle(mix(0x5b7d45, area.sky, 0.1)).fillCircle(x - 1 * k, y - 42 * k, 22 * k);
      g.fillStyle(0xffffff, 0.14).fillCircle(x - 8 * k, y - 50 * k, 9 * k);
    } else if (kind === 1 && variant === 0) {
      // Street lamp: the only tall vertical in a flat band, so it sells the light direction.
      g.fillStyle(ink).fillRect(x - 4 * k, y - 106 * k, 8 * k, 106 * k);
      g.fillStyle(ink).fillEllipse(x, y, 24 * k, 8 * k, 8);
      g.fillStyle(0xf6e6bc, 0.18).fillTriangle(x, y - 96 * k, x - 40 * k, y + 4 * k, x + 40 * k, y + 4 * k);
      g.fillStyle(ink);
      quad(x - 5 * k, y - 128 * k, x + 5 * k, y - 128 * k, x + 19 * k, y - 104 * k, x - 19 * k, y - 104 * k);
      g.fillStyle(0xf6e6bc, 0.95).fillRoundedRect(x - 14 * k, y - 106 * k, 28 * k, 7 * k, 3 * k);
    } else if (kind === 1) {
      // Bollard and litter bin: low street furniture at kerb height.
      g.fillStyle(ink).fillRoundedRect(x - 26 * k, y - 46 * k, 20 * k, 48 * k, 6 * k);
      g.fillStyle(shade(ink, 0.3), 0.5).fillRect(x - 22 * k, y - 40 * k, 4 * k, 36 * k);
      g.fillStyle(shade(area.ground, -0.32)).fillRoundedRect(x + 2 * k, y - 34 * k, 30 * k, 36 * k, 5 * k);
      g.fillStyle(ink, 0.8).fillRoundedRect(x, y - 38 * k, 34 * k, 7 * k, 3 * k);
    } else if (kind === 2 && variant === 0) {
      // Cactus.
      const green = 0x6f8f5a;
      g.fillStyle(green).fillRoundedRect(x - 11 * k, y - 96 * k, 22 * k, 96 * k, 11 * k);
      g.fillStyle(green).fillRoundedRect(x + 6 * k, y - 74 * k, 26 * k, 15 * k, 7 * k);
      g.fillStyle(green).fillRoundedRect(x + 19 * k, y - 96 * k, 14 * k, 30 * k, 7 * k);
      g.fillStyle(shade(green, 0.22), 0.7).fillRoundedRect(x - 7 * k, y - 90 * k, 5 * k, 78 * k, 3 * k);
    } else if (kind === 2) {
      // Rock cluster with a dry shrub.
      const rock = shade(area.ground, -0.3);
      g.fillStyle(rock).fillEllipse(x - 12 * k, y - 14 * k, 46 * k, 32 * k, 10);
      g.fillStyle(shade(rock, 0.14)).fillEllipse(x + 14 * k, y - 10 * k, 32 * k, 22 * k, 10);
      g.fillStyle(shade(rock, 0.26), 0.6).fillEllipse(x - 18 * k, y - 22 * k, 20 * k, 11 * k, 8);
      g.lineStyle(2.4 * k, shade(0x8a7a4a, -0.1), 0.8);
      for (let t = -1; t <= 1; t++) g.lineBetween(x + 20 * k, y - 18 * k, x + (20 + t * 14) * k, y - (42 + Math.abs(t) * -8) * k);
    } else if (kind === 3 && variant === 0) {
      // Snow-capped fir.
      g.fillStyle(shade(0x3f5a4a, -0.1)).fillRect(x - 5 * k, y - 22 * k, 10 * k, 24 * k);
      for (let t = 0; t < 3; t++) {
        const w = (54 - t * 13) * k;
        const cy = y - (22 + t * 28) * k;
        g.fillStyle(mix(0x3f5a4a, area.sky, 0.1 + t * 0.12)).fillTriangle(x - w / 2, cy, x + w / 2, cy, x, cy - 40 * k);
        g.fillStyle(0xffffff, 0.8).fillTriangle(x - w / 3.4, cy - 22 * k, x + w / 3.4, cy - 22 * k, x, cy - 40 * k);
      }
    } else if (kind === 3) {
      // Drift banked against a marker post: the pole gives the drift its scale.
      g.fillStyle(shade(area.ink, 0.1)).fillRect(x + 12 * k, y - 76 * k, 6 * k, 78 * k);
      g.fillStyle(0xd2604a).fillRect(x + 12 * k, y - 76 * k, 6 * k, 18 * k);
      g.fillStyle(0xffffff, 0.92).fillEllipse(x - 4 * k, y - 8 * k, 84 * k, 40 * k, 12);
      g.fillStyle(mix(0xffffff, area.sky, 0.5), 0.9).fillEllipse(x + 6 * k, y + 2 * k, 62 * k, 24 * k, 10);
    } else if (variant === 0) {
      // Dusk lantern: a warm pool is the one warm note in a cool band.
      g.fillStyle(ink).fillRect(x - 3 * k, y - 88 * k, 6 * k, 88 * k);
      g.fillStyle(0xe8b878, 0.22).fillCircle(x, y - 94 * k, 40 * k);
      g.fillStyle(0xf0c98a).fillRoundedRect(x - 12 * k, y - 110 * k, 24 * k, 30 * k, 9 * k);
      g.fillStyle(ink).fillRoundedRect(x - 15 * k, y - 116 * k, 30 * k, 8 * k, 4 * k);
      g.fillStyle(0xe8b878, 0.16).fillEllipse(x, y + 2 * k, 96 * k, 26 * k, 10);
    } else {
      // Standing stone, catching the last of the light on one face.
      const stone = shade(area.ground, 0.12);
      g.fillStyle(stone);
      quad(x - 20 * k, y, x + 22 * k, y, x + 14 * k, y - 86 * k, x - 12 * k, y - 94 * k);
      g.fillStyle(shade(stone, 0.2), 0.55);
      quad(x - 20 * k, y, x - 4 * k, y, x - 2 * k, y - 90 * k, x - 12 * k, y - 94 * k);
      g.fillStyle(shade(area.ink, 0.05), 0.35).fillEllipse(x + 2 * k, y - 2 * k, 52 * k, 14 * k, 8);
    }
  }

  /** The four puck states share one geometry; only the frontier is left out of the bake. */
  private puckOf(i: number): { r: number; depth: number; fill: number; number: number; size: number; state: 'frontier' | 'cleared' | 'locked' | 'preview' } {
    const level = this.first + i;
    const { area } = areaOf(level);
    const s = this.uiScale;
    const state = mapLevelState(level, this.progress.unlocked);
    // A frontier behind a closed star gate is drawn as a locked stop: the barrier
    // standing in the road below it is what says why.
    if (state === 'frontier' && this.heldBy(level) === null) return { r: MAP.nodeRadius * 1.1 * s, depth: 10, fill: PALETTE.coral, number: SHELL.cream, size: 34 * s, state };
    if (state === 'cleared') return { r: MAP.nodeRadius * s, depth: 8, fill: area.ink, number: area.paper, size: 30 * s, state };
    if (state === 'preview') {
      return {
        r: MAP.nodeRadius * 0.72 * s, depth: 3,
        fill: mix(area.paper, area.ground, 0.62),
        number: mix(area.ink, area.ground, 0.38),
        size: 22 * s, state,
      };
    }
    return { r: MAP.nodeRadius * 0.84 * s, depth: 5, fill: mix(area.paper, area.ground, 0.42), number: mix(area.ink, area.ground, 0.12), size: 26 * s, state: 'locked' };
  }

  /** One puck, drawn where it stands or lifted by a hop. */
  private drawLevelPuck(g: Phaser.GameObjects.Graphics, i: number, lift: number): void {
    const node = this.nodes[i]!;
    const p = this.puckOf(i);
    const outline = p.state === 'preview' ? STYLE.current.outline * 0.4
      : p.state === 'locked' ? STYLE.current.outline * 0.7
        : STYLE.current.outline;
    const t = outline === STYLE.current.outline ? STYLE.current : { ...STYLE.current, outline };
    drawDisc(g, node.x, node.y - lift, p.r, this.uiScale, { fill: p.fill, depth: p.depth }, t);
  }

  /** Raised pucks with cast shadows, a star plate under each cleared one and a padlock under each locked one. */
  private drawNodes(g: Phaser.GameObjects.Graphics, s: number, strip: Strip): void {
    // `frontierIndex` is reset by the caller: each node is visited by exactly one strip,
    // so a reset here would clear whatever an earlier strip had found.
    for (let i = strip.from; i < strip.to; i++) {
      const level = this.first + i;
      const { area } = areaOf(level);
      const node = this.nodes[i]!;
      const p = this.puckOf(i);
      const text = this.numbers[i]!.setPosition(node.x, node.y).setScale(1).setAlpha(p.state === 'preview' ? 0.58 : 1);
      resize(text, p.size, p.number, STYLE.current, p.state === 'cleared' || p.state === 'frontier');
      const plateY = node.y + p.r + (p.depth + 24) * s;
      if (p.state === 'frontier') {
        this.frontierIndex = i;
        continue;
      }
      this.drawLevelPuck(g, i, 0);
      if (p.state === 'cleared') {
        // Until they land, the stars in the air are not on the plate they left.
        const inFlight = this.earned !== null && !this.flightSettled && level === this.earned.level;
        this.drawStars(g, node.x, plateY, inFlight ? this.earned!.before : levelStars(this.progress, level), area, s);
      } else if (p.state === 'locked') {
        drawPadlock(g, node.x, plateY - 10 * s, 26 * s, area.ink, p.fill);
      }
    }
  }

  /**
   * Destination at the end of the reachable stretch: a lock and a reason to come back,
   * with greyed preview levels continuing above it so the road does not clip off.
   */
  private drawGate(s: number): void {
    const lastReachable = this.progress.unlocked + PROGRESSION.mapLookahead;
    const i = lastReachable - this.first;
    let y: number | null = null;
    if (i >= 0 && i < this.shown - 1) y = (this.nodes[i]!.y + this.nodes[i + 1]!.y) / 2;
    else if (i === this.shown - 1) y = this.nodes[i]!.y - MAP.step * s / 2;
    else if (i === -1 && this.shown > 0) y = this.nodes[0]!.y + MAP.step * s / 2;
    // Drawn last, into whichever strip holds it, so it sits over that strip's own road
    // and pucks exactly as it did when the world was one buffer.
    const strip = this.strips.find(candidate => y! >= candidate.top && y! < candidate.bottom);
    if (y === null || !strip) {
      this.gateLabel.setVisible(false);
      return;
    }
    const g = strip.detail;
    const { safe } = this.viewport;
    const w = Math.min(460 * s, safe.width - 40 * s);
    const h = 108 * s;
    const roadX = this.roadXAt(y);
    const x = Math.max(safe.left + 16 * s, Math.min(safe.right - 16 * s - w, roadX - w / 2));
    drawPanel(g, new Phaser.Geom.Rectangle(x, y - h / 2, w, h), s, { fill: SHELL.wood, depth: 10, hero: true });
    const lockX = x + 64 * s;
    drawPadlock(g, lockX, y - 6 * s, 48 * s, SHELL.cream, shade(PALETTE.ink, -0.25));
    this.gateLabel.setVisible(true).setText('Complete more\nto unlock');
    resize(this.gateLabel, 28 * s, SHELL.cream);
    this.gateLabel.setLineSpacing(-4 * s).setPosition(lockX + 44 * s, y);
  }

  /**
   * A barrier at the foot of every closed area in the window, with the stars it wants
   * on a sign under the bar. The one the collection is working toward is not baked: it
   * is `liveGate`, drawn every frame so its sign can count the landings and its bar
   * can lift the moment the count is met.
   */
  private drawStarGates(s: number): void {
    for (let k = 0; k < this.gateTexts.length; k++) {
      const area = this.firstBand + k;
      const sign = this.gateTexts[k]!;
      const live = area === this.liveGate;
      // The live gate stays until its bar has finished lifting, whatever the count says
      // now; every other gate is simply closed or open against the collection.
      const closed = live ? this.gateLiftAt === -Infinity || performance.now() / 1000 - this.gateLiftAt < MAP.barrier.liftSec + MAP.barrier.barFadeSec
        : !areaOpen(area, this.stars);
      const y = area >= 1 ? this.boundaryY(area) : null;
      const strip = y === null ? undefined : this.strips.find(candidate => y >= candidate.top && y < candidate.bottom);
      if (y === null || !strip) { sign.setText('').setVisible(false); continue; }
      if (!closed) {
        // A gate the player has passed stands open: its posts stay as the area's threshold.
        sign.setText('').setVisible(false);
        if (!live) this.drawBarrier(strip.detail, this.roadXAt(y), y, s, areaOf(firstLevelOfArea(area)).area, false, 1, 0, null);
        continue;
      }
      this.placeGateSign(sign, this.roadXAt(y), y, s, live ? this.tallyShown : null, starsRequired(area));
      // The live gate's graphics are update()'s; its sign is placed here like the rest.
      if (!live) this.drawBarrier(strip.detail, this.roadXAt(y), y, s, areaOf(firstLevelOfArea(area)).area, false, 0, 1, sign);
    }
  }

  /** The sign under a bar: `have / need` on the gate being worked toward, the requirement alone further up the road. */
  private placeGateSign(sign: Phaser.GameObjects.Text, x: number, y: number, s: number, have: number | null, need: number): void {
    const B = MAP.barrier;
    sign.setText(have === null ? String(need) : `${have} / ${need}`);
    resize(sign, 26 * s, SHELL.cream);
    // Star at the left of the plate, the count after it, the pair centred on the road.
    const starR = 12 * s;
    const total = starR * 2 + 10 * s + sign.width;
    sign.setPosition(x - total / 2 + starR * 2 + 10 * s, MapScene.gateSignTop(y, s) + B.sign.height * s / 2 + 1 * s).setAlpha(1);
  }

  /** Top of the plate under a gate's bar, with the bar down. The sign text and the plate agree through this. */
  private static gateSignTop(y: number, s: number): number {
    const B = MAP.barrier;
    return y - (B.height - B.bar - 12) * s;
  }

  /** Re-word the live gate's sign for the shown count, in place. */
  private refreshLiveSign(): void {
    const sign = this.gateTexts[this.liveGate - this.firstBand];
    const y = sign && this.liveGate >= 1 ? this.boundaryY(this.liveGate) : null;
    if (!sign || y === null) return;
    this.placeGateSign(sign, this.roadXAt(y), y, this.uiScale, this.tallyShown, starsRequired(this.liveGate));
  }

  /**
   * Two posts, a striped bar pivoting on the left one, and a plate hanging under it.
   * `lift` is 0 for a bar across the road and 1 for one swung clear of it.
   */
  private drawBarrier(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, area: Area, active: boolean, lift: number, bar: number, sign: Phaser.GameObjects.Text | null): void {
    const B = MAP.barrier;
    const half = (MAP.roadWidth / 2 + B.reach) * s;
    const post = B.post * s, height = B.height * s;
    const wood = faces(SHELL.wood);
    const shadow = castShadow(6);
    // Posts, with the bar's shadow on the road between them while the bar is down.
    for (const px of [x - half, x + half]) {
      g.fillStyle(0x1a1410, shadow.alpha).fillEllipse(px + shadow.dx * s, y + shadow.dy * s + 2 * s, post * 2.2, post * 0.8);
      g.fillStyle(wood.shade).fillRoundedRect(px - post / 2, y - height + 4 * s, post, height, post * 0.3);
      g.fillStyle(wood.face).fillRoundedRect(px - post / 2, y - height, post, height, post * 0.3);
      g.lineStyle(STYLE.current.outline * s * 0.5, shade(SHELL.wood, -0.6), 1).strokeRoundedRect(px - post / 2, y - height, post, height, post * 0.3);
      g.fillStyle(faces(BRASS).edge).fillCircle(px, y - height, post * 0.42);
      g.fillStyle(BRASS).fillCircle(px, y - height - 1.5 * s, post * 0.42);
    }
    // The bar, as a rotated slab about the left post's cap. `bar` is its alpha: a lifted
    // bar fades once it is up, or it would stand across the puck it just opened the road to.
    const pivot = { x: x - half, y: y - height + B.bar * s * 0.5 + 2 * s };
    if (bar <= 0.01) return;
    const angle = -lift * 1.32;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const length = half * 2;
    const thick = B.bar * s;
    const at = (along: number, across: number): Phaser.Math.Vector2 =>
      new Phaser.Math.Vector2(pivot.x + along * cos - across * sin, pivot.y + along * sin + across * cos);
    const slab = (from: number, to: number, colour: number, alpha = 1, inset = 0): void => {
      g.fillStyle(colour, alpha * bar).fillPoints([at(from, -thick / 2 + inset), at(to, -thick / 2 + inset), at(to, thick / 2 - inset), at(from, thick / 2 - inset)], true);
    };
    const stripeA = active ? PALETTE.coral : shade(area.ground, -0.28);
    const stripeB = active ? SHELL.cream : mix(area.paper, area.ground, 0.3);
    if (lift < 0.05) {
      g.fillStyle(0x1a1410, shadow.alpha * bar).fillPoints([at(0, thick * 0.6 + 4 * s), at(length, thick * 0.6 + 4 * s), at(length, thick * 0.9 + 4 * s), at(0, thick * 0.9 + 4 * s)], true);
    }
    g.lineStyle(STYLE.current.outline * s * 0.55, shade(stripeA, -0.6), bar)
      .strokePoints([at(0, -thick / 2), at(length, -thick / 2), at(length, thick / 2), at(0, thick / 2)], true);
    slab(0, length, stripeB);
    const stripes = 5;
    for (let i = 0; i < stripes; i += 2) slab(length * i / stripes, length * (i + 1) / stripes, stripeA);
    g.fillStyle(0xffffff, 0.22 * bar).fillPoints([at(2 * s, -thick / 2 + 2 * s), at(length - 2 * s, -thick / 2 + 2 * s), at(length - 2 * s, -thick / 2 + 4.5 * s), at(2 * s, -thick / 2 + 4.5 * s)], true);
    g.fillStyle(faces(BRASS).face, bar).fillCircle(pivot.x, pivot.y, post * 0.28);
    // The sign hangs under the bar's middle and fades as the bar goes up: it stays put
    // rather than swinging with the bar, so the count is readable until it is gone.
    if (sign !== null) {
      const alpha = Math.max(0, 1 - Math.min(1, lift * 2));
      sign.setAlpha(alpha);
      if (alpha > 0) {
        const w = B.sign.width * s, h = B.sign.height * s;
        const barBottom = pivot.y + thick / 2;
        const top = MapScene.gateSignTop(y, s);
        g.lineStyle(2.5 * s, SHELL.rope, alpha).lineBetween(x - w * 0.3, barBottom, x - w * 0.3, top).lineBetween(x + w * 0.3, barBottom, x + w * 0.3, top);
        const fill = active ? shade(PALETTE.ink, -0.1) : mix(SHELL.wood, area.road, 0.35);
        g.fillStyle(0x1a1410, shadow.alpha * alpha).fillRoundedRect(x - w / 2 + shadow.dx * s, top + shadow.dy * s + 5 * s, w, h, 12 * s);
        g.fillStyle(faces(fill).shade, alpha).fillRoundedRect(x - w / 2, top + 5 * s, w, h, 12 * s);
        g.fillStyle(fill, alpha).fillRoundedRect(x - w / 2, top, w, h, 12 * s);
        g.lineStyle(STYLE.current.outline * s * 0.5, shade(fill, -0.6), alpha).strokeRoundedRect(x - w / 2, top, w, h, 12 * s);
        // The star sits where `placeGateSign` left room for it, ahead of the count.
        const starR = 12 * s;
        const total = starR * 2 + 10 * s + sign.width;
        drawStar(g, x - total / 2 + starR, top + h / 2, starR, STAR_PRIZE, alpha);
      }
    }
  }

  /**
   * The collection on the bench: a brass star, the count, and the next gate's ask, with
   * a slim track filling toward it. This is where an earned star flies to, so it lives
   * in screen space next to the beads and is redrawn while it rings.
   */
  private drawTally(s: number, now: number): void {
    const g = this.tally.clear();
    const goal = this.goalGate();
    const beadY = this.blockRect.bottom + 12 * s + 26 * s;
    const right = this.blockRect.right - 12 * s;
    this.tallyGoal.setText(`/ ${goal.required}`);
    resize(this.tallyGoal, 22 * s, PALETTE.muted, STYLE.current, false);
    this.tallyGoal.setPosition(right, beadY);
    this.tallyCount.setText(String(this.tallyShown));
    resize(this.tallyCount, 30 * s, PALETTE.ink, STYLE.current, false);
    this.tallyCount.setPosition(right - this.tallyGoal.width - 6 * s, beadY);
    const starR = MAP.tally.star * s;
    this.tallyAt = { x: this.tallyCount.x - this.tallyCount.width - 14 * s - starR, y: beadY };
    const ring = tallyRing(now - this.landedAt, STYLE.current.exaggeration);
    if (ring.glow > 0.02) {
      g.fillStyle(0xffe7a0, ring.glow * 0.5).fillCircle(this.tallyAt.x, this.tallyAt.y, starR * (1.4 + ring.glow * 0.6));
      g.lineStyle(Math.max(1.5, 3 * s), 0xffe7a0, ring.glow * 0.7).strokeCircle(this.tallyAt.x, this.tallyAt.y, starR * (1.2 + (1 - ring.glow) * 2.2));
    }
    drawStarMark(g, {
      x: this.tallyAt.x, y: this.tallyAt.y, radius: starR, color: STAR_PRIZE,
      pose: { alpha: 1, drop: 0, scaleX: 1 + ring.squash, scaleY: 1 - ring.squash * 0.8, spin: 0, fill: 1, glow: ring.glow * 0.5, shine: 0, twinkle: 0, lift: 0, landed: true },
    });
    // The track: from the star to the bench's edge, filled as far as the collection has come.
    const trackY = beadY + 24 * s, trackH = 5 * s;
    const left = this.tallyAt.x - starR;
    g.fillStyle(shade(SHELL.bench, -0.22), 1).fillRoundedRect(left, trackY - trackH / 2, right - left, trackH, trackH / 2);
    const share = goal.required > 0 ? Math.min(1, this.tallyShown / goal.required) : 1;
    if (share > 0) g.fillStyle(STAR_PRIZE, 1).fillRoundedRect(left, trackY - trackH / 2, Math.max(trackH, (right - left) * share), trackH, trackH / 2);
  }

  /** Redo the bake and the bench once the collection has moved: a landed flight, a lifted gate. */
  private rebake(): void {
    const s = this.uiScale;
    this.bake(s, true);
    this.drawDock(s, 0);
    this.drawTally(s, performance.now() / 1000);
    this.pressDirty = true;
    this.cullStrips();
  }

  /** Stars on their own small slab, so they never sit directly on the road surface. */
  private drawStars(g: Phaser.GameObjects.Graphics, x: number, y: number, stars: number, area: Area, s: number): void {
    const plate = shade(area.paper, -0.03);
    drawPanel(g, new Phaser.Geom.Rectangle(x - 46 * s, y - 17 * s, 92 * s, 34 * s), s, { fill: plate, depth: 4, radius: 17 });
    for (let k = 0; k < 3; k++) {
      drawStar(g, x + (k - 1) * 24 * s, y, 9 * s, starColour(k < stars, shade(area.ink, 0.1), plate));
    }
  }

  /** Places a screen-space object as if it hung from the ceiling anchor, rotated by `angle`. */
  private hang(target: { setPosition(x: number, y: number): unknown; setRotation(r: number): unknown }, lx: number, ly: number, angle: number, drop: number): void {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    target.setPosition(this.ceiling.x + lx * cos - ly * sin, this.ceiling.y + drop + lx * sin + ly * cos);
    target.setRotation(angle);
  }

  /** The header: a sign on two ropes over the road, fixed to the camera. */
  private drawSign(s: number, angle: number, drop: number): void {
    const { safe, full } = this.viewport;
    const w = MAP.sign.width * s, h = MAP.sign.height * s;
    this.ceiling = { x: safe.centerX - 310 * s + w / 2, y: full.y - 4 * s };
    const ropeLength = safe.top + MAP.sign.top * s - this.ceiling.y;
    this.signRect.setTo(-w / 2, ropeLength, w, h);
    const g = this.signBack.clear();
    const inset = w / 2 - MAP.sign.ropeInset * s;
    drawRopes(g, s, ropeLength, [-inset, inset], 8);
    drawPanel(g, this.signRect, s, { fill: SHELL.wood, depth: 10, hero: true });
    this.hang(this.signBack, 0, 0, angle, drop);
    placeSurface(this.signSurface, this.signRect, s);
    // The surface tile and the texts are separate objects: each is hung from the same anchor.
    const inner = STYLE.current.radius * s * 0.7;
    this.hang(this.signSurface, this.signRect.x + inner, this.signRect.y + inner, angle, drop);
    const current = areaOf(this.progress.unlocked);
    const view = viewHealth(this.health);
    const hud = healthHud(view, { premium: monetization().premium() });
    const waiting = hud.wait !== null;
    const healthW = 118 * s;
    this.status.setText(current.name);
    resize(this.status, 40 * s, SHELL.cream);
    if (this.status.width > w - 36 * s - healthW) {
      resize(this.status, Math.max(28 * s, 40 * s * (w - 36 * s - healthW) / this.status.width), SHELL.cream);
    }
    this.hang(this.status, this.signRect.x + 20 * s, this.signRect.y + h * 0.5, angle, drop);
    const heartY = this.signRect.y + h * (waiting ? 0.38 : 0.5);
    const heartX = this.signRect.right - 88 * s;
    this.healthMark.clear();
    drawHeart(this.healthMark, 0, 0, 11 * s, view.hearts === 0 && !monetization().premium() ? mix(SHELL.cream, PALETTE.coral, 0.35) : SHELL.cream);
    this.hang(this.healthMark, heartX, heartY, angle, drop);
    this.healthCount.setText(hud.count);
    resize(this.healthCount, 28 * s, SHELL.cream);
    this.hang(this.healthCount, this.signRect.right - 16 * s, heartY, angle, drop);
    this.healthWait.setText(hud.wait ?? '');
    this.healthWait.setVisible(waiting);
    if (waiting) {
      resize(this.healthWait, 18 * s, SHELL.cream, STYLE.current, false);
      this.hang(this.healthWait, this.signRect.right - 16 * s, this.signRect.y + h * 0.72, angle, drop);
    }
  }

  /** Re-hang the already-painted sign. The intro swing only needs this, not a redraw. */
  private poseSign(s: number, angle: number, drop: number): void {
    const h = this.signRect.height;
    const inner = STYLE.current.radius * s * 0.7;
    const waiting = this.healthWait.visible;
    this.hang(this.signBack, 0, 0, angle, drop);
    this.hang(this.signSurface, this.signRect.x + inner, this.signRect.y + inner, angle, drop);
    this.hang(this.status, this.signRect.x + 20 * s, this.signRect.y + h * 0.5, angle, drop);
    const heartY = this.signRect.y + h * (waiting ? 0.38 : 0.5);
    const heartX = this.signRect.right - 88 * s;
    this.hang(this.healthMark, heartX, heartY, angle, drop);
    this.hang(this.healthCount, this.signRect.right - 16 * s, heartY, angle, drop);
    if (waiting) this.hang(this.healthWait, this.signRect.right - 16 * s, this.signRect.y + h * 0.72, angle, drop);
  }

  /** Back, settings and mute as pucks at the top right, clear of the sign's swing. */
  private drawPucks(s: number, press: number): void {
    const { safe } = this.viewport;
    const gap = Math.max(88 * s, this.controlSize + 4 * s);
    this.muteAt = { x: safe.right - 56 * s, y: safe.top + 66 * s };
    this.setupAt = { x: this.muteAt.x - gap, y: this.muteAt.y };
    this.backAt = { x: this.setupAt.x - gap, y: this.muteAt.y };
    const g = this.pucks.clear();
    const sinkOf = (key: 'back' | 'setup' | 'mute') => (this.puckPressed === key ? press : 0);
    for (const [key, at] of [['back', this.backAt], ['setup', this.setupAt], ['mute', this.muteAt]] as const) {
      drawPuck(g, at.x, at.y, s, sinkOf(key));
    }
    drawBack(g, this.backAt.x, this.backAt.y + puckSink(s, sinkOf('back')), CHROME.puckRadius * s * 0.42, PALETTE.ink);
    drawGear(g, this.setupAt.x, this.setupAt.y + puckSink(s, sinkOf('setup')), CHROME.puckRadius * s * 0.52, PALETTE.ink, 1);
    drawSpeaker(g, this.muteAt.x, this.muteAt.y + puckSink(s, sinkOf('mute')), CHROME.puckRadius * s * 0.5, PALETTE.ink, this.muted);
  }

  /** The footer: a bench across the frame, the next level's block on it, the area's ten beads. */
  private drawDock(s: number, press: number): void {
    const { safe, full } = this.viewport;
    const y = this.footerTop;
    const g = this.dock.clear();
    // The bench: only its top face and edge are on screen, so it is three flat strips rather
    // than a slab whose shadow and side wall would be drawn under the frame every frame.
    const bench = faces(SHELL.bench);
    g.fillStyle(bench.face).fillRect(full.x, y, full.width, full.bottom - y);
    g.fillStyle(bench.rim, 0.6).fillRect(full.x, y + 2 * s, full.width, 3 * s);
    g.fillStyle(shade(SHELL.bench, -0.6)).fillRect(full.x, y - STYLE.current.outline * s * 0.55, full.width, STYLE.current.outline * s * 0.55);
    const height = Math.max(112 * s, this.controlSize + 16 * s);
    this.blockRect.setTo(safe.centerX - 310 * s, y + 20 * s, 620 * s, height);
    drawPanel(g, this.blockRect, s, { fill: SHELL.puck, depth: 12, press, hero: true });
    const sink = 12 * s * press * 0.8;
    placeSurface(this.dockSurface, this.blockRect, s, sink);
    const level = this.progress.unlocked;
    const held = this.heldBy(level);
    const definition = VIGNETTES.find(v => v.id === levelSpec(level).vignette)!;
    const bx = this.blockRect.x, by = this.blockRect.y + sink;
    // Held at a gate, the block stops being the next level's and becomes the errand:
    // how many stars the area wants, and a way back down the road to find them.
    this.dockTitle.setText(held === null ? definition.title
      : `${held.short} more ${held.short === 1 ? 'star' : 'stars'} for ${areaOf(held.level).name}`);
    // Caption size on cream: the same undressed Fredoka the locked numbers use, so the
    // outline does not close the counters on a 30-unit word.
    resize(this.dockTitle, 30 * s, PALETTE.ink, STYLE.current, false);
    const r = Math.max(40 * s, this.controlSize / 2);
    const cx = this.blockRect.right - 24 * s - r, cy = this.blockRect.centerY + sink;
    const room = cx - r - 16 * s - (bx + 24 * s);
    if (this.dockTitle.width > room) resize(this.dockTitle, Math.max(20 * s, 30 * s * room / this.dockTitle.width), PALETTE.ink, STYLE.current, false);
    this.dockTitle.setPosition(bx + 24 * s, by + height * 0.5);
    if (held === null) {
      drawDisc(g, cx, cy, r, s, { fill: PALETTE.coral, depth: 9, press });
      drawPlay(g, cx + 2 * s, cy + 9 * s * press * 0.8, r * 0.42, SHELL.cream);
    } else {
      // Brass, and a chevron back down the road: the tap replays the finished level with
      // the most to give, which never costs a heart.
      drawDisc(g, cx, cy, r, s, { fill: BRASS, depth: 9, press });
      drawStar(g, cx, cy - r * 0.12 + 9 * s * press * 0.8, r * 0.36, SHELL.cream);
      drawChevron(g, cx, cy + r * 0.52 + 9 * s * press * 0.8, r * 0.16, shade(BRASS, -0.62));
    }
    this.dockRect.setTo(this.blockRect.x - 8 * s, this.blockRect.y - 8 * s, this.blockRect.width + 16 * s, this.blockRect.height + 16 * s);
    // Ten beads for the ten stops in the current area.
    const beadY = this.blockRect.bottom + 12 * s + 26 * s;
    const at = (level - 1) % PROGRESSION.areaSize;
    for (let i = 0; i < PROGRESSION.areaSize; i++) {
      const x = this.blockRect.x + 12 * s + i * 28 * s;
      const colour = i === at ? PALETTE.coral : i < at ? PALETTE.ink : shade(SHELL.bench, -0.25);
      const f = faces(colour);
      const rr = (i === at ? 7 : 6) * s;
      g.fillStyle(f.edge, 1).fillCircle(x, beadY + 2.5 * s, rr);
      g.fillStyle(f.face, 1).fillCircle(x, beadY, rr);
      g.fillStyle(f.rim, 0.8).fillCircle(x - rr * 0.3, beadY - rr * 0.35, rr * 0.3);
    }
    this.drawTally(s, performance.now() / 1000);
  }

  /**
   * Empty hearts. The old sheet was a plate with three stacked grey buttons on it and a
   * line of copy; it stated the problem and then offered three near-identical answers.
   * The refined sheet ranks them: the hearts themselves say what is gone and how far the
   * next one has come, the free daily heart is offered first when it is there, the
   * rewarded watch is the one coral block, and paying — once for five, or once for good —
   * sits under it. The way out of the sheet is a control, not a tap on the backdrop.
   */
  private drawRest(s: number, press: number): void {
    const shown = this.restShown;
    const hasDaily = shown && this.restDailyOpen;
    const hasTip = shown && this.restTipOpen;
    const entitled = monetization().premium();
    this.restScrim.setVisible(shown);
    this.restPlate.setVisible(shown);
    this.restSurface.setVisible(shown);
    this.restControls.setVisible(shown);
    this.restTitle.setVisible(shown);
    this.restWait.setVisible(shown);
    this.restSheen.setVisible(shown && !entitled);
    for (const [name, text] of Object.entries(this.restTexts)) {
      const daily = name.startsWith('daily');
      const premium = name.startsWith('premium');
      const tip = name.startsWith('tip');
      text.setVisible(shown && (daily ? hasDaily : premium ? !entitled : tip ? hasTip && (name !== 'tipGo' || this.restTipLevel !== null) : name !== 'note' || this.restNote !== ''));
    }
    if (!shown) {
      this.restScrim.clear();
      this.restPlate.clear();
      this.restControls.clear();
      return;
    }
    const { safe, full } = this.viewport;
    const view = viewHealth(this.health);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const width = Math.min(656 * s, safe.width - 36 * s);
    const left = safe.centerX - width / 2;

    // Heights first, so the sheet is exactly as tall as what is in it.
    const dailyH = hasDaily ? Math.max(124 * s, control) : 0;
    const watchH = Math.max(152 * s, control);
    const refillH = Math.max(118 * s, control);
    const premiumH = entitled ? 0 : Math.max(142 * s, control);
    const backH = Math.max(104 * s, control);
    const noteH = this.restNote === '' ? 0 : 44 * s;
    const gap = 22 * s;
    const head = 250 * s;
    const rest = head + (hasDaily ? dailyH + gap : 0) + watchH + gap + refillH
      + (entitled ? 0 : gap + premiumH) + gap + backH + noteH + 30 * s;
    // The first-time row is the one part of the sheet that can give ground: on a short
    // screen with every other row present it keeps its title and its control and drops
    // the sentence, rather than pushing the way out off the bottom.
    const tipFull = Math.max(178 * s, control + 24 * s);
    const tipCompact = Math.max(96 * s, control + 24 * s);
    const room = safe.height - 48 * s;
    const tipH = !hasTip ? 0 : rest + tipFull + gap <= room ? tipFull : tipCompact;
    const height = rest + (hasTip ? tipH + gap : 0);
    const top = Math.max(safe.top + 24 * s, (safe.top + safe.bottom) / 2 - height / 2);
    this.restRect.setTo(left, top, width, height);

    this.restScrim.clear().fillStyle(PALETTE.ink, 0.52).fillRect(full.x, full.y, full.width, full.height);
    const g = this.restPlate.clear();
    drawPanel(g, this.restRect, s, { fill: SHELL.puck, depth: 14, hero: true, radius: 44 });
    placeSurface(this.restSurface, this.restRect, s);

    const c = this.restControls.clear();
    drawHeartRow(c, {
      centreX: this.restRect.centerX, y: top + 62 * s, count: HEALTH.max, radius: 26 * s, gap: 66 * s,
      filled: view.hearts, part: heartProgress(view),
      full: PALETTE.coral, empty: shade(SHELL.puck, -0.12), emptyOutline: shade(SHELL.puck, -0.45),
    });
    resize(this.restTitle, 68 * s, PALETTE.ink);
    this.restTitle.setPosition(this.restRect.centerX, top + 148 * s);
    resize(this.restWait, 28 * s, PALETTE.muted, STYLE.current, false);
    this.restWait.setWordWrapWidth(width - 56 * s, false);
    this.restWait.setPosition(this.restRect.centerX, top + 208 * s);

    let y = top + head;
    if (hasTip) {
      // Said once, before any offer: the free thing the player already has. The whole
      // row is the target, and the chip names the level so the tap has somewhere to go.
      this.restTipRect.setTo(left + 26 * s, y, width - 52 * s, tipH);
      const r = this.restTipRect;
      const tipPress = this.restPressed === 'tip' ? press : 0;
      drawPanel(c, r, s, { fill: SHELL.cream, depth: 8, press: tipPress, radius: 26 });
      const sink = 8 * s * tipPress * 0.8;
      const starR = 15 * s;
      const starsX = r.x + 26 * s + starR;
      const lineY = r.y + 24 * s + 22 * s + sink;
      for (let k = 0; k < 3; k++) {
        drawStar(c, starsX + k * 30 * s, lineY + (k === 1 ? -4 : 0) * s, starR, shade(SHELL.sun, -0.55), 0.9);
        drawStar(c, starsX + k * 30 * s, lineY + (k === 1 ? -4 : 0) * s - 2 * s, starR, SHELL.sun);
      }
      const title = this.restTexts.tipTitle!;
      resize(title, 28 * s, PALETTE.ink, STYLE.current, false);
      title.setPosition(starsX + 2 * starR + 62 * s, lineY);
      const go = this.restTexts.tipGo!;
      if (this.restTipLevel !== null) {
        go.setText(`Replay level ${this.restTipLevel}`);
        resize(go, 24 * s, SHELL.cream, STYLE.current, false);
        const chipW = Math.max(go.width + 44 * s, 176 * s), chipH = Math.max(60 * s, control * 0.7);
        const chip = new Phaser.Geom.Rectangle(r.right - 22 * s - chipW, lineY - chipH / 2, chipW, chipH);
        drawPanel(c, chip, s, { fill: PALETTE.coral, depth: 8, press: tipPress, radius: 20 });
        go.setPosition(chip.centerX, chip.centerY + 8 * s * tipPress * 0.8);
        // The title yields to the chip rather than running under it.
        title.setWordWrapWidth(Math.max(120 * s, chip.x - 12 * s - title.x), false);
      } else {
        title.setWordWrapWidth(r.right - 24 * s - title.x, false);
      }
      const copy = this.restTexts.tipCopy!;
      const compact = tipH < tipFull;
      copy.setVisible(!compact);
      if (!compact) {
        copy.setText(this.restTipLevel === null ? HEALTH_COPY.firstEmptyMastered : HEALTH_COPY.firstEmpty);
        resize(copy, 23 * s, PALETTE.muted, STYLE.current, false);
        copy.setWordWrapWidth(r.width - 52 * s, false);
        copy.setPosition(r.x + 26 * s, lineY + 40 * s);
      }
      y += tipH + gap;
    } else {
      this.restTipRect.setTo(0, 0, 0, 0);
    }
    if (hasDaily) {
      // A free heart is not an offer to weigh up, so it reads as a row with one control
      // rather than as a fourth block competing with the paid ones.
      this.restDailyRect.setTo(left + 26 * s, y, width - 52 * s, dailyH);
      const r = this.restDailyRect;
      drawPanel(c, r, s, { fill: SHELL.cream, depth: 8, radius: 26 });
      const coinR = 42 * s, coinX = r.x + 26 * s + coinR;
      // The one glow on the sheet, on the one thing that costs nothing.
      c.fillStyle(SHELL.sun, 0.35).fillCircle(coinX, r.centerY, coinR * 1.28);
      drawDisc(c, coinX, r.centerY, coinR, s, { fill: SHELL.sun, depth: 5 });
      drawHeart(c, coinX, r.centerY, coinR * 0.5, PALETTE.coral);
      this.restTexts.dailyTitle!.setPosition(coinX + coinR + 24 * s, r.centerY - 18 * s);
      this.restTexts.dailyTerms!.setPosition(coinX + coinR + 24 * s, r.centerY + 20 * s);
      const claimW = Math.max(176 * s, control);
      const claimRect = new Phaser.Geom.Rectangle(r.right - 22 * s - claimW, r.centerY - control / 2, claimW, control);
      const claimPress = this.restPressed === 'daily' ? press : 0;
      drawPanel(c, claimRect, s, { fill: PALETTE.coral, depth: 10, press: claimPress, radius: 22 });
      this.restTexts.dailyClaim!.setPosition(claimRect.centerX, claimRect.centerY + 10 * s * claimPress * 0.8);
      // The whole row is the target: the button is where the eye goes, not the hit area.
      this.restDailyRect.setTo(r.x, r.y, r.width, r.height);
      y += dailyH + gap;
    }

    this.restWatchRect.setTo(left + 26 * s, y, width - 52 * s, watchH);
    const watchPress = this.restPressed === 'watch' ? press : 0;
    const watch = this.restWatchRect;
    drawPanel(c, watch, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: watchPress, hero: true });
    const watchSink = CHROME.block.depth * s * watchPress * 0.8;
    const discR = 44 * s, discX = watch.x + 28 * s + discR;
    drawActionDisc(c, discX, watch.centerY + watchSink, discR, s);
    this.restTexts.watch!.setPosition(discX + discR + 26 * s, watch.centerY - 22 * s + watchSink);
    this.restTexts.watchTerms!.setPosition(discX + discR + 26 * s, watch.centerY + 26 * s + watchSink);
    const chipW = 118 * s, chipH = 64 * s, chipX = watch.right - 26 * s - chipW;
    c.fillStyle(shade(PALETTE.coral, -0.5), 0.55).fillRoundedRect(chipX, watch.centerY - chipH / 2 + watchSink, chipW, chipH, 18 * s);
    this.restTexts.watchPlus!.setPosition(chipX + 38 * s, watch.centerY + watchSink);
    drawHeart(c, chipX + chipW - 34 * s, watch.centerY + watchSink, 17 * s, SHELL.cream, 1, shade(PALETTE.coral, -0.6));
    y += watchH + gap;

    this.restRefillRect.setTo(left + 26 * s, y, width - 52 * s, refillH);
    const refillPress = this.restPressed === 'refill' ? press : 0;
    const refill = this.restRefillRect;
    drawPanel(c, refill, s, { fill: SHELL.bench, depth: 12, press: refillPress, radius: 26 });
    const refillSink = 12 * s * refillPress * 0.8;
    for (let i = 0; i < 3; i++) drawHeart(c, refill.x + 40 * s + i * 34 * s, refill.centerY + refillSink, 16 * s, PALETTE.coral);
    resize(this.restTexts.refill!, 36 * s, PALETTE.ink, STYLE.current, false);
    this.restTexts.refill!.setPosition(refill.x + 158 * s, refill.centerY + refillSink);
    this.restTexts.refillPrice!.setPosition(refill.right - 28 * s, refill.centerY + refillSink);
    y += refillH + gap;

    if (!entitled) {
      this.restPremiumRect.setTo(left + 26 * s, y, width - 52 * s, premiumH);
      const premium = this.restPremiumRect;
      const premiumPress = this.restPressed === 'premium' ? press : 0;
      drawPanel(c, premium, s, { fill: BRASS, depth: 12, press: premiumPress, hero: true, frame: SHELL.cream });
      const premiumSink = 12 * s * premiumPress * 0.8;
      this.restSheen.place(premium, 32 * s, 5);
      const markR = 34 * s, markX = premium.x + 26 * s + markR;
      drawDisc(c, markX, premium.centerY + premiumSink, markR, s, { fill: shade(BRASS, 0.3), depth: 5 });
      drawInfinity(c, markX, premium.centerY + premiumSink, markR * 0.56, shade(BRASS, -0.62));
      const price = this.restTexts.premiumPrice!;
      const pw = price.width + 32 * s, ph = 52 * s;
      const copyX = markX + markR + 24 * s;
      // The copy stops where the price chip starts, so the longest locale cannot run under it.
      resize(this.restTexts.premiumTerms!, 21 * s, shade(BRASS, -0.62), STYLE.current, false);
      this.restTexts.premiumTerms!.setWordWrapWidth(premium.right - 40 * s - pw - copyX, false);
      this.restTexts.premium!.setPosition(copyX, premium.centerY - 20 * s + premiumSink);
      this.restTexts.premiumTerms!.setPosition(copyX, premium.centerY + 24 * s + premiumSink);
      c.fillStyle(shade(PALETTE.coral, -0.45), 1).fillRoundedRect(premium.right - 24 * s - pw, premium.centerY - ph / 2 + 3 * s + premiumSink, pw, ph, 14 * s);
      c.fillStyle(PALETTE.coral, 1).fillRoundedRect(premium.right - 24 * s - pw, premium.centerY - ph / 2 + premiumSink, pw, ph, 14 * s);
      price.setPosition(premium.right - 24 * s - pw / 2, premium.centerY + premiumSink);
      y += premiumH + gap;
    } else {
      this.restPremiumRect.setTo(0, 0, 0, 0);
    }

    this.restBackRect.setTo(left + 26 * s, y, width - 52 * s, backH);
    const backPress = this.restPressed === 'back' ? press : 0;
    drawPanel(c, this.restBackRect, s, { fill: SHELL.cream, depth: 10, press: backPress, radius: 26 });
    const backSink = 10 * s * backPress * 0.8;
    const backText = this.restTexts.back!;
    resize(backText, 36 * s, PALETTE.ink, STYLE.current, false);
    drawBack(c, this.restBackRect.centerX - backText.width / 2 - 26 * s, this.restBackRect.centerY + backSink, 18 * s, PALETTE.ink);
    backText.setPosition(this.restBackRect.centerX + 16 * s, this.restBackRect.centerY + backSink);
    y += backH;

    const note = this.restTexts.note!;
    note.setText(this.restNote).setWordWrapWidth(width - 56 * s, false);
    note.setPosition(this.restRect.centerX, y + 24 * s);
  }

  private restText(text: Phaser.GameObjects.Text, originX: number, originY: number): Phaser.GameObjects.Text {
    return text.setOrigin(originX, originY).setScrollFactor(0).setDepth(22);
  }

  private showRest(level: number): void {
    if (monetization().premium()) return;
    const first = !this.restShown;
    this.restShown = true;
    this.restDailyOpen = canClaimDailyHeart(this.health);
    // The tip stays on the sheet for the whole visit once it has opened, and is marked
    // seen on the first showing, so it is said once — not once per sheet.
    this.restTipOpen = this.restTipFresh;
    if (this.restTipOpen) {
      this.restTipLevel = levelToPolish(this.progress);
      if (first) markReplayTipSeen();
    }
    this.restPressed = null;
    this.restNote = '';
    this.restAt = performance.now() / 1000;
    this.refreshRestCopy();
    this.drawRest(this.uiScale, 0);
    this.restPressDirty = true;
    if (first) {
      track('health_empty', { level });
      track('rewarded_offer_shown', { placement: 'map' });
      track('purchase_offer_shown', { product: PRODUCT.heartRefill });
      track('purchase_offer_shown', { product: PRODUCT.premium });
    }
  }

  private hideRest(): void {
    if (!this.restShown) return;
    this.restShown = false;
    this.restDailyOpen = false;
    this.restTipOpen = false;
    this.restPressed = null;
    this.drawRest(this.uiScale, 0);
  }

  /**
   * The first-time row's tap: straight into the finished level it named, which never
   * costs a heart. With nothing to name, the row is a second way back to the map.
   */
  private replayFromRest(): void {
    const level = this.restTipLevel;
    this.restPressed = 'tip';
    this.restPressedAt = performance.now() / 1000;
    this.restPressDirty = true;
    this.hideRest();
    if (level !== null) this.openLevel(level);
  }

  private async watchAd(): Promise<void> {
    if (this.restBusy || this.curtain.active) return;
    this.restBusy = true;
    this.restPressed = 'watch';
    this.restPressedAt = performance.now() / 1000;
    this.restPressDirty = true;
    const claimId = `map:${++this.watchClaims}`;
    try {
      const result = await monetization().showRewarded();
      if (result.ok) this.health = redeemHeart(claimId).health;
      if (this.disposed) return;
      if (!result.ok) {
        this.restNote = rewardedFeedback(result.reason);
        this.drawRest(this.uiScale, 0);
        return;
      }
      this.hideRest();
      this.drawSign(this.uiScale, 0, 0);
    } finally {
      this.restBusy = false;
    }
  }

  private async buyFill(): Promise<void> {
    if (this.restBusy || this.curtain.active) return;
    this.restBusy = true;
    this.restPressed = 'refill';
    this.restPressedAt = performance.now() / 1000;
    this.restPressDirty = true;
    try {
      const result = await monetization().purchase(PRODUCT.heartRefill);
      if (result.ok) this.health = redeemFill(result.claimId).health;
      if (this.disposed) return;
      if (!result.ok) {
        this.restNote = purchaseFeedback(result.reason);
        this.drawRest(this.uiScale, 0);
        return;
      }
      if (this.health.hearts <= 0) {
        this.restNote = purchaseFeedback('failed');
        this.drawRest(this.uiScale, 0);
        return;
      }
      this.hideRest();
      this.drawSign(this.uiScale, 0, 0);
    } finally {
      this.restBusy = false;
    }
  }

  /**
   * Premium from the sheet. It ends the wait rather than paying this one off, so the
   * sheet closes on success and the header's heart count becomes the infinity mark.
   */
  private async buyPremium(): Promise<void> {
    if (this.restBusy || this.curtain.active || monetization().premium()) return;
    this.restBusy = true;
    this.restPressed = 'premium';
    this.restPressedAt = performance.now() / 1000;
    this.restPressDirty = true;
    track('purchase_offer_shown', { product: PRODUCT.premium });
    try {
      const result = await monetization().purchase(PRODUCT.premium);
      if (this.disposed) return;
      if (!result.ok) {
        this.restNote = purchaseFeedback(result.reason);
        this.drawRest(this.uiScale, 0);
        return;
      }
      this.hideRest();
      this.layout();
    } finally {
      this.restBusy = false;
    }
  }

  private claimToday(): void {
    if (this.restBusy || this.curtain.active) return;
    this.restBusy = true;
    this.restPressed = 'daily';
    this.restPressedAt = performance.now() / 1000;
    this.restPressDirty = true;
    try {
      const result = redeemDailyHeart();
      this.health = result.health;
      if (this.disposed) return;
      if (!result.granted) {
        this.restDailyOpen = false;
        this.restNote = '';
        this.drawRest(this.uiScale, 0);
        return;
      }
      this.hideRest();
      this.drawSign(this.uiScale, 0, 0);
    } finally {
      this.restBusy = false;
    }
  }

  private refreshHealthHud(): void {
    const view = viewHealth(this.health);
    const hud = healthHud(view, { premium: monetization().premium() });
    const wait = hud.wait ?? '';
    if (this.healthCount.text !== hud.count || this.healthWait.visible !== (hud.wait !== null)) {
      this.drawSign(this.uiScale, 0, 0);
      return;
    }
    if (this.healthWait.text !== wait) this.healthWait.setText(wait);
  }

  /**
   * One line under the title: when the next heart lands, and the reason waiting is not a
   * dead end. They are one sentence rather than two lines because a player looking at an
   * empty row is reading the number, and the reassurance has to be in the same glance.
   */
  private refreshRestCopy(): void {
    const view = viewHealth(this.health);
    const wait = view.nextHeartInMs === null ? null : formatCountdown(view.nextHeartInMs);
    const copy = wait === null ? HEALTH_COPY.restNote : `Next heart in ${wait} · early levels stay open`;
    if (this.restWait.text !== copy) this.restWait.setText(copy);
    const refill = monetization().productPrice(PRODUCT.heartRefill);
    const premium = monetization().productPrice(PRODUCT.premium);
    this.restTexts.refillPrice?.setText(refill ?? 'Buy');
    this.restTexts.premiumPrice?.setText(premium ?? 'Buy');
  }

  private scrollTo(level: number): void {
    const node = this.nodes[level - this.first];
    if (node) this.scrollY = node.y - (this.hudHeight + (this.footerTop - this.hudHeight) * 0.72);
    this.clampScroll();
  }
  private clampScroll(): void {
    const max = Math.max(0, this.worldHeight - this.viewport.full.height);
    this.scrollY = Math.max(0, Math.min(max, this.scrollY));
    this.cameras.main.setScroll(0, this.scrollY);
  }

  public override update(_time: number, delta: number): void {
    if (!this.drag && Math.abs(this.velocity) > 1) {
      const step = scrollStep(this.velocity, delta, MAP.friction);
      this.scrollY += step.distance;
      this.velocity = step.velocity;
      this.clampScroll();
    }
    const s = this.uiScale;
    const now = performance.now() / 1000;
    const still = this.reducedMotion;
    const ex = STYLE.current.exaggeration;

    // The sign drops in on its ropes and swings itself quiet, then hangs still.
    const age = now - this.enteredAt;
    this.health = reconcile(this.health, Date.now());
    if (this.restShown && this.health.hearts > 0) this.hideRest();
    if (age < 2.4) {
      const entry = still ? { rise: 0 } : arrive(age - 0.1, 0.9);
      const swing = still ? 0 : settle(age - 0.3, 5.2, 1.6) * 0.05 * ex;
      this.poseSign(s, swing, -entry.rise * 200 * s);
      const wait = healthHud(viewHealth(this.health), { premium: monetization().premium() }).wait ?? '';
      if (this.healthWait.text !== wait) this.healthWait.setText(wait);
    } else {
      this.refreshHealthHud();
    }
    if (this.restShown) this.refreshRestCopy();

    // The frontier puck hops once a bar and lands with a spread; a ring rolls out from it.
    const g = this.pulse.clear();
    const frontier = this.nodes[this.frontierIndex];
    if (frontier) {
      const p = this.puckOf(this.frontierIndex);
      const beat = (now % MAP.hopSec);
      const lift = still || beat >= 0.32 ? 0 : Math.sin(Math.PI * beat / 0.32) * 10 * s * ex;
      const { area } = areaOf(this.first + this.frontierIndex);
      this.drawStars(g, frontier.x, frontier.y - lift + p.r + (p.depth + 24) * s, 0, area, s);
      this.drawLevelPuck(g, this.frontierIndex, lift);
      this.numbers[this.frontierIndex]!.setY(frontier.y - lift);
      if (!still) {
        const ring = spring(beat / 0.6, 4.5, 2.2);
        g.lineStyle(STYLE.current.outline * s * 0.55, PALETTE.coral, Math.max(0, 1 - beat / 1.1) * 0.55).strokeCircle(frontier.x, frontier.y - lift, p.r + 4 * s + ring * 22 * s);
      }
    }
    // The gate the collection is working toward, live: its sign counts the landings and
    // its bar lifts on the one that meets it. Under reduced motion a met gate is simply up.
    const liveY = this.liveGate >= 1 ? this.boundaryY(this.liveGate) : null;
    if (liveY !== null) {
      const lifting = this.gateLiftAt > -Infinity;
      const age = now - this.gateLiftAt;
      const lift = !lifting ? 0 : still ? 1 : spring(age / MAP.barrier.liftSec, 4.2, 1.6);
      // Once up, the bar goes and the posts stay, as every passed gate's do.
      const bar = !lifting ? 1 : still ? 0 : Math.max(0, 1 - (age - MAP.barrier.liftSec) / MAP.barrier.barFadeSec);
      this.drawBarrier(g, this.roadXAt(liveY), liveY, s, areaOf(firstLevelOfArea(this.liveGate)).area, true, lift, bar, this.gateTexts[this.liveGate - this.firstBand] ?? null);
    }
    if (!this.flightSettled) this.drawFlight(s, now);
    if (now - this.landedAt < STAR_FLIGHT.ring) this.drawTally(s, now);
    // A tapped locked puck: its number squashes and a ring says "not yet".
    const feedbackAge = now - this.feedbackAt;
    const locked = this.nodes[this.lockedIndex];
    if (locked && feedbackAge < 0.36) {
      const q = still ? 0 : squash(feedbackAge, 0.36, 0.16 * ex);
      this.numbers[this.lockedIndex]!.setScale(1 + q, 1 - q * 0.6);
      const ring = spring(feedbackAge / 0.36, 5, 1.6);
      g.lineStyle(STYLE.current.outline * s * 0.55, PALETTE.coral, (1 - feedbackAge / 0.36) * 0.7).strokeCircle(locked.x, locked.y, this.puckOf(this.lockedIndex).r + 5 * s + ring * 10 * s);
    } else if (locked) { this.numbers[this.lockedIndex]!.setScale(1); this.lockedIndex = -1; }
    // The tap acknowledgement.
    this.touch.clear();
    const touchAge = now - this.touchAt;
    if (touchAge < 0.35) {
      const ring = spring(touchAge / 0.35, 5, 1.6);
      this.touch.lineStyle(STYLE.current.outline * s * 0.55, PALETTE.ink, (1 - touchAge / 0.35) * 0.6).strokeCircle(this.touchPoint.x, this.touchPoint.y + this.scrollY, 12 * s + ring * 30 * s);
    }
    // Every frame, because the scroll moves on inertia and under a thumb alike, and the
    // test is a dozen comparisons against numbers the strips already carry.
    this.cullStrips();
    // Presses redraw only while live, then one frame at rest.
    const press = pressAmount(now, this.pressedAt);
    if (press > 0.001 || this.pressDirty) { this.drawDock(s, Math.max(0, press)); this.pressDirty = press > 0.001; }
    const puckPress = pressAmount(now, this.puckPressedAt);
    if (puckPress > 0.001 || this.puckDirty) { this.drawPucks(s, Math.max(0, puckPress)); this.puckDirty = puckPress > 0.001; }
    const restPress = pressAmount(now, this.restPressedAt);
    if (this.restShown && (restPress > 0.001 || this.restPressDirty)) {
      this.drawRest(s, Math.max(0, restPress));
      this.restPressDirty = restPress > 0.001;
    }
    if (this.restShown) {
      const shownFor = now - this.restAt;
      const alpha = still || shownFor > 0.55 ? 1 : arrive(shownFor, 0.45).alpha;
      this.restScrim.setAlpha(alpha);
      this.restPlate.setAlpha(alpha);
      this.restSurface.setAlpha(alpha);
      this.restControls.setAlpha(alpha);
      this.restTitle.setAlpha(alpha);
      this.restWait.setAlpha(alpha);
      for (const text of Object.values(this.restTexts)) text.setAlpha(alpha);
      this.restSheen.update(now, !monetization().premium());
    }
  }

  /**
   * The stars the finished level earned, leaving its plate and landing on the tally.
   * Each landing steps the count, rings the bench and, on the one that meets the live
   * gate's ask, lifts its bar. When the last has settled the world is rebaked with the
   * collection as it now stands.
   */
  private drawFlight(s: number, now: number): void {
    const earned = this.earned!;
    const count = earned.after - earned.before;
    const mapAge = now - this.enteredAt;
    const landed = starsLanded(mapAge, count);
    if (landed > this.landedCount) {
      this.landedCount = landed;
      this.tallyShown = this.stars - count + landed;
      this.landedAt = now;
      const audio = currentAudio(this);
      // A tick per landing on the engine's own count voice, and the readiness tick for the last.
      audio?.play(audio.context.currentTime, landed === count ? 'ready' : 'count');
      this.refreshLiveSign();
      // The landing that meets the ask lifts the bar, a beat after the count shows it.
      if (this.gateLiftAt === -Infinity && this.liveGate >= 1 && areaOpen(this.liveGate, this.tallyShown)) this.gateLiftAt = now + 0.12;
      this.drawDock(s, 0);
    }
    const g = this.flight.clear();
    if (flightDone(mapAge, count)) {
      this.flightSettled = true;
      this.rebake();
      return;
    }
    // From the socket each star was drawn in on the plate. The level is usually on
    // screen — the map is centred on the one after it — and if it has been scrolled away
    // the star still comes from where its plate is, and enters the frame on its arc.
    const index = earned.level - this.first;
    const node = this.nodes[index];
    const p = node ? this.puckOf(index) : null;
    const plateY = node && p ? node.y + p.r + (p.depth + 24) * s - this.scrollY : this.viewport.full.bottom + 30 * s;
    const to = this.tallyAt;
    const radius = MAP.tally.star * s;
    for (let i = 0; i < count; i++) {
      const pose = starFlightPose(starFlightAge(mapAge, i), STYLE.current.exaggeration);
      if (!pose.started || pose.landed) continue;
      const slot = earned.before + i;
      const from = { x: node ? node.x + (slot - 1) * 24 * s : this.viewport.safe.centerX, y: plateY };
      for (let k = STAR_FLIGHT.trail; k >= 1; k--) {
        const ghost = starFlightPose(starFlightAge(mapAge, i) - k * STAR_FLIGHT.trailStep, STYLE.current.exaggeration);
        if (!ghost.started) continue;
        const at = flightPath(from, to, ghost.t);
        drawStar(g, at.x, at.y, radius * ghost.scale * (1 - k * 0.16), STAR_PRIZE, trailAlpha(k, pose.lift));
      }
      const at = flightPath(from, to, pose.t);
      g.fillStyle(0xffe7a0, 0.28 * pose.lift).fillCircle(at.x, at.y, radius * pose.scale * 1.5);
      drawStarMark(g, {
        x: at.x, y: at.y, radius: radius * pose.scale, color: STAR_PRIZE,
        pose: { alpha: 1, drop: 0, scaleX: 1, scaleY: 1, spin: pose.spin, fill: 1, glow: pose.lift * 0.9, shine: pose.lift, twinkle: 0, lift: pose.lift, landed: false },
      });
    }
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.curtain.active || this.drag || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.drag = { id: pointer.id, scrollable: !this.restShown && pointer.y > this.hudHeight && pointer.y < this.footerTop, lastY: pointer.y, lastAt: performance.now(), startX: pointer.x, startY: pointer.y, moved: false };
    this.velocity = 0;
    this.touchAt = performance.now() / 1000;
    this.touchPoint = { x: pointer.x, y: pointer.y };
  }
  private pointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.id || !pointer.isDown) return;
    const dy = pointer.y - drag.lastY;
    const now = performance.now();
    if (Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > MAP.tapSlop * this.viewport.unitScale) drag.moved = true;
    if (drag.moved && drag.scrollable) {
      this.scrollY -= dy;
      const dt = Math.max(1, now - drag.lastAt) / 1000;
      this.velocity = -dy / dt * 0.6 + this.velocity * 0.4;
      this.clampScroll();
    }
    drag.lastY = pointer.y;
    drag.lastAt = now;
  }
  private pointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.id) return;
    this.drag = null;
    if (drag.moved || pointer.x < 0 || pointer.y < 0 || pointer.x > this.scale.width || pointer.y > this.scale.height) return;
    this.velocity = 0;
    this.handleTap(pointer.x, pointer.y);
  }
  private pressPuck(key: 'back' | 'setup' | 'mute'): void {
    this.puckPressed = key;
    this.puckPressedAt = performance.now() / 1000;
    this.puckDirty = true;
  }
  private handleTap(x: number, y: number): void {
    if (this.curtain.active) return;
    const near = (at: { x: number; y: number }) => Math.abs(x - at.x) < this.controlSize / 2 && Math.abs(y - at.y) < this.controlSize / 2;
    if (near(this.muteAt)) {
      this.muted = toggleMute(sharedAudio(this));
      this.pressPuck('mute');
      return;
    }
    if (near(this.setupAt)) {
      this.pressPuck('setup');
      this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: SceneKey.Map }));
      return;
    }
    if (near(this.backAt)) { this.pressPuck('back'); this.curtain.cover(() => this.scene.start(SceneKey.Menu)); return; }
    if (this.restShown) {
      if (this.restBusy) return;
      if (this.restWatchRect.contains(x, y)) {
        void this.watchAd();
        return;
      }
      if (this.restRefillRect.contains(x, y)) {
        void this.buyFill();
        return;
      }
      if (this.restDailyOpen && this.restDailyRect.contains(x, y)) {
        this.claimToday();
        return;
      }
      if (this.restTipOpen && this.restTipRect.contains(x, y)) {
        this.replayFromRest();
        return;
      }
      if (!monetization().premium() && this.restPremiumRect.contains(x, y)) {
        void this.buyPremium();
        return;
      }
      if (this.restBackRect.contains(x, y) || !this.restRect.contains(x, y)) this.hideRest();
      return;
    }
    if (this.dockRect.contains(x, y)) {
      this.pressedAt = performance.now() / 1000;
      this.pressDirty = true;
      const held = this.heldBy(this.progress.unlocked);
      if (held === null) { this.openLevel(this.progress.unlocked); return; }
      // The errand: the finished level with the most to give, or a look at the gate
      // itself when every finished level already has its three.
      const replay = levelToPolish(this.progress);
      if (replay !== null) this.openLevel(replay);
      else { this.velocity = 0; this.scrollTo(held.level); }
      return;
    }
    if (y < this.hudHeight || y >= this.footerTop) return;
    const worldY = y + this.scrollY;
    const reach = Math.max(MAP.nodeRadius * this.uiScale, this.controlSize / 2);
    const index = this.nodes.findIndex(node => Math.hypot(node.x - x, node.y - worldY) <= reach);
    if (index < 0) return;
    if (this.first + index > this.progress.unlocked || this.heldBy(this.first + index) !== null) {
      if (this.lockedIndex >= 0) this.numbers[this.lockedIndex]!.setScale(1);
      this.lockedIndex = index;
      this.feedbackAt = performance.now() / 1000;
      return;
    }
    this.openLevel(this.first + index);
  }
  private readonly cancelDrag = (): void => { this.drag = null; this.velocity = 0; };

  private wheel(pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void {
    if (this.curtain.active || this.restShown || pointer.y < this.hudHeight || pointer.y >= this.footerTop) return;
    this.cancelDrag();
    this.scrollY += Math.max(-240, Math.min(240, dy)) * this.viewport.unitScale;
    this.clampScroll();
  }
  private openLevel(level: number): void {
    if (!canPlayLevel(this.progress, level) || this.heldBy(level) !== null) return;
    if (!canBeginAttempt(this.health, this.progress, level, Date.now(), monetization().premium())) {
      this.showRest(level);
      return;
    }
    this.velocity = 0;
    hushMusic(this, MUSIC.bedFadeSec);
    this.curtain.cover(() => this.scene.start(SceneKey.Play, { level, autoStart: true }));
  }
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.wheel, this);
    window.removeEventListener('blur', this.cancelDrag);
    window.removeEventListener('touchcancel', this.cancelDrag);
    window.removeEventListener('pointercancel', this.cancelDrag);
    this.restSheen.destroy();
    this.cancelDrag();
  }
}
