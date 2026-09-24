import type Phaser from 'phaser';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import { cubicContour, fillContour, traceContour } from '@/ui/illustration';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import { clamp01, easeOut, TURN_OPEN_SEC } from './motion';
import {
  BARBER_CUES, BARBER_MOTION, barberFinale, barberOutcome, cutTimes, snipOpening, tuftFall, type BarberOutcome,
} from './barberMotion';
import { barberLook, type BarberLook } from './barberLooks';

export const BARBER_INK = 0x33404d;

/** The customer's face, and the ellipse the hair grows from just outside it. */
const HEAD = { x: 40, y: -80, rx: 58, ry: 68 } as const;
const SCALP = { rx: 64, ry: 74 } as const;
/** Where the fringe hangs from, across the forehead. */
const HAIRLINE = HEAD.y - 52;
const FRINGE = { left: HEAD.x - 56, lock: 28 } as const;
/** The back of the mop runs from under the left ear, over the crown, to under the right. */
const BACK = { from: 150, lock: 30 } as const;
const FLOOR = 172;
const POLE = { x: -262, top: -168, bottom: 34, half: 22 } as const;
const STEEL = { face: 0xd3dade, edge: 0x59636b, shine: 0xf7fbfc } as const;

/** The mop every round starts from: past the ears at the sides, over the eyes in front. */
const LONG = { back: [56, 62, 60, 56, 56, 60, 62, 56], fringe: [56, 62, 60, 54] } as const;
/** What a finished cut leaves, lock by lock. Each task gets the next one. */
const STYLES = [
  // A short crop.
  { back: [12, 10, 12, 14, 14, 12, 10, 12], fringe: [12, 10, 10, 12] },
  // A quiff: short at the sides, the crown left standing.
  { back: [8, 10, 26, 36, 36, 26, 10, 8], fringe: [6, 6, 6, 6] },
  // A side parting, the fringe swept long to one side.
  { back: [14, 16, 18, 16, 14, 12, 10, 10], fringe: [28, 20, 12, 8] },
] as const;

interface Pose { readonly x: number; readonly y: number; readonly angle: number }

const rad = (deg: number): number => deg * Math.PI / 180;

/**
 * The barber: a shaggy customer under a cape, a pair of shears, and a cut that happens a
 * lock at a time on the player's judged snips. The demonstration snips the air beside the
 * mop, because nothing here waits between the example and the answer: if the example cut,
 * there would be nowhere to grow the hair back. The ending is the reveal — see
 * `barberFinale` — and it has three, from the round's accuracy.
 */
