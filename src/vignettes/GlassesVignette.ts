import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { SHELL } from '@/config/theme';
import type { Judgement } from '@/rhythm/judge';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import { mix, shade } from '@/ui/colour';
import { cubicContour, fillContour, traceContour } from '@/ui/illustration';
import { display } from '@/ui/type';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, sparkle } from './householdArt';
import { glassesLook, type Glassware, type GlassesLook, type Toaster } from './glassesLooks';
import {
  broken, CHEER_AT, cheerPop, clinkShine, clinkSwing, cracksShown, GLASS_BREAK_AT, lightsLit, puddleSpread,
  shardPose, slosh, spillFall, toastLift,
} from './glassesMotion';

/** The card the room is painted in, which the base class stands on a shelf and lights. */
const CARD = { x: -330, y: -224, width: 660, height: 448, radius: 30 } as const;
/** The tablecloth's top edge, where shards and a spilled drink come to rest. */
const TABLE_Y = 150;
/** The front of the cloth, hanging below the table's top. */
const CLOTH_FRONT = 172;
/** Every glass is drawn this much larger than its frame's units, about its grip. */
const GLASS_SCALE = 1.15;
/** A shard is painted in this, and only a shard is, so a test can see a break without Phaser. */
export const SHARD = 0xdcf0f4;
/** Every crack a mistake leaves is drawn in this, and nothing else is. */
export const CRACK = 0xf4fbff;
/** A bulb that is off: grey glass, so it reads as dark against a night wall or a sunset. */
const UNLIT = 0xa9a4ae;

/**
 * A glass in its own frame: the hand's grip at the origin, the rim up the negative y. The
 * bowl's profile is its half-width from the floor (`u` 0) to the rim (`u` 1).
 */
interface GlassSpec {
  readonly rim: number;
  readonly floor: number;
  readonly halfWidth: (u: number) => number;
  /** How far the bowl's floor dips into the stem, or 0 for a flat floor. */
  readonly cup: number;
  /** A tumbler's thick glass base under its floor; 0 for a stemmed glass. */
  readonly base: number;
  readonly stem: { readonly top: number; readonly bottom: number } | null;
  readonly foot: { readonly y: number; readonly rx: number; readonly ry: number } | null;
  /** How much of the bowl the drink fills, from the floor. */
  readonly fill: number;
  /** How far the fist sits outward of the glass's axis. */
  readonly gripOut: number;
  /** The lean toward the other glass at rest and on the contact, in radians. */
  readonly lean: readonly [number, number];
  /** Half the gap between the rims at rest. */
  readonly gap: number;
  /** Where the rims meet. */
  readonly contactY: number;
}

export const GLASSES: Readonly<Record<Glassware, GlassSpec>> = {
  flute: {
    rim: -180, floor: -50, halfWidth: u => 7 + 24 * Math.sqrt(Math.max(0, u)), cup: 7, base: 0,
    stem: { top: -46, bottom: 36 }, foot: { y: 40, rx: 36, ry: 8 },
    fill: 0.74, gripOut: 6, lean: [0.12, 0.3], gap: 52, contactY: -92,
  },
  tumbler: {
    rim: -86, floor: 56, halfWidth: u => 42 + 9 * u, cup: 0, base: 16,
    stem: null, foot: null,
    fill: 0.62, gripOut: 40, lean: [0.08, 0.22], gap: 48, contactY: -30,
  },
  goblet: {
    rim: -152, floor: -50, halfWidth: u => 9 + 50 * Math.sin(Math.PI * 0.72 * Math.max(0, u)), cup: 8, base: 0,
    stem: { top: -44, bottom: 36 }, foot: { y: 40, rx: 42, ry: 9 },
    fill: 0.56, gripOut: 6, lean: [0.1, 0.26], gap: 50, contactY: -66,
  },
};

export interface GlassPose {
  /** The grip, in stage units. */
  readonly x: number;
  readonly y: number;
  /** The glass's turn about its grip: clockwise for the left glass leaning right. */
  readonly angle: number;
}

/**
 * Where a glass is held at a point in its clink: `swing` 0 apart and leaning a little, 1 rim
 * to rim at x 0 and leaning in. Solved from the glass's own rim, so each kind of glass meets
 * its partner exactly whatever its shape; `lift` raises the pair in the toast.
 */
export function glassPose(spec: GlassSpec, side: -1 | 1, swing: number, lift = 0): GlassPose {
  const [rest, hit] = spec.lean;
  const lean = rest + (hit - rest) * swing;
  const w = spec.halfWidth(1);
  const gap = spec.gap * (1 - swing);
  const gripY = spec.contactY - GLASS_SCALE * (w * Math.sin(hit) + spec.rim * Math.cos(hit));
  // The rim's inner edge is at w along the glass and `rim` up it; turned by the lean, it sits
  // at x = gap from the middle.
  const x = gap + GLASS_SCALE * (w * Math.cos(lean) - spec.rim * Math.sin(lean));
  return { x: side * x, y: gripY - lift * 16, angle: -side * lean };
}

