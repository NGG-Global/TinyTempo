import type Phaser from 'phaser';
import { cubicContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab } from './householdArt';
import { clamp01 } from './motion';
import { consumed, contactPulse, reveal, WORM_AT } from './treatMotion';
import { celebration } from './treatArt';

/** Scalloped bites expose cream flesh until only the stem, seeds and core remain. */
export class AppleVignette extends HouseholdVignette {
  public constructor(scene: Phaser.Scene) { super(scene, 0xf0e7cc, 0xf2d58d); }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const amount = consumed(times.length, this.plan?.targets.length ?? 4, ending, this.successful);
    const bite = ending >= 0 ? (this.successful ? contactPulse(ending, 0.3) : 0) : contactPulse(now - this.strikeAt, 0.18);
    const wobble = this.still ? 0 : bite * 6;
    const worm = ending >= 0 && !this.successful ? reveal(ending, WORM_AT, this.still) : 0;
    slab(g, -340, -228, 680, 460, 0xd8deb5, 34, 0x9ea87c);
    // A gingham picnic cloth and a softly shaded ceramic plate.
    g.fillStyle(0xf7eed7).fillRoundedRect(-316, 48, 632, 165, 20);
    for (let i = 0; i < 13; i++) g.fillStyle(0xda9f83, 0.27).fillRect(-306 + i * 49, 53, 21, 155);
    for (let i = 0; i < 4; i++) g.fillStyle(0xda9f83, 0.26).fillRect(-310, 66 + i * 39, 620, 17);
    g.fillStyle(0x737f60, 0.18).fillEllipse(6, 154, 442, 84);
    g.fillStyle(0xc8d8cb).fillEllipse(0, 138, 445, 115);
    g.fillStyle(0xf8fae7).fillEllipse(0, 130, 445, 113);
    g.lineStyle(3, 0x9ab9ac).strokeEllipse(0, 130, 409, 92);
    g.fillStyle(0xe8ecda).fillEllipse(0, 129, 353, 72);
    g.fillStyle(0x687b55, 0.2).fillEllipse(wobble, 125, 195 - amount * 90, 29);
    this.fruit(amount, wobble);
    if (bite > 0 && !this.still) {
      const p = 1 - bite;
      for (let i = 0; i < 5; i++) {
        const side = times.length % 2 ? -1 : 1;
        const x = side * (105 + p * (32 + i * 12)), y = -30 + Math.sin(i * 3) * 35 + p * p * 66;
        g.fillStyle(i % 2 ? 0xfff0b8 : 0xe86b4a, bite).fillEllipse(x, y, 6 + i % 3, 4 + i % 2);
      }
    }
    if (worm > 0) this.worm(worm, now);
    if (ending >= 0 && this.successful) celebration(g, ending, this.still);
  }

  private fruit(amount: number, dx: number): void {
    const g = this.art;
    // Each side is eaten in turn. The silhouette itself changes, so there is no
    // background-coloured eraser to leave holes in the plate or the cast shadow.
    const left = clamp01(amount * 2), right = clamp01(amount * 2 - 1);
    const edge = (y: number, side: number, eaten: number): number => {
      const p = (y + 105) / 230;
      const original = 86 + 44 * Math.sin(p * Math.PI) - 12 * p;
      const hollow = Math.sin(p * Math.PI) ** 0.65;
      const teeth = Math.sin(p * Math.PI * 5) ** 2 * 12 * hollow;
      return dx + side * (original - eaten * (original - 28) * hollow - teeth * Math.min(1, eaten * 3));
    };
    const topRight = cubicContour(dx, -109, [[dx + 31, -139, dx + 67, -137, edge(-105, 1, right), -105]]);
    const topLeft = cubicContour(edge(-105, -1, left), -105, [[dx - 67, -137, dx - 31, -139, dx, -109]]);
    const bottom = cubicContour(edge(125, 1, right), 125, [
      [dx + 41, 149, dx + 25, 139, dx, 130],
      [dx - 25, 139, dx - 41, 149, edge(125, -1, left), 125],
    ]);
    const outline: number[] = [...topRight];
    // The two top lobes meet at a shallow stem dimple.
    for (let i = 1; i <= 46; i++) { const y = -105 + i * 5; outline.push(edge(y, 1, right), y); }
    outline.push(...bottom);
    for (let i = 46; i >= 0; i--) { const y = -105 + i * 5; outline.push(edge(y, -1, left), y); }
    outline.push(...topLeft);
    shape(g, outline, 0xffe9b5, 0x965b38, 3.5);
    // Skin retreats further than the edge of the flesh, leaving a juicy scalloped rim.
    const skin: number[] = [...topRight];
    for (let i = 1; i <= 46; i++) {
      const y = -105 + i * 5, center = Math.sin((y + 105) / 230 * Math.PI);
      const middle = (edge(y, 1, right) + edge(y, -1, left)) / 2;
      skin.push(Math.max(middle, edge(y, 1, right) - right * center * 35), y);
    }
    skin.push(...bottom);
    for (let i = 46; i >= 0; i--) {
      const y = -105 + i * 5, center = Math.sin((y + 105) / 230 * Math.PI);
      const middle = (edge(y, 1, right) + edge(y, -1, left)) / 2;
      skin.push(Math.min(middle, edge(y, -1, left) + left * center * 35), y);
    }
    skin.push(...topLeft);
    if (amount < 0.96) shape(g, skin, 0xd94b3f, 0xc64536, 1);
    else {
      // Red peel at either end anchors the familiar hourglass core silhouette.
      shape(g, [...topLeft, ...topRight, dx + 48, -89, dx - 48, -89], 0xd94b3f, 0xa34934, 2);
      shape(g, [...bottom, dx - 39, 115, dx, 122, dx + 39, 115], 0xd94b3f, 0xa34934, 2);
    }
    if (amount < 0.45) {
      const alpha = 1 - amount / 0.45;
      g.fillStyle(0xffbb87, alpha * 0.65).fillEllipse(dx - 54 + left * 56, -64, 31 * (1 - left * 0.65), 68);
      g.fillStyle(0xffe1ab, alpha * 0.8).fillEllipse(dx - 62 + left * 56, -78, 13, 28);
    }
    if (amount < 0.92) {
      for (let i = 0; i < 25; i++) {
        const y = -82 + (i * 37) % 173, x = dx + Math.sin(i * 4) * 91;
        if (x > edge(y, -1, left) + 18 + left * 30 && x < edge(y, 1, right) - 18 - right * 30) {
          g.fillStyle(0xffca7e, 0.45).fillEllipse(x, y, 2.5, 4);
        }
      }
    }
    if (amount > 0.6) {
      g.fillStyle(0xf2d390, clamp01((amount - 0.6) / 0.25)).fillEllipse(dx, 16, 33, 107);
      for (const [x, y] of [[-7, -6], [8, 14], [-5, 36]]) {
        g.fillStyle(0x7a4933, clamp01((amount - 0.6) / 0.3)).fillEllipse(dx + x!, y!, 9, 15);
        g.fillStyle(0xb58550, clamp01((amount - 0.6) / 0.3)).fillEllipse(dx + x! - 1, y! - 3, 3, 6);
      }
    }
    g.lineStyle(13, 0x765134).beginPath().moveTo(dx, -108).lineTo(dx + 5, -139).lineTo(dx + 21, -164).strokePath();
    g.lineStyle(4, 0xb39050).lineBetween(dx - 1, -116, dx + 8, -144);
    shape(g, cubicContour(dx + 9, -141, [[dx + 28, -187, dx + 81, -182, dx + 95, -170], [dx + 67, -132, dx + 32, -131, dx + 9, -141]]), 0x65955b, 0x3d6546, 2.5);
    g.lineStyle(2, 0xb5c974).lineBetween(dx + 14, -144, dx + 80, -166);
    for (let i = 0; i < 4; i++) g.lineBetween(dx + 26 + i * 12, -148 - i * 4, dx + 31 + i * 12, -163 - i * 2);
  }

  private worm(rise: number, now: number): void {
    const g = this.art, x = 41, y = -57;
    g.fillStyle(0x884231).fillEllipse(x, y, 33, 22);
    g.fillStyle(0x4c362d).fillEllipse(x + 1, y - 2, 25, 14);
    const sway = this.still ? 0 : Math.sin(now * 3.5) * 8 * rise;
    const points: [number, number][] = [];
    for (let i = 0; i <= 15; i++) {
      const t = i / 15;
      points.push([x + Math.sin(t * Math.PI * 0.9) * 43 * rise + sway * t, y - t * 114 * rise]);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!;
      g.lineStyle(23 - i * 0.1, 0x526e48).lineBetween(...a, ...b);
      g.lineStyle(18 - i * 0.1, i % 2 ? 0xaac578 : 0xbad58b).lineBetween(...a, ...b);
      if (i % 2 === 0) g.lineStyle(1.5, 0x718e52).lineBetween(a[0] - 6, a[1], a[0] + 6, a[1] + 2);
    }
    const [hx, hy] = points.at(-1)!;
    g.fillStyle(0xc6de97).fillEllipse(hx, hy, 32, 31);
    g.lineStyle(2, 0x526e48).strokeEllipse(hx, hy, 32, 31);
    g.fillStyle(0xfffbed).fillCircle(hx - 7, hy - 6, 7).fillCircle(hx + 7, hy - 6, 7);
    g.fillStyle(0x354d36).fillCircle(hx - 6, hy - 5, 3).fillCircle(hx + 8, hy - 5, 3);
    g.fillStyle(0xebad86, 0.7).fillEllipse(hx - 10, hy + 5, 7, 4).fillEllipse(hx + 11, hy + 5, 7, 4);
    g.lineStyle(2, 0x536e47).beginPath().arc(hx + 1, hy + 3, 6, 0.2, Math.PI - 0.2).strokePath();
    // The near lip of the hole occludes the root, so the worm emerges from the fruit.
    g.lineStyle(5, 0xe68a55).beginPath().arc(x, y - 2, 15, 0.15, Math.PI - 0.15).strokePath();
  }
}
