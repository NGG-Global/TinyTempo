import type Phaser from 'phaser';
import { cubicContour } from '@/ui/illustration';
import { STYLE } from '@/config/style';
import { HouseholdVignette } from './HouseholdVignette';
import { contactPulse, eggReveal } from './householdMotion';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { clamp01, easeOut } from './motion';

const SHELL = 0xffe7ba;
const EGG = cubicContour(0, -66, [
  [29, -66, 52, -10, 49, 21], [46, 64, -46, 64, -49, 21],
  [-52, -10, -29, -66, 0, -66],
]);

export class EggCrackingVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xf3e8d5, 0xf8c977); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const age = now - this.strikeAt;
    const pulse = contactPulse(age, 0.26);
    const reveal = eggReveal(ending, this.successful, this.still);
    const finished = ending >= 0;
    // A butcher-block worktop, linen, and the cast shadow establish the bowl's weight.
    slab(g, -344, 149, 688, 79, 0xcba777, 18, 0x9b7b55);
    g.lineStyle(2, 0xa88353, 0.3);
    for (let i = 0; i < 8; i++) g.lineBetween(-325, 164 + i * 7, 326, 164 + i * 7);
    shape(g, [-280, 133, -116, 127, -73, 209, -263, 211], 0xe6eddf, 0xa2b7a0, 2);
    g.lineStyle(3, 0x98b0a1, 0.5);
    for (let i = 0; i < 6; i++) g.lineBetween(-265 + i * 27, 139, -246 + i * 27, 200);
    g.fillStyle(HOME_INK, 0.15).fillEllipse(62, 201, 328, 38);
    // The inside is drawn before the falling yolk; the front lip occludes the landing.
    g.fillStyle(0x568d94).fillEllipse(45, 62, 329, 95);
    g.lineStyle(7, 0x365e65).strokeEllipse(45, 62, 329, 95);
    g.fillStyle(0xa8d3c7).fillEllipse(45, 68, 292, 64);
    g.fillStyle(0x3f737b, 0.36).fillEllipse(58, 79, 250, 37);
    if (finished && this.successful) {
      const landed = easeOut((ending - 0.6) / 0.25);
      g.fillStyle(0xfff7d5, 0.8).fillEllipse(45, 77, 170 * landed, 32 * landed);
      const y = -78 + 149 * reveal.drop * reveal.drop;
      const stretch = Math.sin(reveal.drop * Math.PI);
      if (reveal.drop < 1) {
        g.lineStyle(12 * (1 - reveal.drop), 0xfff6d6, 0.75).lineBetween(45, -110, 45, y);
        g.fillStyle(0xfff5c2, 0.78).fillEllipse(45, y - 5, 59 - stretch * 16, 65 + stretch * 28);
      }
      g.fillStyle(0xe89b23).fillEllipse(45, y, 48 + landed * 18, 47 - landed * 23);
      g.fillStyle(0xffc844).fillEllipse(40, y - 5, 38 + landed * 13, 31 - landed * 15);
      g.fillStyle(0xffec91).fillEllipse(32, y - 11, 12, 7);
      for (let i = 0; i < 6 && reveal.splash > 0; i++) {
        const side = i < 3 ? -1 : 1;
        g.fillStyle(0xffefb6, 0.85).fillEllipse(45 + side * (36 + (i % 3) * 24) * reveal.splash, 58 - (26 + (i % 3) * 13) * reveal.splash, 7, 12);
      }
    }
    shape(g, cubicContour(-118, 62, [
      [-108, 160, -65, 208, 45, 208], [155, 208, 197, 160, 209, 62],
      [159, 113, -70, 113, -118, 62],
    ]), 0x72a9ac, 0x365e65, STYLE.current.outline);
    shape(g, cubicContour(-92, 95, [
      [-67, 169, -41, 184, 27, 193], [-51, 182, -68, 164, -92, 95],
    ]), 0xbadbd1, 0xbadbd1, 0);
    g.lineStyle(5, 0xd8eee0).beginPath().arc(45, 53, 154, 0.22, Math.PI - 0.22).strokePath();
    g.lineStyle(3, 0x4b8189, 0.6).lineBetween(3, 193, 91, 193);
    // Small painted sprigs on the ceramic, with a glaze glint on the lit edge.
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 29;
      g.lineStyle(2, 0xf3ead4).lineBetween(x, 160, x + 8, 139);
      g.fillStyle(0xf3ead4).fillEllipse(x, 146, 12, 5).fillEllipse(x + 10, 151, 12, 5);
    }
    if (!finished) {
      const approach = easeOut((ending + 0.24) / 0.24);
      const x = -148 + pulse * 38 + approach * 193, y = -96 + pulse * 106;
      const tilt = (-0.22 + pulse * 0.38) * (1 - approach);
      this.egg(x, y, tilt);
      if (pulse > 0.2) {
        g.lineStyle(3, 0xc29254, pulse);
        for (let i = 0; i < 3; i++) g.lineBetween(-135 + i * 22, 18, -144 + i * 28, 4);
      }
    } else {
      const open = reveal.open;
      for (const side of [-1, 1]) {
        const x = 45 + side * (12 + open * 76), y = -95 - open * 16;
        const half = cubicContour(0, -61, side < 0 ? [
          [-31, -62, -53, -8, -48, 25], [-46, 49, -19, 60, 0, 52],
        ] : [
          [31, -62, 53, -8, 48, 25], [46, 49, 19, 60, 0, 52],
        ]);
        half.push(side * 9, 35, -side * 6, 20, side * 8, 3, -side * 5, -14, side * 7, -32, 0, -61);
        const a = side * open * 0.5;
        shape(g, half.map((v, i) => i % 2 ? y + half[i - 1]! * Math.sin(a) + v * Math.cos(a) : x + v * Math.cos(a) - half[i + 1]! * Math.sin(a)), SHELL, 0xa17c51);
        g.fillStyle(0xffffff, 0.32).fillEllipse(x + side * 20, y - 12, 14, 43);
      }
      if (!this.successful) {
        g.lineStyle(3, 0x986b44).lineBetween(40, -146, 32, -126).lineBetween(32, -126, 43, -112);
        g.fillStyle(SHELL).fillTriangle(74, 33, 89, 28, 84, 42);
      } else if (!this.still) {
        const a = Math.sin(clamp01((ending - 0.68) / 0.75) * Math.PI);
        sparkle(g, -94, -126, 13 * a, a);
        sparkle(g, 192, -80, 19 * a, a);
      }
    }
  }
  private egg(x: number, y: number, angle: number): void {
    const g = this.art;
    shape(g, EGG.map((v, i) => i % 2 ? y + EGG[i - 1]! * Math.sin(angle) + v * Math.cos(angle) : x + v * Math.cos(angle) - EGG[i + 1]! * Math.sin(angle)), SHELL, 0xa17c51);
    g.fillStyle(0xfff9e2).fillEllipse(x - 16, y - 19, 20, 43);
    for (let i = 0; i < 13; i++) {
      const dx = ((i * 19) % 63) - 27, dy = ((i * 31) % 74) - 26;
      g.fillStyle(0xbd9367, 0.3).fillCircle(x + dx, y + dy, 1.2 + i % 2);
    }
  }
}
