import { APPLE_LOOKS } from '../vignettes/appleLooks';
import { BALLOON_LOOKS } from '../vignettes/balloonLooks';
import { BANANA_LOOKS } from '../vignettes/bananaLooks';
import { BELL_LOOKS } from '../vignettes/bellLooks';
import { BONGO_LOOKS } from '../vignettes/bongoLooks';
import { BUBBLE_LOOKS } from '../vignettes/bubbleLooks';
import { BUG_LOOKS } from '../vignettes/bugLooks';
import { CLAP_LOOKS } from '../vignettes/clapLooks';
import { CUCUMBER_LOOKS } from '../vignettes/cucumberLooks';
import { CURL_LOOKS } from '../vignettes/curlLooks';
import { DOOR_LOOKS } from '../vignettes/doorLooks';
import { EGG_LOOKS } from '../vignettes/eggLooks';
import { FISHERMAN_LOOKS } from '../vignettes/fishermanLooks';
import { HAMMER_LOOKS } from '../vignettes/hammerLooks';
import { LIGHT_LOOKS } from '../vignettes/lightLooks';
import { PAPER_CONTOURS, type PaperShape } from '../vignettes/paperMotion';
import { ROLLER_LOOKS } from '../vignettes/rollerLooks';
import { SAW_LOOKS } from '../vignettes/sawLooks';
import { SCRATCH_LOOKS } from '../vignettes/scratchLooks';
import { SLUSHY_LOOKS } from '../vignettes/slushyLooks';
import { SNARE_LOOKS } from '../vignettes/snareLooks';
import { STAPLER_LOOKS } from '../vignettes/staplerLooks';
import { TOMATO_LOOKS } from '../vignettes/tomatoLooks';
import { TROMBONE_LOOKS } from '../vignettes/tromboneLooks';
import { WINDOW_LOOKS } from '../vignettes/windowLooks';
import { PALETTE, SHELL } from '../config/theme';
import { mix, shade } from './colour';
import { BRASS } from './panel';

/**
 * The keepsakes, drawn. One procedural object each, in the workshop treatment the acts
 * use — flat painted faces, one thick ink outline, a single highlight — and, where the act
 * has looks, in the colours of the look its level shows: the ladybird pin is the ladybird
 * that level 28's shoe chases, the kitchen switch is on the kitchen's wall.
 *
 * Every drawing has a silhouette: the same outer mass in one flat tone, with none of its
 * detail, which is how an unfound keepsake sits in its slot. Detail is drawn inside
 * `pen.detail`, so no drawing can leak what it is through its silhouette by accident.
 *
 * Drawings are authored in a 100-unit box centred on the slot and stay within ±42 of it.
 * Keyed by keepsake id; `tests/keepsakes.test.ts` requires one for every keepsake.
 */

type Point = readonly [number, number];

/**
 * The part of a Phaser `Graphics` a keepsake draws with. Declared as methods, so a real
 * `Graphics` is one without a cast, and a test can record a drawing without Phaser. Plain
 * `{ x, y }` points are all `fillPoints` reads, whatever its declared `Vector2[]` says.
 */
export interface KeepsakeSurface {
  fillStyle(colour: number, alpha?: number): unknown;
  lineStyle(width: number, colour: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  strokeEllipse(x: number, y: number, width: number, height: number): unknown;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number): unknown;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number): unknown;
  fillPoints(points: readonly { x: number; y: number }[], closeShape?: boolean): unknown;
  strokePoints(points: readonly { x: number; y: number }[], closeShape?: boolean, closePath?: boolean): unknown;
}

/** A pen over one Graphics, in keepsake units, that can draw either the object or its shadow. */
export class KeepsakePen {
  private fillColour = 0;
  private fillAlpha = 1;

  public constructor(
    private readonly g: KeepsakeSurface,
    private readonly cx: number,
    private readonly cy: number,
    private readonly u: number,
    public readonly silhouette: boolean,
    private readonly shadowColour: number,
    private readonly ink: number = PALETTE.ink,
  ) {}

