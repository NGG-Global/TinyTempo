import Phaser from 'phaser';
import { currentAudio } from '@/audio/sharedAudio';
import { DIAGNOSTICS } from '@/config/diagnostics';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { SUPPORT } from '@/config/support';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { HEALTH, loadHealth, viewHealth } from '@/game/health';
import { areaOf } from '@/game/levels';
import { loadProgress } from '@/game/progress';
import { encodeSaveCode } from '@/game/saveCode';
import { loadSettings } from '@/game/settings';
import { supportMailto, supportReport, type SupportFacts } from '@/game/supportReport';
import { tutorialComplete } from '@/game/TutorialRun';
import { monetization } from '@/monetization';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { drawBack } from '@/ui/icons';
import { BRASS, drawPanel } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';

/**
 * How the clock is tracking output, what the device says its lag is, and what the player
 * has calibrated on top. Written for a support thread rather than for a log: "it feels
 * delayed on Bluetooth" is unanswerable without these three, and unanswerable *with* a
 * player's description of them.
 *
 * The engine may not exist yet — a player can reach Settings before ever pressing PLAY —
 * and that is itself worth reporting rather than papering over.
 */
function describeAudio(scene: Phaser.Scene): string {
  const engine = currentAudio(scene);
  if (engine === null) return 'not started this session';
  const offset = loadSettings().calibrationMs;
  return `${engine.clock.mode} clock · device reports ${engine.clock.reportedLagMs} ms · offset ${offset} ms`;
}

/** Design-unit metrics for the block of detail this screen exists to show. */
const HELP = {
  cardPadding: 40,
  reportSize: 23,
} as const;

type Control = 'email' | 'copy';
interface Button { readonly rect: Phaser.Geom.Rectangle; readonly text: Phaser.GameObjects.Text; readonly hero: boolean }

/**
 * The way to reach a person from inside the game.
 *
 * The store listing carries an address, which is no use to a player who is already in the
 * app and whose progress has just gone. This is that route, and it is mostly not the
 * address — it is the details. A player cannot be expected to know their build number,
 * their WebView version or how many levels they had cleared, and a thread that opens by
 * asking for them has already cost a day.
 *
 * **What is going to be sent is on the screen before anything is sent.** That is the whole
 * difference between a support report and telemetry, and it is why the block is shown in
 * full rather than summarised behind a "include diagnostics" switch.
 *
 * Neither button is the only way out. `mailto:` depends on the device having a mail app
 * and on the WebView handing the scheme over, and the clipboard can be declined — so the
 * address and the details are both legible on screen, the same discipline the save code's
 * Copy button follows.
 */
