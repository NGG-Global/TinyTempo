import type Phaser from 'phaser';
import { mix } from '@/ui/colour';
import { fillContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { contactPulse, roomReveal } from './householdMotion';
import { plant, shape, slab, sparkle } from './householdArt';
import { clamp01, easeOut } from './motion';

export class LightSwitchVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xe9e4db, 0xf1cf93); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const reveal = roomReveal(ending, this.successful);
    const on = ending >= 0 ? this.successful : this.strokes % 2 === 1;
    const switchPulse = contactPulse(ending >= 0 ? ending : now - this.strikeAt, 0.16);
    const room = (colour: number) => mix(0x293840, colour, reveal);
    slab(g, -346, -246, 692, 490, 0x293840, 22, 0x536067);
    // The tiny stage is a cutaway salon. Details emerge as the final circuit warms up.
    g.fillStyle(room(0x678c80)).fillRoundedRect(-332, -232, 664, 390, 12);
    for (let i = 0; i < 17; i++) {
      const x = -315 + i * 39;
      g.lineStyle(1.5, room(0x88a08b)).lineBetween(x, -219, x, 142);
      for (let j = 0; j < 6; j++) {
        g.fillStyle(room(0x9bb496)).fillEllipse(x + 5, -195 + j * 54, 7, 12);
      }
    }
    g.fillStyle(room(0xc7a078)).fillRect(-332, 149, 664, 80);
    g.lineStyle(2, room(0x9b785a));
    for (let i = -4; i <= 4; i++) g.lineBetween(i * 63, 151, Math.max(-329, Math.min(329, i * 100)), 229);
    g.lineBetween(-330, 180, 330, 180).lineBetween(-330, 215, 330, 215);
    g.lineStyle(7, room(0xe7d6ab)).lineBetween(-329, 143, 329, 143).lineBetween(-329, -220, 329, -220);
    // Arched moonlit window and velvet curtains.
    slab(g, -292, -177, 136, 204, room(0xd6b985), 58, room(0x313f41));
    slab(g, -281, -165, 114, 180, room(0x344e66), 49, room(0xc9b37f));
    g.fillStyle(room(0xf2dfb5)).fillCircle(-204, -117, 17);
    g.fillStyle(room(0x344e66)).fillCircle(-195, -125, 17);
    g.lineStyle(5, room(0xb49c77)).lineBetween(-224, -163, -224, 15).lineBetween(-280, -71, -168, -71);
    for (const x of [-307, -163]) {
      shape(g, [x - 10, -178, x + 23, -178, x + 14, -42, x + 25, 40, x - 13, 40], room(0xb46f61), room(0x775950), 3);
      g.lineStyle(3, room(0xd39b7d)).lineBetween(x + 2, -164, x + 6, -59);
      g.lineStyle(5, room(0xd3b67a)).lineBetween(x - 3, -42, x + 15, -42);
    }
    // Gallery wall: three miniature paintings with brass frames.
    for (let i = 0; i < 3; i++) {
      const x = -99 + i * 78, y = -124 + (i % 2) * 17;
      slab(g, x, y, 59, 73, room(0xc6a362), 3, room(0x715843));
      g.fillStyle(room(i % 2 ? 0xdba88c : 0xa8bdaf)).fillRect(x + 7, y + 7, 45, 59);
      g.fillStyle(room(0xeacf97)).fillCircle(x + 34, y + 23, 9);
      shape(g, [x + 8, y + 58, x + 23, y + 33, x + 36, y + 52, x + 50, y + 40, x + 50, y + 66, x + 8, y + 66], room(0x58756c), room(0x58756c), 0);
    }
    // Persian rug, low table, jewel-toned sofa and cushions.
    g.fillStyle(room(0x965b60)).fillEllipse(-34, 183, 351, 66);
    g.lineStyle(3, room(0xd6aa81)).strokeEllipse(-34, 183, 312, 49);
    for (let i = 0; i < 9; i++) g.fillStyle(room(0xe0b285)).fillEllipse(-166 + i * 32, 183, 12, 5);
    slab(g, -129, 41, 254, 85, room(0xb87955), 26, room(0x5b4a42));
    slab(g, -138, 87, 272, 56, room(0xd89b69), 16, room(0x5b4a42));
    for (const x of [-139, 107]) slab(g, x, 73, 35, 70, room(0xc98c60), 15, room(0x5b4a42));
    for (const x of [-112, 104]) g.fillStyle(room(0x5b4a42)).fillRoundedRect(x, 139, 12, 19, 4);
    slab(g, -93, 61, 46, 38, room(0xead7a8), 8, room(0x997951));
    slab(g, 52, 61, 44, 39, room(0x789a86), 8, room(0x4e6e61));
    g.lineStyle(3, room(0xe5c989)).lineBetween(63, 67, 84, 93).lineBetween(84, 67, 63, 93);
    g.fillStyle(room(0x674e40)).fillRoundedRect(-54, 167, 9, 26, 3).fillRoundedRect(50, 167, 9, 26, 3);
    g.fillStyle(room(0x956847)).fillEllipse(4, 160, 149, 34);
    g.lineStyle(3, room(0xe1b778)).strokeEllipse(4, 156, 149, 28);
    g.fillStyle(room(0xe5d5b3)).fillEllipse(7, 151, 27, 10).fillRoundedRect(-3, 135, 19, 17, 5);
    // The plant and shelf are revealed together, using graphics alpha per element.
    if (reveal > 0) {
      g.fillStyle(0xd9b382, reveal).fillRoundedRect(163, 0, 135, 8, 3);
      for (let i = 0; i < 6; i++) g.fillStyle([0xdbaa76, 0xb87262, 0x8bab9b][i % 3]!, reveal).fillRect(174 + i * 12, -36 + (i % 2) * 6, 9, 36 - (i % 2) * 6);
      if (reveal > 0.5) plant(g, 277, 146, 0.8);
    }
    // Main lamp responds on every beat, independently of the hidden room.
    const lampX = 205;
    if (on) {
      for (let i = 5; i > 0; i--) g.fillStyle(0xffdd87, 0.018).fillEllipse(lampX, 24, 125 + i * 31, 206 + i * 18);
      g.fillStyle(0xffd47e, 0.13);
      fillContour(g, [lampX - 34, -54, lampX + 34, -54, lampX + 78, 158, lampX - 76, 158]);
    }
    g.fillStyle(0xa18a63).fillEllipse(lampX, 159, 74, 17);
    g.lineStyle(8, 0xbca271).lineBetween(lampX, -70, lampX, 156);
    g.lineStyle(2, 0xebd5a1).lineBetween(lampX - 2, -68, lampX - 2, 149);
    shape(g, [lampX - 34, -137, lampX + 34, -137, lampX + 58, -54, lampX - 58, -54], on ? 0xffe4a0 : 0x9a9b8d, 0x5d6259);
    for (let i = -2; i <= 2; i++) g.lineStyle(2, on ? 0xe6be75 : 0x7e877e, 0.6).lineBetween(lampX + i * 12, -132, lampX + i * 20, -59);
    g.fillStyle(on ? 0xfff2be : 0x777f75).fillEllipse(lampX, -54, 114, 17);
    // A foreground switch remains bright and readable even when the lamp is off.
    slab(g, -321, 55, 100, 141, 0x998d7b, 18, 0x4d504c);
    slab(g, -326, 49, 100, 141, 0xe9dfc8, 18, 0x555650);
    for (const y of [62, 177]) {
      g.fillStyle(0xb9b29f).fillCircle(-276, y, 4);
      g.lineStyle(1, 0x797d72).lineBetween(-279, y, -273, y);
    }
    slab(g, -307, 78, 62, 82, 0x7d8378, 9, 0x62685e);
    slab(g, -304, on ? 80 : 88, 56, 67 - switchPulse * 3, 0xfff4da, 7, 0xb5b49e);
    g.lineStyle(3, 0xc4c1a9).lineBetween(-295, 120, -257, 120);
    g.fillStyle(on ? 0xefbc63 : 0x8f9a89).fillRoundedRect(-282, 92, 12, 4, 2);
    // An extravagant chandelier blooms lamp by lamp on the successful final beat.
    if (reveal > 0) {
      g.lineStyle(4, room(0xd4ad64)).lineBetween(8, -225, 8, -174);
      for (let i = -2; i <= 2; i++) {
        const x = 8 + i * 39, y = -179 + Math.abs(i) * 14;
        g.lineStyle(3, room(0xd4ad64)).lineBetween(8, -150, x, y + 18).lineBetween(x, y + 18, x, y);
        const light = easeOut((ending - 0.28 - (i + 2) * 0.09) / 0.25);
        for (let ring = 3; ring > 0; ring--) g.fillStyle(0xffde8d, light * 0.065).fillCircle(x, y - 7, 12 + ring * 8);
        g.fillStyle(mix(0xb79b70, 0xfff0b4, light)).fillEllipse(x, y - 7, 13, 23);
        g.fillStyle(room(0xd4ad64)).fillEllipse(x, y + 8, 26, 7);
      }
      if (!this.still) {
        const a = Math.sin(clamp01((ending - 0.7) / 0.9) * Math.PI);
        sparkle(g, -131, -173, 13 * a, a);
        sparkle(g, 130, -196, 16 * a, a);
      }
    }
  }
}
