import type Phaser from 'phaser';
import { cubicContour, traceContour } from '@/ui/illustration';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { noseLook, type NoseLook } from './noseLooks';
import { cleaningPulse, cleaningReveal } from './cleaningMotion';

/** A tissue squeezes on each beat, then lowers to reveal either relief or a sniffle. */
export class NoseBlowingVignette extends HouseholdVignette {
  private readonly look: NoseLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xf2e9df, 0xfbe3c9, { card: { x: -324, y: -222, width: 648, height: 442, radius: 36 } });
    this.look = noseLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear(), look = this.look;
    const reveal = cleaningReveal(ending, this.still);
    const pulse = ending >= 0 || this.still ? 0 : cleaningPulse(now - this.strikeAt, this.plan ? 60 / this.plan.bpm : 0.5);
    const happy = ending >= 0 && this.successful;
    const runny = ending >= 0 && !this.successful;
    const y = -36;

    // A soft bathroom alcove, a ledge and a spare tissue box.
    slab(g, -324, -222, 648, 442, 0xe5ded2, 36, 0xa79989);
    slab(g, -301, -201, 602, 379, 0xf8f1e4, 26, 0xc6b8a4);
    g.fillStyle(0x998875, 0.14).fillEllipse(0, 195, 400, 35);
    shape(g, cubicContour(-185, 198, [[-182, 125, -125, 100, -57, 102], [-30, 92, 30, 92, 57, 102], [125, 100, 182, 125, 185, 198]]), look.shirt);
    slab(g, -33, 64, 66, 65, look.skin, 19);
    shape(g, [-61, 106, -24, 135, 0, 119, 24, 135, 61, 106, 36, 95, 0, 115, -36, 95], shade(look.shirt, 0.23));
    g.lineStyle(3, shade(look.shirt, -0.2)).lineBetween(0, 133, 0, 196);
    g.fillStyle(0xf7ead4).fillCircle(13, 151, 3).fillCircle(13, 176, 3);
    for (const side of [-1, 1]) {
      g.fillStyle(look.skin).fillEllipse(side * 105, y + 12, 38, 55);
      g.lineStyle(3, HOME_INK).strokeEllipse(side * 105, y + 12, 38, 55);
      g.lineStyle(3, shade(look.skin, -0.2)).lineBetween(side * 111, y + 3, side * 111, y + 23);
    }
    if (look.style === 'bun') {
      g.fillStyle(look.hair).fillCircle(62, -171, 39);
      g.lineStyle(4, HOME_INK).strokeCircle(62, -171, 39);
    }
    g.fillStyle(look.skin).fillEllipse(0, y, 213 + pulse * 10, 257);
    g.lineStyle(4, HOME_INK).strokeEllipse(0, y, 213 + pulse * 10, 257);
    this.hair();
    for (const side of [-1, 1]) {
      g.fillStyle(0xd97770, 0.3).fillEllipse(side * (72 + pulse * 6), 10, 43 + pulse * 10, 25);
      g.lineStyle(5, look.hair).lineBetween(side * 31, -84, side * 67, -88 + (runny ? side * 7 : 0));
      if (happy || pulse > 0.2) {
        g.lineStyle(4, HOME_INK);
        traceContour(g, cubicContour(side * 48 - 13, -58, [[side * 48 - 5, -69, side * 48 + 5, -69, side * 48 + 13, -58]]));
        g.strokePath();
      } else {
        g.fillStyle(HOME_INK).fillEllipse(side * 48, -59, 9, 15);
        g.fillStyle(0xffffff).fillCircle(side * 48 - 1, -62, 2);
      }
    }
    if (look.glasses) {
      for (const side of [-1, 1]) g.lineStyle(4, 0x525666).strokeRoundedRect(side * 48 - 29, -79, 58, 40, 14);
      g.lineBetween(-19, -61, 19, -61);
    }
    shape(g, cubicContour(-14, -47, [[-17, -27, -34, -9, -22, -3], [-12, 4, -7, -3, 0, 0], [7, -3, 12, 4, 22, -3], [34, -9, 17, -27, 14, -47]]), runny ? 0xe79281 : shade(look.skin, 0.08));
    g.fillStyle(shade(look.skin, -0.35)).fillEllipse(-13, -8, 10, 5).fillEllipse(13, -8, 10, 5);
    if (happy) {
      shape(g, cubicContour(-38, 32, [[-15, 43, 15, 43, 38, 32], [20, 75, -20, 75, -38, 32]]), 0x6b3437);
      shape(g, cubicContour(-31, 37, [[-12, 46, 12, 46, 31, 37], [22, 53, -22, 53, -31, 37]]), 0xfffcf0, HOME_INK, 0);
      sparkle(g, -154, -52, 19 * reveal);
      sparkle(g, 148, -111, 13 * reveal);
    } else {
      g.lineStyle(4, HOME_INK);
      traceContour(g, cubicContour(-23, 48, [[-9, runny ? 34 : 45, 9, runny ? 34 : 45, 23, 48]]));
      g.strokePath();
    }
    if (runny) {
      const drip = (this.still ? 1 : reveal) * 43;
      shape(g, cubicContour(6, -4, [[5, 12, 10, 10 + drip, 10, 16 + drip], [11, 31 + drip, 30, 29 + drip, 28, 15 + drip], [21, 8 + drip, 25, 8, 21, -4]]), 0xb7d797, 0x71966e, 2);
      g.lineStyle(3, 0xe3efcd).lineBetween(15, 7, 16, 15 + drip);
    }

    // Both hands hold the tissue against the nose; the ending exposes the entire face.
    const tissueY = 5 + reveal * 123;
    const w = 78 - pulse * 8;
    shape(g, [-w, tissueY + 7, -48, tissueY - 23, -18, tissueY - 10, 0, tissueY - 19, 24, tissueY - 8, 51, tissueY - 23, w, tissueY + 7, 63, tissueY + 70, 17, tissueY + 65, -22, tissueY + 78, -66, tissueY + 62], 0xfffef6, 0xaaa89d, 3);
    g.lineStyle(2, 0xd6dcd6).lineBetween(-45, tissueY + 3, -19, tissueY + 47).lineBetween(40, tissueY + 2, 18, tissueY + 52).lineBetween(0, tissueY + 4, -1, tissueY + 28);
    for (const side of [-1, 1]) {
      g.fillStyle(look.skin).fillEllipse(side * (w - 4), tissueY + 31, 43, 54);
      g.lineStyle(3, HOME_INK).strokeEllipse(side * (w - 4), tissueY + 31, 43, 54);
      g.lineStyle(2, shade(look.skin, -0.22)).lineBetween(side * (w - 16), tissueY + 24, side * (w + 7), tissueY + 28);
      if (pulse > 0) g.lineStyle(3, 0xa79989, pulse).lineBetween(side * 132, -1, side * (132 + 25 * pulse), -9);
    }
    slab(g, 200, 134, 87, 63, 0x92b5ab, 10);
    shape(g, [214, 133, 215, 102, 234, 111, 257, 97, 269, 133], 0xfffef6, 0xaaa89d, 2);
    g.lineStyle(3, 0x54786d).lineBetween(218, 135, 265, 135);
  }

  private hair(): void {
    const g = this.art, look = this.look;
    if (look.style === 'curls') {
      for (let k = 0; k < 9; k++) {
        const a = Math.PI + k / 8 * Math.PI;
        const x = Math.cos(a) * 91, y = -81 + Math.sin(a) * 83;
        g.fillStyle(look.hair).fillCircle(x, y, 25);
        g.lineStyle(2, shade(look.hair, 0.15)).strokeCircle(x - 3, y - 3, 14);
      }
      return;
    }
    shape(g, cubicContour(-105, -51, [[-127, -147, -61, -195, 14, -176], [89, -192, 119, -132, 104, -50], [85, -72, 82, -105, 78, -123], [40, -107, 10, -109, look.style === 'side' ? -35 : -72, -143], [-89, -111, -92, -81, -105, -51]]), look.hair);
    g.lineStyle(3, shade(look.hair, 0.2));
    traceContour(g, cubicContour(-70, -150, [[-24, -177, 38, -163, 73, -139]]));
    g.strokePath();
  }
}