export class SupportScene extends BaseScene {
  private backdrop!: Backdrop;
  private plates!: Phaser.GameObjects.Graphics;
  private controls!: Phaser.GameObjects.Graphics;
  private backMark!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private intro!: Phaser.GameObjects.Text;
  private address!: Phaser.GameObjects.Text;
  private reportText!: Phaser.GameObjects.Text;
  private reportNote!: Phaser.GameObjects.Text;
  private notice!: Phaser.GameObjects.Text;
  private buttons: Record<Control, Button> = null!;
  private backAt = { x: 0, y: 0 };
  private backRect = new Phaser.Geom.Rectangle();
  private cardRect = new Phaser.Geom.Rectangle();
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private report = '';
  private message = '';
  private busy = false;
  private disposed = false;
  private pressedAt = -Infinity;
  private pressed: Button | 'back' | null = null;
  private pressDirty = false;
  private enteredAt = 0;
  private headlineAt = { x: 0, y: 0 };
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Support); }

  protected override build(): void {
    this.pressed = null;
    this.pressedAt = -Infinity;
    this.busy = false;
    this.disposed = false;
    this.message = '';
    this.enteredAt = performance.now() / 1000;
    this.report = supportReport(this.gather());
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.5, y: 0.18 }, glowAlpha: 0.6 });
    this.plates = this.add.graphics();
    this.controls = this.add.graphics().setDepth(2);
    this.backMark = this.add.graphics().setDepth(3);
    this.headline = display(this, 'Help', { size: 56, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(1);
    this.intro = body(this, 'Something wrong? Write to us, and send these details with it — they are what makes a problem findable.', {
      size: 27, colour: PALETTE.muted, align: 'center',
    }).setOrigin(0.5, 0).setDepth(1);
    this.address = display(this, SUPPORT.address, { size: 32, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(1);
    // Flat and small: this is a block to be read line by line, not a headline.
    this.reportText = body(this, '', { size: HELP.reportSize, colour: PALETTE.ink, align: 'left' }).setOrigin(0, 0).setDepth(1);
    this.reportNote = label(this, 'Sent with your message', { size: 19, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(1);
    // Bottom-anchored, so a two-line notice grows upward into the gap rather than down
    // into the button. Centred, it cleared the button by six units.
    this.notice = body(this, '', { size: 24, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5, 1).setDepth(1);
    this.buttons = {
      email: this.button('Write to us', true, 40),
      copy: this.button('Copy details', false, 26),
    };
    this.curtain = new SceneCurtain(this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.refreshCopy();
  }

  private button(caption: string, hero: boolean, size: number): Button {
    const text = hero
      ? display(this, caption, { size, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(3)
      : label(this, caption, { size, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(3);
    return { rect: new Phaser.Geom.Rectangle(), text, hero };
  }

  /** Everything the report needs, read once on entry so the screen cannot disagree with itself. */
  private gather(): SupportFacts {
    const progress = loadProgress();
    const settings = loadSettings();
    const premium = monetization().premium();
    const view = viewHealth(loadHealth());
    const native = this.game.device.os.android || this.game.device.os.iOS;
    return {
      version: __APP_VERSION__,
      packageId: 'com.tinytempo.app',
      platform: native ? 'Android app' : 'Browser',
      // A property read, not a capability: no permission, no prompt, nothing to fail. It
      // carries the Android and WebView version, which is the first thing any "it is slow
      // on my phone" report needs and the last thing a player can be asked to find.
      device: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      level: progress.unlocked,
      area: areaOf(progress.unlocked).name,
      cleared: Object.keys(progress.best).length,
      premium,
      hearts: premium ? 'unlimited' : `${view.hearts}/${HEALTH.max}`,
      audio: describeAudio(this),
      crashReports: DIAGNOSTICS.dsn !== '',
      usageData: settings.analytics,
      saveCode: encodeSaveCode({
        progress,
        settings: { calibrationMs: settings.calibrationMs, muted: settings.muted, haptics: settings.haptics },
        tutorialComplete: tutorialComplete(),
      }),
    };
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1200);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const left = safe.centerX - 322 * s;
    const width = 644 * s;

    this.backAt = { x: left + CHROME.puckRadius * s, y: safe.top + 66 * s };
    this.backRect.setTo(this.backAt.x - control / 2, this.backAt.y - control / 2, control, control);
    resize(this.headline, 56 * s, PALETTE.ink);
    this.headlineAt = { x: this.backAt.x + (CHROME.puckRadius + 26) * s, y: this.backAt.y };
    this.headline.setPosition(this.headlineAt.x, this.headlineAt.y);

    const heroH = Math.max(112 * s, control);
    const quietH = Math.max(92 * s, control);
    const footerBottom = safe.bottom - 56 * s;
    this.buttons.copy.rect.setTo(left, footerBottom - quietH, width, quietH);
    this.buttons.email.rect.setTo(left, this.buttons.copy.rect.y - 16 * s - heroH, width, heroH);

    this.intro.setWordWrapWidth(Math.min(560 * s, width), false);
    resize(this.intro, 27 * s, PALETTE.muted, STYLE.current, false);
    this.intro.setPosition(safe.centerX, safe.top + 132 * s);
    resize(this.address, 32 * s, PALETTE.ink);
    this.address.setPosition(safe.centerX, this.intro.y + this.intro.height + 34 * s);

    // Bottom-up, so on a short screen the card gives way and the copy around it does not.
    this.notice.setWordWrapWidth(width - 20 * s, false);
    resize(this.notice, 24 * s, PALETTE.coral, STYLE.current, false);
    this.notice.setPosition(safe.centerX, this.buttons.email.rect.y - 22 * s);

    resize(this.reportNote, 19 * s, PALETTE.muted, STYLE.current, false);
    // Wrap before measuring: the card is sized from the wrapped height, and a save code is
    // one 58-character word with no spaces in it, so basic wrapping leaves it hanging off
    // the right edge. Advanced wrapping breaks a word longer than the line.
    this.reportText.setWordWrapWidth(width - 60 * s, true);
    resize(this.reportText, HELP.reportSize * s, PALETTE.ink, STYLE.current, false);
    const bandTop = this.address.y + 34 * s;
    // Enough for a notice of two lines, which is the longest any of them runs.
    const bandBottom = this.buttons.email.rect.y - 120 * s;
    const cardHeight = Math.min(
      bandBottom - bandTop,
      this.reportText.height + HELP.cardPadding * 2 * s + this.reportNote.height + 14 * s,
    );
    this.cardRect.setTo(left, (bandTop + bandBottom) / 2 - cardHeight / 2, width, cardHeight);
    // Left-aligned inside its padding: the block is label-and-value pairs, and centring
    // them turns a scannable list into a paragraph.
    this.reportText.setPosition(this.cardRect.x + 30 * s, this.cardRect.y + HELP.cardPadding * s);
    this.reportNote.setPosition(this.cardRect.centerX, this.cardRect.bottom - 26 * s);

    this.drawPlates();
    this.drawControls(0);
    this.pressDirty = true;
  }

  private drawPlates(): void {
    const s = this.uiScale;
    const g = this.plates.clear();
    drawPanel(g, this.cardRect, s, { fill: SHELL.cream, depth: 12, hero: true, radius: 36 });
    g.lineStyle(2 * s, BRASS, 0.5).strokeRoundedRect(
      this.cardRect.x + 9 * s, this.cardRect.y + 9 * s,
      this.cardRect.width - 18 * s, this.cardRect.height - 18 * s, 27 * s,
    );
  }

  private drawControls(press: number): void {
    const s = this.uiScale;
    const g = this.controls.clear();
    drawPuck(g, this.backAt.x, this.backAt.y, s, this.pressed === 'back' ? press : 0);
    this.backMark.clear();
    drawBack(this.backMark, this.backAt.x, this.backAt.y + puckSink(s, this.pressed === 'back' ? press : 0),
      CHROME.puckRadius * s * 0.44, PALETTE.ink);
    for (const button of Object.values(this.buttons)) {
      const p = this.pressed === button ? press : 0;
      const depth = button.hero ? CHROME.block.depth : 10;
      drawPanel(g, button.rect, s, {
        fill: button.hero ? PALETTE.coral : SHELL.bench,
        depth, press: p, hero: button.hero,
        radius: Math.min(button.rect.height / 2, STYLE.current.radius * 1.4),
      });
      const size = (button.hero ? 40 : 26) * s;
      resize(button.text, size, button.hero ? SHELL.cream : PALETTE.ink, STYLE.current, button.hero);
      button.text.setPosition(button.rect.centerX, button.rect.centerY + depth * s * p * 0.8);
    }
  }

  private refreshCopy(): void {
    this.reportText.setText(this.report);
    this.notice.setText(this.message);
    this.notice.setVisible(this.message !== '');
    this.drawControls(0);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    const press = pressAmount(now, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      this.drawControls(press);
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    }
    const age = now - this.enteredAt;
    if (age < 1.1) {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(age, 0.7);
      this.headline.setPosition(this.headlineAt.x, this.headlineAt.y + rise * 30 * this.uiScale).setAlpha(alpha);
    }
  }

  /** On the release, the rule every control outside gameplay follows. */
  private pointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.curtain.active) return;
    const { x, y } = pointer;
    if (Phaser.Geom.Rectangle.Contains(this.backRect, x, y)) { this.press('back'); this.leave(); return; }
    for (const [name, button] of Object.entries(this.buttons)) {
      if (!Phaser.Geom.Rectangle.Contains(button.rect, x, y)) continue;
      this.press(button);
      if (name === 'email') this.email();
      else void this.copy();
      return;
    }
  }

  private press(target: Button | 'back'): void {
    this.pressedAt = performance.now() / 1000;
    this.pressed = target;
    this.pressDirty = true;
    vibrate('tap');
  }

  /**
   * Hands the mail app a message that is already written. `location.href` rather than
   * `window.open`: a WebView hands a non-http scheme to the system from either, and this
   * one cannot leave a blank tab behind on a desktop browser that declines it.
   */
  private email(): void {
    const url = supportMailto(SUPPORT.address, SUPPORT.subject(__APP_VERSION__), this.report);
    try {
      window.location.href = url;
      this.message = '';
    } catch {
      this.message = `Couldn’t open a mail app. Write to ${SUPPORT.address} and include the details above.`;
    }
    this.refreshCopy();
  }

  private async copy(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await navigator.clipboard.writeText(`${this.report}\n`);
      if (this.disposed) return;
      this.message = 'Copied. Paste it into your message.';
      vibrate('stamp');
    } catch {
      if (this.disposed) return;
      this.message = 'Couldn’t reach the clipboard — the details are written above.';
    } finally {
      this.busy = false;
    }
    this.refreshCopy();
  }

  private leave(): void {
    if (this.curtain.active) return;
    this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: this.enteredFrom() }));
  }

  /** Settings is always the way back; it remembers where the player came from itself. */
  private enteredFrom(): string {
    const data = this.sys.settings.data as { from?: string } | undefined;
    return data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
  }

  private shutdown(): void {
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    currentAudio(this)?.cancel();
    this.backdrop.destroy();
  }
}
