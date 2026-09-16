import type Phaser from 'phaser';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { balloonFinale, balloonSize, pumpStroke } from './errandMotion';
import { clamp01 } from './motion';

const BALLOONS = [0xe25c5c, 0x4fa3c9, 0xf1c04f] as const;
const NOZZLE = { x: 60, y: 128 } as const;
const PUMP = { x: -170, top: 20, bottom: 190 } as const;
/** The full balloon's radius, and how many strokes' worth of air it holds. */
const FULL_RADIUS = 118;

/** One stroke per beat inflates the balloon a step; a clean round ties it off, a rough one bursts it. */
export class BalloonPumpVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xe7eef0, 0xf5e2b8); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const colour = BALLOONS[((this.plan?.id ?? 1) - 1) % BALLOONS.length]!;
    const age = now - this.strikeAt;
    const stroke = pumpStroke(age, beat);
    const strokes = this.watching ? this.demoTimes.length : this.hitTimes.length;
    const targets = this.plan?.targets.length ?? 4;
    const finale = balloonFinale(ending, this.successful, this.still);
    const size = ending >= 0 && this.successful ? 1 : balloonSize(strokes, targets);
    // A party room floor with bunting overhead; the pump's plate sits on the boards.
    slab(g, -346, -246, 692, 490, 0xdfe7ea, 22, 0x9fb0b6);
    g.fillStyle(0xcdb28f).fillRect(-346, 200, 692, 44);
    g.lineStyle(2, 0xb59a78, 0.6);
    for (let i = -5; i <= 5; i++) g.lineBetween(i * 66, 200, i * 66 + 14, 244);
    g.lineStyle(3, 0x8e9ba0).lineBetween(-346, -200, 0, -170).lineBetween(0, -170, 346, -200);
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12, x = -346 + t * 692;
      const y = -200 + Math.sin(t * Math.PI) * 30;
      g.fillStyle([0xe25c5c, 0xf1c04f, 0x4fa3c9, 0x7cb56b][i % 4]!).fillTriangle(x - 12, y, x + 12, y, x, y + 26);
    }
    // The floor pump: plate, barrel, gauge, and the handle that drops on the beat.
    g.fillStyle(HOME_INK, 0.15).fillEllipse(PUMP.x + 10, 204, 150, 18);
    slab(g, PUMP.x - 62, 188, 124, 14, 0x3d4a52, 5, 0x24303a);
    const rod = PUMP.top - 70 + stroke * 92;
    g.lineStyle(10, 0x9aa5ab).lineBetween(PUMP.x, PUMP.top, PUMP.x, rod);
    slab(g, PUMP.x - 62, rod - 12, 124, 24, 0xd9853c, 12, 0x8d5220);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(PUMP.x - 54, rod - 8, 108, 6, 3);
    slab(g, PUMP.x - 24, PUMP.top, 48, PUMP.bottom - PUMP.top, 0x3c8f8c, 10, 0x235553);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(PUMP.x - 18, PUMP.top + 8, 10, PUMP.bottom - PUMP.top - 16, 5);
    g.fillStyle(0xf3efe4).fillCircle(PUMP.x, PUMP.top + 50, 17);
    g.lineStyle(3, 0x235553).strokeCircle(PUMP.x, PUMP.top + 50, 17);
    g.lineStyle(2.5, 0xc0392b).lineBetween(PUMP.x, PUMP.top + 50, PUMP.x + 8 * Math.cos(-2.2 + size * 3.6), PUMP.top + 50 + 8 * Math.sin(-2.2 + size * 3.6));
    // Hose along the boards to the nozzle, which the balloon is pulled over.
    g.lineStyle(9, 0x2f3a40).beginPath().moveTo(PUMP.x + 20, PUMP.bottom - 12).lineTo(-40, 196).lineTo(NOZZLE.x - 40, 196).lineTo(NOZZLE.x, 172).lineTo(NOZZLE.x, NOZZLE.y + 6).strokePath();
    slab(g, NOZZLE.x - 8, NOZZLE.y - 4, 16, 26, 0xbfc7cc, 4, 0x6c777d);
    const wobble = !this.still && now - this.errorAt < 0.3 ? Math.sin((now - this.errorAt) * 60) * (1 - (now - this.errorAt) / 0.3) * 0.08 : 0;
    const puff = !this.still && age >= 0 && age < 0.18 && ending < 0 ? Math.sin(age / 0.18 * Math.PI) * 0.05 : 0;
    if (finale.pop < 1) {
      const r = (24 + (FULL_RADIUS - 24) * size) * (1 + puff);
      const cx = NOZZLE.x + finale.sway * 90, cy = NOZZLE.y - 8 - r * 1.12 - finale.rise * 300;
      const rx = r * (1 + wobble), ry = r * 1.12 * (1 - wobble);
      g.fillStyle(HOME_INK, 0.1 * (1 - finale.rise)).fillEllipse(NOZZLE.x + 10, 214, r * 1.4, 14);
      if (finale.tied > 0) {
        // Tied off: a knot, and a string down to the floor while it still reaches.
        g.lineStyle(2.5, 0x7d7a72).beginPath().moveTo(cx, cy + ry + 10);
        const stringY = Math.min(212, cy + ry + 10 + 90);
        g.lineTo(cx - 10 * finale.sway * 5, (cy + ry + 10 + stringY) / 2).lineTo(cx - 6, stringY).strokePath();
      }
      g.fillStyle(shade(colour, -0.2)).fillTriangle(cx - 9, cy + ry + 8, cx + 9, cy + ry + 8, cx, cy + ry - 6);
      shape(g, this.oval(cx, cy, rx, ry), colour, shade(colour, -0.5), 3);
      g.fillStyle(shade(colour, -0.18), 0.55).fillEllipse(cx + rx * 0.3, cy + ry * 0.35, rx * 0.9, ry * 0.7);
      g.fillStyle(0xffffff, 0.55).fillEllipse(cx - rx * 0.38, cy - ry * 0.42, rx * 0.34, ry * 0.42);
      g.fillStyle(0xffffff, 0.35).fillCircle(cx - rx * 0.2, cy - ry * 0.68, rx * 0.09);
    } else {
      // Burst: a limp neck on the nozzle and scraps flung outward, tumbling as they slow.
      g.fillStyle(shade(colour, -0.2)).fillTriangle(NOZZLE.x - 9, NOZZLE.y - 2, NOZZLE.x + 9, NOZZLE.y - 2, NOZZLE.x + 4, NOZZLE.y - 28);
      const cx = NOZZLE.x, cy = NOZZLE.y - 8 - FULL_RADIUS * balloonSize(strokes, targets) * 1.12;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + 0.4, d = 40 + finale.burst * (150 + (i % 3) * 40);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + finale.burst * finale.burst * 120;
        const s = 14 + (i % 3) * 5, spin = a + finale.burst * 6;
        shape(g, [x + Math.cos(spin) * s, y + Math.sin(spin) * s, x + Math.cos(spin + 2.2) * s * 0.6, y + Math.sin(spin + 2.2) * s * 0.6, x + Math.cos(spin + 4.1) * s * 0.9, y + Math.sin(spin + 4.1) * s * 0.9], colour, shade(colour, -0.45), 2);
      }
      if (finale.burst < 0.35 && !this.still) {
        const p = finale.burst / 0.35;
        g.lineStyle(4, 0xffffff, 1 - p);
        for (let i = 0; i < 8; i++) {
          const a = i * 0.785;
          g.lineBetween(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, cx + Math.cos(a) * (60 + p * 70), cy + Math.sin(a) * (60 + p * 70));
        }
      }
    }
    if (finale.rise > 0.6 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.9) / 0.7) * Math.PI);
      sparkle(g, -60, -150, 13 * a, a);
      sparkle(g, 250, -40, 17 * a, a);
    }
  }

  private oval(cx: number, cy: number, rx: number, ry: number): number[] {
    const points: number[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      // A balloon is fuller above its middle than below; pinch the lower half toward the neck.
      const pinch = Math.sin(a) > 0 ? 1 - Math.sin(a) * 0.18 : 1;
      points.push(cx + Math.cos(a) * rx * pinch, cy + Math.sin(a) * ry);
    }
    return points;
  }
}
