import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { SLAB_CARD } from './staging';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { cameraLook, type CameraLook } from './cameraLooks';
import { developed, ejectOut, flashLife, printRise, printsHung, shutterPress } from './cameraMotion';

/** The camera's centre, on its tripod at the left of the card. */
const CAMERA = { x: -165, y: 10 } as const;
/** Where the subject stands, and the floor line under it. */
const SUBJECT = { x: 170, foot: 150 } as const;
/** Where the finished print hangs in the air, between the camera and the subject, and its size. */
const PRINT = { x: 25, y: -40, w: 150, h: 180 } as const;
/** The line across the top of the card, and where each judged hit's print hangs on it. */
const LINE = { left: -306, right: 306, y: -176, sag: 16 } as const;
const SLOTS = [-252, -168, -84, 0, 84, 168] as const;

/**
 * Colours used for one thing each, so a test can read the act without Phaser by watching
 * which colours a frame asks for: a peg is a hung print; the frame is the coda's print; the
 * shine shows only on a print that developed clean, and the wash only on one that did not.
 */
export const PEG = 0xa6784e;
export const PRINT_FRAME = 0xfbfaf4;
export const SHINE = 0xfffdf0;
export const WASHOUT = 0xf5efe2;
/** The undeveloped picture, before the chemistry has done anything. */
const UNDEVELOPED = 0x2e2b30;
const SMALL_PRINT = 0xf4f1e8;

interface SubjectState {
  /** Eyes shut: the flash went off, or a beat was missed. */
  readonly blink: boolean;
  /** The successful print's subject: delighted. */
  readonly happy: boolean;
  /** The failed print's subject: looking away. */
  readonly away: boolean;
}

/** An instant camera on a tripod takes a picture on each beat; the last one develops, and the picture is the verdict. */
export class CameraVignette extends HouseholdVignette {
  private readonly look: CameraLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = cameraLook(lap);
    super(scene, look.subject === 'castle' ? 0xeef6f8 : 0xf6f0e6, look.subject === 'castle' ? 0xfff2cf : 0xfbe7cf, { card: SLAB_CARD });
    this.look = look;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const ended = ending >= 0;
    // The coda's last shot clicks on the contact; before it, every shot is a beat's.
    const clickAge = ended ? ending : now - this.strikeAt;
    const press = this.still ? 0 : shutterPress(clickAge, beat);
    const flash = this.still ? 0 : flashLife(clickAge);
    const hits = this.watching ? 0 : this.hitTimes.length;
    const hung = printsHung(hits, this.plan?.targets.length ?? 4, SLOTS.length);
    const eject = ejectOut(ending, this.still);
    const rise = printRise(ending, this.still);
    const clear = developed(ending, this.still);
    const missed = !ended && now - this.errorAt < 0.3;

