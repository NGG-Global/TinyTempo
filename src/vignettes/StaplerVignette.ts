import type Phaser from 'phaser';
import { faces } from '@/ui/light';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { pileFinale, staplerClose, staplerJaw } from './errandMotion';
import { staplerLook, type StaplerLook } from './staplerLooks';
import { clamp01 } from './motion';

/** The pile in an oblique view: a back edge, a front edge below and left, and a thickness. */
const PILE = { backLeft: -190, backRight: 210, backY: 10, frontLeft: -236, frontRight: 164, frontY: 96, thick: 74 } as const;
const PILE_SKEW = (PILE.frontLeft - PILE.backLeft) / (PILE.frontY - PILE.backY);
const SHEETS = 9;
const STAPLER_DEPTH = 36;
const STAPLER_LENGTH = 124;
const STAPLER_ARM_H = 22;

/** A staple per beat along the pile's back edge; the coda's staple binds the whole pile. */
export class StaplerVignette extends HouseholdVignette {
  /** Which stapler, and which leather. The jaw does not change. */
  private readonly look: StaplerLook;
  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xe9e3d8, 0xf1d6a2);
    this.look = staplerLook(lap);
  }

  private get slots(): number { return (this.plan?.targets.length ?? 4) + 1; }
  private slotX(index: number): number {
    return PILE.backLeft + 28 + (PILE.backRight - PILE.backLeft - 56) * (index + 0.5) / this.slots;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const age = now - this.strikeAt;
    const close = staplerClose(age, beat);
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const finale = pileFinale(ending, this.successful, this.still);
    const lift = finale.lift * 26;
    // Desk top: oak with a green leather inlay, a mug and a pen pot at the back.
    slab(g, -346, -246, 692, 490, 0x9a6b45, 22, 0x5b3d26);
    g.lineStyle(2, 0x7e5535, 0.5);
    for (let i = 0; i < 9; i++) g.lineBetween(-346, -220 + i * 56, 346, -214 + i * 56);
    slab(g, -300, -60, 600, 290, this.look.leather, 14, this.look.leatherInk);
    g.lineStyle(2, 0xd4b46a, 0.6).strokeRoundedRect(-286, -46, 572, 262, 10);
    this.mug();
    this.pens();
    this.pile(finale.fan, lift);
    // Staples already driven sit on the top face along the back edge.
    const driven = Math.min(times.length, this.slots - 1) + (ending >= 0 && this.successful ? 1 : 0);
    for (let i = 0; i < driven; i++) {
      const slot = i < this.slots - 1 && i < times.length ? i : this.slots - 1;
      const stamp = slot === this.slots - 1 ? ending : now - times[i]!;
      if (stamp < 0) continue;
      this.staple(this.slotX(slot), PILE.backY + 10 - lift, 1);
    }
    if (ending >= 0 && !this.successful) {
      // The jammed staple: bent, half out of the jaw, on the last slot.
      const x = this.slotX(this.slots - 1);
      const y = PILE.backY + 2 - lift;
      g.lineStyle(4, 0x8b9096).beginPath().moveTo(x - 10, y).lineTo(x - 2, y - 16).lineTo(x + 8, y - 4).lineTo(x + 16, y - 22).strokePath();
    }
    const next = ending >= 0 ? this.slots - 1 : Math.min(this.strokes, this.slots - 1);
    const active = ending >= 0 ? (this.successful ? staplerClose(ending, beat) : 0) : close;
    const nudge = !this.still && now - this.errorAt < 0.2 ? Math.sin((now - this.errorAt) * 70) * 4 : 0;
    this.stapler(this.slotX(next) + nudge, PILE.backY + 10 - lift, active, finale.jam);
    if (ending >= 0 && this.successful && !this.still) {
      const a = Math.sin(clamp01((ending - 0.6) / 0.8) * Math.PI);
      sparkle(g, -270, -120, 14 * a, a);
      sparkle(g, 250, 40, 18 * a, a);
    }
  }

  /** Cream mug at the back right, coffee at the rim, handle on the free side. */
  private mug(): void {
    const g = this.art;
    slab(g, 214, -200, 82, 58, 0xf1ece0, 12, 0x9b8f7a);
    g.fillStyle(0x5b3d26, 0.7).fillEllipse(255, -196, 62, 18);
    g.fillStyle(0x3d2818, 0.85).fillEllipse(255, -194, 48, 12);
    g.lineStyle(9, 0xf1ece0).beginPath().arc(302, -172, 18, -1.3, 1.3).strokePath();
    g.lineStyle(5, 0x9b8f7a).beginPath().arc(302, -172, 18, -1.3, 1.3).strokePath();
  }

  /** Pens stand out of the pot, not down into it. */
  private pens(): void {
    const g = this.art;
    slab(g, -300, -176, 60, 50, 0x2c3e5a, 8, 0x1a2536);
    g.lineStyle(5, 0xf1c40f).lineBetween(-284, -170, -276, -236);
    g.lineStyle(5, 0xe25c5c).lineBetween(-262, -172, -268, -242);
    g.lineStyle(5, 0x4fa3c9).lineBetween(-274, -168, -270, -248);
    g.fillStyle(0x2c3e5a).fillCircle(-276, -236, 3).fillCircle(-268, -242, 3).fillCircle(-270, -248, 3);
  }

  /** Sheets fanned by `fan`, squared as it falls to zero; the side face is the thickness. */
  private pile(fan: number, lift: number): void {
    const g = this.art;
    const skew = PILE.frontLeft - PILE.backLeft;
    g.fillStyle(HOME_INK, 0.18).fillEllipse(-30 + skew / 2, PILE.frontY + PILE.thick + 12, 460, 30 + lift * 0.4);
    // Underneath sheets peek out where the pile is not yet square.
    for (let i = SHEETS - 1; i >= 1; i--) {
      const dx = Math.sin(i * 2.4) * 16 * fan, dy = Math.cos(i * 1.7) * 7 * fan;
      const drop = (1 - i / SHEETS) * 10;
      const y = drop - lift + dy;
      shape(g, [
        PILE.backLeft + dx, PILE.backY + y,
        PILE.backRight + dx, PILE.backY + y,
        PILE.frontRight + dx, PILE.frontY + y,
        PILE.frontLeft + dx, PILE.frontY + y,
      ], i % 2 ? 0xe7e1d3 : 0xf3efe6, 0xb9b1a2, 1.5);
    }
    const cream = faces(0xe4ded0);
    const top = faces(0xf8f5ec);
    // Right side first, so the front and top sit in front of it.
    shape(g, [
      PILE.backRight, PILE.backY - lift,
      PILE.frontRight, PILE.frontY - lift,
      PILE.frontRight, PILE.frontY + PILE.thick - lift,
      PILE.backRight, PILE.backY + PILE.thick - lift,
    ], cream.shade, cream.edge, 2);
    g.lineStyle(1.2, 0xc9c2b3, 0.9);
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      g.lineBetween(PILE.backRight, PILE.backY + PILE.thick * t - lift, PILE.frontRight, PILE.frontY + PILE.thick * t - lift);
    }
    shape(g, [
      PILE.frontLeft, PILE.frontY - lift, PILE.frontRight, PILE.frontY - lift,
      PILE.frontRight, PILE.frontY + PILE.thick - lift, PILE.frontLeft, PILE.frontY + PILE.thick - lift,
    ], cream.face, cream.edge, 2);
    g.lineStyle(1.2, 0xc9c2b3, 0.9);
    for (let i = 1; i < 12; i++) {
      const y = PILE.frontY + (PILE.thick * i) / 12 - lift;
      const jitter = Math.sin(i * 3.1) * 5 * fan;
      g.lineBetween(PILE.frontLeft + jitter, y, PILE.frontRight + jitter, y);
    }
    shape(g, [
      PILE.backLeft, PILE.backY - lift, PILE.backRight, PILE.backY - lift,
      PILE.frontRight, PILE.frontY - lift, PILE.frontLeft, PILE.frontY - lift,
    ], top.lit, top.edge, 2);
    // Typed lines on the top sheet, following the oblique.
    g.lineStyle(2, 0xb9b1a2, 0.8);
    for (let i = 0; i < 5; i++) {
      const t = (i + 1.4) / 7;
      const y = PILE.backY + (PILE.frontY - PILE.backY) * t - lift;
      const x0 = PILE.backLeft + skew * t + 30, x1 = PILE.backRight + skew * t - 40 - (i % 2) * 60;
      g.lineBetween(x0, y, x1, y);
    }
  }

  private staple(x: number, y: number, alpha: number): void {
    const g = this.art;
    const d = 7;
    g.lineStyle(3.5, 0x6f757c, alpha).beginPath()
      .moveTo(x - 9 + PILE_SKEW * d, y + 5 + d)
      .lineTo(x - 9, y)
      .lineTo(x + 9, y)
      .lineTo(x + 9 + PILE_SKEW * d, y + 5 + d)
      .strokePath();
    g.lineStyle(1.5, 0xffffff, 0.7 * alpha).lineBetween(x - 7, y - 1, x + 7, y - 1);
  }

  /**
   * Stapler on the back edge, in the pile's own oblique: a dark base and a red arm
   * hinged at the rear, jaw to the left. The arm rotates in the vertical plane so the
   * gape reads at phone scale.
   */
  private stapler(x: number, y: number, close: number, jam: number): void {
    const g = this.art;
    const angle = staplerJaw(close, jam);
    const depth = STAPLER_DEPTH;
    const pivotX = x + 58;
    const pivotY = y - 18;
    const map = (lx: number, lz: number, d: number): [number, number] => {
      const rx = lx * Math.cos(angle) + lz * Math.sin(angle);
      const rz = -lx * Math.sin(angle) + lz * Math.cos(angle);
      return [pivotX + rx + PILE_SKEW * d, pivotY - rz + d];
    };
    const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], colour: number, ink: number, weight = 2.5): void => {
      shape(g, [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]], colour, ink, weight);
    };

    g.fillStyle(HOME_INK, 0.16).fillEllipse(x + 18, y + 22, 168, 20);
    const base = faces(0x2f3238);
    const chrome = faces(0xc5c9ce);
    // Base: a low block on the paper, anvil under the jaw, magazine rail on top.
    const bx = x - 70, bw = 140, bh = 16;
    quad(
      [bx, y - bh], [bx + bw, y - bh],
      [bx + bw + PILE_SKEW * depth, y - bh + depth], [bx + PILE_SKEW * depth, y - bh + depth],
      base.lit, base.edge,
    );
    quad(
      [bx + bw, y - bh], [bx + bw + PILE_SKEW * depth, y - bh + depth],
      [bx + bw + PILE_SKEW * depth, y + depth], [bx + bw, y],
      base.shade, base.edge,
    );
    quad(
      [bx + PILE_SKEW * depth, y - bh + depth], [bx + bw + PILE_SKEW * depth, y - bh + depth],
      [bx + bw + PILE_SKEW * depth, y + depth], [bx + PILE_SKEW * depth, y + depth],
      base.face, base.edge,
    );
    const railY = y - bh - 5;
    quad(
      [x - 22, railY], [x + 24, railY],
      [x + 24 + PILE_SKEW * 22, railY + 22], [x - 22 + PILE_SKEW * 22, railY + 22],
      chrome.lit, chrome.edge, 2,
    );
    g.fillStyle(0x8b9096).fillRoundedRect(x - 18, y - bh - 2, 40, 5, 2);

    const body = faces(this.look.body);
    const length = STAPLER_LENGTH;
    const armH = STAPLER_ARM_H;
    // Top, near side, and jaw of the arm. Hinge is local x = 0; the jaw is −length.
    quad(map(-length, armH, 0), map(0, armH, 0), map(0, armH, depth), map(-length, armH, depth), body.lit, body.edge, 3);
    quad(map(-length, armH, depth), map(0, armH, depth), map(0, 0, depth), map(-length, 0, depth), body.face, body.edge, 3);
    quad(map(0, armH, 0), map(0, armH, depth), map(0, 0, depth), map(0, 0, 0), chrome.face, chrome.edge, 2);
    quad(map(-length, armH, 0), map(-length, armH, depth), map(-length, 4, depth), map(-length, 4, 0), chrome.lit, chrome.edge, 2);
    const [hx, hy] = map(2, armH * 0.45, depth * 0.45);
    g.fillStyle(chrome.lit).fillCircle(hx, hy, 8);
    g.lineStyle(2.5, chrome.edge).strokeCircle(hx, hy, 8);
    g.fillStyle(base.face).fillCircle(hx, hy, 3.5);
    const [rimx, rimy] = map(-length * 0.42, armH, depth * 0.28);
    g.lineStyle(4, this.look.highlight, 0.75).lineBetween(hx - 10, hy - 8, rimx, rimy);
    if (close > 0.6) {
      const [jx, jy] = map(-length, 2, depth * 0.4);
      g.lineStyle(3, 0xfff2c8, (close - 0.6) / 0.4);
      for (let i = 0; i < 3; i++) g.lineBetween(jx - 8 - i * 5, jy + 8 + i * 5, jx - 22 - i * 7, jy + 2 + i * 7);
    }
  }
}
