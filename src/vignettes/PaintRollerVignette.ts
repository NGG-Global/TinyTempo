import type Phaser from 'phaser';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import {
  PAINT_GRID, rollerPass, rollerReturn, stripeColumns, type PaintImage,
} from './errandMotion';
import { rollerImage, rollerLook, type RollerLook } from './rollerLooks';
import { clamp01, easeOut } from './motion';

/** The wall in stage units; the grid divides it evenly. */
const WALL = { left: -272, top: -200, width: 544, height: 360 } as const;
const CELL = { w: WALL.width / PAINT_GRID.columns, h: WALL.height / PAINT_GRID.rows } as const;
const SLEEVE = { w: 3 * CELL.w, h: 36 } as const;
/** How far down the last stripe a rough coda gets before the roller slips. */
const SLIP_AT = 0.45;

/**
 * Each beat rolls one stripe of a picture onto a bare wall; the last stripe, in the coda,
 * completes it. The picture is coarse on purpose: a stripe of any width is whole columns.
 */
export class PaintRollerVignette extends HouseholdVignette {
  /** Which wall, and which set of pictures. The pass down a stripe does not change. */
  private readonly look: RollerLook;
  private readonly lap: number;
  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = rollerLook(lap);
    super(scene, look.paper, look.glow);
    this.look = look;
    this.lap = lap;
  }

  private get image(): PaintImage { return rollerImage(this.plan?.id ?? 1, this.lap); }
  private get stripes(): number { return (this.plan?.targets.length ?? 4) + 1; }
  private stripeX(index: number): number {
    const { from, to } = stripeColumns(index, this.stripes);
    return WALL.left + ((from + to) / 2) * CELL.w;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const image = this.image;
    const stripes = this.stripes;
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const finished = ending >= 0;
    // Bare plaster, a skirting board and a drop cloth: the room before any colour.
    slab(g, -346, -246, 692, 490, this.look.plaster, 22, 0xa79b8a);
    g.fillStyle(this.look.wall).fillRect(WALL.left, WALL.top, WALL.width, WALL.height);
    g.lineStyle(1.5, this.look.wallLine, 0.5);
    for (let i = 1; i < 6; i++) g.lineBetween(WALL.left, WALL.top + i * 60, WALL.left + WALL.width, WALL.top + i * 60);
    // Painted stripes: every hit lays whole columns of the picture, top to skirting.
    const paintStripe = (index: number, reveal: number): void => {
      if (reveal <= 0) return;
      const { from, to } = stripeColumns(index, stripes);
      const rows = Math.ceil(reveal * PAINT_GRID.rows);
      for (let row = 0; row < rows; row++) {
        const line = image.rows[row]!;
        const y = WALL.top + row * CELL.h;
        const h = row === rows - 1 ? Math.max(0, reveal * WALL.height - row * CELL.h) : CELL.h;
        for (let col = from; col < to; col++) {
          g.fillStyle(image.palette[Number(line[col])] ?? image.palette[0]!).fillRect(WALL.left + col * CELL.w, y, CELL.w + 0.5, h + 0.5);
        }
      }
    };
    for (let s = 0; s < Math.min(times.length, stripes - 1); s++) paintStripe(s, rollerPass(now - times[s]!, beat));
    let codaReveal = 0;
    if (finished) {
      codaReveal = this.successful ? rollerPass(ending, beat) : Math.min(SLIP_AT, rollerPass(ending, beat));
      paintStripe(stripes - 1, codaReveal);
    }
    // Wet sheen on the freshest stripe, fading as the paint takes.
    const last = finished ? stripes - 1 : times.length - 1;
    const lastAge = finished ? ending : last >= 0 ? now - times[last]! : Infinity;
    if (last >= 0 && lastAge < 0.7) {
      const { from, to } = stripeColumns(last, stripes);
      g.fillStyle(0xffffff, 0.22 * (1 - lastAge / 0.7)).fillRect(WALL.left + from * CELL.w + 4, WALL.top, (to - from) * CELL.w - 8, WALL.height * (finished ? codaReveal : rollerPass(lastAge, beat)));
    }
    slab(g, -346, WALL.top + WALL.height, 692, 22, 0xf1ebe0, 4, 0xb2a696);
    g.fillStyle(0xb9ad9a).fillRect(-346, WALL.top + WALL.height + 22, 692, 70);
    shape(g, [-330, 200, -60, 194, -20, 244, -346, 244], 0xe4dccd, 0xb2a696, 2);
    // The tray and the tin, both holding the ground colour the roller is loaded with.
    slab(g, -300, 178, 150, 30, 0x8c9aa6, 8, 0x5a6672);
    g.fillStyle(image.palette[0]!).fillRoundedRect(-292, 184, 134, 16, 6);
    slab(g, 232, 168, 70, 70, 0xc9cfd4, 10, 0x7c858c);
    g.fillStyle(image.palette[0]!).fillEllipse(267, 172, 58, 16);
    if (finished && !this.successful) this.drips(ending);
    this.roller(now, ending, beat, codaReveal);
    if (finished && this.successful && !this.still) {
      const a = Math.sin(clamp01((ending - 0.75) / 0.8) * Math.PI);
      sparkle(g, -300, -170, 15 * a, a);
      sparkle(g, 306, -60, 20 * a, a);
      sparkle(g, 200, -215, 12 * a, a);
    }
  }

  /** Paint running off the slipped stripe on a rough round. */
  private drips(ending: number): void {
    const g = this.art;
    const { from, to } = stripeColumns(this.stripes - 1, this.stripes);
    const colour = this.image.palette[0]!;
    const top = WALL.top + SLIP_AT * WALL.height;
    for (let d = 0; d < 3; d++) {
      const x = WALL.left + (from + 0.3 + d * 0.32 * (to - from) / 1) * CELL.w;
      const length = easeOut((ending - 0.28 - d * 0.14) / 0.5) * (80 + d * 30);
      if (length <= 0) continue;
      g.lineStyle(6, shade(colour, -0.12)).lineBetween(x, top, x, top + length);
      g.fillStyle(shade(colour, -0.12)).fillCircle(x, top + length, 5);
    }
    g.lineStyle(3, shade(colour, -0.35), 0.7).lineBetween(WALL.left + from * CELL.w, top + 2, WALL.left + to * CELL.w, top + 14);
  }

  /** The roller rides down the stripe on the beat, then lifts across to the next one. */
  private roller(now: number, ending: number, beat: number, codaReveal: number): void {
    const g = this.art;
    const stripes = this.stripes;
    const colour = this.image.palette[0]!;
    let x: number, y: number, tilt = 0;
    if (ending >= 0) {
      const slip = this.successful ? 0 : easeOut((ending - SLIP_AT * 0.42 * beat) / 0.3);
      x = this.stripeX(stripes - 1) + slip * 34;
      y = WALL.top + codaReveal * WALL.height + slip * 18;
      tilt = slip * 0.35;
    } else if (this.strokes === 0) {
      x = this.stripeX(0);
      y = WALL.top;
    } else {
      const s = Math.min(this.strokes - 1, stripes - 1);
      const age = now - this.strikeAt;
      const pass = rollerPass(age, beat), back = rollerReturn(age, beat);
      x = this.stripeX(s) + (this.stripeX(Math.min(s + 1, stripes - 1)) - this.stripeX(s)) * back;
      y = WALL.top + WALL.height * pass * (1 - back) - Math.sin(back * Math.PI) * 46;
    }
    if (!this.still && now - this.errorAt < 0.2) x += Math.sin((now - this.errorAt) * 80) * 5;
    // Sleeve, cage and a handle that leaves the frame low and to the right.
    g.lineStyle(9, 0x9a9a9a).lineBetween(x + SLEEVE.w / 2 + 6, y + SLEEVE.h / 2, x + SLEEVE.w / 2 + 6, y + SLEEVE.h / 2 + 34);
    g.lineStyle(9, 0x9a9a9a).lineBetween(x + SLEEVE.w / 2 + 6, y + SLEEVE.h / 2 + 34, x + SLEEVE.w / 2 + 60, y + SLEEVE.h / 2 + 90);
    g.lineStyle(20, this.look.handle).lineBetween(x + SLEEVE.w / 2 + 60, y + SLEEVE.h / 2 + 90, x + SLEEVE.w / 2 + 150, y + SLEEVE.h / 2 + 200);
    g.lineStyle(20, HOME_INK, 0.35).lineBetween(x + SLEEVE.w / 2 + 120, y + SLEEVE.h / 2 + 163, x + SLEEVE.w / 2 + 150, y + SLEEVE.h / 2 + 200);
    const cx = x, cy = y;
    g.fillStyle(HOME_INK, 0.16).fillRoundedRect(cx - SLEEVE.w / 2 + 6, cy - SLEEVE.h / 2 + 8, SLEEVE.w, SLEEVE.h, 16);
    const sleeve = [cx - SLEEVE.w / 2, cy - SLEEVE.h / 2, cx + SLEEVE.w / 2, cy - SLEEVE.h / 2, cx + SLEEVE.w / 2, cy + SLEEVE.h / 2, cx - SLEEVE.w / 2, cy + SLEEVE.h / 2];
    const rotated = sleeve.map((v, i) => i % 2 ? cy + (sleeve[i - 1]! - cx) * Math.sin(tilt) + (v - cy) * Math.cos(tilt) : cx + (v - cx) * Math.cos(tilt) - (sleeve[i + 1]! - cy) * Math.sin(tilt));
    shape(g, rotated, colour, shade(colour, -0.5), 3);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(cx - SLEEVE.w / 2 + 6, cy - SLEEVE.h / 2 + 5, SLEEVE.w - 12, 8, 4);
    g.fillStyle(shade(colour, -0.25)).fillRoundedRect(cx - SLEEVE.w / 2 + 6, cy + SLEEVE.h / 2 - 9, SLEEVE.w - 12, 5, 2);
    g.fillStyle(0xbdbdbd).fillCircle(cx + SLEEVE.w / 2 + 6, cy, 7);
  }
}
