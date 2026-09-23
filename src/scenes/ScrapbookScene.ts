import Phaser from 'phaser';
import { ensureShellMusic } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { playAnalytics } from '@/game/playAnalytics';
import { loadProgress, markScrapbookSeen } from '@/game/progress';
import { collectionCount, earnedBy, ownsKeepsake, scrapbookPages, type Keepsake } from '@/game/scrapbook';
import { VIGNETTES } from '@/vignettes/registry';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { drawBack } from '@/ui/icons';
import { drawKeepsake } from '@/ui/keepsakes';
import { scrollStep } from '@/ui/navigation';
import { BRASS, drawPanel } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { drawStar, drawStarSeat, STAR_PRIZE } from '@/ui/star';
import { body, display, label, resize } from '@/ui/type';

/**
 * Design-unit metrics. A page per act, two to a spread: a sheet of kraft with its
 * keepsakes mounted on it, wrapping onto a second row once an act has more than fit.
 */
const BOOK = {
  width: 644,
  pageGap: 22,
  /** Two pages side by side from this book width; one below it. */
  spreadFrom: 560,
  /** From a page's top edge to its cards' top edge: the tape and the act's name. */
  cardTop: 62,
  card: 120,
  cardGap: 18,
  margin: 20,
  /** Under the card: the name, or the level that earns it. */
  caption: 44,
  pageFoot: 18,
  infoHeight: 146,
  friction: 7.5,
  tapSlop: 12,
} as const;

/** The page, the tape its name is written on, and the photo corners that hold a card. */
const INK = {
  page: SHELL.bench,
  card: SHELL.cream,
  tape: PALETTE.coral,
  corner: shade(SHELL.rope, -0.1),
} as const;

interface Slot { readonly keepsake: Keepsake; readonly owned: boolean; readonly rect: Phaser.Geom.Rectangle }

/**
 * The Scrapbook: every keepsake, grouped by the act it came from.
 *
 * Built as a book rather than an inventory: each act is a strip of kraft paper with its
 * name on a torn strip of tape, and a found keepsake is a cream card held on by four photo
 * corners. An unfound one is a recessed slot holding the keepsake's silhouette and the one
 * thing that earns it — "Level 14" and three hollow stars — so the page is its own
 * explanation. Touching a card names it at the foot of the page; nothing opens over it.
 *
 * Nothing here is stored. What is owned is read from the stars (`game/scrapbook.ts`)
 * every time the page opens, which is why a player who three-starred these levels before
 * the Scrapbook existed opens it already full of what they earned.
 *
 * The scroll is Settings': a band camera whose viewport is the clip (Phaser 4 has no
 * WebGL geometry masks), momentum from `scrollStep`, and a card that fires on the
 * release, because a press is the start of a gesture that may be a scroll.
 */
export class ScrapbookScene extends BaseScene {
  private from: SceneKey = SceneKey.Menu;
  private backdrop!: Backdrop;
  private band!: Phaser.GameObjects.Container;
  private bandCamera!: Phaser.Cameras.Scene2D.Camera;
  private pages!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private pinned!: Phaser.GameObjects.Graphics;
  private backMark!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private tally!: Phaser.GameObjects.Text;
  private infoName!: Phaser.GameObjects.Text;
  private infoWhere!: Phaser.GameObjects.Text;
  private titles: Phaser.GameObjects.Text[] = [];
  private captions: Phaser.GameObjects.Text[] = [];
  private slots: Slot[] = [];
  private selected: Keepsake | null = null;
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private bandRect = new Phaser.Geom.Rectangle();
  private backRect = new Phaser.Geom.Rectangle();
  private infoRect = new Phaser.Geom.Rectangle();
  private tallyRect = new Phaser.Geom.Rectangle();
  private scrollY = 0;
  private scrollMax = 0;
  private velocity = 0;
  private drag: { id: number; lastY: number; lastAt: number; startY: number; moved: boolean; scrollable: boolean } | null = null;
  private backPressedAt = -Infinity;
  private backDirty = false;
  /** Every value the page bake reads. A URL-bar collapse changes none of them, so it skips the bake. */
  private bakeKey = '';