/** Clip a closed contour to one side of the line y = c + m·x: below it (`keepBelow`) or above. */
export function clipToLine(points: readonly number[], c: number, m: number, keepBelow: boolean): number[] {
  const out: number[] = [];
  const n = points.length / 2;
  const inside = (x: number, y: number): boolean => (keepBelow ? y >= c + m * x : y <= c + m * x);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = points[i * 2]!, ay = points[i * 2 + 1]!, bx = points[j * 2]!, by = points[j * 2 + 1]!;
    const aIn = inside(ax, ay), bIn = inside(bx, by);
    if (aIn) out.push(ax, ay);
    if (aIn !== bIn) {
      const den = (by - ay) - m * (bx - ax);
      const t = den === 0 ? 0 : (c + m * ax - ay) / den;
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return out;
}

/**
 * A glass's outline as a contour from the left of its rim, round its floor, to the right of
 * its rim: `inset` in from the outer wall, and up to `top` of the way to the rim.
 */
function bowl(spec: GlassSpec, inset = 0, steps = 14, top = 1): number[] {
  const y = (u: number): number => spec.floor - u * (spec.floor - spec.rim);
  const left: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = top * (1 - i / steps);
    left.push(-(spec.halfWidth(u) - inset), y(u));
  }
  const bottom = inset > 0 ? spec.floor : spec.floor + spec.base;
  const foot = spec.halfWidth(0) - inset;
  if (spec.base > 0 && inset === 0) left.push(-foot, bottom);
  if (spec.cup > 0) left.push(-foot * 0.5, bottom + spec.cup * 0.7, 0, bottom + spec.cup - inset * 0.5, foot * 0.5, bottom + spec.cup * 0.7);
  const right: number[] = [];
  if (spec.base > 0 && inset === 0) right.push(foot, bottom);
  for (let i = 0; i <= steps; i++) {
    const u = top * i / steps;
    right.push(spec.halfWidth(u) - inset, y(u));
  }
  return [...left, ...right];
}

/** Hairline cracks, as fractions across the bowl and up it, starting at the rim that takes the clinks. */
const CRACKS: readonly (readonly (readonly [number, number])[])[] = [
  [[-0.92, 0.96], [-0.62, 0.82], [-0.78, 0.7], [-0.5, 0.58]],
  [[-0.7, 1], [-0.36, 0.9], [-0.46, 0.76], [-0.18, 0.66], [-0.3, 0.52]],
  [[-0.98, 0.84], [-0.7, 0.62], [-0.86, 0.46]],
];

/** The pieces the right-hand bowl breaks into: corners as fractions across it and up it, and each one's throw. */
const SHARDS: readonly { readonly corners: readonly (readonly [number, number])[]; readonly vx: number; readonly vy: number; readonly spin: number }[] = [
  { corners: [[-1, 1], [-0.3, 1], [-0.55, 0.72]], vx: -60, vy: -340, spin: -7 },
  { corners: [[-0.3, 1], [0.4, 1], [0.05, 0.78]], vx: 40, vy: -420, spin: 9 },
  { corners: [[0.4, 1], [1, 1], [0.8, 0.7], [0.45, 0.8]], vx: 160, vy: -360, spin: 6 },
  { corners: [[-1, 0.72], [-0.55, 0.72], [-0.6, 0.45], [-1, 0.5]], vx: -120, vy: -220, spin: -10 },
  { corners: [[-0.5, 0.74], [0.1, 0.78], [-0.1, 0.5]], vx: 30, vy: -260, spin: 12 },
  { corners: [[0.1, 0.78], [0.8, 0.7], [0.55, 0.48], [0.15, 0.55]], vx: 200, vy: -240, spin: -8 },
  { corners: [[-0.6, 0.45], [0, 0.5], [-0.3, 0.32]], vx: -30, vy: -150, spin: 11 },
  { corners: [[0, 0.5], [0.6, 0.48], [0.35, 0.3]], vx: 120, vy: -170, spin: -12 },
];
/** What is left on the stem: the bowl below this, under a jagged edge. */
const REMNANT = 0.42;

/**
 * Two people clink glasses on every beat. Judged hits light the room — a festoon of bulbs,
 * or the candles on the mantel — and every mistake leaves a hairline crack in the right-hand
 * glass. A clean round ends on one more clink, the glasses raised and "Cheers!" going up; a
 * rough one ends with the cracked glass shattering on the contact and its drink on the cloth.
 */
