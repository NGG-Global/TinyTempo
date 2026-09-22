import type Phaser from 'phaser';
import { mix } from '@/ui/colour';
import { fillContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { contactPulse, roomReveal } from './householdMotion';
import { plant, shape, slab, sparkle } from './householdArt';
import { lightLook, type LightLook } from './lightLooks';
import { clamp01, easeOut } from './motion';

export class LightSwitchVignette extends HouseholdVignette {
  /** Which room the switch lights. Chosen once from the rotation lap. */
  private readonly look: LightLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xe9e4db, 0xf1cf93);
    this.look = lightLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const reveal = roomReveal(ending, this.successful);
    const on = ending >= 0 ? this.successful : this.strokes % 2 === 1;
    const switchPulse = contactPulse(ending >= 0 ? ending : now - this.strikeAt, 0.16);
    const room = (colour: number) => mix(0x293840, colour, reveal);
    slab(g, -346, -246, 692, 490, 0x293840, 22, 0x536067);
    // The tiny stage is a cutaway room. Details emerge as the final circuit warms up.
    g.fillStyle(room(this.look.wall)).fillRoundedRect(-332, -232, 664, 390, 12);
    if (this.look.interior === 'kitchen') this.kitchen(room, reveal);
    else if (this.look.interior === 'study') this.study(room, reveal);
    else if (this.look.interior === 'bedroom') this.bedroom(room, reveal);
    else this.salon(room, reveal);
    // Main lamp responds on every beat, independently of the hidden room.
    this.lamp(on);
    this.rocker(on, switchPulse);
    this.ceiling(ending, reveal, room);
  }

  /** The original cutaway salon. Lap 0 keeps every stroke a returning player has seen. */
  private salon(room: (colour: number) => number, reveal: number): void {
    const g = this.art;
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
    if (reveal > 0) {
      g.fillStyle(0xd9b382, reveal).fillRoundedRect(163, 0, 135, 8, 3);
      for (let i = 0; i < 6; i++) g.fillStyle([0xdbaa76, 0xb87262, 0x8bab9b][i % 3]!, reveal).fillRect(174 + i * 12, -36 + (i % 2) * 6, 9, 36 - (i % 2) * 6);
      if (reveal > 0.5) plant(g, 277, 146, 0.8);
    }
  }

  /** Cream subway tiles, copper pans, a checked cloth. The lamp still stands to the right. */
  private kitchen(room: (colour: number) => number, reveal: number): void {
    const g = this.art;
    const look = this.look;
    g.lineStyle(1.5, room(look.wallMark));
    for (let i = 0; i < 17; i++) g.lineBetween(-322 + i * 41, -219, -322 + i * 41, 142);
    for (let j = 0; j < 10; j++) g.lineBetween(-328, -220 + j * 36, 328, -220 + j * 36);
    g.fillStyle(room(look.floor)).fillRect(-332, 149, 664, 80);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 12; col++) {
        const light = (row + col) % 2 === 0;
        g.fillStyle(room(light ? 0xf4eee3 : look.floorGrain)).fillRect(-328 + col * 55, 152 + row * 26, 55, 26);
      }
    }
    g.lineStyle(7, room(look.trim)).lineBetween(-329, 143, 329, 143).lineBetween(-329, -220, 329, -220);
    // Window over the sink, morning sky, a herb on the sill.
    slab(g, -292, -177, 136, 168, room(0xd6c4a0), 8, room(0x8a7058));
    slab(g, -280, -165, 112, 144, room(0x7eb0d4), 4, room(0xc9b37f));
    g.fillStyle(room(0xf7e6a8)).fillCircle(-198, -128, 20);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.lineStyle(3, room(0xf7e6a8)).lineBetween(-198 + Math.cos(a) * 16, -128 + Math.sin(a) * 16, -198 + Math.cos(a) * 28, -128 + Math.sin(a) * 28);
    }
    g.lineStyle(5, room(0xb49c77)).lineBetween(-224, -163, -224, -22).lineBetween(-278, -92, -170, -92);
    for (const x of [-307, -163]) {
      shape(g, [x - 8, -178, x + 20, -178, x + 12, -70, x + 22, 8, x - 10, 8], room(look.curtain), room(0x4e6e61), 3);
    }
    slab(g, -286, 8, 124, 18, room(0xd8c4a4), 4, room(0x8a7058));
    g.fillStyle(room(0x8cb68b)).fillEllipse(-224, 4, 36, 14);
    g.fillStyle(room(0x5b9479)).fillEllipse(-210, -6, 16, 22);
    // Upper cupboards and hanging copper.
    slab(g, -96, -186, 88, 70, room(look.furniture), 8, room(0x8a7058));
    slab(g, 4, -186, 88, 70, room(look.furniture), 8, room(0x8a7058));
    g.fillStyle(room(0xb49c77)).fillCircle(-52, -151, 5).fillCircle(48, -151, 5);
    g.lineStyle(3, room(0x8a8680)).lineBetween(-90, -108, 86, -108);
    for (let i = 0; i < 3; i++) {
      const x = -64 + i * 48;
      g.lineStyle(2, room(0x8a8680)).lineBetween(x, -108, x, -86);
      g.fillStyle(room(look.accent)).fillEllipse(x, -70, 22, 28);
      g.fillStyle(room(0xe8a060), 0.5).fillEllipse(x - 4, -76, 10, 12);
    }
    // Worktop, sink and a fruit bowl on a checked cloth.
    slab(g, -300, 78, 168, 66, room(look.furnitureLit), 8, room(0x8a7058));
    g.fillStyle(room(0xb8c4c8)).fillRoundedRect(-270, 86, 70, 22, 8);
    g.lineStyle(2, room(0x8a9aa0)).strokeRoundedRect(-270, 86, 70, 22, 8);
    g.fillStyle(room(look.rug)).fillEllipse(-34, 188, 300, 52);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2 === 0) g.fillStyle(room(0xf4eee3)).fillRect(-148 + i * 28, 96 + j * 18, 28, 18);
        else g.fillStyle(room(look.rug)).fillRect(-148 + i * 28, 96 + j * 18, 28, 18);
      }
    }
    slab(g, -120, 70, 220, 14, room(0x8a7058), 4, room(0x5b4a42));
    g.fillStyle(room(0xe25c5c)).fillCircle(-40, 78, 11);
    g.fillStyle(room(0xf1c04f)).fillCircle(-18, 74, 10);
    g.fillStyle(room(0x7cb56b)).fillCircle(-28, 90, 9);
    if (reveal > 0.5) plant(g, 277, 146, 0.7);
  }

  /** Dark green walls, a book wall, leather and a globe. */
  private study(room: (colour: number) => number, reveal: number): void {
    const g = this.art;
    const look = this.look;
    g.fillStyle(room(look.furniture)).fillRect(-332, 40, 664, 110);
    g.lineStyle(3, room(look.trim)).lineBetween(-329, 40, 329, 40);
    for (let i = 0; i < 8; i++) g.lineStyle(1.5, room(look.wallMark)).lineBetween(-315 + i * 84, -219, -315 + i * 84, 40);
    g.fillStyle(room(look.floor)).fillRect(-332, 149, 664, 80);
    g.lineStyle(2, room(look.floorGrain));
    for (let i = -4; i <= 4; i++) g.lineBetween(i * 63, 151, Math.max(-329, Math.min(329, i * 100)), 229);
    g.lineBetween(-330, 180, 330, 180).lineBetween(-330, 215, 330, 215);
    g.lineStyle(7, room(look.trim)).lineBetween(-329, 143, 329, 143).lineBetween(-329, -220, 329, -220);
    slab(g, -292, -177, 136, 204, room(look.trim), 8, room(0x313f41));
    slab(g, -281, -165, 114, 180, room(0x3a4a58), 6, room(0xc9b37f));
    g.fillStyle(room(0xd8c48a)).fillCircle(-204, -120, 14);
    g.lineStyle(4, room(0x8a9aaa), 0.55);
    for (let i = 0; i < 5; i++) g.lineBetween(-276, -150 + i * 28, -172, -138 + i * 28);
    for (const x of [-307, -163]) {
      shape(g, [x - 10, -178, x + 23, -178, x + 14, -42, x + 25, 40, x - 13, 40], room(look.curtain), room(0x3a2430), 3);
      g.lineStyle(5, room(look.trim)).lineBetween(x - 3, -42, x + 15, -42);
    }
    // Bookcase: three shelves of spines, no two the same height.
    slab(g, -108, -186, 248, 214, room(look.furniture), 6, room(0x3a2418));
    const spines = [0x8b2e2e, 0x2c4a6e, 0xc4a06a, 0x3d5c52, 0x7a4a28, 0x5c3d4a];
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = -168 + shelf * 64;
      g.fillStyle(room(look.trim)).fillRect(-98, y + 48, 228, 6);
      for (let b = 0; b < 11; b++) {
        const h = 34 + (b * 3 + shelf * 5) % 14;
        g.fillStyle(room(spines[(b + shelf * 3) % spines.length]!)).fillRect(-94 + b * 20, y + 48 - h, 16, h);
      }
    }
    g.fillStyle(room(look.rug)).fillEllipse(-20, 186, 320, 58);
    g.lineStyle(3, room(look.trim)).strokeEllipse(-20, 186, 280, 42);
    slab(g, -120, 70, 160, 70, room(look.furniture), 18, room(0x3a2418));
    slab(g, -128, 108, 176, 36, room(look.furnitureLit), 12, room(0x3a2418));
    g.fillStyle(room(look.accent)).fillEllipse(-40, 96, 36, 22);
    slab(g, 52, 78, 78, 52, room(look.furnitureLit), 6, room(0x3a2418));
    g.fillStyle(room(0xc4a06a)).fillCircle(90, 64, 22);
    g.lineStyle(2, room(0x8a7058)).strokeCircle(90, 64, 22);
    g.lineStyle(2, room(0x3d5c52)).beginPath().arc(90, 64, 22, -0.4, 2.2).strokePath();
    if (reveal > 0.5) plant(g, 277, 146, 0.75);
  }

  /** Dusty-rose paper, a made bed, dawn in the window. */
  private bedroom(room: (colour: number) => number, reveal: number): void {
    const g = this.art;
    const look = this.look;
    for (let i = 0; i < 12; i++) {
      g.lineStyle(6, room(look.wallMark), 0.45).lineBetween(-328 + i * 56, -219, -328 + i * 56, 148);
    }
    for (let i = 0; i < 28; i++) {
      g.fillStyle(room(0xe8d0dc)).fillCircle(-300 + (i * 47) % 620, -190 + (i * 29) % 310, 4);
    }
    g.fillStyle(room(look.floor)).fillRect(-332, 149, 664, 80);
    g.lineStyle(2, room(look.floorGrain));
    for (let i = -4; i <= 4; i++) g.lineBetween(i * 70, 151, i * 70 + 18, 229);
    g.lineStyle(7, room(look.trim)).lineBetween(-329, 143, 329, 143).lineBetween(-329, -220, 329, -220);
    slab(g, -292, -177, 136, 204, room(look.trim), 48, room(0x313f41));
    slab(g, -281, -165, 114, 180, room(0xf2c8a8), 42, room(0xc9b37f));
    g.fillStyle(room(0xf7e0b0)).fillCircle(-204, -128, 20);
    g.fillStyle(room(0xf2c8a8)).fillCircle(-192, -136, 16);
    for (const x of [-307, -163]) {
      shape(g, [x - 10, -178, x + 23, -178, x + 16, -20, x + 26, 40, x - 13, 40], room(look.curtain), room(0xc4a090), 3);
      g.lineStyle(3, room(0xf4e8dc), 0.7).lineBetween(x + 2, -164, x + 8, 20);
    }
    slab(g, -70, -150, 86, 70, room(look.accent), 4, room(0x8a7058));
    g.fillStyle(room(0xf4eee3)).fillRect(-60, -140, 66, 50);
    g.fillStyle(room(look.curtain)).fillEllipse(-27, -118, 24, 16);
    g.fillStyle(room(look.rug)).fillEllipse(-10, 186, 340, 60);
    g.lineStyle(3, room(0xc4b8d4)).strokeEllipse(-10, 186, 300, 44);
    // Headboard, mattress, two pillows and a folded throw.
    slab(g, -150, 18, 280, 36, room(look.furniture), 8, room(0x8a7058));
    slab(g, -158, 48, 296, 88, room(look.furnitureLit), 16, room(0x8a7058));
    slab(g, -140, 54, 70, 36, room(0xf4eee3), 10, room(0xc4b8a8));
    slab(g, -62, 54, 70, 36, room(0xf4eee3), 10, room(0xc4b8a8));
    g.fillStyle(room(look.rug)).fillRoundedRect(-150, 96, 200, 28, 8);
    slab(g, 150, 70, 48, 52, room(look.furniture), 8, room(0x8a7058));
    g.fillStyle(room(0xf4eee3)).fillEllipse(174, 66, 18, 10);
    if (reveal > 0.5) plant(g, 277, 146, 0.7);
  }

  private lamp(on: boolean): void {
    const g = this.art;
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
  }

  private rocker(on: boolean, switchPulse: number): void {
    const g = this.art;
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
  }

  /**
   * Five lights bloom on the same schedule the success voice uses. The salon keeps
   * its chandelier; the other rooms hang the same five bulbs in their own fittings.
   */
  private ceiling(ending: number, reveal: number, room: (colour: number) => number): void {
    if (reveal <= 0) return;
    const g = this.art;
    const interior = this.look.interior;
    if (interior === 'kitchen') {
      g.lineStyle(4, room(0x8a8680)).lineBetween(-70, -222, 86, -222);
      for (let i = -2; i <= 2; i++) {
        const x = 8 + i * 39;
        g.lineStyle(2, room(0x8a8680)).lineBetween(x, -222, x, -168);
        this.bulb(x, -160, ending, i, 0xc4a06a, room);
      }
    } else if (interior === 'study') {
      g.lineStyle(4, room(0xc4a06a)).lineBetween(8, -225, 8, -174);
      for (let i = -2; i <= 2; i++) {
        const x = 8 + i * 39, y = -179 + Math.abs(i) * 14;
        g.lineStyle(3, room(0xc4a06a)).lineBetween(8, -168, x, y + 10);
        this.bulb(x, y, ending, i, 0xc4a06a, room);
      }
    } else if (interior === 'bedroom') {
      g.fillStyle(room(0xf4eee3)).fillEllipse(8, -188, 90, 28);
      g.lineStyle(3, room(0xd4c4a8)).strokeEllipse(8, -188, 90, 28);
      g.lineStyle(3, room(0xd4c4a8)).lineBetween(8, -225, 8, -202);
      for (let i = -2; i <= 2; i++) this.bulb(8 + i * 22, -176, ending, i, 0xe8c4a0, room);
    } else {
      g.lineStyle(4, room(0xd4ad64)).lineBetween(8, -225, 8, -174);
      for (let i = -2; i <= 2; i++) {
        const x = 8 + i * 39, y = -179 + Math.abs(i) * 14;
        g.lineStyle(3, room(0xd4ad64)).lineBetween(8, -150, x, y + 18).lineBetween(x, y + 18, x, y);
        this.bulb(x, y, ending, i, 0xd4ad64, room);
      }
    }
    if (!this.still) {
      const a = Math.sin(clamp01((ending - 0.7) / 0.9) * Math.PI);
      sparkle(g, -131, -173, 13 * a, a);
      sparkle(g, 130, -196, 16 * a, a);
    }
  }

  private bulb(x: number, y: number, ending: number, i: number, metal: number, room: (colour: number) => number): void {
    const g = this.art;
    const light = easeOut((ending - 0.28 - (i + 2) * 0.09) / 0.25);
    for (let ring = 3; ring > 0; ring--) g.fillStyle(0xffde8d, light * 0.065).fillCircle(x, y - 7, 12 + ring * 8);
    g.fillStyle(mix(0xb79b70, 0xfff0b4, light)).fillEllipse(x, y - 7, 13, 23);
    g.fillStyle(room(metal)).fillEllipse(x, y + 8, 26, 7);
  }
}