  public constructor() { super(SceneKey.Scrapbook); }

  protected override build(): void {
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.from = data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
    // Assigned here, never appended to: `build` runs once per entry and field initializers
    // once per instance, so a second visit must not inherit the first visit's objects.
    this.scrollY = 0;
    this.velocity = 0;
    this.drag = null;
    this.selected = null;
    this.bakeKey = '';
    this.backPressedAt = -Infinity;
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.7, y: 0.14 }, glowAlpha: 0.55 });
    this.band = this.add.container(0, 0).setDepth(1);
    this.bandCamera = this.cameras.add(0, 0, 1, 1, false, 'pages');
    this.cameras.main.ignore(this.band);
    this.pages = this.add.graphics();
    this.highlight = this.add.graphics();
    this.band.add([this.pages, this.highlight]);

    const progress = loadProgress();
    const pages = scrapbookPages();
    this.slots = pages.flatMap(page => page.keepsakes.map(keepsake => ({
      keepsake, owned: ownsKeepsake(progress, keepsake), rect: new Phaser.Geom.Rectangle(),
    })));
    this.titles = pages.map(page => {
      const title = VIGNETTES.find(v => v.id === page.vignette)!.title;
      const text = label(this, title, { size: 22, colour: SHELL.cream }).setOrigin(0, 0.5);
      this.band.add(text);
      return text;
    });
    this.captions = this.slots.map(slot => {
      const text = slot.owned
        ? body(this, slot.keepsake.name, { size: 20, colour: PALETTE.ink, align: 'center' })
        : label(this, `Level ${slot.keepsake.level}`, { size: 19, colour: PALETTE.muted, align: 'center' });
      text.setOrigin(0.5, 0);
      this.band.add(text);
      return text;
    });

    this.pinned = this.add.graphics().setDepth(4);
    this.backMark = this.add.graphics().setDepth(6);
    this.headline = display(this, 'Scrapbook', { size: 56, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(5);
    const count = collectionCount(progress);
    this.tally = display(this, `${count.owned}/${count.total}`, { size: 32, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(5);
    this.infoName = display(this, '', { size: 34, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(5);
    this.infoWhere = body(this, '', { size: 23, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0).setDepth(5);
    this.describe(null, count.owned);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.wheel, this);
    window.addEventListener('blur', this.cancelDrag);
    window.addEventListener('pointercancel', this.cancelDrag);
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    // Opening the book is also how a player learns what it is: the first reveal after this
    // no longer needs its longer note, and the title screen's puck loses its dot.
    markScrapbookSeen();
    playAnalytics.scrapbookOpened(this.from === SceneKey.Map ? 'map' : 'menu', count.owned, count.total);
    ensureShellMusic(this);
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const width = Math.min(BOOK.width * s, safe.width - 40 * s);
    const left = safe.centerX - width / 2;

    // Header: the back puck, the title beside it, and the collection on a brass tag.
    const backAt = { x: left + CHROME.puckRadius * s, y: safe.top + 66 * s };
    this.backRect.setTo(backAt.x - control / 2, backAt.y - control / 2, control, control);
    resize(this.headline, 56 * s, PALETTE.ink);
    this.headline.setPosition(backAt.x + (CHROME.puckRadius + 26) * s, backAt.y);
    resize(this.tally, 32 * s, SHELL.cream);
    const tagW = Math.max(112 * s, this.tally.width + 40 * s), tagH = 62 * s;
    this.tallyRect.setTo(left + width - tagW, backAt.y - tagH / 2, tagW, tagH);
    this.tally.setPosition(this.tallyRect.centerX, this.tallyRect.centerY);

    // Footer: the caption plate that names whatever was touched.
    const infoH = BOOK.infoHeight * s;
    this.infoRect.setTo(left, safe.bottom - 36 * s - infoH, width, infoH);
    resize(this.infoName, 34 * s, PALETTE.ink);
    this.infoName.setPosition(this.infoRect.centerX, this.infoRect.y + 48 * s);
    resize(this.infoWhere, 23 * s, PALETTE.muted, STYLE.current, false);
    this.infoWhere.setWordWrapWidth(width - 48 * s, false).setPosition(this.infoRect.centerX, this.infoRect.y + 78 * s);

    const top = safe.top + 122 * s;
    this.bandRect.setTo(left - 16 * s, top, width + 32 * s, this.infoRect.y - 22 * s - top);
    this.bandCamera.setViewport(this.bandRect.x, this.bandRect.y, this.bandRect.width, this.bandRect.height);
    this.bandCamera.ignore(this.children.list.filter(child => child !== this.band));

    const height = this.bakePages(left, width, s);
    this.scrollMax = Math.max(0, height - this.bandRect.height);
    this.scrollY = Math.min(this.scrollY, this.scrollMax);
    this.applyScroll();
    this.drawHighlight();
    this.drawPinned(0);
  }

  /** The pages, drawn once per real change of size. Returns the height they take. */
  private bakePages(left: number, width: number, s: number): number {
    const pages = scrapbookPages();
    const cols = width >= BOOK.spreadFrom * s ? 2 : 1;
    const gap = BOOK.pageGap * s;
    const pageW = (width - (cols - 1) * gap) / cols;
    const perRow = Math.max(1, Math.floor((pageW - 2 * BOOK.margin * s + BOOK.cardGap * s) / ((BOOK.card + BOOK.cardGap) * s)));
    const rowOf = (count: number) => Math.max(1, Math.ceil(count / perRow));
    const pageHeight = (count: number) => (BOOK.cardTop + rowOf(count) * (BOOK.card + BOOK.caption) + BOOK.pageFoot) * s;
    // A spread's two pages share one height, so the book reads as facing pages.
    const spreads: number[] = [];
    for (let i = 0; i < pages.length; i += cols) {
      spreads.push(Math.max(...pages.slice(i, i + cols).map(page => pageHeight(page.keepsakes.length))));
    }
    const height = spreads.reduce((sum, h) => sum + h + gap, 0) + 16 * s;
    const key = `${left}|${width}|${s}|${this.bandRect.y}`;
    if (key === this.bakeKey) return height;
    this.bakeKey = key;
    const g = this.pages.clear();
    let slot = 0;
    let y = this.bandRect.y + 8 * s;
    pages.forEach((page, i) => {
      const col = i % cols;
      const spread = Math.floor(i / cols);
      if (col === 0 && i > 0) y += spreads[spread - 1]! + gap;
      const x = left + col * (pageW + gap);
      drawPanel(g, new Phaser.Geom.Rectangle(x, y, pageW, spreads[spread]!), s, { fill: INK.page, depth: 6, radius: 14 });
      // The act's name on a strip of tape laid across the page's top edge, a little askew.
      const title = this.titles[i]!;
      resize(title, 22 * s, SHELL.cream, STYLE.current, false);
      const tapeW = Math.min(pageW - 24 * s, title.width + 44 * s), tapeH = 40 * s, tx = x + 16 * s, ty = y - 8 * s;
      g.fillStyle(INK.tape, 0.92).fillPoints(new Phaser.Geom.Polygon([
        { x: tx, y: ty + 3 * s }, { x: tx + tapeW, y: ty }, { x: tx + tapeW - 3 * s, y: ty + tapeH }, { x: tx + 3 * s, y: ty + tapeH + 2 * s },
      ]).points, true);
      title.setPosition(tx + 22 * s, ty + tapeH / 2 + 1 * s);
      page.keepsakes.forEach((_, j) => {
        const entry = this.slots[slot]!;
        const cx = x + BOOK.margin * s + (j % perRow) * (BOOK.card + BOOK.cardGap) * s;
        const cy = y + (BOOK.cardTop + Math.floor(j / perRow) * (BOOK.card + BOOK.caption)) * s;
        entry.rect.setTo(cx, cy, BOOK.card * s, BOOK.card * s);
        this.drawCard(g, entry, s);
        const caption = this.captions[slot]!;
        if (entry.owned) resize(caption, 19 * s, PALETTE.ink, STYLE.current, false);
        else resize(caption, 18 * s, PALETTE.muted, STYLE.current, false);
        caption.setWordWrapWidth((BOOK.card + BOOK.cardGap - 4) * s, false);
        caption.setPosition(entry.rect.centerX, entry.rect.bottom + 8 * s);
        slot++;
      });
    });
    return height;
  }

  /** A found keepsake on a mounted card; an unfound one as its shadow in a recessed slot. */
  private drawCard(g: Phaser.GameObjects.Graphics, slot: Slot, s: number): void {
    const r = slot.rect;
    const stars = { y: r.bottom - 16 * s, gap: 22 * s, radius: 8 * s };
    if (slot.owned) {
      drawPanel(g, r, s, { fill: INK.card, depth: 5, radius: 6 });
      // Four photo corners, the way a card is held in a real scrapbook.
      const c = 20 * s;
      g.fillStyle(INK.corner, 0.95);
      for (const [cx, cy, dx, dy] of [[r.x, r.y, 1, 1], [r.right, r.y, -1, 1], [r.x, r.bottom, 1, -1], [r.right, r.bottom, -1, -1]] as const) {
        g.fillTriangle(cx - dx * 3 * s, cy - dy * 3 * s, cx + dx * c, cy - dy * 3 * s, cx - dx * 3 * s, cy + dy * c);
      }
      drawKeepsake(g, slot.keepsake.id, r.centerX, r.centerY - 8 * s, r.width * 0.7, false, INK.card);
      for (let k = -1; k <= 1; k++) drawStar(g, r.centerX + k * stars.gap, stars.y, stars.radius, STAR_PRIZE);
    } else {
      const well = shade(INK.page, -0.08);
      g.fillStyle(well, 1).fillRoundedRect(r.x, r.y, r.width, r.height, 8 * s);
      g.lineStyle(2 * s, shade(INK.page, -0.28), 0.6).strokeRoundedRect(r.x, r.y, r.width, r.height, 8 * s);
      drawKeepsake(g, slot.keepsake.id, r.centerX, r.centerY - 8 * s, r.width * 0.7, true, well);
      for (let k = -1; k <= 1; k++) drawStarSeat(g, r.centerX + k * stars.gap, stars.y, stars.radius, well, shade(INK.page, -0.35));
    }
  }

  /** The brass ring round the card that was touched. Its own Graphics, so a touch never rebakes the pages. */
  private drawHighlight(): void {
    const g = this.highlight.clear();
    const slot = this.slots.find(entry => entry.keepsake === this.selected);
    if (!slot) return;
    const s = this.uiScale, r = slot.rect;
    g.lineStyle(5 * s, BRASS, 1).strokeRoundedRect(r.x - 7 * s, r.y - 7 * s, r.width + 14 * s, r.height + 14 * s, 12 * s);
  }

  private drawPinned(press: number): void {
    const s = this.uiScale;
    const g = this.pinned.clear();
    drawPuck(g, this.backRect.centerX, this.backRect.centerY, s, press);
    this.backMark.clear();
    drawBack(this.backMark, this.backRect.centerX, this.backRect.centerY + puckSink(s, press), CHROME.puckRadius * s * 0.44, PALETTE.ink);
    drawPanel(g, this.tallyRect, s, { fill: BRASS, depth: 7, radius: 16 });
    drawPanel(g, this.infoRect, s, { fill: SHELL.cream, depth: 8, radius: 22, hero: true });
  }

  /** What the caption plate says: the touched keepsake, or how the book works. */
  private describe(slot: Slot | null, owned: number): void {
    if (!slot) {
      this.infoName.setText(owned === 0 ? 'Three stars, one keepsake' : 'Your keepsakes');
      this.infoWhere.setText(owned === 0
        ? 'Every slot says which level earns it. Three stars there, and it is yours.'
        : 'Touch one to see where it came from.');
      return;
    }
    const act = VIGNETTES.find(v => v.id === slot.keepsake.vignette)!.title;
    if (slot.owned) {
      this.infoName.setText(slot.keepsake.name);
      this.infoWhere.setText(`${earnedBy(slot.keepsake)} · ${act}`);
    } else {
      this.infoName.setText('Not found yet');
      this.infoWhere.setText(`${earnedBy(slot.keepsake)} finds it · ${act}`);
    }
  }

  public override update(_time: number, delta: number): void {
    this.stepScroll(delta);
    const press = pressAmount(performance.now() / 1000, this.backPressedAt);
    if (press > 0.001 || this.backDirty) {
      this.drawPinned(Math.max(0, press));
      this.backDirty = press > 0.001;
    }
  }

  private stepScroll(delta: number): void {
    if (this.drag || Math.abs(this.velocity) < 1) return;
    const step = scrollStep(this.velocity, delta, BOOK.friction);
    this.velocity = step.velocity;
    this.setScroll(this.scrollY + step.distance);
    if (this.scrollY <= 0 || this.scrollY >= this.scrollMax) this.velocity = 0;
  }

  private setScroll(value: number): void {
    this.scrollY = Math.max(0, Math.min(this.scrollMax, value));
    this.applyScroll();
  }

  private applyScroll(): void {
    this.bandCamera.setScroll(this.bandRect.x, this.bandRect.y + this.scrollY);
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.curtain.active || this.drag || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.velocity = 0;
    this.drag = {
      id: pointer.id, lastY: pointer.y, lastAt: performance.now(), startY: pointer.y, moved: false,
      scrollable: Phaser.Geom.Rectangle.Contains(this.bandRect, pointer.x, pointer.y),
    };
  }

  private pointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.id || !pointer.isDown) return;
    const now = performance.now();
    const dy = pointer.y - drag.lastY;
    if (Math.abs(pointer.y - drag.startY) > BOOK.tapSlop * this.viewport.unitScale) drag.moved = true;
    if (drag.moved && drag.scrollable && this.scrollMax > 0) {
      this.setScroll(this.scrollY - dy);
      const dt = Math.max(1, now - drag.lastAt) / 1000;
      this.velocity = Phaser.Math.Clamp(-dy / dt, -6000, 6000);
    }
    drag.lastAt = now;
    drag.lastY = pointer.y;
  }

  /** On the release, never the press: a press here may be the start of a scroll. */
  private pointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || drag.id !== pointer.id) return;
    this.drag = null;
    if (drag.moved || this.curtain.active) return;
    this.tapAt(pointer.x, pointer.y);
  }

  private readonly cancelDrag = (): void => { this.drag = null; };

  private wheel(_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.scrollMax <= 0) return;
    this.velocity = 0;
    this.setScroll(this.scrollY + dy);
  }

  private tapAt(x: number, y: number): void {
    if (Phaser.Geom.Rectangle.Contains(this.backRect, x, y)) {
      this.backPressedAt = performance.now() / 1000;
      this.backDirty = true;
      vibrate('tap');
      this.leave();
      return;
    }
    if (!Phaser.Geom.Rectangle.Contains(this.bandRect, x, y)) return;
    const worldY = y + this.scrollY;
    const slot = this.slots.find(entry => Phaser.Geom.Rectangle.Contains(entry.rect, x, worldY)) ?? null;
    if (!slot) return;
    vibrate('tap');
    this.selected = slot.keepsake;
    this.describe(slot, 0);
    this.drawHighlight();
  }

  private leave(): void {
    if (this.curtain.active) return;
    this.tweens.add({ targets: this.bandCamera, alpha: 0, duration: reducedMotion() ? 1 : 130 });
    this.curtain.cover(() => this.scene.start(this.from));
  }

  private shutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.wheel, this);
    window.removeEventListener('blur', this.cancelDrag);
    window.removeEventListener('pointercancel', this.cancelDrag);
    this.cameras.remove(this.bandCamera);
    this.backdrop.destroy();
  }
}
