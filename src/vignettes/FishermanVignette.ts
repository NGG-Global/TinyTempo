import type Phaser from 'phaser';
import { mix, shade } from '@/ui/colour';
import { castShadow, faces, type Faces } from '@/ui/light';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import {
  bigFish, fishingOutcome, haulFinale, junkFor, rodHeave, shadowRise, type BigFish, type FishingOutcome, type HaulFinale,
} from './fishingMotion';
import { clamp01, easeOut } from './motion';

/** The lakeside palette. The ink is dark enough that dressed type takes no outline, like the household ink. */
export const LAKESIDE = { ink: 0x2f3b45, sky: 0xcfe3ee, water: 0x4d8db1, deep: 0x2f6588 } as const;
const SURFACE = 40;
/** Where the line goes into the water, and where everything comes out of it. */
const ENTRY = { x: 218, y: SURFACE } as const;
const FEET = { x: -232, y: SURFACE } as const;
const ROD_TIP_REST = { x: 176, y: -212 } as const;
const ROD_TIP_BENT = { x: 236, y: -30 } as const;
/** The fisherman's own colours, each turned into lit, front and shaded planes once. */
const MAN = {
  skin: faces(0xe8b48a), coat: faces(0xf0b429), waders: faces(0x3f5a48), boot: faces(0x2c2f33),
  hat: faces(0xf0c04b), beard: faces(0xd8d2c4), scarf: faces(0xc4463c), cork: faces(0xc9a273), reel: faces(0x3a3f45),
} as const;
const COAT_INK = 0x9a6d10;
const SMALL_FISH = { colour: 0x9fb7c6, belly: 0xe6eef2, fin: 0x6f8a9b } as const;
/** The drawn fish is 110 units long at scale 1; the bass is a real catch, the minnow is not. */
const BIG_FISH_SCALE = 1.2;
const SMALL_FISH_SCALE = 0.42;

