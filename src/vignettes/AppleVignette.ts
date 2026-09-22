import type Phaser from 'phaser';
import { cubicContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab } from './householdArt';
import { shade } from '@/ui/colour';
import { clamp01 } from './motion';
import { consumed, contactPulse, reveal, WORM_AT } from './treatMotion';
import { celebration } from './treatArt';
import { appleLook, type DonutLook, type FruitLook, type PlateLook } from './appleLooks';

/** The donut lies flat: a tilted top face over a side band, with the hole through both. */
const DONUT = { cy: 92, rx: 150, ry: 58, side: 26, holeY: 88, holeRx: 44, holeRy: 18, reach: 162 } as const;
type Band = (y: number) => number;

/**
 * Where the bites have reached across the donut: everything right of it is left. It
 * crosses the whole ring as `amount` goes from 0 to 1, curving further in at the middle
 * like a mouthful, with a scallop per tooth.
 */
function donutFront(amount: number, dx: number, top: number, bottom: number): Band {
  return y => {
    const p = (y - top) / (bottom - top), bitten = Math.min(1, amount * 4);
    return dx - DONUT.reach + amount * 2 * DONUT.reach
      + bitten * (30 * Math.sin(p * Math.PI) + Math.sin(p * Math.PI * 6) ** 2 * 10);
  };
}

/**
 * Scalloped bites expose the flesh until only the stem and core — or a peach's stone —
 * remain. The lap picks what is on the plate (`appleLooks.ts`).
 */