    this.room();
    this.line(hung);
    this.subject(SUBJECT.x, SUBJECT.foot, 1, {
      blink: missed || flash > 0.35,
      happy: ended && this.successful && clear > 0.5,
      away: ended && !this.successful && clear > 0.5,
    });
    if (flash > 0) {
      // The flash lights the subject for an instant.
      g.fillStyle(0xffffff, 0.24 * flash).fillEllipse(SUBJECT.x, SUBJECT.foot - 80, 280, 230);
    }
    this.camera(press, flash);
    if (ended) this.print(eject, rise, clear);
  }

  /** The wall and the floor, or at the seaside the sky, the sea and the sand. */
  private room(): void {
    const g = this.art, look = this.look;
    slab(g, -330, -224, 660, 448, look.wall, 30, shade(look.wall, -0.4));
    if (look.subject === 'castle') {
      g.fillStyle(0xfff3c4, 0.9).fillCircle(250, -120, 34);
      g.fillStyle(look.wallShade).fillRect(-322, 40, 644, 74);
      g.lineStyle(4, shade(look.wallShade, 0.3), 0.8);
      for (const [x, y] of [[-260, 62], [-120, 80], [40, 58], [190, 86], [-40, 100]]) g.lineBetween(x!, y!, x! + 46, y!);
      g.fillStyle(look.floor).fillRoundedRect(-322, 104, 644, 112, { tl: 0, tr: 0, bl: 24, br: 24 });
      g.fillStyle(look.floorShade, 0.6);
      for (const [x, y] of [[-280, 140], [-40, 190], [110, 132], [270, 196], [-160, 200]]) g.fillEllipse(x!, y!, 18, 6);
      return;
    }
    // A skirting board and the floor.
    g.fillStyle(look.wallShade, 0.6).fillRect(-322, 126, 644, 16);
    g.fillStyle(look.floor).fillRoundedRect(-322, 142, 644, 74, { tl: 0, tr: 0, bl: 24, br: 24 });
    g.lineStyle(3, look.floorShade, 0.7);
    for (const x of [-220, -80, 60, 200]) g.lineBetween(x, 142, x - 18, 216);
    if (look.subject === 'cake') {
      // Bunting across the party wall, under the line.
      const colours = [0xf2c14e, 0x3fb6a8, 0xe2603f, 0xfff6fa];
      for (let k = 0; k < 9; k++) {
        const x = -280 + k * 70;
        g.fillStyle(colours[k % 4]!, 0.85).fillTriangle(x - 22, -120, x + 22, -120, x, -88);
      }
    }
  }

  /** The line, sagging between two pins, and the prints judged hits have pegged to it. */
  private line(hung: number): void {
    const g = this.art, look = this.look;
    const at = (x: number): number => LINE.y + LINE.sag * (1 - ((x - (LINE.left + LINE.right) / 2) / ((LINE.right - LINE.left) / 2)) ** 2);
    g.lineStyle(3, shade(look.wallShade, -0.35), 0.9);
    for (let x = LINE.left; x < LINE.right; x += 24) g.lineBetween(x, at(x), Math.min(LINE.right, x + 24), at(Math.min(LINE.right, x + 24)));
    for (const x of [LINE.left, LINE.right]) g.fillStyle(HOME_INK).fillCircle(x, at(x), 5);
    for (let k = 0; k < hung; k++) {
      const x = SLOTS[k]!, top = at(x) + 4;
      slab(g, x - 20, top, 40, 48, SMALL_PRINT, 3);
      g.fillStyle(shade(look.wall, -0.18)).fillRect(x - 15, top + 5, 30, 28);
      g.fillStyle(look.accent).fillCircle(x, top + 23, 7);
      g.fillStyle(PEG).fillRect(x - 3, top - 8, 6, 14);
    }
  }

  /**
   * The subject, standing on `(cx, foot)` at scale `k`: full size in the room and small
   * inside the print, from the same drawing, so the picture is of what was in front of the lens.
   */
  private subject(cx: number, foot: number, k: number, state: SubjectState): void {
    const g = this.art, look = this.look;
    const X = (v: number): number => cx + v * k, Y = (v: number): number => foot + v * k;
    const weight = Math.max(1.2, STYLE.current.outline * 0.6 * k);
    const blob = (x: number, y: number, w: number, h: number, colour: number): void => {
      g.fillStyle(colour).fillEllipse(X(x), Y(y), w * k, h * k);
      g.lineStyle(weight, HOME_INK).strokeEllipse(X(x), Y(y), w * k, h * k);
    };
    const box = (x: number, y: number, w: number, h: number, colour: number, r = 8): void => {
      g.fillStyle(colour).fillRoundedRect(X(x), Y(y), w * k, h * k, r * k);
      g.lineStyle(weight, HOME_INK).strokeRoundedRect(X(x), Y(y), w * k, h * k, r * k);
    };
    const eyes = (xs: readonly number[], y: number): void => {
      for (const ex of xs) {
        if (state.happy) {
          g.lineStyle(weight * 1.1, HOME_INK).lineBetween(X(ex - 6), Y(y + 2), X(ex), Y(y - 4)).lineBetween(X(ex), Y(y - 4), X(ex + 6), Y(y + 2));
        } else if (state.blink) {
          g.lineStyle(weight * 1.1, HOME_INK).lineBetween(X(ex - 6), Y(y), X(ex + 6), Y(y));
        } else {
          const glance = state.away ? -3 : 0;
          g.fillStyle(HOME_INK).fillEllipse(X(ex + glance), Y(y), 8 * k, 12 * k);
          g.fillStyle(0xffffff).fillCircle(X(ex + glance - 1.5), Y(y - 3), 2 * k);
        }
      }
    };

    if (look.subject === 'cat') {
      blob(0, -12, 180, 40, look.second);
      g.fillStyle(shade(look.second, 0.2)).fillEllipse(X(-20), Y(-20), 90 * k, 10 * k);
      // The tail curls round from behind, then the body, then the head on top.
      g.lineStyle(16 * k, HOME_INK);
      g.lineBetween(X(44), Y(-36), X(74), Y(-58)).lineBetween(X(74), Y(-58), X(78), Y(-94));
      g.lineStyle(11 * k, look.accent);
      g.lineBetween(X(44), Y(-36), X(74), Y(-58)).lineBetween(X(74), Y(-58), X(78), Y(-94));
      blob(4, -62, 120, 96, look.accent);
      g.fillStyle(shade(look.accent, 0.25)).fillEllipse(X(-6), Y(-48), 50 * k, 56 * k);
      for (const [ax, tip] of [[-34, -44], [10, 18]] as const) {
        shape(g, [X(ax), Y(-140), X(tip), Y(-182), X(ax + 26), Y(-148)], look.accent, HOME_INK, weight);
        g.fillStyle(0xf2a7a0).fillTriangle(X(ax + 7), Y(-146), X(tip), Y(-172), X(ax + 19), Y(-148));
      }
      blob(-10, -120, 86, 80, look.accent);
      g.lineStyle(weight, look.accentShade);
      for (const dx of [-18, -10, -2]) g.lineBetween(X(dx), Y(-158), X(dx + 2), Y(-146));
      eyes([-28, 8], -124);
      g.fillStyle(0xe7838c).fillTriangle(X(-15), Y(-110), X(-5), Y(-110), X(-10), Y(-104));
      g.lineStyle(weight * 0.8, HOME_INK);
      if (state.happy) g.lineBetween(X(-18), Y(-100), X(-10), Y(-96)).lineBetween(X(-10), Y(-96), X(-2), Y(-100));
      else g.lineBetween(X(-10), Y(-104), X(-10), Y(-98));
      g.lineStyle(weight * 0.6, HOME_INK, 0.7);
      for (const [x1, y1, x2, y2] of [[-30, -106, -58, -110], [-30, -102, -58, -98], [10, -106, 36, -110], [10, -102, 36, -98]] as const) {
        g.lineBetween(X(x1), Y(y1), X(x2), Y(y2));
      }
      return;
    }

    if (look.subject === 'cake') {
      // The table, then two tiers with icing running over their edges, then the candles.
      box(-100, -64, 200, 20, look.floor, 6);
      g.fillStyle(look.floorShade).fillRect(X(-86), Y(-44), 12 * k, 44 * k).fillRect(X(74), Y(-44), 12 * k, 44 * k);
      box(-64, -128, 128, 64, look.accent, 10);
      box(-42, -176, 84, 48, look.accent, 10);
      g.fillStyle(look.second);
      g.fillRect(X(-62), Y(-126), 124 * k, 12 * k).fillRect(X(-40), Y(-174), 80 * k, 10 * k);
      for (const dx of [-50, -26, -2, 22, 46]) g.fillCircle(X(dx), Y(-112), 7 * k);
      for (const dx of [-30, -8, 14, 32]) g.fillCircle(X(dx), Y(-162), 6 * k);
      g.fillStyle(0xfff6fa);
      for (const [dx, dy] of [[-40, -96], [-6, -86], [30, -100], [-20, -146], [18, -150]] as const) g.fillCircle(X(dx), Y(dy), 3 * k);
      for (const dx of [-24, 0, 24]) {
        box(dx - 4, -206, 8, 30, 0x6fb2e8, 3);
        if (state.away) {
          // Blown out in the bad picture: a wisp of smoke instead of a flame.
          g.lineStyle(weight, 0xb9b4bd, 0.8).lineBetween(X(dx), Y(-210), X(dx + 4), Y(-222)).lineBetween(X(dx + 4), Y(-222), X(dx - 2), Y(-232));
        } else {
          g.fillStyle(0xf2913a).fillEllipse(X(dx), Y(-216), 10 * k, 16 * k);
          g.fillStyle(0xffe08a).fillEllipse(X(dx), Y(-213), 5 * k, 8 * k);
        }
      }
      if (state.happy) {
        sparkle(g, X(-70), Y(-200), 12 * k);
        sparkle(g, X(72), Y(-170), 10 * k);
      }
      return;
    }

    // A sandcastle: a keep between two towers, a flag on top and a moat at its foot.
    g.fillStyle(shade(look.floor, -0.12)).fillEllipse(X(0), Y(-4), 220 * k, 26 * k);
    g.fillStyle(look.wallShade, 0.8).fillEllipse(X(0), Y(-4), 190 * k, 14 * k);
    const tower = (x: number, w: number, h: number, colour: number): void => {
      shape(g, [X(x - w / 2), Y(-8), X(x + w / 2), Y(-8), X(x + w / 2 - 6), Y(-8 - h), X(x - w / 2 + 6), Y(-8 - h)], colour, HOME_INK, weight);
      for (let c = 0; c < 3; c++) box(x - w / 2 + 4 + c * (w - 18) / 2, -8 - h - 12, 10, 14, colour, 2);
    };
    tower(-62, 48, 70, look.accentShade);
    tower(62, 48, 70, look.accentShade);
    tower(0, 76, 110, look.accent);
    box(-12, -48, 24, 40, shade(look.accent, -0.35), 12);
    g.fillStyle(look.accentShade, 0.7);
    for (const [dx, dy] of [[-20, -84], [16, -70], [-6, -100], [-60, -40], [60, -52]] as const) g.fillCircle(X(dx), Y(dy), 3.4 * k);
    g.lineStyle(weight, HOME_INK).lineBetween(X(0), Y(-130), X(0), Y(-176));
    shape(g, [X(1), Y(-176), X(36), Y(state.away ? -150 : -166), X(1), Y(-156)], look.second, HOME_INK, weight);
    if (state.happy) {
      sparkle(g, X(-90), Y(-120), 11 * k);
      sparkle(g, X(88), Y(-140), 9 * k);
    }
  }

  /** The camera, nodding a little with each press. */
  private camera(press: number, flash: number): void {
    const g = this.art, look = this.look;
    const cx = CAMERA.x, cy = CAMERA.y + press * 4;
    // Tripod first, behind the body.
    g.lineStyle(7, HOME_INK);
    g.lineBetween(cx - 4, CAMERA.y + 50, cx - 58, 152).lineBetween(cx + 4, CAMERA.y + 50, cx + 50, 152).lineBetween(cx, CAMERA.y + 50, cx - 4, 158);
    g.lineStyle(4, shade(look.trim, 0.3));
    g.lineBetween(cx - 4, CAMERA.y + 50, cx - 58, 152).lineBetween(cx + 4, CAMERA.y + 50, cx + 50, 152).lineBetween(cx, CAMERA.y + 50, cx - 4, 158);
    slab(g, cx - 18, CAMERA.y + 44, 36, 12, look.trim, 4);

    // The flash unit and the viewfinder sit on top; the shutter button between them.
    slab(g, cx + 6, cy - 78, 58, 32, look.body, 8);
    g.fillStyle(0xeef3f8).fillRoundedRect(cx + 56, cy - 74, 7, 24, 2);
    slab(g, cx - 64, cy - 66, 34, 22, look.trim, 6);
    g.fillStyle(0x9fd0e6, 0.8).fillRect(cx - 60, cy - 61, 8, 10);
    slab(g, cx - 22, cy - 56 + press * 6, 22, 14, 0xd8364a, 6);

    slab(g, cx - 76, cy - 46, 152, 96, look.body, 18);
    g.fillStyle(look.bodyShade).fillRoundedRect(cx - 72, cy + 22, 144, 24, { tl: 0, tr: 0, bl: 14, br: 14 });
    g.fillStyle(look.stripe).fillRect(cx - 73, cy + 2, 146, 10);
    g.fillStyle(shade(look.body, 0.18), 0.6).fillRoundedRect(cx - 64, cy - 40, 60, 10, 5);

    // The lens barrel, out of the front toward the subject, and the print slot under it.
    slab(g, cx + 70, cy - 30, 34, 66, look.trim, 10);
    g.fillStyle(0x22252b).fillEllipse(cx + 104, cy + 3, 16, 52);
    g.lineStyle(3, HOME_INK).strokeEllipse(cx + 104, cy + 3, 16, 52);
    g.fillStyle(0x6f8fb0, 0.8).fillEllipse(cx + 106, cy - 6, 6, 18);
    g.fillStyle(0x1e1d22).fillRect(cx + 66, cy + 36, 10, 12);

    if (flash > 0) {
      // A burst at the flash window and a cone of light toward the subject.
      const fx = cx + 62, fy = cy - 62;
      g.fillStyle(0xffffff, 0.16 * flash).fillTriangle(fx, fy - 10, fx, fy + 10, SUBJECT.x + 60, SUBJECT.foot - 40);
      g.fillStyle(0xffffff, 0.16 * flash).fillTriangle(fx, fy - 10, SUBJECT.x - 80, SUBJECT.foot - 200, SUBJECT.x + 60, SUBJECT.foot - 40);
      g.fillStyle(0xfffbe6, 0.55 * flash).fillCircle(fx, fy, 16 + 28 * (1 - flash));
      g.fillStyle(0xffffff, 0.9 * flash).fillCircle(fx, fy, 9 + 8 * (1 - flash));
    }
  }

  /**
   * The coda's print: out of the slot edge-on at first, then lifted to face the player and
   * developed. `clear` is how far the picture has come out of the dark.
   */
  private print(eject: number, rise: number, clear: number): void {
    const g = this.art, look = this.look;
    const slotX = CAMERA.x + 76, slotY = CAMERA.y + 42;
    if (rise <= 0) {
      // Sliding out of the slot: a foreshortened card, its picture end still dark.
      const length = 110 * eject;
      if (length < 1) return;
      shape(g, [slotX, slotY - 4, slotX + length, slotY - 4 + length * 0.1, slotX + length + 14, slotY + 18 + length * 0.1, slotX + 14, slotY + 18], PRINT_FRAME, HOME_INK, 3);
      return;
    }
    const startX = slotX + 62, startY = slotY + 12;
    const x = startX + (PRINT.x - startX) * rise, y = startY + (PRINT.y - startY) * rise;
    const w = 110 + (PRINT.w - 110) * rise, h = 24 + (PRINT.h - 24) * rise;
    // A failed print sags once it has come out wrong.
    const sag = !this.successful && clear > 0 ? 10 * clear : 0;
    const left = x - w / 2, top = y - h / 2 + sag;
    g.fillStyle(0x1a1410, 0.18).fillRoundedRect(left + 8, top + 10, w, h, 6);
    slab(g, left, top, w, h, PRINT_FRAME, 6);
    const margin = w * 0.08;
    const px = left + margin, py = top + margin, pw = w - margin * 2, ph = h - margin - h * 0.2;
    if (ph <= 2) return;
    if (rise >= 1) {
      // The picture itself: the room behind the subject, then the subject, small.
      g.fillStyle(look.wall).fillRect(px, py, pw, ph * 0.66);
      g.fillStyle(look.floor).fillRect(px, py + ph * 0.66, pw, ph * 0.34);
      this.subject(px + pw / 2, py + ph * 0.94, pw / 300, { blink: false, happy: this.successful, away: !this.successful });
      if (!this.successful) {
        // Washed out and blurred: a haze over it, a ghost of the subject beside itself, a light leak.
        g.fillStyle(WASHOUT, 0.62 * clear).fillRect(px, py, pw, ph);
        g.fillStyle(look.accent, 0.22 * clear).fillEllipse(px + pw / 2 + 10, py + ph * 0.6, pw * 0.42, ph * 0.5);
        g.fillStyle(0xf28a3a, 0.28 * clear).fillRect(px, py, pw * 0.16, ph);
        g.fillStyle(0xf2c14e, 0.22 * clear).fillRect(px + pw * 0.16, py, pw * 0.1, ph);
      }
    }
    // Undeveloped, the picture is dark; it clears as the chemistry works.
    if (clear < 1) g.fillStyle(UNDEVELOPED, 1 - clear).fillRect(px, py, pw, ph);
    g.lineStyle(2, shade(PRINT_FRAME, -0.25)).strokeRect(px, py, pw, ph);
    if (this.successful && clear > 0.8) {
      // A clean print catches the light: a gloss across it, and a sparkle or two.
      const shine = (clear - 0.8) / 0.2;
      g.fillStyle(SHINE, 0.35 * shine).fillTriangle(px, py + ph * 0.3, px + pw * 0.3, py, px + pw * 0.45, py);
      g.fillStyle(SHINE, 0.35 * shine).fillTriangle(px, py + ph * 0.3, px + pw * 0.45, py, px, py + ph * 0.48);
      sparkle(g, left - 6, top + 20, 14 * shine);
      sparkle(g, left + w + 8, top + h * 0.6, 11 * shine);
    }
  }
}
