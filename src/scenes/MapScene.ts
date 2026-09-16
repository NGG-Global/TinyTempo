import Phaser from 'phaser';
import { reducedMotion } from '@/core/motionPreference';
import { sharedAudio, isMuted, toggleMute } from '@/audio/sharedAudio';
import { PROGRESSION } from '@/config/progression';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { areaOf, levelSpec, starsFor, type Area } from '@/game/levels';
import {
  canBeginAttempt, formatCountdown, healthHud, loadHealth, practiceLevel, reconcile, redeemFill,
  redeemHeart, viewHealth, type Health,
} from '@/game/health';
import { monetization, PRODUCT, purchaseFeedback, rewardedFeedback, track } from '@/monetization';
import { loadProgress, type Progress } from '@/game/progress';
import { MaterialKey } from '@/textures/materials';
import { mix, shade, starColour } from '@/ui/colour';
import { CHROME, drawPuck, drawRopes, pressAmount, puckSink } from '@/ui/chrome';
import { FxKey } from '@/ui/feedback';
import { dashes, smoothPath, type Point } from '@/ui/path';
import { drawGear } from '@/ui/gear';
import { drawBack, drawHeart, drawPlay, drawSpeaker } from '@/ui/icons';
import { castShadow, faces } from '@/ui/light';
import { BRASS, drawDisc, drawPanel, placeSurface, surface } from '@/ui/panel';
import { drawStar } from '@/ui/star';
import { arrive, settle, spring, squash } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';
import { resizedScroll, scrollStep } from '@/ui/navigation';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { VIGNETTES } from '@/vignettes/registry';

/** Design-unit metrics of the road map; every one is multiplied by the viewport scale. */
const MAP = {
  step: 202, nodeRadius: 46, wobble: 0.27, topPad: 320, bottomPad: 660,
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
  /** The frontier puck hops once a bar at the game's own tempo. */
  hopSec: 1.6,
  sign: { width: 340, height: 92, top: 26, ropeInset: 40 },
} as const;