export class BarberVignette extends HouseholdVignette {
  private readonly look: BarberLook;
  private outcome: BarberOutcome | null = null;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xe9efe6, 0xf3e1b5);
    this.look = barberLook(lap);
  }

  public override reset(plan: RoundPlan): void {
    super.reset(plan);
    this.outcome = null;
  }

  public override finish(successful: boolean, contactSec: number, accuracy?: number): void {
    super.finish(successful, contactSec);
    this.outcome = successful ? 'success' : barberOutcome(accuracy ?? 0);
  }

  private get style() { return STYLES[((this.plan?.id ?? 1) - 1) % STYLES.length]!; }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const look = this.look, beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const targets = this.plan?.targets.length ?? 4;
    const outcome = ending >= 0 ? this.outcome : null;
    const finale = barberFinale(ending, outcome ?? 'fail', this.still);
    const times = cutTimes(this.watching ? [] : this.hitTimes, targets, this.finishAt, this.outcome);
    const cut = times.filter(t => t <= now).length;
    const lengths = times.map((t, i) => (t <= now ? this.shortLength(i) : this.longLength(i)));
    const flinch = now - this.errorAt;
    const dx = !this.still && flinch >= 0 && flinch < 0.35 ? Math.sin(flinch * 46) * 6 * (1 - flinch / 0.35) : 0;

    this.shop(now, ending, outcome);
    this.chair();
    if (finale.cape > 0) this.shirt();
    // Neck, then the mop behind the head, the ears, the face, and the fringe over it.
    shape(g, [HEAD.x - 22 + dx, HEAD.y + 44, HEAD.x + 22 + dx, HEAD.y + 44, HEAD.x + 24, 22, HEAD.x - 24, 22], look.skin, look.skinInk, 2.5);
    g.fillStyle(shade(look.skin, -0.18), 0.5).fillRect(HEAD.x - 20 + dx, HEAD.y + 50, 40, 12);
    this.backHair(lengths.slice(0, BARBER_MOTION.backLocks), dx);
    for (const side of [-1, 1]) {
      g.fillStyle(look.skin).fillEllipse(HEAD.x + dx + side * 57, HEAD.y + 2, 18, 28);
      g.lineStyle(2.5, look.skinInk).strokeEllipse(HEAD.x + dx + side * 57, HEAD.y + 2, 18, 28);
    }
    shape(g, this.ellipse(HEAD.x + dx, HEAD.y, HEAD.rx, HEAD.ry), look.skin, look.skinInk, 3);
    this.face(dx, finale, outcome, ending);
    this.fringe(lengths.slice(BARBER_MOTION.backLocks), dx);
    if (finale.cape < 1) this.cape(finale.cape);
    this.tufts(times, now);
    if (finale.hat > 0) this.hat(finale.hat, finale.squash, dx);
    if (finale.shine > 0) this.shine(finale.shine, now);
    this.shearsFor(now, ending, times, cut, beat);
  }

  private longLength(lock: number): number {
    const back = BARBER_MOTION.backLocks;
    return lock < back ? LONG.back[lock]! : LONG.fringe[lock - back]!;
  }

  private shortLength(lock: number): number {
    const back = BARBER_MOTION.backLocks, style = this.style;
    return lock < back ? style.back[lock]! : style.fringe[lock - back]!;
  }

  // ------------------------------------------------------------------ The shop

  private shop(now: number, ending: number, outcome: BarberOutcome | null): void {
    const g = this.art, look = this.look;
    slab(g, -340, -228, 680, 460, look.wall, 34, shade(look.wall, -0.4));
    // Wainscot under a moulding, then a chequered floor.
    g.fillStyle(look.wainscot).fillRect(-326, 62, 652, FLOOR - 62);
    g.lineStyle(3, shade(look.wainscot, -0.25)).lineBetween(-326, 62, 326, 62);
    g.lineStyle(2, shade(look.wainscot, -0.18), 0.6);
    for (let x = -300; x <= 300; x += 48) g.lineBetween(x, 72, x, FLOOR - 6);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      const x = -312 + col * 39, y = FLOOR + row * 27;
      g.fillStyle((row + col) % 2 ? 0x57524e : 0xece6da).fillRect(x, y, 39, row ? 26 : 27);
    }
    g.lineStyle(3, 0x4a4541, 0.5).lineBetween(-312, FLOOR, 312, FLOOR);
    this.pole(now, ending, outcome);
    this.shelf();
  }

  /** The striped pole turns slowly all round, and spins for a clean cut. */
  private pole(now: number, ending: number, outcome: BarberOutcome | null): void {
    const g = this.art, { x, top, bottom, half } = POLE;
    const spin = outcome === 'success' && ending > BARBER_CUES.success.capeAt ? (ending - BARBER_CUES.success.capeAt) * 1.8 : 0;
    const phase = this.still ? 0 : (now * 0.3 + spin) % 1;
    g.fillStyle(0x3a3f45, 0.18).fillRoundedRect(x - half + 6, top + 6, half * 2, bottom - top, half);
    g.fillStyle(0xf8f5ef).fillRect(x - half, top, half * 2, bottom - top);
    const pitch = 54, rise = 30;
    for (let k = -2; k < (bottom - top) / pitch + 2; k++) {
      const y = top + (k + phase) * pitch;
      for (const [offset, colour] of [[0, 0xc9453a], [pitch / 2, 0x3b6ea5]] as const) {
        const band = this.clipY([x - half, y + offset + rise, x + half, y + offset, x + half, y + offset + 14, x - half, y + offset + rise + 14], top, bottom);
        if (band.length >= 6) this.fillPolygon(band, colour);
      }
    }
    // The glass is round: a shade down one side, a highlight down the other.
    g.fillStyle(0x2a3d52, 0.18).fillRect(x + half * 0.35, top, half * 0.65, bottom - top);
    g.fillStyle(0xffffff, 0.45).fillRect(x - half * 0.7, top, 5, bottom - top);
    g.lineStyle(3, 0x59636b).strokeRect(x - half, top, half * 2, bottom - top);
    for (const [y, dir] of [[top, -1], [bottom, 1]] as const) {
      slab(g, x - half - 5, y - (dir < 0 ? 12 : 0), half * 2 + 10, 12, STEEL.face, 5, STEEL.edge);
      g.fillStyle(STEEL.face).fillCircle(x, y + dir * 20, 11);
      g.lineStyle(2.5, STEEL.edge).strokeCircle(x, y + dir * 20, 11);
    }
    g.lineStyle(5, STEEL.edge).lineBetween(x + half + 4, top + 30, x + half + 22, top + 30);
  }

  /** A shelf with a jar of combs in blue disinfectant and a bottle of tonic. */
  private shelf(): void {
    const g = this.art;
    slab(g, 196, -14, 128, 14, 0xb9885a, 4, 0x6f4d2e);
    g.lineStyle(4, 0x6f4d2e).lineBetween(214, 0, 222, 20).lineBetween(306, 0, 298, 20);
    // Combs first, so the jar's glass is over their teeth.
    for (const [cx, tilt, colour] of [[228, -0.2, 0x2f3438], [246, 0.18, 0xd8554a]] as const) {
      g.lineStyle(6, colour).lineBetween(cx, -44, cx + tilt * 60, -98);
    }
    g.fillStyle(0x3f93c9).fillRoundedRect(214, -60, 44, 46, 6);
    g.fillStyle(0x79bde2, 0.8).fillEllipse(236, -60, 44, 10);
    g.fillStyle(0xe9f6fb, 0.35).fillRoundedRect(214, -74, 44, 60, 6);
    g.lineStyle(2.5, 0x3b6e8f).strokeRoundedRect(214, -74, 44, 60, 6);
    g.fillStyle(0xffffff, 0.5).fillRect(219, -70, 5, 50);
    // The tonic: amber glass, a cream label and a black cap.
    shape(g, [282, -14, 308, -14, 308, -58, 300, -70, 300, -82, 290, -82, 290, -70, 282, -58], 0xc98a3a, 0x7a4d1c, 2.5);
    g.fillStyle(0xf4ead3).fillRect(284, -48, 22, 18);
    g.fillStyle(0x2f3438).fillRect(289, -90, 12, 9);
  }

  private chair(): void {
    const g = this.art;
    // Pedestal and footplate below the cape; chrome arms and leather pads either side.
    g.fillStyle(0x3a3f45, 0.2).fillEllipse(HEAD.x + 8, 222, 250, 22);
    slab(g, HEAD.x - 14, 184, 28, 30, STEEL.face, 5, STEEL.edge);
    g.fillStyle(STEEL.face).fillEllipse(HEAD.x, 214, 170, 18);
    g.lineStyle(3, STEEL.edge).strokeEllipse(HEAD.x, 214, 170, 18);
    g.fillStyle(STEEL.shine, 0.7).fillEllipse(HEAD.x - 30, 211, 60, 5);
    for (const side of [-1, 1]) {
      const x = HEAD.x + side * 190;
      g.lineStyle(9, STEEL.edge).lineBetween(x, 128, x, 176);
      g.lineStyle(5, STEEL.face).lineBetween(x - 1, 128, x - 1, 176);
      slab(g, x - 34, 108, 68, 24, 0x8f2f2a, 11, 0x531915);
      g.fillStyle(0xffffff, 0.22).fillRoundedRect(x - 26, 112, 52, 6, 3);
    }
  }

  // ------------------------------------------------------------------ The customer

  /** What the cape was hiding: shoulders in a shirt, a collar and a bow tie. */
  private shirt(): void {
    const g = this.art, look = this.look, x = HEAD.x;
    shape(g, [x - 30, 14, x + 30, 14, x + 112, 46, x + 134, 120, x + 146, 196, x - 146, 196, x - 134, 120, x - 112, 46], look.shirt, shade(look.shirt, -0.45), 3);
    g.lineStyle(3, shade(look.shirt, -0.2), 0.7).lineBetween(x - 100, 70, x - 116, 190).lineBetween(x + 100, 70, x + 116, 190);
    for (const side of [-1, 1]) {
      shape(g, [x + side * 4, 20, x + side * 34, 10, x + side * 30, 40], 0xfbf8f1, shade(look.shirt, -0.45), 2.5);
    }
    shape(g, [x, 30, x - 24, 18, x - 24, 44], look.tie, shade(look.tie, -0.4), 2.5);
    shape(g, [x, 30, x + 24, 18, x + 24, 44], look.tie, shade(look.tie, -0.4), 2.5);
    g.fillStyle(shade(look.tie, -0.15)).fillCircle(x, 30, 7);
  }

  /** The cape whisks off to the right in a swirl, pivoting at the neck. */
  private cape(gone: number): void {
    const g = this.art, look = this.look, x = HEAD.x;
    const outline: number[] = [x - 44, 12, ...cubicContour(x + 44, 12, [[x + 124, 16, x + 172, 92, x + 178, 190]])];
    // A hem that hangs in shallow folds.
    for (let k = 1; k < 14; k++) outline.push(x + 178 - k * 356 / 14, 192 + (k % 2 ? 7 : 0));
    outline.push(...cubicContour(x - 178, 190, [[x - 172, 92, x - 124, 16, x - 44, 12]]));
    const alpha = 1 - clamp01((gone - 0.7) / 0.3);
    const move = (points: readonly number[]): number[] => this.swirl(points, gone);
    this.fillPolygon(move(outline.map((v, i) => v + (i % 2 ? 8 : 6))), shade(look.cape, -0.35), 0.35 * alpha);
    this.fillPolygon(move(outline), look.cape, alpha);
    for (let k = -5; k <= 5; k++) {
      const line = move([x + k * 8, 18, x + k * 31, 188]);
      g.lineStyle(2, look.stripe, 0.55 * alpha).lineBetween(line[0]!, line[1]!, line[2]!, line[3]!);
    }
    this.strokePolygon(move(outline), 3, look.capeInk, alpha);
    // The paper strip round the neck, with the cape's snap at the front.
    const collar = move([x - 30, 6, x + 30, 6, x + 34, 22, x - 34, 22]);
    this.fillPolygon(collar, 0xfbf8f1, alpha);
    this.strokePolygon(collar, 2, 0xb9b1a2, alpha);
    const snap = move([x, 15]);
    g.fillStyle(STEEL.face, alpha).fillCircle(snap[0]!, snap[1]!, 4.5);
  }

  private swirl(points: readonly number[], gone: number): number[] {
    if (gone <= 0) return [...points];
    const turn = gone * 0.7, c = Math.cos(turn), s = Math.sin(turn);
    const ox = gone * 470, oy = -Math.sin(gone * Math.PI) * 80;
    const out: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const px = points[i]! - HEAD.x, py = points[i + 1]! - 12;
      out.push(HEAD.x + px * c - py * s + ox, 12 + px * s + py * c + oy);
    }
    return out;
  }

  private backHair(lengths: readonly number[], dx: number): void {
    const g = this.art, look = this.look;
    const points: number[] = [];
    const last = BACK.from + BACK.lock * lengths.length;
    for (let a = BACK.from; a <= last; a += 3) {
      const u = (a - BACK.from) / BACK.lock, i = Math.min(lengths.length - 1, Math.floor(u)), f = u - i;
      const taper = clamp01((a - BACK.from) / 14) * clamp01((last - a) / 14);
      points.push(...this.around(a, lengths[i]! * (0.7 + 0.3 * Math.sin(f * Math.PI) ** 0.6) * taper, dx));
    }
    // Close along the inside of the face, which is drawn over it.
    for (let a = last; a >= BACK.from; a -= 10) {
      const r = rad(a);
      points.push(HEAD.x + dx + Math.cos(r) * HEAD.rx * 0.8, HEAD.y + Math.sin(r) * HEAD.ry * 0.8);
    }
    shape(g, points, look.hair, look.hairInk, 3);
    // Two strands down each lock, following its length.
    g.lineStyle(3, look.hairLit, 0.75);
    lengths.forEach((length, i) => {
      for (const offset of [-7, 6]) {
        const a = BACK.from + BACK.lock * (i + 0.5) + offset;
        const [x1, y1] = this.around(a, length * 0.15, dx), [x2, y2] = this.around(a + offset * 0.3, length * 0.62, dx);
        g.lineBetween(x1, y1, x2, y2);
      }
    });
  }

  /** A point `length` beyond the scalp at angle `deg`: long hair at the sides hangs. */
  private around(deg: number, length: number, dx = 0): [number, number] {
    const r = rad(deg), c = Math.cos(r), s = Math.sin(r);
    return [HEAD.x + dx + c * (SCALP.rx + length), HEAD.y + s * (SCALP.ry + length) + Math.abs(c) * length * 0.55];
  }

  /** The top of the face at `x`, which the fringe sits on. */
  private crown(x: number): number {
    const t = Math.max(-1, Math.min(1, (x - HEAD.x) / HEAD.rx));
    return HEAD.y - HEAD.ry * Math.sqrt(1 - t * t);
  }

  private fringe(lengths: readonly number[], dx: number): void {
    const g = this.art, look = this.look, width = FRINGE.lock * lengths.length;
    const points: number[] = [];
    for (let k = 0; k <= 16; k++) {
      const x = FRINGE.left + width * k / 16;
      points.push(x + dx, this.crown(x) - 6);
    }
    for (let k = 64; k >= 0; k--) {
      const x = FRINGE.left + width * k / 64;
      const u = (x - FRINGE.left) / FRINGE.lock, j = Math.min(lengths.length - 1, Math.floor(u)), f = u - j;
      const hem = HAIRLINE + lengths[j]! * (0.72 + 0.28 * Math.sin(f * Math.PI) ** 0.6);
      points.push(x + dx, Math.max(this.crown(x) + 2, hem));
    }
    shape(g, points, look.hair, look.hairInk, 3);
    g.lineStyle(3, look.hairLit, 0.75);
    lengths.forEach((length, j) => {
      const x = FRINGE.left + FRINGE.lock * (j + 0.5) + dx;
      if (length > 14) g.lineBetween(x - 3, this.crown(x) + 6, x + 2, HAIRLINE + length * 0.62);
    });
  }

  private face(dx: number, finale: ReturnType<typeof barberFinale>, outcome: BarberOutcome | null, ending: number): void {
    const g = this.art, look = this.look, x = HEAD.x + dx, eyeY = HEAD.y - 6;
    const alarmed = outcome === 'fail', resigned = alarmed && ending > BARBER_CUES.fail.hatLands + 0.35;
    const open = finale.eyes > 0.5;
    for (const side of [-1, 1]) {
      const ex = x + side * 22;
      g.fillStyle(look.blush, 0.45).fillEllipse(ex + side * 8, HEAD.y + 22, 24, 13);
      // Brows: knitted while the shears are near, up for the reveal, one cocked for a middling cut.
      const lift = open ? (outcome === 'partial' ? (side < 0 ? 10 : 0) : alarmed && !resigned ? 12 : 6) : 0;
      g.lineStyle(4, look.hairInk).lineBetween(ex - 11, eyeY - 18 - lift + (open ? 0 : side * -2), ex + 11, eyeY - 18 - lift + (open ? 0 : side * 2));
      if (!open) {
        // Squeezed shut: a tight arc and a crease at the outer corner.
        g.lineStyle(3.5, look.skinInk).beginPath().arc(ex, eyeY + 4, 9, Math.PI * 1.15, Math.PI * 1.85).strokePath();
        g.lineStyle(2, look.skinInk, 0.7).lineBetween(ex + side * 11, eyeY - 1, ex + side * 16, eyeY - 4);
        continue;
      }
      const tall = resigned ? 13 : alarmed ? 22 : 18;
      g.fillStyle(0xfffaf0).fillEllipse(ex, eyeY, 18, tall);
      g.lineStyle(2, look.skinInk).strokeEllipse(ex, eyeY, 18, tall);
      const gaze = outcome === 'partial' ? { x: -3, y: -3 } : { x: 0, y: 1 };
      g.fillStyle(0x2f2826).fillCircle(ex + gaze.x, eyeY + gaze.y, alarmed ? 3.5 : 5);
      if (!alarmed) g.fillStyle(0xffffff).fillCircle(ex + gaze.x + 2, eyeY + gaze.y - 2, 1.8);
      if (resigned) {
        // Heavy lids: it is not coming off.
        g.fillStyle(look.skin).fillRect(ex - 10, eyeY - 8, 20, 8);
        g.lineStyle(2.5, look.skinInk).lineBetween(ex - 9, eyeY, ex + 9, eyeY);
      }
    }
    // Nose, then the mouth for the moment.
    g.lineStyle(3, look.skinInk).beginPath().moveTo(x + 2, HEAD.y + 2).lineTo(x - 7, HEAD.y + 22).lineTo(x + 5, HEAD.y + 24).strokePath();
    const mouthY = HEAD.y + 40;
    if (!open) {
      // Gritted teeth: the shears are close.
      g.fillStyle(0xfffaf0).fillRoundedRect(x - 17, mouthY - 6, 34, 12, 5);
      g.lineStyle(2, look.skinInk).strokeRoundedRect(x - 17, mouthY - 6, 34, 12, 5).lineBetween(x - 17, mouthY, x + 17, mouthY);
      for (const tx of [-8, 0, 8]) g.lineBetween(x + tx, mouthY - 6, x + tx, mouthY + 6);
    } else if (outcome === 'success') {
      shape(g, [x - 24, mouthY - 6, x + 24, mouthY - 6, x + 17, mouthY + 10, x, mouthY + 16, x - 17, mouthY + 10], 0x8f3b3b, look.skinInk, 2.5);
      g.fillStyle(0xfffaf0).fillRect(x - 20, mouthY - 5, 40, 6);
    } else if (outcome === 'partial') {
      g.lineStyle(3.5, look.skinInk).beginPath().moveTo(x - 16, mouthY + 4).lineTo(x - 5, mouthY).lineTo(x + 5, mouthY + 3).lineTo(x + 16, mouthY - 3).strokePath();
    } else if (resigned) {
      g.lineStyle(3.5, look.skinInk).lineBetween(x - 12, mouthY + 2, x + 12, mouthY + 2);
    } else {
      g.fillStyle(0x6e2f2f).fillEllipse(x, mouthY + 2, 16, 20);
      g.lineStyle(2.5, look.skinInk).strokeEllipse(x, mouthY + 2, 16, 20);
    }
  }

  /**
   * Each cut lock drops a tuft — a curved wisp, not a blob, so the floor reads as
   * clippings — which tumbles to the floor and stays there.
   */
  private tufts(times: readonly number[], now: number): void {
    const g = this.art, look = this.look;
    times.forEach((time, lock) => {
      if (time > now) return;
      const fall = tuftFall(now - time, this.still);
      const long = this.longLength(lock), short = this.shortLength(lock);
      const length = 16 + (long - short) * 0.7, width = 5 + (long - short) * 0.1;
      const back = lock < BARBER_MOTION.backLocks;
      const [sx, sy] = back
        ? this.around(BACK.from + BACK.lock * (lock + 0.5), (long + short) / 2)
        : [FRINGE.left + FRINGE.lock * (lock - BARBER_MOTION.backLocks + 0.5), HAIRLINE + (long + short) / 2];
      const drift = (lock % 2 ? 22 : -18) + (lock % 3) * 6;
      const x = sx + drift * Math.sin(fall * Math.PI * 0.5), y = sy + (FLOOR + 32 + (lock % 3) * 8 - sy) * fall;
      // Hanging as it was cut, then turning over to lie flat on the tiles.
      const lie = (lock % 2 ? 0.25 : -0.25) + (lock % 3 - 1) * 0.3;
      const spin = back ? rad(BACK.from + BACK.lock * (lock + 0.5)) : Math.PI / 2;
      const angle = spin + (lie - spin) * fall + (this.still ? 0 : Math.sin(fall * Math.PI) * 1.2);
      const bend = lock % 2 ? 0.5 : -0.5, c = Math.cos(angle), s = Math.sin(angle);
      const spine = (t: number): [number, number] => {
        const u = (t - 0.5) * length, v = Math.sin(t * Math.PI) * bend * length * 0.3;
        return [x + u * c - v * s, y + u * s + v * c];
      };
      const points: number[] = [], back_: number[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, [px, py] = spine(t), w = width * Math.sin(t * Math.PI) ** 0.7;
        points.push(px - s * w, py + c * w);
        back_.unshift(px + s * w, py - c * w);
      }
      shape(g, [...points, ...back_], look.hair, look.hairInk, 2);
      const [ax, ay] = spine(0.2), [bx, by] = spine(0.8);
      g.lineStyle(2, look.hairLit, 0.8).lineBetween(ax, ay, bx, by);
    });
  }

  /** A rough round's cover-up: a knitted beanie with a bobble, dropped over the damage. */
  private hat(drop: number, squash: number, dx: number): void {
    const g = this.art, look = this.look;
    const x = HEAD.x + dx, brim = HEAD.y - 32 - (1 - drop) * 280;
    const sx = 1 + squash * 0.1, sy = 1 - squash * 0.14;
    const alpha = clamp01(drop * 4);
    const dome: number[] = [];
    for (let k = 0; k <= 24; k++) {
      const a = Math.PI + k / 24 * Math.PI;
      dome.push(x + Math.cos(a) * 84 * sx, brim + Math.sin(a) * 80 * sy);
    }
    this.fillPolygon(dome, look.hat, alpha);
    this.strokePolygon(dome, 3, look.hatRib, alpha);
    g.lineStyle(2.5, look.hatRib, 0.6 * alpha);
    for (let k = -3; k <= 3; k++) g.lineBetween(x + k * 20 * sx, brim - 6, x + k * 14 * sx, brim - 66 * sy + Math.abs(k) * 6);
    g.fillStyle(shade(look.hat, -0.1), alpha).fillRoundedRect(x - 90 * sx, brim - 12, 180 * sx, 28, 10);
    g.lineStyle(3, look.hatRib, alpha).strokeRoundedRect(x - 90 * sx, brim - 12, 180 * sx, 28, 10);
    g.lineStyle(3, look.hatRib, 0.7 * alpha);
    for (let k = -8; k <= 8; k++) g.lineBetween(x + k * 10 * sx, brim - 8, x + k * 10 * sx, brim + 12);
    const top = brim - 80 * sy;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      g.fillStyle(shade(look.hat, 0.35), alpha).fillCircle(x + Math.cos(a) * 11, top - 12 + Math.sin(a) * 11, 10);
    }
    g.fillStyle(shade(look.hat, 0.45), alpha).fillCircle(x, top - 12, 12);
  }

  /** A fresh cut catches the light: a gloss along the crown and a burst of glints round it. */
  private shine(amount: number, now: number): void {
    const g = this.art, twinkle = this.still ? 1 : 0.8 + Math.sin(now * 9) * 0.2;
    g.lineStyle(6, 0xffffff, 0.45 * amount).beginPath().arc(HEAD.x - 4, HEAD.y - 4, SCALP.ry + 4, rad(215), rad(262)).strokePath();
    g.lineStyle(3, 0xffffff, 0.6 * amount).beginPath().arc(HEAD.x - 4, HEAD.y - 4, SCALP.ry - 4, rad(225), rad(250)).strokePath();
    const glints = [[-74, -70, 16], [-40, -126, 21], [44, -124, 24], [86, -60, 15], [0, -150, 12]] as const;
    glints.forEach(([x, y, r], i) => {
      const pop = this.still ? 1 : easeOut(amount * 1.6 - i * 0.12);
      sparkle(g, HEAD.x + x, HEAD.y + y, r * pop * twinkle, pop);
    });
  }

  // ------------------------------------------------------------------ The shears

  private shearsFor(now: number, ending: number, times: readonly number[], cut: number, beat: number): void {
    const locks = BARBER_MOTION.locks;
    const { order } = BARBER_MOTION, next = order[Math.min(cut, locks - 1)]!;
    let pose: Pose;
    if (this.watching) {
      // The example snips the air just beside the first lock, and cuts nothing.
      pose = this.nudge(this.poseAt(next), 26);
    } else {
      // Each cut moves the blades on from the first lock that cut took to the next one
      // still long; the first moves them in from the air-snipping pose to the hair.
      const last = cut > 0 ? times[order[cut - 1]!]! : this.plan?.response ?? -Infinity;
      const from = cut > 0 ? this.poseAt(order.find(lock => times[lock] === last)!) : this.nudge(this.poseAt(order[0]), 26);
      const travel = easeOut((now - last) / (cut > 0 ? BARBER_MOTION.travelSec : TURN_OPEN_SEC));
      pose = this.blend(from, this.poseAt(next), travel);
    }
    // After the round the shears leave: up out of frame for the reveal, or to the shelf.
    if (ending >= 0) {
      const success = this.outcome === 'success';
      const away = easeOut((ending - (success ? 0.3 : 0.1)) / 0.3);
      pose = this.blend(pose, success ? { x: 250, y: -420, angle: -1.2 } : { x: 268, y: -166, angle: 2.3 }, away);
    }
    // A clean round's blades snip the flurry; otherwise they close as they are put down.
    let struck = this.strikeAt;
    if (ending >= 0 && this.outcome === 'success') {
      for (const at of BARBER_MOTION.flurry) if (at <= ending) struck = this.finishAt! + at;
    }
    const open = snipOpening(now - struck, beat) * (ending >= 0 && this.outcome !== 'success' ? 0.2 : 1);
    this.shears(pose, open);
    const age = now - struck;
    if (age >= 0 && age < 0.16 && !this.still && (ending < 0.4 || ending === -Infinity)) {
      // A little flash where the blades meet, so a snip is seen as well as heard.
      const p = age / 0.16, c = Math.cos(pose.angle), s = Math.sin(pose.angle);
      const mx = pose.x + c * 34, my = pose.y + s * 34;
      this.art.lineStyle(3, 0xfff3c4, 1 - p);
      for (let k = 0; k < 4; k++) {
        const a = pose.angle + Math.PI / 2 + (k - 1.5) * 0.7;
        this.art.lineBetween(mx + Math.cos(a) * (8 + p * 8), my + Math.sin(a) * (8 + p * 8), mx + Math.cos(a) * (16 + p * 14), my + Math.sin(a) * (16 + p * 14));
      }
    }
  }

  /**
   * Where the shears sit to cut a lock: blades across it at its finished length, the cut
   * mid-blade, and the finger rings on whichever side keeps them off the face.
   */
  private poseAt(lock: number): Pose {
    const back = BARBER_MOTION.backLocks;
    if (lock < back) {
      const a = BACK.from + BACK.lock * (lock + 0.5), r = rad(a);
      const [cx, cy] = this.around(a, this.shortLength(lock) + 4);
      // Of the two directions along the tangent, the one whose handles point out and up.
      const tx = -Math.sin(r), ty = Math.cos(r), wantX = Math.cos(r) * 0.5, wantY = Math.sin(r) * 0.5 - 1;
      const flip = -tx * wantX - ty * wantY < 0 ? -1 : 1;
      const angle = Math.atan2(ty * flip, tx * flip);
      return { x: cx - Math.cos(angle) * 34, y: cy - Math.sin(angle) * 34, angle };
    }
    const j = lock - back;
    const cx = FRINGE.left + FRINGE.lock * (j + 0.5), cy = Math.max(HAIRLINE + this.shortLength(lock) + 2, this.crown(cx) + 4);
    // Across the forehead, tips to the left and the rings off to the right.
    return { x: cx + 34, y: cy, angle: Math.PI };
  }

  /** The same pose pushed out from the head, for snipping the air. */
  private nudge(pose: Pose, by: number): Pose {
    const ox = pose.x - HEAD.x, oy = pose.y - HEAD.y, d = Math.hypot(ox, oy) || 1;
    return { ...pose, x: pose.x + ox / d * by, y: pose.y + oy / d * by };
  }

  private blend(a: Pose, b: Pose, t: number): Pose {
    let turn = b.angle - a.angle;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle + turn * t };
  }

  /** Long barber's shears: two blades through a brass pivot, finger rings behind. */
  private shears(pose: Pose, open: number): void {
    const g = this.art, spread = 0.04 + open * 0.3;
    for (const side of [-1, 1]) {
      const a = pose.angle + side * spread, c = Math.cos(a), s = Math.sin(a);
      const nx = -s, ny = c;
      // The handle is the same piece as the blade, on the far side of the pivot.
      const hx = -c, hy = -s, ring = side < 0 ? 12 : 10;
      const rx = pose.x + hx * 44 + nx * side * 10, ry = pose.y + hy * 44 + ny * side * 10;
      g.lineStyle(7, STEEL.edge).lineBetween(pose.x, pose.y, rx - hx * ring, ry - hy * ring);
      g.lineStyle(4, STEEL.face).lineBetween(pose.x, pose.y, rx - hx * ring, ry - hy * ring);
      g.lineStyle(6, 0x2f3438).strokeCircle(rx, ry, ring);
      if (side < 0) g.lineStyle(4, 0x2f3438).lineBetween(rx + nx * side * 10, ry + ny * side * 10, rx + nx * side * 20 + hx * 8, ry + ny * side * 20 + hy * 8);
      shape(g, [pose.x + nx * 5, pose.y + ny * 5, pose.x + c * 68, pose.y + s * 68, pose.x - nx * 4, pose.y - ny * 4], STEEL.face, STEEL.edge, 2.5);
      g.lineStyle(1.5, STEEL.shine, 0.9).lineBetween(pose.x + nx * 2 + c * 10, pose.y + ny * 2 + s * 10, pose.x + c * 56, pose.y + s * 56);
    }
    g.fillStyle(0xd9a33a).fillCircle(pose.x, pose.y, 5.5);
    g.lineStyle(2, 0x8a6420).strokeCircle(pose.x, pose.y, 5.5);
  }

  // ------------------------------------------------------------------ Geometry

  private ellipse(x: number, y: number, rx: number, ry: number): number[] {
    const points: number[] = [];
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * Math.PI * 2;
      points.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
    }
    return points;
  }

  private fillPolygon(points: readonly number[], colour: number, alpha = 1): void {
    this.art.fillStyle(colour, alpha);
    fillContour(this.art, points);
  }

  private strokePolygon(points: readonly number[], width: number, colour: number, alpha = 1): void {
    this.art.lineStyle(width, colour, alpha);
    traceContour(this.art, points);
    this.art.closePath().strokePath();
  }

  /** A convex polygon cut to a horizontal band, so the pole's stripes stay inside the glass. */
  private clipY(points: readonly number[], top: number, bottom: number): number[] {
    const clip = (input: readonly number[], keep: (y: number) => boolean, edge: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < input.length; i += 2) {
        const ax = input[i]!, ay = input[i + 1]!;
        const bx = input[(i + 2) % input.length]!, by = input[(i + 3) % input.length]!;
        if (keep(ay)) out.push(ax, ay);
        if (keep(ay) !== keep(by)) {
          const t = (edge - ay) / (by - ay);
          out.push(ax + (bx - ax) * t, edge);
        }
      }
      return out;
    };
    return clip(clip(points, y => y >= top, top), y => y <= bottom, bottom);
  }
}
