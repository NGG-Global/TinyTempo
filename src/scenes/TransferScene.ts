import Phaser from 'phaser';
import { applyCalibration, currentAudio, ensureShellMusic, sharedAudio } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { setHaptics, vibrate } from '@/core/haptics';
import { reducedMotion } from '@/core/motionPreference';
import { askForSaveCode } from '@/core/shell';
import { loadProgress, mergeProgress, saveProgress } from '@/game/progress';
import { decodeSaveCode, encodeSaveCode, type SaveCodeError, type SaveData } from '@/game/saveCode';
import { loadSettings, saveSettings } from '@/game/settings';
import { completeTutorial, tutorialComplete } from '@/game/TutorialRun';
import { Backdrop } from '@/ui/backdrop';
import { CHROME, drawPuck, pressAmount, puckSink } from '@/ui/chrome';
import { drawBack } from '@/ui/icons';
import { BRASS, drawPanel } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';

/** Design-unit metrics for the one long string this screen exists to show. */
const TRANSFER = {
  /** Around the code inside the card: enough that a wrapped line is never near an edge. */
  cardPadding: 54,
  codeSize: 38,
} as const;

type Control = 'copy' | 'enter';
interface Button { readonly rect: Phaser.Geom.Rectangle; readonly text: Phaser.GameObjects.Text; readonly hero: boolean }

/** What to say for each way a code can be wrong. Never "invalid": the player pasted something. */
const REFUSALS: Record<SaveCodeError, string> = {
  empty: 'Nothing was entered.',
  malformed: 'That doesn’t look like a save code.',
  checksum: 'That code has a typo in it — check it against the original.',
  version: 'That code came from a newer version of the game.',
};

/**
 * The save code: what the player's progress looks like as a string they can keep.
 *
 * Android's Auto Backup already moves a save to a new phone on its own, and for most
 * players that is the whole story. This screen is for the cases it does not cover — app
 * data cleared, a device lost before it ever backed up, a support email — and it is the
 * only route that does not require the game to have accounts.
 *
 * Restoring **merges**: the higher frontier and the better accuracy per level win, so a
 * code can only ever add to what is on the device. That is what lets it happen on one tap
 * rather than behind a confirmation a player has no good way to answer. `mergeProgress`
 * owns the rule; this scene owns the screen.
 */
