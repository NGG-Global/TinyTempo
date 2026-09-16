import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { pileFinale, staplerClose } from './errandMotion';
import { clamp01 } from './motion';

/** The pile in an oblique view: a back edge, a front edge below and right, and a thickness. */
const PILE = { backLeft: -190, backRight: 210, backY: 10, frontLeft: -236, frontRight: 164, frontY: 96, thick: 74 } as const;
const SHEETS = 9;

/** A staple per beat along the pile's back edge; the coda's staple binds the whole pile. */
export class StaplerVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xe9e3d8, 0xf1d6a2); }

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
    slab(g, -300, -60, 600, 290, 0x3f6b57, 14, 0x24443a);
    g.lineStyle(2, 0xd4b46a, 0.6).strokeRoundedRect(-286, -46, 572, 262, 10);
    slab(g, 214, -222, 82, 80, 0xf1ece0, 12, 0x9b8f7a);
    g.fillStyle(0x5b3d26, 0.7).fillEllipse(255, -214, 62, 22);
    g.lineStyle(9, 0xf1ece0).beginPath().arc(302, -182, 18, -1.3, 1.3).strokePath();
    slab(g, -300, -226, 60, 74, 0x2c3e5a, 8, 0x1a2536);
    g.lineStyle(5, 0xf1c40f).lineBetween(-284, -222, -278, -170);
    g.lineStyle(5, 0xe25c5c).lineBetween(-262, -228, -256, -170);
    g.lineStyle(5, 0x4fa3c9).lineBetween(-274, -230, -268, -170);
    this.pile(finale.fan, lift);
    // Staples already driven sit on the top face along the back edge.
    const driven = Math.min(times.length, this.slots - 1) + (ending >= 0 && this.successful ? 1 : 0);
    for (let i = 0; i < driven; i++) {
      const slot = i < this.slots - 1 && i < times.length ? i : this.slots - 1;
      const stamp = slot === this.slots - 1 ? ending : now - times[i]!;
      if (stamp < 0) continue;
      this.staple(this.slotX(slot), PILE.backY + 16 - lift, 1);
    }
    if (ending >= 0 && !this.successful) {
      // The jammed staple: bent, half out of the jaw, on the last slot.
      const x = this.slotX(this.slots - 1);
      g.lineStyle(4, 0x8b9096).beginPath().moveTo(x - 10, PILE.backY + 2).lineTo(x - 4, PILE.backY - 10).lineTo(x + 6, PILE.backY - 2).lineTo(x + 12, PILE.backY - 14).strokePath();
    }
    const next = ending >= 0 ? this.slots - 1 : Math.min(this.strokes, this.slots - 1);
    const active = ending >= 0 ? (this.successful ? staplerClose(ending, beat) : 0) : close;
    const jamOpen = finale.jam * 0.45;
    const nudge = !this.still && now - this.errorAt < 0.2 ? Math.sin((now - this.errorAt) * 70) * 4 : 0;
    this.stapler(this.slotX(next) + nudge, PILE.backY + 16 - lift, active, jamOpen);
    if (ending >= 0 && this.successful && !this.still) {
      const a = Math.sin(clamp01((ending - 0.6) / 0.8) * Math.PI);
      sparkle(g, -270, -120, 14 * a, a);
      sparkle(g, 250, 40, 18 * a, a);
    }
  }

  /** Sheets fanned by `fan`, squared as it falls to zero; the front face shows the thickness. */
  private pile(fan: number, lift: number): void {
    const g = this.art;
    const skew = PILE.frontLeft - PILE.backLeft;
    g.fillStyle(HOME_INK, 0.18).fillEllipse(-30 + skew / 2, PILE.frontY + PILE.thick + 12, 460, 30 + lift * 0.4);
    // Underneath sheets peek out where the pile is not yet square.
    for (let i = SHEETS - 1; i >= 1; i--) {
      const dx = Math.sin(i * 2.4) * 14 * fan, dy = Math.cos(i * 1.7) * 6 * fan;
      const y = PILE.frontY + PILE.thick * (1 - i / SHEETS) - lift;
      shape(g, [PILE.frontLeft + dx, y + dy, PILE.frontRight + dx, y + dy, PILE.frontRight + dx, y + dy + PILE.thick / SHEETS + 2, PILE.frontLeft + dx, y + dy + PILE.thick / SHEETS + 2], i % 2 ? 0xe7e1d3 : 0xf3efe6, 0xb9b1a2, 1.5);
    }
    // Front face and top face of the pile itself.
    shape(g, [PILE.frontLeft, PILE.frontY - lift, PILE.frontRight, PILE.frontY - lift, PILE.frontRight, PILE.frontY + PILE.thick - lift, PILE.frontLeft, PILE.frontY + PILE.thick - lift], 0xe4ded0, 0xa9a192, 2);
    g.lineStyle(1.2, 0xc9c2b3, 0.9);
    for (let i = 1; i < 12; i++) {
      const y = PILE.frontY + (PILE.thick * i) / 12 - lift;
      const jitter = Math.sin(i * 3.1) * 5 * fan;
      g.lineBetween(PILE.frontLeft + jitter, y, PILE.frontRight + jitter, y);
    }
    shape(g, [PILE.backLeft, PILE.backY - lift, PILE.backRight, PILE.backY - lift, PILE.frontRight, PILE.frontY - lift, PILE.frontLeft, PILE.frontY - lift], 0xf8f5ec, 0xa9a192, 2);
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
    g.lineStyle(3.5, 0x6f757c, alpha).beginPath().moveTo(x - 9, y + 5).lineTo(x - 9, y).lineTo(x + 9, y).lineTo(x + 9, y + 5).strokePath();
    g.lineStyle(1.5, 0xffffff, 0.7 * alpha).lineBetween(x - 7, y - 1, x + 7, y - 1);
  }

  /** Side-on stapler at the back edge: a dark base and a red arm hinged at the rear. */
  private stapler(x: number, y: number, close: number, jamOpen: number): void {
    const g = this.art;
    const open = Math.max(jamOpen, 0.26 * (1 - close));
    g.fillStyle(HOME_INK, 0.16).fillEllipse(x + 10, y + 8, 150, 16);
    slab(g, x - 70, y - 14, 140, 18, 0x2f3238, 8, 0x16181c);
    g.fillStyle(0x8b9096).fillRoundedRect(x - 20, y - 12, 44, 6, 3);
    // Arm: pivot at the rear (right), the jaw at the front (left) lifts with `open`.
    const px = x + 62, py = y - 16;
    const jx = x - 66, jy = y - 22 - Math.sin(open) * 130;
    const arm = [px, py - 18, jx + 6, jy - 22, jx - 4, jy - 2, jx + 4, jy + 6, px, py];
    shape(g, arm, 0xc7423a, 0x6f1f1a, 3);
    g.lineStyle(4, 0xe8837b, 0.7).lineBetween(px - 8, py - 14, jx + 14, jy - 16);
    g.fillStyle(0xc9ced3).fillRoundedRect(px - 12, py - 22, 22, 26, 6);
    g.fillStyle(0x2f3238).fillCircle(px - 1, py - 9, 4);
    if (close > 0.6) {
      g.lineStyle(3, 0xfff2c8, (close - 0.6) / 0.4);
      for (let i = 0; i < 3; i++) g.lineBetween(jx - 14 - i * 4, jy + 12 + i * 6, jx - 26 - i * 6, jy + 6 + i * 8);
    }
  }
}
