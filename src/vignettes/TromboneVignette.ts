import type Phaser from 'phaser';
import { shade } from '@/ui/colour';
import { castShadow, faces } from '@/ui/light';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import {
  blow, carryNotes, curtainOpen, noteFor, slideTravel, soundedNotes, TROMBONE_MOTION, tromboneFinale, type TromboneFinale,
} from './tromboneMotion';
import { tromboneLook, type TromboneLook } from './tromboneLooks';
import { clamp01, easeOut } from './motion';

/** The rooftop's palette at dusk. The ink is deep enough that dressed type takes no outline. */
export const ROOFTOP = { ink: 0x2b2a3d, sky: 0x4a4f7a, glow: 0xf2a65a, brick: 0x8a4b3c } as const;
/** The player stands on the roof behind the parapet; the horn is drawn from wherever his lips end up. */
const FEET = { x: -204, y: 172 } as const;
const PARAPET_TOP = 186;
/**
 * The horn in its own frame, from the mouthpiece: u forward along the bell section, v
 * down. The bell section runs over the top to the flare; the slide hangs below it and
 * its crook goes out past the bell on the second note.
 */
const HORN = { flareFrom: 168, bell: 262, bellR: 46, slideUpper: 20, slideLower: 44, crookRest: 178, crookTravel: 118 } as const;
const WINDOW = { x: 250, y: -34, w: 150, h: 170 } as const;
interface TromboneKit {
  readonly skin: ReturnType<typeof faces>;
  readonly shirt: ReturnType<typeof faces>;
  readonly stripe: number;
  readonly braces: ReturnType<typeof faces>;
  readonly trousers: ReturnType<typeof faces>;
  readonly cap: ReturnType<typeof faces>;
  readonly tie: number;
  readonly shoe: ReturnType<typeof faces>;
  readonly hair: number;
  readonly brass: ReturnType<typeof faces>;
}

type Point = readonly [number, number];
interface Figure {
  readonly lips: Point;
  readonly elbowNear: Point;
  readonly elbowFar: Point;
}

/**
 * A trombonist on a rooftop, one note per beat. The two recorded notes alternate, so the
 * slide moves between first position and an extended one on every beat, and the cheeks
 * fill and let go with each. Landed notes open the curtain across the way; a clean round
 * ends in a flourish and a neighbour applauding, a rough one in a sagging slide and
 * slammed shutters.
 */
