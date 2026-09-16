import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { mix, shade } from '@/ui/colour';
import { Feedback } from '@/ui/feedback';
import { castShadow, faces } from '@/ui/light';
import { cubicContour, fillContour, paintedContour, traceContour } from '@/ui/illustration';
import type { Vignette } from './Vignette';
import {
  acceptDemoBeat,
  advanceRep,
  bicepBulge,
  chalkDraw,
  clamp01,
  CURL_MOTION,
  curlFlex,
  curlLift,
  curlTiming,
  DROP_LANDING_SEC,
  dropHeight,
  easeOut,
  forearmAngle,
  holdTremor,
  pumpLevel,
  REFERENCE_BEAT,
} from './curlMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/**
 * Concrete, rubber and iron, with one warm body in the middle of it. The tank is the only
 * saturated colour in the room, so the figure is the subject at a glance.
 */
export const GYM = {
  paper: 0xdad4cb,
  ink: 0x2b2733,
  wall: 0xcbc3b7,
  lamp: 0xfff1d6,
  mat: 0x4c4954,
  matSeam: 0x5d5966,
  skin: 0xd8945f,
  flush: 0xd9634a,
  tank: 0x2e9c8e,
  iron: 0x3b3e47,
  chrome: 0xbcc3ca,
  board: 0x34493f,
  frame: 0x8a6743,
  chalk: 0xf4eddc,
  sweat: 0xbfe4ec,
} as const;

