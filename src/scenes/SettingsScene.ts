import Phaser from 'phaser';
import { setAnalyticsConsent } from '@/analytics/boot';
import { currentAudio, ensureScreenMusic, resetCalibration, setBusVolume } from '@/audio/sharedAudio';
import { activeCalibration, currentRoute, onRouteChange } from '@/audio/audioRoute';
import { ROUTE_LABELS } from '@/game/routeCalibration';
import { CREDITS } from '@/config/credits';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { hapticsSupported, setHaptics, vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { areaOf } from '@/game/levels';
import { clearProgress, loadProgress } from '@/game/progress';
import { redrawToday } from '@/game/objectives';
import { dailyTempoLeaderboardOffered, openDailyTempoLeaderboard } from '@/playgames/dailyTempo';
import { achievementsOffered, openAchievements } from '@/playgames/achievementSync';
import { repairCloudBinding } from '@/playgames/cloudSync';
import { clearHealth, HEALTH, heartProgress, formatCountdown, loadHealth, viewHealth } from '@/game/health';
import { clampVolume, loadSettings, saveSettings, type VolumeBus } from '@/game/settings';
import { monetization, PRODUCT, purchaseFeedback, restoreFeedback, STORE_COPY, track, type ProductId } from '@/monetization';
import { BakedLayer, bakeOne } from '@/ui/bakedLayer';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawHeartRow, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { shade } from '@/ui/colour';
import { drawBack, drawChevron, drawHeart, drawInfinity, drawNote, drawSpeaker, drawVibrate } from '@/ui/icons';
import { faces } from '@/ui/light';
import { scrollStep } from '@/ui/navigation';
import { BRASS, drawPanel } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { Sheen } from '@/ui/sheen';
import { arrive } from '@/ui/spring';
import { drawSlider, sliderValue, SLIDER } from '@/ui/slider';
import { drawSwitch, SWITCH } from '@/ui/switch';
import { body, display, label, resize, wrapWidth } from '@/ui/type';
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
type Action = 'back' | 'haptics' | 'tune' | 'offsetReset' | 'unlock' | 'restore' | 'refill'
  | 'transfer' | 'leaderboard' | 'achievements' | 'reset' | 'analytics' | 'adPrivacy' | 'help' | 'credit' | 'privacy' | 'terms' | 'done';

interface Hit { readonly name: Action; readonly rect: Phaser.Geom.Rectangle; readonly pinned: boolean }

const LEGAL = {
  privacy: 'https://tinytempo.games/privacy/',
  terms: 'https://tinytempo.games/terms/',
} as const;

/**
 * Player settings.
 *
 * It was a flat stack of four identical cards, each stating its value in a sentence and
 * offering a button labelled with the opposite of that sentence — "Sound on" beside
 * "Mute". The refinement groups the rows under labelled sections. Music and effects are
 * levels, haptics stays a switch, the hearts are the ones the player actually has,
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
  /**
   * The sections, their controls and the pinned back puck and Done: some 17,000 commands
   * that change only on a press, a slide or a switch, so each is a raster at rest
   * (`ui/bakedLayer.ts`) and live only while it moves.
   */
  private layers: BakedLayer[] = [];
  private primed = false;
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
  private drag: {
    id: number; lastY: number; lastAt: number; startY: number; moved: boolean; scrollable: boolean;
    /** Set when the gesture began on a level, so a vertical drift cannot scroll the band. */
    slider: VolumeBus | null;
  } | null = null;
  private pressedAt = -Infinity;
  private pressed: Action | null = null;
  private pressDirty = false;
  private resetArmed = false;
  private commerceBusy = false;
  private notice = '';
  private from: string = SceneKey.Menu;
  private enteredAt = 0;
  private headlineAt = { x: 0, y: 0 };
  private music = 1;
  private sfx = 1;
  /** The speaker puck's mute. The sliders keep their levels underneath it. */
  private masterMuted = false;
  private hapticsOn = true;
  private analyticsOn = false;
  /** 0-1 positions, so a flipped switch slides rather than jumping. */
  private switchAt = { haptics: 1, analytics: 1 };
  private switchedAt = { haptics: -Infinity, analytics: -Infinity };
  private lastSfxTick = 0;
  private disposed = false;
  private stopWatchingRoute: (() => void) | null = null;
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
    this.music = settings.music;
    this.sfx = settings.sfx;
    this.masterMuted = settings.muted;
    this.hapticsOn = settings.haptics;
    this.analyticsOn = settings.analytics;
    this.switchAt = { haptics: this.hapticsOn ? 1 : 0, analytics: this.analyticsOn ? 1 : 0 };
    this.switchedAt = { haptics: -Infinity, analytics: -Infinity };
    this.lastSfxTick = 0;
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
    this.layers = [this.controls, this.plates, this.pinned].map(graphics => new BakedLayer(this, graphics));
    this.primed = false;
    this.headline = display(this, 'Settings', { size: 56, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(5);
    // Assigned, never appended to. A field initializer runs once per scene *instance*
    // while `build` runs once per *entry*, and Phaser keeps the instance and destroys the
    // display list — so pushing here left seven new eyebrows behind the seven destroyed
    // ones, `eyebrow(index)` kept reading the dead batch, and `Text.setColor` threw
    // inside `create` and took the whole game down on the way back from Calibrate.
    // Replacing the array rather than clearing it makes that unreachable by construction.
    this.eyebrows = ['Sound & feel', 'Timing', 'Hearts', 'Workshop store', 'Progress', 'Privacy', 'Help', 'Credits']
      .map(caption => this.banded(label(this, caption, { size: 21, colour: PALETTE.muted })).setOrigin(0, 0.5));
    this.buildTexts();
    // Earbuds in or out while Settings is open: the timing row names the new route and its value.
    this.stopWatchingRoute = onRouteChange(() => { if (!this.disposed) { this.refreshCopy(); this.layout(); } });
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
    // The title theme when the title screen opened Settings, the road's loop when the map did.
    ensureScreenMusic(this, this.from === SceneKey.Menu);
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
      music: rowTitle('Music'),
      sfx: rowTitle('Effects'),
      musicValue: this.banded(body(this, '', { size: 26, colour: ink })).setOrigin(1, 0.5),
      sfxValue: this.banded(body(this, '', { size: 26, colour: ink })).setOrigin(1, 0.5),
      mutedNote: this.banded(label(this, 'Muted', { size: 21, colour: PALETTE.coral })).setOrigin(1, 0.5),
      haptics: rowTitle('Haptics'),
      hapticsNote: rowNote('Not on this device'),
      offset: rowTitle('Tap offset'),
      offsetNote: rowNote('· Measured on this device'),
      offsetValue: this.banded(display(this, '', { size: 48, colour: ink })).setOrigin(1, 0.5),
      tune: chip('Tune'),
      offsetReset: chip('Reset'),
      heartCount: this.banded(display(this, '', { size: 42, colour: ink })).setOrigin(1, 0.5),
      heartWait: rowNote(''),
      premium: this.banded(display(this, STORE_COPY.premiumTitle, { size: 48, colour: cream, outline: shade(BRASS, -0.62) })).setOrigin(0, 0.5),
      // Top-anchored: the terms wrap on a narrow handset, and a second line has to grow
      // down into the card rather than up into the title.
      premiumTerms: this.banded(body(this, STORE_COPY.premiumTerms, { size: 22, colour: shade(BRASS, -0.62) })).setOrigin(0, 0),
      premiumBadge: chip('Best value', cream),
      unlock: this.banded(display(this, 'Unlock', { size: 38, colour: cream })).setOrigin(1, 0.5),
      unlockPrice: this.banded(label(this, '', { size: 27, colour: cream })).setOrigin(0, 0.5),
      restore: chip('Restore'),
      refill: rowTitle(STORE_COPY.refillTitle),
      refillNote: rowNote(`· ${STORE_COPY.refillTerms.toLowerCase()}`),
      refillPrice: chip(''),
      help: rowTitle('Contact us'),
      helpNote: rowNote('Report a problem, or ask for a hand'),
      helpGo: chip('Open'),
      // The person first, their work under it: a credit names someone.
      credit: rowTitle(CREDITS.score.name),
      creditNote: rowNote(CREDITS.score.role),
      creditGo: chip('Profile'),
      analytics: rowTitle('Share usage data'),
      // Kept short on purpose: the switch starts 150 units from the card's right edge, so
      // a note has about 450 design units — roughly forty characters at this size — before
      // it runs under the knob. It names what is sent — levels and their results, and the
      // offers — as well as what is not, because a consent row that understates what it
      // covers is not consent to it: "offers only" was true until the gameplay events
      // joined the same bus.
      analyticsNote: rowNote('Levels, results and offers — no name'),
      adPrivacy: rowTitle('Ad privacy'),
      adPrivacyNote: rowNote('Manage your ad choices'),
      adPrivacyGo: chip('Open'),
      transfer: rowTitle('Save code'),
      transferNote: rowNote('Carry your progress to another device'),
      transferGo: chip('Open'),
      leaderboard: rowTitle('Daily Tempo leaderboard'),
      leaderboardNote: rowNote('Your best today, against everyone'),
      leaderboardGo: chip('Open'),
      achievements: rowTitle('Achievements'),
      achievementsNote: rowNote('Your Play Games achievements'),
      achievementsGo: chip('Open'),
      level: rowTitle(''),
      levelNote: rowNote(''),
      reset: chip('Reset'),
      // Centred on the card and aligned to match: a wrapped notice with a left align
      // inside a centred box came out ragged against the card's own centre line.
      notice: this.banded(body(this, '', { size: 24, colour: muted, align: 'center' })).setOrigin(0.5),
    };
    this.texts.legal = body(this, 'Privacy · Terms', { size: 24, colour: muted, align: 'center' }).setOrigin(0.5).setDepth(5);
    this.texts.version = body(this, `· v${__APP_VERSION__}`, { size: 24, colour: muted }).setOrigin(0, 0.5).setDepth(5);
    this.texts.done = display(this, 'Done', { size: 50, colour: cream, align: 'center' }).setOrigin(0.5).setDepth(5);
  }

  /** A refill is an offer only while there is room for the hearts it would restore. */
  private refillOffered(): boolean {
    return !monetization().premium() && viewHealth(loadHealth()).hearts < HEALTH.max;
  }

  /**
   * UMP's privacy-options button, not the analytics switch. Hidden in the browser, on
   * a native build whose message is not required, and until consent info has arrived.
   */
  private adPrivacyOffered(): boolean {
    return monetization().privacyOptionsAvailable();
  }

  /**
   * The Daily Tempo leaderboard, only where it can work: a native build, a configured
   * leaderboard, and a Daily Tempo to have played (`playgames/dailyTempo.ts`). Signed out
   * is not a reason to hide it — tapping it is how a player chooses to sign in.
   */
  private leaderboardOffered(): boolean {
    return dailyTempoLeaderboardOffered();
  }

  /** Play Games achievements, on a native build with at least one configured. */
  private achievementsOffered(): boolean {
    return achievementsOffered();
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const width = Math.min(SETTINGS.width * s, safe.width - 40 * s);
    const left = safe.centerX - width / 2;
    this.hits = [];

    // Header: a back puck and the title, both pinned.
    const backAt = { x: left + CHROME.puckRadius * s, y: safe.top + 66 * s };
    this.headlineAt = { x: backAt.x + (CHROME.puckRadius + 26) * s, y: backAt.y };
    resize(this.headline, 56 * s, PALETTE.ink);
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
    // A word space, so "Terms · v1" spaces its dot as "Privacy · Terms" does.
    const gap = 6 * s;
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
    // The first layout is under the curtain: rasterise now rather than on the reveal's frames.
    if (!this.primed) {
      this.primed = true;
      for (const layer of this.layers) layer.bake();
    }
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
      // On the rows' own text column, so a section's label lines up with its first title.
      text.setPosition(left + 28 * s, y + 12 * s);
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

    // SOUND & FEEL — two levels, then the haptics switch. The levels are dragged; the
    // switch still fires on release, because a press there may be the start of a scroll.
    eyebrow(0);
    resize(this.texts.mutedNote!, 21 * s, PALETTE.coral, STYLE.current, false);
    this.texts.mutedNote!.setPosition(left + width - 28 * s, this.eyebrows[0]!.y).setVisible(this.masterMuted);
    const audio = plate(row * 3);
    const level = (index: number): Phaser.Geom.Rectangle => {
      const top = audio.y + row * index;
      const trackH = SLIDER.height * s;
      // The percent keeps a fixed slot, so "9%" and "100%" do not shove the track.
      const slot = 84 * s;
      const track = new Phaser.Geom.Rectangle(
        left + 248 * s, top + row / 2 - trackH / 2,
        audio.right - 22 * s - slot - 10 * s - (left + 248 * s), trackH,
      );
      return track;
    };
    this.rows.musicTrack = level(0);
    this.rows.sfxTrack = level(1);
    this.rows.musicRow = new Phaser.Geom.Rectangle(left, audio.y, width, row);
    this.rows.sfxRow = new Phaser.Geom.Rectangle(left, audio.y + row, width, row);
    this.rows.haptics = switchRect(audio, audio.y + row * 2, row);
    this.rows.audioCard = audio;
    this.texts.music!.setPosition(left + 96 * s, audio.y + row / 2);
    this.texts.sfx!.setPosition(left + 96 * s, audio.y + row * 1.5);
    this.texts.musicValue!.setPosition(audio.right - 22 * s, audio.y + row / 2);
    this.texts.sfxValue!.setPosition(audio.right - 22 * s, audio.y + row * 1.5);
    this.texts.musicValue!.setText(`${Math.round(this.music * 100)}%`);
    this.texts.sfxValue!.setText(`${Math.round(this.sfx * 100)}%`);
    // On a device with no vibrator the row carries a note under its title and the title
    // rides up to make room; everywhere else the title is centred on the row.
    const buzzes = hapticsSupported();
    this.texts.haptics!.setPosition(left + 96 * s, audio.y + row * 2.5 - (buzzes ? 0 : 15 * s));
    this.texts.hapticsNote!.setPosition(left + 96 * s, audio.y + row * 2.5 + 19 * s);
    this.hits.push({ name: 'haptics', rect: new Phaser.Geom.Rectangle(left, audio.y + row * 2, width, row), pinned: false });

    // TIMING — the measured offset, the screen that measures it, and a way back to zero.
    // A kept measurement adds to the offset already in force, so without Reset a bad
    // run can only be undone by measuring the opposite error.
    eyebrow(1);
    const timing = plate(tall);
    this.rows.timing = timing;
    const tuneW = Math.max(150 * s, control);
    const tuneRect = new Phaser.Geom.Rectangle(timing.right - 24 * s - tuneW, timing.centerY - control / 2, tuneW, control);
    this.rows.tune = tuneRect;
    this.texts.tune!.setPosition(tuneRect.centerX - 16 * s, tuneRect.centerY);
    // Reset only where the active route has a measurement to drop.
    if (activeCalibration() !== null) {
      const resetW = Math.max(132 * s, control);
      const resetRect = new Phaser.Geom.Rectangle(tuneRect.x - 12 * s - resetW, tuneRect.y, resetW, control);
      this.rows.offsetReset = resetRect;
      this.texts.offsetReset!.setPosition(resetRect.centerX, resetRect.centerY);
      this.hits.push({ name: 'offsetReset', rect: resetRect, pinned: false });
    } else {
      delete this.rows.offsetReset;
    }
    // Value lives on the note line, not beside the title: Reset + Tune on the right would
    // otherwise run "+120 ms" into "Tap offset" on a 393-wide handset.
    this.texts.offset!.setPosition(left + 28 * s, timing.centerY - 20 * s);
    resize(this.texts.offsetValue!, 32 * s, PALETTE.ink, STYLE.current, false);
    this.texts.offsetValue!.setOrigin(0, 0.5).setPosition(left + 28 * s, timing.centerY + 22 * s);
    this.texts.offsetNote!.setPosition(
      left + 28 * s + this.texts.offsetValue!.width + 12 * s, timing.centerY + 22 * s,
    );
    // The route's name shrinks rather than running under Reset or Tune on a narrow handset:
    // "+142 ms · Bluetooth audio" beside both buttons is wider than a 393-point row.
    const note = this.texts.offsetNote!;
    note.setScale(1);
    const room = (this.rows.offsetReset ?? tuneRect).x - 12 * s - note.x;
    if (note.width > room) note.setScale(Math.max(0.55, room / note.width));
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
    wrapWidth(this.texts.premiumTerms!, width - (medal.x + medal.r + 24 * s - store.x) - 28 * s);
    this.texts.premiumTerms!.setPosition(medal.x + medal.r + 24 * s, medal.y + 14 * s);
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

    // PROGRESS — the way out, then the way to destroy it. The save code goes first because
    // a player who reads this far and taps the wrong one should land on the recoverable one.
    eyebrow(4);
    const leaderboard = this.leaderboardOffered();
    const achievements = this.achievementsOffered();
    const extra = (leaderboard ? 1 : 0) + (achievements ? 1 : 0);
    const progress = plate(row * (2 + extra));
    this.rows.progress = progress;
    const transferRow = new Phaser.Geom.Rectangle(left, progress.y, width, row);
    this.rows.transferRow = transferRow;
    this.texts.transfer!.setPosition(left + 28 * s, transferRow.centerY - 15 * s);
    this.texts.transferNote!.setPosition(left + 28 * s, transferRow.centerY + 19 * s);
    const goW = Math.max(150 * s, control);
    const goRect = new Phaser.Geom.Rectangle(transferRow.right - 26 * s - goW, transferRow.centerY - control / 2, goW, control);
    this.rows.transfer = goRect;
    this.texts.transferGo!.setPosition(goRect.centerX, goRect.centerY);
    this.hits.push({ name: 'transfer', rect: goRect, pinned: false });

    if (leaderboard) {
      const boardRow = new Phaser.Geom.Rectangle(left, progress.y + row, width, row);
      this.rows.leaderboardRow = boardRow;
      this.texts.leaderboard!.setPosition(left + 28 * s, boardRow.centerY - 15 * s);
      this.texts.leaderboardNote!.setPosition(left + 28 * s, boardRow.centerY + 19 * s);
      const boardW = Math.max(150 * s, control);
      const boardRect = new Phaser.Geom.Rectangle(boardRow.right - 26 * s - boardW, boardRow.centerY - control / 2, boardW, control);
      this.rows.leaderboard = boardRect;
      this.texts.leaderboardGo!.setPosition(boardRect.centerX - 14 * s, boardRect.centerY);
      this.hits.push({ name: 'leaderboard', rect: boardRect, pinned: false });
    } else {
      delete this.rows.leaderboard;
      delete this.rows.leaderboardRow;
    }
    if (achievements) {
      const badgeRow = new Phaser.Geom.Rectangle(left, progress.y + row * (leaderboard ? 2 : 1), width, row);
      this.rows.achievementsRow = badgeRow;
      this.texts.achievements!.setPosition(left + 28 * s, badgeRow.centerY - 15 * s);
      this.texts.achievementsNote!.setPosition(left + 28 * s, badgeRow.centerY + 19 * s);
      const badgeW = Math.max(150 * s, control);
      const badgeRect = new Phaser.Geom.Rectangle(badgeRow.right - 26 * s - badgeW, badgeRow.centerY - control / 2, badgeW, control);
      this.rows.achievements = badgeRect;
      this.texts.achievementsGo!.setPosition(badgeRect.centerX - 14 * s, badgeRect.centerY);
      this.hits.push({ name: 'achievements', rect: badgeRect, pinned: false });
    } else {
      delete this.rows.achievements;
      delete this.rows.achievementsRow;
    }

    // Reset stays last: the destructive row is the one furthest from the thumb's first reach.
    const resetRow = new Phaser.Geom.Rectangle(left, progress.y + row * (1 + extra), width, row);
    this.texts.level!.setPosition(left + 28 * s, resetRow.centerY);
    this.texts.levelNote!.setPosition(left + 28 * s + this.texts.level!.width + 10 * s, resetRow.centerY);
    const resetW = Math.max(160 * s, control);
    const resetRect = new Phaser.Geom.Rectangle(resetRow.right - 26 * s - resetW, resetRow.centerY - control / 2, resetW, control);
    this.rows.reset = resetRect;
    this.texts.reset!.setPosition(resetRect.centerX, resetRect.centerY);
    this.hits.push({ name: 'reset', rect: resetRect, pinned: false });

    // PRIVACY — the analytics switch always, and UMP's privacy-options row only when
    // AdMob says the entry point is required. The policy's "your choices" section has
    // to be able to point at something a player can actually reach.
    y += SETTINGS.sectionGap * s;
    eyebrow(5);
    const adPrivacy = this.adPrivacyOffered();
    const privacy = plate(row * (adPrivacy ? 2 : 1));
    this.rows.privacyCard = privacy;
    this.rows.analytics = switchRect(privacy, privacy.y, row);
    this.texts.analytics!.setPosition(left + 28 * s, privacy.y + row / 2 - 15 * s);
    this.texts.analyticsNote!.setPosition(left + 28 * s, privacy.y + row / 2 + 19 * s);
    this.hits.push({ name: 'analytics', rect: new Phaser.Geom.Rectangle(left, privacy.y, width, row), pinned: false });
    if (adPrivacy) {
      const privacyRow = new Phaser.Geom.Rectangle(left, privacy.y + row, width, row);
      this.rows.adPrivacyRow = privacyRow;
      this.texts.adPrivacy!.setPosition(left + 28 * s, privacyRow.centerY - 15 * s);
      this.texts.adPrivacyNote!.setPosition(left + 28 * s, privacyRow.centerY + 19 * s);
      const goW = Math.max(150 * s, control);
      const goRect = new Phaser.Geom.Rectangle(privacyRow.right - 26 * s - goW, privacyRow.centerY - control / 2, goW, control);
      this.rows.adPrivacy = goRect;
      this.texts.adPrivacyGo!.setPosition(goRect.centerX - 14 * s, goRect.centerY);
      this.hits.push({ name: 'adPrivacy', rect: goRect, pinned: false });
    } else {
      delete this.rows.adPrivacy;
      delete this.rows.adPrivacyRow;
    }

    // HELP — the last section with anything to do, because it is where someone looks once
    // something has gone wrong, and by then they have already scrolled past everything that
    // might have prevented it. Only the credits follow it, and they ask nothing of anyone.
    y += SETTINGS.sectionGap * s;
    eyebrow(6);
    const help = plate(row);
    this.rows.helpCard = help;
    this.texts.help!.setPosition(left + 28 * s, help.centerY - 15 * s);
    this.texts.helpNote!.setPosition(left + 28 * s, help.centerY + 19 * s);
    const helpW = Math.max(150 * s, control);
    const helpRect = new Phaser.Geom.Rectangle(help.right - 26 * s - helpW, help.centerY - control / 2, helpW, control);
    this.rows.help = helpRect;
    this.texts.helpGo!.setPosition(helpRect.centerX - 14 * s, helpRect.centerY);
    this.hits.push({ name: 'help', rect: helpRect, pinned: false });

    // CREDITS — the people whose work is in the game beyond its code, each a row whose chip
    // opens a page of their own choosing (`config/credits.ts`, mirrored on the website).
    y += SETTINGS.sectionGap * s;
    eyebrow(7);
    const credit = plate(row);
    this.rows.creditCard = credit;
    this.texts.credit!.setPosition(left + 28 * s, credit.centerY - 15 * s);
    this.texts.creditNote!.setPosition(left + 28 * s, credit.centerY + 19 * s);
    // Measured: "Profile" is a letter longer than "Open", and at the chips' 150 it ran
    // into the chevron. The caption sits 14 left of centre, so this leaves it 18 clear.
    const creditW = Math.max(150 * s, control, this.texts.creditGo!.width + 80 * s);
    const creditRect = new Phaser.Geom.Rectangle(credit.right - 26 * s - creditW, credit.centerY - control / 2, creditW, control);
    this.rows.credit = creditRect;
    this.texts.creditGo!.setPosition(creditRect.centerX - 14 * s, creditRect.centerY);
    this.hits.push({ name: 'credit', rect: creditRect, pinned: false });

    // A store or reset message, under the last section rather than over a row.
    wrapWidth(this.texts.notice!, width - 40 * s);
    resize(this.texts.notice!, 25 * s, PALETTE.coral, STYLE.current, false);
    this.texts.notice!.setPosition(left + width / 2, y + 18 * s);
    y += this.notice === '' ? 12 * s : 56 * s;

    this.layers[1]?.invalidate();
    this.drawBandControls(0);
    return y - this.bandRect.y;
  }

  private drawBandControls(press: number): void {
    const s = this.uiScale;
    const g = this.controls.clear();
    const entitled = monetization().premium();
    const sunk = (name: Action): number => (this.pressed === name ? press : 0);

    // Sound & feel: two scored lines, a note and a speaker, the two levels, the switch.
    const audio = this.rows.audioCard;
    if (audio) {
      const row = SETTINGS.rowHeight * s;
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(audio.x + 24 * s, audio.y + row - 1.5 * s, audio.width - 48 * s, 3 * s);
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(audio.x + 24 * s, audio.y + row * 2 - 1.5 * s, audio.width - 48 * s, 3 * s);
      drawNote(g, audio.x + 56 * s, audio.y + row / 2, 22 * s, PALETTE.ink);
      drawSpeaker(g, audio.x + 56 * s, audio.y + row * 1.5, 22 * s, PALETTE.ink, this.sfx === 0);
      const canBuzz = hapticsSupported();
      drawVibrate(g, audio.x + 56 * s, audio.y + row * 2.5, 24 * s, canBuzz ? PALETTE.ink : shade(PALETTE.muted, 0.35));
      if (this.rows.musicTrack) drawSlider(g, this.rows.musicTrack, s, this.music, !this.masterMuted);
      if (this.rows.sfxTrack) drawSlider(g, this.rows.sfxTrack, s, this.sfx, !this.masterMuted);
      if (this.rows.haptics) drawSwitch(g, this.rows.haptics, s, this.switchAt.haptics, !canBuzz);
    }
    // Timing.
    if (this.rows.tune) {
      drawPanel(g, this.rows.tune, s, { fill: SHELL.cream, depth: 8, press: sunk('tune'), radius: 18 });
      const sink = 8 * s * sunk('tune') * 0.8;
      drawChevron(g, this.rows.tune.right - 30 * s, this.rows.tune.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.tune!.setY(this.rows.tune.centerY + sink);
    }
    const offsetReset = this.rows.offsetReset;
    const offsetResetText = this.texts.offsetReset!;
    if (offsetReset) {
      drawPanel(g, offsetReset, s, { fill: SHELL.cream, depth: 8, press: sunk('offsetReset'), radius: 18 });
      offsetResetText.setVisible(true).setY(offsetReset.centerY + 8 * s * sunk('offsetReset') * 0.8);
    } else {
      offsetResetText.setVisible(false);
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
    // Progress: the save code, the scored line, then reset.
    if (this.rows.transfer && this.rows.transferRow) {
      const line = this.rows.transferRow;
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(line.x + 24 * s, line.bottom - 1.5 * s, line.width - 48 * s, 3 * s);
      drawPanel(g, this.rows.transfer, s, { fill: SHELL.cream, depth: 8, press: sunk('transfer'), radius: 18 });
      const sink = 8 * s * sunk('transfer') * 0.8;
      drawChevron(g, this.rows.transfer.right - 30 * s, this.rows.transfer.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.transferGo!.setPosition(this.rows.transfer.centerX - 14 * s, this.rows.transfer.centerY + sink);
    }
    if (this.rows.leaderboard && this.rows.leaderboardRow) {
      const line = this.rows.leaderboardRow;
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(line.x + 24 * s, line.bottom - 1.5 * s, line.width - 48 * s, 3 * s);
      drawPanel(g, this.rows.leaderboard, s, { fill: SHELL.cream, depth: 8, press: sunk('leaderboard'), radius: 18 });
      const sink = 8 * s * sunk('leaderboard') * 0.8;
      drawChevron(g, this.rows.leaderboard.right - 30 * s, this.rows.leaderboard.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.leaderboardGo!.setPosition(this.rows.leaderboard.centerX - 14 * s, this.rows.leaderboard.centerY + sink);
    }
    if (this.rows.achievements && this.rows.achievementsRow) {
      const line = this.rows.achievementsRow;
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(line.x + 24 * s, line.bottom - 1.5 * s, line.width - 48 * s, 3 * s);
      drawPanel(g, this.rows.achievements, s, { fill: SHELL.cream, depth: 8, press: sunk('achievements'), radius: 18 });
      const sink = 8 * s * sunk('achievements') * 0.8;
      drawChevron(g, this.rows.achievements.right - 30 * s, this.rows.achievements.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.achievementsGo!.setPosition(this.rows.achievements.centerX - 14 * s, this.rows.achievements.centerY + sink);
    }
    if (this.rows.analytics) drawSwitch(g, this.rows.analytics, s, this.switchAt.analytics);
    if (this.rows.adPrivacy && this.rows.adPrivacyRow) {
      const line = this.rows.adPrivacyRow;
      g.fillStyle(shade(SHELL.puck, -0.14), 1).fillRect(line.x + 24 * s, line.y - 1.5 * s, line.width - 48 * s, 3 * s);
      drawPanel(g, this.rows.adPrivacy, s, { fill: SHELL.cream, depth: 8, press: sunk('adPrivacy'), radius: 18 });
      const sink = 8 * s * sunk('adPrivacy') * 0.8;
      drawChevron(g, this.rows.adPrivacy.right - 30 * s, this.rows.adPrivacy.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.adPrivacyGo!.setPosition(this.rows.adPrivacy.centerX - 14 * s, this.rows.adPrivacy.centerY + sink);
    }
    if (this.rows.help) {
      drawPanel(g, this.rows.help, s, { fill: SHELL.cream, depth: 8, press: sunk('help'), radius: 18 });
      const sink = 8 * s * sunk('help') * 0.8;
      drawChevron(g, this.rows.help.right - 30 * s, this.rows.help.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.helpGo!.setPosition(this.rows.help.centerX - 14 * s, this.rows.help.centerY + sink);
    }
    if (this.rows.credit) {
      drawPanel(g, this.rows.credit, s, { fill: SHELL.cream, depth: 8, press: sunk('credit'), radius: 18 });
      const sink = 8 * s * sunk('credit') * 0.8;
      drawChevron(g, this.rows.credit.right - 30 * s, this.rows.credit.centerY + sink, 13 * s, PALETTE.ink);
      this.texts.creditGo!.setPosition(this.rows.credit.centerX - 14 * s, this.rows.credit.centerY + sink);
    }
    if (this.rows.reset) {
      drawPanel(g, this.rows.reset, s, {
        fill: this.resetArmed ? PALETTE.coral : SHELL.cream, depth: 8, press: sunk('reset'), radius: 18,
      });
      resize(this.texts.reset!, 23 * s, this.resetArmed ? SHELL.cream : PALETTE.ink, STYLE.current, false);
      this.texts.reset!.setY(this.rows.reset.centerY + 8 * s * sunk('reset') * 0.8);
    }
    this.layers[0]?.invalidate();
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
    if (done) {
      const p = this.pressed === 'done' ? press : 0;
      drawPanel(g, done, s, { fill: PALETTE.coral, depth: CHROME.block.depth, press: p, hero: true });
      resize(this.texts.done!, 50 * s, SHELL.cream);
      this.texts.done!.setPosition(done.centerX, done.centerY + CHROME.block.depth * s * p * 0.8);
    }
    this.layers[2]?.invalidate();
  }

  private refreshCopy(): void {
    const progress = loadProgress();
    const view = viewHealth(loadHealth());
    const entitled = monetization().premium();
    const canBuzz = hapticsSupported();
    // The active route's own value, named by route: a measurement belongs to one of them.
    const measured = activeCalibration();
    const route = currentRoute();
    this.texts.offsetValue!.setText(measured === null ? 'Not calibrated' : formatOffset(measured));
    this.texts.offsetNote!.setText(route === 'unknown' ? '· Measured on this device' : `· ${ROUTE_LABELS[route]}`);
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
    const adPrivacy = this.adPrivacyOffered();
    for (const key of ['adPrivacy', 'adPrivacyNote', 'adPrivacyGo']) this.texts[key]!.setVisible(adPrivacy);
    const leaderboard = this.leaderboardOffered();
    for (const key of ['leaderboard', 'leaderboardNote', 'leaderboardGo']) this.texts[key]!.setVisible(leaderboard);
    const achievements = this.achievementsOffered();
    for (const key of ['achievements', 'achievementsNote', 'achievementsGo']) this.texts[key]!.setVisible(achievements);
    const area = areaOf(progress.unlocked);
    this.texts.level!.setText(`Level ${progress.unlocked}`);
    this.texts.levelNote!.setText(`· ${area.name}`);
    // `label` uppercases on creation only; a later setText must match the other chips itself.
    this.texts.reset!.setText(this.resetArmed ? 'CONFIRM' : 'RESET');
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
    const switchOn = { haptics: this.hapticsOn, analytics: this.analyticsOn };
    for (const key of ['haptics', 'analytics'] as const) {
      const target = switchOn[key] ? 1 : 0;
      if (Math.abs(this.switchAt[key] - target) < 0.002) { this.switchAt[key] = target; continue; }
      const age = now - this.switchedAt[key];
      const t = this.reducedMotion ? 1 : Math.min(1, age / 0.18);
      this.switchAt[key] = target === 1 ? t : 1 - t;
      this.pressDirty = true;
    }
    this.placeSheen();
    this.sheen.update(now, !monetization().premium() && this.storeInView());
    bakeOne(this.layers);
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
    // On a whole pixel, so the sections' raster is shown as it was drawn rather than resampled.
    this.bandCamera.setScroll(this.bandRect.x, this.bandRect.y + Math.round(this.scrollY));
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.curtain.active || this.drag || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.velocity = 0;
    // A level takes the gesture. The thumb drifts vertically on a horizontal drag, and
    // that drift must not scroll the section out from under the knob.
    const slider = this.sliderAt(pointer.x, pointer.y);
    this.drag = {
      id: pointer.id, lastY: pointer.y, lastAt: performance.now(), startY: pointer.y, moved: false,
      slider,
      // Only a gesture that began inside the band can scroll it; one that began on Done
      // travels without moving the sections under it.
      scrollable: slider === null && Phaser.Geom.Rectangle.Contains(this.bandRect, pointer.x, pointer.y),
    };
    if (slider) {
      vibrate('tap');
      this.commitVolume(slider, this.volumeAt(slider, pointer.x));
    }
  }

  private pointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.id || !pointer.isDown) return;
    if (drag.slider) {
      const changed = this.commitVolume(drag.slider, this.volumeAt(drag.slider, pointer.x));
      if (drag.slider === 'sfx' && changed) this.previewEffects();
      return;
    }
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
    if (drag.slider) {
      // A tap that did not move still lands the level, and effects confirm with a click
      // at the level just set — including one that only took the mute off.
      if (drag.slider === 'sfx') this.previewEffects(true);
      return;
    }
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
      case 'offsetReset': this.resetOffset(); return;
      case 'transfer':
        this.leaveBehindCurtain(() => this.curtain.cover(() => this.scene.start(SceneKey.Transfer, { from: this.from })));
        return;
      case 'help':
        this.leaveBehindCurtain(() => this.curtain.cover(() => this.scene.start(SceneKey.Support, { from: this.from })));
        return;
      case 'haptics': this.toggleHaptics(); return;
      case 'analytics': this.toggleAnalytics(); return;
      case 'adPrivacy': void this.openAdPrivacy(); return;
      case 'leaderboard': void this.openLeaderboard(); return;
      case 'achievements': void this.openAchievements(); return;
      case 'unlock': void this.buy(PRODUCT.premium); return;
      case 'refill': void this.buy(PRODUCT.heartRefill); return;
      case 'restore': void this.restore(); return;
      case 'reset': this.resetTapped(); return;
      case 'credit': openPage(CREDITS.score.url); return;
      case 'privacy': openPage(LEGAL.privacy); return;
      case 'terms': openPage(LEGAL.terms); return;
    }
  }

  /**
   * The track, from its left rest to its right, read in the band's own x. The title is
   * not part of the target: a press there is a scroll, and mapping it would zero the level.
   */
  private sliderAt(x: number, y: number): VolumeBus | null {
    if (!Phaser.Geom.Rectangle.Contains(this.bandRect, x, y)) return null;
    const localY = y + this.scrollY;
    for (const bus of ['music', 'sfx'] as const) {
      const row = this.rows[bus === 'music' ? 'musicRow' : 'sfxRow'];
      const track = this.rows[bus === 'music' ? 'musicTrack' : 'sfxTrack'];
      if (!row || !track) continue;
      const hit = new Phaser.Geom.Rectangle(track.x, row.y, row.right - track.x, row.height);
      if (Phaser.Geom.Rectangle.Contains(hit, x, localY)) return bus;
    }
    return null;
  }

  private volumeAt(bus: VolumeBus, x: number): number {
    const track = this.rows[bus === 'music' ? 'musicTrack' : 'sfxTrack'];
    return track ? clampVolume(sliderValue(track, x)) : bus === 'music' ? this.music : this.sfx;
  }

  /** False when the stored level did not move, so a drag does not click on every pixel. */
  private commitVolume(bus: VolumeBus, volume: number): boolean {
    const next = setBusVolume(currentAudio(this), bus, volume);
    const changed = next.music !== this.music || next.sfx !== this.sfx || next.muted !== this.masterMuted;
    this.music = next.music;
    this.sfx = next.sfx;
    this.masterMuted = next.muted;
    this.texts.musicValue!.setText(`${Math.round(this.music * 100)}%`);
    this.texts.sfxValue!.setText(`${Math.round(this.sfx * 100)}%`);
    this.texts.mutedNote!.setVisible(this.masterMuted);
    if (changed) this.drawBandControls(0);
    return changed;
  }

  /**
   * One effects click, so the level just set is audible. Throttled while the knob is
   * moving; a release always sounds, because that click is the confirmation.
   */
  private previewEffects(force = false): void {
    const now = performance.now();
    // A release just after a drag tick would sound twice. The release still confirms a tap,
    // which has not ticked yet.
    if (now - this.lastSfxTick < (force ? 45 : 90)) return;
    this.lastSfxTick = now;
    const engine = currentAudio(this);
    if (!engine || engine.context.state !== 'running') return;
    engine.play(engine.context.currentTime, 'action');
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

  /**
   * The switch is the stored answer, and the SDK is told afterwards. That order is
   * deliberate: a consent call that cannot be delivered — no provider in this build, no
   * network, a browser — must not leave the switch showing something the save disagrees
   * with, because the save is what the next boot reads.
   */
  private toggleAnalytics(): void {
    this.analyticsOn = !this.analyticsOn;
    this.switchedAt.analytics = performance.now() / 1000;
    void setAnalyticsConsent(this.analyticsOn);
    this.refreshCopy();
  }

  /**
   * Native UMP sheet. After it closes the adapter re-reads consent, so a relayout is
   * what hides the row if the requirement has gone, or stops ads if the player withdrew.
   */
  private async openAdPrivacy(): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    try {
      await monetization().showPrivacyOptions();
      if (this.disposed || this.curtain.active) return;
      this.refreshCopy();
      this.layout();
    } finally {
      this.commerceBusy = false;
    }
  }

  /**
   * Play Games' leaderboard screen. If the player is signed out this is the one place the
   * game offers sign-in, because they asked; anything that stops the screen opening is
   * said once in the notice line rather than as an error.
   */
  private openLeaderboard(): Promise<void> {
    return this.openPlayGamesScreen(openDailyTempoLeaderboard, 'the leaderboard');
  }

  private openAchievements(): Promise<void> {
    return this.openPlayGamesScreen(openAchievements, 'achievements');
  }

  private async openPlayGamesScreen(open: () => Promise<{ readonly result: string }>, what: string): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    try {
      const outcome = await open();
      if (this.disposed || this.curtain.active) return;
      this.notice = outcome.result === 'shown' ? ''
        : outcome.result === 'signed_out' ? `Sign in to Play Games to see ${what}.`
          : outcome.result === 'unavailable' || outcome.result === 'unconfigured' ? 'Play Games isn’t available on this device.'
            : `Couldn’t open ${what}. Try again later.`;
      this.refreshCopy();
      this.layout();
    } finally {
      this.commerceBusy = false;
    }
  }

  /** The active route back to uncalibrated. Unlike progress reset, this is one tap: Tune can put it back. */
  private resetOffset(): void {
    resetCalibration(currentAudio(this));
    this.refreshCopy();
    this.layout();
  }

  /** Two taps, because there is no undo: the second one destroys every cleared level. */
  private resetTapped(): void {
    if (!this.resetArmed) { this.resetArmed = true; this.refreshCopy(); return; }
    this.resetArmed = false;
    const cleared = clearProgress();
    clearHealth();
    redrawToday();
    // A cloud binding that cannot be read stops Saved Games until it is replaced, and this
    // is the one place a player can replace it. A readable binding is left alone: on a
    // signed-in device the next sync merges the cloud copy back, since the cloud only adds.
    repairCloudBinding();
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
    this.stopWatchingRoute?.();
    this.stopWatchingRoute = null;
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
 * Opens a page outside the game — a legal page or a credit's. `_blank` is what a Capacitor
 * WebView hands to the system browser, and what a desktop browser opens in a tab; `noopener`
 * is required because the opened page would otherwise hold a handle on this one.
 */
function openPage(url: string): void {
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* a blocked popup costs nothing here */ }
}
