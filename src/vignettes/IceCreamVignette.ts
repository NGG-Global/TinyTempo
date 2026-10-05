import type Phaser from 'phaser';
import { cubicContour, traceContour } from '@/ui/illustration';
import { shade } from '@/ui/colour';
import { HouseholdVignette } from './HouseholdVignette';
import { HOME_INK, shape, slab } from './householdArt';
import { celebration } from './treatArt';
import { iceCreamLook, type IceCreamLook } from './iceCreamLooks';
import { dropFall, licked, lickReach, lickSweep, relish, splatSpread } from './iceCreamMotion';

/** The licker's head, and the mouth the tongue comes out of: turned toward the treat. */
const HEAD = { x: -118, y: -58, r: 92 } as const;
const MOUTH = { x: -56, y: 2 } as const;
/** Where the treat is held, and how far it leans in to meet each lick. */
const TREAT_X = 40;
const LEAN = 12;
/** The floor a dropped treat lands on. */
const FLOOR_Y = 178;
/** The waffle cone's rim and tip, and the ice pop's base on its stick. */
const RIM_Y = 20;
const TIP_Y = 140;
const POP_BASE = 60;
const POP_HEIGHT = 160;
/** How much of an ice pop, from its base, is the lemon layer. */
const POP_SEAM = 0.45;
/** The lollipop's centre, on top of its stick. */
const CANDY_Y = -14;

/** An ice pop's wooden stick. */
const STICK = 0xe8c48a;

/** Where the remaining treat is and how big: what a lick touches, and what falls on a rough coda. */
interface TreatMass {
  readonly x: number;
  readonly y: number;
  /** The radius of a scoop or a lollipop; the height of an ice pop. */
  readonly size: number;
  /** Where the tongue lands on it: its side nearest the mouth. */
  readonly contact: { readonly x: number; readonly y: number };
}

/**
 * A person licks an ice cream, an ice pop or a lollipop on every beat; what is left is the
 * verdict. The look's `body` colour is drawn by nothing but the treat and its splat, so a
 * test can see how much is left without Phaser by watching that fill.
 */
export class IceCreamVignette extends HouseholdVignette {
  private readonly look: IceCreamLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = iceCreamLook(lap);
    super(scene, shade(look.sky, 0.3), 0xfff1cf);
    this.look = look;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const ended = ending >= 0;
    // The coda's lick lands on the contact; before it, every lick is a beat's.
    const age = ended ? ending : now - this.strikeAt;
    const reach = this.still ? 0 : lickReach(age, beat);
    const sweep = lickSweep(age, beat);
    const hits = this.watching ? 0 : this.hitTimes.length;
    const amount = licked(hits, this.plan?.targets.length ?? 4, ending, this.successful, this.still);
    const dropping = ended && !this.successful;
    const fall = dropping ? dropFall(ending, this.still) : 0;
    const splat = dropping ? splatSpread(ending, this.still) : 0;
    const happy = ended && this.successful ? relish(ending, this.still) : 0;
    // A rough coda's lick never reaches: the treat is already slipping.
    const tongue = dropping ? 0 : reach;
    const lean = -LEAN * tongue;