// The figure stands with the floor at y 0 and faces +x. The trunk is its own container,
// hinged at the hips, so a lean or a squash moves the head, the shoulders and the working
// arm together and leaves the feet planted.
//
// Cartoon-athletic proportions: an egg of a head (not a circle), a V of a torso, and
// legs that taper to the ankle instead of standing as two square pillars. About five
// heads tall, so the face can carry the effort and the working arm stays the subject.
const HIP_Y = -292;
/** Trunk space: origin at the hips. */
const ELBOW = { x: 68, y: -64 } as const;
const HEAD = { x: 58, y: -368, rx: 66, ry: 78 } as const;
/** Side-on plates either side of the grip, and the grip itself. */
const PLATE = { reach: 66, w: 40, h: 118 } as const;
/** The chalkboard on the wall, left of the torso. It keeps the set's count. */
const BOARD = { x: -300, y: -565, w: 190, h: 168 } as const;
const TALLY_STEP = 22;
const TALLY_GROUP = 5;
const TALLY_GROUPS_PER_ROW = 2;

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class BicepCurlVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly room: Phaser.GameObjects.Graphics;
  private readonly matting: Phaser.GameObjects.TileSprite;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly tally: Phaser.GameObjects.Graphics;
  private readonly legs: Phaser.GameObjects.Graphics;
  private readonly trunk: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly arm: Phaser.GameObjects.Graphics;
  private readonly loose: Phaser.GameObjects.Graphics;
  private readonly bursts: Feedback;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
  private lastDemo = -Infinity;
  private repAt = -100;
  /** How high the current rep gets. A wasted tap only makes half of one. */
  private repPeak = 1;
  private reps = 0;
  private pump = 0;
  private pumpFrom = 0;
  private pumpTo = 0;
  private pumpAt = -100;
  /** Off reps lean the figure back into bad form. Presentation of outcomes, never a grade. */
  private strain = 0;
  private judderAt = -100;
  private clankAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  /** Where the weight left the hand in the rough coda, in stage space, and how far it falls. */
  private dropX = 0;
  private dropFrom = 0;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean {
    return reducedMotion();
  }

  public constructor(scene: Phaser.Scene) {
    // The pool of light sits over the working arm, which is what the eye is meant to follow.
    this.backdrop = new Backdrop(scene, GYM.paper, GYM.lamp, { glowAt: { x: 0.56, y: 0.4 }, glowAlpha: 0.7 });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.room = scene.add.graphics();
    // Rubber matting is cloth at low strength: a weave over a dark ground reads as a mat,
    // where a flat fill read as a hole in the floor.
    this.matting = scene.add
      .tileSprite(-3000, 0, 6000, 3000, MaterialKey.cloth)
      .setOrigin(0)
      .setTint(GYM.matSeam)
      .setAlpha(0.4 * STYLE.current.grain);
    this.matting.setTileScale(0.7, 0.7);
    this.boardG = scene.add.graphics();
    this.tally = scene.add.graphics();
    this.legs = scene.add.graphics();
    this.drawLegs(this.legs);
    this.trunk = scene.add.container(0, HIP_Y);
    this.body = scene.add.graphics();
    this.drawBody(this.body);
    this.face = scene.add.graphics();
    this.arm = scene.add.graphics();
    this.trunk.add([this.body, this.face, this.arm]);
    this.loose = scene.add.graphics();
    this.stage.add([this.room, this.matting, this.boardG, this.tally, this.legs, this.trunk, this.loose]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  /** Continuous contours keep knees, calves and clothing free of overlap seams. */
  private drawLegs(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline;
    const skin = faces(GYM.skin);
    const shape = (x: number, y: number, curves: Parameters<typeof cubicContour>[2], colour: number): void =>
      paintedContour(g, cubicContour(x, y, curves), colour, GYM.ink, line);
    g.fillStyle(GYM.ink, 0.16).fillEllipse(36, 9, 280, 24);
    // Each leg is one tailored silhouette, not a stack of overlapping capsules.
    shape(
      -48,
      -250,
      [
        [-10, -268, 18, -240, 8, -209],
        [-4, -162, -35, -105, -40, -44],
        [-46, -25, -76, -27, -78, -47],
        [-79, -112, -62, -173, -48, -250],
      ],
      skin.shade,
    );
    shape(
      27,
      -244,
      [
        [51, -266, 84, -248, 86, -215],
        [88, -157, 91, -111, 106, -49],
        [107, -26, 75, -23, 68, -43],
        [47, -98, 35, -140, 26, -171],
        [18, -198, 17, -223, 27, -244],
      ],
      skin.face,
    );
    // Ribbed ivory socks give the ankles a clean transition into the trainers.
    for (const [x, y] of [
      [-60, -48],
      [86, -46],
    ]) {
      g.fillStyle(GYM.chalk).fillRoundedRect(x! - 20, y! - 24, 39, 47, 9);
      g.lineStyle(5, GYM.tank).lineBetween(x! - 18, y! - 12, x! + 17, y! - 12);
      g.lineStyle(2, GYM.ink, 0.15).lineBetween(x! - 8, y! - 4, x! - 8, y! + 15);
    }
    this.drawShoe(g, -85, 0, 0.9, false, line);
    this.drawShoe(g, 60, 3, 1, true, line);
    shape(
      -43,
      HIP_Y - 15,
      [
        [-14, -319, 54, -319, 83, -292],
        [91, -268, 96, -234, 87, -211],
        [67, -203, 44, -208, 31, -220],
        [26, -228, 24, -247, 19, -252],
        [9, -233, 5, -219, -7, -213],
        [-26, -207, -48, -215, -56, -228],
        [-57, -250, -49, -276, -43, HIP_Y - 15],
      ],
      GYM.ink,
    );
    g.lineStyle(6, GYM.tank).lineBetween(77, -278, 79, -226);
    g.lineStyle(3, GYM.chalk, 0.25).lineBetween(-37, -232, -12, -227).lineBetween(43, -227, 72, -222);
    g.lineStyle(3, GYM.chalk, 0.75).lineBetween(14, -290, 9, -270).lineBetween(15, -290, 23, -273);
  }

  private drawShoe(
    g: Phaser.GameObjects.Graphics,
    heelX: number,
    soleY: number,
    size: number,
    lit: boolean,
    line: number,
  ): void {
    const points = cubicContour(0, -40, [
      [10, -47, 29, -46, 38, -35],
      [51, -26, 69, -23, 88, -21],
      [106, -19, 112, -9, 107, 0],
      [77, 8, 25, 6, 0, 2],
      [-5, -7, -4, -29, 0, -40],
    ]);
    const mapped = points.map((v, i) => v * size + (i % 2 ? soleY : heelX));
    paintedContour(g, mapped, lit ? 0x405457 : 0x354347, GYM.ink, line);
    g.fillStyle(GYM.chalk).fillRoundedRect(heelX, soleY - 8, 107 * size, 12 * size, 5);
    g.lineStyle(3, GYM.ink).lineBetween(heelX + 3, soleY + 5, heelX + 102 * size, soleY + 5);
    g.lineStyle(4, GYM.chalk, 0.8);
    for (let i = 0; i < 3; i++)
      g.lineBetween(
        heelX + (35 + i * 10) * size,
        soleY - (29 - i * 3) * size,
        heelX + (29 + i * 10) * size,
        soleY - (19 - i * 3) * size,
      );
    g.lineStyle(5, GYM.tank).lineBetween(heelX + 13 * size, soleY - 27 * size, heelX + 13 * size, soleY - 15 * size);
  }

  private drawBody(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline;
    const skin = faces(GYM.skin);
    const shape = (x: number, y: number, curves: Parameters<typeof cubicContour>[2], colour: number): void =>
      paintedContour(g, cubicContour(x, y, curves), colour, GYM.ink, line);
    // Relaxed far arm and a racerback singlet establish the three-quarter pose.
    shape(
      -36,
      -245,
      [
        [-69, -238, -65, -189, -61, -151],
        [-61, -121, -51, -91, -47, -62],
        [-59, -45, -46, -28, -31, -39],
        [-20, -49, -24, -65, -29, -75],
        [-33, -114, -33, -148, -28, -185],
        [-19, -209, -16, -235, -36, -245],
      ],
      skin.shade,
    );
    shape(
      -20,
      -247,
      [
        [0, -263, 22, -278, 23, -316],
        [43, -331, 75, -325, 78, -300],
        [76, -277, 89, -260, 105, -246],
        [122, -205, 98, -75, 77, -15],
        [50, -2, -12, -3, -32, -18],
        [-46, -105, -55, -192, -20, -247],
      ],
      skin.face,
    );
    // One curved side plane, with no disconnected highlight spots.
    g.fillStyle(skin.shade);
    fillContour(
      g,
      cubicContour(24, -309, [
        [34, -285, 53, -270, 77, -277],
        [75, -258, 50, -242, 30, -247],
        [16, -264, 20, -288, 24, -309],
      ]),
    );
    shape(
      -20,
      -246,
      [
        [-9, -253, 1, -258, 9, -258],
        [6, -219, 31, -198, 53, -212],
        [65, -226, 68, -250, 66, -259],
        [80, -264, 92, -257, 99, -248],
        [85, -205, 84, -183, 103, -158],
        [103, -120, 85, -48, 77, -15],
        [46, -3, -5, -4, -32, -18],
        [-37, -76, -52, -188, -20, -246],
      ],
      GYM.tank,
    );
    g.fillStyle(0x237a72);
    fillContour(
      g,
      cubicContour(-20, -239, [
        [-39, -162, -20, -73, -12, -11],
        [-23, -12, -29, -15, -32, -18],
        [-37, -87, -49, -182, -20, -239],
      ]),
    );
    g.lineStyle(4, 0x89c7b4).beginPath().moveTo(-9, -242).lineTo(-15, -203).strokePath();
    g.lineStyle(3, 0x154f4b, 0.5).lineBetween(-5, -42, 52, -34);
    // A little lightning badge gives the kit a character of its own.
    g.fillStyle(GYM.chalk);
    fillContour(g, [7, -163, 30, -168, 21, -147, 36, -149, 10, -116, 16, -142, 3, -138]);
    // The far cheek stays rounded: a three-quarter nose belongs inside the face,
    // not in the outer silhouette as it would in a side profile.
    shape(
      4,
      -407,
      [
        [8, -445, 41, -458, 79, -445],
        [105, -439, 117, -420, 116, -394],
        [115, -377, 120, -366, 121, -351],
        [122, -339, 122, -331, 119, -325],
        [116, -305, 104, -290, 83, -287],
        [46, -282, 27, -301, 19, -326],
        [-1, -327, -12, -344, -9, -360],
        [-8, -370, -1, -375, 8, -371],
        [1, -382, 1, -396, 4, -407],
      ],
      skin.face,
    );
    g.fillStyle(skin.shade);
    fillContour(
      g,
      cubicContour(22, -324, [
        [34, -308, 61, -301, 86, -304],
        [102, -304, 112, -315, 119, -325],
        [118, -303, 101, -287, 82, -287],
        [50, -284, 30, -299, 22, -324],
      ]),
    );
    g.lineStyle(3, 0x9c5c40, 0.7).beginPath().arc(7, -353, 10, -1.7, 1.3).strokePath();
    // Sculpted swept quiff, not three intersecting circles.
    shape(
      2,
      -370,
      [
        [-12, -395, -8, -420, 8, -434],
        [18, -451, 39, -458, 62, -453],
        [91, -467, 116, -451, 123, -437],
        [127, -428, 121, -414, 110, -409],
        [79, -402, 48, -412, 28, -416],
        [21, -397, 20, -380, 15, -372],
        [10, -379, 7, -377, 2, -370],
      ],
      GYM.ink,
    );
    g.lineStyle(5, 0x5b4c52, 0.85);
    traceContour(g, cubicContour(15, -430, [[37, -447, 69, -431, 96, -439]]));
    g.strokePath();
    // Sweatband follows the forehead rather than projecting beyond its silhouette.
    shape(
      23,
      -412,
      [
        [50, -406, 80, -405, 115, -412],
        [118, -407, 118, -398, 117, -393],
        [78, -386, 49, -389, 22, -396],
        [22, -402, 22, -407, 23, -412],
      ],
      GYM.chalk,
    );
    g.lineStyle(4, GYM.tank);
    traceContour(g, cubicContour(26, -402, [[51, -396, 91, -396, 113, -401]]));
    g.strokePath();
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    // A standing figure needs height more than width, so the floor sits low in the frame
    // and the frame is fitted to the figure's height first.
    const uiScale = Math.min(safe.width / 720, safe.height / 1150);
    const top = safe.top + 320 * uiScale;
    const bottom = safe.bottom - 410 * uiScale;
    this.scale = Math.min(safe.width / 760, (bottom - top) / 795);
    this.baseX = safe.centerX - 4 * this.scale;
    this.baseY = top + (bottom - top + 760 * this.scale) / 2;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const r = this.room.clear();
    // The wall is the paper itself, so the pool of light still falls across it; a dado
    // and the rubber floor sit in stage space so they stay anchored to the feet however
    // the stage is scaled.
    r.fillStyle(GYM.wall, 0.4).fillRect(-3000, -400, 6000, 400);
    r.lineStyle(4, GYM.ink, 0.1).lineBetween(-3000, -400, 3000, -400);
    r.fillStyle(GYM.mat).fillRect(-3000, 0, 6000, 3000);
    const mat = faces(GYM.mat);
    if (STYLE.current.outline > 0)
      r.fillStyle(shade(GYM.mat, -0.6)).fillRect(
        -3000,
        -STYLE.current.outline * 0.7,
        6000,
        STYLE.current.outline * 0.7,
      );
    r.fillStyle(mat.lit).fillRect(-3000, 0, 6000, 9);
    r.fillStyle(mat.rim, 0.5).fillRect(-3000, 0, 6000, 3);
    r.lineStyle(3, GYM.matSeam, 0.7);
    for (let col = -6; col < 7; col++) r.lineBetween(col * 230, 0, col * 330, 900);
    for (let row = 1; row < 6; row++) r.lineBetween(-3000, row * 95, 3000, row * 95);
    this.drawBoard(this.boardG.clear());
  }

  private drawBoard(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline * 1.4;
    const frame = faces(GYM.frame);
    const drop = castShadow(7);
    g.fillStyle(GYM.ink, drop.alpha).fillRoundedRect(BOARD.x + drop.dx, BOARD.y + drop.dy, BOARD.w, BOARD.h, 10);
    if (line > 0)
      g.lineStyle(line, frame.edge).strokeRoundedRect(BOARD.x - 12, BOARD.y - 12, BOARD.w + 24, BOARD.h + 24, 12);
    g.fillStyle(frame.face).fillRoundedRect(BOARD.x - 12, BOARD.y - 12, BOARD.w + 24, BOARD.h + 24, 12);
    g.fillStyle(frame.lit, 0.8).fillRoundedRect(BOARD.x - 8, BOARD.y - 8, BOARD.w + 16, 6, 3);
    g.fillStyle(GYM.board).fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    // Old chalk, wiped but not gone.
    g.fillStyle(GYM.chalk, 0.07).fillEllipse(BOARD.x + 90, BOARD.y + 120, 160, 60);
    g.lineStyle(3, GYM.chalk, 0.5).lineBetween(BOARD.x + 18, BOARD.y + 42, BOARD.x + BOARD.w - 18, BOARD.y + 42);
    g.lineStyle(4, GYM.chalk, 0.85);
    // A short heading stroke, and a rest for the chalk in the frame's channel.
    g.lineBetween(BOARD.x + 22, BOARD.y + 24, BOARD.x + 70, BOARD.y + 24);
    g.lineStyle(8, GYM.chalk)
      .lineBetween(BOARD.x + 25, BOARD.y + 15, BOARD.x + 25, BOARD.y + 33)
      .lineBetween(BOARD.x + 67, BOARD.y + 15, BOARD.x + 67, BOARD.y + 33);
    g.fillStyle(GYM.chalk).fillRoundedRect(BOARD.x + BOARD.w - 62, BOARD.y + BOARD.h + 2, 40, 8, 4);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.repAt = -100;
    this.repPeak = 1;
    this.reps = 0;
    this.pump = this.pumpFrom = this.pumpTo = 0;
    this.pumpAt = -100;
    this.respondAt = -100;
    this.strain = 0;
    this.judderAt = -100;
    this.clankAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
    this.dropX = 0;
    this.dropFrom = 0;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration curls the weight in full without counting, so the player starts
    // on the empty board they watched and nothing has to be wiped in the instant before
    // their turn.
    if (phase === 'respond') {
      this.reps = 0;
      this.setPump(0, now);
      this.respondAt = now;
    }
  }

  private setPump(level: number, now: number): void {
    this.pumpFrom = this.pump;
    this.pumpTo = clamp01(level);
    this.pumpAt = now;
  }

  private rep(now: number, peak = 1): void {
    this.repAt = now;
    this.repPeak = peak;
    this.exhale();
  }

  /** The breath out on the squeeze. Decorative, so it may skip under reduced motion. */
  private exhale(): void {
    if (this.reducedMotion) return;
    this.bursts.burst('dust', HEAD.x + 84, HIP_Y + HEAD.y + 40, [GYM.chalk, GYM.wall], 3);
  }

  private sweat(): void {
    if (this.reducedMotion) return;
    this.bursts.burst('water', HEAD.x + 20, HIP_Y + HEAD.y - 70, [GYM.sweat, GYM.chalk], 3);
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    // The lift, the squeeze, the breath and its sound all play; only the count is
    // withheld. There is no bar between the demonstration and the response in which to
    // wipe the board.
    this.rep(time);
  }

  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.rep(now);
  }

  public onAccuracy(result: Judgement, now: number): void {
    const reps = advanceRep(this.reps, result.kind);
    if (reps !== this.reps) {
      this.reps = reps;
      this.setPump(pumpLevel(reps, this.plan?.targets.length ?? 3), now);
      if (this.pump > 0.2) this.sweat();
      return;
    }
    // A wasted tap gets the weight halfway before the arm gives and the plates clank; a
    // missed target leaves the arm hanging and trembling under the load. Neither counts.
    if (result.kind === 'extra') {
      this.repPeak = CURL_MOTION.halfRep;
      this.clankAt = now;
    } else this.judderAt = now;
    this.strain = Math.min(1, this.strain + 0.22);
  }

  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void {
    this.phase = 'paused';
    this.finishAt = null;
    this.repAt = -100;
  }

  private beat(): number {
    return this.plan ? 60 / this.plan.bpm : REFERENCE_BEAT;
  }

  /** Only known beats are anticipated: the demonstration's, and the coda's squeeze. */
  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find((cue) => cue.kind === 'action' && cue.time > now)?.time ?? null;
  }

  /** Flexion of the working arm now: 0 hanging, 1 squeezed at the top. */
  private flexion(now: number): number {
    const beat = this.beat();
    const age = now - this.repAt;
    if (this.finished && this.finishAt !== null) {
      // A strong finish holds the squeeze. A rough one lost the weight at the top, and the
      // unloaded arm drifts down to hang.
      const held = now - this.finishAt;
      return this.successful ? 1 - Math.abs(holdTremor(held)) : 1 - easeOut((held - 0.1) / 0.7) * 0.85;
    }
    let flex = curlFlex(age, this.repPeak, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < curlTiming(beat).liftSec) flex = curlLift(next - now, flex, beat);
    return flex;
  }

  /**
   * The stage light opens toward the player the instant their turn starts, and holds open
   * through the ending. It is the handover said without words, now that no bar separates
   * the demonstration from the response.
   */
  private openStage(now: number): void {
    const offered = this.phase === 'respond' || this.phase === 'result';
    this.backdrop.open(offered ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
  }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow;
    else this.lastNow = now;
    this.openStage(now);
    // Rendering may observe a beat before the controller's next pump. The squeeze is
    // sampled from the same absolute cue, so a throttled frame cannot shift it.
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.pump = this.pumpFrom + (this.pumpTo - this.pumpFrom) * easeOut((now - this.pumpAt) / 0.18);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      // The unscored last rep of the set. It never changes the result: a strong set holds
      // the squeeze at the top, a rough one gets the weight there and loses it.
      this.rep(this.finishAt);
      if (this.successful) {
        this.setPump(1, this.finishAt);
        this.sweat();
      } else {
        this.strain = Math.max(this.strain, 0.6);
        const hand = this.handAt(1);
        const r = this.trunk.rotation;
        this.dropX = hand.x * Math.cos(r) - hand.y * Math.sin(r);
        this.dropFrom = -PLATE.h / 2 - (HIP_Y + hand.x * Math.sin(r) + hand.y * Math.cos(r));
      }
    }
    const age = now - this.repAt;
    const flex = this.flexion(now);
    const pop = age >= 0 && age < 0.14 ? Math.sin((age / 0.14) * Math.PI) * STYLE.current.exaggeration : 0;
    const idle = this.reducedMotion ? 0 : Math.sin(now * 1.7) * 0.004;
    // The squeeze compresses the whole trunk and rocks it back; strain leans it back for
    // good. Both hinge at the hips, so the feet stay planted.
    this.trunk.setScale(1 + pop * 0.018, 1 - pop * 0.022 + idle);
    this.trunk.setRotation(-this.strain * 0.1 - (this.reducedMotion ? 0 : pop * 0.025));
    const landing =
      this.finished && !this.successful && this.finishAt !== null ? now - this.finishAt - DROP_LANDING_SEC : -1;
    const thump =
      this.reducedMotion || landing < 0 || landing > 0.2
        ? 0
        : Math.sin(landing * 110) * Math.exp(-landing * 20) * 3 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + thump * this.scale * 0.4, this.baseY + thump * this.scale);
    this.drawArm(now, flex, pop);
    this.drawFace(now, flex);
    this.drawTally(now);
    this.drawLoose(now);
  }

  /** The centre of the grip in trunk space for a flexion. */
  private handAt(flex: number): { x: number; y: number } {
    const angle = forearmAngle(flex);
    return { x: ELBOW.x + Math.cos(angle) * CURL_MOTION.forearm, y: ELBOW.y + Math.sin(angle) * CURL_MOTION.forearm };
  }

  private drawArm(now: number, flex: number, pop: number): void {
    const g = this.arm.clear();
    const line = STYLE.current.outline;
    const skin = faces(mix(GYM.skin, GYM.flush, this.pump * 0.12));
    const shake = now - this.judderAt;
    const tremble =
      this.reducedMotion || shake < 0 || shake > 0.3 ? 0 : Math.sin(shake * 90) * Math.exp(-shake * 9) * 0.05;
    const hand = this.handAt(flex + tremble);
    const angle = forearmAngle(flex + tremble);
    const swell = bicepBulge(flex) * (16 + this.pump * 9) + pop;
    // The muscle swells inside one continuous shoulder-to-elbow contour.
    const upper = cubicContour(25, -262, [
      [51, -286, 83, -277, 99, -249],
      [106, -226, 101, -205, 105 + swell, -177],
      [115 + swell, -145, 108, -117, 96, -91],
      [98, -59, 87, -40, 68, -40],
      [47, -40, 36, -56, 39, -83],
      [40, -138, 18, -199, 20, -229],
      [17, -242, 18, -254, 25, -262],
    ]);
    paintedContour(g, upper, skin.face, GYM.ink, line);
    g.fillStyle(skin.shade);
    fillContour(
      g,
      cubicContour(39, -237, [
        [26, -190, 59, -133, 53, -84],
        [48, -64, 54, -48, 68, -44],
        [48, -42, 37, -57, 39, -83],
        [40, -138, 18, -199, 20, -229],
        [22, -248, 30, -256, 39, -237],
      ]),
    );
    // Short contour accents describe tension without drawing circles on the skin.
    g.lineStyle(3, 0x995b40, 0.55);
    traceContour(g, cubicContour(55, -217, [[68, -232, 91, -224, 96, -206]]));
    g.strokePath();
    if (flex > 0.25) {
      traceContour(g, cubicContour(72, -112, [[91, -118, 101 + swell, -141, 96 + swell, -165]]));
      g.strokePath();
    }
    const local = cubicContour(0, -26, [
      [42, -34, 111, -26, 176, -20],
      [194, -14, 194, 15, 176, 21],
      [122, 28, 68, 34, 12, 29],
      [-13, 27, -24, 5, -16, -13],
      [-12, -22, -6, -26, 0, -26],
    ]);
    const transform = (pts: readonly number[]): number[] => {
      const out: number[] = [];
      for (let i = 0; i < pts.length; i += 2)
        out.push(
          ELBOW.x + pts[i]! * Math.cos(angle) - pts[i + 1]! * Math.sin(angle),
          ELBOW.y + pts[i]! * Math.sin(angle) + pts[i + 1]! * Math.cos(angle),
        );
      return out;
    };
    paintedContour(g, transform(local), skin.face, GYM.ink, line);
    g.fillStyle(skin.shade);
    fillContour(
      g,
      transform(
        cubicContour(6, 19, [
          [60, 24, 124, 19, 176, 13],
          [190, 16, 184, 21, 176, 21],
          [122, 28, 68, 34, 12, 29],
          [-2, 28, -12, 21, 6, 19],
        ]),
      ),
    );
    // Keep the elbow joined: a short crease, not a ring around the joint.
    g.fillStyle(skin.face).fillCircle(ELBOW.x, ELBOW.y, 22);
    g.lineStyle(3, 0x995b40, 0.5);
    const crease = transform(cubicContour(7, -14, [[0, -8, -1, 2, 5, 8]]));
    traceContour(g, crease);
    g.strokePath();
    const band = transform([131, -25, 151, -23, 151, 25, 131, 27]);
    paintedContour(g, band, GYM.chalk, GYM.ink, 2);
    g.lineStyle(4, GYM.tank);
    const stripe = transform([141, -24, 141, 26]);
    g.lineBetween(stripe[0]!, stripe[1]!, stripe[2]!, stripe[3]!);
    if (!(this.finished && !this.successful)) this.drawDumbbell(g, hand.x, hand.y, now);
    g.fillStyle(skin.face).fillRoundedRect(hand.x - 24, hand.y - 26, 48, 52, 15);
    g.lineStyle(line, GYM.ink).strokeRoundedRect(hand.x - 24, hand.y - 26, 48, 52, 15);
    g.fillStyle(skin.face).fillEllipse(hand.x - 20, hand.y - 13, 25, 26);
    g.lineStyle(3, 0x995b40, 0.8);
    for (let i = 0; i < 3; i++) g.lineBetween(hand.x - 3, hand.y - 10 + i * 11, hand.x + 17, hand.y - 10 + i * 11);
  }

  private drawDumbbell(g: Phaser.GameObjects.Graphics, x: number, y: number, now: number): void {
    const line = STYLE.current.outline * 1.4;
    const iron = faces(GYM.iron);
    const chrome = faces(GYM.chrome);
    // Plates clank against each other when a half rep is let go.
    const clank = now - this.clankAt;
    const rattle =
      this.reducedMotion || clank < 0 || clank > 0.22 ? 0 : Math.sin(clank * 96) * Math.exp(-clank * 14) * 4;
    const drop = castShadow(6);
    g.fillStyle(GYM.ink, drop.alpha * 0.6).fillRoundedRect(
      x - PLATE.reach - PLATE.w / 2 + drop.dx,
      y - PLATE.h / 2 + drop.dy,
      PLATE.reach * 2 + PLATE.w,
      PLATE.h,
      10,
    );
    if (line > 0) g.lineStyle(line, chrome.edge).strokeRoundedRect(x - PLATE.reach, y - 12, PLATE.reach * 2, 24, 8);
    g.fillStyle(chrome.face).fillRoundedRect(x - PLATE.reach, y - 12, PLATE.reach * 2, 24, 8);
    g.fillStyle(chrome.rim, 0.9).fillRoundedRect(x - PLATE.reach + 6, y - 9, PLATE.reach * 2 - 12, 6, 3);
    for (const side of [-1, 1]) {
      const px = x + side * PLATE.reach + side * rattle;
      if (line > 0)
        g.lineStyle(line, iron.edge).strokeRoundedRect(px - PLATE.w / 2, y - PLATE.h / 2, PLATE.w, PLATE.h, 9);
      g.fillStyle(side < 0 ? iron.shade : iron.face).fillRoundedRect(
        px - PLATE.w / 2,
        y - PLATE.h / 2,
        PLATE.w,
        PLATE.h,
        9,
      );
      g.fillStyle(iron.lit, 0.8).fillRoundedRect(px - PLATE.w / 2 + 5, y - PLATE.h / 2 + 5, 8, PLATE.h - 10, 4);
      g.fillStyle(GYM.chalk, 0.5).fillRect(px - 6, y - 18, 12, 4);
    }
  }

  private drawFace(now: number, flex: number): void {
    const g = this.face.clear();
    const effort = clamp01((flex - 0.45) / 0.45);
    const happy = this.finished && this.successful;
    const tired = this.finished && !this.successful;
    // Two eyes, an asymmetric brow and a friendly moustache read at phone scale.
    for (const [x, y, size] of [
      [61, -365, 1],
      [103, -363, 0.8],
    ] as const) {
      g.lineStyle(6, GYM.ink);
      traceContour(
        g,
        cubicContour(x - 12, y - 18, [
          [x - 4, y - 25 + effort * 9, x + 6, y - 23 + effort * 9, x + 13, y - 19 + effort * 10],
        ]),
      );
      g.strokePath();
      if (happy || (effort > 0.65 && !tired)) {
        traceContour(g, cubicContour(x - 9, y + 2, [[x - 3, y - 6, x + 5, y - 6, x + 10, y + 1]]));
        g.strokePath();
      } else {
        g.fillStyle(GYM.chalk).fillEllipse(x, y, 25 * size, 28 * size);
        g.fillStyle(GYM.ink).fillEllipse(x + 4, y + (tired ? 4 : 0), 11 * size, 16 * size);
        g.fillStyle(GYM.chalk).fillCircle(x + 2, y - 4, 2.5);
      }
    }
    // A short bridge and rounded tip sit between the eyes and over the moustache.
    // Keep the left bridge open so the nose reads as a turning plane, not a sticker.
    g.lineStyle(3.5, GYM.ink, 0.75);
    traceContour(
      g,
      cubicContour(88, -360, [
        [89, -354, 94, -352, 99, -349],
        [108, -342, 96, -336, 88, -341],
        [85, -343, 83, -343, 82, -341],
      ]),
    );
    g.strokePath();
    g.fillStyle(GYM.flush, 0.18 + this.pump * 0.1).fillEllipse(48, -340, 27, 15);
    // A little curled moustache gives the coach a warm, old-school gym personality.
    paintedContour(
      g,
      cubicContour(86, -334, [
        [98, -340, 105, -329, 116, -333],
        [115, -319, 99, -320, 90, -326],
        [77, -314, 60, -321, 59, -333],
        [69, -326, 75, -338, 86, -334],
      ]),
      GYM.ink,
      GYM.ink,
      1,
    );
    if (tired) {
      g.fillStyle(GYM.ink).fillEllipse(95, -308, 17, 15);
    } else if (effort > 0.2 || happy) {
      paintedContour(
        g,
        cubicContour(79, -316, [
          [91, -312, 102, -313, 109, -318],
          [108, -300, 85, -297, 79, -316],
        ]),
        GYM.chalk,
        GYM.ink,
        3,
      );
    } else {
      g.lineStyle(4, GYM.ink);
      traceContour(g, cubicContour(82, -311, [[90, -304, 101, -308, 106, -312]]));
      g.strokePath();
    }
    if (this.pump > 0.4 && !this.reducedMotion) {
      const bob = (now * 1.3) % 1;
      g.fillStyle(GYM.sweat, 0.9).fillEllipse(132, -374 + bob * 30, 8, 13);
    }
  }

  private drawTally(now: number): void {
    const g = this.tally.clear();
    const left = BOARD.x + 26;
    const top = BOARD.y + 66;
    g.lineStyle(5, GYM.chalk, 0.92);
    // Four strokes and a fifth across them, the way sets are counted on a real board.
    for (let i = 0; i < this.reps; i++) {
      const group = Math.floor(i / TALLY_GROUP);
      const index = i % TALLY_GROUP;
      const gx = left + (group % TALLY_GROUPS_PER_ROW) * (TALLY_STEP * 3 + 40);
      const gy = top + Math.floor(group / TALLY_GROUPS_PER_ROW) * 62;
      if (index < TALLY_GROUP - 1) g.lineBetween(gx + index * TALLY_STEP, gy, gx + index * TALLY_STEP + 3, gy + 48);
      else g.lineBetween(gx - 8, gy + 40, gx + TALLY_STEP * 3 + 10, gy + 6);
    }
    if (!this.finished || this.finishAt === null) return;
    const p = chalkDraw(now - this.finishAt - 0.15);
    if (p <= 0) return;
    if (this.successful) {
      // A ring drawn round the count once the weight is held at the top.
      const cx = BOARD.x + BOARD.w / 2;
      const cy = BOARD.y + BOARD.h / 2 + 14;
      g.lineStyle(5, GYM.chalk, 0.9)
        .beginPath()
        .arc(cx, cy, 84, -Math.PI * 0.5, -Math.PI * 0.5 + p * Math.PI * 2, false)
        .strokePath();
    } else {
      // The chalk dragged across the count: the set is not what was written.
      g.lineStyle(9, GYM.chalk, 0.35).lineBetween(left - 6, top + 44, left - 6 + p * 170, top + 10 + p * 8);
    }
  }

  /** The dropped weight in the rough coda, in stage space, and its mark on the mat. */
  private drawLoose(now: number): void {
    const g = this.loose.clear();
    if (!this.finished || this.successful || this.finishAt === null) return;
    const age = now - this.finishAt;
    const height = dropHeight(age, this.dropFrom);
    const x = this.dropX + Math.min(1, age / 0.6) * 26;
    const y = -PLATE.h / 2 - height;
    const landed = age - DROP_LANDING_SEC;
    if (landed > 0 && landed < 0.3) {
      g.lineStyle(3, GYM.chalk, (1 - landed / 0.3) * 0.8).strokeEllipse(x, -2, 160 + landed * 400, 12 + landed * 40);
    }
    this.drawDumbbell(g, x, y, now);
    if (landed > 0) g.fillStyle(GYM.ink, 0.35).fillEllipse(x, -1, 150, 10);
  }

  public translate(offset: number): void {
    this.stage.x += this.reducedMotion ? 0 : offset;
  }
  public destroy(): void {
    this.bursts.destroy();
    this.stage.destroy(true);
    this.backdrop.destroy();
  }
}