interface Mood {
  /** How hard he is pulling right now: squints the eyes, drops the brows, bares the teeth. */
  readonly effort: number;
  readonly expression: 'watching' | 'grin' | 'wry' | 'dismay';
}

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
    const mood: Mood = {
      effort: finale.breached ? 0 : Math.max(heave, ending >= 0 ? finale.bow : 0),
      expression: !finale.breached ? 'watching' : this.outcome === 'success' ? 'grin' : this.outcome === 'partial' ? 'wry' : 'dismay',
    };

    this.lake(g, now, drift);
    // What is on the line, still under the water: nearer the surface with every landed pull.
    if (!finale.breached) this.shadow(g, fish, rise, drift);
    this.jetty(g);
    const grip = this.fisherman(g, lean, mood, now);
    // The rod: a bow whose depth is the load on it, then the line from its tip.
    const tipX = ROD_TIP_REST.x + (ROD_TIP_BENT.x - ROD_TIP_REST.x) * bend + wobble;
    const tipY = ROD_TIP_REST.y + (ROD_TIP_BENT.y - ROD_TIP_REST.y) * bend;
    const midX = (grip.x + tipX) / 2, midY = (grip.y + tipY) / 2;
    const bowX = midX - 30 - bend * 20, bowY = midY - 70 - bend * 40;
    this.rod(g, grip.x, grip.y, bowX, bowY, tipX, tipY);
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
      this.float(g, now, bend);
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
      this.drawCatch(g, catchX, catchY, finale, fish, roundId, ending);
    }
    this.splash(g, finale.splash);
    if (this.outcome === 'success' && finale.lift > 0.5 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.85) / 0.8) * Math.PI);
      sparkle(g, catchX - 80, catchY + 10, 14 * a, a);
      sparkle(g, catchX + 70, catchY + 80, 11 * a, a);
    }
  }

  // ------------------------------------------------------------------ The place

  /** Sky, a low sun, two banks of hills and the lake, with the sun's path on the water. */
  private lake(g: Phaser.GameObjects.Graphics, now: number, drift: number): void {
    slab(g, -346, -246, 692, 490, LAKESIDE.sky, 22, 0x8fa9b8);
    // Morning haze over the far shore, soft-edged so it reads as air rather than a band.
    g.fillStyle(0xe6eef3, 0.35).fillEllipse(0, -30, 760, 150);
    g.fillStyle(0xe6eef3, 0.35).fillEllipse(40, -20, 560, 90);
    g.fillStyle(0xfbe9b6, 0.6).fillCircle(-120, -150, 60);
    g.fillStyle(0xf6dc9a).fillCircle(-120, -150, 46);
    g.fillStyle(0xfff3cf, 0.8).fillCircle(-134, -164, 16);
    // Far hills catch the light on their left slopes; the near bank is darker and greener.
    g.fillStyle(0xa9c3c4).fillEllipse(-160, -20, 520, 150).fillEllipse(230, -10, 460, 120);
    g.fillStyle(0xbcd2d0, 0.7).fillEllipse(-230, -50, 260, 70).fillEllipse(150, -40, 220, 50);
    g.fillStyle(0x8fb0a8).fillEllipse(60, 10, 640, 110);
    g.fillStyle(0x7e9f96).fillEllipse(120, 24, 560, 60);
    // A few pines on the far bank, small enough to sit behind the reeds.
    for (const [x, h] of [[-40, 44], [-10, 58], [26, 40], [300, 36], [330, 50]] as const) {
      g.fillStyle(0x5f7f6a).fillTriangle(x - 12, SURFACE - 6, x + 12, SURFACE - 6, x, SURFACE - 6 - h);
      g.fillStyle(0x4c6a58).fillTriangle(x, SURFACE - 6, x + 12, SURFACE - 6, x, SURFACE - 6 - h);
    }
    g.fillStyle(LAKESIDE.water).fillRect(-346, SURFACE, 692, 244 - SURFACE);
    g.fillStyle(LAKESIDE.deep, 0.55).fillRect(-346, SURFACE + 90, 692, 244 - SURFACE - 90);
    g.fillStyle(LAKESIDE.deep, 0.35).fillRect(-346, SURFACE + 160, 692, 244 - SURFACE - 160);
    // The sun's path, broken into glints that drift.
    for (let i = 0; i < 5; i++) {
      const y = SURFACE + 14 + i * 22;
      g.fillStyle(0xf6dc9a, 0.28 - i * 0.04).fillEllipse(-120 + Math.sin(drift * 1.7 + i) * 6, y, 90 - i * 12, 7);
    }
    g.lineStyle(2, 0xffffff, 0.35);
    for (let i = 0; i < 7; i++) {
      const y = SURFACE + 18 + i * 28, w = 60 + (i % 3) * 30;
      const x = -300 + ((i * 97 + drift * 18) % 600);
      g.lineBetween(x, y, x + w, y);
    }
    // Reeds on the far bank, each with its lit side, swaying out of step.
    for (let i = 0; i < 6; i++) {
      const x = 280 + i * 12, tall = 70 + (i % 3) * 14, sway = this.still ? 0 : Math.sin(now * 1.3 + i) * 3;
      g.lineStyle(4, 0x557a4a).lineBetween(x, SURFACE + 4, x + sway, SURFACE - tall);
      g.lineStyle(1.5, 0x8cb47a).lineBetween(x - 1, SURFACE + 4, x + sway - 1, SURFACE - tall + 20);
      g.fillStyle(0x6b4a2e).fillEllipse(x + sway, SURFACE - tall - 8, 7, 20);
      g.fillStyle(0x8f6a45).fillEllipse(x + sway - 1.5, SURFACE - tall - 10, 3, 14);
    }
  }

  /** Planks on two posts, with a bucket, a rope coil and a tackle tin; everything throws a shadow the light's way. */
  private jetty(g: Phaser.GameObjects.Graphics): void {
    const timber = faces(0x9c7048);
    const post = faces(0x6a4a30);
    for (const [x, depth] of [[-300, 110], [-150, 96]] as const) {
      g.fillStyle(LAKESIDE.deep, 0.35).fillEllipse(x, SURFACE + depth + 2, 34, 10);
      g.fillStyle(post.face).fillRect(x - 8, SURFACE + 20, 16, depth - 20);
      g.fillStyle(post.shade).fillRect(x + 2, SURFACE + 20, 6, depth - 20);
      g.fillStyle(post.lit).fillRect(x - 7, SURFACE + 20, 3, depth - 20);
      // Rope lashed round the post, and the waterline stain below it.
      g.lineStyle(3, 0xd8c39a).lineBetween(x - 9, SURFACE + 34, x + 9, SURFACE + 38).lineBetween(x - 9, SURFACE + 40, x + 9, SURFACE + 44);
      g.fillStyle(0x3e5a4a, 0.5).fillRect(x - 8, SURFACE + depth - 22, 16, 20);
    }
    // The deck: a thick edge under the planks, then each plank with its grain.
    g.fillStyle(timber.edge).fillRoundedRect(-346, SURFACE + 14, 232, 14, 4);
    g.fillStyle(timber.shade).fillRoundedRect(-346, SURFACE + 8, 232, 12, 4);
    slab(g, -346, SURFACE, 232, 18, timber.face, 5, 0x5a3c25);
    g.lineStyle(2, timber.edge, 0.7);
    for (let i = 1; i < 6; i++) g.lineBetween(-346 + i * 38, SURFACE + 2, -346 + i * 38, SURFACE + 16);
    g.lineStyle(1.5, timber.lit, 0.6);
    for (let i = 0; i < 6; i++) g.lineBetween(-340 + i * 38, SURFACE + 5, -318 + i * 38, SURFACE + 5);
    g.lineStyle(1.5, timber.edge, 0.4);
    for (let i = 0; i < 6; i++) g.lineBetween(-336 + i * 38, SURFACE + 11, -322 + i * 38, SURFACE + 11);
    // Bucket: galvanised, with water in it and the light down one side.
    const pail = faces(0x7f8d96);
    const drop = castShadow(14);
    g.fillStyle(LAKESIDE.ink, drop.alpha).fillEllipse(-308 + drop.dx * 0.4, SURFACE + 2, 60, 12);
    g.fillStyle(pail.face).fillRoundedRect(-330, SURFACE - 44, 44, 46, 5);
    g.fillStyle(pail.shade).fillRoundedRect(-300, SURFACE - 44, 14, 46, 5);
    g.fillStyle(pail.lit).fillRoundedRect(-326, SURFACE - 40, 6, 38, 3);
    g.fillStyle(pail.lit).fillEllipse(-308, SURFACE - 44, 44, 12);
    g.fillStyle(LAKESIDE.water, 0.9).fillEllipse(-308, SURFACE - 43, 36, 8);
    g.fillStyle(0xffffff, 0.35).fillEllipse(-314, SURFACE - 44, 12, 3);
    g.lineStyle(2.5, pail.edge).strokeRoundedRect(-330, SURFACE - 44, 44, 46, 5).strokeEllipse(-308, SURFACE - 44, 44, 12);
    g.lineStyle(3, pail.edge).beginPath().arc(-308, SURFACE - 44, 18, Math.PI, 0, false).strokePath();
    g.lineStyle(1.5, pail.rim).beginPath().arc(-309, SURFACE - 45, 18, Math.PI * 1.1, Math.PI * 1.6, false).strokePath();
    // A coil of rope with its shadow, and a battered tackle tin.
    g.fillStyle(LAKESIDE.ink, 0.14).fillEllipse(-166, SURFACE - 2, 34, 8);
    g.lineStyle(6, 0xb89c74).strokeEllipse(-170, SURFACE - 6, 26, 12);
    g.lineStyle(2, 0xe4d2ac).strokeEllipse(-171, SURFACE - 8, 22, 8);
    g.lineStyle(3.5, 0xb89c74).strokeEllipse(-170, SURFACE - 6, 9, 5);
    const tin = faces(0x4f7a6a);
    g.fillStyle(LAKESIDE.ink, 0.14).fillEllipse(-126, SURFACE - 1, 40, 8);
    g.fillStyle(tin.face).fillRoundedRect(-146, SURFACE - 20, 38, 20, 3);
    g.fillStyle(tin.shade).fillRoundedRect(-118, SURFACE - 20, 10, 20, 3);
    g.fillStyle(tin.lit).fillRoundedRect(-146, SURFACE - 22, 38, 6, 2);
    g.fillStyle(0xd8c39a).fillCircle(-128, SURFACE - 10, 3);
  }

  /** The hooked thing's silhouette under the water. It is the round's big fish whatever comes up, so it never gives the ending away. */
  private shadow(g: Phaser.GameObjects.Graphics, fish: BigFish, rise: number, drift: number): void {
    const depth = SURFACE + 150 - rise * 115;
    const sway = Math.sin(drift * 2.1) * 12 * (1 - rise * 0.5);
    const s = 0.8 + rise * 0.5;
    const cx = ENTRY.x + 6 + sway;
    g.fillStyle(LAKESIDE.deep, 0.5 + rise * 0.25);
    g.fillEllipse(cx, depth, 96 * s * fish.size, 34 * s * fish.size);
    g.fillTriangle(cx - 44 * s * fish.size, depth, cx - 68 * s * fish.size, depth - 20 * s, cx - 68 * s * fish.size, depth + 20 * s);
    g.fillTriangle(cx - 6 * s, depth - 14 * s, cx + 10 * s, depth - 28 * s, cx + 18 * s, depth - 14 * s);
    // A pale eye in the shadow, on the near side, so it reads as a fish and not a log.
    g.fillStyle(0xdfeaf0, 0.35 + rise * 0.3).fillCircle(cx + 30 * s * fish.size, depth - 5 * s, 4 * s);
    // The line down to it, and a bubble or two working up from it.
    g.lineStyle(1.5, 0xf7f7f2, 0.35).lineBetween(ENTRY.x, SURFACE + 6, cx, depth);
    if (!this.still) {
      const b = (drift * 0.6) % 1;
      g.lineStyle(1.5, 0xffffff, 0.5 * (1 - b)).strokeCircle(cx + 20 + Math.sin(drift * 3) * 4, depth - 20 - b * (depth - SURFACE - 30), 4 + b * 3);
    }
  }

  // ------------------------------------------------------------------ The man

  /**
   * Waders, a yellow coat, a bucket hat, a red scarf and a beard; drawn in three-quarter,
   * facing the water, with every plane shaded from the shared light. Leans back from his
   * boots into every pull. Returns where the rod is held.
   */
  private fisherman(g: Phaser.GameObjects.Graphics, lean: number, mood: Mood, now: number): { x: number; y: number } {
    const tilt = lean * 0.42;
    const sin = Math.sin(tilt), cos = Math.cos(tilt);
    const hipX = FEET.x - sin * 20, hipY = FEET.y - 72;
    const shoulderX = hipX - sin * 78, shoulderY = hipY - cos * 78;
    const headX = shoulderX - sin * 34, headY = shoulderY - cos * 34;
    const { skin, coat, waders, boot, hat, beard, scarf } = MAN;
    // He stands on the boards: a soft pool of shadow thrown the light's way, longer as he leans.
    const drop = castShadow(30 + lean * 20);
    g.fillStyle(LAKESIDE.ink, drop.alpha + 0.06).fillEllipse(FEET.x + 4 + drop.dx * 0.5, FEET.y, 130 + lean * 40, 14);
    // Legs: the back one braces further back the harder he leans, the front one takes the weight.
    const backFootX = FEET.x - 30 - lean * 26, frontFootX = FEET.x + 26;
    g.lineStyle(26, waders.shade).lineBetween(hipX - 12, hipY, backFootX, FEET.y - 14);
    g.lineStyle(26, waders.face).lineBetween(hipX + 12, hipY, frontFootX, FEET.y - 14);
    g.lineStyle(6, waders.lit, 0.8).lineBetween(hipX + 4, hipY + 6, frontFootX - 6, FEET.y - 20);
    g.lineStyle(3, waders.edge).lineBetween(hipX - 18, hipY + 30, backFootX - 8, FEET.y - 22).lineBetween(hipX + 18, hipY + 26, frontFootX + 10, FEET.y - 24);
    // Wader straps cross the coat later; the knee patches read as gear rather than trousers.
    g.fillStyle(waders.edge, 0.7).fillRoundedRect(frontFootX - 12, FEET.y - 46, 22, 12, 4).fillRoundedRect(backFootX - 6 - lean * 4, FEET.y - 44, 22, 12, 4);
    this.wellington(g, backFootX - 26, FEET.y - 20, boot, false);
    this.wellington(g, frontFootX - 14, FEET.y - 20, boot, true);
    // The coat as a rotated slab: front face, a shaded near side, a lit far edge, a hem and buttons.
    // Torso frame: u runs across the body, v down its axis from the hip, so negative v is up
    // toward the shoulders and the whole slab tilts with the lean.
    const c = (u: number, v: number): [number, number] => [hipX + u * cos + v * sin, hipY - u * sin + v * cos];
    const torso = (u0: number, u1: number, v0: number, v1: number): number[] => {
      const a = c(u0, v0), b = c(u1, v0), d = c(u1, v1), e = c(u0, v1);
      return [a[0], a[1], b[0], b[1], d[0], d[1], e[0], e[1]];
    };
    shape(g, torso(-42, 42, 4, -80), coat.face, COAT_INK, 3);
    g.fillStyle(coat.shade);
    this.fillPoints(g, torso(22, 42, 2, -78));
    g.fillStyle(coat.lit, 0.9);
    this.fillPoints(g, torso(-40, -28, 2, -78));
    g.fillStyle(coat.edge, 0.6);
    this.fillPoints(g, torso(-42, 42, 4, -6));
    // Wader straps over the shoulders, a storm flap down the front, and two toggles.
    g.lineStyle(7, waders.face).lineBetween(...c(-16, 0), ...c(-14, -76)).lineBetween(...c(16, 0), ...c(14, -76));
    g.lineStyle(2.5, COAT_INK, 0.7).lineBetween(...c(4, -2), ...c(6, -74));
    g.fillStyle(COAT_INK).fillCircle(...c(9, -22), 3.5).fillCircle(...c(9, -48), 3.5);
    // Both arms come forward to the rod; the far arm shows as the shaded plane, the near one is lit.
    const gripX = shoulderX + 40 - lean * 18, gripY = shoulderY + 34 - lean * 10;
    g.lineStyle(16, coat.shade).lineBetween(shoulderX - 20 * cos, shoulderY + 20 * sin, gripX - 16, gripY + 6);
    g.lineStyle(16, coat.face).lineBetween(shoulderX + 22 * cos, shoulderY - 22 * sin, gripX + 24, gripY - 6);
    g.lineStyle(4, coat.lit, 0.8).lineBetween(shoulderX + 22 * cos, shoulderY - 22 * sin - 4, gripX + 20, gripY - 12);
    g.fillStyle(coat.edge).fillCircle(gripX - 16, gripY + 6, 9).fillCircle(gripX + 24, gripY - 6, 9);
    // Hands gripping: a knuckle line on each so they hold the rod rather than rest on it.
    for (const [hx, hy, lit] of [[gripX - 18, gripY + 8, false], [gripX + 26, gripY - 8, true]] as const) {
      g.fillStyle(lit ? skin.face : skin.shade).fillCircle(hx, hy, 10.5);
      g.fillStyle(lit ? skin.lit : skin.face).fillCircle(hx - 3, hy - 3, 6);
      g.lineStyle(1.5, skin.edge, 0.8).beginPath().arc(hx, hy + 1, 7, Math.PI * 1.15, Math.PI * 1.85, false).strokePath();
    }
    // The scarf, with a tail that flies back on the heave.
    g.fillStyle(scarf.face).fillEllipse(shoulderX + 2, shoulderY - 4, 62, 22);
    g.fillStyle(scarf.shade).fillEllipse(shoulderX + 16, shoulderY - 1, 30, 14);
    g.fillStyle(scarf.lit).fillEllipse(shoulderX - 14, shoulderY - 8, 22, 8);
    const flap = lean * 40 + (this.still ? 0 : Math.sin(now * 5) * 3);
    shape(g, [shoulderX - 22, shoulderY - 4, shoulderX - 32 - flap, shoulderY + 20 + flap * 0.4, shoulderX - 44 - flap * 1.3, shoulderY + 36 + flap * 0.2, shoulderX - 20, shoulderY + 12], scarf.face, scarf.edge, 2.5);
    g.lineStyle(2, scarf.edge, 0.6).lineBetween(shoulderX - 30 - flap, shoulderY + 22 + flap * 0.4, shoulderX - 36 - flap * 1.1, shoulderY + 34 + flap * 0.2);
    this.head(g, headX, headY, mood, hat, skin, beard);
    return { x: gripX, y: gripY };
  }

  /** A wellington: a shaft, a heel and a rounded toe, with the light on the toe cap. */
  private wellington(g: Phaser.GameObjects.Graphics, x: number, y: number, boot: Faces, near: boolean): void {
    g.fillStyle(near ? boot.face : boot.shade).fillRoundedRect(x, y - 8, 34, 28, 6);
    g.fillStyle(near ? boot.face : boot.shade).fillRoundedRect(x, y + 6, 54, 14, { tl: 4, tr: 9, br: 8, bl: 4 });
    g.fillStyle(near ? boot.lit : boot.face, 0.9).fillEllipse(x + 44, y + 12, 14, 8);
    g.fillStyle(boot.edge).fillRoundedRect(x, y + 16, 54, 5, 2);
    g.fillStyle(0xd9853c, 0.85).fillRoundedRect(x + 2, y - 8, 30, 5, 2);
    g.lineStyle(2, boot.edge).strokeRoundedRect(x, y - 8, 34, 28, 6);
  }

  /** The face carries the effort and then the verdict; the hat and beard frame it. */
  private head(g: Phaser.GameObjects.Graphics, x: number, y: number, mood: Mood, hat: Faces, skin: Faces, beard: Faces): void {
    const { effort } = mood;
    // The neck in shadow under the beard, then the head: a front plane and a shaded far cheek.
    g.fillStyle(skin.shade).fillRoundedRect(x - 12, y + 18, 24, 18, 6);
    g.fillStyle(skin.face).fillRoundedRect(x - 24, y - 30, 48, 58, 18);
    g.fillStyle(skin.shade, 0.9).fillRoundedRect(x - 24, y - 30, 12, 58, { tl: 18, tr: 2, br: 2, bl: 18 });
    g.fillStyle(skin.lit, 0.7).fillEllipse(x + 12, y - 16, 16, 22);
    // A weathered ear on the far side, and a flush across the near cheek that deepens with effort.
    g.fillStyle(skin.shade).fillEllipse(x - 24, y - 4, 10, 14);
    g.fillStyle(0xd98a8a, 0.35 + effort * 0.35).fillEllipse(x + 14, y + 2, 14, 8);
    // The nose, a rounded plane turned to the light, sits in front of the far cheek.
    g.fillStyle(skin.face).fillEllipse(x + 24, y - 2, 12, 10);
    g.fillStyle(skin.shade, 0.7).fillEllipse(x + 22, y + 1, 8, 5);
    g.lineStyle(2, skin.edge, 0.7).beginPath().arc(x + 24, y - 2, 6, -0.5, 1.6, false).strokePath();
    this.eyes(g, x, y, mood);
    this.beard(g, x, y, mood, beard);
    if (effort > 0.6 && !this.still) {
      // A bead of sweat flies off the brow at the top of the heave.
      const p = clamp01((effort - 0.6) / 0.4);
      g.fillStyle(0xbfe3f5, 0.9).fillEllipse(x + 30 + p * 10, y - 30 - p * 14, 5, 8);
    }
    // The bucket hat: a wide brim shaded underneath, a crown with a lit front, a band and a lure tucked in it.
    g.fillStyle(hat.edge).fillEllipse(x, y - 28, 74, 18);
    g.fillStyle(hat.face).fillEllipse(x, y - 31, 74, 16);
    g.fillStyle(hat.lit, 0.8).fillEllipse(x - 14, y - 33, 30, 6);
    g.fillStyle(hat.face).fillRoundedRect(x - 25, y - 60, 50, 32, { tl: 12, tr: 12, br: 4, bl: 4 });
    g.fillStyle(hat.shade).fillRoundedRect(x - 25, y - 60, 12, 32, { tl: 12, tr: 0, br: 0, bl: 4 });
    g.fillStyle(hat.lit, 0.9).fillRoundedRect(x - 4, y - 58, 22, 10, 5);
    g.fillStyle(0x6f4d21).fillRect(x - 25, y - 40, 50, 7);
    g.lineStyle(2.5, COAT_INK).strokeRoundedRect(x - 25, y - 60, 50, 32, { tl: 12, tr: 12, br: 4, bl: 4 }).strokeEllipse(x, y - 31, 74, 16);
    // The lure: a red and white spoon with a feather, on the brim's near side.
    g.fillStyle(0xd9534f).fillEllipse(x + 16, y - 44, 8, 12);
    g.fillStyle(0xf3f1ea).fillEllipse(x + 16, y - 47, 8, 6);
    g.lineStyle(2, 0x7fb7d9).lineBetween(x + 18, y - 50, x + 26, y - 60).lineBetween(x + 18, y - 50, x + 22, y - 62);
    // Wisps of grey hair escaping under the brim at the back.
    g.lineStyle(2.5, beard.face).lineBetween(x - 22, y - 24, x - 30, y - 18).lineBetween(x - 20, y - 26, x - 30, y - 24);
  }

  /** Two eyes on the water, a brow that drops with effort and lifts with luck, and the mouth the beard leaves room for. */
  private eyes(g: Phaser.GameObjects.Graphics, x: number, y: number, mood: Mood): void {
    const { effort, expression } = mood;
    const squint = expression === 'grin' ? 0.55 : expression === 'dismay' ? -0.2 : effort * 0.7;
    const ink = LAKESIDE.ink;
    for (const [ex, ey, size, near] of [[x + 13, y - 8, 1, true], [x - 6, y - 9, 0.8, false]] as const) {
      const h = 9 * size * Math.max(0.25, 1 - squint), w = 8 * size;
      g.fillStyle(0xfdfbf5).fillEllipse(ex, ey, w * 2, h * 2);
      // The pupil looks out toward the float, and rolls up in dismay.
      const px = ex + (expression === 'dismay' ? 0 : 2.5 * size), py = ey + (expression === 'dismay' ? -2 : 1) * size;
      g.fillStyle(ink).fillEllipse(px, py, 5 * size, Math.min(h * 1.6, 7 * size));
      g.fillStyle(0xffffff).fillCircle(px - 1.5, py - 2, 1.4);
      if (expression === 'grin') {
        // Crinkled with the smile: a lid drawn down over the top of the eye.
        g.fillStyle(MAN.skin.face).fillEllipse(ex, ey - h * 0.7, w * 2 + 2, h * 1.4);
      }
      // The brow: level when watching, pinched down with effort, arched up in surprise or delight.
      const arch = expression === 'grin' || (expression === 'wry' && near) ? -5 : expression === 'dismay' ? -4 : effort * 5;
      const pinch = expression === 'dismay' ? -3 : effort * 4;
      g.lineStyle(3.5 * size, 0xc9c1b0);
      g.beginPath().moveTo(ex - w - 1, ey - 12 * size - arch + pinch * (near ? 1 : -1)).lineTo(ex, ey - 15 * size - arch - (expression === 'wry' && near ? 3 : 0)).lineTo(ex + w + 1, ey - 12 * size - arch - pinch * (near ? 1 : -1)).strokePath();
    }
  }

  /** A full grey beard in two tones, parted for the mouth, which says what he thinks of the catch. */
  private beard(g: Phaser.GameObjects.Graphics, x: number, y: number, mood: Mood, beard: Faces): void {
    const { effort, expression } = mood;
    shape(g, [x - 24, y - 2, x + 22, y - 4, x + 26, y + 12, x + 18, y + 36, x + 4, y + 44, x - 10, y + 42, x - 22, y + 30, x - 26, y + 12], beard.face, shade(beard.face, -0.5), 2.5);
    g.fillStyle(beard.shade, 0.8);
    this.fillPoints(g, [x - 24, y - 2, x - 12, y - 2, x - 6, y + 40, x - 10, y + 42, x - 22, y + 30, x - 26, y + 12]);
    g.fillStyle(beard.lit, 0.9).fillEllipse(x + 10, y + 26, 14, 18);
    // Combed strokes give the beard body; the moustache sits over the top of the mouth.
    g.lineStyle(1.5, beard.shade, 0.7);
    for (let i = 0; i < 5; i++) g.lineBetween(x - 14 + i * 8, y + 14, x - 16 + i * 8, y + 32 + (i % 2) * 4);
    const mouthX = x + 8, mouthY = y + 10;
    if (expression === 'grin') {
      // A wide open grin: teeth, and the moustache lifted at both ends.
      shape(g, [mouthX - 13, mouthY - 2, mouthX + 13, mouthY - 3, mouthX + 9, mouthY + 10, mouthX - 8, mouthY + 11], 0x7a3c34, shade(beard.face, -0.5), 2);
      g.fillStyle(0xfdfbf5).fillRoundedRect(mouthX - 11, mouthY - 1, 22, 5, 2);
    } else if (effort > 0.45) {
      // Teeth gritted against the weight.
      g.fillStyle(0xfdfbf5).fillRoundedRect(mouthX - 11, mouthY - 1, 22, 8, 3);
      g.lineStyle(2, shade(beard.face, -0.5)).strokeRoundedRect(mouthX - 11, mouthY - 1, 22, 8, 3);
      g.lineStyle(1.2, LAKESIDE.ink, 0.6);
      for (let i = -6; i <= 6; i += 4) g.lineBetween(mouthX + i, mouthY - 1, mouthX + i, mouthY + 7);
    } else if (expression === 'dismay') {
      // A small round "oh" over a drooping moustache.
      g.fillStyle(0x7a3c34).fillEllipse(mouthX, mouthY + 4, 9, 9);
    } else if (expression === 'wry') {
      // Half a smile, on the near side only.
      g.lineStyle(2.5, shade(beard.face, -0.5)).beginPath().arc(mouthX + 3, mouthY, 8, 0.2, Math.PI * 0.75, false).strokePath();
    } else {
      g.lineStyle(2.5, shade(beard.face, -0.5)).beginPath().arc(mouthX, mouthY - 1, 8, 0.35, Math.PI - 0.35, false).strokePath();
    }
    // The moustache, lifted or drooped with the mouth.
    const droop = expression === 'dismay' ? 6 : expression === 'grin' ? -4 : 0;
    g.fillStyle(beard.lit).fillEllipse(mouthX - 9, mouthY - 5 + droop * 0.5, 16, 7).fillEllipse(mouthX + 9, mouthY - 5 + droop * 0.5, 16, 7);
    g.lineStyle(2, beard.shade, 0.8).lineBetween(mouthX - 16, mouthY - 3 + droop, mouthX - 8, mouthY - 7).lineBetween(mouthX + 16, mouthY - 3 + droop, mouthX + 8, mouthY - 7);
  }

  // ------------------------------------------------------------------ The gear

  /** Cork grip with its rings, a reel with a spool and a handle, the blank shaded along its length, and line guides. */
  private rod(g: Phaser.GameObjects.Graphics, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): void {
    const blank = faces(0x6a4b2f);
    this.curve(g, x0 + 2, y0 + 3, cx + 2, cy + 3, x1 + 1, y1 + 2, 9, blank.edge);
    this.curve(g, x0, y0, cx, cy, x1, y1, 8, blank.face);
    this.curve(g, x0 - 1, y0 - 2, cx - 1, cy - 2, x1, y1 - 1, 3, blank.lit);
    // Guides: small rings every so often along the blank, with the line threaded through them.
    for (const t of [0.42, 0.62, 0.8, 0.94]) {
      const u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      g.lineStyle(2, 0x9aa5ab).strokeCircle(px, py - 5, 4);
    }
    // The butt: a cork grip behind the hand and a short one in front of the reel.
    const cork = MAN.cork;
    g.fillStyle(cork.face).fillRoundedRect(x0 - 40, y0 + 6, 32, 12, 5);
    g.fillStyle(cork.shade).fillRoundedRect(x0 - 40, y0 + 12, 32, 6, { tl: 0, tr: 0, br: 5, bl: 5 });
    g.fillStyle(cork.lit).fillRoundedRect(x0 - 38, y0 + 7, 28, 3, 2);
    g.lineStyle(1.5, cork.edge, 0.7);
    for (let i = 0; i < 4; i++) g.lineBetween(x0 - 34 + i * 8, y0 + 6, x0 - 34 + i * 8, y0 + 18);
    g.fillStyle(blank.edge).fillCircle(x0 - 42, y0 + 12, 6);
    // The reel: a body under the blank, a spool with its face turned to the light, and a crank.
    const reel = MAN.reel;
    g.fillStyle(reel.edge).fillRoundedRect(x0 + 10, y0 + 2, 16, 10, 3);
    g.fillStyle(reel.face).fillCircle(x0 + 18, y0 + 16, 13);
    g.fillStyle(reel.shade).beginPath().arc(x0 + 18, y0 + 16, 13, 0.3, Math.PI * 0.9, false).lineTo(x0 + 18, y0 + 16).closePath().fillPath();
    g.fillStyle(0xb9c3c9).fillCircle(x0 + 18, y0 + 16, 8);
    g.fillStyle(reel.lit).fillCircle(x0 + 16, y0 + 14, 4);
    g.lineStyle(2.5, reel.edge).strokeCircle(x0 + 18, y0 + 16, 13).strokeCircle(x0 + 18, y0 + 16, 8);
    g.lineStyle(1.5, 0xf7f7f2, 0.6).strokeCircle(x0 + 18, y0 + 16, 10);
    g.lineStyle(3, reel.edge).lineBetween(x0 + 18, y0 + 16, x0 + 30, y0 + 26);
    g.fillStyle(0xd9853c).fillCircle(x0 + 31, y0 + 27, 3.5);
  }

  /** The float: red over white, a shine on the lit side, dragged under a little by each pull. */
  private float(g: Phaser.GameObjects.Graphics, now: number, bend: number): void {
    const bob = this.still ? 0 : Math.sin(now * 3) * 2;
    const fy = ENTRY.y + bob + bend * 10;
    g.fillStyle(LAKESIDE.deep, 0.35).fillEllipse(ENTRY.x + 6, fy + 9, 24, 6);
    g.fillStyle(0xf3f1ea).fillCircle(ENTRY.x, fy, 10);
    g.fillStyle(0xd9534f).beginPath().arc(ENTRY.x, fy, 10, Math.PI, 0, false).closePath().fillPath();
    g.fillStyle(0xa83a37).beginPath().arc(ENTRY.x, fy, 10, Math.PI * 1.55, 0, false).lineTo(ENTRY.x, fy).closePath().fillPath();
    g.fillStyle(0xffffff, 0.7).fillEllipse(ENTRY.x - 4, fy - 5, 5, 3);
    g.fillStyle(0xc9c1b0).fillEllipse(ENTRY.x, fy + 7, 10, 4);
    g.lineStyle(2, LAKESIDE.ink).strokeCircle(ENTRY.x, fy, 10);
    g.lineStyle(2.5, 0xf3d27c).lineBetween(ENTRY.x, fy - 10, ENTRY.x, fy - 20);
  }

  // ------------------------------------------------------------------ The catch

  /** Whatever is on the hook hangs beneath `(x, y)`, the end of the line; a fish hangs head up. */
  private drawCatch(g: Phaser.GameObjects.Graphics, x: number, y: number, finale: HaulFinale, fish: BigFish, roundId: number, ending: number): void {
    const drip = (dx: number, dy: number, phase: number): void => {
      if (this.still) return;
      const p = ((ending * 1.4 + phase) % 1);
      g.fillStyle(0xdff0f8, 0.8 * (1 - p)).fillEllipse(x + dx, y + dy + p * 60, 4, 7);
    };
    if (this.outcome === 'success') {
      const s = fish.size * BIG_FISH_SCALE;
      this.drawFish(g, x, y + 50 * s, finale.spin - Math.PI / 2, s, fish, true);
      drip(-12 * s, 70 * s, 0.2);
      drip(14 * s, 90 * s, 0.7);
      return;
    }
    if (this.outcome === 'partial') {
      this.drawFish(g, x, y + 50 * SMALL_FISH_SCALE, finale.spin - Math.PI / 2, SMALL_FISH_SCALE, SMALL_FISH, false);
      drip(6, 44, 0.4);
      return;
    }
    if (junkFor(roundId) === 'boot') this.boot(g, x, y + 50, finale.spin);
    else this.tyre(g, x, y + 40, finale.spin);
    drip(-28, 108, 0.1);
    drip(22, 104, 0.6);
  }

  /**
   * A fish facing right, rotated by `angle` and scaled by `s`; the look supplies its
   * colours. Its back is in shadow and its belly in light, it has scales, a gill and a
   * hooked mouth, and a big one gets a dorsal stripe and a fuller tail.
   */
  private drawFish(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, s: number, look: { colour: number; belly: number; fin: number }, big: boolean): void {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const place = (points: readonly number[]): number[] => {
      const out: number[] = [];
      for (let i = 0; i < points.length; i += 2) {
        const px = points[i]! * s, py = points[i + 1]! * s;
        out.push(x + px * cos - py * sin, y + px * sin + py * cos);
      }
      return out;
    };
    const at = (px: number, py: number): [number, number] => {
      const p = place([px, py]);
      return [p[0]!, p[1]!];
    };
    const ink = shade(look.colour, -0.55);
    const fin = faces(look.fin);
    // Tail and fins first, so the body overlaps their roots.
    shape(g, place([-40, 0, -62, -26, -54, -6, -56, 0, -54, 6, -62, 26]), fin.face, ink, 2.5);
    g.lineStyle(1.2, fin.edge, 0.7);
    for (const ry of [-16, -6, 6, 16]) g.lineBetween(...at(-44, ry * 0.3), ...at(-58, ry));
    shape(g, place(big ? [-10, -19, -2, -38, 8, -40, 18, -36, 24, -19] : [-6, -19, 8, -36, 20, -19]), fin.face, ink, 2.5);
    g.lineStyle(1.2, fin.edge, 0.7);
    for (const rx of [-4, 4, 12]) g.lineBetween(...at(rx, -20), ...at(rx + 2, -34));
    shape(g, place([4, 6, 16, 22, 26, 8]), fin.shade, ink, 2);
    // The body, then its shaded back and lit belly as two curved planes.
    shape(g, place([-40, 0, -28, -11, -10, -19, 12, -20, 32, -14, 46, -4, 50, 0, 46, 5, 32, 15, 12, 21, -10, 19, -28, 11]), look.colour, ink, 3);
    g.fillStyle(shade(look.colour, -0.28), 0.85);
    this.fillPoints(g, place([-36, -3, -28, -11, -10, -19, 12, -20, 32, -14, 44, -6, 30, -7, 12, -11, -10, -10, -28, -5]));
    g.fillStyle(look.belly, 0.9);
    this.fillPoints(g, place([-24, 8, -10, 16, 12, 19, 32, 13, 44, 5, 30, 4, 12, 6, -10, 5]));
    g.fillStyle(mix(look.belly, 0xffffff, 0.5), 0.6);
    this.fillPoints(g, place([-14, 12, -2, 16, 14, 17, 26, 12, 16, 11, 0, 10]));
    // Scales along the flank, a lateral line, and the gill behind the head.
    g.lineStyle(1.2, ink, 0.45);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const [sx, sy] = at(-22 + i * 11 + (row % 2) * 5, -6 + row * 6);
      g.beginPath().arc(sx, sy, 4 * s, angle + 0.3, angle + Math.PI - 0.3, false).strokePath();
    }
    g.lineStyle(1.5, ink, 0.5).lineBetween(...at(-30, 1), ...at(28, -2));
    g.lineStyle(2, ink, 0.7).beginPath().arc(...at(24, 0), 11 * s, angle - 1.1, angle + 1.1, false).strokePath();
    // The eye, and the mouth: hooked open, with the hook's bend showing at the lip.
    const [ex, ey] = at(34, -6);
    g.fillStyle(0xffffff).fillCircle(ex, ey, 5.5 * s + 1);
    g.fillStyle(LAKESIDE.ink).fillCircle(ex + s * cos, ey + s * sin, 3 * s + 0.5);
    g.fillStyle(0xffffff).fillCircle(ex - 1.5 * s, ey - 1.5 * s, 1.2 * s + 0.4);
    shape(g, place([44, 0, 51, -2, 52, 4, 46, 6]), shade(look.colour, -0.6), ink, 1.5);
    g.lineStyle(1.8, 0xd8dde0).beginPath().arc(...at(50, 1), 4 * s, angle + 0.5, angle + Math.PI * 1.4, false).strokePath();
    if (big) {
      // Highlights on the wet skin, where the light catches the curve of the back.
      g.fillStyle(0xffffff, 0.35).fillEllipse(...at(-6, -12), 22 * s, 5 * s);
      g.fillStyle(0xffffff, 0.25).fillEllipse(...at(24, -9), 10 * s, 4 * s);
    }
  }

  /** An old wellington: a torn shaft, a hole in the toe, weed, and a crab that came up with it. */
  private boot(g: Phaser.GameObjects.Graphics, x: number, y: number, sway: number): void {
    const dx = sway * 30;
    const rubber = faces(0x5a4a3c);
    shape(g, [x - 14 + dx, y - 50, x + 14 + dx, y - 46, x + 16, y - 2, x + 50, y + 10, x + 48, y + 26, x - 16, y + 26, x - 16, y - 2], rubber.face, 0x2c2420, 3);
    g.fillStyle(rubber.shade, 0.9);
    this.fillPoints(g, [x + 2 + dx, y - 47, x + 14 + dx, y - 46, x + 16, y - 2, x + 50, y + 10, x + 48, y + 26, x + 30, y + 26, x + 30, y + 8, x + 6, y]);
    g.fillStyle(rubber.lit, 0.8);
    this.fillPoints(g, [x - 12 + dx, y - 44, x - 6 + dx, y - 44, x - 8, y - 2, x - 14, y - 2]);
    // A cracked sole, a torn top, a strap flapping loose.
    g.fillStyle(0x2c2420).fillRoundedRect(x - 16, y + 18, 64, 10, 4);
    g.lineStyle(1.5, 0x5a5048, 0.8).lineBetween(x - 10, y + 23, x + 40, y + 23);
    g.fillStyle(0x7a685a).fillRoundedRect(x - 10 + dx, y - 50, 22, 8, 4);
    g.fillStyle(0x2c2420).fillTriangle(x + 6 + dx, y - 46, x + 14 + dx, y - 46, x + 12 + dx, y - 34);
    g.lineStyle(3, 0x7a685a).lineBetween(x - 14 + dx, y - 40, x - 26 + dx * 1.3, y - 26);
    // A hole in the toe with the water showing through it, and weed trailing off the heel.
    g.fillStyle(LAKESIDE.deep).fillEllipse(x + 36, y + 12, 12, 8);
    g.lineStyle(1.5, 0x2c2420).strokeEllipse(x + 36, y + 12, 12, 8);
    g.lineStyle(4, 0x557a4a).lineBetween(x - 12, y + 24, x - 22, y + 58).lineBetween(x + 20, y + 26, x + 24, y + 54);
    g.lineStyle(2, 0x8cb47a).lineBetween(x - 13, y + 26, x - 20, y + 50);
    this.crab(g, x + 30, y - 6);
  }

  /** A worn tyre: tread blocks around the rim, a shaded inner wall, weed, and a snail on the top. */
  private tyre(g: Phaser.GameObjects.Graphics, x: number, y: number, spin: number): void {
    const rubber = faces(0x2b2b2e);
    g.fillStyle(rubber.face).fillCircle(x, y, 40);
    g.fillStyle(rubber.shade).beginPath().arc(x, y, 40, 0.2, Math.PI * 0.9, false).lineTo(x, y).closePath().fillPath();
    g.fillStyle(rubber.lit, 0.9).beginPath().arc(x, y, 38, Math.PI * 1.05, Math.PI * 1.55, false).arc(x, y, 30, Math.PI * 1.55, Math.PI * 1.05, true).closePath().fillPath();
    g.lineStyle(3, rubber.edge).strokeCircle(x, y, 40);
    // Tread blocks, offset by the sway so the tyre turns a little on the line.
    g.lineStyle(4, rubber.edge);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + spin * 3;
      g.lineBetween(x + Math.cos(a) * 32, y + Math.sin(a) * 32, x + Math.cos(a) * 40, y + Math.sin(a) * 40);
    }
    // The inner wall, then the hole with what is behind it showing.
    g.fillStyle(rubber.edge).fillCircle(x, y, 22);
    g.fillStyle(y < SURFACE ? LAKESIDE.sky : LAKESIDE.water).fillCircle(x, y, 17);
    g.fillStyle(rubber.shade).beginPath().arc(x, y, 22, Math.PI * 1.1, Math.PI * 1.9, false).arc(x, y, 17, Math.PI * 1.9, Math.PI * 1.1, true).closePath().fillPath();
    g.lineStyle(2, 0x4a4a4e).strokeCircle(x, y, 17).strokeCircle(x, y, 30);
    g.lineStyle(1.5, 0x5e5e63, 0.8).strokeCircle(x, y, 26);
    // Weed hanging off the bottom, a bit of mud, and a snail riding the top.
    g.lineStyle(4, 0x557a4a).lineBetween(x - 20, y + 34, x - 30, y + 70).lineBetween(x + 14, y + 38, x + 20, y + 64);
    g.lineStyle(2, 0x8cb47a).lineBetween(x - 21, y + 36, x - 27, y + 60);
    g.fillStyle(0x6b5a3a, 0.8).fillEllipse(x + 8, y + 36, 24, 8);
    this.snail(g, x - 8, y - 40);
  }

  /** A small orange crab holding on with both claws, eyes on stalks. */
  private crab(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const body = faces(0xe07a3c);
    g.lineStyle(3, body.shade);
    for (const side of [-1, 1]) {
      g.lineBetween(x + side * 8, y + 4, x + side * 16, y + 12).lineBetween(x + side * 9, y + 6, x + side * 15, y + 16);
      g.lineBetween(x + side * 8, y - 2, x + side * 18, y - 8);
    }
    g.fillStyle(body.face).fillEllipse(x, y, 22, 14);
    g.fillStyle(body.lit).fillEllipse(x - 3, y - 3, 12, 6);
    g.lineStyle(2, body.edge).strokeEllipse(x, y, 22, 14);
    for (const side of [-1, 1]) {
      g.fillStyle(body.face).fillCircle(x + side * 19, y - 9, 5);
      g.lineStyle(2, body.edge).strokeCircle(x + side * 19, y - 9, 5);
      g.lineStyle(1.5, body.edge).lineBetween(x + side * 4, y - 6, x + side * 5, y - 12);
      g.fillStyle(0xffffff).fillCircle(x + side * 5, y - 13, 2.5);
      g.fillStyle(LAKESIDE.ink).fillCircle(x + side * 5, y - 13, 1.2);
    }
  }

  /** A snail with a spiralled shell, unbothered by the whole business. */
  private snail(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const foot = faces(0xa8b36a), shell = faces(0x8a5a3a);
    g.fillStyle(foot.face).fillEllipse(x + 4, y + 2, 30, 8);
    g.fillStyle(foot.lit).fillEllipse(x + 2, y, 18, 3);
    g.fillStyle(shell.face).fillCircle(x - 2, y - 8, 10);
    g.fillStyle(shell.shade).beginPath().arc(x - 2, y - 8, 10, 0.3, Math.PI * 0.9, false).lineTo(x - 2, y - 8).closePath().fillPath();
    g.lineStyle(2, shell.edge).strokeCircle(x - 2, y - 8, 10);
    g.lineStyle(1.5, shell.edge, 0.8).beginPath().arc(x - 2, y - 8, 6, 0, Math.PI * 1.5, false).arc(x - 1, y - 9, 2.5, Math.PI * 1.5, Math.PI * 3, false).strokePath();
    g.lineStyle(1.5, foot.edge).lineBetween(x + 14, y - 1, x + 18, y - 8).lineBetween(x + 12, y - 1, x + 14, y - 9);
    g.fillStyle(LAKESIDE.ink).fillCircle(x + 18, y - 9, 1.6).fillCircle(x + 14, y - 10, 1.6);
  }

  /** Water thrown up where the catch came out: a crown of drops and a spread of foam on the surface. */
  private splash(g: Phaser.GameObjects.Graphics, splash: number): void {
    if (splash <= 0) return;
    g.fillStyle(0xffffff, 0.75 * splash).fillEllipse(ENTRY.x, ENTRY.y + 4, 60 + splash * 120, 14 + splash * 18);
    g.fillStyle(0xbfe3f5, 0.5 * splash).fillEllipse(ENTRY.x, ENTRY.y + 6, 30 + splash * 60, 6 + splash * 6);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.15 + i * 0.116), d = 30 + splash * (70 + (i % 3) * 30);
      const px = ENTRY.x + Math.cos(a) * d * 1.3, py = ENTRY.y - Math.sin(a) * d + (1 - splash) * 40;
      g.fillStyle(0xffffff, 0.9 * splash).fillEllipse(px, py, 8 + (i % 2) * 4, 12 + (i % 2) * 6);
      g.fillStyle(0xbfe3f5, 0.7 * splash).fillEllipse(px + 2, py + 3, 4 + (i % 2) * 2, 6 + (i % 2) * 3);
    }
    g.lineStyle(2, 0xffffff, 0.6 * easeOut(splash)).strokeEllipse(ENTRY.x, ENTRY.y + 4, 90 + splash * 140, 20 + splash * 24);
  }

  private fillPoints(g: Phaser.GameObjects.Graphics, points: readonly number[]): void {
    g.beginPath().moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i]!, points[i + 1]!);
    g.closePath().fillPath();
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