  private X(x: number): number { return this.cx + x * this.u; }
  private Y(y: number): number { return this.cy + y * this.u; }

  /** Detail belongs to the found keepsake only: a silhouette is the outline's mass, nothing more. */
  public detail(draw: () => void): void {
    if (!this.silhouette) draw();
  }

  public fill(colour: number, alpha = 1): this {
    this.fillColour = this.silhouette ? this.shadowColour : colour;
    this.fillAlpha = this.silhouette ? 1 : alpha;
    this.g.fillStyle(this.fillColour, this.fillAlpha);
    return this;
  }

  private outline(width = 3.2): void {
    this.g.lineStyle(width * this.u, this.silhouette ? this.shadowColour : this.ink, 1);
  }

  public disc(x: number, y: number, r: number, edge = true): this {
    this.g.fillCircle(this.X(x), this.Y(y), r * this.u);
    if (edge) { this.outline(); this.g.strokeCircle(this.X(x), this.Y(y), r * this.u); }
    return this;
  }

  public oval(x: number, y: number, rx: number, ry: number, edge = true): this {
    this.g.fillEllipse(this.X(x), this.Y(y), rx * 2 * this.u, ry * 2 * this.u);
    if (edge) { this.outline(); this.g.strokeEllipse(this.X(x), this.Y(y), rx * 2 * this.u, ry * 2 * this.u); }
    return this;
  }

  public box(x: number, y: number, w: number, h: number, r = 4, edge = true): this {
    this.g.fillRoundedRect(this.X(x), this.Y(y), w * this.u, h * this.u, r * this.u);
    if (edge) { this.outline(); this.g.strokeRoundedRect(this.X(x), this.Y(y), w * this.u, h * this.u, r * this.u); }
    return this;
  }

  public poly(points: readonly Point[], edge = true): this {
    const pts = points.map(([x, y]) => ({ x: this.X(x), y: this.Y(y) }));
    this.g.fillPoints(pts, true);
    if (edge) { this.outline(); this.g.strokePoints(pts, true, true); }
    return this;
  }

  /** A straight stick of `width` from one point to another, as a filled quad. */
  public bar(x1: number, y1: number, x2: number, y2: number, width: number, edge = true): this {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len * width / 2, ny = (x2 - x1) / len * width / 2;
    return this.poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], edge);
  }

  public line(points: readonly Point[], width: number, colour: number = this.ink): this {
    this.g.lineStyle(width * this.u, this.silhouette ? this.shadowColour : colour, 1);
    this.g.strokePoints(points.map(([x, y]) => ({ x: this.X(x), y: this.Y(y) })), false, false);
    return this;
  }

  public ring(x: number, y: number, r: number, width: number, colour: number = this.ink): this {
    this.g.lineStyle(width * this.u, this.silhouette ? this.shadowColour : colour, 1);
    this.g.strokeCircle(this.X(x), this.Y(y), r * this.u);
    return this;
  }
}

/** Points round an ellipse arc, for crescents, domes and the rims of cups. */
function arc(x: number, y: number, rx: number, ry: number, from: number, to: number, steps = 14): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + (to - from) * i / steps;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry] as const;
  });
}