export class GlassesVignette extends HouseholdVignette {
  private readonly look: GlassesLook;
  private readonly spec: GlassSpec;
  /** "Cheers!", lettered once at creation and only posed after: no raster on a coda's frame. */
  private readonly cheer: Phaser.GameObjects.Text;
  private errors = 0;
  /** Bursts fired once per task: the confetti of a toast, and the glass of a break. */
  private toasted = false;
  private shattered = false;

  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = glassesLook(lap);
    super(scene, look.paper, look.glow, { card: CARD });
    this.look = look;
    this.spec = GLASSES[look.glass];
    this.cheer = display(scene, 'Cheers!', { size: 64, colour: look.cheer, align: 'center' }).setOrigin(0.5).setVisible(false);
    this.stage.add(this.cheer);
  }

  public override reset(plan: RoundPlan): void {
    super.reset(plan);
    this.errors = 0;
    this.toasted = this.shattered = false;
  }

  public override onAccuracy(result: Judgement, now: number): void {
    const before = this.hitTimes.length;
    const respond = this.phase === 'respond';
    super.onAccuracy(result, now);
    if (!respond) return;
    if (this.hitTimes.length > before) {
      // A judged clink throws a little of the drink up off the rims.
      this.throwBits('droplets', 0, this.spec.contactY - 6, [this.look.drinkLight, 0xffffff], 3);
    } else {
      this.errors++;
    }
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear(), look = this.look, spec = this.spec;
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const ended = ending >= 0;
    const toast = ended && this.successful;
    const smash = ended && !this.successful;
    // The coda's clink lands on the contact; before it, every clink is a beat's.
    const age = ended ? ending : now - this.strikeAt;
    // The clink is the action the player copies, so it plays under reduced motion too.
    const swing = toast ? 1 : clinkSwing(age, beat);
    const lift = toast ? toastLift(ending, this.still) : 0;
    const hits = this.watching ? 0 : this.hitTimes.length;
    const lights = this.lightCount();
    const lit = lightsLit(hits, this.plan?.targets.length ?? 4, lights, ending, this.successful, this.still);
    const gone = smash && broken(ending, this.still);
    // Once the glass breaks, the other one jolts back from it.
    const jolt = gone && !this.still ? Math.sin((ending - GLASS_BREAK_AT) * 60) * Math.exp(-(ending - GLASS_BREAK_AT) * 9) * 6 : 0;

    this.room(now, lit);
    this.table();
    const rest = glassPose(spec, -1, swing, lift);
    const left = { ...rest, x: rest.x + jolt };
    const right = glassPose(spec, 1, swing, lift);
    const tilt = this.still ? 0 : slosh(age);
    this.arm(left, -1, look.left);
    this.arm(right, 1, look.right);
    this.glass(left, -1, tilt, 0, false, look.left, now);
    this.glass(right, 1, -tilt, cracksShown(this.errors), gone, look.right, now);

    if (!gone && !this.still) {
      const shine = clinkShine(age);
      if (shine > 0) {
        sparkle(g, 0, spec.contactY - lift * 16 - 4, 10 + 18 * shine, shine);
        g.lineStyle(3, 0xfff6d8, shine * 0.8);
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k - 2.5) * 0.42, r0 = 18 + (1 - shine) * 10, r1 = 30 + (1 - shine) * 22;
          g.lineBetween(Math.cos(a) * r0, spec.contactY + Math.sin(a) * r0, Math.cos(a) * r1, spec.contactY + Math.sin(a) * r1);
        }
      }
    }
    if (gone) this.wreck(right, ending);
    this.cheers(toast ? cheerPop(ending, this.still) : 0, lift, ending);
    // The card's own edge, over the room that was painted to it.
    g.lineStyle(STYLE.current.outline * 0.6, HOME_INK).strokeRoundedRect(CARD.x, CARD.y, CARD.width, CARD.height, CARD.radius);
  }

  private lightCount(): number {
    return this.look.lights === 'festoon' ? 7 : 6;
  }

  /** The wall or the sky behind, and the lights the hits switch on. */
  private room(now: number, lit: number): void {
    const g = this.art, look = this.look;
    g.fillStyle(look.wallTop).fillRoundedRect(CARD.x, CARD.y, CARD.width, CARD.height, CARD.radius);
    const top = CARD.y + CARD.radius, bands = 7;
    for (let k = 0; k < bands; k++) {
      const y0 = top + (TABLE_Y - top) * k / bands;
      g.fillStyle(mix(look.wallTop, look.wallLow, (k + 1) / bands)).fillRect(CARD.x, y0, CARD.width, (TABLE_Y - top) / bands + 1);
    }

    if (look.scene === 'party') {
      // An evening room out of focus: soft discs of light, the party's colours.
      const bokeh = [[-268, -120, 34, 0xffd27a], [-170, -40, 22, 0xf59ab0], [-226, 40, 28, 0xffe6a8], [-90, -150, 18, 0x9fd3f0],
        [120, -150, 26, 0xf59ab0], [210, -60, 36, 0xffd27a], [280, 20, 22, 0x9fd3f0], [150, 40, 18, 0xffe6a8], [-40, 60, 24, 0xffd27a], [60, -40, 14, 0xffffff]] as const;
      for (const [x, y, r, colour] of bokeh) {
        g.fillStyle(colour, 0.1).fillCircle(x, y, r * 1.5);
        g.fillStyle(colour, 0.2).fillCircle(x, y, r);
      }
      // Paper streamers looped from the top corners.
      for (const side of [-1, 1]) {
        g.lineStyle(6, side < 0 ? 0xf59ab0 : 0x9fd3f0, 0.9);
        traceContour(g, cubicContour(side * 330, -150, [[side * 300, -120, side * 260, -110, side * 236, -140], [side * 216, -112, side * 180, -104, side * 150, -132]]));
        g.strokePath();
      }
    } else if (look.scene === 'terrace') {
      // The sun going down behind far hills, and a stone balustrade at the terrace's edge.
      g.fillStyle(0xffe6b0, 0.35).fillCircle(-170, 10, 74);
      g.fillStyle(0xffd88a).fillCircle(-170, 10, 46);
      g.fillStyle(0xb98fae).fillEllipse(-180, 50, 300, 80).fillEllipse(150, 56, 360, 70);
      g.fillStyle(0x9a7aa0).fillEllipse(250, 64, 160, 50);
      const stone = 0xf0e2c8;
      for (let x = CARD.x + 22; x + 16 <= -CARD.x; x += 42) {
        shape(g, cubicContour(x - 8, 70, [[x - 16, 86, x - 16, 104, x - 9, 112], [x - 4, 120, x + 4, 120, x + 9, 112], [x + 16, 104, x + 16, 86, x + 8, 70]]), stone, shade(stone, -0.5), 2.5);
      }
      g.fillStyle(stone).fillRect(CARD.x, 54, CARD.width, 18);
      g.lineStyle(3, shade(stone, -0.5)).lineBetween(CARD.x, 54, -CARD.x, 54).lineBetween(CARD.x, 72, -CARD.x, 72);
      g.fillStyle(shade(stone, 0.25), 0.9).fillRect(CARD.x, 57, CARD.width, 4);
    } else {
      // Wallpaper in two greens, and a mantelpiece for the candles.
      g.fillStyle(shade(look.wallLow, 0.06), 0.55);
      // Kept clear of the card's rounded corners: nothing clips the stage.
      for (let x = CARD.x + 34; x + 22 <= -CARD.x - CARD.radius; x += 56) g.fillRect(x, CARD.y + 6, 22, TABLE_Y - CARD.y);
      g.fillStyle(shade(look.wallLow, 0.18), 0.35);
      for (let x = CARD.x + 62; x + 9 <= -CARD.x - CARD.radius; x += 56) {
        for (let y = -190; y < 120; y += 64) g.fillTriangle(x, y - 12, x + 9, y, x, y + 12).fillTriangle(x, y - 12, x - 9, y, x, y + 12);
      }
      const wood = 0x8a5a3a;
      g.fillStyle(shade(wood, -0.3), 0.5).fillRect(CARD.x, -110, CARD.width, 14);
      g.fillStyle(wood).fillRect(CARD.x, -126, CARD.width, 18);
      g.fillStyle(shade(wood, 0.25)).fillRect(CARD.x, -126, CARD.width, 5);
      g.lineStyle(3, HOME_INK).lineBetween(CARD.x, -108, -CARD.x, -108);
    }
    if (this.look.lights === 'festoon') this.festoon(lit);
    else this.candles(now, lit);
  }

  /** The order the lights come on: from the ends inward, so the middle one waits for the end. */
  private static order(count: number): number[] {
    const order: number[] = [];
    for (let k = 0; order.length < count; k++) {
      order.push(k);
      if (order.length < count) order.push(count - 1 - k);
    }
    return order.filter((v, i, all) => all.indexOf(v) === i);
  }

  private festoon(lit: number): void {
    const g = this.art, look = this.look;
    const wire = (x: number): number => -204 + 34 * (1 - (x / 332) ** 2);
    g.lineStyle(3, 0x2c2430);
    const points: number[] = [];
    for (let k = 0; k <= 40; k++) points.push(-328 + k * 16.4, wire(-328 + k * 16.4));
    traceContour(g, points);
    g.strokePath();
    const order = GlassesVignette.order(7);
    for (let i = 0; i < 7; i++) {
      const x = -276 + i * 92, y = wire(x);
      const on = order.indexOf(i) < lit;
      g.fillStyle(0x3a3236).fillRoundedRect(x - 5, y, 10, 10, 3);
      if (on) {
        g.fillStyle(look.lit, 0.14).fillCircle(x, y + 20, 46);
        g.fillStyle(look.lit, 0.24).fillCircle(x, y + 20, 30);
        g.fillStyle(look.lit, 0.4).fillCircle(x, y + 20, 18);
      }
      g.fillStyle(on ? look.lit : UNLIT).fillEllipse(x, y + 20, 16, 20);
      g.lineStyle(2.5, HOME_INK).strokeEllipse(x, y + 20, 16, 20);
      g.fillStyle(0xffffff, on ? 0.85 : 0.5).fillEllipse(x - 3, y + 15, 4, 6);
    }
  }

  private candles(now: number, lit: number): void {
    const g = this.art, look = this.look;
    const xs = [-270, -190, -110, 110, 190, 270];
    const order = GlassesVignette.order(xs.length);
    for (const [i, x] of xs.entries()) {
      const h = 52 + (i % 3) * 10, top = -126 - h;
      const on = order.indexOf(i) < lit;
      if (on) {
        g.fillStyle(look.lit, 0.14).fillCircle(x, top - 14, 46);
        g.fillStyle(look.lit, 0.24).fillCircle(x, top - 14, 26);
      }
      g.fillStyle(0xd6b46a).fillEllipse(x, -128, 34, 10);
      g.lineStyle(2.5, HOME_INK).strokeEllipse(x, -128, 34, 10);
      g.fillStyle(0xf6eedc).fillRoundedRect(x - 9, top, 18, h, 4);
      g.lineStyle(2.5, HOME_INK).strokeRoundedRect(x - 9, top, 18, h, 4);
      g.fillStyle(0xffffff, 0.6).fillRect(x - 6, top + 4, 4, h - 10);
      g.lineStyle(2.5, 0x2c2430).lineBetween(x, top, x, top - 7);
      if (on) {
        const flicker = this.still ? 1 : 1 + Math.sin(now * 13 + i * 2) * 0.08;
        shape(g, cubicContour(x, top - 4, [[x - 9, top - 12, x - 4, top - 24 * flicker, x, top - 32 * flicker], [x + 4, top - 24 * flicker, x + 9, top - 12, x, top - 4]]), look.lit, shade(look.lit, -0.45), 2);
        g.fillStyle(0xfff6d8).fillEllipse(x, top - 11, 5, 9);
      }
    }
  }

  /** The table the toast is made over: the cloth's top, its front, and its pattern. */
  private table(): void {
    const g = this.art, look = this.look;
    const bottom = CARD.y + CARD.height;
    g.fillStyle(look.clothShade).fillRoundedRect(CARD.x, CLOTH_FRONT, CARD.width, bottom - CLOTH_FRONT, { tl: 0, tr: 0, bl: CARD.radius, br: CARD.radius });
    g.fillStyle(look.cloth).fillRect(CARD.x, TABLE_Y, CARD.width, CLOTH_FRONT - TABLE_Y);
    g.fillStyle(0xffffff, 0.45).fillRect(CARD.x, TABLE_Y, CARD.width, 4);
    if (look.scene === 'terrace') {
      // Gingham: squares in the pattern's colour, darker where the stripes cross.
      // Short of the rounded corners at the cloth's foot, since nothing clips the stage.
      const corner = bottom - CARD.radius;
      for (let x = CARD.x; x + 14 <= -CARD.x; x += 28) {
        const inCorner = x < CARD.x + CARD.radius || x + 14 > -CARD.x - CARD.radius;
        g.fillStyle(look.clothPattern, 0.35).fillRect(x, TABLE_Y, 14, CLOTH_FRONT - TABLE_Y).fillRect(x, CLOTH_FRONT, 14, (inCorner ? corner : bottom - 8) - CLOTH_FRONT);
      }
      for (let y = CLOTH_FRONT + 4; y < bottom - 8; y += 28) {
        const inset = y + 14 > corner ? CARD.radius : 0;
        g.fillStyle(look.clothPattern, 0.3).fillRect(CARD.x + inset, y, CARD.width - inset * 2, 14);
      }
    } else if (look.scene === 'dinner') {
      g.fillStyle(look.clothPattern).fillRect(-80, TABLE_Y, 160, CLOTH_FRONT - TABLE_Y).fillRect(-80, CLOTH_FRONT, 160, bottom - CLOTH_FRONT - 6);
      g.fillStyle(0xd9b45a).fillRect(-80, bottom - 32, 160, 6);
    } else {
      // Confetti left on the cloth from earlier.
      const bits = [[-260, 146, 0xf59ab0], [-200, 152, 0x9fd3f0], [-120, 144, 0xe0b85a], [-40, 154, 0xf59ab0], [70, 146, 0x9fd3f0], [150, 152, 0xe0b85a], [230, 144, 0xf59ab0], [290, 154, 0x9fd3f0]] as const;
      for (const [x, y, colour] of bits) g.fillStyle(colour).fillRoundedRect(x, y, 9, 5, 2);
    }
    // The cloth's folds, and the line where its top turns down into its front.
    g.lineStyle(3, shade(look.clothShade, -0.12), 0.7);
    for (const x of [-250, -150, -40, 70, 180, 280]) g.lineBetween(x, CLOTH_FRONT + 10, x - 6, bottom - 6);
    g.lineStyle(3, HOME_INK, 0.6).lineBetween(CARD.x, CLOTH_FRONT, -CARD.x, CLOTH_FRONT);
  }

  /** A point in a glass's frame, in stage units. */
  private static at(pose: GlassPose, lx: number, ly: number): [number, number] {
    const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
    const x = lx * GLASS_SCALE, y = ly * GLASS_SCALE;
    return [pose.x + x * c - y * s, pose.y + x * s + y * c];
  }

  /**
   * The arm that holds a glass, from its fist to the card's side. Cut square at the card's
   * edge rather than run past it, since nothing clips the stage.
   */
  private arm(pose: GlassPose, side: -1 | 1, who: Toaster): void {
    const g = this.art;
    const [wx, wy] = GlassesVignette.at(pose, side * (this.spec.gripOut + 30), 18);
    const edge = side * (-CARD.x - 1);
    // Out to the card's side above its rounded corner, so the sleeve never crosses the frame.
    const ex = edge, ey = Math.min(wy + 96, CARD.y + CARD.height - CARD.radius - 34);
    const length = Math.hypot(ex - wx, ey - wy), dx = (ex - wx) / length, dy = (ey - wy) / length;
    const nx = -dy, ny = dx;
    const quad = (width: number, from: number, to?: number): number[] => {
      const hw = width / 2;
      const end = (ox: number, oy: number): [number, number] => {
        if (to !== undefined) return [wx + dx * to + ox, wy + dy * to + oy];
        const t = (edge - (wx + ox)) / dx;
        return [wx + ox + dx * t, wy + oy + dy * t];
      };
      const a = end(nx * hw, ny * hw), b = end(-nx * hw, -ny * hw);
      return [wx + dx * from + nx * hw, wy + dy * from + ny * hw, ...a, ...b, wx + dx * from - nx * hw, wy + dy * from - ny * hw];
    };
    const sleeve = quad(50, 4);
    g.fillStyle(who.sleeve);
    fillContour(g, sleeve);
    g.lineStyle(STYLE.current.outline * 0.6, HOME_INK);
    g.lineBetween(sleeve[0]!, sleeve[1]!, sleeve[2]!, sleeve[3]!).lineBetween(sleeve[4]!, sleeve[5]!, sleeve[6]!, sleeve[7]!);
    // A fold of light along the sleeve's upper edge.
    g.lineStyle(5, shade(who.sleeve, 0.22), 0.8).lineBetween(sleeve[0]! - nx * 8, sleeve[1]! - ny * 8, sleeve[2]! - nx * 8, sleeve[3]! - ny * 8);
    // The wrist, and the cuff or the bangle at it.
    shape(g, quad(30, -6, 18), who.skin, HOME_INK, 3);
    shape(g, quad(52, 14, 30), who.cuff, HOME_INK, 3);
  }

  /** One glass and the fist round it, drawn in the glass's own frame. */
  private glass(pose: GlassPose, side: -1 | 1, tilt: number, cracks: number, gone: boolean, who: Toaster, now: number): void {
    const g = this.art, look = this.look, spec = this.spec;
    const tint = mix(0xffffff, look.wallLow, 0.18);
    g.save();
    g.translateCanvas(pose.x, pose.y);
    g.rotateCanvas(pose.angle);
    g.scaleCanvas(GLASS_SCALE, GLASS_SCALE);

    // The foot and the stem, glass with an inked edge.
    if (spec.foot) {
      g.fillStyle(tint, 0.85).fillEllipse(0, spec.foot.y, spec.foot.rx * 2, spec.foot.ry * 2);
      g.lineStyle(3.5, HOME_INK).strokeEllipse(0, spec.foot.y, spec.foot.rx * 2, spec.foot.ry * 2);
      g.fillStyle(0xffffff, 0.7).fillEllipse(-spec.foot.rx * 0.4, spec.foot.y - 2, spec.foot.rx * 0.6, 3);
    }
    if (spec.stem) {
      g.lineStyle(12, HOME_INK).lineBetween(0, spec.stem.top, 0, spec.stem.bottom);
      g.lineStyle(6, tint).lineBetween(0, spec.stem.top, 0, spec.stem.bottom);
      g.lineStyle(2, 0xffffff, 0.8).lineBetween(-1.5, spec.stem.top + 6, -1.5, spec.stem.bottom - 6);
    }

    if (gone) {
      this.remnant();
    } else {
      const outer = bowl(spec);
      g.fillStyle(tint, 0.28);
      fillContour(g, outer);
      this.drink(pose.angle, tilt, now);
      // Light on the glass: a long streak down the lit side and a short one on the other.
      const streak = (fx: number, from: number, to: number, width: number, alpha: number): void => {
        const pts: number[] = [];
        for (let i = 0; i <= 8; i++) {
          const u = from + (to - from) * i / 8;
          pts.push(fx * spec.halfWidth(u), spec.floor - u * (spec.floor - spec.rim));
        }
        g.lineStyle(width, 0xffffff, alpha);
        traceContour(g, pts);
        g.strokePath();
      };
      streak(-0.7, 0.18, 0.9, 5, 0.75);
      streak(0.72, 0.4, 0.62, 3, 0.55);
      this.cracks(cracks);
      g.lineStyle(STYLE.current.outline * 0.55, HOME_INK);
      traceContour(g, outer);
      g.strokePath();
      // The rim, seen from a little above.
      const w = spec.halfWidth(1);
      g.fillStyle(0xffffff, 0.35).fillEllipse(0, spec.rim, w * 2, 9);
      g.lineStyle(3, HOME_INK).strokeEllipse(0, spec.rim, w * 2, 9);
      if (look.glass === 'tumbler') this.lemon(side, w);
    }
    this.fist(side, who);
    g.restore();
  }

  /** The drink, level in the room whatever the glass's lean, rocking after each clink. */
  private drink(angle: number, tilt: number, now: number): void {
    const g = this.art, look = this.look, spec = this.spec;
    const inner = bowl(spec, 4);
    const surface = spec.floor - spec.fill * (spec.floor - spec.rim);
    const m = Math.tan(-angle + tilt);
    const liquid = clipToLine(inner, surface, m, true);
    if (liquid.length < 6) return;
    g.fillStyle(look.drink);
    fillContour(g, liquid);
    // Deeper in the glass, the drink is darker.
    const deep = clipToLine(liquid, surface + (spec.floor - surface) * 0.5, m, true);
    if (deep.length >= 6) {
      g.fillStyle(look.drinkDark, 0.35);
      fillContour(g, deep);
    }
    // The surface: a bright band along the waterline.
    const hw = spec.halfWidth(Math.max(0, Math.min(1, (spec.floor - surface) / (spec.floor - spec.rim)))) - 5;
    g.lineStyle(5, look.drinkLight).lineBetween(-hw, surface - m * hw, hw, surface + m * hw);
    if (look.glass === 'tumbler') {
      // Ice, riding at the top.
      for (const [x, size] of [[-14, 24], [16, 20]] as const) {
        const y = surface + m * x + 4;
        g.fillStyle(0xffffff, 0.55).fillRoundedRect(x - size / 2, y - size * 0.3, size, size * 0.8, 5);
        g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(x - size / 2, y - size * 0.3, size, size * 0.8, 5);
      }
    }
    if (look.glass !== 'goblet') {
      // Bubbles rising through it, on their own clock; still under reduced motion.
      const depth = spec.floor - surface;
      const clock = this.still ? 0 : now;
      for (let k = 0; k < 9; k++) {
        const rise = ((clock * 46 + k * 31) % depth + depth) % depth;
        const y = spec.floor - 6 - rise;
        const u = (spec.floor - y) / (spec.floor - spec.rim);
        const x = (((k * 0.37) % 1) - 0.5) * 2 * Math.max(0, spec.halfWidth(u) - 10);
        if (y < surface + m * x + 4) continue;
        g.fillStyle(0xffffff, 0.75).fillCircle(x, y, 1.6 + (k % 3) * 0.7);
      }
    }
  }

  /** A lemon wheel slotted on a tumbler's rim, on the side away from the clink. */
  private lemon(side: -1 | 1, w: number): void {
    const g = this.art, spec = this.spec;
    const x = side * (w - 6), y = spec.rim + 10;
    g.fillStyle(0xf7e06a).fillCircle(x, y, 19);
    g.lineStyle(3, HOME_INK).strokeCircle(x, y, 19);
    g.fillStyle(0xfff6c4).fillCircle(x, y, 14);
    g.lineStyle(2, 0xf2cf3a);
    for (let k = 0; k < 6; k++) g.lineBetween(x, y, x + Math.cos(k * Math.PI / 3) * 13, y + Math.sin(k * Math.PI / 3) * 13);
  }

  /** The hairline cracks a round's mistakes have left, at the rim that takes the clinks. */
  private cracks(count: number): void {
    if (count <= 0) return;
    const g = this.art, spec = this.spec;
    for (const crack of CRACKS.slice(0, count)) {
      const pts = crack.flatMap(([fx, u]) => [fx * spec.halfWidth(u), spec.floor - u * (spec.floor - spec.rim)]);
      g.lineStyle(3.5, HOME_INK, 0.35);
      traceContour(g, pts);
      g.strokePath();
      g.lineStyle(2, CRACK, 0.95);
      traceContour(g, pts);
      g.strokePath();
    }
  }

  /** What is left in the fist once the bowl has gone: its foot, under a jagged edge. */
  private remnant(): void {
    const g = this.art, spec = this.spec, look = this.look;
    const cut = spec.floor - REMNANT * (spec.floor - spec.rim);
    // A saw-tooth along the cut, right to left, so it reads as broken and not as a shorter glass.
    const w = spec.halfWidth(REMNANT);
    const teeth: number[] = [];
    for (let k = 5; k >= 1; k--) teeth.push(-w + (2 * w) * k / 6, cut - (k % 2 ? 18 : -6) - (k === 3 ? 8 : 0));
    const piece = [...bowl(spec, 0, 8, REMNANT), ...teeth];
    g.fillStyle(mix(0xffffff, look.wallLow, 0.18), 0.4);
    fillContour(g, piece);
    g.lineStyle(STYLE.current.outline * 0.55, HOME_INK);
    traceContour(g, piece);
    g.closePath().strokePath();
  }

  /** The fist round the stem or the glass: palm outward, fingers curled across, thumb on top. */
  private fist(side: -1 | 1, who: Toaster): void {
    const g = this.art, spec = this.spec;
    const box = (x: number, y: number, w: number, h: number, r: number, colour: number): void => {
      const left = side < 0 ? x : -(x + w);
      g.fillStyle(colour).fillRoundedRect(left, y, w, h, r);
      g.lineStyle(3, HOME_INK).strokeRoundedRect(left, y, w, h, r);
    };
    const out = -spec.gripOut;
    box(out - 36, -24, 42, 58, 17, who.skin);
    for (let j = 0; j < 4; j++) box(out - 6, -20 + j * 13, 24, 14, 7, shade(who.skin, j % 2 ? -0.04 : 0));
    box(out - 26, -36, 32, 17, 8.5, shade(who.skin, 0.06));
    g.fillStyle(shade(who.skin, 0.25), 0.7).fillEllipse(side * -(out - 22), -6, 10, 22);
  }

  /** The rough coda's wreck: shards thrown from the bowl to the cloth, and the drink after them. */
  private wreck(pose: GlassPose, ending: number): void {
    const g = this.art, look = this.look, spec = this.spec;
    const age = Math.max(0, ending - GLASS_BREAK_AT);
    const y = (u: number): number => spec.floor - u * (spec.floor - spec.rim);
    if (!this.shattered) {
      this.shattered = true;
      const [cx, cy] = GlassesVignette.at(pose, 0, y(0.6));
      this.throwBits('splinters', cx, cy, [SHARD, 0xffffff], 10);
      this.throwBits('droplets', cx, cy, [look.drink, look.drinkLight], 8);
    }
    // The drink drops out of the bowl as one body and lands as a puddle on the cloth.
    const [sx, sy] = GlassesVignette.at(pose, 0, y(spec.fill * 0.5));
    const landX = sx + 30, landY = TABLE_Y + 14;
    const fall = spillFall(ending, this.still), spread = puddleSpread(ending, this.still);
    if (spread <= 0) {
      const x = sx + (landX - sx) * fall, yy = sy + (landY - sy) * fall;
      shape(g, cubicContour(x, yy - 28 - fall * 18, [[x + 18, yy - 10, x + 20, yy + 14, x, yy + 16], [x - 20, yy + 14, x - 18, yy - 10, x, yy - 28 - fall * 18]]), look.drink, shade(look.drink, -0.45), 3);
      g.fillStyle(look.drinkLight, 0.8).fillEllipse(x - 6, yy - 4, 6, 12);
    } else {
      const w = 70 + 110 * spread;
      g.fillStyle(look.drink, 0.9).fillEllipse(landX, landY, w, 14 + 10 * spread);
      for (let k = 0; k < 5; k++) g.fillCircle(landX - w * 0.42 + k * w * 0.21, landY + (k % 2 ? 4 : -3), 6 + (k % 2) * 3);
      g.fillStyle(look.drinkLight, 0.7).fillEllipse(landX - w * 0.18, landY - 3, w * 0.3, 4);
    }
    // The shards, each from its place on the bowl.
    for (const [index, shard] of SHARDS.entries()) {
      const corners = shard.corners.map(([fx, u]) => GlassesVignette.at(pose, fx * spec.halfWidth(u), y(u)));
      const cx = corners.reduce((s, [x]) => s + x, 0) / corners.length;
      const cy = corners.reduce((s, [, yy]) => s + yy, 0) / corners.length;
      const p = this.still
        ? shardPose(cy, shard.vx, shard.vy, shard.spin, TABLE_Y + 6 + (index % 3) * 7, 5)
        : shardPose(cy, shard.vx, shard.vy, shard.spin, TABLE_Y + 6 + (index % 3) * 7, age);
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      const pts = corners.flatMap(([x, yy]) => [cx + p.dx + (x - cx) * c - (yy - cy) * s, cy + p.dy + (x - cx) * s + (yy - cy) * c]);
      g.fillStyle(SHARD, 0.9);
      fillContour(g, pts);
      g.lineStyle(2.5, HOME_INK);
      traceContour(g, pts);
      g.closePath().strokePath();
      g.lineStyle(1.5, 0xffffff, 0.9).lineBetween(pts[0]!, pts[1]!, (pts[2]! + pts[0]!) / 2, (pts[3]! + pts[1]!) / 2);
    }
  }

  /** "Cheers!" in a speech bubble, growing out of the clink and settling above it. */
  private cheers(pop: number, lift: number, ending: number): void {
    const g = this.art, look = this.look, spec = this.spec;
    if (pop <= 0.01) {
      this.cheer.setVisible(false);
      return;
    }
    const tipY = spec.contactY - lift * 16 - 16;
    const centreY = Math.max(CARD.y + 50, tipY - 62);
    const at = (y: number): number => tipY + (y - tipY) * pop;
    const w = 260 * pop, h = 78 * pop;
    const cy = at(centreY);
    g.fillStyle(shade(look.wallTop, -0.4), 0.25).fillRoundedRect(-w / 2 + 6, cy - h / 2 + 6, w, h, h / 2);
    g.fillStyle(SHELL.cream).fillRoundedRect(-w / 2, cy - h / 2, w, h, h / 2);
    g.fillTriangle(-16 * pop, cy + h / 2 - 2, 16 * pop, cy + h / 2 - 2, 0, tipY);
    g.lineStyle(STYLE.current.outline * 0.55, HOME_INK).strokeRoundedRect(-w / 2, cy - h / 2, w, h, h / 2);
    g.lineBetween(-16 * pop, cy + h / 2, 0, tipY).lineBetween(16 * pop, cy + h / 2, 0, tipY);
    g.fillStyle(SHELL.cream).fillRect(-14 * pop, cy + h / 2 - 4, 28 * pop, 5);
    g.fillStyle(0xffffff, 0.8).fillRoundedRect(-w / 2 + 18 * pop, cy - h / 2 + 8 * pop, 50 * pop, 8 * pop, 4 * pop);
    this.cheer.setVisible(true).setPosition(0, cy).setScale(0.8 * pop).setAlpha(Math.min(1, pop * 3));
    if (!this.toasted && !this.still && ending >= CHEER_AT) {
      this.toasted = true;
      // From either end of the bubble, so the confetti frames the word rather than covering it.
      for (const side of [-1, 1]) this.throwBits('confetti', side * 120, centreY, [look.lit, look.cheer, look.drink, 0xffffff], 10);
      this.stage.bringToTop(this.cheer);
    }
    if (ending > 0.35) {
      const a = Math.min(1, (ending - 0.35) * 4);
      const twinkle = this.still ? 1 : 0.75 + 0.25 * Math.sin(ending * 9);
      sparkle(g, -w / 2 - 22, cy - 18, 13 * twinkle, a);
      sparkle(g, w / 2 + 20, cy - 26, 10 * twinkle, a);
      sparkle(g, w / 2 + 6, cy + 30, 8 * twinkle, a * 0.8);
    }
  }
}
