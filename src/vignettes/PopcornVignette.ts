import type Phaser from 'phaser';
import { shade } from '@/ui/colour';
import { fillContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab } from './householdArt';
import {
  BOWL, CROWN, demoHop, flight, HEAP, launchPoint, launchTimes, PAN, panJolt, POPCORN_MOTION, popcornFinale,
} from './popcornMotion';
import { popcornLook, type PopcornLook } from './popcornLooks';
import { celebration } from './treatArt';

export const POPCORN_INK = 0x4a3a2c;

/** How deep the bowl is below its mouth, and how much it narrows to its foot. */
const BOWL_DEPTH = 72;
const BOWL_TAPER = 0.32;
const PAN_DEPTH = 64;
const STEEL = { face: 0xbcc5cc, shade: 0x8b959d, edge: 0x4e575e, inside: 0x3b3f44 } as const;
const COUNTER = { top: 104, front: 200 } as const;
const KERNEL = { face: 0xe8a63a, edge: 0x9a6014 } as const;

interface Point { readonly x: number; readonly y: number }

/**
 * Popcorn: every judged hit pops the pan, and what it pops arcs over into the bowl, which
 * fills layer by layer. The demonstration's kernels hop out and drop straight back in, so
 * the example never fills the bowl the player is about to. A clean round ends with one
 * enormous kernel that swells, bursts and crowns a full bowl; a rough one burns.
 */
