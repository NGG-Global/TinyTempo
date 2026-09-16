import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { contactPulse, doorOpening } from './householdMotion';
import { HOME_INK, plant, shape, slab, sparkle } from './householdArt';
import { clamp01 } from './motion';

export class DoorbellVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xf0e5d7, 0xf0cd9b); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const open = doorOpening(ending, this.successful, this.still);
    const age = now - this.strikeAt;
    const press = contactPulse(age, 0.18);
    slab(g, -327, -246, 654, 478, 0xddc2a1, 22, 0xb6987e);
    g.lineStyle(2, 0xb99a7f, 0.45);
    for (let row = 0; row < 10; row++) {
      const y = -226 + row * 44;
      g.lineBetween(-312, y, 312, y);
      for (let col = 0; col < 6; col++) {
        const x = -305 + col * 122 + (row % 2) * 61;
        if (x < 310) g.lineBetween(x, y, x, y + 44);
      }
    }
    g.fillStyle(0x71584a, 0.14).fillRoundedRect(-148, -215, 300, 451, 12);
    slab(g, -162, -231, 296, 456, 0xeedeae, 15, 0x9b805f);
    // Interior is always behind the hinged polygon, so failure cannot reveal a sliver.
    g.fillStyle(0x8e6c57).fillRect(-142, -208, 256, 409);
    g.fillStyle(0xf0cb8c).fillRect(-130, -205, 241, 354);
    g.fillStyle(0xd0a374).fillRect(-130, 143, 241, 58);
    shape(g, [-130, 143, 110, 143, 110, 201, -130, 201], 0xb4835f, 0xb4835f, 0);
    g.lineStyle(2, 0xe4bd84).lineBetween(-63, 144, -99, 201).lineBetween(17, 144, 38, 201);
    // A welcoming hallway: runner, picture, pendant, plant, and a curious ginger cat.
    shape(g, [-38, 139, 32, 139, 70, 201, -83, 201], 0xb66654, 0x8c5346, 2);
    g.lineStyle(3, 0xe7b77e).lineBetween(-33, 152, 30, 152).lineBetween(-63, 189, 57, 189);
    slab(g, 20, -117, 63, 86, 0xad824e, 3, 0x816140);
    g.fillStyle(0x7f9e87).fillRect(28, -109, 47, 70);
    g.fillStyle(0xe2c999).fillCircle(53, -86, 12);
    shape(g, [29, -40, 47, -77, 73, -41], 0x466e64, 0x466e64, 0);
    g.lineStyle(3, 0x856747).lineBetween(-34, -205, -34, -162);
    shape(g, [-57, -163, -11, -163, 0, -141, -69, -141], 0xb58b52, 0x856747, 2);
    g.fillStyle(0xffebaa).fillEllipse(-34, -139, 63, 11);
    if (open > 0) {
      plant(g, 77, 116, 0.65);
      this.cat(9, 141, ending);
      shape(g, [-133, 201, 112, 201, 232, 234, -204, 234], 0xf4d691, 0xf4d691, 0);
    }
    // Left hinge with a foreshortened face and a visible thickness on its free edge.
    const left = -140, right = 113 - open * 231;
    const inset = open * 22;
    shape(g, [left, -209, right, -209 + inset, right, 201 - inset, left, 201], 0x527e73, 0x355b55, 6);
    if (open > 0.02) shape(g, [right, -209 + inset, right + 9, -205 + inset, right + 9, 197 - inset, right, 201 - inset], 0x365d56, 0x2e514c, 2);
    const projectX = (x: number) => left + (x - left) * (right - left) / 253;
    const projectY = (x: number, y: number) => y + ((x - left) / 253) * inset * (1 - 2 * (y + 209) / 410);
    const panel = (x: number, y: number, w: number, h: number) => {
      const points = [x, y, x + w, y, x + w, y + h, x, y + h];
      shape(g, points.map((v, i) => i % 2 ? projectY(points[i - 1]!, v) : projectX(v)), 0x608f7f, 0x386559, 3);
      g.lineStyle(2, 0x9aba91, 0.7).lineBetween(projectX(x + 5), projectY(x + 5, y + 6), projectX(x + w - 4), projectY(x + w - 4, y + 6));
    };
    panel(-116, -182, 88, 165); panel(-7, -182, 88, 165);
    panel(-116, 13, 88, 156); panel(-7, 13, 88, 156);
    const squeeze = Math.max(0.12, 1 - open * 0.91);
    // Brass knocker, escutcheon, handle and keyhole all follow the door's plane.
    g.fillStyle(0xd4af69).fillEllipse(projectX(-19), -100, 21 * squeeze, 29);
    g.lineStyle(4, 0xe0bf7a).strokeEllipse(projectX(-19), -78, 31 * squeeze, 37);
    g.fillStyle(0xc6a563).fillEllipse(projectX(82), projectY(82, -6), 18 * squeeze, 39);
    g.lineStyle(8 * squeeze, 0xe8ca88).lineBetween(projectX(81), projectY(81, -14), projectX(54), projectY(54, -14));
    g.fillStyle(0x5d634e).fillCircle(projectX(81), projectY(81, 3), 2.6 * squeeze);
    // Porcelain bell plate, an inset amber halo, and visible button travel.
    slab(g, 178, -36, 86, 124, 0xb99c75, 18, 0x927858);
    slab(g, 172, -42, 86, 124, 0xf8e7bc, 18, 0x9c8260);
    for (const y of [-27, 67]) {
      g.fillStyle(0xc5a675).fillCircle(215, y, 4);
      g.lineStyle(1, 0x8e795b).lineBetween(213, y - 2, 217, y + 2);
    }
    g.fillStyle(0x826c50).fillCircle(215, 20, 27);
    g.lineStyle(4, age < 0.22 ? 0xffd986 : 0xd5b26a).strokeCircle(215, 20, 28);
    g.fillStyle(press > 0 ? 0xdac9a0 : 0xffefcc).fillCircle(215, 16 + press * 5, 21 - press * 2);
    g.fillStyle(0xffffff, 0.55).fillEllipse(210, 8 + press * 5, 13, 7);
    if (!this.still && age >= 0 && age < 0.4) {
      const a = 1 - age / 0.4;
      for (const side of [-1, 1]) {
        g.lineStyle(3, 0xb78d4f, a).beginPath().arc(215, 20, 39 + (1 - a) * 11, side < 0 ? 2.6 : -0.55, side < 0 ? 3.7 : 0.55).strokePath();
      }
    }
    // Doorstep and woven mat anchor the swinging door.
    slab(g, -191, 205, 357, 29, 0xd4c6a7, 6, 0x9b8b73);
    shape(g, [-119, 216, 94, 216, 118, 244, -142, 244], 0xa77b4e, 0x806344, 2);
    g.lineStyle(1.5, 0xc9a36c, 0.8);
    for (let i = 0; i < 16; i++) g.lineBetween(-112 + i * 13, 220, -121 + i * 15, 239);
    plant(g, -249, 183, 0.9);
    if (ending >= 0 && !this.successful) {
      // A quiet, unlit bell. No handle turn, no opening, no success light.
      g.fillStyle(0x8b7660).fillCircle(215, 17, 4);
    }
    if (open > 0.85 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.75) / 0.85) * Math.PI);
      sparkle(g, 72, 14, 11 * a, a);
    }
  }

  private cat(x: number, y: number, ending: number): void {
    const g = this.art;
    const sway = this.still ? 0 : Math.sin(ending * 4) * 7;
    g.lineStyle(13, 0xbc794c).beginPath().arc(x + 26, y - 19, 25, -1.3 + sway * 0.01, 1.7).strokePath();
    g.fillStyle(0xd89960).fillEllipse(x, y - 22, 48, 60);
    shape(g, [x - 23, y - 42, x - 27, y - 78, x - 8, y - 64, x + 8, y - 64, x + 27, y - 78, x + 23, y - 42], 0xe4ad72, 0x986c48, 2);
    g.fillStyle(0xe4ad72).fillEllipse(x, y - 49, 49, 35);
    g.fillStyle(0xf3d3a0).fillEllipse(x, y - 20, 23, 32);
    g.fillStyle(HOME_INK).fillEllipse(x - 10, y - 51, 4, 7).fillEllipse(x + 10, y - 51, 4, 7);
    g.fillStyle(0xa76458).fillTriangle(x - 3, y - 45, x + 3, y - 45, x, y - 41);
    g.fillStyle(0xf1c58d).fillEllipse(x - 13, y + 5, 20, 10).fillEllipse(x + 13, y + 5, 20, 10);
  }
}
