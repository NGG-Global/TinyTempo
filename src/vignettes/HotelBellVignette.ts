import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { contactPulse } from './householdMotion';
import { HOME_INK, plant, shape, slab, sparkle } from './householdArt';
import { backSoonCard, bellboyArrival } from './errandMotion';
import { bellLook, type BellLook } from './bellLooks';
import { clamp01 } from './motion';

const BELL = { x: 0, y: -10 } as const;

/** A desk bell rings on every beat. A clean round brings the bell boy; a rough one brings nobody. */
export class HotelBellVignette extends HouseholdVignette {
  /** Which bell, and which lobby. The press does not change. */
  private readonly look: BellLook;
  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = bellLook(lap);
    super(scene, look.paper, look.glow);
    this.look = look;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const age = now - this.strikeAt;
    const press = contactPulse(age, 0.16);
    const arrival = bellboyArrival(ending, this.successful, this.still);
    const card = backSoonCard(ending, this.successful, this.still);
    // Lobby wall: warm striped paper, a key rack, a clock and a palm.
    slab(g, -346, -246, 692, 490, this.look.wall, 22, 0xa88860);
    g.fillStyle(this.look.stripe, 0.7);
    for (let i = 0; i < 12; i++) g.fillRect(-330 + i * 58, -232, 22, 270);
    g.lineStyle(6, 0x9c7a52).lineBetween(-346, 38, 346, 38);
    slab(g, -312, -206, 170, 140, 0x6b4630, 8, 0x3f2a1e);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = -294 + c * 42, y = -186 + r * 44;
      g.fillStyle(0xd9b45f).fillCircle(x, y, 3.5);
      if ((r * 4 + c) % 3 !== 1) {
        g.lineStyle(3, 0xd9b45f).lineBetween(x, y + 3, x, y + 22);
        g.fillStyle(0xd9b45f).fillRoundedRect(x - 5, y + 18, 10, 12, 3);
      }
    }
    g.fillStyle(0xf4ead8).fillCircle(238, -150, 38);
    g.lineStyle(6, 0x6b4630).strokeCircle(238, -150, 38);
    g.lineStyle(3, HOME_INK).lineBetween(238, -150, 238, -176).lineBetween(238, -150, 256, -142);
    plant(g, 296, 34, 0.75);
    // The bell boy stands behind the counter, so he is drawn before it and rises out of it.
    if (arrival.rise > 0) this.bellboy(150, 40 + (1 - arrival.rise) * 210, arrival.tip);
    // Mahogany counter with a marble top and brass rail.
    slab(g, -346, 42, 692, 210, 0x6b3a2a, 16, 0x3e2018);
    g.fillStyle(0x82483a).fillRoundedRect(-320, 78, 200, 140, 10).fillRoundedRect(-90, 78, 200, 140, 10).fillRoundedRect(140, 78, 190, 140, 10);
    g.lineStyle(3, 0x4a2318).strokeRoundedRect(-320, 78, 200, 140, 10).strokeRoundedRect(-90, 78, 200, 140, 10).strokeRoundedRect(140, 78, 190, 140, 10);
    slab(g, -346, 22, 692, 30, 0xe9e2d6, 8, 0xa39a8c);
    g.lineStyle(2, 0xc8bfb1, 0.7).lineBetween(-300, 30, -120, 44).lineBetween(60, 26, 260, 46);
    g.lineStyle(5, 0xd9b45f).lineBetween(-346, 60, 346, 60);
    // Register and pen on the left; the card holder on the right.
    shape(g, [-282, 12, -150, 8, -136, 30, -296, 34], 0xf7f0e2, 0xb3a690, 2);
    shape(g, [-216, 10, -150, 8, -136, 30, -206, 32], 0xefe6d4, 0xb3a690, 1);
    g.lineStyle(1.5, 0xa89d8a, 0.8);
    for (let i = 0; i < 4; i++) g.lineBetween(-272 + i * 2, 16 + i * 4, -230 + i * 2, 15 + i * 4);
    g.lineStyle(4, 0x2c3e5a).lineBetween(-262, 40, -196, 20);
    g.lineStyle(3, 0xd9b45f).lineBetween(190, 18, 190, 32).lineBetween(180, 32, 200, 32);
    if (card > 0) {
      const y = 18 - card * 44;
      shape(g, [166, y, 214, y, 214, y + 46, 166, y + 46], 0xfbf4e4, 0x9b8d78, 2);
      g.lineStyle(3, 0x8d7f6a).lineBetween(174, y + 14, 206, y + 14).lineBetween(174, y + 26, 200, y + 26).lineBetween(174, y + 36, 194, y + 36);
    }
    this.bell(g, press, age, ending);
    if (arrival.rise > 0.95 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.85) / 0.8) * Math.PI);
      sparkle(g, 92, -140, 14 * a, a);
      sparkle(g, 214, -60, 11 * a, a);
    }
  }

  private bell(g: Phaser.GameObjects.Graphics, press: number, age: number, ending: number): void {
    const { x, y } = BELL;
    const dull = ending >= 0 && !this.successful;
    const chrome = dull ? 0xb6b6b0 : this.look.metal;
    g.fillStyle(HOME_INK, 0.18).fillEllipse(x + 8, y + 34, 150, 22);
    slab(g, x - 66, y + 20, 132, 14, 0x2f2f33, 6, 0x1c1c1f);
    g.fillStyle(chrome).fillEllipse(x, y + 20, 128, 24);
    g.lineStyle(3, 0x7c8489).strokeEllipse(x, y + 20, 128, 24);
    // The dome, its lit crown, and the plunger with visible travel.
    g.fillStyle(chrome).beginPath().arc(x, y + 14, 56, Math.PI, 0, false).closePath().fillPath();
    g.lineStyle(3, 0x7c8489).beginPath().arc(x, y + 14, 56, Math.PI, 0, false).strokePath();
    g.fillStyle(0xffffff, dull ? 0.25 : 0.65).fillEllipse(x - 20, y - 18, 34, 18);
    g.fillStyle(0x8e969c, 0.5).fillEllipse(x + 22, y - 2, 40, 22);
    g.fillStyle(0x2f2f33).fillRect(x - 5, y - 58 + press * 8, 10, 18);
    g.fillStyle(dull ? 0x9a9a95 : 0xe6ebee).fillCircle(x, y - 58 + press * 8, 11);
    g.lineStyle(2, 0x6f777c).strokeCircle(x, y - 58 + press * 8, 11);
    if (!this.still && age >= 0 && age < 0.45) {
      const p = age / 0.45;
      for (let i = 0; i < 2; i++) {
        const r = 66 + p * 40 + i * 14;
        g.lineStyle(3 - i, 0xf3d27c, (1 - p) * (1 - i * 0.4));
        g.beginPath().arc(x, y + 12, r, Math.PI * 1.1, Math.PI * 1.9).strokePath();
      }
    }
  }

  /** Red livery, a pillbox cap and white gloves; the cap lifts in greeting. */
  private bellboy(x: number, y: number, tip: number): void {
    const g = this.art;
    const cap = tip * 22;
    g.fillStyle(this.look.livery).fillRoundedRect(x - 46, y - 96, 92, 100, 18);
    g.lineStyle(3, this.look.liveryInk).strokeRoundedRect(x - 46, y - 96, 92, 100, 18);
    g.lineStyle(3, this.look.trim).lineBetween(x - 12, y - 90, x - 12, y - 10).lineBetween(x + 12, y - 90, x + 12, y - 10);
    for (let i = 0; i < 3; i++) g.fillStyle(this.look.trim).fillCircle(x - 12, y - 78 + i * 22, 3.5).fillCircle(x + 12, y - 78 + i * 22, 3.5);
    // Left arm at his side; right arm raised to the cap as the tip comes.
    g.lineStyle(16, this.look.livery).lineBetween(x - 40, y - 84, x - 54, y - 30);
    g.fillStyle(0xffffff).fillCircle(x - 56, y - 22, 10);
    const ax = x + 40 + tip * 6, ay = y - 84;
    const hx = x + 34 + tip * 4, hy = y - 30 - tip * 130;
    g.lineStyle(16, this.look.livery).lineBetween(ax, ay, x + 62 - tip * 20, y - 60 - tip * 40).lineBetween(x + 62 - tip * 20, y - 60 - tip * 40, hx, hy);
    g.fillStyle(0xffffff).fillCircle(hx, hy, 10);
    g.fillStyle(0xe8b48a).fillRoundedRect(x - 26, y - 152, 52, 60, 20);
    g.fillStyle(0x2c1e1a).fillRoundedRect(x - 27, y - 156, 54, 18, 8);
    g.fillStyle(HOME_INK).fillEllipse(x - 10, y - 124, 5, 7).fillEllipse(x + 10, y - 124, 5, 7);
    g.lineStyle(3, 0x9c5a4a).beginPath().arc(x, y - 112, 9, 0.3, Math.PI - 0.3).strokePath();
    g.fillStyle(0xd98a8a, 0.5).fillEllipse(x - 18, y - 110, 10, 6).fillEllipse(x + 18, y - 110, 10, 6);
    // The pillbox cap, lifted by the raised glove.
    const cy = y - 158 - cap;
    g.fillStyle(this.look.livery).fillRoundedRect(x - 30 + tip * 8, cy - 24, 60, 26, 6);
    g.lineStyle(3, this.look.liveryInk).strokeRoundedRect(x - 30 + tip * 8, cy - 24, 60, 26, 6);
    g.lineStyle(4, this.look.trim).lineBetween(x - 26 + tip * 8, cy - 6, x + 26 + tip * 8, cy - 6);
  }
}
