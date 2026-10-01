import type Phaser from 'phaser';
import { cubicContour, traceContour } from '@/ui/illustration';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { prospectorLook, type ProspectorLook } from './prospectorLooks';
import { cracksShown, pickAngle, pickBlow, revealGlow, sparkLife, splitOpen } from './prospectorMotion';

/** Where his hands hold the handle, and how long it is past them: the pick turns about here. */
const PIVOT = { x: -125, y: -20 } as const;
const HANDLE = 150;
/** The pick's leading point, which is what lands on the stone. */
const POINT = 52;

/** The boulder, as its two halves: the seam is where the coda's last blow splits it. */
const LEFT_HALF = [-5, 175, -12, 110, 8, 52, 55, -15, 124, -48, 132, -10, 118, 30, 134, 70, 120, 115, 130, 175];
const RIGHT_HALF = [124, -48, 190, -38, 240, 5, 262, 80, 255, 150, 238, 175, 130, 175, 120, 115, 134, 70, 118, 30, 132, -10];
const WHOLE = [-5, 175, -12, 110, 8, 52, 55, -15, 124, -48, 190, -38, 240, 5, 262, 80, 255, 150, 238, 175];
/** The seam the halves part along: the centre of the boulder's hollow sits on it. */
const SEAM_X = 125;
const HOLLOW = { x: 127, y: 70 } as const;

/**
 * Cracks in the order judged hits open them, nearest the pick first, so the damage walks
 * from where the blows land across the stone. Six, so a phrase of any length shows some.
 */
const CRACKS: readonly (readonly number[])[] = [
  [12, 60, 38, 72, 56, 63, 80, 82],
  [32, 18, 60, 30, 80, 16],
  [92, -28, 98, 4, 86, 26, 100, 50],
  [70, 140, 98, 118, 112, 132],
  [198, -28, 184, 10, 204, 42],
  [246, 46, 214, 72, 226, 112],
];
/** Hints of what the stone holds, on its surface. Small and few: a hint, not the ending. */
const FLECKS: readonly (readonly [number, number])[] = [[46, 96], [86, 8], [160, -12], [212, 34], [190, 118], [66, 150], [150, 150], [232, 92]];
/**
 * The crack ink is its own colour, unused anywhere else in the act, so a test can count
 * cracks without Phaser by watching which colour the drawing asks for.
 */
export const CRACK_INK = 0x2e2420;
/** Dust is drawn in this colour and only on a rough ending: the stone had nothing in it. */
export const DUST = 0xcfc4b6;

/** A prospector swings a pick at a boulder on each beat; the last blow splits it, and what is inside is the verdict. */
export class ProspectorVignette extends HouseholdVignette {
  private readonly look: ProspectorLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = prospectorLook(lap);
    super(scene, look.lantern ? 0xe6e1ea : 0xf3ead9, look.lantern ? 0xffd98a : 0xfbe6c4);
    this.look = look;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear(), look = this.look;
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const ended = ending >= 0;
    // The coda's last blow lands on the contact; before it, every strike is a beat's.
    const blowAge = ended ? ending : now - this.strikeAt;
    const blow = this.still ? 0 : pickBlow(blowAge, beat);
    const open = splitOpen(ending, this.still);
    const glow = revealGlow(ending, this.still);
    const found = ended && this.successful;
    const empty = ended && !this.successful;
    const hits = this.watching ? 0 : this.hitTimes.length;
    const cracks = cracksShown(hits, this.plan?.targets.length ?? 4, CRACKS.length);

    this.ground();
    g.fillStyle(shade(look.wallShade, -0.25), 0.25).fillEllipse(125, 178, 330, 34).fillEllipse(-188, 180, 150, 22);
    this.boulder(open, cracks, found, empty, glow);
    this.prospector(blow, found, empty, glow);

