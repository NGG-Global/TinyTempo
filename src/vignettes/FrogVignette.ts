import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import type { Judgement } from '@/rhythm/judge';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import { mix, shade } from '@/ui/colour';
import { cubicContour, fillContour, traceContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape } from './householdArt';
import { celebration } from './treatArt';
import { frogLook, type FrogLook, type FrogPaint } from './frogLooks';
import {
  blink, chorusSwell, croakRipple, croakSwell, duck, FROG_CHORDS, joinHop, leap, listenerRise,
  noteDrift, padBob, singing, splash, surfaced,
} from './frogMotion';

/** The card the pond is painted in, which the base class stands on a shelf and lights. */
const CARD = { x: -330, y: -224, width: 660, height: 448, radius: 30 } as const;
/** Where the sky meets the far bank and the water begins. */
const HORIZON = -64;
/** The singer's lily pad, and the two the listeners hop onto on a good round: left, then right. */
const PAD = { x: 0, y: 150, rx: 150, ry: 38 } as const;
const SIDE_PADS = [{ x: -226, y: 184, rx: 84, ry: 23 }, { x: 228, y: 178, rx: 82, ry: 22 }] as const;
/** Where each listener comes up to hear: the waterline its eyes break, just behind its pad. */
const PEEK = [{ x: -222, y: 118 }, { x: 222, y: 110 }] as const;
/** The listeners are drawn this much smaller than the singer, and sit a little up the pond. */
const FRIEND = 0.6;
/** Where the frog lands in the water when it jumps, and how far away that has made it look. */
const SPLASH = { x: 150, y: 46, scale: 0.72 } as const;
/** How high the leap arcs over the straight line from the pad to the water. */
const LEAP_HEIGHT = 130;

/**
 * The frog in its own frame: its seat at the origin, facing out of the screen. The head
 * and body are one contour, as a frog is; the eyes sit up on the crown.
 */
const BODY = cubicContour(-92, -8, [
  [-120, -52, -114, -114, -86, -140],
  [-60, -170, 60, -170, 86, -140],
  [114, -114, 120, -52, 92, -8],
  [52, 6, -52, 6, -92, -8],
]);
const MOUTH = cubicContour(-72, -114, [[-36, -97, 36, -97, 72, -114]]);
const EYE = { x: 54, y: -150, dome: 33, ball: 24 } as const;
/** The sac's top stays under the mouth as it grows; it swells down over the chest. */
const SAC = { top: -104, rest: 12, full: 50 } as const;
/** The body's centre, which a leap turns about. */
const MIDRIFF = 80;

interface FrogPose {
  /** How full the throat sac is, 0 to about 1. */
  readonly swell: number;
  /** 0 open, 1 shut. Shut in the chorus reads as singing with the eyes closed. */
  readonly lids: number;
  readonly lookX: number;
  readonly lookY: number;
  readonly crouch: number;
  /** The legs thrown out behind in a leap, 0 to 1. */
  readonly stretch: number;
  readonly tilt: number;
}
const REST: FrogPose = { swell: 0, lids: 0, lookX: 0, lookY: 0, crouch: 0, stretch: 0, tilt: 0 };

/**
 * The part of an ellipse above a horizontal line, as a closed contour: what shows of a
 * head above the water, or how far down a lid has come. Empty when none of it does.
 */
export function above(cx: number, cy: number, rx: number, ry: number, line: number, steps = 18): number[] {
  const s = (line - cy) / ry;
  if (s <= -1) return [];
  const [from, to] = s >= 1 ? [0, Math.PI * 2] : [Math.PI - Math.asin(s), Math.PI * 2 + Math.asin(s)];
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + (to - from) * i / steps;
    points.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return points;
}

/**
 * A frog on a lily pad croaks on every beat. Judged hits bring the pond's two other frogs
 * up out of the water to listen; a clean round brings them onto their pads to sing the last
 * chords in harmony, and a rough one sends the singer off its pad and into the water.
 *
 * The throat sac is drawn in the look's `sac` colour and nothing else is, so a test can see
 * a croak without Phaser; the listeners' eyes are the only thing drawn in a friend's `iris`
 * on the lotus pond, and the singer's `body` disappears from a frame once it is under.
 */
