import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab } from './householdArt';
import { contactPulse, percussionPose, SNARE_ROLL, stickDrop } from './treatMotion';
import { celebration, rings } from './treatArt';

/** A lacquered concert snare, brushed chrome hardware and two maple sticks. */
export class SnareDrumVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xe9e4d8, 0xf5cb8f); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    slab(g, -340, -228, 680, 460, 0x354f5b, 36, 0x243c48);
    g.fillStyle(0x57717a, 0.4).fillEllipse(-80, -70, 460, 270);
    g.lineStyle(2, 0xb3c4ba, 0.18).strokeRoundedRect(-324, -212, 648, 428, 26);
    g.fillStyle(0x172d39, 0.45).fillEllipse(0, 194, 392, 32);
    // Stand and rubber feet, behind the shell.
    g.lineStyle(12, 0x788e98).lineBetween(0, 84, 0, 172);
    g.lineStyle(4, 0xf4f7e9).lineBetween(-3, 90, -3, 170);
    for (const s of [-1, 1]) {
      g.lineStyle(8, 0x91a6ad).lineBetween(0, 152, s * 105, 196);
      g.lineStyle(3, 0xf4f7e9).lineBetween(0, 149, s * 105, 193);
      g.fillStyle(0x263640).fillRoundedRect(s * 105 - 17, 190, 34, 12, 5);
    }
    g.fillStyle(0x8c3337).fillRoundedRect(-168, 2, 336, 114, 20);
    g.fillStyle(0xc6584e).fillRect(-162, 4, 255, 99);
    g.fillStyle(0xe07a62, 0.65).fillRect(-142, 12, 31, 86);
    g.fillStyle(0x672f3a, 0.4).fillRect(95, 12, 61, 89);
    for (let i = 0; i < 5; i++) {
      g.lineStyle(1, 0xf9bc83, 0.3).lineBetween(-158, 25 + i * 17, 153, 25 + i * 17);
    }
    g.fillStyle(0x9caeb2).fillEllipse(0, 105, 336, 72);
    g.fillStyle(0xc5594e).fillEllipse(0, 92, 324, 68);
    // The lower rim is an ellipse; its shine and tension lugs pick out the cylinder.
    g.lineStyle(7, 0x8fa2aa).strokeEllipse(0, 100, 334, 70);
    g.lineStyle(3, 0xe8eeea).beginPath().moveTo(-143, 117).lineTo(-80, 131).lineTo(45, 134).strokePath();
    for (const x of [-143, -91, -28, 45, 112, 152]) {
      const y = 23 + 18 * Math.sqrt(Math.max(0, 1 - (x / 168) ** 2));
      slab(g, x - 7, y, 14, 66, 0x7c939d, 4, 0x344d5a);
      g.fillStyle(0xe8ece3).fillRoundedRect(x - 5, y + 4, 5, 53, 2);
      g.fillStyle(0xdbe2dc).fillEllipse(x, y + 66, 20, 9);
    }
    slab(g, -31, 66, 62, 26, 0xe1ba73, 5, 0x765034);
    g.lineStyle(2, 0x886139).lineBetween(-18, 76, 18, 76).lineBetween(-10, 82, 10, 82);
    g.fillStyle(0x6d8793).fillEllipse(0, 0, 348, 121);
    g.fillStyle(0xfaf0d9).fillEllipse(0, -7, 329, 108);
    g.fillStyle(0xfffae9).fillEllipse(-18, -15, 274, 76);
    g.lineStyle(4, 0xe6e6d6).strokeEllipse(0, -7, 328, 108);
    g.lineStyle(2, 0xabb7ae).strokeEllipse(0, -5, 309, 93);
    g.fillStyle(0xd7cab5, 0.28).fillEllipse(5, -1, 101, 39);
    for (let i = 0; i < 28; i++) {
      g.fillStyle(0xb2a791, 0.16).fillCircle(Math.sin(i * 9) * 118, -7 + Math.cos(i * 5) * 30, 1.3);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      g.fillStyle(0xe6ede7).fillEllipse(s * (62 + i * 47), -51 + i * 12, 15, 7);
      g.fillStyle(0x6c818b).fillCircle(s * (62 + i * 47), -51 + i * 12, 2);
    }
    const pulse = contactPulse(now - this.strikeAt, 0.16);
    for (let side = 0; side < 2; side++) {
      const hit = ending >= 0 && this.successful ? percussionPose(ending, SNARE_ROLL, side)
        : ((this.strokes + 1) % 2 === side ? pulse : 0);
      if (!this.still) rings(g, side ? 56 : -56, -7, hit);
      this.stick(side, hit, ending);
    }
    if (ending >= 0 && this.successful) celebration(g, ending, this.still);
  }

  private stick(side: number, hit: number, ending: number): void {
    const g = this.art, s = side ? 1 : -1;
    const dropped = ending >= 0 && !this.successful;
    const { fall, bounce } = dropped ? stickDrop(ending, side, this.still) : { fall: 0, bounce: 0 };
    const x = s * (133 + fall * 53), y = -87 - (1 - hit) * 25 + fall * (287 + (1 - hit) * 25) - bounce;
    const restAngle = 0.62 + (1 - hit) * 0.19;
    const angle = s * (restAngle + fall * (Math.PI * 1.5 - restAngle));
    const at = (u: number, v: number): [number, number] => [x + u * Math.cos(angle) - v * Math.sin(angle), y + u * Math.sin(angle) + v * Math.cos(angle)];
    const points = [-5, -96, 5, -96, 4, 102, -4, 102];
    shape(g, points.flatMap((n, i) => i % 2 ? [] : at(n, points[i + 1]!)), 0xe9bd7e, 0x805538, 2);
    g.lineStyle(2, 0xffe4ac).lineBetween(...at(-2, -88), ...at(-2, 84));
    g.fillStyle(0xf8d89a).fillEllipse(...at(0, 105), 12, 17);
    g.lineStyle(1.5, 0x805538).strokeEllipse(...at(0, 105), 12, 17);
  }
}