    this.scenery();
    g.fillStyle(shade(this.look.floor, -0.3), 0.3).fillEllipse(-120, 176, 300, 26);
    this.body(TREAT_X + lean);
    const mass = this.treat(TREAT_X + lean, 1 - amount, dropping);
    this.hand(TREAT_X + lean);
    if (dropping && mass) this.dropped(mass, fall, splat);
    this.face(tongue, sweep, mass, happy, dropping ? fall : 0, splat);
    if (happy > 0) celebration(g, ending, this.still);
  }

  /** Where the licker is: an ice cream parlour, a beach, a sweet shop. */
  private scenery(): void {
    const g = this.art, look = this.look;
    slab(g, -330, -224, 660, 448, look.sky, 30, shade(look.sky, -0.4));
    if (look.treat === 'cone') {
      // A striped awning with a scalloped hem, and the parlour's board of flavours.
      for (let k = 0; k < 12; k++) {
        const x = -316 + k * 53;
        g.fillStyle(k % 2 ? 0xfff6ee : look.stripe).fillRect(x, -212, 53, 50);
        g.fillCircle(x + 26.5, -162, 26.5);
      }
      slab(g, 150, -120, 150, 120, 0x5b4a48, 14);
      for (const [k, colour] of [[0, look.light], [1, 0x8a5a3c], [2, 0xa8dcc0]] as const) {
        g.fillStyle(colour).fillCircle(184 + k * 41, -76, 15);
        g.fillStyle(0xfff6ee, 0.8).fillRect(170 + k * 41, -46, 28, 5).fillRect(172 + k * 41, -34, 24, 5);
      }
      for (let k = 0; k < 13; k++) {
        g.fillStyle(k % 2 ? look.floor : shade(look.floor, -0.12)).fillRect(-318 + k * 49, 150, 49, 64);
      }
    } else if (look.treat === 'icePop') {
      // The sea to the horizon, a sun, and a striped umbrella planted in the sand.
      g.fillStyle(0xfff0a8).fillCircle(240, -160, 40);
      g.fillStyle(look.band).fillRect(-316, -30, 632, 180);
      g.lineStyle(4, 0xe8f8fb, 0.8);
      for (const [x, y] of [[-260, 10], [-80, 40], [120, 0], [230, 70], [-180, 100]] as const) {
        traceContour(g, cubicContour(x, y, [[x + 12, y - 8, x + 26, y - 8, x + 38, y]]));
        g.strokePath();
      }
      g.lineStyle(6, 0x8a6a4a).lineBetween(220, -110, 236, 160);
      for (let k = 0; k < 6; k++) {
        const a0 = Math.PI + k * Math.PI / 6, a1 = a0 + Math.PI / 6;
        g.fillStyle(k % 2 ? 0xfff6ee : look.stripe).fillTriangle(220, -110, 220 + Math.cos(a0) * 110, -110 + Math.sin(a0) * 60, 220 + Math.cos(a1) * 110, -110 + Math.sin(a1) * 60);
      }
      g.lineStyle(3, HOME_INK).strokeEllipse(220, -110, 220, 4);
      g.fillStyle(look.floor).fillRect(-316, 150, 632, 64);
      g.fillStyle(shade(look.floor, -0.15));
      for (const [x, y] of [[-270, 170], [-30, 196], [150, 176], [280, 200], [60, 204]] as const) g.fillEllipse(x, y, 14, 5);
    } else {
      // A sweet shop: striped paper, and a shelf of jars.
      g.fillStyle(look.band, 0.7);
      for (let k = 0; k < 11; k++) g.fillRect(-300 + k * 60, -212, 26, 362);
      slab(g, 110, -96, 200, 14, 0xa77b54, 4);
      for (let k = 0; k < 3; k++) {
        const x = 128 + k * 62;
        slab(g, x, -160, 46, 64, 0xf4fbff, 12, 0x8aa0b0);
        for (let c = 0; c < 5; c++) {
          g.fillStyle([look.light, look.stripe, 0xf2b84b, 0x7fc8a9, 0xe57a8a][(c + k) % 5]!).fillCircle(x + 11 + (c % 3) * 12, -112 - Math.floor(c / 3) * 12 - (c % 2) * 3, 6);
        }
        g.fillStyle(0xa77b54).fillRoundedRect(x + 4, -168, 38, 10, 4);
      }
      slab(g, -330, 150, 660, 74, look.floor, 18, shade(look.floor, -0.4));
      g.lineStyle(3, shade(look.floor, -0.18));
      for (const y of [172, 196]) g.lineBetween(-316, y, 316, y);
    }
  }

  /** The licker from the neck down, and the arm that holds the treat out to them. */
  private body(treatX: number): void {
    const g = this.art, look = this.look;
    shape(g, [-238, 168, -228, 70, -176, 36, -62, 36, -14, 70, -4, 168], look.shirt);
    g.fillStyle(look.skin).fillRoundedRect(-142, 10, 46, 40, 14);
    g.lineStyle(26, HOME_INK).lineBetween(-46, 78, -6, 132).lineBetween(-6, 132, treatX - 6, this.handY());
    // The sleeve a shade off the shirt, so the arm reads in front of the body it crosses.
    g.lineStyle(20, shade(look.shirt, -0.12)).lineBetween(-46, 78, -6, 132).lineBetween(-6, 132, treatX - 6, this.handY());
  }

  private handY(): number {
    return this.look.treat === 'cone' ? 98 : this.look.treat === 'icePop' ? 112 : 104;
  }

  /** The hand closed round the cone or the stick, drawn over it. */
  private hand(treatX: number): void {
    const g = this.art, y = this.handY();
    g.fillStyle(this.look.skin).fillEllipse(treatX - 2, y, 40, 30);
    g.lineStyle(3, HOME_INK).strokeEllipse(treatX - 2, y, 40, 30);
    g.lineStyle(2, shade(this.look.skin, -0.3));
    for (const dy of [-5, 3]) g.lineBetween(treatX + 4, y + dy, treatX + 16, y + dy);
  }

  /**
   * The treat as `remaining` of it is left, and where that remainder is. On a rough coda
   * the remainder is not drawn here: it is falling, and `dropped` draws it.
   */
  private treat(x: number, remaining: number, dropping: boolean): TreatMass | null {
    const g = this.art, look = this.look;
    const left = remaining > 0.004 ? remaining : 0;
    if (look.treat === 'cone') {
      const r = 54 * left ** 0.6;
      const mass = r > 2 ? { x, y: RIM_Y - r * 0.5, size: r, contact: { x: x - r * 0.92, y: RIM_Y - r * 0.4 } } : null;
      if (mass && !dropping) this.scoop(mass.x, mass.y, r);
      // The cone over the foot of the scoop, waffled; its mouth shows once the scoop is gone.
      shape(g, [x - 42, RIM_Y, x + 42, RIM_Y, x, TIP_Y], look.second, shade(look.second, -0.5), 4);
      g.lineStyle(2.5, shade(look.second, -0.25));
      const edge = (side: number, t: number): [number, number] => [x + side * 42 * (1 - t), RIM_Y + (TIP_Y - RIM_Y) * t];
      for (let k = -2; k < 6; k++) {
        const a = k * 0.2, b = a + 0.32;
        for (const side of [-1, 1]) {
          const from = edge(side, Math.max(0, a)), to = edge(-side, Math.min(1, b));
          if (a < 1 && b > 0) g.lineBetween(from[0], from[1], to[0], to[1]);
        }
      }
      if (mass && !dropping && r > 14) {
        // A melting hem over the rim, and one drip running down the waffle.
        g.fillStyle(look.body);
        for (let k = 0; k < 5; k++) g.fillCircle(x - 34 + k * 17, RIM_Y + 2 + (k % 2) * 5, 10);
        g.fillEllipse(x + 22, RIM_Y + 18, 10, 20);
      }
      if (!mass || dropping) {
        g.fillStyle(shade(look.second, -0.45)).fillEllipse(x, RIM_Y, 84, 16);
        g.lineStyle(4, shade(look.second, -0.5)).strokeEllipse(x, RIM_Y, 84, 16);
      }
      return mass;
    }
    if (look.treat === 'icePop') {
      slab(g, x - 8, POP_BASE - 20, 16, 118, STICK, 7, shade(STICK, -0.5));
      const h = POP_HEIGHT * left;
      const top = POP_BASE - h;
      const mass = h > 4 ? { x, y: POP_BASE - h / 2, size: h, contact: { x: x - 34, y: Math.max(top + Math.min(30, h / 2), MOUTH.y - 26) } } : null;
      if (mass && !dropping) this.pop(x, top, h, POP_BASE);
      return mass;
    }
    g.lineStyle(14, shade(0xfaf6ef, -0.45)).lineBetween(x, CANDY_Y, x, 150);
    g.lineStyle(10, 0xfaf6ef).lineBetween(x, CANDY_Y, x, 150);
    const r = 58 * left ** 0.6;
    const mass = r > 2 ? { x, y: CANDY_Y, size: r, contact: { x: x - r * 0.94, y: CANDY_Y + r * 0.2 } } : null;
    if (mass && !dropping) this.candy(x, CANDY_Y, r);
    return mass;
  }

  private scoop(x: number, y: number, r: number): void {
    const g = this.art, look = this.look;
    g.fillStyle(look.body).fillCircle(x, y, r);
    g.lineStyle(4, HOME_INK).strokeCircle(x, y, r);
    g.fillStyle(look.dark, 0.6).fillEllipse(x + r * 0.35, y + r * 0.3, r * 0.9, r * 0.6);
    g.fillStyle(look.light).fillEllipse(x - r * 0.3, y - r * 0.4, r * 0.5, r * 0.32);
    for (const [dx, dy] of [[-0.3, 0.1], [0.2, -0.3], [0.4, 0.25], [-0.05, 0.45]] as const) {
      g.fillStyle(look.dark).fillEllipse(x + dx * r, y + dy * r, Math.max(2, r * 0.07), Math.max(2, r * 0.12));
    }
  }

  /** An ice pop `h` tall whose base is at `base`: on its stick, or falling off it. */
  private pop(x: number, top: number, h: number, base: number): void {
    const g = this.art, look = this.look;
    const round = Math.min(30, h / 2);
    // Lemon below, cherry above, in two frozen layers; licking takes the cherry first.
    const seam = base - POP_HEIGHT * POP_SEAM;
    g.fillStyle(look.second).fillRoundedRect(x - 35, top, 70, h, { tl: round, tr: round, bl: 10, br: 10 });
    if (top < seam) g.fillStyle(look.body).fillRoundedRect(x - 35, top, 70, seam - top, { tl: round, tr: round, bl: 0, br: 0 });
    g.lineStyle(4, HOME_INK).strokeRoundedRect(x - 35, top, 70, h, { tl: round, tr: round, bl: 10, br: 10 });
    g.fillStyle(0xffffff, 0.45).fillRoundedRect(x - 24, top + 10, 10, Math.max(0, h - 24), 5);
    if (top < seam) g.fillStyle(look.dark, 0.5).fillRoundedRect(x + 14, top + 12, 10, Math.max(0, seam - top - 18), 5);
    // A drip down the side, which is why there is a hurry.
    g.fillStyle(top < seam ? look.body : look.second).fillEllipse(x + 35, Math.max(top + 24, base - 16), 10, 22);
  }

  private candy(x: number, y: number, r: number): void {
    const g = this.art, look = this.look;
    g.fillStyle(look.body).fillCircle(x, y, r);
    g.lineStyle(Math.max(3, r * 0.16), look.second);
    g.beginPath();
    for (let k = 0; k <= 48; k++) {
      const a = k * 0.3, d = r * 0.9 * k / 48;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
    g.lineStyle(4, HOME_INK).strokeCircle(x, y, r);
    g.fillStyle(0xffffff, 0.5).fillEllipse(x - r * 0.4, y - r * 0.45, r * 0.4, r * 0.22);
  }

  /** The treat falling, and then flat on the floor: a puddle for ice, a cracked disc for candy. */
  private dropped(mass: TreatMass, fall: number, splat: number): void {
    const g = this.art, look = this.look;
    const landX = mass.x + 70, x = mass.x + (landX - mass.x) * fall;
    if (splat <= 0) {
      const y = mass.y + (FLOOR_Y - 20 - mass.y) * fall;
      if (look.treat === 'cone') this.scoop(x, y, mass.size);
      else if (look.treat === 'icePop') this.pop(x, y - mass.size / 2, mass.size, y + mass.size / 2);
      else this.candy(x, y, mass.size);
      return;
    }
    // A scoop's or a candy's size is its radius; an ice pop's is its height, and it is 70 wide.
    const width = look.treat === 'icePop' ? 70 + mass.size * 0.3 : Math.max(60, mass.size * 2.2);
    if (look.treat === 'lollipop') {
      g.fillStyle(look.body).fillEllipse(landX, FLOOR_Y, width, width * 0.34);
      g.lineStyle(3, HOME_INK).strokeEllipse(landX, FLOOR_Y, width, width * 0.34);
      g.lineStyle(3, look.dark).lineBetween(landX - width * 0.2, FLOOR_Y - 4, landX + 2, FLOOR_Y + 2).lineBetween(landX + 2, FLOOR_Y + 2, landX + width * 0.18, FLOOR_Y - 3);
      return;
    }
    const spread = width * (1 + splat * 0.4);
    // An ice pop melts into whichever layer is left: cherry while any of it is.
    const colour = look.treat === 'icePop' && mass.size <= POP_HEIGHT * POP_SEAM ? look.second : look.body;
    g.fillStyle(colour).fillEllipse(landX, FLOOR_Y, spread, 26 + splat * 8);
    for (let k = 0; k < 4; k++) g.fillCircle(landX - spread * 0.42 + k * spread * 0.28, FLOOR_Y + (k % 2 ? 8 : -6), 9 + (k % 2) * 4);
    g.lineStyle(3, look.dark).strokeEllipse(landX, FLOOR_Y, spread, 26 + splat * 8);
    g.fillStyle(look.light, 0.8).fillEllipse(landX - spread * 0.15, FLOOR_Y - 3, spread * 0.3, 5);
  }

  /** The head, turned toward the treat: hair, eyes on the treat, and the tongue on every lick. */
  private face(reach: number, sweep: number, mass: TreatMass | null, happy: number, fall: number, splat: number): void {
    const g = this.art, look = this.look, { x: hx, y: hy, r } = HEAD;
    this.hairBack(hx, hy, r);
    g.fillStyle(look.skin).fillEllipse(hx - r + 8, hy + 6, 26, 36);
    g.lineStyle(3, HOME_INK).strokeEllipse(hx - r + 8, hy + 6, 26, 36);
    g.fillStyle(look.skin).fillCircle(hx, hy, r);
    g.lineStyle(4, HOME_INK).strokeCircle(hx, hy, r);
    this.hairFront(hx, hy, r);
    // The nose, a bump on the side toward the treat.
    g.fillStyle(shade(look.skin, -0.05)).fillEllipse(hx + 84, hy + 22, 22, 24);
    g.lineStyle(3, HOME_INK).strokeEllipse(hx + 84, hy + 22, 22, 24);
    g.fillStyle(0xe8897e, 0.35).fillEllipse(hx + 32, hy + 36, 30, 16);

    const sad = splat > 0;
    const shocked = fall > 0 && !sad;
    const target = mass?.contact ?? { x: TREAT_X, y: 0 };
    for (const ex of [hx + 14, hx + 56]) {
      const ey = hy - 14;
      if (happy > 0.2) {
        g.lineStyle(4, HOME_INK);
        traceContour(g, cubicContour(ex - 9, ey + 2, [[ex - 4, ey - 8, ex + 4, ey - 8, ex + 9, ey + 2]]));
        g.strokePath();
        continue;
      }
      const open = shocked ? 1.2 : 1;
      g.fillStyle(0xffffff).fillEllipse(ex, ey, 20 * open, 26 * open);
      g.lineStyle(2.5, HOME_INK).strokeEllipse(ex, ey, 20 * open, 26 * open);
      // Eyes on the treat while there is one; on the floor once it has fallen.
      const lookX = sad ? 4 : Math.max(-4, Math.min(5, (target.x - ex) / 20));
      const lookY = sad ? 7 : Math.max(-4, Math.min(5, (target.y - ey) / 20));
      g.fillStyle(HOME_INK).fillCircle(ex + lookX, ey + lookY, 6);
      g.fillStyle(0xffffff).fillCircle(ex + lookX - 2, ey + lookY - 3, 2);
    }
    // Brows: lifted while licking, knitted into worry once the treat is on the floor.
    g.lineStyle(4, shade(look.hair, -0.1));
    if (sad) g.lineBetween(hx + 4, hy - 38, hx + 22, hy - 44).lineBetween(hx + 48, hy - 44, hx + 66, hy - 38);
    else g.lineBetween(hx + 4, hy - 44 - reach * 4, hx + 22, hy - 46 - reach * 4).lineBetween(hx + 48, hy - 46 - reach * 4, hx + 66, hy - 44 - reach * 4);

    const mx = MOUTH.x, my = MOUTH.y;
    if (reach > 0.02) {
      // The tongue: out to the treat on the contact, sweeping up it as it comes back in.
      const tipX = mx + (target.x - mx) * reach;
      const tipY = my + (target.y - my) * reach - sweep * 22 * reach;
      g.fillStyle(0x6b2f35).fillEllipse(mx, my, 26, 22);
      g.lineStyle(24, shade(0xe8797f, -0.35)).lineBetween(mx, my + 2, tipX, tipY);
      g.lineStyle(20, 0xe8797f).lineBetween(mx, my + 2, tipX, tipY);
      g.fillStyle(0xe8797f).fillCircle(tipX, tipY, 10);
      g.lineStyle(2, 0xc4545c).lineBetween(mx + 6, my + 2, tipX - 6, tipY);
    } else if (happy > 0) {
      // Licked clean: a grin, and a tongue the colour of whatever it was.
      shape(g, cubicContour(mx - 24, my - 6, [[mx - 14, my + 14, mx + 12, my + 14, mx + 20, my - 8], [mx + 4, my - 2, mx - 10, my - 2, mx - 24, my - 6]]), 0x6b2f35);
      g.fillStyle(look.tongue).fillEllipse(mx + 8, my + 10 + 6 * happy, 20, 12 + 10 * happy);
      g.lineStyle(3, HOME_INK).strokeEllipse(mx + 8, my + 10 + 6 * happy, 20, 12 + 10 * happy);
    } else if (shocked) {
      g.fillStyle(0x6b2f35).fillEllipse(mx - 2, my + 2, 18, 24);
    } else {
      g.lineStyle(4, HOME_INK);
      const droop = sad ? 8 : -4;
      traceContour(g, cubicContour(mx - 18, my, [[mx - 10, my - droop, mx + 6, my - droop, mx + 14, my]]));
      g.strokePath();
    }
  }

  private hairBack(x: number, y: number, r: number): void {
    const g = this.art, look = this.look;
    if (look.hairStyle === 'bob') {
      shape(g, [x - r - 8, y - 10, x - r + 4, y - 60, x - 20, y - r - 10, x + 40, y - r + 6, x - 10, y + 50, x - r + 10, y + 56], look.hair, shade(look.hair, -0.4));
    } else if (look.hairStyle === 'bun') {
      g.fillStyle(look.hair).fillCircle(x - r * 0.55, y - r * 0.9, 34);
      g.lineStyle(4, shade(look.hair, -0.4)).strokeCircle(x - r * 0.55, y - r * 0.9, 34);
    } else {
      g.fillStyle(look.hair);
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * 0.55 + k * 0.17;
        g.fillCircle(x + Math.cos(a) * r * 0.98, y - Math.abs(Math.sin(a)) * r * 0.98, 28);
      }
    }
  }

  private hairFront(x: number, y: number, r: number): void {
    const g = this.art, look = this.look;
    if (look.hairStyle === 'curls') {
      g.fillStyle(look.hair);
      for (let k = 0; k < 8; k++) g.fillCircle(x - r * 0.7 + k * 21, y - r * 0.8 + Math.sin(k * 1.7) * 6 - (k > 1 && k < 6 ? 12 : 0), 22);
      return;
    }
    // A cap of hair over the crown, with a fringe swept toward the treat.
    shape(g, cubicContour(x - r + 4, y - 10, [
      [x - r, y - r * 0.9, x + r * 0.3, y - r * 1.25, x + r * 0.86, y - 36],
      [x + r * 0.45, y - 54, x + 10, y - 66, x - 20, y - 50],
      [x - 40, y - 40, x - 70, y - 30, x - r + 4, y - 10],
    ]), look.hair, shade(look.hair, -0.4), 3);
    if (look.hairStyle === 'bun') {
      g.fillStyle(look.shirt).fillRoundedRect(x - r * 0.55 - 18, y - r * 0.9 + 22, 36, 10, 5);
    }
  }
}
