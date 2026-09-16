import type Phaser from 'phaser';
import { HouseholdVignette } from './HouseholdVignette';
import { BUBBLE_CHAIN, contactPulse } from './householdMotion';
import { shape, slab, sparkle } from './householdArt';
import { clamp01, easeOut } from './motion';

const COLS = 6, ROWS = 5, STEP = 84;

export class BubbleWrapVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xe5eee6, 0xc9e9cf); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const remaining = COLS * ROWS - times.length;
    const chain = BUBBLE_CHAIN.filter(t => ending >= t).length;
    const chained = this.successful ? Math.min(remaining, chain) : 0;
    const active = Math.min(COLS * ROWS - 1, times.length + chained);
    const ripple = this.still ? 0 : contactPulse(now - this.strikeAt) * 3;
    g.fillStyle(0x3c6066, 0.11).fillRoundedRect(-267, -191, 551, 452, 30);
    slab(g, -285, -225, 558, 460, 0xb9cfc6, 20, 0x7a9995);
    slab(g, -273, -235, 550, 457, 0xe1f2e7, 20, 0x8eaeab);
    // Translucent welded seams, perimeter perforations, and folded film corners.
    g.lineStyle(2, 0xffffff, 0.6);
    for (let c = 0; c < COLS - 1; c++) g.lineBetween(-168 + c * STEP, -214, -168 + c * STEP, 202);
    for (let r = 0; r < ROWS - 1; r++) g.lineBetween(-254, -125 + r * STEP, 257, -125 + r * STEP);
    for (let i = 0; i < 24; i++) {
      g.fillStyle(0x90b5b0, 0.45).fillCircle(-252 + i * 22, -224, 1.6).fillCircle(-252 + i * 22, 211, 1.6);
    }
    shape(g, [242, -235, 277, -202, 241, -200], 0xf5fff2, 0x8eaeab, 2);
    for (let i = 0; i < COLS * ROWS; i++) {
      const row = Math.floor(i / COLS), col = row % 2 ? COLS - 1 - i % COLS : i % COLS;
      const x = -210 + col * STEP, y = -168 + row * STEP;
      const stamp = i < times.length ? times[i]! : i < times.length + chained ? (this.finishAt ?? now) + BUBBLE_CHAIN[i - times.length]! : Infinity;
      const age = now - stamp;
      const popped = age >= 0;
      const squash = popped ? easeOut(age / 0.09) : 0;
      const r = 33 - squash * 3;
      g.fillStyle(0x648c90, popped ? 0.07 : 0.18).fillEllipse(x + 3, y + 7, 68, 66 - squash * 23);
      g.fillStyle(popped ? 0xcde0d6 : 0xaed4d1, 0.85).fillEllipse(x, y, r * 2, r * (2 - squash * 0.3));
      g.lineStyle(2, popped ? 0x8eb5ad : 0x6d999e, 0.65).strokeEllipse(x, y, r * 2, r * (2 - squash * 0.3));
      if (popped) {
        g.fillStyle(0xf4fff1, 0.38).fillEllipse(x, y + 3, 48, 36);
        g.lineStyle(1.5, 0x7fa7a1, 0.6);
        for (let k = 0; k < 5; k++) {
          const a = k * 1.26 + i;
          g.lineBetween(x + Math.cos(a) * 10, y + Math.sin(a) * 8, x + Math.cos(a + 0.25) * 25, y + Math.sin(a + 0.25) * 23);
        }
        g.fillStyle(0x759c99, 0.38).fillEllipse(x, y, 12, 8);
        if (!this.still && age < 0.25) {
          const p = clamp01(age / 0.25);
          g.lineStyle(3, 0xffffff, 1 - p).strokeCircle(x, y, 24 + p * 24);
          for (let k = 0; k < 5; k++) {
            const a = k * Math.PI * 0.4;
            g.fillStyle(0xffffff, 1 - p).fillCircle(x + Math.cos(a) * (32 + p * 25), y + Math.sin(a) * (32 + p * 25), 3 * (1 - p));
          }
        }
      } else {
        // Nested highlights give each air pocket a rounded, slippery dome.
        g.fillStyle(0xe5faf1, 0.78).fillEllipse(x - 6, y - 7, 49, 47);
        g.fillStyle(0xffffff, 0.9).fillEllipse(x - 12, y - 17, 19, 10);
        g.fillStyle(0xffffff, 0.6).fillCircle(x + 15, y + 13, 4);
        g.lineStyle(2, 0xfaffed, 0.8).beginPath().arc(x, y, 28, 0.25, 1.4).strokePath();
        if (i === active && ending < 0) {
          g.lineStyle(3, 0xc49758, 0.75).strokeCircle(x, y, 37 + ripple);
          g.fillStyle(0xc49758).fillCircle(x, y + 40, 3);
        }
      }
    }
    if (ending >= 0 && this.successful && !this.still) {
      const a = Math.sin(clamp01((ending - 0.7) / 0.8) * Math.PI);
      sparkle(g, -302, -144, 16 * a, a);
      sparkle(g, 311, 117, 22 * a, a);
    }
    if (now - this.errorAt < 0.22) {
      const a = contactPulse(now - this.errorAt, 0.22);
      g.lineStyle(4, 0xc78663, a).strokeRoundedRect(-278, -240, 560, 467, 22);
    }
  }
}
