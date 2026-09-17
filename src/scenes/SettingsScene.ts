import Phaser from 'phaser';
import { isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { hapticsSupported, setHaptics, vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { areaOf } from '@/game/levels';
import { clearProgress, loadProgress } from '@/game/progress';
import { clearHealth, HEALTH, heartProgress, formatCountdown, loadHealth, viewHealth } from '@/game/health';
import { loadSettings, saveSettings } from '@/game/settings';
import { monetization, PRODUCT, purchaseFeedback, restoreFeedback, STORE_COPY, track, type ProductId } from '@/monetization';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawHeartRow, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { drawBack, drawChevron, drawHeart, drawInfinity, drawSpeaker, drawVibrate } from '@/ui/icons';
import { faces } from '@/ui/light';
import { scrollStep } from '@/ui/navigation';
import { BRASS, drawPanel } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { Sheen } from '@/ui/sheen';
import { arrive } from '@/ui/spring';
import { drawSwitch, SWITCH } from '@/ui/switch';
import { body, display, embossed, label, reemboss, resize } from '@/ui/type';
import { formatOffset } from './CalibrateScene';

/** Design-unit metrics. Sections are labelled bands of rows, not a flat list of cards. */
const SETTINGS = {
  width: 644,
  rowHeight: 112,
  tallRow: 144,
  eyebrowGap: 38,
  sectionGap: 30,
  cardRadius: 28,
  friction: 7.5,
  /** Past this the pointer was a scroll, not a tap on whatever it started over. */
  tapSlop: 12,
} as const;

/** Where an action leads. `tune` and `done` leave the scene; the rest act in place. */
type Action = 'back' | 'sound' | 'haptics' | 'tune' | 'unlock' | 'restore' | 'refill' | 'reset' | 'privacy' | 'terms' | 'done';

interface Hit { readonly name: Action; readonly rect: Phaser.Geom.Rectangle; readonly pinned: boolean }

const LEGAL = {
  privacy: 'https://ngg-global.github.io/TinyTempo/privacy/',
  terms: 'https://ngg-global.github.io/TinyTempo/terms/',
} as const;

/**
 * Player settings.
 *
 * It was a flat stack of four identical cards, each stating its value in a sentence and
 * offering a button labelled with the opposite of that sentence — "Sound on" beside
 * "Mute". The refinement groups the rows under labelled sections, states the two audio
 * settings with switches instead of words, shows the hearts the player actually has,
 * gives the store its own brass object rather than a fifth grey card, and moves the
 * sixteen-second latency measurement onto its own screen.
 *
 * The sections scroll between a pinned title and a pinned Done, because the store and
 * the hearts status together are taller than a handset. The scrolling band is a masked
 * container; the header, the legal line and Done are drawn outside it and never move.
 */
export class SettingsScene extends BaseScene {
  private backdrop!: Backdrop;
  private band!: Phaser.GameObjects.Container;
  /**
   * The sections render through their own camera, whose viewport is the scrolling band.
   * Phaser 4 dropped WebGL geometry masks — `setMask` warns and no-ops off the canvas
   * renderer — and its replacement renders the mask to a DynamicTexture, which is a whole
   * extra target for what a camera's scissor rectangle already does for nothing.
   */
  private bandCamera!: Phaser.Cameras.Scene2D.Camera;
  private plates!: Phaser.GameObjects.Graphics;
  private controls!: Phaser.GameObjects.Graphics;
  private pinned!: Phaser.GameObjects.Graphics;
  private backMark!: Phaser.GameObjects.Graphics;
  private sheen!: Sheen;
  private headline!: Phaser.GameObjects.Text;
  private eyebrows: Phaser.GameObjects.Text[] = [];
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private hits: Hit[] = [];
  /** Rectangles the band redraws on every press or state change, in the band's own space. */
  private rows: Record<string, Phaser.Geom.Rectangle> = {};
  private storeRadius = 0;
  private sheenAt = Number.NaN;
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private bandRect = new Phaser.Geom.Rectangle();
  private scrollY = 0;
  private scrollMax = 0;
  private velocity = 0;
  private drag: { id: number; lastY: number; lastAt: number; startY: number; moved: boolean; scrollable: boolean } | null = null;
  private pressedAt = -Infinity;
  private pressed: Action | null = null;
  private pressDirty = false;
  private resetArmed = false;
  private commerceBusy = false;
  private notice = '';
  private from: string = SceneKey.Menu;
  private enteredAt = 0;
  private headlineAt = { x: 0, y: 0 };
  private soundOn = true;
  private hapticsOn = true;
  /** 0-1 positions, so a flipped switch slides rather than jumping. */
  private switchAt = { sound: 1, haptics: 1 };
  private switchedAt = { sound: -Infinity, haptics: -Infinity };
  private disposed = false;
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Settings); }

  protected override build(): void {
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.from = data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
    this.disposed = false;
    this.resetArmed = false;
    this.commerceBusy = false;
    this.notice = '';
    this.scrollY = 0;
    this.velocity = 0;
    this.drag = null;
    this.pressed = null;
    this.pressedAt = -Infinity;
    const settings = loadSettings();
    this.soundOn = !isMuted(this);
    this.hapticsOn = settings.haptics;
    this.switchAt = { sound: this.soundOn ? 1 : 0, haptics: this.hapticsOn ? 1 : 0 };
    this.switchedAt = { sound: -Infinity, haptics: -Infinity };
    this.enteredAt = performance.now() / 1000;
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.3, y: 0.16 }, glowAlpha: 0.6 });
    this.band = this.add.container(0, 0).setDepth(1);
    this.bandCamera = this.cameras.add(0, 0, 1, 1, false, 'sections');
    this.cameras.main.ignore(this.band);
    this.plates = this.add.graphics();
    this.controls = this.add.graphics();
    this.band.add([this.plates, this.controls]);
    // Outside the band, not in it: a geometry mask does not inherit a container's
    // transform, so a sheen nested in the scroller would keep its highlight where the
    // panel used to be. It is placed in screen space instead, from the live scroll.
    this.sheen = new Sheen(this, 3);
    this.pinned = this.add.graphics().setDepth(4);
    this.backMark = this.add.graphics().setDepth(6);
    this.headline = embossed(this, 'Settings', { size: 62, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(5);
    for (const caption of ['Sound & feel', 'Timing', 'Hearts', 'Workshop store', 'Progress']) {
      this.eyebrows.push(this.banded(label(this, caption, { size: 21, colour: PALETTE.muted })).setOrigin(0, 0.5));
    }
    this.buildTexts();
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
    this.refreshCopy();
  }

  /** Every text inside the scrolling band belongs to the container, not the camera. */
  private banded<T extends Phaser.GameObjects.Text>(text: T): T {
    this.band.add(text);
    return text.setDepth(3);
  }

  private buildTexts(): void {
    const ink = PALETTE.ink, muted = PALETTE.muted, cream = SHELL.cream;
    const rowTitle = (caption: string): Phaser.GameObjects.Text =>
      this.banded(body(this, caption, { size: 30, colour: ink })).setOrigin(0, 0.5);
    const rowNote = (caption: string): Phaser.GameObjects.Text =>
      this.banded(body(this, caption, { size: 24, colour: muted })).setOrigin(0, 0.5);
    const chip = (caption: string, colour: number = ink): Phaser.GameObjects.Text =>
      this.banded(label(this, caption, { size: 23, colour, align: 'center' })).setOrigin(0.5);
    this.texts = {
      sound: rowTitle('Sound'),
      haptics: rowTitle('Haptics'),
      hapticsNote: rowNote('Not on this device'),
      offset: rowTitle('Tap offset'),
      offsetNote: rowNote('Measured on this device'),
      offsetValue: this.banded(display(this, '', { size: 48, colour: ink })).setOrigin(1, 0.5),
      tune: chip('Tune'),
      heartCount: this.banded(display(this, '', { size: 42, colour: ink })).setOrigin(1, 0.5),
      heartWait: rowNote(''),
      premium: this.banded(display(this, STORE_COPY.premiumTitle, { size: 48, colour: cream, outline: shade(BRASS, -0.62) })).setOrigin(0, 0.5),
      premiumTerms: this.banded(body(this, STORE_COPY.premiumTerms, { size: 25, colour: shade(BRASS, -0.62) })).setOrigin(0, 0.5),
      premiumBadge: chip('Best value', cream),
      unlock: this.banded(display(this, 'Unlock', { size: 38, colour: cream })).setOrigin(1, 0.5),
      unlockPrice: this.banded(label(this, '', { size: 27, colour: cream })).setOrigin(0, 0.5),
      restore: chip('Restore'),
      refill: rowTitle(STORE_COPY.refillTitle),
      refillNote: rowNote(`· ${STORE_COPY.refillTerms.toLowerCase()}`),
      refillPrice: chip(''),
      level: rowTitle(''),
      levelNote: rowNote(''),
      reset: chip('Reset'),
      notice: rowNote(''),
    };
    this.texts.notice!.setOrigin(0.5, 0.5);
    this.texts.legal = body(this, 'Privacy · Terms', { size: 24, colour: muted, align: 'center' }).setOrigin(0.5).setDepth(5);
    this.texts.version = body(this, `v${__APP_VERSION__}`, { size: 24, colour: muted }).setOrigin(0, 0.5).setDepth(5);
    this.texts.done = display(this, 'Done', { size: 50, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(5);
  }

  /** A refill is an offer only while there is room for the hearts it would restore. */
  private refillOffered(): boolean {
    return !monetization().premium() && viewHealth(loadHealth()).hearts < HEALTH.max;
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1200);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const width = Math.min(SETTINGS.width * s, safe.width - 40 * s);
    const left = safe.centerX - width / 2;
    this.hits = [];

    // Header: a back puck and the title, both pinned.
    const backAt = { x: left + CHROME.puckRadius * s, y: safe.top + 66 * s };
    this.headlineAt = { x: backAt.x + (CHROME.puckRadius + 26) * s, y: backAt.y };
    reemboss(this.headline, 62 * s, PALETTE.ink);
    this.headline.setPosition(this.headlineAt.x, this.headlineAt.y);
    this.hits.push({ name: 'back', rect: new Phaser.Geom.Rectangle(backAt.x - control / 2, backAt.y - control / 2, control, control), pinned: true });

    // Footer: the legal line and the one control that leaves.
    const doneH = Math.max(120 * s, control);
    const doneRect = new Phaser.Geom.Rectangle(left, safe.bottom - 44 * s - doneH, width, doneH);
    this.hits.push({ name: 'done', rect: doneRect, pinned: true });
    const legalY = doneRect.y - 38 * s;
    resize(this.texts.legal!, 24 * s, PALETTE.muted, STYLE.current, false);
    resize(this.texts.version!, 24 * s, PALETTE.muted, STYLE.current, false);
    // Privacy · Terms · vX, laid out from the measured widths so the dots sit evenly.
    const legal = this.texts.legal!, version = this.texts.version!;
    const gap = 14 * s;
    const total = legal.width + gap + version.width;
    legal.setPosition(safe.centerX - total / 2 + legal.width / 2, legalY);
    version.setPosition(legal.x + legal.width / 2 + gap, legalY);
    const half = legal.width / 2;
    // Two targets inside one string: the left half is Privacy, the right half is Terms.
    this.hits.push({ name: 'privacy', rect: new Phaser.Geom.Rectangle(legal.x - half, legalY - control / 2, half, control), pinned: true });
    this.hits.push({ name: 'terms', rect: new Phaser.Geom.Rectangle(legal.x, legalY - control / 2, half, control), pinned: true });

    this.bandRect.setTo(left - 16 * s, safe.top + 122 * s, width + 32 * s, legalY - 30 * s - (safe.top + 122 * s));
    this.bandCamera.setViewport(this.bandRect.x, this.bandRect.y, this.bandRect.width, this.bandRect.height);
    // Everything the main camera draws, the band camera must not, or the backdrop and the
    // pinned chrome are painted a second time inside the viewport.
    this.bandCamera.ignore(this.children.list.filter(child => child !== this.band));

    const height = this.buildBand(left, width, s, control);
    this.scrollMax = Math.max(0, height - this.bandRect.height);
    this.scrollY = Math.min(this.scrollY, this.scrollMax);
    this.applyScroll();
    this.sheenAt = Number.NaN;
    this.drawPinned(0, doneRect);
    this.pressDirty = true;
  }

  /**
   * Lays the sections into the band's own space, top at the band's top, and returns the
   * total height. Nothing here reads `scrollY`: the container carries the offset, so a
   * scroll is one translate rather than a relayout.
   */
  private buildBand(left: number, width: number, s: number, control: number): number {
    const g = this.plates.clear();
    const row = SETTINGS.rowHeight * s;
    const tall = SETTINGS.tallRow * s;
    const card = { fill: SHELL.puck, depth: 10, radius: SETTINGS.cardRadius } as const;
    let y = this.bandRect.y + 6 * s;
    const eyebrow = (index: number): void => {
      const text = this.eyebrows[index]!;
      resize(text, 21 * s, PALETTE.muted, STYLE.current, false);
      text.setPosition(left + 10 * s, y + 12 * s);
      y += SETTINGS.eyebrowGap * s;
    };
    const plate = (height: number): Phaser.Geom.Rectangle => {
      const r = new Phaser.Geom.Rectangle(left, y, width, height);
      drawPanel(g, r, s, card);
      y += height + SETTINGS.sectionGap * s;
      return r;
    };
    const switchRect = (r: Phaser.Geom.Rectangle, rowTop: number, rowH: number): Phaser.Geom.Rectangle =>
      new Phaser.Geom.Rectangle(
        r.right - 26 * s - SWITCH.width * s, rowTop + rowH / 2 - SWITCH.height * s / 2,
        SWITCH.width * s, SWITCH.height * s,
      );

    // SOUND & FEEL — two switch rows on one card, parted by a scored line.
    eyebrow(0);
    const audio = plate(row * 2);
    this.rows.sound = switchRect(audio, audio.y, row);
    this.rows.haptics = switchRect(audio, audio.y + row, row);
    this.rows.audioCard = audio;
    this.texts.sound!.setPosition(left + 96 * s, audio.y + row / 2);
    // On a device with no vibrator the row carries a note under its title and the title
    // rides up to make room; everywhere else the title is centred on the row like Sound's.
    const buzzes = hapticsSupported();
    this.texts.haptics!.setPosition(left + 96 * s, audio.y + row * 1.5 - (buzzes ? 0 : 15 * s));
    this.texts.hapticsNote!.setPosition(left + 96 * s, audio.y + row * 1.5 + 19 * s);
    this.hits.push({ name: 'sound', rect: new Phaser.Geom.Rectangle(left, audio.y, width, row), pinned: false });
    this.hits.push({ name: 'haptics', rect: new Phaser.Geom.Rectangle(left, audio.y + row, width, row), pinned: false });

    // TIMING — the measured offset, and the screen that measures it.
    eyebrow(1);
    const timing = plate(tall);
    this.rows.timing = timing;
    const tuneW = Math.max(176 * s, control);
    const tuneRect = new Phaser.Geom.Rectangle(timing.right - 24 * s - tuneW, timing.centerY - control / 2, tuneW, control);
    this.rows.tune = tuneRect;
    this.texts.tune!.setPosition(tuneRect.centerX - 16 * s, tuneRect.centerY);
    // Title and value share the top line; the note sits under both, so the widest possible
    // measurement ("−500 ms") still cannot reach the copy beside it.
    resize(this.texts.offsetValue!, 40 * s, PALETTE.ink, STYLE.current, false);
    this.texts.offsetValue!.setPosition(tuneRect.x - 22 * s, timing.centerY - 20 * s);
    this.texts.offset!.setPosition(left + 28 * s, timing.centerY - 20 * s);
    this.texts.offsetNote!.setPosition(left + 28 * s, timing.centerY + 22 * s);
    this.hits.push({ name: 'tune', rect: tuneRect, pinned: false });

    // HEARTS — the status, not an offer. The offers are the section below.
    eyebrow(2);
    const hearts = plate(tall);
    this.rows.hearts = hearts;
    resize(this.texts.heartCount!, 42 * s, PALETTE.ink, STYLE.current, false);
    this.texts.heartCount!.setPosition(hearts.right - 28 * s, hearts.y + 46 * s);
    this.texts.heartWait!.setOrigin(1, 0.5).setPosition(hearts.right - 28 * s, hearts.bottom - 40 * s);

    // WORKSHOP STORE — brass, because it is the one thing on the screen that is for sale.
    eyebrow(3);
    const store = new Phaser.Geom.Rectangle(left, y, width, 288 * s);
    this.rows.store = store;
    drawPanel(g, store, s, { fill: BRASS, depth: 14, radius: 32, hero: true, frame: SHELL.cream });
    this.storeRadius = 32 * s;
    const medal = { x: store.x + 28 * s + 50 * s, y: store.y + 92 * s, r: 50 * s };
    this.rows.medal = new Phaser.Geom.Rectangle(medal.x - medal.r, medal.y - medal.r, medal.r * 2, medal.r * 2);
    resize(this.texts.premium!, 44 * s, SHELL.cream);
    this.texts.premium!.setPosition(medal.x + medal.r + 24 * s, medal.y - 20 * s);
    resize(this.texts.premiumTerms!, 22 * s, shade(BRASS, -0.62), STYLE.current, false);
    this.texts.premiumTerms!.setWordWrapWidth(width - (medal.x + medal.r + 24 * s - store.x) - 28 * s, false);
    this.texts.premiumTerms!.setPosition(medal.x + medal.r + 24 * s, medal.y + 26 * s);
    this.texts.premiumBadge!.setPosition(store.right - 104 * s, store.y + 4 * s);
    const buyH = Math.max(100 * s, control);
    const buyY = store.bottom - 26 * s - buyH;
    const restoreW = Math.max(166 * s, control);
    const entitled = monetization().premium();
    const unlockRect = new Phaser.Geom.Rectangle(store.x + 26 * s, buyY, width - 52 * s - (entitled ? 0 : restoreW + 20 * s), buyH);
    const restoreRect = new Phaser.Geom.Rectangle(store.right - 26 * s - restoreW, buyY, restoreW, buyH);
    this.rows.unlock = unlockRect;
    this.rows.restore = restoreRect;
    if (!entitled) this.hits.push({ name: 'unlock', rect: unlockRect, pinned: false });
    this.hits.push({ name: 'restore', rect: entitled ? new Phaser.Geom.Rectangle(store.x + 26 * s, buyY, width - 52 * s, buyH) : restoreRect, pinned: false });
    if (entitled) this.rows.restore = new Phaser.Geom.Rectangle(store.x + 26 * s, buyY, width - 52 * s, buyH);
    y += store.height + 18 * s;

    // Nothing to refill at five hearts, or with premium held: the row leaves rather than
    // sitting there as a control that cannot do anything.
    if (this.refillOffered()) {
      const refill = new Phaser.Geom.Rectangle(left, y, width, row);
      this.rows.refill = refill;
      drawPanel(g, refill, s, card);
      this.texts.refill!.setPosition(left + 92 * s, refill.centerY);
      this.texts.refillNote!.setPosition(left + 92 * s + this.texts.refill!.width + 10 * s, refill.centerY);
      const priceW = Math.max(150 * s, control);
      const priceRect = new Phaser.Geom.Rectangle(refill.right - 26 * s - priceW, refill.centerY - control / 2, priceW, control);
      this.rows.refillPrice = priceRect;
      this.texts.refillPrice!.setPosition(priceRect.centerX, priceRect.centerY);
      this.hits.push({ name: 'refill', rect: priceRect, pinned: false });
      y += row + SETTINGS.sectionGap * s;
    } else {
      delete this.rows.refill;
      delete this.rows.refillPrice;
      y += SETTINGS.sectionGap * s;
    }

    // PROGRESS — the one control with no undo, so it arms before it fires.
    eyebrow(4);
    const progress = plate(row);
    this.rows.progress = progress;
    this.texts.level!.setPosition(left + 30 * s, progress.centerY);
    this.texts.levelNote!.setPosition(left + 30 * s + this.texts.level!.width + 10 * s, progress.centerY);
    const resetW = Math.max(160 * s, control);
    const resetRect = new Phaser.Geom.Rectangle(progress.right - 26 * s - resetW, progress.centerY - control / 2, resetW, control);
    this.rows.reset = resetRect;
    this.texts.reset!.setPosition(resetRect.centerX, resetRect.centerY);
    this.hits.push({ name: 'reset', rect: resetRect, pinned: false });

    // A store or reset message, under the last section rather than over a row.
    this.texts.notice!.setWordWrapWidth(width - 40 * s, false);
    resize(this.texts.notice!, 25 * s, PALETTE.coral, STYLE.current, false);
    this.texts.notice!.setPosition(left + width / 2, y + 18 * s);
    y += this.notice === '' ? 12 * s : 56 * s;

    this.drawBandControls(0);
    return y - this.bandRect.y;
  }

  private drawBandControls(press: number): void {
    const s = this.uiScale;
    const g = this.controls.clear();
    const entitled = monetization().premium();
    const sunk = (name: Action): number => (this.pressed === name ? press : 0);

    // Sound & feel: the scored line between the two rows, the two icons, the two switches.
    const audio = this.rows.audioCard;
    if (audio) {
      const row = SETTINGS.rowHeight * s;
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(audio.x + 24 * s, audio.y + row - 1.5 * s, audio.width - 48 * s, 3 * s);
      drawSpeaker(g, audio.x + 56 * s, audio.y + row / 2, 26 * s, PALETTE.ink, !this.soundOn);
      const canBuzz = hapticsSupported();
      drawVibrate(g, audio.x + 56 * s, audio.y + row * 1.5, 24 * s, canBuzz ? PALETTE.ink : shade(PALETTE.muted, 0.35));
      if (this.rows.sound) drawSwitch(g, this.rows.sound, s, this.switchAt.sound);
      if (this.rows.haptics) drawSwitch(g, this.rows.haptics, s, this.switchAt.haptics, !canBuzz);
    }
    // Timing.
    if (this.rows.tune) {
      drawPanel(g, this.rows.tune, s, { fill: SHELL.cream, depth: 8, press: sunk('tune'), radius: 18 });
      const sink = 8 * s * sunk('tune') * 0.8;
      drawChevron(g, this.rows.tune.right - 30 * s, this.rows.tune.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.tune!.setY(this.rows.tune.centerY + sink);
    }
    // Hearts: the row, then the bar the next one is filling.
    const hearts = this.rows.hearts;
    if (hearts) {
      const view = viewHealth(loadHealth());
      const unlimited = entitled;
      drawHeartRow(g, {
        centreX: hearts.x + 30 * s + 2.5 * 58 * s, y: hearts.y + 44 * s, count: HEALTH.max,
        radius: 24 * s, gap: 58 * s,
        filled: unlimited ? HEALTH.max : view.hearts,
        part: unlimited ? 0 : heartProgress(view),
        full: PALETTE.coral, empty: shade(SHELL.puck, -0.12), emptyOutline: shade(SHELL.puck, -0.45),
      });
      // Measured against the line beside it, because "Hearts are full" and "Next in 8:24"
      // are not the same width and a fixed inset left one of them sitting on the bar.
      const waitWidth = this.texts.heartWait!.visible ? this.texts.heartWait!.width : 0;
      const bar = new Phaser.Geom.Rectangle(
        hearts.x + 28 * s, hearts.bottom - 50 * s,
        Math.max(60 * s, hearts.width - 56 * s - waitWidth - 20 * s), 22 * s,
      );
      g.fillStyle(shade(SHELL.puck, -0.16), 1).fillRoundedRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
      g.lineStyle(STYLE.current.outline * s * 0.4, shade(SHELL.puck, -0.45), 1).strokeRoundedRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
      const grown = bar.width * (unlimited ? 1 : heartProgress(view));
      if (grown > bar.height) {
        const f = faces(PALETTE.coral);
        g.fillStyle(f.face, 1).fillRoundedRect(bar.x, bar.y, grown, bar.height, bar.height / 2);
        g.fillStyle(f.rim, 0.5).fillRoundedRect(bar.x + bar.height * 0.4, bar.y + 4 * s, grown - bar.height * 0.8, 5 * s, 3 * s);
      }
    }
    // Store: the medallion, the badge plate, and the two controls.
    const store = this.rows.store, medal = this.rows.medal;
    if (store && medal) {
      const m = faces(shade(BRASS, 0.3));
      g.fillStyle(shade(BRASS, -0.4), 1).fillCircle(medal.centerX, medal.centerY + 5 * s, medal.width / 2);
      g.fillStyle(m.lit, 1).fillCircle(medal.centerX, medal.centerY, medal.width / 2);
      g.fillStyle(m.rim, 0.45).fillEllipse(medal.centerX - medal.width * 0.12, medal.centerY - medal.width * 0.26, medal.width * 0.34, medal.width * 0.15);
      g.lineStyle(STYLE.current.outline * s * 0.5, shade(BRASS, -0.55), 1).strokeCircle(medal.centerX, medal.centerY, medal.width / 2);
      drawInfinity(g, medal.centerX, medal.centerY, medal.width * 0.34, shade(BRASS, -0.62));
      const badge = this.texts.premiumBadge!;
      const bw = badge.width + 34 * s, bh = 40 * s;
      g.fillStyle(shade(PALETTE.coral, -0.4), 1).fillRoundedRect(badge.x - bw / 2, store.y - 6 * s, bw, bh + 6 * s, 10 * s);
      g.fillStyle(PALETTE.coral, 1).fillRoundedRect(badge.x - bw / 2, store.y - 8 * s, bw, bh, 10 * s);
      badge.setY(store.y + bh / 2 - 8 * s).setVisible(!entitled);
    }
    if (this.rows.unlock && !entitled) {
      drawPanel(g, this.rows.unlock, s, { fill: PALETTE.coral, depth: 12, press: sunk('unlock'), hero: true, radius: 22 });
      const sink = 12 * s * sunk('unlock') * 0.8;
      const unlock = this.texts.unlock!, price = this.texts.unlockPrice!;
      const span = unlock.width + 14 * s + price.width;
      unlock.setPosition(this.rows.unlock.centerX - span / 2 + unlock.width, this.rows.unlock.centerY + sink);
      price.setPosition(unlock.x + 14 * s, this.rows.unlock.centerY + sink + 3 * s);
    }
    if (this.rows.restore) {
      drawPanel(g, this.rows.restore, s, { fill: SHELL.cream, depth: 10, press: sunk('restore'), radius: 22 });
      this.texts.restore!.setPosition(this.rows.restore.centerX, this.rows.restore.centerY + 10 * s * sunk('restore') * 0.8);
    }
    // Refill.
    if (this.rows.refill && this.rows.refillPrice) {
      drawHeart(g, this.rows.refill.x + 56 * s, this.rows.refill.centerY, 22 * s, PALETTE.coral);
      drawPanel(g, this.rows.refillPrice, s, { fill: SHELL.cream, depth: 8, press: sunk('refill'), radius: 18 });
      this.texts.refillPrice!.setY(this.rows.refillPrice.centerY + 8 * s * sunk('refill') * 0.8);
    }
    // Progress.
    if (this.rows.reset) {
      drawPanel(g, this.rows.reset, s, {
        fill: this.resetArmed ? PALETTE.coral : SHELL.cream, depth: 8, press: sunk('reset'), radius: 18,
      });
      resize(this.texts.reset!, 23 * s, this.resetArmed ? SHELL.cream : PALETTE.ink, STYLE.current, false);
      this.texts.reset!.setY(this.rows.reset.centerY + 8 * s * sunk('reset') * 0.8);
    }
  }

  private drawPinned(press: number, doneRect?: Phaser.Geom.Rectangle): void {
    const s = this.uiScale;
    const g = this.pinned.clear();
    const back = this.hits.find(h => h.name === 'back');
    if (back) {
      const p = this.pressed === 'back' ? press : 0;
      drawPuck(g, back.rect.centerX, back.rect.centerY, s, p);
      this.backMark.clear();
      drawBack(this.backMark, back.rect.centerX, back.rect.centerY + puckSink(s, p), CHROME.puckRadius * s * 0.44, PALETTE.ink);
    }
    const done = doneRect ?? this.hits.find(h => h.name === 'done')?.rect;
    if (!done) return;
    const p = this.pressed === 'done' ? press : 0;
    drawPanel(g, done, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: p, hero: true });
    resize(this.texts.done!, 50 * s, SHELL.cream);
    this.texts.done!.setPosition(done.centerX, done.centerY + CHROME.block.depth * s * p * 0.8);
  }

  private refreshCopy(): void {
    const progress = loadProgress();
    const view = viewHealth(loadHealth());
    const entitled = monetization().premium();
    const canBuzz = hapticsSupported();
    this.texts.offsetValue!.setText(formatOffset(loadSettings().calibrationMs));
    this.texts.hapticsNote!.setVisible(!canBuzz);
    this.texts.heartCount!.setText(entitled ? '∞' : `${view.hearts}/${view.maxHearts}`);
    this.texts.heartCount!.setVisible(!entitled);
    this.texts.heartWait!.setText(entitled ? STORE_COPY.premiumOwned
      : view.nextHeartInMs === null ? 'Hearts are full'
      : `Next in ${formatCountdown(view.nextHeartInMs)}`);
    const premiumPrice = monetization().productPrice(PRODUCT.premium);
    this.texts.premium!.setText(entitled ? 'Unlocked' : STORE_COPY.premiumTitle);
    this.texts.premiumTerms!.setText(entitled ? STORE_COPY.premiumShort : STORE_COPY.premiumTerms);
    this.texts.unlockPrice!.setText(premiumPrice ?? '');
    for (const key of ['unlock', 'unlockPrice']) this.texts[key]!.setVisible(!entitled);
    const refillPrice = monetization().productPrice(PRODUCT.heartRefill);
    this.texts.refillPrice!.setText(refillPrice ?? 'Buy');
    const offered = this.refillOffered();
    for (const key of ['refill', 'refillNote', 'refillPrice']) this.texts[key]!.setVisible(offered);
    const area = areaOf(progress.unlocked);
    this.texts.level!.setText(`Level ${progress.unlocked}`);
    this.texts.levelNote!.setText(`· ${area.name}`);
    this.texts.reset!.setText(this.resetArmed ? 'Confirm' : 'Reset');
    this.texts.notice!.setText(this.notice).setVisible(this.notice !== '');
  }

  public override update(_time: number, delta: number): void {
    const now = performance.now() / 1000;
    this.stepScroll(delta);
    const press = pressAmount(now, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      this.drawBandControls(press);
      this.drawPinned(press);
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    }
    // The switches slide rather than cut, and the slide is the only thing that redraws.
    for (const key of ['sound', 'haptics'] as const) {
      const target = (key === 'sound' ? this.soundOn : this.hapticsOn) ? 1 : 0;
      if (Math.abs(this.switchAt[key] - target) < 0.002) { this.switchAt[key] = target; continue; }
      const age = now - this.switchedAt[key];
      const t = this.reducedMotion ? 1 : Math.min(1, age / 0.18);
      this.switchAt[key] = target === 1 ? t : 1 - t;
      this.pressDirty = true;
    }
    this.placeSheen();
    this.sheen.update(now, !monetization().premium() && this.storeInView());
    const age = now - this.enteredAt;
    if (age < 1.1) {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(age, 0.7);
      this.headline.setPosition(this.headlineAt.x, this.headlineAt.y + rise * 30 * this.uiScale).setAlpha(alpha);
    }
  }

  /**
   * The highlight only runs while the whole brass panel is in the band. Half a panel
   * would need the sheen's own mask intersected with the band's, and pausing a glint
   * for the moment it is being scrolled into place costs the screen nothing.
   */
  private storeInView(): boolean {
    const store = this.rows.store;
    if (!store) return false;
    return store.y - this.scrollY >= this.bandRect.y && store.bottom - this.scrollY <= this.bandRect.bottom;
  }

  /** Follows the scroll, and only redraws its mask when the scroll has actually moved. */
  private placeSheen(): void {
    const store = this.rows.store;
    if (!store || this.sheenAt === this.scrollY) return;
    this.sheenAt = this.scrollY;
    this.sheen.place(
      new Phaser.Geom.Rectangle(store.x, store.y - this.scrollY, store.width, store.height),
      this.storeRadius, 5.5,
    );
  }

  /**
   * The band's camera does not draw the curtain — it would land offset by the viewport's
   * own origin — so the sections fade out under the first frames of the sweep instead.
   */
  private leaveBehindCurtain(start: () => void): void {
    if (this.curtain.active) return;
    this.tweens.add({ targets: this.bandCamera, alpha: 0, duration: this.reducedMotion ? 1 : 130 });
    start();
  }

  private stepScroll(delta: number): void {
    if (this.drag || Math.abs(this.velocity) < 1) return;
    const step = scrollStep(this.velocity, delta, SETTINGS.friction);
    this.velocity = step.velocity;
    this.setScroll(this.scrollY + step.distance);
    if (this.scrollY <= 0 || this.scrollY >= this.scrollMax) this.velocity = 0;
  }

  private setScroll(value: number): void {
    this.scrollY = Math.max(0, Math.min(this.scrollMax, value));
    this.applyScroll();
  }

  /** The band's camera holds the scroll, so a scroll moves nothing and relays out nothing. */
  private applyScroll(): void {
    this.bandCamera.setScroll(this.bandRect.x, this.bandRect.y + this.scrollY);
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.curtain.active || this.drag || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.velocity = 0;
    this.drag = {
      id: pointer.id, lastY: pointer.y, lastAt: performance.now(), startY: pointer.y, moved: false,
      // Only a gesture that began inside the band can scroll it; one that began on Done
      // travels without moving the sections under it.
      scrollable: Phaser.Geom.Rectangle.Contains(this.bandRect, pointer.x, pointer.y),
    };
  }

  private pointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.id || !pointer.isDown) return;
    const now = performance.now();
    const dy = pointer.y - drag.lastY;
    if (Math.abs(pointer.y - drag.startY) > SETTINGS.tapSlop * this.viewport.unitScale) drag.moved = true;
    if (drag.moved && drag.scrollable && this.scrollMax > 0) {
      this.setScroll(this.scrollY - dy);
      const dt = Math.max(1, now - drag.lastAt) / 1000;
      this.velocity = Phaser.Math.Clamp(-dy / dt, -6000, 6000);
    }
    drag.lastAt = now;
    drag.lastY = pointer.y;
  }

  /**
   * A control fires on the release, not on the press. `TapInput` deliberately reports the
   * press, because in gameplay the press *is* the musical event; here a press is the start
   * of a gesture that may turn out to be a scroll, and firing Unlock because the thumb
   * happened to start its flick over the store would be indefensible.
   */
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
    for (const hit of this.hits) {
      const localY = hit.pinned ? y : y + this.scrollY;
      if (!hit.pinned && !Phaser.Geom.Rectangle.Contains(this.bandRect, x, y)) continue;
      if (!Phaser.Geom.Rectangle.Contains(hit.rect, x, localY)) continue;
      this.act(hit.name);
      return;
    }
    if (this.resetArmed) { this.resetArmed = false; this.refreshCopy(); this.pressDirty = true; }
  }

  private act(name: Action): void {
    this.pressedAt = performance.now() / 1000;
    this.pressed = name;
    this.pressDirty = true;
    vibrate('tap');
    if (name !== 'reset') this.resetArmed = false;
    if (name !== 'unlock' && name !== 'restore' && name !== 'refill') this.notice = '';
    switch (name) {
      case 'back':
      case 'done': this.leave(); return;
      case 'tune':
        this.leaveBehindCurtain(() => this.curtain.cover(() => this.scene.start(SceneKey.Calibrate, { from: this.from })));
        return;
      case 'sound': this.toggleSound(); return;
      case 'haptics': this.toggleHaptics(); return;
      case 'unlock': void this.buy(PRODUCT.premium); return;
      case 'refill': void this.buy(PRODUCT.heartRefill); return;
      case 'restore': void this.restore(); return;
      case 'reset': this.resetTapped(); return;
      case 'privacy': openLegal(LEGAL.privacy); return;
      case 'terms': openLegal(LEGAL.terms); return;
    }
  }

  private toggleSound(): void {
    this.soundOn = !toggleMute(sharedAudio(this));
    this.switchedAt.sound = performance.now() / 1000;
    this.refreshCopy();
  }

  /** The switch stays live on a device that cannot buzz; only the pulse is missing. */
  private toggleHaptics(): void {
    this.hapticsOn = !this.hapticsOn;
    this.switchedAt.haptics = performance.now() / 1000;
    setHaptics(this.hapticsOn);
    saveSettings({ ...loadSettings(), haptics: this.hapticsOn });
    if (this.hapticsOn) vibrate('stamp');
    this.refreshCopy();
  }

  /** Two taps, because there is no undo: the second one destroys every cleared level. */
  private resetTapped(): void {
    if (!this.resetArmed) { this.resetArmed = true; this.refreshCopy(); return; }
    this.resetArmed = false;
    const cleared = clearProgress();
    clearHealth();
    this.notice = cleared ? '' : 'Couldn’t reset.';
    this.refreshCopy();
    this.layout();
  }

  private async buy(product: ProductId): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    track('purchase_offer_shown', { product });
    try {
      const result = await monetization().purchase(product);
      if (this.disposed || this.curtain.active) return;
      this.notice = result.ok ? '' : purchaseFeedback(result.reason);
      if (result.ok) vibrate('stamp');
      this.refreshCopy();
      this.layout();
    } finally {
      this.commerceBusy = false;
    }
  }

  private async restore(): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    try {
      const result = await monetization().restorePurchases();
      if (this.disposed || this.curtain.active) return;
      this.notice = restoreFeedback(result);
      this.refreshCopy();
      this.layout();
    } finally {
      this.commerceBusy = false;
    }
  }

  private leave(): void {
    this.leaveBehindCurtain(() => this.curtain.cover(() => this.scene.start(this.from)));
  }

  private shutdown(): void {
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.wheel, this);
    window.removeEventListener('blur', this.cancelDrag);
    window.removeEventListener('pointercancel', this.cancelDrag);
    this.sheen.destroy();
    this.cameras.remove(this.bandCamera);
    this.backdrop.destroy();
  }
}

/**
 * Opens a legal page outside the game. `_blank` is what a Capacitor WebView hands to the
 * system browser, and what a desktop browser opens in a tab; `noopener` is required
 * because the opened page would otherwise hold a handle on this one.
 */
function openLegal(url: string): void {
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* a blocked popup costs nothing here */ }
}