export class AppleVignette extends HouseholdVignette {
  private readonly look: PlateLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xf0e7cc, 0xf2d58d);
    this.look = appleLook(lap);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const amount = consumed(times.length, this.plan?.targets.length ?? 4, ending, this.successful);
    const bite = ending >= 0 ? (this.successful ? contactPulse(ending, 0.3) : 0) : contactPulse(now - this.strikeAt, 0.18);
    const wobble = this.still ? 0 : bite * 6;
    const worm = ending >= 0 && !this.successful ? reveal(ending, WORM_AT, this.still) : 0;
    const look = this.look, donut = look.kind === 'donut';
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
    if (donut) g.fillStyle(0x687b55, 0.2).fillEllipse(wobble, 170, 330 * (1 - amount * 0.85), 30);
    else g.fillStyle(0x687b55, 0.2).fillEllipse(wobble, 125, 195 - amount * 90, 29);
    if (look.kind === 'donut') this.donut(look, amount, wobble);
    else this.fruit(look, amount, wobble);
    if (bite > 0 && !this.still) {
      const p = 1 - bite, reached = -DONUT.reach + amount * 2 * DONUT.reach;
      for (let i = 0; i < 5; i++) {
        const side = times.length % 2 ? -1 : 1;
        // The fruit is bitten from alternate sides; the donut at its front, crumbs going both ways.
        const x = donut ? Math.max(-140, Math.min(140, reached)) + side * p * (20 + i * 12) : side * (105 + p * (32 + i * 12));
        const y = (donut ? 84 : -30) + Math.sin(i * 3) * 35 + p * p * 66;
        g.fillStyle(look.crumbs[i % 2 ? 0 : 1], bite).fillEllipse(x, y, 6 + i % 3, 4 + i % 2);
      }
    }
    if (worm > 0) {
      if (look.kind === 'donut') this.wasp(worm, now);
      else this.worm(look, worm, now);
    }
    if (ending >= 0 && this.successful) celebration(g, ending, this.still);
  }

  private fruit(look: FruitLook, amount: number, dx: number): void {
    const g = this.art;
    // Each side is eaten in turn. The silhouette itself changes, so there is no
    // background-coloured eraser to leave holes in the plate or the cast shadow.
    const left = clamp01(amount * 2), right = clamp01(amount * 2 - 1);
    const edge = (y: number, side: number, eaten: number): number => {
      const p = (y + 105) / 230;
      const original = look.width(p);
      const hollow = Math.sin(p * Math.PI) ** 0.65;
      const teeth = Math.sin(p * Math.PI * 5) ** 2 * 12 * hollow;
      return dx + side * (original - eaten * (original - 28) * hollow - teeth * Math.min(1, eaten * 3));
    };
    const [ax, ay, bx, by] = look.top, [cx, cy, ex, ey] = look.bottom;
    const topRight = cubicContour(dx, look.dimple, [[dx + ax, ay, dx + bx, by, edge(-105, 1, right), -105]]);
    const topLeft = cubicContour(edge(-105, -1, left), -105, [[dx - bx, by, dx - ax, ay, dx, look.dimple]]);
    const bottom = cubicContour(edge(125, 1, right), 125, [
      [dx + cx, cy, dx + ex, ey, dx, look.base],
      [dx - ex, ey, dx - cx, cy, edge(125, -1, left), 125],
    ]);
    const outline: number[] = [...topRight];
    // The two top lobes meet at a shallow stem dimple.
    for (let i = 1; i <= 46; i++) { const y = -105 + i * 5; outline.push(edge(y, 1, right), y); }
    outline.push(...bottom);
    for (let i = 46; i >= 0; i--) { const y = -105 + i * 5; outline.push(edge(y, -1, left), y); }
    outline.push(...topLeft);
    shape(g, outline, look.flesh, look.fleshInk, 3.5);
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
    if (amount < 0.96) shape(g, skin, look.skin, look.skinInk, 1);
    else {
      // Peel at either end anchors the familiar hourglass core silhouette.
      shape(g, [...topLeft, ...topRight, dx + 48, -89, dx - 48, -89], look.skin, look.peelInk, 2);
      shape(g, [...bottom, dx - 39, 115, dx, 122, dx + 39, 115], look.skin, look.peelInk, 2);
    }
    if (look.blush !== undefined && amount < 0.5) {
      // The blush sits on the right cheek, which is only bitten once the left is gone.
      const alpha = 1 - clamp01((amount - 0.3) / 0.2);
      // Stacked faint ellipses stand in for a soft radial fade.
      for (let i = 0; i < 5; i++) g.fillStyle(look.blush, alpha * 0.1).fillEllipse(dx + 48 + i * 4, 14 + i * 4, 120 - i * 18, 170 - i * 26);
    }
    if (look.cleft && amount < 0.5) {
      const alpha = 1 - clamp01((amount - 0.3) / 0.2);
      g.lineStyle(3, look.peelInk, alpha * 0.75).beginPath().moveTo(dx + 4, -104);
      for (let i = 1; i <= 12; i++) { const t = i / 12; g.lineTo(dx + 4 + Math.sin(t * Math.PI * 0.8) * 34, -104 + t * 170); }
      g.strokePath();
    }
    if (amount < 0.45) {
      const alpha = 1 - amount / 0.45;
      const [sx, sy] = look.shineAt;
      g.fillStyle(look.shine[0], alpha * 0.65).fillEllipse(dx + sx + left * 56, sy, 31 * (1 - left * 0.65), 68);
      g.fillStyle(look.shine[1], alpha * 0.8).fillEllipse(dx + sx - 8 + left * 56, sy - 14, 13, 28);
    }
    if (amount < 0.92) {
      for (let i = 0; i < 25; i++) {
        const y = -82 + (i * 37) % 173, x = dx + Math.sin(i * 4) * 91;
        if (x > edge(y, -1, left) + 18 + left * 30 && x < edge(y, 1, right) - 18 - right * 30) {
          g.fillStyle(look.dots, look.dotAlpha).fillEllipse(x, y, 2.5, 4);
        }
      }
    }
    if (amount > 0.6 && look.core === 'pips') {
      g.fillStyle(look.coreColour, clamp01((amount - 0.6) / 0.25)).fillEllipse(dx, 16, 33, 107);
      for (const [x, y] of [[-7, -6], [8, 14], [-5, 36]]) {
        g.fillStyle(0x7a4933, clamp01((amount - 0.6) / 0.3)).fillEllipse(dx + x!, y!, 9, 15);
        g.fillStyle(0xb58550, clamp01((amount - 0.6) / 0.3)).fillEllipse(dx + x! - 1, y! - 3, 3, 6);
      }
    } else if (amount > 0.6) {
      // A peach's stone: red fibres cling to a ridged, pointed pit.
      const alpha = clamp01((amount - 0.6) / 0.25);
      g.fillStyle(0xd9674a, alpha * 0.8).fillEllipse(dx, 14, 60, 110);
      g.fillStyle(look.coreColour, alpha).fillEllipse(dx, 14, 44, 88);
      g.lineStyle(2.5, 0x6b3526, alpha).strokeEllipse(dx, 14, 44, 88);
      g.lineStyle(2, 0x6b3526, alpha * 0.8);
      for (const [x, y, w] of [[-8, -16, 12], [6, -2, 14], [-6, 16, 13], [7, 32, 11], [-3, 46, 8]] as const) {
        g.lineBetween(dx + x - w / 2, y, dx + x + w / 2, y + 4);
      }
      g.fillStyle(0xc9876a, alpha * 0.7).fillEllipse(dx - 8, -6, 7, 20);
    }
    const [[s0x, s0y], [s1x, s1y], [s2x, s2y]] = look.stem;
    g.lineStyle(look.stemWidth, 0x765134).beginPath().moveTo(dx + s0x, s0y).lineTo(dx + s1x, s1y).lineTo(dx + s2x, s2y).strokePath();
    g.lineStyle(4, 0xb39050).lineBetween(dx + s0x - 1, s0y - 8, dx + s1x + 3, s1y - 5);
    this.leaf(dx + s1x + 4, s1y - 2, 1);
    if (look.leaves === 2) this.leaf(dx + s1x - 4, s1y + 2, -1);
  }

  /** A veined leaf growing from the stem at (x, y); `side` -1 mirrors it to the left. */
  private leaf(x: number, y: number, side: number): void {
    const g = this.art, at = (u: number) => x + (u - 9) * side, v = (w: number) => y + w + 141;
    shape(g, cubicContour(at(9), v(-141), [[at(28), v(-187), at(81), v(-182), at(95), v(-170)], [at(67), v(-132), at(32), v(-131), at(9), v(-141)]]), 0x65955b, 0x3d6546, 2.5);
    g.lineStyle(2, 0xb5c974).lineBetween(at(14), v(-144), at(80), v(-166));
    for (let i = 0; i < 4; i++) g.lineBetween(at(26 + i * 12), v(-148 - i * 4), at(31 + i * 12), v(-163 - i * 2));
  }

  /**
   * A ring donut on its plate, eaten from one side across. It is drawn as two halves
   * either side of the centre line, scanned row by row and cut at the bite front, so a
   * bite that reaches the hole opens the ring and the plate shows through the gap: still
   * no background-coloured eraser.
   */
  private donut(look: DonutLook, amount: number, dx: number): void {
    const g = this.art, D = DONUT;
    const top = D.cy - D.ry, bottom = D.cy + D.ry + D.side;
    const ellipse = (cy: number, rx: number, ry: number): Band => y => {
      const t = (y - cy) / ry;
      return Math.abs(t) >= 1 ? 0 : rx * Math.sqrt(1 - t * t);
    };
    const face = ellipse(D.cy, D.rx, D.ry);
    const body: Band = y => y <= D.cy ? face(y) : y <= D.cy + D.side ? D.rx : face(y - D.side);
    const hole = ellipse(D.holeY, D.holeRx, D.holeRy);
    // The far inner wall shows through the upper part of the hole.
    const floor = ellipse(D.holeY + 15, D.holeRx, D.holeRy);
    const front = donutFront(amount, dx, top, bottom);
    const icing = { cy: D.cy - 1, rx: D.rx * 0.88, ry: D.ry * 0.86 };
    const icingEdge = ellipse(icing.cy, icing.rx, icing.ry);
    const icingHole = ellipse(D.holeY, D.holeRx + 12, D.holeRy + 7);
    if (amount < 0.999) {
      const side = shade(look.dough, -0.14);
      this.ring(dx, top, bottom, body, hole, front, side, look.doughInk, 0);
      // The top face over the band leaves the side in shade.
      this.ring(dx, top, D.cy + D.ry, face, hole, front, look.dough, look.doughInk, 1.5);
      this.ring(dx, D.holeY - D.holeRy, D.holeY + D.holeRy, hole, floor, front, shade(look.dough, -0.3), look.doughInk, 0);
      this.ring(dx, top, bottom, body, hole, front, side, look.doughInk, 3.5, false);
      this.ring(dx, icing.cy - icing.ry, icing.cy + icing.ry, icingEdge, icingHole, front, look.icing, look.icingInk, 2);
      // Drips over the front edge, and sprinkles; each only where the donut is still there.
      const within = (x: number, y: number, margin: number) => x >= front(y) + margin;
      for (const [x, len] of [[-96, 16], [-52, 24], [-6, 14], [38, 22], [84, 18], [118, 12]] as const) {
        const y = icing.cy + icing.ry * Math.sqrt(1 - (x / icing.rx) ** 2) - 2;
        if (within(dx + x - 7, y + len / 2, 4)) {
          g.fillStyle(look.icing).fillRoundedRect(dx + x - 7, y - 6, 14, len + 6, 7);
          g.lineStyle(2, look.icingInk, 0.7).strokeRoundedRect(dx + x - 7, y - 6, 14, len + 6, 7);
          g.fillStyle(look.icing).fillRect(dx + x - 5.5, y - 7, 11, 6);
        }
      }
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996, r = 0.55 + (i * 37 % 13) / 13 * 0.3;
        const x = dx + Math.cos(a) * D.rx * 0.86 * r, y = D.cy + Math.sin(a) * D.ry * 0.86 * r - 2;
        if (Math.abs(x - dx) < icingHole(y) + 6 || !within(x, y, 10)) continue;
        const turn = i * 1.7, c = Math.cos(turn) * 6, sn = Math.sin(turn) * 3;
        g.lineStyle(4.5, look.sprinkles[i % look.sprinkles.length]!).lineBetween(x - c, y - sn, x + c, y + sn);
      }
      if (amount < 0.15) {
        // A gloss along the icing's far-left rim, gone with the first bite.
        const alpha = 1 - amount / 0.15;
        g.lineStyle(6, 0xffffff, alpha * 0.45).beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = Math.PI * (1.1 + i * 0.03);
          g[i ? 'lineTo' : 'moveTo'](dx + Math.cos(a) * icing.rx * 0.78, icing.cy + Math.sin(a) * icing.ry * 0.72);
        }
        g.strokePath();
      }
    }
    if (amount > 0.9) {
      // What a clean round leaves: a few crumbs and a stray sprinkle on the plate.
      const alpha = clamp01((amount - 0.9) / 0.08);
      for (let i = 0; i < 9; i++) {
        const x = dx - 80 + i * 21 + Math.sin(i * 5) * 8, y = 150 + Math.sin(i * 3.1) * 10;
        g.fillStyle(look.crumbs[i % 3 ? 0 : 1], alpha).fillEllipse(x, y, 7 + i % 3 * 2, 5 + i % 2);
      }
      g.lineStyle(4.5, look.sprinkles[1]!, alpha).lineBetween(dx + 30, 158, dx + 40, 154);
      g.lineStyle(4.5, look.sprinkles[2]!, alpha).lineBetween(dx - 44, 144, dx - 36, 149);
    }
  }

  /**
   * Fills what is left of a ring (outer half-width `outer`, hole half-width `inner`) right
   * of the bite `front`, as a left and a right half, and outlines only its true edges: the
   * seam down the middle is never stroked.
   */
  private ring(dx: number, y0: number, y1: number, outer: Band, inner: Band, front: Band,
    colour: number, ink: number, weight: number, fill = true): void {
    const g = this.art, rows = 48;
    const yAt = (i: number) => y0 + (y1 - y0) * i / rows;
    for (const side of [-1, 1]) {
      const lo: number[] = [], hi: number[] = [], edgeLo: boolean[] = [], edgeHi: boolean[] = [], full: boolean[] = [];
      for (let i = 0; i <= rows; i++) {
        const y = yAt(i), o = outer(y), n = Math.min(inner(y), o), f = front(y) - dx;
        // Offsets from the centre line; x only survives right of the front.
        const [a, b] = side > 0 ? [n, o] : [-o, -n];
        const start = Math.max(a, f), end = Math.max(start, b);
        lo.push(start); hi.push(end); full.push(end - start > 0.5);
        // The half's inner end is the seam when there is no hole on this row and no bite reaches it.
        edgeLo.push(side < 0 || f > a || n > 0);
        edgeHi.push(side > 0 || n > 0);
      }
      const polygon: number[] = [];
      for (let i = 0; i <= rows; i++) polygon.push(dx + lo[i]!, yAt(i));
      for (let i = rows; i >= 0; i--) polygon.push(dx + hi[i]!, yAt(i));
      if (fill) shape(g, polygon, colour, ink, 0);
      if (weight <= 0) continue;
      g.lineStyle(weight, ink);
      for (let i = 0; i <= rows; i++) {
        if (!full[i]) continue;
        if (i < rows && full[i + 1]) {
          if (edgeLo[i] && edgeLo[i + 1]) g.lineBetween(dx + lo[i]!, yAt(i), dx + lo[i + 1]!, yAt(i + 1));
          if (edgeHi[i] && edgeHi[i + 1]) g.lineBetween(dx + hi[i]!, yAt(i), dx + hi[i + 1]!, yAt(i + 1));
        }
        // Where a row ends the piece, close it across.
        if (i === 0 || i === rows || !full[i - 1] || !full[i + 1]) g.lineBetween(dx + lo[i]!, yAt(i), dx + hi[i]!, yAt(i));
      }
    }
  }

  /** A rough donut round brings a wasp down to hover over what is left of the icing. */
  private wasp(arrive: number, now: number): void {
    const g = this.art, still = this.still;
    const bob = still ? 0 : Math.sin(now * 5) * 7;
    const x = 112 + (1 - arrive) * 170, y = -18 - (1 - arrive) * 160 + bob;
    const ink = 0x3b302c;
    const flap = still ? 1 : 0.45 + 0.55 * Math.abs(Math.sin(now * 55));
    g.fillStyle(0xf4fbff, 0.75).fillEllipse(x + 2, y - 22 - 8 * flap, 26, 34 * flap);
    g.fillStyle(0xf4fbff, 0.6).fillEllipse(x + 16, y - 20 - 6 * flap, 20, 28 * flap);
    g.lineStyle(2, 0x9fb8c6, 0.8).strokeEllipse(x + 2, y - 22 - 8 * flap, 26, 34 * flap);
    g.fillStyle(ink).fillTriangle(x + 26, y - 4, x + 26, y + 6, x + 38, y + 2);
    g.fillStyle(0xf3c33c).fillEllipse(x + 6, y, 48, 30);
    g.lineStyle(6, ink);
    for (const sx of [2, 14]) {
      const h = Math.sqrt(1 - ((sx - 6) / 24) ** 2) * 13;
      g.lineBetween(x + sx, y - h, x + sx, y + h);
    }
    g.lineStyle(2.5, ink).strokeEllipse(x + 6, y, 48, 30);
    g.fillStyle(0xf3c33c).fillCircle(x - 22, y - 2, 13);
    g.lineStyle(2.5, ink).strokeCircle(x - 22, y - 2, 13);
    g.fillStyle(ink).fillCircle(x - 27, y - 4, 3.2).fillCircle(x - 18, y - 5, 3.2);
    g.fillStyle(0xffffff).fillCircle(x - 26, y - 5, 1.2).fillCircle(x - 17, y - 6, 1.2);
    g.lineStyle(2, ink).beginPath().arc(x - 22, y + 2, 5, 0.3, Math.PI - 0.3).strokePath();
    g.lineStyle(2, ink).lineBetween(x - 26, y - 14, x - 32, y - 26).lineBetween(x - 19, y - 15, x - 17, y - 28);
    g.fillStyle(ink).fillCircle(x - 32, y - 26, 2.5).fillCircle(x - 17, y - 28, 2.5);
  }

  private worm(look: FruitLook, rise: number, now: number): void {
    const g = this.art, [x, y] = look.worm;
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
