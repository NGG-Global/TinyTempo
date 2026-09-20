import type Phaser from 'phaser';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import {
  bigFish, fishingOutcome, haulFinale, junkFor, rodHeave, shadowRise, type BigFish, type FishingOutcome, type HaulFinale,
} from './fishingMotion';
import { clamp01 } from './motion';

/** The lakeside palette. The ink is dark enough that dressed type takes no outline, like the household ink. */
export const LAKESIDE = { ink: 0x2f3b45, sky: 0xcfe3ee, water: 0x4d8db1, deep: 0x2f6588 } as const;
const SURFACE = 40;
/** Where the line goes into the water, and where everything comes out of it. */
const ENTRY = { x: 218, y: SURFACE } as const;
const FEET = { x: -232, y: SURFACE } as const;
const ROD_TIP_REST = { x: 176, y: -212 } as const;
const ROD_TIP_BENT = { x: 236, y: -30 } as const;
const SMALL_FISH = { colour: 0x9fb7c6, belly: 0xe6eef2, fin: 0x6f8a9b } as const;
/** The drawn fish is 110 units long at scale 1; the bass is a real catch, the minnow is not. */
const BIG_FISH_SCALE = 1.2;
const SMALL_FISH_SCALE = 0.42;

/**
 * A fisherman on a jetty pulls against something heavy on every beat. A clean round
 * hauls up a big fish, one of three that each come out of the water their own way; a
 * middling round lifts a small fish clear; a rough round brings up an old boot or a tyre.
 */
export class FishermanVignette extends HouseholdVignette {
  private outcome: FishingOutcome = 'fail';

  public constructor(scene: Phaser.Scene) { super(scene, 0xdfeaf0, 0xf4e6bd); }

