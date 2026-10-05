import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { dishLook, type DishLook } from './dishLooks';
import { cleanedSpots, cleaningPulse, cleaningReveal } from './cleaningMotion';

/** The demo scrubs in place. Only judged hits remove grime from the player's dish. */
export class DishCleaningVignette extends HouseholdVignette {
  private readonly look: DishLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xe4eee9, 0xd4eeed, { card: { x: -330, y: -224, width: 660, height: 448, radius: 30 } });
    this.look = dishLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear(), look = this.look;
    const reveal = cleaningReveal(ending, this.still);
    const hits = this.watching ? 0 : this.hitTimes.length;
    const cleaned = cleanedSpots(hits, this.plan?.targets.length ?? 4, look.spots.length, ending, this.successful);
    const pulse = ending >= 0 || this.still ? 0 : cleaningPulse(now - this.strikeAt, this.plan ? 60 / this.plan.bpm : 0.5);

    // A tiled splashback and enamel sink give all three objects the same stage.
    slab(g, -330, -224, 660, 448, 0xc7dbd5, 30, 0x78918b);
    g.lineStyle(2, 0xe6efea);
    for (let x = -220; x <= 220; x += 110) g.lineBetween(x, -220, x, 200);
    for (let y = -114; y < 220; y += 110) g.lineBetween(-325, y, 325, y);
    slab(g, -302, -194, 604, 402, 0x8ca8a6, 58, 0x638280);
    slab(g, -280, -174, 560, 358, 0xb4d1d0, 48, 0xe0efea);
    g.fillStyle(0x547976, 0.18).fillEllipse(0, 131, 353, 46);
    if (look.id === 'plate') this.plate();
    else if (look.id === 'glass') this.glass();
    else this.cutlery();

    look.spots.forEach(([x, y], index) => {
      if (index < cleaned) return;
      const small = look.id === 'cutlery';
      g.fillStyle(index % 2 ? 0x997147 : 0xb7683f, 0.9).fillEllipse(x, y, small ? 21 : 55, small ? 24 : 37);
      g.fillStyle(0xc38c49, 0.85).fillCircle(x + (small ? 3 : 17), y - 9, small ? 6 : 13);
      g.fillStyle(0x765637, 0.75).fillCircle(x - (small ? 4 : 12), y + 4, 4).fillCircle(x + 4, y + 9, 3);
    });

    if (ending >= 0 && this.successful) {
      for (const [x, y, r] of [[-123, -110, 24], [94, -55, 19], [26, 100, 15]]) {
        sparkle(g, x!, y!, r! * reveal);
      }
    }

    // Move to the next dirty patch after each accepted stroke. Extras can move the
    // sponge, but cannot erase a patch; the final stain survives every rough ending.
    const lastHit = this.hitTimes.at(-1) ?? -Infinity;
    const recentlyHit = now - lastHit >= 0 && now - lastHit < 0.18;
    const previousCleaned = cleanedSpots(Math.max(0, hits - 1), this.plan?.targets.length ?? 4, look.spots.length, -1, false);
    const target = look.spots[Math.min(look.spots.length - 1, recentlyHit ? previousCleaned : cleaned)]!;
    const x = target[0] * (1 - reveal) + 204 * reveal + pulse * 24;
    const y = target[1] * (1 - reveal) + 122 * reveal;
    if (pulse > 0 || recentlyHit) {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const bx = x + Math.cos(a) * 53, by = y + Math.sin(a) * 31;
        g.fillStyle(0xf9ffff, 0.9).fillCircle(bx, by, 6 + i % 3 * 3);
        g.lineStyle(2, 0x8ebcc6).strokeCircle(bx, by, 6 + i % 3 * 3);
      }
    }
    this.sponge(x, y, pulse);
  }

  private plate(): void {
    const g = this.art;
    g.fillStyle(0xfaf5df).fillCircle(0, -20, 157);
    g.lineStyle(5, HOME_INK).strokeCircle(0, -20, 157);
    g.lineStyle(12, this.look.rim).strokeCircle(0, -20, 143);
    g.lineStyle(3, 0xc5c8b6).strokeCircle(0, -20, 116);
    g.fillStyle(0xfffff2).fillCircle(0, -20, 112);
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      g.fillStyle(0xfaf5df).fillCircle(Math.cos(a) * 143, -20 + Math.sin(a) * 143, 3);
    }
  }

  private glass(): void {
    const g = this.art;
    shape(g, [-110, -145, 110, -145, 82, 116, 59, 136, -59, 136, -82, 116], 0xd1edec, this.look.rim, 5);
    g.fillStyle(0xf2fffa, 0.65).fillEllipse(0, -144, 218, 39);
    g.lineStyle(4, this.look.rim).strokeEllipse(0, -144, 218, 39);
    g.lineStyle(7, 0xf5fffb, 0.9).lineBetween(-83, -103, -66, 94).lineBetween(75, -98, 61, 44);
    g.lineStyle(4, 0x8dbbbf).strokeEllipse(0, 116, 152, 29);
    g.lineStyle(3, 0xf5fffb).lineBetween(-53, 123, 50, 123);
  }

  private cutlery(): void {
    const g = this.art, metal = 0xdce5e7, ink = this.look.rim;
    // Fork with four separate tines.
    slab(g, -121, -69, 22, 211, metal, 11, ink);
    slab(g, -141, -112, 62, 58, metal, 19, ink);
    for (let i = 0; i < 4; i++) slab(g, -141 + i * 17, -165, 11, 74, metal, 5, ink);
    // Spoon with a concave bowl and a rounded handle.
    slab(g, -11, -68, 22, 211, metal, 11, ink);
    g.fillStyle(metal).fillEllipse(0, -116, 74, 105);
    g.lineStyle(4, ink).strokeEllipse(0, -116, 74, 105);
    g.fillStyle(0xb3c8d1).fillEllipse(2, -118, 48, 73);
    g.lineStyle(4, 0xfaffff).lineBetween(-15, -131, -17, -110);
    // A broad table-knife blade, tapering into its handle.
    shape(g, [97, -168, 119, -168, 140, -145, 143, -64, 122, -38, 122, 130, 114, 143, 98, 138, 95, 124], metal, ink, 4);
    for (const x of [-110, 0, 110]) g.lineStyle(3, 0xfaffff).lineBetween(x - 4, 57, x - 4, 116);
  }

  private sponge(x: number, y: number, pulse: number): void {
    const g = this.art, width = 100 + pulse * 8, height = 53 - pulse * 9;
    g.fillStyle(0x537d74, 0.22).fillEllipse(x + 7, y + 28, 111, 32);
    slab(g, x - width / 2, y - height / 2 + 11, width, height, 0xe1b544, 12, 0x8f743b);
    slab(g, x - width / 2, y - height / 2, width, height - 8, 0xf8d863, 12, 0x8f743b);
    slab(g, x - width / 2, y - height / 2 - 7, width, 15, 0x4f8a6e, 7, 0x3b6c56);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0xd3a33d).fillEllipse(x - 35 + i % 4 * 23, y + 7 + Math.floor(i / 4) * 13, 7, 4);
    }
  }
}