/**
 * Endless, scrollable road of levels grouped into themed areas. Pure presentation of
 * `levelSpec`/`Progress`: the map never decides difficulty, it only draws it.
 *
 * Everything except the frontier puck, the tap ripple and a live press is baked in
 * `layout()`, so the depth work — the raised road, cast shadows, terrain and scenery —
 * costs nothing per frame. The header is a sign hung over the road and the footer a
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
  private world!: Phaser.GameObjects.Graphics;
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
  private restPlate!: Phaser.GameObjects.Graphics;
  private restSurface!: Phaser.GameObjects.TileSprite;
  private restTitle!: Phaser.GameObjects.Text;
  private restWait!: Phaser.GameObjects.Text;
  private restNote!: Phaser.GameObjects.Text;
  private restWatch!: Phaser.GameObjects.Graphics;
  private restWatchLabel!: Phaser.GameObjects.Text;
  private restWatchHint!: Phaser.GameObjects.Text;
  private restWatchMark!: Phaser.GameObjects.Graphics;
  private restRefill!: Phaser.GameObjects.Graphics;
  private restRefillLabel!: Phaser.GameObjects.Text;
  private restRefillHint!: Phaser.GameObjects.Text;
  private restRefillPrice!: Phaser.GameObjects.Text;
  private restRefillMark!: Phaser.GameObjects.Graphics;
  private restAction!: Phaser.GameObjects.Graphics;
  private restActionLabel!: Phaser.GameObjects.Text;
  private restRect = new Phaser.Geom.Rectangle();
  private restWatchRect = new Phaser.Geom.Rectangle();
  private restRefillRect = new Phaser.Geom.Rectangle();
  private restActionRect = new Phaser.Geom.Rectangle();
  private restShown = false;
  private restPractice: number | null = null;
  private restAt = -Infinity;
  private restPressDirty = false;
  private restPressedAt = -Infinity;
  private restPressed: 'watch' | 'refill' | 'practice' | null = null;
  private restBusy = false;
  private watchClaims = 0;
  private curtain!: SceneCurtain;
  private footerTop = 0;
  private lastHeight = 0;
  private feedbackAt = -Infinity;
  private lockedIndex = -1;
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
    this.restPractice = null;
    this.restAt = this.restPressedAt = -Infinity;
    this.restPressed = null;
    this.restBusy = false;
    const data = this.sys.settings.data as { focus?: number } | undefined;
    this.focus = Math.max(1, Math.min(this.progress.unlocked, data?.focus ?? this.progress.unlocked));
    const top = this.progress.unlocked + PROGRESSION.mapLookahead;
    this.first = Math.max(1, Math.min(this.focus - MAP.history, top - MAP.window + 1));
    this.shown = Math.min(top, this.first + MAP.window - 1) - this.first + 1;
    // Bands are addressed absolutely, because the window rarely starts on a band edge.
    this.firstBand = Math.floor((this.first - 1) / PROGRESSION.areaSize);
    this.world = this.add.graphics().setDepth(1);
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
    this.restPlate = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.restSurface = surface(this, MaterialKey.parchment, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, SHELL.puck, 0.5).setScrollFactor(0).setDepth(20);
    this.restTitle = display(this, 'No hearts', { size: 44, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.restWait = body(this, '', { size: 28, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.restNote = body(this, 'Early levels stay open.', { size: 24, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.restWatch = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.restWatchLabel = label(this, 'Watch', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.restWatchHint = label(this, '+1', { size: 22, colour: SHELL.cream, align: 'center' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(21);
    this.restWatchMark = this.add.graphics().setScrollFactor(0).setDepth(21);
    this.restRefill = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.restRefillLabel = label(this, 'Refill', { size: 28, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.restRefillHint = label(this, 'restore 5', { size: 20, colour: PALETTE.ink, align: 'center' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(21);
    this.restRefillPrice = body(this, '', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.restRefillMark = this.add.graphics().setScrollFactor(0).setDepth(21);
    this.restAction = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.restActionLabel = label(this, 'Practice', { size: 26, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
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
    // Level 1 sits at the bottom; the road climbs. x wanders left and right inside the safe frame.
    this.nodes = Array.from({ length: this.shown }, (_, i) => ({
      x: safe.centerX + Math.sin((this.first + i) * 0.9) * safe.width * MAP.wobble,
      y: this.worldHeight - (MAP.bottomPad + i * MAP.step) * s,
    }));
    // The road runs one span past the last node so it leaves the frame rather than stopping.
    const beyond: Point = { x: safe.centerX + Math.sin((this.first + this.shown) * 0.9) * safe.width * MAP.wobble, y: (this.nodes[this.shown - 1]?.y ?? 0) - MAP.step * s };
    this.road = smoothPath([...this.nodes, beyond], MAP.smoothing);
    const g = this.world.clear();
    this.drawTerrain(g, s);
    this.drawRoad(g, s);
    this.drawScenery(g, s);
    this.drawPlaques(g, s);
    this.drawNodes(g, s);
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
  private drawTerrain(g: Phaser.GameObjects.Graphics, s: number): void {
    const { full } = this.viewport;
    const size = PROGRESSION.areaSize;
    for (let k = 0; k < this.areaTitles.length; k++) {
      const band = this.band(k);
      const area = band.area;
      const first = this.nodes[band.from]!;
      const last = this.nodes[band.to]!;
      const isLast = band.atTop;
      const top = isLast ? 0 : last.y - MAP.step * s / 2;
      const bottom = band.atBottom ? this.worldHeight : first.y + MAP.step * s / 2;
      const height = bottom - top;
      g.fillStyle(area.ground).fillRect(full.x, top, full.width, height);
      // Atmospheric recession: the far end of a band hazes toward its own sky colour.
      for (let b = 0; b < MAP.hazeBands; b++) {
        const t = b / MAP.hazeBands;
        const bandTop = top + height * t * 0.55;
        g.fillStyle(mix(area.ground, area.sky, 0.32 * (1 - t)), 1);
        g.fillRect(full.x, bandTop, full.width, height * 0.55 / MAP.hazeBands + 1);
      }
      this.drawTexture(g, area, this.firstBand + k, top, bottom, s);
      if (!isLast) {
        const next = areaOf((this.firstBand + k + 1) * size + 1).area;
        const blend = MAP.blendHeight * s;
        const hazed = mix(area.ground, area.sky, 0.32);
        for (let b = 0; b < MAP.blendBands; b++) {
          const t = b / MAP.blendBands;
          // t = 0 is the boundary itself, so it starts on the neighbour's ground and
          // walks back into this area's. The other way round paints a slab.
          g.fillStyle(mix(next.ground, hazed, t), 1);
          g.fillRect(full.x, top + blend * t, full.width, blend / MAP.blendBands + 1);
        }
      }
    }
  }

  /** Plaques are drawn after the scenery, or a prop lands on top of the name. */
  private drawPlaques(g: Phaser.GameObjects.Graphics, s: number): void {
    for (let k = 0; k < this.areaTitles.length; k++) {
      const band = this.band(k);
      const first = this.nodes[band.from]!;
      this.placePlaque(g, band.area, band.name, k, band.atBottom ? this.worldHeight : first.y + MAP.step * s / 2, s);
    }
  }

  /** A quiet repeating motif per area, so a band reads as ground rather than paint. */
  private drawTexture(g: Phaser.GameObjects.Graphics, area: Area, band: number, top: number, bottom: number, s: number): void {
    const kind = band % 5;
    const ink = shade(area.ground, -0.14);
    const pale = shade(area.ground, 0.16);
    const rows = Math.max(1, Math.floor((bottom - top) / (76 * s)));
    for (let r = 0; r < rows; r++) {
      const y = bottom - (r + 0.5) * (bottom - top) / rows;
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
  private drawRoad(g: Phaser.GameObjects.Graphics, s: number): void {
    const width = MAP.roadWidth * s;
    const outline = STYLE.current.outline * s * 0.55;
    const stroke = (path: readonly Point[], w: number, colour: number, alpha: number, dy = 0): void => {
      g.lineStyle(w, colour, alpha);
      g.beginPath();
      path.forEach((p, i) => g[i === 0 ? 'moveTo' : 'lineTo'](p.x, p.y + dy));
      g.strokePath();
    };
    const shadow = castShadow(6);
    stroke(this.road, width + 10 * s, 0x1a1410, shadow.alpha, shadow.dy * s);
    // One stretch per level. A span that crosses an area boundary is split at its
    // midpoint, which is exactly where the ground changes, so surface and terrain
    // change on the same line instead of a node apart.
    const slices: [readonly Point[], number][] = [];
    for (let i = 0; i < this.shown; i++) {
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
      g.lineStyle(4 * s, 0xffffff, 0.45).lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  /** Props beside the road, each with a cast shadow. The shadows are the depth. */
  private drawScenery(g: Phaser.GameObjects.Graphics, s: number): void {
    const { safe } = this.viewport;
    for (let i = 0; i < this.shown; i++) {
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

  /** The three puck states share one geometry; only the frontier is left out of the bake. */
  private puckOf(i: number): { r: number; depth: number; fill: number; number: number; size: number; state: 'frontier' | 'cleared' | 'locked' } {
    const level = this.first + i;
    const { area } = areaOf(level);
    const s = this.uiScale;
    if (level === this.progress.unlocked) return { r: MAP.nodeRadius * 1.1 * s, depth: 10, fill: PALETTE.coral, number: SHELL.cream, size: 34 * s, state: 'frontier' };
    if (level < this.progress.unlocked) return { r: MAP.nodeRadius * s, depth: 8, fill: area.ink, number: area.paper, size: 30 * s, state: 'cleared' };
    return { r: MAP.nodeRadius * 0.84 * s, depth: 5, fill: mix(area.paper, area.ground, 0.42), number: mix(area.ink, area.ground, 0.12), size: 26 * s, state: 'locked' };
  }

  /** One puck, drawn where it stands or lifted by a hop. */
  private drawLevelPuck(g: Phaser.GameObjects.Graphics, i: number, lift: number): void {
    const node = this.nodes[i]!;
    const p = this.puckOf(i);
    const t = p.state === 'locked' ? { ...STYLE.current, outline: STYLE.current.outline * 0.7 } : STYLE.current;
    drawDisc(g, node.x, node.y - lift, p.r, this.uiScale, { fill: p.fill, depth: p.depth }, t);
  }

  /** Raised pucks with cast shadows, a star plate under each cleared one and a padlock under each locked one. */
  private drawNodes(g: Phaser.GameObjects.Graphics, s: number): void {
    this.frontierIndex = -1;
    for (let i = 0; i < this.shown; i++) {
      const level = this.first + i;
      const { area } = areaOf(level);
      const node = this.nodes[i]!;
      const p = this.puckOf(i);
      const text = this.numbers[i]!.setPosition(node.x, node.y).setScale(1);
      resize(text, p.size, p.number, STYLE.current, p.state !== 'locked');
      const plateY = node.y + p.r + (p.depth + 24) * s;
      if (p.state === 'frontier') {
        this.frontierIndex = i;
        continue;
      }
      this.drawLevelPuck(g, i, 0);
      if (p.state === 'cleared') {
        this.drawStars(g, node.x, plateY, starsFor(this.progress.best[level] ?? 0, levelSpec(level)), area, s);
      } else {
        // A shackle and body say locked without needing a glyph the device font might lack.
        const ly = plateY - 10 * s;
        const outline = STYLE.current.outline * s * 0.55;
        const f = faces(area.ink);
        g.lineStyle(4 * s + outline * 2, shade(area.ink, -0.6), 1).beginPath().arc(node.x, ly - 1 * s, 9 * s, Math.PI, 0).strokePath();
        g.lineStyle(4 * s, area.ink, 1).beginPath().arc(node.x, ly - 1 * s, 9 * s, Math.PI, 0).strokePath();
        g.lineStyle(outline, shade(area.ink, -0.6), 1).strokeRoundedRect(node.x - 13 * s, ly, 26 * s, 19 * s, 5 * s);
        g.fillStyle(f.shade).fillRoundedRect(node.x - 13 * s, ly, 26 * s, 19 * s, 5 * s);
        g.fillStyle(f.face).fillRoundedRect(node.x - 13 * s, ly - 2 * s, 26 * s, 17 * s, 5 * s);
        g.fillStyle(p.fill).fillCircle(node.x, ly + 7 * s, 3.2 * s);
      }
    }
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
    const definition = VIGNETTES.find(v => v.id === levelSpec(level).vignette)!;
    const bx = this.blockRect.x, by = this.blockRect.y + sink;
    this.dockTitle.setText(definition.title);
    // Caption size on cream: the same undressed Fredoka the locked numbers use, so the
    // outline does not close the counters on a 30-unit word.
    resize(this.dockTitle, 30 * s, PALETTE.ink, STYLE.current, false);
    this.dockTitle.setPosition(bx + 24 * s, by + height * 0.5);
    const r = Math.max(40 * s, this.controlSize / 2);
    const cx = this.blockRect.right - 24 * s - r, cy = this.blockRect.centerY + sink;
    drawDisc(g, cx, cy, r, s, { fill: PALETTE.coral, depth: 9, press });
    drawPlay(g, cx + 2 * s, cy + 9 * s * press * 0.8, r * 0.42, SHELL.cream);
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
  }

  /**
   * Empty hearts, the natural wait, a rewarded watch, a store refill, and a way back
   * into a 3-starred level. WATCH is the coral action; refill and practice stay cream.
   */
  private drawRest(s: number, press: number): void {
    const shown = this.restShown;
    const hasPractice = shown && this.restPractice !== null;
    this.restPlate.setVisible(shown);
    this.restSurface.setVisible(shown);
    this.restTitle.setVisible(shown);
    this.restWait.setVisible(shown);
    this.restNote.setVisible(shown);
    this.restWatch.setVisible(shown);
    this.restWatchLabel.setVisible(shown);
    this.restWatchHint.setVisible(shown);
    this.restWatchMark.setVisible(shown);
    this.restRefill.setVisible(shown);
    this.restRefillLabel.setVisible(shown);
    this.restRefillHint.setVisible(shown);
    this.restRefillPrice.setVisible(shown);
    this.restRefillMark.setVisible(shown);
    this.restAction.setVisible(hasPractice);
    this.restActionLabel.setVisible(hasPractice);
    if (!shown) {
      this.restPlate.clear();
      this.restWatch.clear();
      this.restWatchMark.clear();
      this.restRefill.clear();
      this.restRefillMark.clear();
      this.restAction.clear();
      return;
    }
    const { safe } = this.viewport;
    const view = viewHealth(this.health);
    const wait = view.nextHeartInMs === null ? null : formatCountdown(view.nextHeartInMs);
    const price = monetization().productPrice(PRODUCT.heartRefill);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const watchH = Math.max(110 * s, control);
    const refillH = Math.max(96 * s, control);
    const practiceH = hasPractice ? Math.max(88 * s, control) : 0;
    const gap = 12 * s;
    const width = Math.min(560 * s, safe.width - 48 * s);
    const buttons = watchH + gap + refillH + (hasPractice ? gap + practiceH : 0);
    const height = 176 * s + buttons + 24 * s;
    const y = (this.hudHeight + this.footerTop) / 2 - height / 2;
    this.restRect.setTo(safe.centerX - width / 2, y, width, height);
    const g = this.restPlate.clear();
    drawPanel(g, this.restRect, s, { fill: SHELL.puck, depth: 12, hero: true, radius: 28 });
    placeSurface(this.restSurface, this.restRect, s);
    resize(this.restTitle, 40 * s, PALETTE.ink);
    this.restTitle.setPosition(this.restRect.centerX, this.restRect.y + 44 * s);
    this.restWait.setText(wait === null ? 'Hearts are full.' : `Next heart ${wait}`);
    resize(this.restWait, 26 * s, PALETTE.ink, STYLE.current, false);
    this.restWait.setPosition(this.restRect.centerX, this.restRect.y + 96 * s);
    resize(this.restNote, 22 * s, PALETTE.muted, STYLE.current, false);
    this.restNote.setPosition(this.restRect.centerX, this.restRect.y + 136 * s);
    const bottom = this.restRect.bottom - 24 * s;
    let cursor = bottom;
    if (hasPractice) {
      this.restActionRect.setTo(this.restRect.centerX - 180 * s, cursor - practiceH, 360 * s, practiceH);
      cursor -= practiceH + gap;
    }
    this.restRefillRect.setTo(this.restRect.centerX - 180 * s, cursor - refillH, 360 * s, refillH);
    cursor -= refillH + gap;
    this.restWatchRect.setTo(this.restRect.centerX - 180 * s, cursor - watchH, 360 * s, watchH);
    const watchPress = this.restPressed === 'watch' ? press : 0;
    const watch = this.restWatch.clear();
    drawPanel(watch, this.restWatchRect, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: watchPress, hero: true });
    const watchSink = CHROME.block.depth * s * watchPress * 0.8;
    this.restWatchLabel.setText('WATCH');
    resize(this.restWatchLabel, 30 * s, SHELL.cream);
    this.restWatchLabel.setPosition(this.restWatchRect.centerX, this.restWatchRect.centerY - 16 * s + watchSink);
    this.restWatchHint.setText('+1');
    resize(this.restWatchHint, 22 * s, SHELL.cream);
    this.restWatchHint.setPosition(this.restWatchRect.centerX - 4 * s, this.restWatchRect.centerY + 22 * s + watchSink);
    this.restWatchMark.clear();
    drawHeart(this.restWatchMark, this.restWatchRect.centerX + 18 * s, this.restWatchRect.centerY + 22 * s + watchSink, 10 * s, SHELL.cream);
    const refillPress = this.restPressed === 'refill' ? press : 0;
    const refill = this.restRefill.clear();
    drawPanel(refill, this.restRefillRect, s, { fill: SHELL.bench, depth: 12, press: refillPress });
    const refillSink = 12 * s * refillPress * 0.8;
    this.restRefillLabel.setText('REFILL');
    resize(this.restRefillLabel, 26 * s, PALETTE.ink);
    this.restRefillLabel.setPosition(this.restRefillRect.centerX, this.restRefillRect.centerY - 14 * s + refillSink);
    this.restRefillHint.setText('RESTORE 5');
    resize(this.restRefillHint, 18 * s, PALETTE.ink, STYLE.current, false);
    const priceText = price ?? '';
    const hintX = priceText.length > 0 ? this.restRefillRect.centerX - 36 * s : this.restRefillRect.centerX - 4 * s;
    this.restRefillHint.setPosition(hintX, this.restRefillRect.centerY + 20 * s + refillSink);
    this.restRefillMark.clear();
    drawHeart(this.restRefillMark, hintX + 16 * s, this.restRefillRect.centerY + 20 * s + refillSink, 9 * s, PALETTE.coral);
    this.restRefillPrice.setText(priceText);
    resize(this.restRefillPrice, 18 * s, PALETTE.muted, STYLE.current, false);
    this.restRefillPrice.setPosition(this.restRefillRect.centerX + 70 * s, this.restRefillRect.centerY + 20 * s + refillSink);
    this.restRefillPrice.setVisible(priceText.length > 0);
    const action = this.restAction.clear();
    if (!hasPractice) return;
    const practicePress = this.restPressed === 'practice' ? press : 0;
    drawPanel(action, this.restActionRect, s, { fill: SHELL.bench, depth: 12, press: practicePress });
    const practiceSink = 12 * s * practicePress * 0.8;
    this.restActionLabel.setText('PRACTICE');
    resize(this.restActionLabel, 26 * s, PALETTE.ink);
    this.restActionLabel.setPosition(this.restActionRect.centerX, this.restActionRect.centerY + practiceSink);
  }

  private showRest(level: number): void {
    if (monetization().premium()) return;
    const first = !this.restShown;
    this.restShown = true;
    this.restPractice = practiceLevel(this.progress);
    this.restPressed = null;
    this.restNote.setText('Early levels stay open.');
    this.restAt = performance.now() / 1000;
    this.drawRest(this.uiScale, 0);
    this.restPressDirty = true;
    if (first) {
      track('health_empty', { level });
      track('rewarded_offer_shown', { placement: 'map' });
      track('purchase_offer_shown', { product: PRODUCT.heartRefill });
    }
  }

  private hideRest(): void {
    if (!this.restShown) return;
    this.restShown = false;
    this.restPractice = null;
    this.restPressed = null;
    this.drawRest(this.uiScale, 0);
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
        this.restNote.setText(rewardedFeedback(result.reason));
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
        this.restNote.setText(purchaseFeedback(result.reason));
        return;
      }
      if (this.health.hearts <= 0) {
        this.restNote.setText(purchaseFeedback('failed'));
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

  private refreshRestCopy(): void {
    const view = viewHealth(this.health);
    const wait = view.nextHeartInMs === null ? null : formatCountdown(view.nextHeartInMs);
    const copy = wait === null ? 'Hearts are full.' : `Next heart ${wait}`;
    if (this.restWait.text !== copy) this.restWait.setText(copy);
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
    // A tapped locked puck: its number squashes and a ring says "not yet".
    const feedbackAge = now - this.feedbackAt;
    const locked = this.nodes[this.lockedIndex];
    if (locked && feedbackAge < 0.36) {
      const q = still ? 0 : squash(feedbackAge, 0.36, 0.16 * ex);
      this.numbers[this.lockedIndex]!.setScale(1 + q, 1 - q * 0.6);
      const ring = spring(feedbackAge / 0.36, 5, 1.6);
      g.lineStyle(STYLE.current.outline * s * 0.55, PALETTE.coral, (1 - feedbackAge / 0.36) * 0.7).strokeCircle(locked.x, locked.y, MAP.nodeRadius * 0.84 * s + 5 * s + ring * 10 * s);
    } else if (locked) { this.numbers[this.lockedIndex]!.setScale(1); this.lockedIndex = -1; }
    // The tap acknowledgement.
    this.touch.clear();
    const touchAge = now - this.touchAt;
    if (touchAge < 0.35) {
      const ring = spring(touchAge / 0.35, 5, 1.6);
      this.touch.lineStyle(STYLE.current.outline * s * 0.55, PALETTE.ink, (1 - touchAge / 0.35) * 0.6).strokeCircle(this.touchPoint.x, this.touchPoint.y + this.scrollY, 12 * s + ring * 30 * s);
    }
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
      this.restPlate.setAlpha(alpha);
      this.restSurface.setAlpha(alpha);
      this.restTitle.setAlpha(alpha);
      this.restWait.setAlpha(alpha);
      this.restNote.setAlpha(alpha);
      this.restWatch.setAlpha(alpha);
      this.restWatchLabel.setAlpha(alpha);
      this.restWatchHint.setAlpha(alpha);
      this.restWatchMark.setAlpha(alpha);
      this.restRefill.setAlpha(alpha);
      this.restRefillLabel.setAlpha(alpha);
      this.restRefillHint.setAlpha(alpha);
      this.restRefillPrice.setAlpha(alpha);
      this.restRefillMark.setAlpha(alpha);
      this.restAction.setAlpha(alpha);
      this.restActionLabel.setAlpha(alpha);
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
      if (this.restPractice !== null && this.restActionRect.contains(x, y)) {
        this.restPressed = 'practice';
        this.restPressedAt = performance.now() / 1000;
        this.restPressDirty = true;
        const level = this.restPractice;
        this.hideRest();
        this.openLevel(level);
        return;
      }
      if (!this.restRect.contains(x, y)) this.hideRest();
      return;
    }
    if (this.dockRect.contains(x, y)) {
      this.pressedAt = performance.now() / 1000;
      this.pressDirty = true;
      this.openLevel(this.progress.unlocked);
      return;
    }
    if (y < this.hudHeight || y >= this.footerTop) return;
    const worldY = y + this.scrollY;
    const reach = Math.max(MAP.nodeRadius * this.uiScale, this.controlSize / 2);
    const index = this.nodes.findIndex(node => Math.hypot(node.x - x, node.y - worldY) <= reach);
    if (index < 0) return;
    if (this.first + index > this.progress.unlocked) {
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
    if (!canBeginAttempt(this.health, this.progress, level, Date.now(), monetization().premium())) {
      this.showRest(level);
      return;
    }
    this.velocity = 0;
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
    this.cancelDrag();
  }
}