    // Sparks off the point on every blow, demonstrated or the player's; never once the stone is open.
    const spark = this.still || open > 0 ? 0 : sparkLife(blowAge);
    if (spark > 0) {
      const tip = this.tip(pickAngle(1));
      for (let k = 0; k < 7; k++) {
        const a = -2.6 + k * 0.42, reach = 14 + (1 - spark) * 34;
        g.lineStyle(3, k % 2 ? 0xffe39a : 0xfff6d8, spark)
          .lineBetween(tip.x + Math.cos(a) * 6, tip.y + Math.sin(a) * 6, tip.x + Math.cos(a) * reach, tip.y + Math.sin(a) * reach);
      }
    }
  }

  /** The face behind him and the floor, in the look's ground. */
  private ground(): void {
    const g = this.art, look = this.look;
    slab(g, -330, -224, 660, 448, look.wall, 30, look.wallShade);
    if (look.gem === 'gold') {
      // A canyon: a strip of bright sky, and sandstone laid down in bands.
      slab(g, -308, -204, 616, 64, 0xf8e6c4, 20, look.strata);
      g.lineStyle(10, look.strata, 0.8);
      for (const y of [-112, -58, -4]) {
        traceContour(g, cubicContour(-310, y, [[-150, y - 14, 120, y + 16, 310, y - 6]]));
        g.strokePath();
      }
    } else if (look.gem === 'diamond') {
      // A timbered drift: two props and a cap beam, and a lantern hung from it.
      g.lineStyle(6, look.strata, 0.7);
      for (const [x, y] of [[-260, -120], [-60, -150], [180, -100], [40, -40], [-280, 40]]) g.lineBetween(x!, y!, x! + 70, y! + 26);
      for (const x of [-312, 286]) slab(g, x, -200, 26, 372, 0x7a5638, 6, 0x4b3322);
      slab(g, -318, -206, 636, 28, 0x8a6342, 6, 0x4b3322);
      g.fillStyle(0xffd98a, 0.16).fillCircle(40, -132, 120);
      g.fillStyle(0xffd98a, 0.22).fillCircle(40, -132, 60);
      g.lineStyle(3, 0x3a2e26).lineBetween(40, -178, 40, -156);
      slab(g, 24, -156, 32, 44, 0xffe9a8, 8, 0x3a2e26);
      g.fillStyle(0x3a2e26).fillRect(20, -160, 40, 7).fillRect(20, -114, 40, 7);
    } else {
      // A green cliff: seams running down the schist and moss along its lip.
      g.lineStyle(7, look.strata, 0.8);
      for (const x of [-250, -120, 20, 200]) g.lineBetween(x, -210, x + 60, 160);
      for (let k = 0; k < 14; k++) {
        const x = -300 + k * 46;
        g.fillStyle(k % 2 ? 0x6f9a52 : 0x82ac5f).fillCircle(x, -208 + (k % 3) * 5, 22);
      }
    }
    slab(g, -330, 168, 660, 56, shade(look.wallShade, -0.08), 18, shade(look.wallShade, -0.35));
    g.fillStyle(shade(look.wallShade, -0.3), 0.6);
    for (const [x, r] of [[-292, 8], [-262, 5], [-60, 6], [-28, 9], [288, 7], [304, 4]]) g.fillCircle(x!, 182 + r! / 2, r!);
  }

  private boulder(open: number, cracks: number, found: boolean, empty: boolean, glow: number): void {
    const g = this.art, look = this.look;
    if (open > 0) {
      // The hollow is behind both halves; as they part it shows, and so does what is in it.
      g.fillStyle(look.hollow).fillEllipse(HOLLOW.x, HOLLOW.y, 40 + open * 120, 140);
      g.lineStyle(3, shade(look.hollow, 0.3)).strokeEllipse(HOLLOW.x, HOLLOW.y, 40 + open * 120, 140);
      if (found) this.gem(glow);
    }
    const left = { dx: -42 * open, dy: 5 * open }, right = { dx: 48 * open, dy: 7 * open };
    if (open === 0) {
      shape(g, WHOLE, look.rock, HOME_INK, 5);
      this.facets(0, 0, (x: number) => x < 300);
    } else {
      shape(g, shift(LEFT_HALF, left.dx, left.dy), look.rock, HOME_INK, 5);
      shape(g, shift(RIGHT_HALF, right.dx, right.dy), shade(look.rock, -0.04), HOME_INK, 5);
      this.facets(left.dx, left.dy, (x: number) => x < SEAM_X);
      this.facets(right.dx, right.dy, (x: number) => x >= SEAM_X);
    }
    for (let k = 0; k < cracks; k++) {
      const crack = CRACKS[k]!, side = crack[0]! < SEAM_X ? left : right;
      g.lineStyle(4, CRACK_INK);
      g.beginPath();
      for (let i = 0; i < crack.length; i += 2) {
        const x = crack[i]! + (open > 0 ? side.dx : 0), y = crack[i + 1]! + (open > 0 ? side.dy : 0);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }
    if (empty && glow > 0) {
      // Nothing in there: a puff of grit drifts out of the hollow and thins away.
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.45;
        const d = 20 + glow * 70;
        g.fillStyle(DUST, 0.55 * (1 - glow * 0.7)).fillCircle(HOLLOW.x + Math.cos(a) * d, HOLLOW.y - 20 + Math.sin(a) * d * 0.8, 14 + glow * 10 + (k % 2) * 6);
      }
    }
  }

  /** Light and shade on the stone, and the flecks that hint at the dig. */
  private facets(dx: number, dy: number, keep: (x: number) => boolean): void {
    const g = this.art, look = this.look;
    if (keep(60)) {
      shape(g, shift([10, 150, 0, 110, 18, 62, 50, 120, 40, 160], dx, dy), look.rockShade, look.rockShade, 0);
      shape(g, shift([60, -6, 118, -38, 96, -8, 70, 8], dx, dy), shade(look.rock, 0.18), shade(look.rock, 0.18), 0);
    }
    if (keep(200)) shape(g, shift([206, 150, 248, 112, 250, 150, 236, 170], dx, dy), look.rockShade, look.rockShade, 0);
    for (const [x, y] of FLECKS) {
      if (!keep(x)) continue;
      g.fillStyle(look.fleck, 0.75).fillEllipse(x + dx, y + dy, 9, 6);
    }
  }

  /** The find, cut the way that gem is: a lump of gold, a brilliant, an emerald's step cut. */
  private gem(glow: number): void {
    const g = this.art, look = this.look, { x, y } = HOLLOW;
    const s = 0.55 + 0.45 * glow;
    g.fillStyle(look.gemLight, 0.18 * glow).fillCircle(x, y, 96 * s);
    g.fillStyle(look.gemLight, 0.28 * glow).fillCircle(x, y, 58 * s);
    const at = (points: readonly number[]): number[] => points.map((v, i) => (i % 2 ? y + v * s : x + v * s));
    if (look.gem === 'gold') {
      shape(g, at([-40, 8, -32, -22, -6, -34, 22, -28, 42, -6, 36, 22, 10, 34, -24, 30]), look.gemBody, shade(look.gemDark, -0.2), 4);
      shape(g, at([-28, -6, -18, -22, 2, -26, -4, -10]), look.gemLight, look.gemLight, 0);
      shape(g, at([8, 20, 30, 8, 30, 20, 12, 28]), look.gemDark, look.gemDark, 0);
      g.fillStyle(look.gemDark).fillCircle(x - 8 * s, y + 10 * s, 5 * s).fillCircle(x + 18 * s, y - 12 * s, 4 * s);
    } else if (look.gem === 'diamond') {
      shape(g, at([-44, -10, -26, -30, 26, -30, 44, -10, 0, 38]), look.gemBody, shade(look.gemDark, -0.25), 4);
      shape(g, at([-26, -30, -10, -10, 10, -10, 26, -30]), look.gemLight, look.gemLight, 0);
      g.lineStyle(2.5, look.gemDark);
      for (const [x1, y1, x2, y2] of [[-44, -10, 44, -10], [-10, -10, 0, 38], [10, -10, 0, 38], [-26, -10, 0, 38], [26, -10, 0, 38]]) {
        g.lineBetween(x + x1! * s, y + y1! * s, x + x2! * s, y + y2! * s);
      }
    } else {
      shape(g, at([-30, -36, 30, -36, 42, -22, 42, 22, 30, 36, -30, 36, -42, 22, -42, -22]), look.gemBody, shade(look.gemDark, -0.25), 4);
      shape(g, at([-18, -22, 18, -22, 26, -12, 26, 12, 18, 22, -18, 22, -26, 12, -26, -12]), shade(look.gemBody, 0.12), look.gemDark, 2);
      shape(g, at([-10, -12, 10, -12, 14, -4, -14, -4]), look.gemLight, look.gemLight, 0);
    }
    if (glow > 0) {
      sparkle(g, x - 58 * s, y - 40 * s, 16 * glow);
      sparkle(g, x + 54 * s, y - 52 * s, 12 * glow);
      sparkle(g, x + 40 * s, y + 46 * s, 9 * glow);
    }
  }

  /** The handle's far end for an angle; the head sits across it there. */
  private head(angle: number): { x: number; y: number; dx: number; dy: number } {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    return { x: PIVOT.x + dx * HANDLE, y: PIVOT.y + dy * HANDLE, dx, dy };
  }

  /** The pick's leading point: the side the swing moves toward, which is the one that bites. */
  private tip(angle: number): { x: number; y: number } {
    const h = this.head(angle);
    return { x: h.x - h.dy * POINT, y: h.y + h.dx * POINT };
  }

  private prospector(blow: number, found: boolean, empty: boolean, glow: number): void {
    const g = this.art, look = this.look, cx = -188;
    const angle = pickAngle(blow);
    const h = this.head(angle), nx = -h.dy, ny = h.dx;
    const hatLift = found ? 14 * glow : empty ? -5 * glow : 0;

    // Boots and legs, then the shirt and the bib of his overalls.
    for (const x of [-236, -186]) slab(g, x, 154, 50, 24, 0x4a3326, 9);
    shape(g, [-232, 70, -144, 70, -146, 160, -178, 160, -188, 104, -198, 160, -230, 160], look.overalls);
    slab(g, -240, -48, 104, 124, look.shirt, 34);
    slab(g, -226, 4, 76, 72, look.overalls, 12);
    g.lineStyle(6, shade(look.overalls, -0.15)).lineBetween(-222, 8, -214, -42).lineBetween(-154, 8, -162, -42);
    g.fillStyle(0xf2d38a).fillCircle(-218, 12, 4).fillCircle(-158, 12, 4);
    slab(g, -204, 26, 32, 22, shade(look.overalls, -0.1), 5);

    // The head, turned toward the stone.
    g.fillStyle(look.skin).fillEllipse(cx - 34, -82, 18, 26);
    g.lineStyle(3, HOME_INK).strokeEllipse(cx - 34, -82, 18, 26);
    g.fillStyle(look.skin).fillCircle(cx, -84, 40);
    g.lineStyle(4, HOME_INK).strokeCircle(cx, -84, 40);
    shape(g, cubicContour(cx - 36, -78, [[cx - 40, -34, cx - 10, -14, cx + 6, -16], [cx + 26, -18, cx + 40, -40, cx + 38, -76], [cx + 22, -58, cx - 20, -58, cx - 36, -78]]), look.beard);
    shape(g, cubicContour(cx - 12, -64, [[cx, -72, cx + 22, -72, cx + 34, -62], [cx + 22, -54, cx, -54, cx - 12, -64]]), shade(look.beard, -0.12));
    g.fillStyle(shade(look.skin, -0.06)).fillEllipse(cx + 28, -76, 22, 18);
    g.lineStyle(3, HOME_INK).strokeEllipse(cx + 28, -76, 22, 18);
    g.fillStyle(0xd97770, found ? 0.45 : 0.2).fillEllipse(cx + 6, -70, 18, 10);
    const squint = blow > 0.5;
    for (const ex of [cx + 4, cx + 26]) {
      if (found) {
        g.lineStyle(4, HOME_INK);
        traceContour(g, cubicContour(ex - 7, -94, [[ex - 3, -102, ex + 3, -102, ex + 7, -94]]));
        g.strokePath();
      } else if (squint) {
        g.lineStyle(4, HOME_INK).lineBetween(ex - 6, -96, ex + 6, -96);
      } else {
        g.fillStyle(HOME_INK).fillEllipse(ex, empty ? -94 : -96, 8, 12);
        g.fillStyle(0xffffff).fillCircle(ex - 1, -99, 2);
      }
    }
    g.lineStyle(5, shade(look.beard, -0.2));
    if (empty) g.lineBetween(cx, -114, cx + 12, -110).lineBetween(cx + 20, -110, cx + 32, -114);
    else g.lineBetween(cx - 2, -110, cx + 10, -112).lineBetween(cx + 20, -112, cx + 32, -110);
    if (found) {
      shape(g, cubicContour(cx + 4, -50, [[cx + 12, -40, cx + 26, -40, cx + 32, -50], [cx + 24, -30, cx + 10, -30, cx + 4, -50]]), 0x6b3437);
    } else {
      g.lineStyle(4, HOME_INK);
      traceContour(g, cubicContour(cx + 6, -48, [[cx + 14, empty ? -52 : -46, cx + 22, empty ? -44 : -46, cx + 30, -48]]));
      g.strokePath();
    }
    if (empty && glow > 0) {
      // A bead of sweat at the temple, and the brim pulled down a touch.
      shape(g, cubicContour(cx - 26, -118, [[cx - 34, -104, cx - 32, -96, cx - 26, -96], [cx - 20, -96, cx - 18, -104, cx - 26, -118]]), 0xbfe6f5, 0x6fa7c0, 2);
    }

    // The hat, which lifts on a find.
    const hy = -118 - hatLift;
    shape(g, [cx - 30, hy, cx - 24, hy - 42, cx, hy - 52, cx + 24, hy - 42, cx + 32, hy], look.hat);
    slab(g, cx - 29, hy - 14, 61, 12, shade(look.hat, -0.35), 4);
    g.fillStyle(look.hat).fillEllipse(cx + 2, hy, 140, 26);
    g.lineStyle(4, HOME_INK).strokeEllipse(cx + 2, hy, 140, 26);

    // The pick: an ash handle through a steel head, both hands near its foot.
    g.lineStyle(14, HOME_INK).lineBetween(PIVOT.x - h.dx * 16, PIVOT.y - h.dy * 16, h.x, h.y);
    g.lineStyle(9, 0xc79a62).lineBetween(PIVOT.x - h.dx * 16, PIVOT.y - h.dy * 16, h.x, h.y);
    const point = this.tip(angle);
    const back = { x: h.x + h.dy * (POINT - 6), y: h.y - h.dx * (POINT - 6) };
    shape(g, [
      point.x, point.y,
      h.x + nx * 10 + h.dx * 12, h.y + ny * 10 + h.dy * 12,
      back.x + h.dx * 6, back.y + h.dy * 6,
      back.x - h.dx * 6, back.y - h.dy * 6,
      h.x + nx * 10 - h.dx * 12, h.y + ny * 10 - h.dy * 12,
    ], 0x9aa3ad, HOME_INK, 4);
    slab(g, h.x - 9, h.y - 9, 18, 18, 0x6f7781, 4);
    g.lineStyle(3, 0xd8dee4).lineBetween(h.x + nx * 6, h.y + ny * 6, point.x - nx * 6 + h.dx * 2, point.y - ny * 6 + h.dy * 2);
    for (const along of [0, 26]) {
      const hx = PIVOT.x + h.dx * along, hy2 = PIVOT.y + h.dy * along;
      g.lineStyle(20, look.shirt).lineBetween(along === 0 ? -214 : -168, -26, hx, hy2);
      g.fillStyle(look.skin).fillCircle(hx, hy2, 15);
      g.lineStyle(3, HOME_INK).strokeCircle(hx, hy2, 15);
    }
  }
}

function shift(points: readonly number[], dx: number, dy: number): number[] {
  return points.map((v, i) => v + (i % 2 ? dy : dx));
}