  public override finish(successful: boolean, contactSec: number, accuracy = successful ? 100 : 0): void {
    super.finish(successful, contactSec);
    this.outcome = fishingOutcome(accuracy);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const roundId = this.plan?.id ?? 1;
    const fish = bigFish(roundId);
    const age = now - this.strikeAt;
    const heave = rodHeave(age, beat);
    const finale = haulFinale(ending, this.outcome, fish.flight, this.still);
    const pulls = this.watching ? this.demoTimes.length : this.hitTimes.length;
    const rise = shadowRise(pulls, this.plan?.targets.length ?? 4);
    // The rod is bent by the pull; through the finale it stays loaded until the catch is clear.
    const bend = ending >= 0 ? Math.max(finale.bow, heave * 0.5) : heave;
    const lean = ending >= 0 ? Math.max(finale.stagger, heave * 0.6) : heave * 0.6;
    const wobble = !this.still && now - this.errorAt < 0.3 ? Math.sin((now - this.errorAt) * 50) * (1 - (now - this.errorAt) / 0.3) * 14 : 0;
    const drift = this.still ? 0 : now;

    // Sky, hills and a low sun; the lake below the surface line.
    slab(g, -346, -246, 692, 490, LAKESIDE.sky, 22, 0x8fa9b8);
    g.fillStyle(0xf6dc9a).fillCircle(-120, -150, 46);
    g.fillStyle(0xa9c3c4).fillEllipse(-160, -20, 520, 150).fillEllipse(230, -10, 460, 120);
    g.fillStyle(0x8fb0a8).fillEllipse(60, 10, 640, 110);
    g.fillStyle(LAKESIDE.water).fillRect(-346, SURFACE, 692, 244 - SURFACE);
    g.fillStyle(LAKESIDE.deep, 0.55).fillRect(-346, SURFACE + 90, 692, 244 - SURFACE - 90);
    g.fillStyle(0xf6dc9a, 0.25).fillEllipse(-120, SURFACE + 40, 70, 12);
    g.lineStyle(2, 0xffffff, 0.35);
    for (let i = 0; i < 7; i++) {
      const y = SURFACE + 18 + i * 28, w = 60 + (i % 3) * 30;
      const x = -300 + ((i * 97 + drift * 18) % 600);
      g.lineBetween(x, y, x + w, y);
    }
    // Reeds on the far bank.
    g.lineStyle(4, 0x557a4a);
    for (let i = 0; i < 5; i++) {
      const x = 286 + i * 13, sway = this.still ? 0 : Math.sin(now * 1.3 + i) * 3;
      g.lineBetween(x, SURFACE + 4, x + sway, SURFACE - 70 - (i % 2) * 22);
      g.fillStyle(0x7a5a3a).fillEllipse(x + sway, SURFACE - 76 - (i % 2) * 22, 6, 18);
    }
    // What is on the line, still under the water: nearer the surface with every landed pull.
    if (!finale.breached) this.shadow(g, fish, rise, drift);
    // The jetty: planks on posts, a bucket, a coil of rope.
    g.lineStyle(14, 0x6a4a30).lineBetween(-300, SURFACE + 20, -300, SURFACE + 110).lineBetween(-150, SURFACE + 20, -150, SURFACE + 96);
    g.fillStyle(LAKESIDE.deep, 0.35).fillEllipse(-300, SURFACE + 112, 34, 10).fillEllipse(-150, SURFACE + 98, 34, 10);
    slab(g, -346, SURFACE, 232, 26, 0x9c7048, 6, 0x5a3c25);
    g.lineStyle(2, 0x5a3c25, 0.6);
    for (let i = 1; i < 6; i++) g.lineBetween(-346 + i * 38, SURFACE + 2, -346 + i * 38, SURFACE + 24);
    slab(g, -330, SURFACE - 42, 44, 44, 0x7f8d96, 6, 0x46525a);
    g.lineStyle(3, 0x46525a).beginPath().arc(-308, SURFACE - 42, 18, Math.PI, 0, false).strokePath();
    g.lineStyle(5, 0xd8c39a).strokeCircle(-170, SURFACE - 6, 12).strokeCircle(-170, SURFACE - 6, 5);

    const grip = this.fisherman(g, lean, finale, ending);
    // The rod: a bow whose depth is the load on it, then the line from its tip.
    const tipX = ROD_TIP_REST.x + (ROD_TIP_BENT.x - ROD_TIP_REST.x) * bend + wobble;
    const tipY = ROD_TIP_REST.y + (ROD_TIP_BENT.y - ROD_TIP_REST.y) * bend;
    const midX = (grip.x + tipX) / 2, midY = (grip.y + tipY) / 2;
    const bowX = midX - 30 - bend * 20, bowY = midY - 70 - bend * 40;
    this.curve(g, grip.x, grip.y, bowX, bowY, tipX, tipY, 9, 0x6a4b2f);
    this.curve(g, grip.x, grip.y, bowX, bowY, tipX, tipY, 4, 0xb08a5a);
    g.fillStyle(0x2f2f33).fillCircle(grip.x + 18, grip.y + 8, 12);
    g.lineStyle(3, 0x9aa5ab).strokeCircle(grip.x + 18, grip.y + 8, 12).strokeCircle(grip.x + 18, grip.y + 8, 5);
    // The line runs to the float while it is in the water, and to the catch once it is out.
    // The catch hangs from wherever the tip is — a heavy one keeps the rod bowed and so
    // stays low — and the salmon's swing carries it from there into the fisherman's arms.
    const hangX = tipX, hangY = tipY + 12;
    const waterX = ENTRY.x, waterY = ENTRY.y + 30;
    const armsX = grip.x + 60, armsY = grip.y - 40;
    const risenX = waterX + (hangX - waterX) * finale.lift, risenY = waterY + (hangY - waterY) * finale.lift;
    const catchX = risenX + (armsX - risenX) * finale.toward, catchY = risenY + (armsY - risenY) * finale.toward;
    const lineEndX = finale.breached ? catchX : ENTRY.x;
    const lineEndY = finale.breached ? catchY : ENTRY.y + 6 * bend;
    const tension = Math.max(bend, finale.breached ? 1 : 0);
    this.curve(g, tipX, tipY, (tipX + lineEndX) / 2, (tipY + lineEndY) / 2 + (1 - tension) * 40, lineEndX, lineEndY, 2, 0xf7f7f2);
    if (!finale.breached) {
      // The float sits on the surface and is dragged under a little by each pull.
      const bob = this.still ? 0 : Math.sin(now * 3) * 2;
      const fy = ENTRY.y + bob + bend * 10;
      g.fillStyle(0xf3f1ea).fillCircle(ENTRY.x, fy, 10);
      g.fillStyle(0xd9534f).beginPath().arc(ENTRY.x, fy, 10, 0, Math.PI, false).closePath().fillPath();
      g.lineStyle(2, LAKESIDE.ink).strokeCircle(ENTRY.x, fy, 10);
      // Rings where the line meets the water, thrown out by the pull.
      if (!this.still && age >= 0 && age < 0.5 && ending < 0) {
        const p = age / 0.5;
        g.lineStyle(3, 0xffffff, (1 - p) * 0.8).strokeEllipse(ENTRY.x, ENTRY.y + 4, 30 + p * 90, 8 + p * 26);
        for (let i = 0; i < 4; i++) {
          const a = -0.6 - i * 0.6, d = 16 + p * 40;
          g.fillStyle(0xffffff, (1 - p) * 0.9).fillCircle(ENTRY.x + Math.cos(a) * d * 1.4, ENTRY.y - Math.sin(-a) * d * 1.2 * (1 - p) + 4, 4);
        }
      }
    } else {
      this.drawCatch(g, catchX, catchY, finale, fish, roundId);
    }
    this.splash(g, finale.splash);
    if (this.outcome === 'success' && finale.lift > 0.5 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.85) / 0.8) * Math.PI);
      sparkle(g, catchX - 80, catchY + 10, 14 * a, a);
      sparkle(g, catchX + 70, catchY + 80, 11 * a, a);
    }
  }

  /** The hooked thing's silhouette under the water. It is the round's big fish whatever comes up, so it never gives the ending away. */
  private shadow(g: Phaser.GameObjects.Graphics, fish: BigFish, rise: number, drift: number): void {
    const depth = SURFACE + 150 - rise * 115;
    const sway = Math.sin(drift * 2.1) * 12 * (1 - rise * 0.5);
    const s = 0.8 + rise * 0.5;
    g.fillStyle(LAKESIDE.deep, 0.5 + rise * 0.25);
    g.fillEllipse(ENTRY.x + 6 + sway, depth, 96 * s * fish.size, 34 * s * fish.size);
    g.fillTriangle(ENTRY.x + 6 + sway - 44 * s * fish.size, depth, ENTRY.x + 6 + sway - 68 * s * fish.size, depth - 20 * s, ENTRY.x + 6 + sway - 68 * s * fish.size, depth + 20 * s);
    // The line down to it.
    g.lineStyle(1.5, 0xf7f7f2, 0.35).lineBetween(ENTRY.x, SURFACE + 6, ENTRY.x + 6 + sway, depth);
  }

  /** Waders, a yellow coat, a bucket hat and a beard. Leans back from the feet into every pull; returns where the rod is held. */
  private fisherman(g: Phaser.GameObjects.Graphics, lean: number, finale: HaulFinale, ending: number): { x: number; y: number } {
    const tilt = lean * 0.42;
    const sin = Math.sin(tilt), cos = Math.cos(tilt);
    const hipX = FEET.x - sin * 20, hipY = FEET.y - 72;
    const shoulderX = hipX - sin * 78, shoulderY = hipY - cos * 78;
    const headX = shoulderX - sin * 34, headY = shoulderY - cos * 34;
    // Boots and waders; the back leg braces further back the harder he leans.
    g.fillStyle(LAKESIDE.ink, 0.18).fillEllipse(FEET.x + 4, FEET.y + 2, 120, 14);
    g.lineStyle(26, 0x3f5a48).lineBetween(hipX - 12, hipY, FEET.x - 30 - lean * 26, FEET.y - 14).lineBetween(hipX + 12, hipY, FEET.x + 26, FEET.y - 14);
    g.fillStyle(0x2c2f33).fillRoundedRect(FEET.x - 48 - lean * 26, FEET.y - 20, 40, 20, 6).fillRoundedRect(FEET.x + 8, FEET.y - 20, 42, 20, 6);
    // The coat, a slab rotated by the lean, drawn as a contour so it follows the torso.
    const coat = [
      hipX - 40 * cos, hipY - 40 * -sin, hipX + 40 * cos, hipY + 40 * -sin,
      shoulderX + 36 * cos, shoulderY + 36 * -sin, shoulderX - 36 * cos, shoulderY - 36 * -sin,
    ];
    shape(g, coat, 0xf0b429, 0x9a6d10, 3);
    g.lineStyle(3, 0x9a6d10, 0.7).lineBetween((hipX + shoulderX) / 2 + 6 * cos, (hipY + shoulderY) / 2 - 6 * sin, shoulderX + 6 * cos, shoulderY - 6 * sin);
    // Both hands on the rod, out in front of the chest and pulled in by the heave.
    const gripX = shoulderX + 40 - lean * 18, gripY = shoulderY + 34 - lean * 10;
    g.lineStyle(15, 0xf0b429).lineBetween(shoulderX - 20 * cos, shoulderY + 20 * sin, gripX - 16, gripY + 6).lineBetween(shoulderX + 22 * cos, shoulderY - 22 * sin, gripX + 24, gripY - 6);
    g.fillStyle(0xe8b48a).fillCircle(gripX - 16, gripY + 6, 10).fillCircle(gripX + 26, gripY - 8, 10);
    // Head: face, beard, hat brim and crown.
    g.fillStyle(0xe8b48a).fillRoundedRect(headX - 24, headY - 30, 48, 56, 18);
    g.fillStyle(0xd8d2c4).fillRoundedRect(headX - 22, headY + 2, 44, 30, 14);
    g.fillStyle(LAKESIDE.ink).fillEllipse(headX + 12, headY - 8, 5, 7);
    g.fillStyle(0xd98a8a, 0.5).fillEllipse(headX + 18, headY + 2, 10, 6);
    g.lineStyle(3, 0x8a5a48).beginPath().arc(headX + 6, headY + 8, 6, 0.2, Math.PI - 0.6).strokePath();
    g.fillStyle(0xd9a53d).fillEllipse(headX, headY - 30, 70, 16);
    g.fillStyle(0xf0c04b).fillRoundedRect(headX - 24, headY - 58, 48, 32, 10);
    g.lineStyle(3, 0x9a6d10).strokeRoundedRect(headX - 24, headY - 58, 48, 32, 10).strokeEllipse(headX, headY - 30, 70, 16);
    // A grin as the catch comes clear on a good round; a raised brow over a boot.
    if (finale.breached && this.outcome === 'success') g.lineStyle(3, 0x8a5a48).beginPath().arc(headX + 8, headY + 6, 9, 0.1, Math.PI - 0.4).strokePath();
    if (finale.breached && this.outcome === 'fail') g.lineStyle(3, LAKESIDE.ink).lineBetween(headX + 4, headY - 20, headX + 20, headY - 24);
    if (ending >= 0 && !finale.breached && !this.still) {
      // Effort lines behind the shoulders while the weight is coming up.
      g.lineStyle(2.5, LAKESIDE.ink, 0.5);
      for (let i = 0; i < 3; i++) g.lineBetween(shoulderX - 50 - i * 6, shoulderY - 30 + i * 16, shoulderX - 66 - i * 8, shoulderY - 34 + i * 16);
    }
    return { x: gripX, y: gripY };
  }

  /** Whatever is on the hook hangs beneath `(x, y)`, the end of the line; a fish hangs head up. */
  private drawCatch(g: Phaser.GameObjects.Graphics, x: number, y: number, finale: HaulFinale, fish: BigFish, roundId: number): void {
    if (this.outcome === 'success') {
      const s = fish.size * BIG_FISH_SCALE;
      this.drawFish(g, x, y + 50 * s, finale.spin - Math.PI / 2, s, fish);
      return;
    }
    if (this.outcome === 'partial') {
      this.drawFish(g, x, y + 50 * SMALL_FISH_SCALE, finale.spin - Math.PI / 2, SMALL_FISH_SCALE, SMALL_FISH);
      // A drip or two: it is barely worth the bucket.
      g.fillStyle(0xffffff, 0.7).fillCircle(x + 8, y + 76 + finale.lift * 10, 3);
      return;
    }
    if (junkFor(roundId) === 'boot') this.boot(g, x, y + 50, finale.spin);
    else this.tyre(g, x, y + 40, finale.spin);
    // Weed and drips off whatever it is.
    g.lineStyle(4, 0x557a4a).lineBetween(x - 20, y + 70, x - 30, y + 108).lineBetween(x + 14, y + 76, x + 20, y + 102);
    g.fillStyle(0xffffff, 0.6).fillCircle(x - 30, y + 116, 3).fillCircle(x + 22, y + 110, 2.5);
  }

  /** A fish facing right, rotated by `angle` and scaled by `s`; the look supplies its colours. */
  private drawFish(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, s: number, look: { colour: number; belly: number; fin: number }): void {
    const place = (points: readonly number[]): number[] => {
      const out: number[] = [];
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (let i = 0; i < points.length; i += 2) {
        const px = points[i]! * s, py = points[i + 1]! * s;
        out.push(x + px * cos - py * sin, y + px * sin + py * cos);
      }
      return out;
    };
    const ink = shade(look.colour, -0.55);
    shape(g, place([-40, 0, -60, -24, -54, 0, -60, 24]), look.fin, ink, 2.5);
    shape(g, place([-6, -19, 8, -36, 20, -19]), look.fin, ink, 2.5);
    shape(g, place([-40, 0, -28, -11, -10, -19, 12, -20, 32, -14, 46, -4, 50, 0, 46, 5, 32, 15, 12, 21, -10, 19, -28, 11]), look.colour, ink, 3);
    g.fillStyle(look.belly, 0.9);
    const belly = place([-24, 8, -10, 16, 12, 19, 32, 13, 44, 5, 30, 4, 12, 6, -10, 5]);
    g.beginPath().moveTo(belly[0]!, belly[1]!);
    for (let i = 2; i < belly.length; i += 2) g.lineTo(belly[i]!, belly[i + 1]!);
    g.closePath().fillPath();
    shape(g, place([4, 6, 16, 18, 26, 8]), look.fin, ink, 2);
    const [ex, ey] = place([34, -6]);
    g.fillStyle(0xffffff).fillCircle(ex!, ey!, 5 * s + 1);
    g.fillStyle(LAKESIDE.ink).fillCircle(ex! + s, ey!, 2.5 * s + 0.5);
    const [gx, gy, gx2, gy2] = place([26, -12, 24, 10]);
    g.lineStyle(2, ink, 0.7).lineBetween(gx!, gy!, gx2!, gy2!);
  }

  private boot(g: Phaser.GameObjects.Graphics, x: number, y: number, sway: number): void {
    const dx = sway * 30;
    shape(g, [x - 14 + dx, y - 50, x + 14 + dx, y - 50, x + 16, y - 2, x + 50, y + 10, x + 48, y + 26, x - 16, y + 26, x - 16, y - 2], 0x5a4a3c, 0x2c2420, 3);
    g.fillStyle(0x2c2420).fillRoundedRect(x - 16, y + 18, 64, 10, 4);
    g.fillStyle(0x7a685a).fillRoundedRect(x - 10 + dx, y - 48, 22, 10, 4);
    // A hole in the toe: it has been down there a while.
    g.fillStyle(LAKESIDE.deep).fillEllipse(x + 36, y + 12, 12, 8);
  }

  private tyre(g: Phaser.GameObjects.Graphics, x: number, y: number, spin: number): void {
    g.fillStyle(0x2b2b2e).fillCircle(x, y, 40);
    g.lineStyle(3, 0x141416).strokeCircle(x, y, 40);
    g.fillStyle(y < SURFACE ? LAKESIDE.sky : LAKESIDE.water).fillCircle(x, y, 18);
    g.lineStyle(3, 0x4a4a4e).strokeCircle(x, y, 18).strokeCircle(x, y, 30);
    g.lineStyle(4, 0x141416);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + spin * 3;
      g.lineBetween(x + Math.cos(a) * 32, y + Math.sin(a) * 32, x + Math.cos(a) * 40, y + Math.sin(a) * 40);
    }
  }

  /** Water thrown up where the catch came out: a crown of drops and a spread of foam on the surface. */
  private splash(g: Phaser.GameObjects.Graphics, splash: number): void {
    if (splash <= 0) return;
    g.fillStyle(0xffffff, 0.75 * splash).fillEllipse(ENTRY.x, ENTRY.y + 4, 60 + splash * 120, 14 + splash * 18);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.15 + i * 0.116), d = 30 + splash * (70 + (i % 3) * 30);
      const px = ENTRY.x + Math.cos(a) * d * 1.3, py = ENTRY.y - Math.sin(a) * d + (1 - splash) * 40;
      g.fillStyle(0xffffff, 0.9 * splash).fillEllipse(px, py, 8 + (i % 2) * 4, 12 + (i % 2) * 6);
    }
  }

  private curve(g: Phaser.GameObjects.Graphics, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, width: number, colour: number): void {
    g.lineStyle(width, colour).beginPath().moveTo(x0, y0);
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      g.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
    }
    g.strokePath();
  }
}