export class TromboneVignette extends HouseholdVignette {
  /** Which horn, and who is playing it. The slide does not change. */
  private readonly kit: TromboneKit;
  /**
   * Notes that sounded in the tasks before this one. The engine hands out the two takes
   * in level order, so the slide has to keep the same count across tasks to show the
   * note being heard.
   */
  private notesBefore = 0;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0x3f4468, 0xf2a65a);
    const look: TromboneLook = tromboneLook(lap);
    this.kit = {
      skin: faces(look.skin), shirt: faces(look.shirt), stripe: look.stripe, braces: faces(look.braces),
      trousers: faces(look.trousers), cap: faces(look.cap), tie: look.tie, shoe: faces(look.shoe),
      hair: look.hair, brass: faces(look.brass),
    };
  }

  public override reset(plan: RoundPlan): void {
    const previous = this.plan ? this.actionCues(this.plan).length + this.plan.targets.length : 0;
    const fresh = this.phase === 'paused' || this.phase === 'idle';
    this.notesBefore = carryNotes(this.notesBefore, previous, fresh);
    super.reset(plan);
  }

  private actionCues(plan: RoundPlan): number[] {
    return plan.cues.filter(cue => cue.kind === 'action').map(cue => cue.time);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const finale = tromboneFinale(ending, this.successful, this.still);
    // The note being heard: which take the engine reached, and when it started.
    const sounded = this.plan ? soundedNotes(this.actionCues(this.plan), this.plan.targets, now) : { count: 0, lastAt: -Infinity };
    const index = this.notesBefore + sounded.count - 1;
    const current = index >= 0 ? noteFor(index) : 0;
    const previous = index >= 1 ? noteFor(index - 1) : current;
    const age = now - sounded.lastAt;
    const travel = slideTravel(age, beat);
    const extension = TROMBONE_MOTION.positions[previous] + (TROMBONE_MOTION.positions[current] - TROMBONE_MOTION.positions[previous]) * travel;
    const puff = ending >= 0 ? (this.successful ? 0.5 * (1 - finale.flourish) : 1 - finale.droop) : blow(age, beat);
    const hits = this.watching ? this.demoTimes.length : this.hitTimes.length;
    const curtain = curtainOpen(hits, this.plan?.targets.length ?? 4);
    const jolt = !this.still && now - this.errorAt < 0.25 ? Math.sin((now - this.errorAt) * 60) * (1 - (now - this.errorAt) / 0.25) * 4 : 0;

    this.rooftop(g, now, finale);
    this.acrossTheWay(g, curtain, finale, now);
    const figure = this.player(g, puff, finale, jolt, now);
    const bell = this.horn(g, figure, extension, finale, jolt);
    this.parapet(g);
    this.bellSound(g, bell, age, ending, finale);
    this.notes(g, bell, now, ending);
    if (finale.burst > 0) this.burst(g, bell, finale.burst, now);
    if (finale.neighbour > 0.9 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.8) / 0.8) * Math.PI);
      sparkle(g, WINDOW.x - 60, WINDOW.y - 120, 12 * a, a);
      sparkle(g, WINDOW.x + 80, WINDOW.y - 90, 10 * a, a);
    }
  }

  // ------------------------------------------------------------------ The place

  /** Dusk over the rooftops: sky, a skyline, the roof and a chimney with a pigeon on it. */
  private rooftop(g: Phaser.GameObjects.Graphics, now: number, finale: TromboneFinale): void {
    slab(g, -346, -246, 692, 490, ROOFTOP.sky, 22, ROOFTOP.ink);
    // A warm band low on the sky, and the sun's last glow behind the buildings.
    g.fillStyle(0x7a5a8a, 0.7).fillRect(-340, -100, 680, 150);
    g.fillStyle(ROOFTOP.glow, 0.35).fillEllipse(-60, 60, 520, 120);
    g.fillStyle(0xf6d6a0, 0.5).fillEllipse(-60, 64, 300, 50);
    // Stars, brighter as the round lands.
    g.fillStyle(0xfff3cf, 0.6 + finale.neighbour * 0.4);
    for (const [x, y, r] of [[-300, -210, 2], [-230, -170, 1.5], [-120, -220, 2], [40, -200, 1.5], [150, -230, 2], [300, -200, 1.5], [-20, -160, 1.2], [90, -150, 1.2]] as const) {
      g.fillCircle(x, y + (this.still ? 0 : Math.sin(now * 2 + x) * 1), r);
    }
    // The skyline: blocks with a few lit windows.
    g.fillStyle(0x3c3a5c);
    for (const [x, w, h] of [[-346, 90, 140], [-256, 60, 90], [-196, 80, 170], [-116, 70, 110], [-46, 50, 150], [4, 90, 100], [94, 60, 130], [154, 100, 180], [254, 92, 120]] as const) {
      g.fillRect(x, 70 - h, w, h + 120);
    }
    g.fillStyle(0xf6d6a0, 0.7);
    for (let i = 0; i < 14; i++) g.fillRect(-330 + i * 48 + (i % 3) * 7, -10 + (i % 4) * 26, 8, 11);
    // The roof: a dark felt surface the player stands on, the parapet drawn later in front of his shins.
    g.fillStyle(0x2f2d45).fillRect(-346, FEET.y - 8, 692, 244 - FEET.y + 8);
    g.fillStyle(0x3a3852, 0.8).fillRect(-346, FEET.y - 8, 692, 6);
    // A chimney with a cap, and a pigeon on it that watches the whole performance.
    const brick = faces(ROOFTOP.brick);
    g.fillStyle(brick.shade).fillRect(-330, 56, 44, FEET.y - 56);
    g.fillStyle(brick.face).fillRect(-330, 56, 30, FEET.y - 56);
    g.lineStyle(1.2, brick.edge, 0.5);
    for (let r = 0; r < 6; r++) g.lineBetween(-330, 70 + r * 18, -286, 70 + r * 18);
    g.fillStyle(0x5a5a66).fillRoundedRect(-338, 48, 60, 14, 3);
    this.pigeon(g, -312, 46, finale, now);
  }

  /** The parapet in front of the player: coping, brick courses, a cast shadow up the wall. */
  private parapet(g: Phaser.GameObjects.Graphics): void {
    const brick = faces(ROOFTOP.brick);
    g.fillStyle(brick.face).fillRoundedRect(-346, PARAPET_TOP, 692, 244 - PARAPET_TOP, { tl: 0, tr: 0, br: 22, bl: 22 });
    g.lineStyle(1.5, brick.edge, 0.6);
    for (let r = 0; r < 3; r++) {
      g.lineBetween(-346, PARAPET_TOP + 22 + r * 18, 346, PARAPET_TOP + 22 + r * 18);
      for (let c = 0; c < 12; c++) g.lineBetween(-330 + c * 58 + (r % 2) * 29, PARAPET_TOP + 4 + r * 18, -330 + c * 58 + (r % 2) * 29, PARAPET_TOP + 22 + r * 18);
    }
    g.fillStyle(brick.lit).fillRoundedRect(-346, PARAPET_TOP - 4, 692, 10, 3);
    g.fillStyle(brick.edge, 0.7).fillRect(-346, PARAPET_TOP + 6, 692, 4);
    g.fillStyle(0xffffff, 0.12).fillRect(-346, PARAPET_TOP - 4, 692, 3);
  }

  /** The window across the way: a curtain that opens with the landed notes, shutters that slam on a rough round, and a neighbour. */
  private acrossTheWay(g: Phaser.GameObjects.Graphics, curtain: number, finale: TromboneFinale, now: number): void {
    const { x, y, w, h } = WINDOW;
    const frame = faces(0xe7dccb);
    g.fillStyle(0x6a4b3c).fillRoundedRect(x - w / 2 - 22, y - h / 2 - 22, w + 44, h + 60, 6);
    g.fillStyle(0x7a5a49, 0.6);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) g.fillRect(x - w / 2 - 20 + c * 48 + (r % 2) * 24, y - h / 2 - 20 + r * 38, 22, 14);
    // The room behind: warm, with a lamp and a picture, seen through the gap in the curtain.
    g.fillStyle(0xf2c079).fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle(0xd88a4a, 0.6).fillRect(x - w / 2, y + h / 2 - 50, w, 50);
    g.fillStyle(0x6a3a2a).fillRoundedRect(x - 40, y - 60, 40, 34, 3);
    g.fillStyle(0x9fc0d8).fillRoundedRect(x - 36, y - 56, 32, 26, 2);
    g.fillStyle(0xfff3cf).fillTriangle(x + 34, y - 30, x + 62, y - 30, x + 48, y - 56);
    g.lineStyle(3, 0x6a3a2a).lineBetween(x + 48, y - 30, x + 48, y + 20);
    // The neighbour rises behind the sill and applauds.
    if (finale.neighbour > 0) this.neighbour(g, x + 6, y + h / 2 + 30 - finale.neighbour * 110, now);
    // Two curtains, drawn from the edges toward the middle; each landed note draws them further apart.
    const gap = 6 + curtain * (w / 2 - 6);
    const cloth = faces(0xb04a5a);
    for (const side of [-1, 1] as const) {
      const from = x + side * gap, to = x + side * w / 2;
      const left = Math.min(from, to), width = Math.abs(to - from);
      g.fillStyle(cloth.face).fillRect(left, y - h / 2, width, h);
      g.fillStyle(cloth.shade, 0.7);
      for (let f = 0; f < Math.floor(width / 14); f++) g.fillRect(left + f * 14 + 8, y - h / 2, 4, h);
      g.fillStyle(cloth.lit, 0.5).fillRect(side < 0 ? left + 2 : left + width - 8, y - h / 2, 4, h);
    }
    g.lineStyle(4, 0x8a6a3a).lineBetween(x - w / 2 - 8, y - h / 2 - 4, x + w / 2 + 8, y - h / 2 - 4);
    // The sill with a plant pot and the sash frame.
    g.fillStyle(frame.face).fillRect(x - w / 2 - 8, y - h / 2 - 8, w + 16, 8).fillRect(x - w / 2 - 8, y - h / 2, 8, h).fillRect(x + w / 2, y - h / 2, 8, h);
    g.fillStyle(frame.shade).fillRect(x - 3, y - h / 2, 6, h).fillRect(x - w / 2, y - 4, w, 6);
    g.fillStyle(frame.lit).fillRect(x - w / 2 - 12, y + h / 2, w + 24, 12);
    g.fillStyle(frame.shade).fillRect(x - w / 2 - 12, y + h / 2 + 12, w + 24, 5);
    g.fillStyle(0xcf8263).fillRoundedRect(x + w / 2 - 34, y + h / 2 - 24, 26, 24, 3);
    g.fillStyle(0x5b9479).fillEllipse(x + w / 2 - 21, y + h / 2 - 30, 30, 18);
    g.fillStyle(0x8cb68b).fillEllipse(x + w / 2 - 28, y + h / 2 - 36, 14, 10);
    // The shutters, folded back beside the frame, slam across it on a rough round.
    const shut = faces(0x4f6e5a);
    for (const side of [-1, 1] as const) {
      const width = 12 + finale.shutters * (w / 2 - 6);
      const left = side < 0 ? x - w / 2 - 20 : x + w / 2 + 8 - finale.shutters * (w / 2 - 6);
      g.fillStyle(shut.face).fillRoundedRect(left, y - h / 2 - 6, width, h + 12, 3);
      g.fillStyle(shut.shade, 0.8);
      for (let l = 0; l < 9; l++) g.fillRect(left + 3, y - h / 2 + 4 + l * 18, width - 6, 6);
      g.lineStyle(2, shut.edge).strokeRoundedRect(left, y - h / 2 - 6, width, h + 12, 3);
    }
  }

  /** Head and shoulders in a cardigan, hands up and clapping. */
  private neighbour(g: Phaser.GameObjects.Graphics, x: number, y: number, now: number): void {
    const skin = faces(0xf0c8a8), cardigan = faces(0x5a7fa6);
    const clap = this.still ? 0 : (Math.sin(now * 14) + 1) / 2;
    g.fillStyle(cardigan.face).fillRoundedRect(x - 44, y - 30, 88, 80, 20);
    g.fillStyle(cardigan.shade).fillRoundedRect(x + 20, y - 30, 24, 80, { tl: 4, tr: 20, br: 4, bl: 4 });
    g.lineStyle(14, cardigan.face).lineBetween(x - 36, y - 20, x - 60 + clap * 10, y - 80).lineBetween(x + 36, y - 20, x + 60 - clap * 10, y - 80);
    g.fillStyle(skin.face).fillCircle(x - 60 + clap * 12, y - 88, 11).fillCircle(x + 60 - clap * 12, y - 88, 11);
    g.fillStyle(skin.face).fillRoundedRect(x - 24, y - 84, 48, 56, 18);
    g.fillStyle(skin.shade, 0.7).fillRoundedRect(x + 10, y - 84, 14, 56, { tl: 4, tr: 18, br: 18, bl: 4 });
    g.fillStyle(0xd8d2c4).fillRoundedRect(x - 26, y - 92, 52, 22, 10);
    g.fillStyle(0xd8d2c4).fillCircle(x, y - 96, 16);
    g.lineStyle(2.5, ROOFTOP.ink).strokeCircle(x - 9, y - 62, 7).strokeCircle(x + 9, y - 62, 7).lineBetween(x - 2, y - 62, x + 2, y - 62);
    g.fillStyle(ROOFTOP.ink).fillCircle(x - 8, y - 61, 2).fillCircle(x + 10, y - 61, 2);
    g.lineStyle(2.5, 0x9c5a4a).beginPath().arc(x, y - 46, 8, 0.2, Math.PI - 0.2, false).strokePath();
    g.fillStyle(0xd98a8a, 0.5).fillEllipse(x - 16, y - 50, 9, 5).fillEllipse(x + 16, y - 50, 9, 5);
  }

  /** A pigeon on the chimney cap. It bobs to the notes and takes off at the flourish. */
  private pigeon(g: Phaser.GameObjects.Graphics, x: number, y: number, finale: TromboneFinale, now: number): void {
    const fly = finale.flourish;
    const px = x + fly * 120, py = y - fly * 160 + (this.still ? 0 : Math.sin(now * 3) * 2);
    const flap = fly > 0 && !this.still ? Math.sin(now * 22) * 12 : 0;
    g.fillStyle(0x8a8a96).fillEllipse(px, py - 10, 26, 18);
    g.fillStyle(0xa9a9b4).fillEllipse(px - 4, py - 13, 14, 9);
    g.fillStyle(0x6f6f7c).fillTriangle(px - 12, py - 10, px - 24, py - 4 - flap * 0.3, px - 22, py - 14);
    if (fly > 0) g.fillStyle(0x9a9aa6).fillTriangle(px - 4, py - 14, px + 6, py - 14, px - 2, py - 30 - flap);
    g.fillStyle(0x5f6f8a).fillCircle(px + 10, py - 18, 7);
    g.fillStyle(0xf1c04f).fillTriangle(px + 15, py - 18, px + 22, py - 16, px + 15, py - 14);
    g.fillStyle(0xffffff).fillCircle(px + 11, py - 19, 2.2);
    g.fillStyle(ROOFTOP.ink).fillCircle(px + 12, py - 19, 1.2);
    if (fly === 0) g.lineStyle(2, 0xd9534f).lineBetween(px - 4, py - 1, px - 4, py + 4).lineBetween(px + 4, py - 1, px + 4, py + 4);
  }

  // ------------------------------------------------------------------ The player

  /**
   * The trombonist from the side, facing across the way; the cheeks fill with the note.
   * Returns where the mouthpiece meets his lips and where his elbows are, so the horn
   * can be drawn from the one and the forearms brought to the other.
   */
  private player(g: Phaser.GameObjects.Graphics, puff: number, finale: TromboneFinale, jolt: number, now: number): Figure {
    const { skin, shirt, braces, trousers, cap, shoe } = this.kit;
    const lean = finale.flourish * 0.22 - finale.droop * 0.1;
    const hipX = FEET.x + 6, hipY = FEET.y - 66;
    const shoulderX = hipX - Math.sin(lean) * 70, shoulderY = hipY - Math.cos(lean) * 70;
    const headX = shoulderX - Math.sin(lean) * 40 + jolt, headY = shoulderY - Math.cos(lean) * 40;
    const drop = castShadow(26);
    g.fillStyle(ROOFTOP.ink, drop.alpha + 0.1).fillEllipse(FEET.x + drop.dx * 0.4, FEET.y + 2, 120, 12);
    // Trousers, a lit crease down the front leg, shoes turned toward the audience across the way.
    g.lineStyle(24, trousers.shade).lineBetween(hipX - 10, hipY, FEET.x - 20, FEET.y - 12);
    g.lineStyle(24, trousers.face).lineBetween(hipX + 10, hipY, FEET.x + 18, FEET.y - 12);
    g.lineStyle(4, trousers.lit, 0.6).lineBetween(hipX + 6, hipY + 8, FEET.x + 12, FEET.y - 18);
    g.fillStyle(shoe.face).fillRoundedRect(FEET.x - 36, FEET.y - 16, 38, 16, { tl: 6, tr: 6, br: 4, bl: 4 });
    g.fillStyle(shoe.face).fillRoundedRect(FEET.x + 2, FEET.y - 16, 44, 16, { tl: 6, tr: 10, br: 4, bl: 4 });
    g.fillStyle(shoe.lit, 0.7).fillEllipse(FEET.x + 36, FEET.y - 10, 12, 6).fillEllipse(FEET.x - 6, FEET.y - 10, 10, 5);
    // The shirt, striped, with braces; the frame tilts with the lean.
    const cos = Math.cos(lean), sin = Math.sin(lean);
    const c = (u: number, v: number): [number, number] => [hipX + u * cos + v * sin, hipY - u * sin + v * cos];
    shape(g, [...c(-34, 4), ...c(34, 4), ...c(38, -72), ...c(-38, -72)], shirt.face, shade(shirt.face, -0.5), 3);
    for (let i = -28; i <= 28; i += 12) {
      const a = c(i, 2), b = c(i + 3, -70);
      g.lineStyle(3, this.kit.stripe, 0.7).lineBetween(a[0], a[1], b[0], b[1]);
    }
    g.fillStyle(shirt.shade, 0.5);
    g.beginPath().moveTo(...c(20, 4)).lineTo(...c(34, 4)).lineTo(...c(38, -72)).lineTo(...c(24, -72)).closePath().fillPath();
    g.lineStyle(7, braces.face).lineBetween(...c(-14, 2), ...c(-12, -70)).lineBetween(...c(14, 2), ...c(12, -70));
    g.fillStyle(this.kit.brass.face).fillRect(...c(-16, -30), 5, 5).fillRect(...c(12, -30), 5, 5);
    // The far arm first, so the shirt and the near arm cover its root.
    const elbowFar: Point = [shoulderX + 22, shoulderY + 44];
    const elbowNear: Point = [shoulderX + 44, shoulderY + 52];
    g.lineStyle(16, shirt.shade).lineBetween(shoulderX - 6, shoulderY + 12, elbowFar[0], elbowFar[1]);
    // The bow tie, the neck and the collar.
    g.fillStyle(skin.shade).fillRoundedRect(shoulderX - 10, shoulderY - 12, 20, 18, 5);
    g.fillStyle(shirt.lit).fillTriangle(shoulderX - 14, shoulderY - 4, shoulderX + 14, shoulderY - 4, shoulderX, shoulderY + 10);
    g.fillStyle(this.kit.tie).fillTriangle(shoulderX - 14, shoulderY - 6, shoulderX - 2, shoulderY + 2, shoulderX - 14, shoulderY + 8);
    g.fillStyle(this.kit.tie).fillTriangle(shoulderX + 14, shoulderY - 6, shoulderX + 2, shoulderY + 2, shoulderX + 14, shoulderY + 8);
    g.fillStyle(shade(this.kit.tie, -0.3)).fillCircle(shoulderX, shoulderY + 2, 3);
    // The head: front plane, shaded back, an ear, the cap.
    g.fillStyle(skin.face).fillRoundedRect(headX - 24, headY - 30, 48, 56, 18);
    g.fillStyle(skin.shade, 0.85).fillRoundedRect(headX - 24, headY - 30, 12, 56, { tl: 18, tr: 2, br: 2, bl: 18 });
    g.fillStyle(skin.shade).fillEllipse(headX - 24, headY - 4, 10, 14);
    g.fillStyle(skin.lit, 0.6).fillEllipse(headX + 10, headY - 16, 14, 20);
    // Cheeks: the near one balloons with the blow, and flushes.
    const cheek = 8 + puff * 14;
    g.fillStyle(skin.face).fillEllipse(headX + 14 + puff * 6, headY + 6, cheek * 1.4, cheek * 1.2);
    g.fillStyle(0xe08a8a, 0.35 + puff * 0.35).fillEllipse(headX + 14 + puff * 6, headY + 8, cheek, cheek * 0.7);
    g.lineStyle(1.5, skin.edge, 0.5 * puff).beginPath().arc(headX + 14 + puff * 6, headY + 6, cheek * 0.7, -0.6, 0.9, false).strokePath();
    // Eyes squeezed shut on the blow and on the sad ending; open and bright otherwise. Round glasses over them.
    const closed = Math.max(puff, finale.droop);
    for (const [ex, ey, size] of [[headX + 12, headY - 8, 1], [headX - 6, headY - 9, 0.8]] as const) {
      if (closed > 0.6) {
        g.lineStyle(2.5, ROOFTOP.ink).beginPath().arc(ex, ey - 2, 6 * size, 0.3, Math.PI - 0.3, false).strokePath();
      } else {
        g.fillStyle(0xfdfbf5).fillEllipse(ex, ey, 14 * size, 12 * size * (1 - closed * 0.5));
        g.fillStyle(ROOFTOP.ink).fillEllipse(ex + 2, ey + 1, 5 * size, 6 * size);
        g.fillStyle(0xffffff).fillCircle(ex + 1, ey - 1.5, 1.3);
      }
      g.lineStyle(2, 0x8a6a3a).strokeCircle(ex, ey, 10 * size);
    }
    g.lineStyle(2, 0x8a6a3a).lineBetween(headX + 2, headY - 9, headX + 3, headY - 8).lineBetween(headX - 14, headY - 10, headX - 24, headY - 14);
    // Brows: up with the flourish, down and sorry on the droop.
    const brow = finale.flourish * -4 + finale.droop * 3;
    g.lineStyle(3, this.kit.hair).lineBetween(headX + 4, headY - 20 + brow, headX + 20, headY - 22 + brow * 0.5).lineBetween(headX - 12, headY - 21 + brow, headX, headY - 22);
    // Moustache, the lips on the mouthpiece, a sweat bead on the effort.
    g.fillStyle(this.kit.hair).fillEllipse(headX + 20, headY + 4, 18, 7);
    g.fillStyle(0xb06a5a).fillEllipse(headX + 26, headY + 9, 8, 6 - puff * 2);
    if (puff > 0.7 && !this.still && finale.droop === 0) g.fillStyle(0xbfe3f5, 0.9).fillEllipse(headX + 26, headY - 30 + Math.sin(now * 6) * 2, 4, 7);
    if (finale.droop > 0.5) g.fillStyle(0xbfe3f5, 0.9).fillEllipse(headX + 4, headY + 4 + finale.droop * 10, 4, 8);
    // A flat cap with a lit crown and a peak toward the horn.
    g.fillStyle(cap.shade).fillEllipse(headX - 2, headY - 30, 60, 16);
    g.fillStyle(cap.face).fillRoundedRect(headX - 30, headY - 56, 60, 30, { tl: 16, tr: 16, br: 6, bl: 6 });
    g.fillStyle(cap.lit, 0.8).fillRoundedRect(headX - 22, headY - 54, 30, 10, 5);
    g.fillStyle(cap.shade).fillRoundedRect(headX + 8, headY - 36, 34, 8, 4);
    g.lineStyle(2, cap.edge).strokeRoundedRect(headX - 30, headY - 56, 60, 30, { tl: 16, tr: 16, br: 6, bl: 6 });
    g.lineStyle(2.5, this.kit.hair).lineBetween(headX - 26, headY - 26, headX - 30, headY - 18).lineBetween(headX - 22, headY - 27, headX - 28, headY - 22);
    // The near arm's upper half, out toward the slide.
    g.lineStyle(16, shirt.face).lineBetween(shoulderX + 12, shoulderY + 10, elbowNear[0], elbowNear[1]);
    g.lineStyle(3, shirt.lit, 0.7).lineBetween(shoulderX + 14, shoulderY + 6, elbowNear[0] - 4, elbowNear[1] - 6);
    return { lips: [headX + 28, headY + 9], elbowNear, elbowFar };
  }

  // ------------------------------------------------------------------ The horn

  /**
   * The trombone from the side, drawn from the lips: the bell section over the top from
   * the mouthpiece to the flare, the slide hanging below it with its crook out at the
   * extension the note calls for, and the two forearms brought to their braces. The whole
   * horn lifts with the flourish and the slide alone sags with the droop. Returns the
   * mouth of the bell, which is where the sound is drawn from.
   */
  private horn(g: Phaser.GameObjects.Graphics, figure: Figure, extension: number, finale: TromboneFinale, jolt: number): Point {
    const tilt = -finale.flourish * 0.32;
    const ox = figure.lips[0] + jolt, oy = figure.lips[1];
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const at = (u: number, v: number): [number, number] => [ox + u * cos - v * sin, oy + u * sin + v * cos];
    const sag = finale.droop * 0.55;
    // The slide's own frame hangs off the horn's, rotated down by the sag about its anchor at the mouthpiece end.
    const slideAt = (u: number, v: number): [number, number] => {
      const dv = v - HORN.slideUpper;
      return at(u * Math.cos(sag) - dv * Math.sin(sag), HORN.slideUpper + u * Math.sin(sag) + dv * Math.cos(sag));
    };
    const tube = (a: [number, number], b: [number, number], w: number): void => {
      g.lineStyle(w + 3, this.kit.brass.edge).lineBetween(a[0], a[1] + 2, b[0], b[1] + 2);
      g.lineStyle(w, this.kit.brass.face).lineBetween(a[0], a[1], b[0], b[1]);
      g.lineStyle(Math.max(1.5, w * 0.3), this.kit.brass.rim, 0.85).lineBetween(a[0], a[1] - w * 0.25, b[0], b[1] - w * 0.25);
    };
    const skin = this.kit.skin, shirt = this.kit.shirt;
    // The far forearm to the bell brace, behind everything.
    const farHand = at(-6, 24);
    g.lineStyle(15, shirt.shade).lineBetween(figure.elbowFar[0], figure.elbowFar[1], farHand[0], farHand[1] + 6);
    // The slide: inner tubes of fixed length, the outer slide over them out to the crook, and the crook itself.
    const crookU = HORN.crookRest + extension * HORN.crookTravel;
    tube(slideAt(10, HORN.slideUpper), slideAt(150, HORN.slideUpper), 7);
    tube(slideAt(10, HORN.slideLower), slideAt(150, HORN.slideLower), 7);
    tube(slideAt(64, HORN.slideUpper), slideAt(crookU, HORN.slideUpper), 10);
    tube(slideAt(64, HORN.slideLower), slideAt(crookU, HORN.slideLower), 10);
    const [cx, cy] = slideAt(crookU, (HORN.slideUpper + HORN.slideLower) / 2);
    const crookR = (HORN.slideLower - HORN.slideUpper) / 2;
    g.lineStyle(13, this.kit.brass.edge).beginPath().arc(cx, cy + 2, crookR, -Math.PI / 2 + tilt + sag, Math.PI / 2 + tilt + sag, false).strokePath();
    g.lineStyle(10, this.kit.brass.face).beginPath().arc(cx, cy, crookR, -Math.PI / 2 + tilt + sag, Math.PI / 2 + tilt + sag, false).strokePath();
    g.lineStyle(3, this.kit.brass.rim, 0.8).beginPath().arc(cx, cy - 2, crookR, -Math.PI / 2 + tilt + sag, tilt + sag, false).strokePath();
    // The slide brace, and the near hand holding it, which is what moves on every note.
    const braceU = 84 + extension * HORN.crookTravel * 0.6;
    tube(slideAt(braceU, HORN.slideUpper - 4), slideAt(braceU, HORN.slideLower + 4), 5);
    const [hx, hy] = slideAt(braceU, (HORN.slideUpper + HORN.slideLower) / 2);
    g.lineStyle(15, shirt.face).lineBetween(figure.elbowNear[0], figure.elbowNear[1], hx - 8, hy + 10);
    g.lineStyle(3, shirt.lit, 0.7).lineBetween(figure.elbowNear[0], figure.elbowNear[1] - 5, hx - 10, hy + 4);
    g.fillStyle(skin.face).fillRoundedRect(hx - 12, hy - 15, 24, 32, 9);
    g.fillStyle(skin.shade, 0.6).fillRoundedRect(hx + 2, hy - 15, 10, 32, { tl: 3, tr: 9, br: 9, bl: 3 });
    g.lineStyle(1.5, skin.edge, 0.7);
    for (let f = 0; f < 3; f++) g.lineBetween(hx - 10, hy - 6 + f * 8, hx + 8, hy - 6 + f * 8);
    g.fillStyle(skin.lit, 0.7).fillEllipse(hx - 4, hy - 9, 10, 6);
    // The bell section: from the mouthpiece forward and a little up, then the flare.
    tube(at(0, 0), at(40, 0), 9);
    tube(at(40, 0), at(60, -8), 9);
    tube(at(60, -8), at(HORN.flareFrom, -8), 9);
    // The bell brace between the two sections, and the far hand on it.
    tube(at(-6, 2), at(-6, HORN.slideLower - 2), 5);
    g.fillStyle(skin.shade).fillRoundedRect(farHand[0] - 11, farHand[1] - 12, 22, 26, 8);
    g.fillStyle(skin.face, 0.9).fillRoundedRect(farHand[0] - 11, farHand[1] - 12, 12, 26, { tl: 8, tr: 3, br: 3, bl: 8 });
    // The mouthpiece cup at the lips.
    g.fillStyle(0xb8bec6).fillRoundedRect(ox - 10, oy - 6, 12, 12, 4);
    // The flare: one contour widening from the tube to the mouth, a lit band along its top, and the mouth's rim.
    const top: number[] = [], bottom: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = i / 12, u = HORN.flareFrom + (HORN.bell - HORN.flareFrom) * p;
      const r = 4.5 + easeOut(p) ** 2.2 * (HORN.bellR - 4.5);
      top.push(...at(u, -8 - r));
      bottom.unshift(...at(u, -8 + r));
    }
    shape(g, [...top, ...bottom], this.kit.brass.face, this.kit.brass.edge, 2.5);
    g.lineStyle(4, this.kit.brass.rim, 0.7);
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const p = i / 12, u = HORN.flareFrom + (HORN.bell - HORN.flareFrom) * p;
      const r = 4.5 + easeOut(p) ** 2.2 * (HORN.bellR - 4.5);
      const [px, py] = at(u, -8 - r * 0.6);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
    g.fillStyle(this.kit.brass.shade, 0.5);
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const p = i / 12, u = HORN.flareFrom + (HORN.bell - HORN.flareFrom) * p;
      const r = 4.5 + easeOut(p) ** 2.2 * (HORN.bellR - 4.5);
      const [px, py] = at(u, -8 + r * 0.55);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    for (let i = 12; i >= 0; i--) {
      const p = i / 12, u = HORN.flareFrom + (HORN.bell - HORN.flareFrom) * p;
      const r = 4.5 + easeOut(p) ** 2.2 * (HORN.bellR - 4.5);
      const [px, py] = at(u, -8 + r);
      g.lineTo(px, py);
    }
    g.closePath().fillPath();
    const [bx, by] = at(HORN.bell, -8);
    g.fillStyle(this.kit.brass.face).fillEllipse(bx, by, 16, HORN.bellR * 2);
    g.fillStyle(this.kit.brass.shade).fillEllipse(bx + 2, by, 11, HORN.bellR * 2 - 8);
    g.fillStyle(0x3a2a1a).fillEllipse(bx + 3, by, 7, HORN.bellR * 2 - 18);
    g.lineStyle(2.5, this.kit.brass.edge).strokeEllipse(bx, by, 16, HORN.bellR * 2);
    g.lineStyle(2, this.kit.brass.rim, 0.9).beginPath().arc(bx - 1, by, HORN.bellR - 2, Math.PI * 1.15, Math.PI * 1.6, false).strokePath();
    return [bx + 6, by];
  }

  /** Sound leaving the bell: two rings that spread and fade over the note, brighter for the ending. */
  private bellSound(g: Phaser.GameObjects.Graphics, bell: Point, age: number, ending: number, finale: TromboneFinale): void {
    if (this.still || age < 0 || age > 0.45) return;
    const p = age / 0.45;
    const tilt = -finale.flourish * 0.32;
    for (let i = 0; i < 2; i++) {
      const r = 30 + p * 70 + i * 26;
      g.lineStyle(3 - i, ending >= 0 ? 0xfff3cf : 0xf6d6a0, (1 - p) * (0.7 - i * 0.25));
      g.beginPath().arc(bell[0], bell[1], r, tilt - 0.8, tilt + 0.8, false).strokePath();
    }
  }

  /** A quaver floats up out of the bell for every landed note; a sour one falls from a missed beat. */
  private notes(g: Phaser.GameObjects.Graphics, bell: Point, now: number, ending: number): void {
    if (this.still) return;
    const glyph = (x: number, y: number, colour: number, alpha: number, flip: boolean): void => {
      g.fillStyle(colour, alpha).fillEllipse(x, y, 12, 9);
      g.lineStyle(2.5, colour, alpha).lineBetween(x + 5, y - 1, x + 5, y - 22);
      g.lineStyle(2.5, colour, alpha).lineBetween(x + 5, y - 22, x + (flip ? -6 : 12), y - 16);
    };
    for (let i = 0; i < this.hitTimes.length; i++) {
      const age = now - this.hitTimes[i]!;
      if (age < 0 || age > 0.9) continue;
      const p = age / 0.9;
      glyph(bell[0] + 20 + p * 70 + (i % 3) * 18, bell[1] - 10 - p * 110 + Math.sin(age * 9 + i) * 8, 0xfff3cf, 1 - p, i % 2 === 0);
    }
    const miss = now - this.errorAt;
    if (miss >= 0 && miss < 0.7 && ending < 0) {
      const p = miss / 0.7;
      glyph(bell[0] + 30 + p * 30, bell[1] + 20 + p * p * 120, 0x9aa0a8, 1 - p, true);
      g.lineStyle(2, 0x9aa0a8, 1 - p).lineBetween(bell[0] + 20 + p * 30, bell[1] + 4 + p * p * 120, bell[0] + 46 + p * 30, bell[1] - 2 + p * p * 120);
    }
  }

  /** Notes and confetti out of the bell at the flourish, in the room's warm colours. */
  private burst(g: Phaser.GameObjects.Graphics, bell: Point, burst: number, now: number): void {
    const colours = [0xf2a65a, 0xfff3cf, 0xd9534f, 0x9fc0d8, 0xf1c04f];
    for (let i = 0; i < 16; i++) {
      const a = -1.1 + (i / 16) * 1.5, speed = 160 + (i % 4) * 50;
      const t = burst;
      const x = bell[0] + Math.cos(a) * speed * t, y = bell[1] + Math.sin(a) * speed * t + t * t * 160;
      const spin = now * 6 + i;
      const colour = colours[i % colours.length]!;
      if (i % 4 === 0) {
        g.fillStyle(colour, 1 - t).fillEllipse(x, y, 10, 8);
        g.lineStyle(2.5, colour, 1 - t).lineBetween(x + 4, y, x + 4, y - 18);
      } else {
        g.fillStyle(colour, 1 - t).fillRect(x + Math.cos(spin) * 5, y + Math.sin(spin) * 5, 8, 5);
      }
    }
  }
}