export class TransferScene extends BaseScene {
  private backdrop!: Backdrop;
  private plates!: Phaser.GameObjects.Graphics;
  private controls!: Phaser.GameObjects.Graphics;
  private backMark!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private intro!: Phaser.GameObjects.Text;
  private codeText!: Phaser.GameObjects.Text;
  private codeNote!: Phaser.GameObjects.Text;
  private scope!: Phaser.GameObjects.Text;
  private notice!: Phaser.GameObjects.Text;
  private buttons: Record<Control, Button> = null!;
  private backAt = { x: 0, y: 0 };
  private backRect = new Phaser.Geom.Rectangle();
  private cardRect = new Phaser.Geom.Rectangle();
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private code = '';
  private message = '';
  private busy = false;
  private disposed = false;
  private pressedAt = -Infinity;
  private pressed: Button | 'back' | null = null;
  private pressDirty = false;
  private enteredAt = 0;
  private headlineAt = { x: 0, y: 0 };
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Transfer); }

  protected override build(): void {
    this.pressed = null;
    this.pressedAt = -Infinity;
    this.busy = false;
    this.disposed = false;
    this.message = '';
    this.enteredAt = performance.now() / 1000;
    this.refreshCode();
    this.backdrop = new Backdrop(this, PALETTE.paper, SHELL.sun, { glowAt: { x: 0.7, y: 0.2 }, glowAlpha: 0.6 });
    this.plates = this.add.graphics();
    this.controls = this.add.graphics().setDepth(2);
    this.backMark = this.add.graphics().setDepth(3);
    this.headline = display(this, 'Save code', { size: 56, colour: PALETTE.ink }).setOrigin(0, 0.5).setDepth(1);
    this.intro = body(this, 'Keep this somewhere safe. Entering it on another device brings your levels across.', {
      size: 28, colour: PALETTE.muted, align: 'center',
    }).setOrigin(0.5, 0).setDepth(1);
    // Flat, not dressed: an outline at this size closes the counters on a string that has
    // to be read one character at a time, which is the one thing this text must support.
    this.codeText = body(this, '', { size: TRANSFER.codeSize, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(1);
    this.codeNote = label(this, 'Your progress, as of now', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5).setDepth(1);
    // Said plainly and on the screen itself, because the alternative is a player restoring
    // a code, finding their hearts and their purchase missing, and writing in about it.
    this.scope = body(this, 'It carries your levels and settings. Hearts and purchases aren’t in it — a purchase comes back through Restore in Settings.', {
      size: 24, colour: PALETTE.muted, align: 'center',
    }).setOrigin(0.5, 1).setDepth(1);
    this.notice = body(this, '', { size: 25, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5).setDepth(1);
    this.buttons = {
      copy: this.button('Copy', true, 42),
      enter: this.button('Enter a code', false, 26),
    };
    this.curtain = new SceneCurtain(this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.refreshCopy();
    ensureShellMusic(this);
  }

  private button(caption: string, hero: boolean, size: number): Button {
    const text = hero
      ? display(this, caption, { size, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setDepth(3)
      : label(this, caption, { size, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5).setDepth(3);
    return { rect: new Phaser.Geom.Rectangle(), text, hero };
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
    this.buttons.enter.rect.setTo(left, footerBottom - quietH, width, quietH);
    this.buttons.copy.rect.setTo(left, this.buttons.enter.rect.y - 16 * s - heroH, width, heroH);

    this.intro.setWordWrapWidth(Math.min(560 * s, width), false);
    resize(this.intro, 28 * s, PALETTE.muted, STYLE.current, false);
    this.intro.setPosition(safe.centerX, safe.top + 132 * s);

    // Laid out from the bottom up, so that on a short 16:9 screen the card gives way and
    // the copy around it does not: the footnote and the notice each own their strip above
    // the buttons before the card is given what is left. Laying it out top-down instead
    // let the card grow into the footnote's space and put two lines of text on each other.
    this.notice.setWordWrapWidth(width - 20 * s, false);
    resize(this.notice, 25 * s, PALETTE.coral, STYLE.current, false);
    this.notice.setPosition(safe.centerX, this.buttons.copy.rect.y - 40 * s);
    this.scope.setWordWrapWidth(Math.min(560 * s, width), false);
    resize(this.scope, 24 * s, PALETTE.muted, STYLE.current, false);
    const scopeBottom = this.buttons.copy.rect.y - 84 * s;
    this.scope.setPosition(safe.centerX, scopeBottom);

    // The card is sized to the code, not to the space left over. Stretched to fill, it
    // read as an empty box with a few characters adrift in the middle of it; the room
    // belongs around the card, where it sets the one thing on screen apart from the paper.
    resize(this.codeNote, 20 * s, PALETTE.muted, STYLE.current, false);
    this.codeText.setWordWrapWidth(width - 76 * s, false);
    resize(this.codeText, TRANSFER.codeSize * s, PALETTE.ink, STYLE.current, false);
    const bandTop = this.intro.y + this.intro.height + 28 * s;
    const bandBottom = scopeBottom - this.scope.height - 24 * s;
    const cardHeight = Math.min(
      bandBottom - bandTop,
      this.codeText.height + TRANSFER.cardPadding * 2 * s + this.codeNote.height + 20 * s,
    );
    this.cardRect.setTo(left, (bandTop + bandBottom) / 2 - cardHeight / 2, width, cardHeight);
    this.codeText.setPosition(this.cardRect.centerX, this.cardRect.y + TRANSFER.cardPadding * s + this.codeText.height / 2);
    this.codeNote.setPosition(this.cardRect.centerX, this.cardRect.bottom - 30 * s);

    this.drawPlates();
    this.drawControls(0);
    this.pressDirty = true;
  }

  private drawPlates(): void {
    const s = this.uiScale;
    const g = this.plates.clear();
    drawPanel(g, this.cardRect, s, { fill: SHELL.cream, depth: 12, hero: true, radius: 36 });
    // A brass hairline inside the edge: the same mark Calibrate puts on its result tray,
    // for the same reason — this is a value to read, not a surface to press.
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
      const size = (button.hero ? 42 : 26) * s;
      resize(button.text, size, button.hero ? SHELL.cream : PALETTE.ink, STYLE.current, button.hero);
      button.text.setPosition(button.rect.centerX, button.rect.centerY + depth * s * p * 0.8);
    }
  }

  /** The code as it stands. Re-read after a restore, because the save has changed. */
  private refreshCode(): void {
    this.code = encodeSaveCode({
      progress: loadProgress(),
      settings: loadSettings(),
      tutorialComplete: tutorialComplete(),
    });
  }

  private refreshCopy(): void {
    // Shown with spaces rather than dashes: the groups then wrap where they were meant to,
    // and a dash in a code is the character a player most often thinks is a line break.
    this.codeText.setText(this.code.replace(/-/g, ' '));
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

  /**
   * Acts on the release, not the press. The same rule Settings follows: a press is the
   * musical event only where the press *is* the event, and neither of these is.
   */
  private pointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.curtain.active) return;
    const { x, y } = pointer;
    if (Phaser.Geom.Rectangle.Contains(this.backRect, x, y)) { this.press('back'); this.leave(); return; }
    for (const [name, button] of Object.entries(this.buttons)) {
      if (!Phaser.Geom.Rectangle.Contains(button.rect, x, y)) continue;
      this.press(button);
      if (name === 'copy') void this.copy();
      else void this.enter();
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
   * Clipboard where there is one, and the code stays on screen where there is not. The
   * API needs a secure context and a permission that a WebView can decline, so the copy
   * button is a convenience over the card, never the only way to get the code out.
   */
  private async copy(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await navigator.clipboard.writeText(this.code);
      if (this.disposed) return;
      this.message = 'Copied.';
      vibrate('stamp');
    } catch {
      if (this.disposed) return;
      this.message = 'Couldn’t reach the clipboard — the code is written above.';
    } finally {
      this.busy = false;
    }
    this.refreshCopy();
  }

  private async enter(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const typed = await askForSaveCode();
      if (this.disposed) return;
      if (typed === null) { this.message = ''; this.refreshCopy(); return; }
      const result = decodeSaveCode(typed);
      if (!result.ok) { this.message = REFUSALS[result.reason]; this.refreshCopy(); return; }
      this.message = this.apply(result.data);
      vibrate('stamp');
      this.refreshCode();
      this.refreshCopy();
      this.layout();
    } finally {
      this.busy = false;
    }
  }

  /** Writes a decoded save and reports what a player should take from it. */
  private apply(data: SaveData): string {
    const before = loadProgress();
    const merged = mergeProgress(before, data.progress);
    const stored = saveProgress(merged);
    saveSettings({ ...loadSettings(), ...data.settings });
    const engine = sharedAudio(this);
    applyCalibration(engine, data.settings.calibrationMs);
    if (engine.muted !== data.settings.muted) engine.toggleMute();
    setHaptics(data.settings.haptics);
    if (data.tutorialComplete) completeTutorial();
    if (!stored) return 'Restored for now, but this device wouldn’t save it.';
    const gained = merged.unlocked - before.unlocked;
    if (gained > 0) return `Restored — ${gained} more ${gained === 1 ? 'level' : 'levels'} open.`;
    return 'Restored. Nothing here was ahead of what you already had.';
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