export class FrogVignette extends HouseholdVignette {
  private readonly look: FrogLook;
  /** Bursts fired once per task: the listeners leaving the water, and the singer going in. */
  private joined = false;
  private splashed = false;

  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = frogLook(lap);
    super(scene, look.paper, look.glow, { card: CARD });
    this.look = look;
  }

  public override reset(plan: RoundPlan): void {
    super.reset(plan);
    this.joined = this.splashed = false;
  }

  public override onAccuracy(result: Judgement, now: number): void {
    const before = this.hitTimes.length;
    super.onAccuracy(result, now);
    // A judged hit draws a listener up, and the water it breaks rings.
    if (this.hitTimes.length > before) {
      const index = listenerRise(before, this.plan?.targets.length ?? 4, 0) < 1 ? 0 : 1;
      this.throwBits('rings', PEEK[index].x, PEEK[index].y, [this.look.glint, 0xffffff], 2);
    }
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear(), look = this.look;
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const ended = ending >= 0;
    const joining = ended && this.successful;
    const jumping = ended && !this.successful;
    // The coda's own croak lands on the contact; before it, every croak is a beat's.
    const age = ended ? ending : now - this.strikeAt;
    // The croak is the action the player copies, so it plays under reduced motion too.
    const croak = jumping ? 0 : croakSwell(age, beat);
    const chorus = joining ? chorusSwell(ending, this.still) : 0;
    const hits = this.watching ? 0 : this.hitTimes.length;
    const targets = this.plan?.targets.length ?? 4;
    const hop = joining ? joinHop(ending, this.still) : 0;
    const jump = jumping ? leap(ending, this.still) : null;
    const bob = jumping ? padBob(ending, this.still) : 0;
    const shut = joining && singing(ending) ? 1 : this.still ? 0 : blink(now);

    this.scenery(now);
    // The water rings out from the pad on every croak, and again on every chord.
    const lastChord = joining ? FROG_CHORDS.reduce((at, [t]) => (ending >= t ? t : at), -Infinity) : -Infinity;
    const ripple = this.still ? -1 : croakRipple(ended && lastChord > 0 ? ending - lastChord : age);
    if (ripple >= 0 && !jump?.under) this.ring(PAD.x, PAD.y + bob, PAD.rx, PAD.ry, ripple);

    // The listeners, up to their eyes behind their pads; under again if the frog jumps.
    const dive = jumping ? duck(ending, this.still) : 1;
    for (const index of [0, 1] as const) {
      if (hop > 0) continue;
      const sway = this.still ? 0 : Math.sin(now * 2.1 + index * 2.4) * 0.03;
      const rise = listenerRise(hits, targets, index) * dive;
      this.peek(PEEK[index].x, PEEK[index].y, FRIEND, look.friends[index], rise > 0.02 ? rise + sway : 0, this.still ? 0 : blink(now, 1.3 + index), index ? -4 : 4);
    }
    if (joining && hop > 0 && !this.joined) {
      this.joined = true;
      for (const p of PEEK) this.throwBits('droplets', p.x, p.y, [look.glint, look.waterFar], 6);
    }

    const s = jump ? splash(ending, this.still) : -1;
    if (s >= 0) {
      this.splashAt(SPLASH.x, SPLASH.y, s);
      if (!this.splashed) {
        this.splashed = true;
        this.throwBits('droplets', SPLASH.x, SPLASH.y - 6, [look.glint, look.waterFar, 0xffffff], 12);
      }
    }
    // The jumper's eyes, back above the water, looking at the pad it left.
    const back = jumping ? surfaced(ending, this.still) : 0;
    if (back > 0) this.peek(SPLASH.x - 4, SPLASH.y + 6, SPLASH.scale * 0.9, look.singer, back, 0.45, -5);

    for (const [index, pad] of SIDE_PADS.entries()) this.pad(pad.x, pad.y, pad.rx, pad.ry, index ? 2.6 : 0.5);
    this.flowerPads();

    // The listeners hopping out onto their pads, and then seated and singing.
    if (hop > 0) {
      for (const index of [0, 1] as const) {
        const from = PEEK[index], to = SIDE_PADS[index];
        const x = from.x + (to.x - from.x) * hop;
        const y = from.y + (to.y - 4 - from.y) * hop - Math.sin(Math.PI * hop) * 86;
        const seated = hop >= 1;
        if (seated) this.seatShadow(to.x, to.y, FRIEND);
        this.frog(x, y, FRIEND, look.friends[index], {
          ...REST,
          swell: chorus,
          lids: shut,
          lookX: index ? -4 : 4,
          stretch: seated ? 0 : Math.sin(Math.PI * hop) * 0.9,
          tilt: seated ? 0 : (index ? -1 : 1) * (0.5 - hop) * 0.7,
        });
      }
    }

    this.pad(PAD.x, PAD.y + bob, PAD.rx, PAD.ry, 0.3);
    if (!jump || (jump.travel === 0 && !jump.under)) {
      this.seatShadow(PAD.x, PAD.y + bob, 1);
      this.frog(PAD.x, PAD.y - 4 + bob, 1, look.singer, {
        ...REST,
        swell: Math.max(croak, chorus),
        lids: shut,
        // Toward whichever listener is coming up; back to the front for the chorus.
        lookX: joining || hits === 0 ? 0 : listenerRise(hits, targets, 1) > 0 ? 4 : -4,
        lookY: -2,
        crouch: jump?.crouch ?? 0,
      });
    } else if (!jump.under) {
      // Off the pad in an arc, legs out behind, head first into the water.
      const t = jump.travel;
      const x = PAD.x + (SPLASH.x - PAD.x) * t;
      const y = PAD.y - 4 + (SPLASH.y - (PAD.y - 4)) * t - Math.sin(Math.PI * t) * LEAP_HEIGHT;
      const vx = SPLASH.x - PAD.x, vy = SPLASH.y - PAD.y - LEAP_HEIGHT * Math.PI * Math.cos(Math.PI * t);
      this.frog(x, y, 1 + (SPLASH.scale - 1) * t, look.singer, {
        ...REST,
        stretch: Math.min(1, t * 5),
        tilt: (Math.atan2(vy, vx) + Math.PI / 2) * 0.8,
        lookY: -4,
      });
    }

    if (joining) {
      this.notes(ending);
      celebration(g, ending, this.still);
    }
    // The card's own edge, over the water that was painted to it.
    g.lineStyle(STYLE.current.outline * 0.6, HOME_INK).strokeRoundedRect(CARD.x, CARD.y, CARD.width, CARD.height, CARD.radius);
  }

  /** The water's colour at a height: the far colour at the horizon, the near one at the card's foot. */
  private water(y: number): number {
    return mix(this.look.waterFar, this.look.waterNear, (y - HORIZON) / (CARD.y + CARD.height - HORIZON));
  }

  /** The sky, the far bank, the pond, and what the hour puts in them. */
  private scenery(now: number): void {
    const g = this.art, look = this.look;
    const bottom = CARD.y + CARD.height;
    g.fillStyle(look.skyTop).fillRoundedRect(CARD.x, CARD.y, CARD.width, CARD.height, CARD.radius);
    // The sky in bands to the horizon, below the card's rounded top corners.
    const bands = 6, top = CARD.y + CARD.radius;
    for (let k = 0; k < bands; k++) {
      const y0 = top + (HORIZON - top) * k / bands;
      g.fillStyle(mix(look.skyTop, look.skyLow, (k + 1) / bands)).fillRect(CARD.x, y0, CARD.width, (HORIZON - top) / bands + 1);
    }

    if (look.pond === 'noon') {
      g.fillStyle(0xfff6c8, 0.35).fillCircle(214, -168, 50);
      g.fillStyle(0xfff3b0).fillCircle(214, -168, 30);
      for (const [x, y, w] of [[-206, -170, 1], [40, -192, 0.8], [-40, -138, 0.6]] as const) {
        g.fillStyle(0xffffff, 0.92);
        g.fillEllipse(x, y, 92 * w, 30 * w).fillCircle(x - 18 * w, y - 10 * w, 20 * w).fillCircle(x + 14 * w, y - 14 * w, 24 * w);
      }
    } else if (look.pond === 'moon') {
      for (const [x, y, r] of [[-280, -190, 2], [-220, -150, 1.5], [-150, -196, 2.5], [-60, -166, 1.5], [10, -200, 2], [96, -150, 1.5], [150, -192, 2], [300, -130, 1.5], [-110, -120, 1.2], [60, -112, 1.2]] as const) {
        g.fillStyle(0xfdf6d8, 0.9).fillCircle(x, y, r);
      }
      g.fillStyle(look.glint, 0.18).fillCircle(232, -160, 50);
      g.fillStyle(look.glint).fillCircle(232, -160, 28);
      g.fillStyle(shade(look.glint, -0.12), 0.8).fillCircle(222, -168, 6).fillCircle(240, -150, 4).fillCircle(244, -170, 3);
    } else {
      g.fillStyle(0xffe3a0, 0.4).fillCircle(170, HORIZON - 4, 70);
      g.fillStyle(0xffd27a).fillCircle(170, HORIZON - 4, 44);
      for (const [x, y, w] of [[-200, -176, 1], [-40, -150, 0.7], [250, -196, 0.6]] as const) {
        g.fillStyle(0xfbe3d2, 0.85).fillEllipse(x, y, 120 * w, 16 * w).fillEllipse(x + 30 * w, y + 9 * w, 90 * w, 12 * w);
      }
    }

    // The far bank: a line of trees along the horizon, or the hills behind the lotus pond.
    const lotus = look.pond === 'lotus';
    for (let k = 0; k < 13; k++) {
      const x = CARD.x + 26 + k * 51;
      // Never wider than the room to the card's side: nothing clips the stage.
      const r = Math.min(lotus ? 70 + (k % 3) * 14 : 30 + ((k * 7) % 5) * 6, x - CARD.x - 2, -CARD.x - x - 2);
      const y = HORIZON + (lotus ? 20 : 10);
      g.fillStyle(look.bank).fillCircle(x, y, r);
      if (!lotus) g.fillStyle(shade(look.bank, 0.16), 0.7).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.45);
    }

    // The pond, in bands from the far water to the near, with the card's rounded foot.
    g.fillStyle(look.waterNear).fillRoundedRect(CARD.x, HORIZON, CARD.width, bottom - HORIZON, { tl: 0, tr: 0, bl: CARD.radius, br: CARD.radius });
    const rows = 7, foot = bottom - CARD.radius;
    for (let k = 0; k < rows; k++) {
      const y0 = HORIZON + (foot - HORIZON) * k / rows;
      g.fillStyle(this.water(y0)).fillRect(CARD.x, y0, CARD.width, (foot - HORIZON) / rows + 1);
    }
    g.fillStyle(shade(look.waterFar, 0.25), 0.7).fillRect(CARD.x, HORIZON, CARD.width, 4);

    // The sun's or the moon's light lying on the water, and the pond's own glints.
    const lightX = look.pond === 'noon' ? 214 : look.pond === 'moon' ? 232 : 170;
    const drift = this.still ? 0 : Math.sin(now * 1.3) * 6;
    for (let k = 0; k < 6; k++) {
      const w = 64 - k * 8;
      g.fillStyle(look.glint, 0.5 - k * 0.06).fillRoundedRect(lightX - w / 2 + (k % 2 ? drift : -drift), HORIZON + 10 + k * 16, w, 4, 2);
    }
    g.lineStyle(3, look.glint, 0.35);
    for (const [x, y, w] of [[-280, -20, 44], [-130, 10, 60], [40, -36, 50], [-60, 92, 40], [100, 120, 54], [-300, 200, 30], [270, 30, 34], [-170, 64, 30]] as const) {
      g.lineBetween(x + drift, y, x + w + drift, y);
    }

    // Reeds and bulrushes standing in the shallows at both edges.
    const reeds = [[-312, -20, -170], [-292, -10, -132], [-270, -26, -150], [296, -14, -160], [276, -24, -126], [314, -4, -142]] as const;
    for (const [x, foot, tip] of reeds) {
      g.lineStyle(9, shade(look.reed, -0.35)).lineBetween(x, foot, x + 4, tip);
      g.lineStyle(5, look.reed).lineBetween(x, foot, x + 4, tip);
    }
    for (const [x, , tip] of reeds.filter((_, i) => i % 2 === 0)) {
      g.fillStyle(look.pond === 'moon' ? 0x5a3e2c : 0x8a5a36).fillRoundedRect(x - 3, tip + 6, 14, 40, 7);
      g.lineStyle(3, HOME_INK).strokeRoundedRect(x - 3, tip + 6, 14, 40, 7);
    }
    // Blades of grass leaning out of the clumps.
    g.lineStyle(4, shade(look.reed, 0.15));
    for (const [x, y, dx] of [[-300, -8, -26], [-280, -12, 24], [290, -8, 26], [300, -6, -20]] as const) {
      traceContour(g, cubicContour(x, y, [[x + dx * 0.2, y - 40, x + dx * 0.7, y - 70, x + dx, y - 90]]));
      g.strokePath();
    }

    if (look.pond === 'moon' && !this.still) {
      // Fireflies over the reeds, drifting on their own slow loops.
      for (let k = 0; k < 6; k++) {
        const x = [-250, -170, 120, 200, 286, -40][k]! + Math.sin(now * 0.7 + k * 1.9) * 16;
        const y = [-110, -150, -120, -170, -96, -180][k]! + Math.cos(now * 0.9 + k * 1.3) * 10;
        const glow = 0.5 + 0.5 * Math.sin(now * 3 + k * 2.1);
        g.fillStyle(0xf6f29a, 0.18 * glow).fillCircle(x, y, 14);
        g.fillStyle(0xfdfbc8, 0.5 + 0.5 * glow).fillCircle(x, y, 3.5);
      }
    }
  }

  /** A lily pad floating on the water: its shadow, its notch, its veins and its lit rim. */
  private pad(x: number, y: number, rx: number, ry: number, notch: number): void {
    const g = this.art, look = this.look;
    g.fillStyle(shade(look.waterNear, -0.35), 0.35).fillEllipse(x + 8, y + 7, rx * 2, ry * 2);
    g.fillStyle(look.pad).fillEllipse(x, y, rx * 2, ry * 2);
    g.fillStyle(shade(look.pad, 0.16), 0.9).fillEllipse(x - rx * 0.12, y - ry * 0.18, rx * 1.6, ry * 1.3);
    g.lineStyle(2.5, shade(look.pad, -0.2), 0.7);
    for (let k = 0; k < 9; k++) {
      const a = notch + 0.35 + k * (Math.PI * 2 - 0.7) / 8;
      g.lineBetween(x, y, x + Math.cos(a) * rx * 0.86, y + Math.sin(a) * ry * 0.86);
    }
    // The notch, cut to the centre, shows the water under it.
    const water = this.water(y);
    g.fillStyle(water).fillTriangle(x, y, x + Math.cos(notch - 0.17) * rx * 1.03, y + Math.sin(notch - 0.17) * ry * 1.03, x + Math.cos(notch + 0.17) * rx * 1.03, y + Math.sin(notch + 0.17) * ry * 1.03);
    g.lineStyle(STYLE.current.outline * 0.5, HOME_INK).strokeEllipse(x, y, rx * 2, ry * 2);
    g.lineStyle(2.5, HOME_INK, 0.8).lineBetween(x, y, x + Math.cos(notch - 0.17) * rx, y + Math.sin(notch - 0.17) * ry);
    g.lineBetween(x, y, x + Math.cos(notch + 0.17) * rx, y + Math.sin(notch + 0.17) * ry);
  }

  /** Two small pads in bloom: a water lily in front, or a lotus standing up out of its pad. */
  private flowerPads(): void {
    this.pad(-112, 204, 44, 12, 4.2);
    this.flower(-104, 198, 1);
    this.pad(286, 72, 28, 8, 3.4);
    this.flower(288, 67, 0.65);
  }

  private flower(x: number, y: number, size: number): void {
    const g = this.art, look = this.look;
    const lotus = look.pond === 'lotus';
    const tall = lotus ? 1.5 : 1;
    const petal = (a: number, length: number, width: number, colour: number): void => {
      const tipX = x + Math.sin(a) * length * size, tipY = y - Math.cos(a) * length * size * tall;
      const side = width * size;
      const points = cubicContour(x, y, [
        [x + Math.cos(a) * side, y + Math.sin(a) * side * 0.5 - 10 * size, tipX + Math.cos(a) * side * 0.4, tipY + 8 * size, tipX, tipY],
        [tipX - Math.cos(a) * side * 0.4, tipY + 8 * size, x - Math.cos(a) * side, y - Math.sin(a) * side * 0.5 - 10 * size, x, y],
      ]);
      shape(g, points, colour, HOME_INK, 2.5);
    };
    for (const a of [-1.25, 1.25, -0.7, 0.7]) petal(a, 30, 12, shade(look.flower, -0.12));
    for (const a of [-0.35, 0.35, 0]) petal(a, 34, 13, look.flower);
    g.fillStyle(lotus ? 0xf6d35a : 0xf7d65e).fillCircle(x, y - 8 * size, 7 * size);
    g.fillStyle(0xffffff, 0.6).fillEllipse(x - 5 * size, y - 24 * size * tall, 4 * size, 10 * size);
  }

  /** The dark of a frog's weight pressing its pad into the water. */
  private seatShadow(x: number, y: number, scale: number): void {
    this.art.fillStyle(shade(this.look.pad, -0.45), 0.5).fillEllipse(x + 8 * scale, y + 2, 210 * scale, 28 * scale);
  }

  /** A ring spreading on the water from a pad: 0 as it leaves, 1 as it fades. */
  private ring(x: number, y: number, rx: number, ry: number, p: number): void {
    const g = this.art, look = this.look;
    for (const [lag, width] of [[0, 4], [0.22, 2.5]] as const) {
      const q = p - lag;
      if (q <= 0) continue;
      g.lineStyle(width, look.glint, (1 - q) * 0.6).strokeEllipse(x, y + 4, (rx + q * 90) * 2, (ry + q * 22) * 2);
    }
  }

  /** The frog going in: a crown of water thrown up and falling back, and rings spreading out. */
  private splashAt(x: number, y: number, p: number): void {
    const g = this.art, look = this.look;
    for (const [lag, width] of [[0, 4], [0.18, 3], [0.36, 2]] as const) {
      const q = p - lag;
      if (q <= 0) continue;
      g.lineStyle(width, look.glint, (1 - q) * 0.7).strokeEllipse(x, y + 4, 40 + q * 220, 10 + q * 48);
    }
    if (p >= 1) return;
    // The column in the middle rises and drops back; the crown's drops arc out and fall.
    // The foam where it went in, under everything thrown up out of it.
    g.fillStyle(0xffffff, 0.75 * (1 - p)).fillEllipse(x, y + 2, 70 + p * 60, 16 + p * 8);
    const crown = Math.sin(Math.PI * Math.min(1, p * 2.2));
    if (crown > 0.02) {
      // A crown of water: a ring of points standing up round the hole, falling back.
      const points: number[] = [x - 44, y];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8, px = x - 44 + 88 * u;
        points.push(px, y - (k % 2 ? 46 : 22) * crown * (1 - Math.abs(u - 0.5)));
      }
      points.push(x + 44, y);
      shape(g, points, look.glint, shade(look.waterNear, -0.25), 3);
    }
    const column = Math.sin(Math.PI * Math.min(1, p * 1.4));
    if (column > 0.02) {
      const h = column * 104;
      shape(g, cubicContour(x - 16, y - 8, [[x - 14, y - h * 0.6, x - 8, y - h, x, y - h], [x + 8, y - h, x + 14, y - h * 0.6, x + 16, y - 8]]), 0xffffff, shade(look.waterNear, -0.25), 3);
      g.fillStyle(look.glint).fillCircle(x, y - h - 14 * column, 9 * column);
    }
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI + (k + 0.5) * Math.PI / 10;
      const speed = 90 + (k % 3) * 30;
      const dx = Math.cos(a) * speed * p * 1.5, dy = Math.sin(a) * speed * p * 2 + 300 * p * p;
      const r = (7 + (k % 2) * 3) * (1 - p * 0.5);
      if (dy > 6) continue;
      g.fillStyle(look.glint, 1 - p * 0.4).fillEllipse(x + dx, y + dy, r * 1.4, r * 2);
      g.lineStyle(2, shade(look.waterNear, -0.25), 1 - p * 0.4).strokeEllipse(x + dx, y + dy, r * 1.4, r * 2);
    }
  }

  /**
   * A frog with only its eyes and the crown of its head out of the water: `rise` 1 is
   * eyes up, 0 under. Drawn clipped to the waterline rather than masked, since a mask is a
   * second camera's job in this engine.
   */
  private peek(x: number, waterline: number, scale: number, paint: FrogPaint, rise: number, lids: number, lookX: number): void {
    if (rise <= 0.02) return;
    const g = this.art, look = this.look;
    const r = EYE.dome * scale, ball = EYE.ball * scale, dx = EYE.x * scale;
    const crownY = waterline + 30 * scale - rise * 30 * scale;
    this.clipped(x, crownY, 74 * scale, 34 * scale, waterline, paint.body, HOME_INK);
    for (const side of [-1, 1]) {
      const ex = x + side * dx;
      const dome = waterline + r - rise * r * 1.55;
      this.clipped(ex, dome, r, r, waterline, paint.body, HOME_INK);
      const ey = dome - 4 * scale;
      this.clipped(ex, ey, ball, ball, waterline, 0xffffff, HOME_INK, 2);
      this.pupil(ex + lookX * scale, ey, scale, paint, waterline);
      const lid = Math.min(waterline, ey - ball + lids * ball * 2);
      if (lids > 0.02) this.clipped(ex, ey, ball + 1, ball + 1, lid, paint.body, HOME_INK, 2.5);
    }
    g.lineStyle(3, look.glint, 0.7 * Math.min(1, rise * 2)).strokeEllipse(x, waterline + 2, 170 * scale, 20 * scale);
  }

  /** Fill the part of an ellipse above a line and ink only its curve, never the waterline. */
  private clipped(cx: number, cy: number, rx: number, ry: number, line: number, colour: number, ink: number, width = 3.5): void {
    const points = above(cx, cy, rx, ry, line);
    if (points.length < 6) return;
    const g = this.art;
    g.fillStyle(colour);
    fillContour(g, points);
    g.lineStyle(width, ink);
    traceContour(g, points);
    g.strokePath();
  }

  /** An eye's iris and pupil in the look's style, cut off at `line` when the frog is in the water. */
  private pupil(x: number, y: number, scale: number, paint: FrogPaint, line = Infinity): void {
    const g = this.art, eye = this.look.eye;
    const part = (cx: number, cy: number, rx: number, ry: number, colour: number): void => {
      const points = above(cx, cy, rx, ry, line);
      if (points.length < 6) return;
      g.fillStyle(colour);
      fillContour(g, points);
    };
    if (eye === 'round') {
      part(x, y + 1 * scale, 13 * scale, 12 * scale, paint.iris);
    } else {
      part(x, y, (eye === 'red' ? 20 : 19) * scale, (eye === 'red' ? 20 : 19) * scale, paint.iris);
      part(x, y, (eye === 'red' ? 4 : 13) * scale, (eye === 'red' ? 13 : 5.5) * scale, 0x1f1a18);
    }
    if (y - 7 * scale < line) g.fillStyle(0xffffff, 0.95).fillCircle(x - 6 * scale, y - 7 * scale, 5 * scale);
  }

  /**
   * One frog, seated at (x, y) on its pad, at `scale`. Drawn in its own frame under a canvas
   * transform, so a leap can turn it about its middle and the listeners are the same frog
   * smaller; outlines are divided back out so a small frog keeps the singer's weight of line.
   */
  private frog(x: number, y: number, scale: number, paint: FrogPaint, pose: FrogPose): void {
    const g = this.art;
    const sx = 1 + 0.1 * pose.crouch, sy = 1 - 0.14 * pose.crouch;
    const k = 1 / Math.max(0.7, scale);
    const out = STYLE.current.outline * 0.65 * k;
    g.save();
    g.translateCanvas(x, y - MIDRIFF * scale * sy);
    g.rotateCanvas(pose.tilt);
    g.scaleCanvas(scale * sx, scale * sy);
    g.translateCanvas(0, MIDRIFF);

    if (pose.stretch > 0.05) this.legs(paint, pose.stretch, out);
    shape(g, BODY, paint.body, HOME_INK, out);
    if (paint.spots !== paint.body) {
      g.fillStyle(paint.spots, 0.85);
      for (const [px, py, w, h] of [[-72, -118, 18, 13], [70, -112, 15, 11], [-92, -78, 13, 16], [88, -70, 16, 13], [-40, -150, 10, 8], [36, -148, 11, 8]] as const) g.fillEllipse(px, py, w, h);
    }
    if (paint.flank !== paint.body) {
      // A tree frog's blue flanks, barred in cream, showing either side of the belly.
      for (const side of [-1, 1]) {
        g.fillStyle(paint.flank).fillEllipse(side * 88, -72, 30, 62);
        g.lineStyle(3, 0xf4edc8, 0.9);
        for (const dy of [-90, -72, -54]) g.lineBetween(side * 80, dy, side * 98, dy + 4);
      }
    }
    g.fillStyle(paint.belly).fillEllipse(0, -58, 132, 96);
    g.fillStyle(shade(paint.belly, -0.1), 0.55).fillEllipse(10, -38, 100, 44);
    if (pose.stretch <= 0.05) this.haunches(paint, out);
    this.sac(paint, pose.swell, k);
    this.arms(paint, out);

    // The face: a long smile, two nostrils and a blush, then the eyes up on the crown.
    g.lineStyle(4 * k, HOME_INK);
    traceContour(g, MOUTH);
    g.strokePath();
    g.lineStyle(3 * k, HOME_INK).lineBetween(-72, -114, -80, -120).lineBetween(72, -114, 80, -120);
    g.fillStyle(shade(paint.body, -0.45)).fillEllipse(-12, -137, 6, 4).fillEllipse(12, -137, 6, 4);
    g.fillStyle(0xf2897a, 0.35).fillEllipse(-80, -104, 30, 14).fillEllipse(80, -104, 30, 14);
    for (const side of [-1, 1]) this.eye(side * EYE.x, paint, pose, out, k);
    this.croakLines(pose.swell, k);
    g.restore();
  }

  /** The crown's eye: a dome of skin, the eyeball, the iris, and a lid that comes down to blink or sing. */
  private eye(ex: number, paint: FrogPaint, pose: FrogPose, out: number, k: number): void {
    const g = this.art;
    g.fillStyle(paint.body).fillCircle(ex, EYE.y, EYE.dome);
    g.lineStyle(out, HOME_INK);
    g.beginPath();
    g.arc(ex, EYE.y, EYE.dome, Math.PI - 0.45, Math.PI * 2 + 0.45);
    g.strokePath();
    const ey = EYE.y - 4;
    if (pose.lids >= 0.92) {
      // Shut: a contented arc, which is how they sing.
      g.lineStyle(4.5 * k, HOME_INK);
      traceContour(g, cubicContour(ex - 14, ey + 4, [[ex - 6, ey - 8, ex + 6, ey - 8, ex + 14, ey + 4]]));
      g.strokePath();
      return;
    }
    g.fillStyle(0xffffff).fillCircle(ex, ey, EYE.ball);
    g.lineStyle(2.5 * k, HOME_INK).strokeCircle(ex, ey, EYE.ball);
    this.pupil(ex + pose.lookX, ey + pose.lookY, 1, paint);
    if (pose.lids > 0.02) {
      const line = ey - EYE.ball + pose.lids * EYE.ball * 2;
      const lid = above(ex, ey, EYE.ball + 1, EYE.ball + 1, line);
      if (lid.length >= 6) {
        g.fillStyle(paint.body);
        fillContour(g, lid);
        const half = (EYE.ball + 1) * Math.sqrt(Math.max(0, 1 - ((line - ey) / (EYE.ball + 1)) ** 2));
        g.lineStyle(3 * k, HOME_INK).lineBetween(ex - half, line, ex + half, line);
      }
    }
  }

  /**
   * The croak itself: the throat sac ballooning out under the mouth, wider than it is tall,
   * thin enough to glow, with the croak's ring thrown off either side of it at the peak.
   */
  private sac(paint: FrogPaint, swell: number, k: number): void {
    if (swell <= 0.03) return;
    const g = this.art;
    const r = SAC.rest + SAC.full * swell;
    const cy = SAC.top + r * 0.8, rx = r * 1.16;
    g.fillStyle(shade(paint.body, -0.3), 0.35).fillEllipse(6, cy + 6, rx * 2, r * 2);
    g.fillStyle(paint.sac).fillEllipse(0, cy, rx * 2, r * 2);
    g.fillStyle(shade(paint.sac, -0.14), 0.6).fillEllipse(r * 0.12, cy + r * 0.48, rx * 1.3, r * 0.6);
    g.fillStyle(0xffffff, 0.4).fillEllipse(-r * 0.08, cy - r * 0.08, rx * 1.3, r * 1.2);
    g.lineStyle(3.5 * k, HOME_INK).strokeEllipse(0, cy, rx * 2, r * 2);
    g.fillStyle(0xffffff, 0.85).fillEllipse(-rx * 0.38, cy - r * 0.44, r * 0.6, r * 0.3);
    g.fillStyle(0xffffff, 0.7).fillCircle(rx * 0.38, cy - r * 0.5, r * 0.08);
  }

  /** The croak leaving the frog: two short arcs out past each cheek, the further one fainter. */
  private croakLines(swell: number, k: number): void {
    if (swell <= 0.5) return;
    const g = this.art, a = (swell - 0.5) * 2;
    for (const side of [-1, 1]) {
      for (const [radius, alpha] of [[132, 0.9], [152, 0.5]] as const) {
        g.lineStyle(4.5 * k, HOME_INK, alpha * a);
        g.beginPath();
        g.arc(0, -96, radius, side < 0 ? Math.PI - 0.3 : -0.3, side < 0 ? Math.PI + 0.3 : 0.3);
        g.strokePath();
      }
    }
  }

  /** Seated: the thighs folded at the sides, and the long toes splayed on the pad. */
  private haunches(paint: FrogPaint, out: number): void {
    const g = this.art;
    for (const side of [-1, 1]) {
      g.fillStyle(paint.flank).fillEllipse(side * 90, -44, 88, 74);
      g.lineStyle(out, HOME_INK).strokeEllipse(side * 90, -44, 88, 74);
      g.fillStyle(shade(paint.flank, 0.2), 0.8).fillEllipse(side * 84 - 8, -60, 40, 20);
      this.toes(side * 98, -10, [[side * 134, -18], [side * 144, -4], [side * 130, 8]], paint, out);
    }
  }

  /** A foot or a hand: toes from a heel, each ending in a round pad. */
  private toes(hx: number, hy: number, tips: readonly (readonly [number, number])[], paint: FrogPaint, out: number): void {
    const g = this.art;
    const colour = shade(paint.toe, -0.08);
    for (const [tx, ty] of tips) g.lineStyle(10, HOME_INK).lineBetween(hx, hy, tx, ty);
    for (const [tx, ty] of tips) g.lineStyle(10 - out * 0.9, colour).lineBetween(hx, hy, tx, ty);
    for (const [tx, ty] of tips) {
      g.fillStyle(paint.toe).fillCircle(tx, ty, 6.5);
      g.lineStyle(2.5, HOME_INK).strokeCircle(tx, ty, 6.5);
    }
  }

  /** The front legs, down from the chest to the pad, in front of the sac. */
  private arms(paint: FrogPaint, out: number): void {
    const g = this.art;
    for (const side of [-1, 1]) {
      g.lineStyle(20, HOME_INK).lineBetween(side * 56, -84, side * 62, -18);
      g.lineStyle(20 - out * 0.9, paint.body).lineBetween(side * 56, -84, side * 62, -18);
      this.toes(side * 62, -14, [[side * 46, -2], [side * 61, 3], [side * 76, -2]], paint, out);
    }
  }

  /** Mid-leap: the hind legs thrown out straight behind, webbed feet trailing. */
  private legs(paint: FrogPaint, stretch: number, out: number): void {
    const g = this.art;
    for (const side of [-1, 1]) {
      const hip = [side * 54, -46] as const;
      const knee = [side * (82 + 8 * stretch), -46 + 44 * stretch] as const;
      const foot = [side * (58 - 10 * stretch), -40 + 116 * stretch] as const;
      for (const [width, colour] of [[30, HOME_INK], [30 - out * 0.9 * 2, paint.flank]] as const) {
        g.lineStyle(width, colour).lineBetween(hip[0], hip[1], knee[0], knee[1]);
        g.lineStyle(width * 0.75, colour).lineBetween(knee[0], knee[1], foot[0], foot[1]);
        g.fillStyle(colour).fillCircle(knee[0], knee[1], width * 0.45);
      }
      this.toes(foot[0], foot[1], [[foot[0] + side * 18, foot[1] + 24], [foot[0], foot[1] + 30], [foot[0] - side * 14, foot[1] + 24]], paint, out);
    }
  }

  /** Notes rising from each frog on each chord: one colour per singer. */
  private notes(ending: number): void {
    const g = this.art, look = this.look;
    const singers = [
      { x: PAD.x + 24, y: PAD.y - 140, colour: look.singer.body },
      { x: SIDE_PADS[0].x + 18, y: SIDE_PADS[0].y - 92, colour: look.friends[0].body },
      { x: SIDE_PADS[1].x - 18, y: SIDE_PADS[1].y - 92, colour: look.friends[1].body },
    ];
    for (const [chord, [at]] of FROG_CHORDS.entries()) {
      for (const [i, singer] of singers.entries()) {
        const drift = this.still ? (chord === 0 ? 0.4 : -1) : noteDrift(ending, at + i * 0.03);
        if (drift < 0) continue;
        const side = (i + chord) % 2 ? 1 : -1;
        const x = singer.x + side * (16 + Math.sin(drift * Math.PI * 2) * 10) + chord * 12 * side;
        const y = singer.y - 20 - drift * 110;
        const alpha = drift < 0.75 ? 1 : 1 - (drift - 0.75) / 0.25;
        g.fillStyle(singer.colour, alpha).fillEllipse(x, y, 17, 12);
        g.lineStyle(3, HOME_INK, alpha).strokeEllipse(x, y, 17, 12);
        g.lineStyle(3.5, HOME_INK, alpha).lineBetween(x + 7, y - 1, x + 7, y - 30).lineBetween(x + 7, y - 30, x + 19, y - 24);
      }
    }
  }
}