/** A four-point glint, the one sparkle any keepsake gets. */
function glint(p: KeepsakePen, x: number, y: number, r: number): void {
  p.fill(SHELL.cream).poly([[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28],
    [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], false);
}

/** A paper act's cutout, mirrored about its fold the way the act opens it. */
function cutout(p: KeepsakePen, shape: PaperShape, colour: number): void {
  const half = PAPER_CONTOURS[shape];
  const k = 0.2;
  const right = half.map(pt => [pt.x * k, pt.y * k] as const);
  const left = [...half].reverse().map(pt => [-pt.x * k, pt.y * k] as const);
  p.fill(shade(colour, -0.3), 0.5).poly([...right, ...left].map(([x, y]) => [x + 3, y + 3] as const), false);
  p.fill(colour).poly([...right, ...left]);
  p.detail(() => p.line([[0, -34], [0, 34]], 1.2, shade(colour, -0.25)));
}

function ribbon(p: KeepsakePen, kit: number, trim: number): void {
  p.fill(kit).poly([[-16, -40], [-2, -40], [6, 4], [-8, 4]]);
  p.fill(shade(kit, -0.2)).poly([[16, -40], [2, -40], [-6, 4], [8, 4]]);
  p.fill(BRASS).disc(0, 16, 22);
  p.detail(() => {
    p.ring(0, 16, 15, 2.2, shade(BRASS, -0.35));
    p.fill(trim).poly([[0, 5], [3.5, 12], [11, 13], [5.5, 18], [7, 26], [0, 22], [-7, 26], [-5.5, 18], [-11, 13], [-3.5, 12]], false);
    glint(p, -12, 6, 5);
  });
}

function slushy(p: KeepsakePen, lap: number): void {
  const look = SLUSHY_LOOKS[lap % SLUSHY_LOOKS.length]!;
  p.fill(0xe9eef2).poly([[-24, -14], [24, -14], [17, 40], [-17, 40]]);
  p.detail(() => {
    p.fill(look.drink).poly([[-21, -8], [21, -8], [16, 35], [-16, 35]], false);
    p.fill(look.deep, 0.6).poly([[8, -8], [21, -8], [16, 35], [6, 35]], false);
    p.fill(look.stripe).poly([[-19, 8], [19, 8], [18, 14], [-18, 14]], false);
  });
  p.fill(0xf7f9fb, 0.9).poly(arc(0, -14, 27, 16, Math.PI, Math.PI * 2));
  p.fill(PALETTE.coral).bar(6, -30, 20, -44, 5);
}

function switchPlate(p: KeepsakePen, lap: number): void {
  const look = LIGHT_LOOKS[lap % LIGHT_LOOKS.length]!;
  p.fill(look.wall).box(-38, -38, 76, 76, 10);
  p.fill(SHELL.cream).box(-22, -32, 44, 64, 7);
  p.detail(() => {
    p.fill(0xd8ccb2).box(-8, -16, 16, 32, 4, false);
    p.fill(SHELL.cream).box(-6, -16, 12, 16, 3);
    p.fill(shade(SHELL.cream, -0.3)).disc(0, -26, 2.2, false).disc(0, 26, 2.2, false);
  });
}

function fruit(p: KeepsakePen, lap: number): void {
  const look = APPLE_LOOKS[lap % APPLE_LOOKS.length]!;
  const skin = look.kind === 'fruit' ? look.skin : look.icing;
  p.fill(0x6b4a2e).bar(0, -22, 4, -40, 4);
  if (lap === 1) {
    // The pear: a narrow shoulder over a round base.
    p.fill(skin).poly([...arc(0, 14, 28, 26, -0.25 * Math.PI, 1.25 * Math.PI, 18), ...arc(0, -16, 13, 12, 0.85 * Math.PI, 2.15 * Math.PI, 10)]);
  } else {
    // Two shoulders under the stem, the dip between them, and the fruit's own width below.
    p.fill(skin).poly([...arc(-11, 0, 24, 30, 1.5 * Math.PI, 0.55 * Math.PI, 12), ...arc(11, 0, 24, 30, 0.45 * Math.PI, -0.5 * Math.PI, 12), [0, -22]]);
  }
  p.fill(0x7fae4f).poly([[4, -30], [22, -40], [26, -28], [10, -24]]);
  p.detail(() => glint(p, -12, -2, 7));
}

type Drawer = (p: KeepsakePen) => void;

const DRAWERS: Readonly<Record<string, Drawer>> = {
  'hammer-lucky-nail': p => {
    const metal = 0xa7afb3;
    p.fill(metal).bar(-26, -26, 26, 26, 8);
    p.fill(metal).poly([[22, 30], [30, 22], [38, 38]]);
    p.fill(shade(metal, 0.15)).bar(-35, -17, -17, -35, 8);
    p.fill(PALETTE.coral).poly([[-14, -2], [-28, -12], [-26, 4]]).poly([[-14, -2], [-2, -16], [-18, -18]]);
    p.detail(() => glint(p, 8, 0, 6));
  },
  'window-squeegee': p => {
    p.fill(0xb67a45).box(-6, -2, 12, 42, 5);
    p.fill(0xb8c4c8).box(-38, -16, 76, 16, 4);
    p.fill(0x2f3d44).box(-40, -2, 80, 7, 3);
    p.detail(() => { glint(p, -24, -32, 7); glint(p, 22, -34, 5); });
  },
  'bug-plum-beetle': p => {
    const look = BUG_LOOKS[0]!;
    p.fill(0x3a2f33).disc(0, -28, 11);
    p.fill(look.body).oval(0, 6, 24, 30);
    p.detail(() => {
      p.line([[0, -22], [0, 34]], 2.2);
      p.fill(look.marking, 0.8).oval(-9, -4, 6, 10, false);
    });
    p.line([[-22, -6], [-34, -14]], 3).line([[22, -6], [34, -14]], 3).line([[-22, 18], [-34, 26]], 3).line([[22, 18], [34, 26]], 3);
  },
  'bug-ladybird': p => {
    const look = BUG_LOOKS[1]!;
    p.fill(0x2a2426).disc(0, -26, 12);
    p.fill(look.body).oval(0, 6, 28, 30);
    p.detail(() => {
      p.line([[0, -22], [0, 36]], 2.2);
      p.fill(look.marking).disc(-12, -4, 5, false).disc(12, -4, 5, false).disc(-10, 16, 4.5, false).disc(10, 16, 4.5, false);
      p.fill(SHELL.cream).disc(-5, -30, 2.4, false).disc(5, -30, 2.4, false);
    });
  },
  'saw-pine-round': p => {
    p.fill(0x7a5234).disc(0, 0, 38);
    p.fill(0xe3b77b).disc(0, 0, 32);
    p.detail(() => {
      for (const r of [8, 15, 22, 28]) p.ring(1, -1, r, 1.4, 0xb98450);
      p.line([[4, -4], [26, -14]], 2, 0x9a6a3e);
    });
  },
  'tomato-slice': p => {
    p.fill(0xc93a2c).disc(0, 0, 38);
    p.fill(0xe8624f).disc(0, 0, 32, false);
    p.detail(() => {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        p.fill(0xf6b39a).oval(Math.cos(a) * 17, Math.sin(a) * 17, 9, 7, false);
        p.fill(0xf5e2a8).disc(Math.cos(a) * 17, Math.sin(a) * 17, 2.4, false);
      }
      p.fill(0xf08a74).disc(0, 0, 6, false);
    });
  },
  'curl-coach-ribbon': p => ribbon(p, CURL_LOOKS[0]!.kit, CURL_LOOKS[0]!.kitTrim),
  'curl-sprinter-ribbon': p => ribbon(p, CURL_LOOKS[1]!.kit, CURL_LOOKS[1]!.kitTrim),
  'cucumber-coin': p => {
    p.fill(0x3f6f3a).disc(0, 0, 36);
    p.fill(0xcfe3a4).disc(0, 0, 31, false);
    p.detail(() => {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        p.fill(0xf1f5dc).oval(Math.cos(a) * 14, Math.sin(a) * 14, 3.2, 5.2, false);
      }
      p.fill(0xe3edc2).disc(0, 0, 7, false);
    });
  },
  'banana-sticker': p => {
    p.fill(SHELL.cream).oval(0, 0, 40, 28);
    p.fill(0x3a6fb0).oval(0, 0, 35, 23, false);
    p.detail(() => {
      p.fill(0xf2cf4a).poly([...arc(0, -8, 24, 22, 0.15 * Math.PI, 0.85 * Math.PI), ...arc(0, -14, 18, 18, 0.8 * Math.PI, 0.2 * Math.PI)]);
      glint(p, 22, -12, 5);
    });
  },
  'paper-star': p => cutout(p, 'star', SHELL.cream),
  'paper-butterfly': p => cutout(p, 'butterfly', 0xf2c8a0),
  'egg-painted': p => {
    p.fill(0xf3e6cf).oval(0, 2, 28, 36);
    p.detail(() => {
      p.line([[-26, -2], [-17, -10], [-8, -2], [1, -10], [10, -2], [19, -10], [27, -2]], 3.2, PALETTE.coral);
      for (const x of [-16, -4, 8, 20]) p.fill(0x2e9c8e).disc(x, 14, 3, false);
      glint(p, -12, -20, 6);
    });
  },
  'bubble-square': p => {
    p.fill(0xdcecf2, 0.95).box(-38, -38, 76, 76, 8);
    p.detail(() => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const x = -24 + c * 24, y = -24 + r * 24;
        const popped = r === 1 && c === 2;
        p.fill(popped ? 0xc6dbe3 : 0xf4fafc).disc(x, y, 9, !popped);
        if (!popped) p.fill(0xffffff).disc(x - 3, y - 3, 2.6, false);
      }
    });
  },
  'light-salon-switch': p => switchPlate(p, 0),
  'light-kitchen-switch': p => switchPlate(p, 1),
  'doorbell-ginger-bell': p => {
    const ginger = 0xe0873a;
    p.fill(ginger).poly([[-24, -20], [-20, -40], [-8, -28]]).poly([[24, -20], [20, -40], [8, -28]]);
    p.fill(ginger).oval(0, -10, 26, 22);
    p.fill(PALETTE.coral).box(-20, 8, 40, 7, 3);
    p.fill(BRASS).disc(0, 24, 10);
    p.detail(() => {
      p.fill(PALETTE.ink).oval(-9, -12, 3, 4.5, false).oval(9, -12, 3, 4.5, false);
      p.fill(0xe77a86).poly([[-3, -4], [3, -4], [0, -1]], false);
      p.line([[0, 22], [0, 30]], 2, shade(BRASS, -0.45));
      p.fill(0xf6c28e).poly([[-18, -25], [-19, -35], [-12, -28]], false).poly([[18, -25], [19, -35], [12, -28]], false);
    });
  },
  'doorbell-crimson-knocker': p => {
    const look = DOOR_LOOKS[1]!;
    p.fill(look.door).box(-32, -40, 64, 80, 6);
    p.detail(() => {
      p.fill(look.doorShade).box(-24, -32, 48, 26, 4, false).box(-24, 4, 48, 28, 4, false);
      p.fill(look.hardware).disc(0, -12, 6);
      p.ring(0, 6, 13, 4.5, look.hardware);
      glint(p, -6, -16, 4);
    });
  },
  'roller-swatch': p => {
    p.fill(SHELL.cream).box(-24, -40, 48, 80, 5);
    p.detail(() => {
      p.fill(PALETTE.coral).box(-18, -32, 36, 18, 2, false);
      p.fill(SHELL.sun).box(-18, -10, 36, 18, 2, false);
      p.fill(0x2e9c8e).box(-18, 12, 36, 18, 2, false);
      p.fill(0x6b5b4e).disc(0, 34, 2.5, false);
    });
  },
  'bell-desk-bell': p => {
    p.fill(0x4a3a33).oval(0, 26, 38, 10);
    p.fill(BRASS).poly([...arc(0, 22, 30, 36, Math.PI, Math.PI * 2)]);
    p.fill(shade(BRASS, -0.2)).bar(0, -14, 0, -26, 6);
    p.fill(shade(BRASS, 0.2)).oval(0, -28, 8, 3);
    p.detail(() => glint(p, -12, 4, 7));
  },
  'balloon-red': p => {
    p.line([[0, 26], [-6, 34], [4, 40], [-2, 46]], 2, 0x6b5b4e);
    p.fill(0xd63c34).poly([[0, 20], [-5, 28], [5, 28]]);
    p.fill(0xd63c34).oval(0, -8, 26, 32);
    p.detail(() => p.fill(0xf29a8f).oval(-10, -20, 6, 10, false));
  },
  'stapler-note': p => {
    p.fill(SHELL.cream).poly([[-34, -30], [30, -38], [36, 32], [-28, 38]]);
    p.detail(() => {
      for (const y of [-10, 2, 14]) p.line([[-22, y + 2], [24, y - 4]], 1.8, 0x9ab0c2);
      p.fill(0x9aa3a8).bar(-14, -28, 12, -31, 4.5);
    });
  },
  'fisherman-lure': p => {
    p.line([[34, 4], [42, 12], [38, 22], [32, 16]], 2.4, 0x5b6468);
    p.fill(BRASS).poly([[24, 0], [38, -12], [38, 12]]);
    p.fill(BRASS).oval(-4, 0, 30, 15);
    p.detail(() => {
      p.fill(PALETTE.coral).disc(-20, -2, 4.5);
      p.fill(PALETTE.ink).disc(-20, -2, 1.8, false);
      p.line([[-4, -10], [2, 0], [-4, 10]], 1.8, shade(BRASS, -0.4));
      glint(p, 6, -6, 5);
    });
  },
  'scratch-record': p => {
    p.fill(0x1f1c22).disc(0, 0, 40);
    p.detail(() => {
      for (const r of [22, 28, 34]) p.ring(0, 0, r, 1.1, 0x3b3642);
      p.fill(PALETTE.coral).disc(0, 0, 14, false);
      p.fill(SHELL.cream).disc(0, 0, 3, false);
      glint(p, -20, -20, 5);
    });
  },
  'trombone-mouthpiece': p => {
    p.fill(BRASS).poly([[-10, -8], [30, -3], [30, 3], [-10, 8]]);
    p.fill(BRASS).oval(-22, 0, 10, 20);
    p.fill(shade(BRASS, -0.25)).oval(-20, 0, 5, 12, false);
    p.detail(() => glint(p, 8, -10, 5));
  },
  'clap-encore-ticket': p => {
    p.fill(PALETTE.coral).box(-40, -22, 80, 44, 4);
    p.detail(() => {
      p.fill(SHELL.cream).disc(-40, 0, 7, false).disc(40, 0, 7, false);
      for (let y = -18; y <= 18; y += 6) p.fill(SHELL.cream).disc(14, y, 1.3, false);
      p.fill(SHELL.cream).poly([[-12, -12], [-9, -4], [-1, -4], [-7, 1], [-5, 9], [-12, 4], [-19, 9], [-17, 1], [-23, -4], [-15, -4]], false);
    });
  },
  'snare-sticks': p => {
    const wood = 0xd2a66b;
    p.fill(wood).bar(-34, 30, 26, -30, 7);
    p.fill(wood).bar(34, 30, -26, -30, 7);
    p.fill(shade(wood, 0.2)).oval(28, -32, 6, 5).oval(-28, -32, 6, 5);
  },
  'bongos-charm': p => {
    p.line([[-14, -34], [0, -42], [14, -34]], 2.4, 0x6b4a2e);
    p.fill(0xb5653a).box(-34, -20, 30, 44, 6);
    p.fill(0xa45a33).box(4, -14, 26, 38, 6);
    p.fill(0xf1dfc0).oval(-19, -20, 15, 6).oval(17, -14, 13, 5);
    p.detail(() => {
      p.line([[-34, 2], [-4, 2]], 2, 0x6e3b22);
      p.line([[4, 6], [30, 6]], 2, 0x6e3b22);
    });
  },
  'slushy-berry-cup': p => slushy(p, 0),
  'slushy-blue-cup': p => slushy(p, 1),
  'apple-shiny': p => fruit(p, 0),
  'apple-pear': p => fruit(p, 1),
  'hammer-brass-head': p => {
    const look = HAMMER_LOOKS[1]!;
    p.fill(look.head).box(-34, -20, 56, 26, 5);
    p.fill(look.handle).box(-6, -6, 14, 44, 4);
    p.detail(() => glint(p, -18, -12, 5));
  },
  'window-harbour-frame': p => {
    const look = WINDOW_LOOKS[1]!;
    p.fill(look.frame).box(-34, -32, 68, 64, 6);
    p.fill(look.sky).box(-26, -24, 52, 48, 3);
    p.detail(() => {
      p.fill(0xf7f4ea).poly([[-2, 2], [16, 2], [4, -18]], false);
      p.fill(0xc4493a).box(-16, 4, 30, 8, 2, false);
    });
  },
  'saw-cherry-round': p => {
    const look = SAW_LOOKS[1]!;
    p.fill(look.grain).disc(0, 0, 38);
    p.fill(look.sapwood).disc(0, 0, 32);
    p.detail(() => {
      for (const r of [8, 15, 22, 28]) p.ring(1, -1, r, 1.4, look.kerf);
    });
  },
  'tomato-gold-slice': p => {
    const look = TOMATO_LOOKS[1]!;
    p.fill(look.skin).disc(0, 0, 38);
    p.fill(look.flesh).disc(0, 0, 32, false);
    p.detail(() => {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        p.fill(look.locule).oval(Math.cos(a) * 16, Math.sin(a) * 16, 8, 6, false);
        p.fill(look.seed).disc(Math.cos(a) * 16, Math.sin(a) * 16, 2.2, false);
      }
    });
  },
  'cucumber-dark-coin': p => {
    const look = CUCUMBER_LOOKS[1]!;
    p.fill(look.skin).disc(0, 0, 36);
    p.fill(look.flesh).disc(0, 0, 30, false);
    p.detail(() => {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        p.fill(look.seed).oval(Math.cos(a) * 14, Math.sin(a) * 14, 3, 5, false);
      }
    });
  },
  'banana-green-sticker': p => {
    const look = BANANA_LOOKS[1]!;
    p.fill(SHELL.cream).oval(0, 0, 40, 28);
    p.fill(0x3a6fb0).oval(0, 0, 35, 23, false);
    p.detail(() => {
      p.fill(look.peel).poly([...arc(0, -8, 24, 22, 0.15 * Math.PI, 0.85 * Math.PI), ...arc(0, -14, 18, 18, 0.8 * Math.PI, 0.2 * Math.PI)], false);
    });
  },
  'egg-brown': p => {
    const look = EGG_LOOKS[1]!;
    p.fill(look.shell).oval(0, 2, 26, 36);
    p.detail(() => {
      for (const [x, y] of [[-10, -8], [6, -14], [-4, 8], [12, 6], [-14, 16]] as const) p.fill(look.speck).disc(x, y, 2.2, false);
      glint(p, -8, -18, 5);
    });
  },
  'bubble-pink-square': p => {
    const look = BUBBLE_LOOKS[1]!;
    p.fill(look.sheet).box(-36, -36, 72, 72, 8);
    p.detail(() => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        p.fill(look.highlight).disc(-22 + c * 22, -22 + r * 22, 8, false);
      }
    });
  },
  'roller-sage-swatch': p => {
    const look = ROLLER_LOOKS[1]!;
    p.fill(look.wall).box(-22, -38, 44, 76, 5);
    p.detail(() => {
      p.fill(0x3d8f4a).poly([[0, -28], [16, 4], [-16, 4]], false);
      p.fill(0x8a5a32).box(-4, 4, 8, 22, 2, false);
    });
  },
  'bell-brass-bell': p => {
    const look = BELL_LOOKS[1]!;
    p.fill(0x4a3a33).oval(0, 26, 36, 10);
    p.fill(look.metal).poly([...arc(0, 20, 28, 34, Math.PI, Math.PI * 2)]);
    p.fill(shade(look.metal, -0.25)).bar(0, -14, 0, -26, 6);
    p.detail(() => glint(p, -10, 2, 6));
  },
  'balloon-teal': p => {
    const colour = BALLOON_LOOKS[1]!.balloons[1];
    p.line([[0, 24], [-6, 32], [4, 38]], 2, 0x6b5b4e);
    p.fill(colour).poly([[0, 16], [-5, 24], [5, 24]]);
    p.fill(colour).oval(0, -8, 24, 30);
    p.detail(() => p.fill(0xffffff, 0.7).oval(-8, -18, 5, 8, false));
  },
  'stapler-teal': p => {
    const look = STAPLER_LOOKS[1]!;
    p.fill(0x2f3238).box(-28, 8, 56, 14, 3);
    p.fill(look.body).poly([[-30, 6], [28, 6], [22, -22], [-18, -22]]);
    p.detail(() => p.fill(look.highlight).poly([[-16, -4], [16, -4], [12, -16], [-12, -16]], false));
  },
  'fisherman-navy-mac': p => {
    const look = FISHERMAN_LOOKS[1]!;
    p.fill(look.coat).poly([[-22, 36], [22, 36], [28, -8], [-28, -8]]);
    p.fill(look.hat).oval(0, -22, 28, 10);
    p.fill(look.hat).box(-16, -36, 32, 16, 4);
    p.detail(() => p.fill(look.scarf).box(-18, -4, 36, 8, 3, false));
  },
  'scratch-amber-label': p => {
    const look = SCRATCH_LOOKS[1]!;
    p.fill(0x1f1c22).disc(0, 0, 38);
    p.detail(() => {
      p.ring(0, 0, 28, 1.2, 0x3b3642);
      p.fill(look.warm).disc(0, 0, 14, false);
      p.fill(look.band).disc(0, 0, 4, false);
    });
  },
  'trombone-silver-horn': p => {
    const look = TROMBONE_LOOKS[1]!;
    p.fill(look.brass).poly([[-8, -8], [28, -4], [28, 4], [-8, 8]]);
    p.fill(look.brass).oval(-20, 0, 10, 18);
    p.detail(() => glint(p, 6, -8, 5));
  },
  'clap-plum-cuffs': p => {
    const look = CLAP_LOOKS[1]!;
    p.fill(look.sleeve).poly([[-36, 20], [-8, 20], [-4, -28], [-32, -20]]);
    p.fill(look.sleeve).poly([[36, 20], [8, 20], [4, -28], [32, -20]]);
    p.fill(look.skin).oval(-18, -24, 12, 10);
    p.fill(look.skin).oval(18, -24, 12, 10);
    p.detail(() => {
      p.fill(look.cuff).box(-30, 6, 20, 8, 2, false);
      p.fill(look.cuff).box(10, 6, 20, 8, 2, false);
    });
  },
  'snare-blue-shell': p => {
    const look = SNARE_LOOKS[1]!;
    p.fill(look.shell).oval(0, 8, 34, 22);
    p.fill(look.shellLit).oval(0, -4, 34, 16);
    p.fill(0xfaf0d9).oval(0, -10, 28, 10);
    p.detail(() => p.fill(look.shellShine).box(-30, -2, 8, 16, 2, false));
  },
  'bongos-walnut': p => {
    const look = BONGO_LOOKS[1]!;
    p.fill(look.left).box(-34, -16, 30, 42, 6);
    p.fill(look.right).box(4, -10, 28, 36, 6);
    p.fill(0xe8c68d).oval(-19, -16, 14, 6);
    p.fill(0xe8c68d).oval(18, -10, 13, 5);
    p.detail(() => {
      p.line([[-32, 4], [-6, 4]], 2, look.stave);
      p.line([[6, 8], [30, 8]], 2, look.stave);
    });
  },
};

/** Whether a keepsake has a drawing. The test that asks this is what keeps a new entry honest. */
export function hasKeepsakeArt(id: string): boolean {
  return id in DRAWERS;
}

/** The tone a silhouette is filled with: the paper, pressed a little into the page. */
export function silhouetteTone(paper: number, ink: number): number {
  return mix(paper, ink, 0.2);
}

/** Draw one keepsake centred at (x, y), `size` across. A missing drawing draws nothing. */
export function drawKeepsake(
  g: KeepsakeSurface, id: string, x: number, y: number, size: number,
  silhouette: boolean, paper: number = SHELL.cream,
): void {
  const draw = DRAWERS[id];
  if (!draw) return;
  draw(new KeepsakePen(g, x, y, size / 100, silhouette, silhouetteTone(paper, PALETTE.ink)));
}
