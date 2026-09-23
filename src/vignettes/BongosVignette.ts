import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab } from './householdArt';
import { BONGO_BEAT, BONGO_FAIL, contactPulse, percussionPose, reveal } from './treatMotion';
import { bongoLook, type BongoLook } from './bongoLooks';
import { celebration, note, palm, rings } from './treatArt';

/** Two differently voiced, stave-built drums on a woven rehearsal rug. */
export class BongosVignette extends HouseholdVignette {
  /** Which pair of drums. The beat does not change. */
  private readonly look: BongoLook;
  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xf0e3c9, 0xf8b77c);
    this.look = bongoLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    slab(g, -340, -228, 680, 460, 0xdeaa73, 34, 0xa47150);
    g.fillStyle(0xf5cc8a, 0.5).fillCircle(0, -58, 159);
    g.fillStyle(0xbc6d53).fillRoundedRect(-313, 118, 626, 85, 14);
    for (let i = 0; i < 23; i++) {
      const x = -293 + i * 26;
      g.lineStyle(2, 0xf6d59c, 0.35).lineBetween(x, 120, x, 201);
      g.lineStyle(3, 0xf2cc94).lineBetween(x, 202, x, 212);
    }
    g.lineStyle(3, 0x7e5750).lineBetween(-308, 144, 308, 144).lineBetween(-308, 188, 308, 188);
    for (let i = 0; i < 14; i++) {
      const x = -288 + i * 44;
      shape(g, [x, 161, x + 11, 151, x + 22, 161, x + 11, 176], 0xf0c17f, 0xf0c17f, 0);
    }
    g.fillStyle(0x765442, 0.26).fillEllipse(0, 149, 447, 42);
    slab(g, -44, 23, 90, 31, 0x6a4b37, 5, 0x493f35);
    g.fillStyle(0xc1b99a).fillCircle(-25, 37, 7).fillCircle(25, 37, 7);
    this.drum(-112, -8, 110, 139, this.look.left);
    this.drum(113, 5, 124, 147, this.look.right);
    const pulse = contactPulse(now - this.strikeAt, 0.17);
    const finale = ending >= 0;
    const shrug = finale && !this.successful ? reveal(ending, 0.85, this.still) : 0;
    for (let side = 0; side < 2; side++) {
      const x = side ? 113 : -112, y = side ? 5 : -8;
      const hit = finale ? percussionPose(ending, this.successful ? BONGO_BEAT : BONGO_FAIL, side)
        : ((this.strokes + 1) % 2 === side ? pulse : 0);
      if (!this.still) rings(g, x, y, hit);
      const hy = y - 50 + hit * 37 - shrug * 40;
      const hx = x + (side ? 1 : -1) * shrug * 24;
      g.lineStyle(43, this.look.shirt).lineBetween(hx + (side ? 1 : -1) * 37, -212, hx, hy - 52);
      g.lineStyle(8, this.look.shirtLit).lineBetween(hx + (side ? 1 : -1) * 35 - 10, -206, hx - 10, hy - 62);
      palm(g, hx, hy, side, side ? this.look.palm : this.look.palmLit);
      if (finale && this.successful && !this.still && ending < 1.6) {
        const p = (ending + side * 0.2) % 0.6 / 0.6;
        note(g, x + (side ? 1 : -1) * (52 + p * 42), -60 - p * 91, this.look.shirt, 1 - p);
      }
    }
    if (finale && this.successful) celebration(g, ending, this.still);
  }

  private drum(x: number, y: number, r: number, height: number, colour: number): void {
    const g = this.art;
    shape(g, [x - r, y, x + r, y, x + r * 0.76, y + height, x - r * 0.76, y + height], colour, this.look.ink, 3);
    for (let i = 0; i < 10; i++) {
      const u = -1 + i / 5, v = u + 0.2;
      shape(g, [x + r * u, y + 12, x + r * v, y + 12, x + r * v * 0.76, y + height - 8, x + r * u * 0.76, y + height - 8],
        i % 2 ? this.look.stave : this.look.staveDark, colour, 0);
      g.lineStyle(1.5, 0x593b2a, 0.38).lineBetween(x + r * u, y + 23, x + r * u * 0.76, y + height - 8);
      g.lineStyle(2, 0xf3c686, 0.34).lineBetween(x + r * (u + 0.06), y + 40, x + r * (u + 0.06) * 0.8, y + height - 16);
    }
    g.lineStyle(9, 0x56473b).lineBetween(x - r * 0.77, y + height - 4, x + r * 0.77, y + height - 4);
    g.lineStyle(3, 0xbaa381).lineBetween(x - r * 0.77, y + height - 8, x + r * 0.77, y + height - 8);
    for (const u of [-0.82, -0.35, 0.35, 0.82]) {
      slab(g, x + r * u - 6, y + 17, 12, height - 41, 0xa69e85, 4, 0x554c40);
      g.lineStyle(3, 0xf0e4c4).lineBetween(x + r * u - 2, y + 21, x + r * u - 2, y + height - 33);
      g.fillStyle(0x535448).fillRoundedRect(x + r * u - 10, y + height - 32, 20, 12, 3);
    }
    g.fillStyle(0x554438).fillEllipse(x, y, r * 2 + 12, r * 0.79);
    g.fillStyle(0xe8c68d).fillEllipse(x, y - 7, r * 2 + 4, r * 0.75);
    g.fillStyle(0xffe4ad).fillEllipse(x - 3, y - 12, r * 1.82, r * 0.62);
    g.lineStyle(3, 0xc49962).strokeEllipse(x, y - 7, r * 1.82, r * 0.62);
    g.fillStyle(0xc69761, 0.15).fillEllipse(x + 5, y - 3, r * 0.83, r * 0.32);
    for (let i = 0; i < 35; i++) g.fillStyle(0xb58c5b, 0.15).fillCircle(x + Math.sin(i * 7) * r * 0.8, y - 8 + Math.cos(i * 11) * r * 0.22, 1.2);
  }
}