export class PopcornVignette extends HouseholdVignette {
  private readonly look: PopcornLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xf1ebdc, 0xf6dfa6);
    this.look = popcornLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const targets = this.plan?.targets.length ?? 4;
    const finale = popcornFinale(ending, this.successful, this.still);
    const launches = launchTimes(this.watching ? [] : this.hitTimes, targets, this.finishAt, this.successful);
    // The big pop shakes the whole counter for a moment.
    if (finale.shake > 0) {
      this.stage.x += Math.sin(now * 90) * 9 * finale.shake;
      this.stage.y += Math.cos(now * 75) * 6 * finale.shake;
    }
    const jolt = panJolt(now - this.strikeAt, beat) + (this.still ? 0 : Math.sin(now * 70) * 0.35 * finale.swell);

    this.kitchen();
    this.pan(jolt, now, finale.swell);
    if (this.watching) this.demoKernel(now - this.strikeAt, beat);
    if (finale.swell > 0) this.giantKernel(finale.swell, now);

    // The bowl's back and inside, the heap, then its front over the lower pieces.
    this.bowlBack();
    const flying: [number, ReturnType<typeof flight>][] = [];
    HEAP.forEach((slot, i) => {
      const age = now - launches[i]!;
      if (age < 0) return;
      const arc = flight(age, launchPoint(i), slot);
      const inside = slot.y > BOWL.y - 8 && age > POPCORN_MOTION.flightSec * 0.78;
      if (arc.landed) this.piece(slot.x, slot.y, 1, slot.turn, arc.squash);
      else if (inside) this.piece(arc.x, arc.y, 1, slot.turn + age * 9, 0);
      else flying.push([i, arc]);
    });
    this.bowlFront();
    for (const [i, arc] of flying) this.piece(arc.x, arc.y, 1, HEAP[i]!.turn + (now - launches[i]!) * 9, 0);

    this.popFlash(now - this.strikeAt, ending);
    if (ending >= 0 && this.successful) this.bigFinish(ending, finale.burst, now);
    if (finale.smoke > 0) this.smoke(finale.smoke);
    if (finale.burnt >= 0) this.burntKernel(finale.burnt, ending);
    const puff = now - this.errorAt;
    if (puff >= 0 && puff < 0.45 && ending < 0) this.steamPuff(puff / 0.45);
    if (ending >= 0 && this.successful) celebration(g, ending, this.still);
  }

  // ------------------------------------------------------------------ The kitchen

  private kitchen(): void {
    const g = this.art, look = this.look;
    slab(g, -340, -228, 680, 460, look.wall, 34, shade(look.wall, -0.42));
    // Tiles on the wall, then the worktop and its front edge.
    g.lineStyle(2, look.tile, 0.9);
    for (let y = -190; y < COUNTER.top; y += 42) g.lineBetween(-326, y, 326, y);
    for (let row = 0; row < 8; row++) {
      const y = -232 + row * 42, offset = row % 2 ? 21 : 0;
      for (let x = -318 + offset; x < 326; x += 42) if (y + 42 > -222 && y < COUNTER.top) g.lineBetween(x, Math.max(-222, y), x, Math.min(COUNTER.top, y + 42));
    }
    g.fillStyle(0xd8b384).fillRect(-326, COUNTER.top, 652, COUNTER.front - COUNTER.top);
    g.lineStyle(2, 0xc19a68, 0.7);
    for (const y of [124, 148, 176]) g.lineBetween(-326, y, 326, y + 4);
    g.fillStyle(0xb58450).fillRect(-326, COUNTER.front, 652, 26);
    g.fillStyle(0x94683b).fillRect(-326, COUNTER.front + 26, 652, 4);
    g.lineStyle(3, 0x7a5430).lineBetween(-326, COUNTER.front, 326, COUNTER.front);
    g.lineStyle(3, shade(look.wall, -0.3)).lineBetween(-326, COUNTER.top, 326, COUNTER.top);
  }

  // ------------------------------------------------------------------ The pan

  private pan(jolt: number, now: number, swell: number): void {
    const g = this.art, x = PAN.x, lift = jolt * 7, y = PAN.y - lift;
    const tilt = jolt * 3;
    // Hob plate and the pan's shadow on it.
    g.fillStyle(0x3a2c20, 0.2).fillEllipse(x + 10, 158, 250, 26);
    slab(g, x - 104, 132, 208, 18, 0x2f3136, 8, 0x16171a);
    g.fillStyle(0x4a4d53).fillEllipse(x, 138, 150, 10);
    // The handle, out to the left: steel shank, black grip.
    g.lineStyle(12, STEEL.edge).lineBetween(x - 78, y + 16 + tilt, x - 168, y + 4 + tilt * 2);
    g.lineStyle(8, STEEL.face).lineBetween(x - 78, y + 16 + tilt, x - 168, y + 4 + tilt * 2);
    g.lineStyle(18, 0x1f2124).lineBetween(x - 124, y + 10 + tilt * 1.5, x - 176, y + 2 + tilt * 2);
    g.lineStyle(4, 0x4a4d53, 0.8).lineBetween(x - 128, y + 5 + tilt * 1.5, x - 172, y - 2 + tilt * 2);
    // The body as a short cylinder: sides, the front of its base, the front of its rim.
    const body: number[] = [];
    for (let k = 0; k <= 20; k++) {
      const a = Math.PI - k / 20 * Math.PI;
      body.push(x + Math.cos(a) * (PAN.rx - 4), y + PAN_DEPTH + Math.sin(a) * 14);
    }
    for (let k = 0; k <= 20; k++) {
      const a = k / 20 * Math.PI;
      body.push(x + Math.cos(a) * PAN.rx, y + Math.sin(a) * 16);
    }
    shape(g, body, STEEL.face, STEEL.edge, 3);
    g.fillStyle(STEEL.shade, 0.55).fillRect(x + 36, y + 12, 38, PAN_DEPTH - 6);
    g.fillStyle(0xffffff, 0.5).fillRect(x - 62, y + 14, 9, PAN_DEPTH - 10);
    // The mouth: dark inside, the far wall lit, a few kernels waiting in the oil.
    g.fillStyle(STEEL.inside).fillEllipse(x, y, PAN.rx * 2 - 6, 30);
    g.fillStyle(0x6d747b).fillEllipse(x, y - 5, PAN.rx * 2 - 16, 18);
    g.fillStyle(STEEL.inside).fillEllipse(x, y + 3, PAN.rx * 2 - 24, 20);
    const waiting = Math.max(0, 6 - Math.round(swell * 6));
    for (let k = 0; k < waiting; k++) {
      const kx = x - 40 + k * 16, ky = y + 4 + (k % 2) * 4;
      g.fillStyle(KERNEL.face).fillEllipse(kx, ky, 9, 6);
      g.fillStyle(0xfff0c0, 0.7).fillCircle(kx - 1.5, ky - 1, 1.5);
    }
    g.lineStyle(4, STEEL.edge).strokeEllipse(x, y, PAN.rx * 2, 32);
    this.ellipseArc(x, y + 2, PAN.rx - 6, 13, 0.15, 0.85, 2, 0xffffff, 0.6);
    // Blue flame licking round the front of the base.
    for (let k = 0; k < 9; k++) {
      const fx = x - 64 + k * 16, flicker = this.still ? 0 : Math.sin(now * 23 + k * 1.7) * 3;
      const base = 140, top = base - 12 - flicker - (k % 2) * 3;
      g.fillStyle(0x3f7fd9, 0.9).fillTriangle(fx - 6, base, fx + 6, base, fx, top);
      g.fillStyle(0xaed3ff, 0.9).fillTriangle(fx - 3, base, fx + 3, base, fx, top + 6);
    }
    // A little steam off the oil.
    if (!this.still) {
      for (let k = 0; k < 2; k++) {
        const p = (now * 0.45 + k * 0.5) % 1, sx = x - 20 + k * 40 + Math.sin(p * 6 + k) * 10;
        g.lineStyle(4, 0xffffff, 0.35 * Math.sin(p * Math.PI)).beginPath().arc(sx, y - 20 - p * 70, 10, Math.PI * 0.2, Math.PI * 1.2).strokePath();
      }
    }
  }

  /** The example's kernel: pops up out of the pan and falls straight back in. */
  private demoKernel(age: number, beat: number): void {
    const hop = demoHop(age, beat);
    if (hop < 0) return;
    this.piece(PAN.x + 6, PAN.y - 10 - hop * 70, 0.8, age * 7, 0);
  }

  /** A clean round's last kernel, swelling in the pan until it can hold no more. */
  private giantKernel(swell: number, now: number): void {
    const g = this.art;
    const wobble = this.still ? 0 : Math.sin(now * 40) * 0.07 * swell;
    const r = 9 + swell * 27, x = PAN.x, y = PAN.y - 6 - swell * 32;
    const sx = 0.85 * (1 + wobble), sy = 1 - wobble;
    // A kernel is a rounded crown tapering to the point it grew on.
    const outline: number[] = [];
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2, point = Math.max(0, Math.sin(a)) ** 3 * 0.3;
      outline.push(x + Math.cos(a) * r * sx * (1 - point), y + Math.sin(a) * r * sy * (1 + point * 0.8));
    }
    shape(g, outline, KERNEL.face, KERNEL.edge, 3);
    g.fillStyle(0xf6c35e).fillEllipse(x, y - r * 0.2, r * 1.1 * sx, r * 1.1 * sy);
    g.fillStyle(0xfff0c0, 0.75).fillEllipse(x - r * 0.35, y - r * 0.45, r * 0.4, r * 0.62);
    if (swell > 0.6) {
      // The white is starting to push through the husk.
      const bulge = (swell - 0.6) / 0.4;
      g.fillStyle(this.look.puff).fillCircle(x + r * 0.1, y - r * 0.75, r * 0.5 * bulge);
      g.fillStyle(this.look.puff).fillCircle(x - r * 0.3, y - r * 0.6, r * 0.36 * bulge);
    }
  }

  // ------------------------------------------------------------------ The bowl

  /** A point on the bowl's outside: `side` from -1 (left edge) through 0 (front) to 1, `depth` 0 rim → 1 foot. */
  private onBowl(side: number, depth: number): Point {
    const half = BOWL.rx * (1 - BOWL_TAPER * depth * depth);
    const a = side * Math.PI / 2;
    return { x: BOWL.x + half * Math.sin(a), y: BOWL.y + BOWL_DEPTH * depth + BOWL.ry * (half / BOWL.rx) * Math.cos(a) };
  }

  /** A band of the bowl between two sides and two depths, following its curve. */
  private band(from: number, to: number, top: number, bottom: number): number[] {
    const points: number[] = [];
    for (let k = 0; k <= 8; k++) { const p = this.onBowl(from, top + (bottom - top) * k / 8); points.push(p.x, p.y); }
    for (let k = 0; k <= 12; k++) { const p = this.onBowl(from + (to - from) * k / 12, bottom); points.push(p.x, p.y); }
    for (let k = 8; k >= 0; k--) { const p = this.onBowl(to, top + (bottom - top) * k / 8); points.push(p.x, p.y); }
    for (let k = 12; k >= 0; k--) { const p = this.onBowl(from + (to - from) * k / 12, top); points.push(p.x, p.y); }
    return points;
  }

  private bowlBack(): void {
    const g = this.art, look = this.look;
    g.fillStyle(0x3a2c20, 0.2).fillEllipse(BOWL.x + 14, BOWL.y + BOWL_DEPTH + 26, 250, 24);
    g.fillStyle(shade(look.bowl, -0.2)).fillEllipse(BOWL.x, BOWL.y + BOWL_DEPTH + 24, 118, 20);
    g.fillStyle(look.inside).fillEllipse(BOWL.x, BOWL.y, BOWL.rx * 2, BOWL.ry * 2);
    g.fillStyle(shade(look.inside, -0.18)).fillEllipse(BOWL.x, BOWL.y + 10, BOWL.rx * 1.7, BOWL.ry * 1.3);
    this.ellipseArc(BOWL.x, BOWL.y, BOWL.rx, BOWL.ry, 1, 2, 4, look.bowlInk);
  }

  private bowlFront(): void {
    const g = this.art, look = this.look;
    const body = this.band(-1, 1, 0, 1);
    shape(g, body, look.bowl, look.bowlInk, 0);
    if (look.pattern === 'stripes') {
      for (let k = 0; k < 7; k++) {
        const from = -1 + (2 * k + 0.5) / 7.5, to = from + 1 / 7.5;
        g.fillStyle(look.trim);
        fillContour(g, this.band(from, Math.min(1, to), 0, 1));
      }
    } else if (look.pattern === 'glaze') {
      g.fillStyle(look.trim);
      fillContour(g, this.band(-1, 1, 0.08, 0.22));
      g.fillStyle(shade(look.bowl, -0.15));
      fillContour(g, this.band(-1, 1, 0.72, 1));
    } else {
      g.lineStyle(2.5, look.trim, 0.8);
      for (const side of [-0.7, -0.35, 0.05, 0.4, 0.72]) {
        const a = this.onBowl(side, 0.05), b = this.onBowl(side * 0.92, 0.5), c = this.onBowl(side, 0.95);
        g.beginPath().moveTo(a.x, a.y).lineTo(b.x + 3, b.y).lineTo(c.x, c.y).strokePath();
      }
    }
    // Round: a shade down the right and a gleam down the left.
    g.fillStyle(0x2a1f18, 0.2);
    fillContour(g, this.band(0.45, 1, 0, 1));
    g.fillStyle(0xffffff, 0.28);
    fillContour(g, this.band(-0.72, -0.58, 0.1, 0.8));
    g.lineStyle(4, look.bowlInk);
    g.beginPath();
    for (let k = 0; k < body.length; k += 2) g[k ? 'lineTo' : 'moveTo'](body[k]!, body[k + 1]!);
    g.closePath().strokePath();
    // The lip catches the light along its front.
    this.ellipseArc(BOWL.x, BOWL.y + 3, BOWL.rx - 8, BOWL.ry - 6, 0.12, 0.88, 3, shade(look.bowl, 0.45), 0.8);
  }

  /** Phaser's `arc` is circular; a rim seen at an angle is not. `from`/`to` are in half-turns. */
  private ellipseArc(x: number, y: number, rx: number, ry: number, from: number, to: number, width: number, colour: number, alpha = 1): void {
    const g = this.art;
    g.lineStyle(width, colour, alpha).beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (from + (to - from) * k / 24) * Math.PI;
      g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rx, y + Math.sin(a) * ry);
    }
    g.strokePath();
  }

  // ------------------------------------------------------------------ Popcorn

  /** One popped piece: puffy lobes round a husk, outlined as one shape. */
  private piece(x: number, y: number, scale: number, turn: number, squash: number, tone?: { face: number; shade: number; hull: number }): void {
    const g = this.art, look = this.look;
    const face = tone?.face ?? look.puff, dark = tone?.shade ?? look.puffShade, hull = tone?.hull ?? look.hull;
    const sx = scale * (1 + squash * 0.14), sy = scale * (1 - squash * 0.22);
    const lobes = [[0, 0, 9.5], [8, 0.3, 9], [7.5, 1.9, 8.5], [8.5, 3.4, 10], [7, 4.9, 8]] as const;
    const at = ([d, a]: readonly [number, number, number]): Point => ({ x: x + Math.cos(a + turn) * d * sx, y: y + Math.sin(a + turn) * d * sy });
    const ink = shade(dark, -0.55);
    for (const lobe of lobes) { const p = at(lobe); g.fillStyle(ink).fillCircle(p.x, p.y, (lobe[2] + 2.4) * scale); }
    for (const lobe of lobes) { const p = at(lobe); g.fillStyle(face).fillCircle(p.x, p.y, lobe[2] * scale); }
    const low = at(lobes[3]!);
    g.fillStyle(dark, 0.8).fillCircle(low.x + 2 * scale, low.y + 3 * scale, 5.5 * scale);
    const husk = at([5, 2.6, 0]);
    g.fillStyle(hull).fillEllipse(husk.x, husk.y, 7 * scale, 5 * scale);
    const top = at(lobes[1]!);
    g.fillStyle(0xffffff, 0.7).fillCircle(top.x - 2 * scale, top.y - 3 * scale, 2.6 * scale);
  }

  /** The flash at the pan's mouth on every pop. */
  private popFlash(age: number, ending: number): void {
    if (age < 0 || age > 0.16 || this.still || ending >= 0) return;
    const p = age / 0.16;
    this.starburst(PAN.x, PAN.y - 14, 14 + p * 26, 10, 0xfff2b8, 1 - p);
  }

  private starburst(x: number, y: number, r: number, spikes: number, colour: number, alpha: number, turn = 0): void {
    const points: number[] = [];
    for (let k = 0; k < spikes * 2; k++) {
      const a = turn + k * Math.PI / spikes, d = k % 2 ? r * 0.55 : r;
      points.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    this.art.fillStyle(colour, alpha);
    fillContour(this.art, points);
  }

  /** The enormous last pop, and the piece it throws on top of the heap. */
  private bigFinish(ending: number, burst: number, now: number): void {
    const g = this.art, M = POPCORN_MOTION;
    const since = ending - M.bigPopAt;
    if (since < 0) return;
    if (burst < 1) {
      const r = 50 + burst * 230, alpha = 1 - burst * burst;
      this.starburst(PAN.x, PAN.y - 40, r, 14, 0xf2a93a, alpha * 0.9, burst * 0.4);
      this.starburst(PAN.x, PAN.y - 40, r * 0.78, 14, 0xfff0a8, alpha, burst * 0.4 + 0.1);
      this.starburst(PAN.x, PAN.y - 40, r * 0.42, 10, 0xffffff, alpha, -burst * 0.3);
      g.lineStyle(5, 0xfff0a8, alpha);
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        g.lineBetween(PAN.x + Math.cos(a) * r * 1.02, PAN.y - 40 + Math.sin(a) * r * 1.02, PAN.x + Math.cos(a) * r * 1.18, PAN.y - 40 + Math.sin(a) * r * 1.18);
      }
    }
    const arc = flight(since, { x: PAN.x, y: PAN.y - 30 }, CROWN, M.crownFlightSec, 250);
    const turn = arc.landed ? 0.4 : 0.4 + (1 - since / M.crownFlightSec) * 5;
    this.piece(arc.x, arc.y, 2.5, turn, arc.squash);
    if (arc.landed && !this.still) {
      const glint = 0.6 + Math.sin(now * 8) * 0.4;
      g.fillStyle(0xffffff, glint).fillCircle(CROWN.x - 18, CROWN.y - 22, 4);
    }
  }

  // ------------------------------------------------------------------ A rough round

  private smoke(amount: number): void {
    const g = this.art;
    for (let k = 0; k < 4; k++) {
      const rise = amount * (80 + k * 34), r = 12 + amount * (20 + k * 7);
      const x = PAN.x + (k - 1.5) * 22 + Math.sin(amount * 4 + k) * 12, y = PAN.y - 18 - rise;
      g.fillStyle(k % 2 ? 0x8b8680 : 0xa9a49d, 0.6 * (1 - amount * 0.55)).fillCircle(x, y, r);
      g.fillStyle(0xd0ccc5, 0.35 * (1 - amount * 0.55)).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.5);
    }
  }

  /** The one kernel that burnt: out over the rim, onto the worktop, and a rock to rest. */
  private burntKernel(hop: number, ending: number): void {
    const M = POPCORN_MOTION;
    const since = ending - M.burntFrom;
    const arc = flight(since, { x: PAN.x + 30, y: PAN.y - 6 }, { x: -36, y: 176 }, M.burntLands - M.burntFrom, 120);
    const rock = arc.landed && !this.still ? Math.sin((since - (M.burntLands - M.burntFrom)) * 18) * Math.max(0, 1 - (since - (M.burntLands - M.burntFrom)) / 0.5) * 0.4 : 0;
    this.piece(arc.x, arc.y, 0.9, 1.2 + (arc.landed ? rock : hop * 6), arc.squash, { face: 0x5b4336, shade: 0x3a2a22, hull: 0x2a1d17 });
    if (!arc.landed && !this.still) this.art.fillStyle(0xf28c2b, 0.8).fillCircle(arc.x + 4, arc.y - 2, 2.5);
  }

  private steamPuff(p: number): void {
    const g = this.art;
    g.fillStyle(0xe7e4de, 0.55 * (1 - p)).fillCircle(PAN.x + 34, PAN.y - 18 - p * 40, 10 + p * 14);
    g.fillStyle(0xe7e4de, 0.45 * (1 - p)).fillCircle(PAN.x + 50, PAN.y - 30 - p * 50, 7 + p * 10);
  }
}

