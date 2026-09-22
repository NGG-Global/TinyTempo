import type Phaser from 'phaser';
import { cubicContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import { clamp01 } from './motion';
import { consumed, contactPulse, FREEZE_AT, reveal } from './treatMotion';
import { celebration } from './treatArt';
import { slushyLook, type SlushyLook } from './slushyLooks';

/** A slushy in a clear cup; the bent straw stays joined to the drinker's lips. */
export class SlushyVignette extends HouseholdVignette {
  /** Which flavour is poured. Chosen once from the rotation lap. */
  private readonly look: SlushyLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xe4eee5, 0xc8e9df);
    this.look = slushyLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const amount = consumed(times.length, this.plan?.targets.length ?? 4, ending, this.successful);
    const sipping = ending >= 0 ? (this.successful ? contactPulse(ending, 0.72) : contactPulse(ending, 0.22)) : contactPulse(now - this.strikeAt, 0.21);
    const freeze = ending >= 0 && !this.successful ? reveal(ending, FREEZE_AT, this.still) : 0;
    slab(g, -340, -228, 680, 460, 0xb8dbce, 34, 0x729d90);
    g.fillStyle(0xe2f1d8, 0.55).fillCircle(178, -115, 88);
    g.lineStyle(2, 0xf4f3da, 0.45);
    for (let i = 0; i < 7; i++) g.lineBetween(-321, -190 + i * 58, 320, -190 + i * 58);
    g.fillStyle(0x85b7a6, 0.55).fillRoundedRect(-317, 166, 634, 47, 17);
    this.person(sipping, freeze, ending >= 0 && this.successful && amount === 1);
    g.fillStyle(0x416e66, 0.22).fillEllipse(113, 171, 219, 29);
    this.cup(amount, sipping, now);
    if (freeze > 0) {
      for (let i = 0; i < 4; i++) {
        const x = -227 + i * 57, y = -155 - Math.sin(i * 2) * 29;
        this.snowflake(x, y, (10 + i % 2 * 4) * freeze);
      }
      // A hand to the temple makes the frozen reaction legible at phone size.
      const hx = -184, hy = 78 - freeze * 135;
      g.lineStyle(24, 0xf0b28d).lineBetween(-221, 112, hx, hy + 8);
      g.fillStyle(0xf9caa5).fillRoundedRect(hx - 15, hy - 27, 27, 43, 10);
      g.lineStyle(2, 0xc68569).lineBetween(hx - 5, hy - 18, hx - 5, hy + 2).lineBetween(hx + 3, hy - 18, hx + 3, hy + 2);
    }
    if (ending >= 0 && this.successful) celebration(g, ending, this.still);
  }

  private person(sip: number, freeze: number, happy: boolean): void {
    const g = this.art;
    shape(g, cubicContour(-239, 162, [
      [-251, 72, -219, 12, -150, 13], [-76, 3, -37, 75, -50, 162],
      [-83, 187, -216, 184, -239, 162],
    ]), 0xe6a44f, 0x9d683b, 3);
    g.lineStyle(11, 0xf6cf7f).lineBetween(-217, 110, -63, 110).lineBetween(-223, 139, -57, 139);
    g.fillStyle(0x805948, 0.14).fillEllipse(-147, 35, 70, 22);
    g.fillStyle(0xe9ab86).fillRoundedRect(-165, -9, 40, 44, 12);
    g.fillStyle(0xf7c49f).fillEllipse(-218, -54, 26, 34).fillEllipse(-71, -54, 22, 34);
    g.fillStyle(freeze > 0.5 ? 0xe6c3b2 : 0xf7c49f).fillRoundedRect(-219, -153, 148, 165, 62);
    g.fillStyle(0xe7a17f, 0.6).fillEllipse(-211, -42, 23, 60);
    g.fillStyle(0x493c39).fillRoundedRect(-224, -164, 156, 61, 29);
    shape(g, cubicContour(-224, -115, [[-197, -110, -181, -128, -167, -126], [-148, -91, -111, -89, -68, -110], [-63, -156, -197, -183, -224, -115]]), 0x493c39, 0x493c39, 0);
    g.lineStyle(5, 0x785648).beginPath().moveTo(-203, -145).lineTo(-175, -151).lineTo(-130, -142).strokePath();
    for (const x of [-176, -112]) {
      if (freeze > 0.3) {
        g.lineStyle(4, 0x654a44).beginPath().moveTo(x - 10, -81).lineTo(x + 2, -73).lineTo(x - 10, -65).strokePath();
        g.lineStyle(3, 0x654a44).lineBetween(x - 14, -92, x + 7, -86);
      } else if (happy) {
        g.lineStyle(4, 0x654a44).beginPath().arc(x, -68, 11, Math.PI + 0.2, Math.PI * 2 - 0.2).strokePath();
      } else {
        g.fillStyle(0xfff6df).fillEllipse(x, -76, 23, 29 - sip * 7);
        g.fillStyle(0x433d3a).fillEllipse(x + 4, -74, 10, 15 - sip * 5);
        g.fillStyle(0xffffff).fillCircle(x + 2, -79, 3);
      }
      g.fillStyle(freeze ? 0xaabecb : 0xe89181, 0.5).fillEllipse(x, -47, 25 - sip * 5, 14);
    }
    g.lineStyle(2.5, 0xce8d70).beginPath().moveTo(-142, -72).lineTo(-149, -54).lineTo(-140, -52).strokePath();
    if (freeze > 0.3) {
      g.lineStyle(3, 0x765454).beginPath().moveTo(-132, -24).lineTo(-125, -28).lineTo(-118, -24).lineTo(-111, -28).strokePath();
    } else if (happy) {
      g.fillStyle(0x8f504e).fillEllipse(-124, -30, 32, 22);
      g.fillStyle(0xfff9df).fillRoundedRect(-136, -39, 25, 9, 3);
    } else g.fillStyle(0x9e6656).fillEllipse(-105, -32, 16 - sip * 5, 10);
  }

  private cup(amount: number, sip: number, now: number): void {
    const g = this.art, look = this.look, x = 112, top = -49, base = 164;
    const left = (y: number) => x - 82 + (y - top) / (base - top) * 25;
    const right = (y: number) => x + 82 - (y - top) / (base - top) * 25;
    shape(g, [x - 84, top, x + 84, top, x + 58, base, x - 58, base], 0xd8eee6, 0x6e9c98, 3);
    const liquidY = top + 16 + amount * (base - top - 20);
    if (amount < 0.999) {
      shape(g, [left(liquidY) + 5, liquidY, right(liquidY) - 5, liquidY, x + 53, base - 5, x - 53, base - 5], look.drink, look.drink, 0);
      g.fillStyle(look.deep, 0.4).fillTriangle(x + 46, base - 6, right(liquidY) - 5, liquidY, right(liquidY) - 24, liquidY);
      g.fillStyle(look.surface).fillEllipse(x, liquidY, right(liquidY) - left(liquidY) - 9, 24 * (1 - amount) + 5);
      for (let i = 0; i < 55; i++) {
        const yy = top + 25 + ((i * 43) % 177), xx = x + Math.sin(i * 17) * 52;
        if (yy > liquidY + 6) {
          g.fillStyle(i % 3 ? look.ice : look.syrup, i % 3 ? 0.65 : 0.25).fillEllipse(xx, yy, 4 + i % 4, 3 + i % 3);
        }
      }
    }
    // A white paper straw, striped individually along its vertical and bent portions.
    g.lineStyle(12, 0xfff8e3).beginPath().moveTo(x + 18, base - 15).lineTo(x + 39, -79).lineTo(-103, -32).strokePath();
    g.lineStyle(5, look.stripe);
    for (let i = 0; i < 13; i++) {
      const yy = -66 + i * 16, xx = x + 38 - (yy + 66) * 0.084;
      g.lineBetween(xx - 4, yy - 2, xx + 4, yy + 3);
    }
    for (let i = 0; i < 14; i++) {
      const xx = -94 + i * 17, yy = -32 - (xx + 103) * 47 / 254;
      g.lineBetween(xx - 2, yy - 4, xx + 2, yy + 4);
    }
    if (sip > 0.05 && !this.still) {
      for (let i = 0; i < 3; i++) {
        const p = (now * 3 + i / 3) % 1;
        g.fillStyle(look.sip).fillCircle(x + 35 - p * 235, -78 + p * 43, 3.3);
      }
    }
    g.fillStyle(0xf1ffef, 0.25).fillRoundedRect(x - 62, top + 25, 16, 150, 7);
    g.lineStyle(4, 0xf3fff3, 0.85).lineBetween(x - 69, top + 20, x - 48, base - 14);
    g.lineStyle(2, 0xffffff, 0.7).lineBetween(x + 68, top + 25, x + 50, base - 16);
    g.fillStyle(0xedfaf1, 0.52).fillEllipse(x, top - 2, 184, 36);
    g.lineStyle(3, 0x729e9b).strokeEllipse(x, top - 2, 184, 36);
    g.lineStyle(3, 0xf6fff5).strokeEllipse(x, top - 7, 177, 24);
    for (let i = 0; i < 10; i++) {
      const dx = x - 62 + i % 4 * 36, dy = 2 + Math.floor(i / 4) * 48 + (i % 3) * 7;
      g.fillStyle(0xf3fffa, 0.65).fillEllipse(dx, dy, 5, 9);
      g.fillStyle(0x669b99, 0.3).fillEllipse(dx + 1, dy + 3, 3, 4);
    }
    this.label(x, 69);
    if (amount >= 0.999) sparkle(g, x + 10, 12, 18, clamp01((amount - 0.95) * 20));
  }

  /** The fruit printed on the cup's cream label names the flavour at phone size. */
  private label(x: number, y: number): void {
    const g = this.art, { fruit, fruitInk, label } = this.look;
    g.fillStyle(0xffefbd).fillCircle(x, y, 24);
    if (label === 'berry') {
      g.fillStyle(fruit).fillEllipse(x - 6, y + 1, 17, 22).fillEllipse(x + 6, y + 1, 17, 22);
      g.fillStyle(fruitInk).fillEllipse(x + 3, y - 14, 14, 6);
    } else if (label === 'wheel') {
      // A cut citrus wheel: rind, pith and six segments.
      g.fillStyle(fruitInk).fillCircle(x, y, 18);
      g.fillStyle(0xfff6d8).fillCircle(x, y, 15);
      g.fillStyle(fruit).fillCircle(x, y, 13);
      g.lineStyle(2, 0xfff6d8);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        g.lineBetween(x, y, x + Math.cos(a) * 13, y + Math.sin(a) * 13);
      }
    } else {
      for (const [dx, dy] of [[-10, -6], [0, -7], [10, -6], [-5, 3], [5, 3], [0, 12]] as const) {
        g.fillStyle(fruit).fillCircle(x + dx, y + dy, 6.5);
        g.fillStyle(0xffffff, 0.45).fillCircle(x + dx - 2, y + dy - 2, 2);
      }
      g.fillStyle(fruitInk).fillEllipse(x + 6, y - 16, 14, 6);
    }
  }

  private snowflake(x: number, y: number, r: number): void {
    const g = this.art;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
      g.lineStyle(3, 0xf4ffff).lineBetween(x, y, x + c * r, y + s * r);
      for (const sign of [-1, 1]) g.lineBetween(x + c * r * 0.6, y + s * r * 0.6, x + c * r * 0.8 - s * sign * r * 0.25, y + s * r * 0.8 + c * sign * r * 0.25);
    }
  }
}
