import type Phaser from 'phaser';
import { mix, shade } from '@/ui/colour';
import { castShadow, faces } from '@/ui/light';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import { faderCut, meterLevel, scratchFinale, scratchPush, SCRATCH_MOTION, type ScratchFinale } from './scratchMotion';
import { scratchLook, type ScratchLook } from './scratchLooks';
import { clamp01 } from './motion';

/** The booth's palette. The ink is near black, so dressed type takes no outline, like the household ink. */
export const BOOTH = { ink: 0x241f2b, table: 0x2a2530, vinyl: 0x15161a, groove: 0x3a3c44, magenta: 0xe04f9a, cyan: 0x4fd3e0 } as const;
/** The record's centre and size; everything on the platter turns about this point. */
const DISC = { x: 130, y: 10, r: 150, label: 48 } as const;
const PIVOT = { x: 306, y: -150 } as const;
/** Where the stylus sits in the groove: a radius on the record, and the angle it is reached at. */
const STYLUS = { r: 118, angle: -0.95 } as const;
const FADER = { x: -210, y: 128, travel: 52 } as const;
interface ScratchHands {
  readonly skin: ReturnType<typeof faces>;
  readonly nail: number;
  readonly sleeve: ReturnType<typeof faces>;
  readonly band: number;
}
/** Three labels, cycling by task, so a level's records are not all the same pressing. */
const LABELS = [
  { paper: 0xe25c5c, ring: 0xf6e0c8, motif: 'sun' },
  { paper: 0xf1c04f, ring: 0x2a2530, motif: 'bolt' },
  { paper: 0x3c8f8c, ring: 0xf6e0c8, motif: 'wave' },
] as const;

/**
 * A hand on a record, another on the crossfader. Every beat is one short scratch: the
 * record is shoved back and drawn in, the fader is cut open and shut. A clean round
 * throws the hands up under the lights with a spin-back; a rough one skips the needle
 * clean off the record and the platter runs down.
 */
export class DjScratchVignette extends HouseholdVignette {
  /** Which night in the booth. The scratch does not change. */
  private readonly look: ScratchLook;
  private readonly hands: ScratchHands;
  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = scratchLook(lap);
    super(scene, look.paper, look.glow);
    this.look = look;
    this.hands = { skin: faces(0xc98a5e), nail: 0xf1d3bd, sleeve: faces(look.sleeve), band: look.band };
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const roundId = this.plan?.id ?? 1;
    const label = LABELS[(roundId - 1) % LABELS.length]!;
    const age = now - this.strikeAt;
    const finale = scratchFinale(ending, this.successful, this.still);
    const push = finale.handsUp > 0 ? 0 : scratchPush(age, beat);
    const cut = faderCut(age, beat);
    const hits = this.watching ? this.demoTimes.length : this.hitTimes.length;
    const level = ending >= 0 ? (this.successful ? 1 : 0) : meterLevel(hits, this.plan?.targets.length ?? 4);
    // The platter's idle turn, run down after a skip; the scratch and the spin-back are laid on top of it.
    const finishAt = this.finishAt ?? now;
    const idle = this.still ? 0 : (ending >= 0 && !this.successful
      ? finishAt * SCRATCH_MOTION.spinRadPerSec + (now - finishAt) * SCRATCH_MOTION.spinRadPerSec * (1 - finale.stopped)
      : now * SCRATCH_MOTION.spinRadPerSec);
    const angle = idle - push * SCRATCH_MOTION.pushRadians - finale.spinback;
    const jolt = !this.still && now - this.errorAt < 0.25 ? Math.sin((now - this.errorAt) * 70) * (1 - (now - this.errorAt) / 0.25) * 3 : 0;

    this.booth(g, finale, now);
    this.mixer(g, level, cut, ending, now);
    this.turntable(g);
    this.record(g, angle, label, finale, ending);
    this.tonearm(g, finale, now);
    this.scratchHand(g, push, finale, now, jolt);
    this.faderHand(g, cut, finale);
    if (finale.lights > 0.6 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.7) / 0.9) * Math.PI);
      sparkle(g, -40, -200, 14 * a, a);
      sparkle(g, 250, -190, 11 * a, a);
      sparkle(g, -290, -60, 9 * a, a);
    }
  }

  // ------------------------------------------------------------------ The room

  /** The booth table with its edge, the room behind it, and the lights that come up on a clean round. */
  private booth(g: Phaser.GameObjects.Graphics, finale: ScratchFinale, now: number): void {
    const table = faces(BOOTH.table);
    slab(g, -346, -246, 692, 490, table.face, 22, BOOTH.ink);
    // The back wall of the booth, a shade darker, with a strip of LED tape along the join.
    g.fillStyle(shade(BOOTH.table, -0.35)).fillRoundedRect(-340, -240, 680, 60, { tl: 18, tr: 18, br: 0, bl: 0 });
    const glow = 0.35 + finale.lights * 0.65;
    g.fillStyle(mix(this.look.warm, this.look.cool, 0.5 + Math.sin(now * 2) * 0.5 * (this.still ? 0 : 1)), glow * 0.8).fillRect(-330, -184, 660, 4);
    g.fillStyle(0xffffff, glow * 0.25).fillRect(-330, -185, 660, 1.5);
    // The table's front edge and its wear.
    g.fillStyle(table.lit, 0.35).fillRect(-330, -178, 660, 3);
    g.fillStyle(table.edge).fillRoundedRect(-346, 226, 692, 18, { tl: 0, tr: 0, br: 22, bl: 22 });
    // Two moving-head beams cross the booth when the round lands, drawn before the gear so they fall behind it.
    if (finale.lights > 0) {
      const sweep = this.still ? 0 : Math.sin(now * 1.6) * 60;
      g.fillStyle(this.look.warm, 0.3 * finale.lights);
      g.fillTriangle(-300, -246, 40 + sweep, 120, -160 + sweep, 160);
      g.fillStyle(this.look.cool, 0.3 * finale.lights);
      g.fillTriangle(300, -246, -40 - sweep, 120, 160 - sweep, 160);
      g.fillStyle(0xffffff, 0.1 * finale.lights).fillRoundedRect(-346, -246, 692, 490, 22);
    }
  }

  /** A two-channel mixer: gain and EQ knobs, two line faders, the crossfader, and the meter the scratches light up. */
  private mixer(g: Phaser.GameObjects.Graphics, level: number, cut: number, ending: number, now: number): void {
    const body = faces(0x3b3f48);
    const drop = castShadow(12);
    g.fillStyle(BOOTH.ink, drop.alpha + 0.15).fillRoundedRect(-330 + drop.dx, -128 + drop.dy, 244, 302, 14);
    g.fillStyle(body.edge).fillRoundedRect(-330, -128, 244, 302, 14);
    g.fillStyle(body.face).fillRoundedRect(-330, -134, 244, 296, 14);
    g.fillStyle(body.lit, 0.5).fillRoundedRect(-326, -130, 236, 6, 3);
    g.lineStyle(2.5, BOOTH.ink).strokeRoundedRect(-330, -134, 244, 296, 14);
    // Knobs in two channels: a cap with a lit edge and a pointer, each turned a little differently.
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      const kx = -286 + col * 90, ky = -100 + row * 46;
      const turn = -2.2 + ((row * 2 + col) % 5) * 0.7;
      g.fillStyle(BOOTH.ink, 0.5).fillCircle(kx + 2, ky + 3, 14);
      g.fillStyle(0x1e2126).fillCircle(kx, ky, 14);
      g.fillStyle(0x30343b).fillCircle(kx, ky, 11);
      g.fillStyle(0x4a4f58, 0.8).beginPath().arc(kx, ky, 11, Math.PI * 1.1, Math.PI * 1.7, false).lineTo(kx, ky).closePath().fillPath();
      g.lineStyle(2.5, [0xf1c04f, 0xffffff, 0x4fd3e0][row]!).lineBetween(kx, ky, kx + Math.cos(turn) * 9, ky + Math.sin(turn) * 9);
      g.fillStyle(0x8a9099, 0.6).fillCircle(kx - 20, ky, 1.5);
    }
    // Channel faders, and the crossfader slot along the bottom, its knob cut open on the beat.
    for (const fx of [-286, -196]) {
      g.fillStyle(0x1e2126).fillRoundedRect(fx - 4, 34, 8, 76, 3);
      g.fillStyle(0xe8e6e1).fillRoundedRect(fx - 12, 44 + (fx < -240 ? 0 : 18), 24, 12, 3);
      g.fillStyle(0x9aa0a8).fillRect(fx - 10, 49 + (fx < -240 ? 0 : 18), 20, 2);
    }
    g.fillStyle(0x1e2126).fillRoundedRect(FADER.x - FADER.travel - 10, FADER.y - 5, FADER.travel * 2 + 20, 10, 4);
    g.lineStyle(1.5, 0x5a6068).lineBetween(FADER.x - FADER.travel - 8, FADER.y + 12, FADER.x + FADER.travel + 8, FADER.y + 12);
    for (let i = -2; i <= 2; i++) g.lineBetween(FADER.x + i * FADER.travel / 2, FADER.y + 9, FADER.x + i * FADER.travel / 2, FADER.y + 15);
    const knobX = FADER.x - FADER.travel + cut * FADER.travel * 2;
    g.fillStyle(BOOTH.ink, 0.5).fillRoundedRect(knobX - 11, FADER.y - 8, 26, 22, 4);
    g.fillStyle(0xe8e6e1).fillRoundedRect(knobX - 13, FADER.y - 11, 26, 22, 4);
    g.fillStyle(0xbfc4ca).fillRoundedRect(knobX - 13, FADER.y + 1, 26, 10, { tl: 0, tr: 0, br: 4, bl: 4 });
    g.fillStyle(0x6a7078).fillRect(knobX - 9, FADER.y - 4, 18, 2);
    // The meter: two columns of eight, green to red, lit to the level. A clean round pumps them; a rough one leaves one red.
    const pump = ending >= 0 && this.successful && !this.still ? (Math.sin(now * 14) + 1) / 2 : 0;
    for (let col = 0; col < 2; col++) for (let i = 0; i < 8; i++) {
      const lx = -130 + col * 16, ly = 96 - i * 18;
      const colour = i < 4 ? 0x5fcf6a : i < 6 ? 0xf1c04f : 0xe25c5c;
      const lit = ending >= 0 && !this.successful ? i === 7 : (i + 1) / 8 <= level + pump * 0.15 + (col === 1 ? -0.06 : 0);
      g.fillStyle(0x1e2126).fillRoundedRect(lx - 6, ly - 6, 12, 12, 2);
      g.fillStyle(colour, lit ? 1 : 0.18).fillRoundedRect(lx - 5, ly - 5, 10, 10, 2);
      if (lit) g.fillStyle(0xffffff, 0.35).fillRect(lx - 3, ly - 3, 6, 2);
    }
    // Headphones hooked over the mixer's far corner, their lead trailing under it.
    const cup = faces(0x2b2b30);
    g.lineStyle(7, cup.face).beginPath().arc(-300, -150, 26, Math.PI * 1.05, Math.PI * 1.95, false).strokePath();
    g.lineStyle(2, cup.lit, 0.6).beginPath().arc(-300, -151, 26, Math.PI * 1.15, Math.PI * 1.5, false).strokePath();
    for (const side of [-1, 1]) {
      g.fillStyle(cup.face).fillEllipse(-300 + side * 26, -142, 18, 26);
      g.fillStyle(this.look.warm, 0.8).fillEllipse(-300 + side * 26, -142, 10, 16);
      g.lineStyle(2, cup.edge).strokeEllipse(-300 + side * 26, -142, 18, 26);
    }
    g.lineStyle(2.5, 0x1e2126).beginPath().moveTo(-274, -132).lineTo(-262, -110).lineTo(-278, -96).lineTo(-262, -84).strokePath();
  }

  /** The plinth and the platter under the record, with the strobe dots on the platter's rim and the start button. */
  private turntable(g: Phaser.GameObjects.Graphics): void {
    const plinth = faces(0x4a4e57);
    const drop = castShadow(14);
    g.fillStyle(BOOTH.ink, drop.alpha + 0.15).fillRoundedRect(-58 + drop.dx, -176 + drop.dy, 400, 380, 18);
    g.fillStyle(plinth.edge).fillRoundedRect(-58, -170, 400, 380, 18);
    g.fillStyle(plinth.face).fillRoundedRect(-58, -176, 400, 376, 18);
    g.fillStyle(plinth.lit, 0.5).fillRoundedRect(-54, -172, 392, 6, 3);
    g.lineStyle(2.5, BOOTH.ink).strokeRoundedRect(-58, -176, 400, 376, 18);
    // Start/stop button, pitch slider and the strobe lamp in the corner.
    g.fillStyle(0x1e2126).fillRoundedRect(-44, 150, 46, 30, 6);
    g.fillStyle(0x30343b).fillRoundedRect(-42, 148, 42, 26, 5);
    g.fillStyle(0x5fcf6a, 0.9).fillTriangle(-30, 154, -30, 168, -18, 161);
    g.fillStyle(0x5fcf6a).fillRect(-14, 154, 4, 14);
    g.fillStyle(0x1e2126).fillRoundedRect(300, -120, 8, 200, 3);
    g.fillStyle(0xe8e6e1).fillRoundedRect(292, -30, 24, 12, 3);
    g.fillStyle(0xe25c5c, 0.9).fillCircle(-30, -140, 6);
    g.fillStyle(0xffffff, 0.5).fillCircle(-32, -142, 2);
    // The platter: a brushed rim with strobe dots, then the mat under the record.
    g.fillStyle(BOOTH.ink, 0.5).fillCircle(DISC.x + 3, DISC.y + 5, DISC.r + 12);
    g.fillStyle(0x8a9099).fillCircle(DISC.x, DISC.y, DISC.r + 12);
    g.fillStyle(0xb8bec6, 0.7).beginPath().arc(DISC.x, DISC.y, DISC.r + 12, Math.PI * 1.05, Math.PI * 1.55, false).arc(DISC.x, DISC.y, DISC.r + 4, Math.PI * 1.55, Math.PI * 1.05, true).closePath().fillPath();
    g.fillStyle(0x3a3f47);
    for (let i = 0; i < 48; i++) {
      const a = i * Math.PI / 24;
      g.fillCircle(DISC.x + Math.cos(a) * (DISC.r + 7), DISC.y + Math.sin(a) * (DISC.r + 7), 1.8);
    }
    g.lineStyle(2, BOOTH.ink).strokeCircle(DISC.x, DISC.y, DISC.r + 12);
    g.fillStyle(0x2f3138).fillCircle(DISC.x, DISC.y, DISC.r + 3);
  }

  /** The record: grooves, a fixed sheen from the room light, and a label and cue sticker that turn with it. */
  private record(g: Phaser.GameObjects.Graphics, angle: number, label: (typeof LABELS)[number], finale: ScratchFinale, ending: number): void {
    const { x, y, r } = DISC;
    g.fillStyle(BOOTH.vinyl).fillCircle(x, y, r);
    for (let gr = 58; gr < r - 4; gr += 6) {
      g.lineStyle(1, BOOTH.groove, 0.12 + ((gr / 6) % 3) * 0.08).strokeCircle(x, y, gr);
    }
    // The sheen is the room's light on the vinyl: it does not turn with the record.
    g.fillStyle(0x6a6f7c, 0.22).beginPath().arc(x, y, r - 6, Math.PI * 1.05, Math.PI * 1.45, false).arc(x, y, DISC.label + 14, Math.PI * 1.45, Math.PI * 1.05, true).closePath().fillPath();
    g.fillStyle(0x6a6f7c, 0.12).beginPath().arc(x, y, r - 6, Math.PI * 0.05, Math.PI * 0.45, false).arc(x, y, DISC.label + 14, Math.PI * 0.45, Math.PI * 0.05, true).closePath().fillPath();
    // Two wider bands where tracks start: they turn, which is what shows the platter moving.
    for (const [ba, br] of [[0.4, 96], [2.6, 128]] as const) {
      g.lineStyle(3, 0x0c0d10, 0.9).beginPath().arc(x, y, br, angle + ba, angle + ba + 0.5, false).strokePath();
    }
    // The cue sticker on the run-in, a strip of white tape.
    const sa = angle + 1.9;
    const sx = x + Math.cos(sa) * (r - 14), sy = y + Math.sin(sa) * (r - 14);
    g.save().translateCanvas(sx, sy).rotateCanvas(sa + Math.PI / 2);
    g.fillStyle(0xf3f1ea).fillRoundedRect(-4, -12, 8, 24, 2);
    g.fillStyle(0xe25c5c).fillRect(-4, -4, 8, 3);
    g.restore();
    // The label, turned with the record: a paper disc, a ring of type, a motif and the spindle.
    const paper = faces(label.paper);
    g.fillStyle(paper.face).fillCircle(x, y, DISC.label);
    g.fillStyle(paper.lit, 0.6).beginPath().arc(x, y, DISC.label, Math.PI * 1.05, Math.PI * 1.55, false).lineTo(x, y).closePath().fillPath();
    g.lineStyle(2, paper.edge).strokeCircle(x, y, DISC.label);
    g.lineStyle(2.5, label.ring, 0.9);
    for (let i = 0; i < 14; i++) {
      const a = angle + i * 0.35, len = 0.12 + (i % 3) * 0.05;
      if (i % 5 === 4) continue;
      g.beginPath().arc(x, y, DISC.label - 9, a, a + len, false).strokePath();
    }
    this.motif(g, x, y, angle, label);
    g.fillStyle(0x8a9099).fillCircle(x, y, 6);
    g.fillStyle(0x1e2126).fillCircle(x, y, 3);
    // On a rough round the platter running down leaves the vinyl under a dead needle: a scuff where it skidded.
    if (ending >= 0 && !this.successful && finale.skip > 0) {
      const from = STYLUS.angle, mid = from + 0.25;
      g.lineStyle(2, 0x9aa0a8, 0.5 * finale.skip).beginPath().arc(x, y, STYLUS.r + finale.skip * 20, from, mid, false).strokePath();
    }
  }

  /** A little device in the label's centre, so the three pressings read as three records. */
  private motif(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, label: (typeof LABELS)[number]): void {
    const ink = label.ring;
    if (label.motif === 'sun') {
      g.lineStyle(2, ink, 0.9);
      for (let i = 0; i < 8; i++) {
        const a = angle + i * Math.PI / 4;
        g.lineBetween(x + Math.cos(a) * 14, y + Math.sin(a) * 14, x + Math.cos(a) * 22, y + Math.sin(a) * 22);
      }
    } else if (label.motif === 'bolt') {
      const p = (px: number, py: number): [number, number] => [x + px * Math.cos(angle) - py * Math.sin(angle), y + px * Math.sin(angle) + py * Math.cos(angle)];
      shape(g, [...p(-4, -24), ...p(8, -24), ...p(2, -4), ...p(12, -4), ...p(-6, 24), ...p(-1, 2), ...p(-11, 2)], ink, shade(label.paper, -0.5), 1.5);
    } else {
      g.lineStyle(2.5, ink, 0.9);
      for (const off of [-10, 0, 10]) {
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const u = -20 + i * (40 / 12), v = off + Math.sin(i * 1.05) * 4;
          const px = x + u * Math.cos(angle) - v * Math.sin(angle), py = y + u * Math.sin(angle) + v * Math.cos(angle);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokePath();
      }
    }
  }

  /** The tonearm from its pivot to the headshell, riding the groove until a rough round throws it off. */
  private tonearm(g: Phaser.GameObjects.Graphics, finale: ScratchFinale, now: number): void {
    const arm = faces(0xb8bec6);
    const jitter = finale.skip > 0 && finale.skip < 1 && !this.still ? Math.sin(now * 90) * 4 * (1 - finale.skip) : 0;
    const sr = STYLUS.r + finale.skip * 46, sa = STYLUS.angle + finale.skip * 0.12;
    const nx = DISC.x + Math.cos(sa) * sr + jitter, ny = DISC.y + Math.sin(sa) * sr;
    // The base and counterweight behind the pivot.
    g.fillStyle(BOOTH.ink, 0.45).fillCircle(PIVOT.x + 3, PIVOT.y + 5, 22);
    g.fillStyle(0x2f3138).fillCircle(PIVOT.x, PIVOT.y, 22);
    g.fillStyle(0x4a4e57).fillCircle(PIVOT.x, PIVOT.y, 16);
    const back = Math.atan2(PIVOT.y - ny, PIVOT.x - nx);
    g.lineStyle(9, arm.shade).lineBetween(PIVOT.x, PIVOT.y, PIVOT.x + Math.cos(back) * 40, PIVOT.y + Math.sin(back) * 40);
    g.fillStyle(0x1e2126).fillCircle(PIVOT.x + Math.cos(back) * 44, PIVOT.y + Math.sin(back) * 44, 12);
    g.fillStyle(0x3a3f47).fillCircle(PIVOT.x + Math.cos(back) * 44, PIVOT.y + Math.sin(back) * 44, 8);
    // The arm: its shadow on the record, then the tube with a lit edge, then the headshell.
    g.lineStyle(7, BOOTH.ink, 0.35).lineBetween(PIVOT.x + 4, PIVOT.y + 6, nx + 4, ny + 6);
    g.lineStyle(7, arm.face).lineBetween(PIVOT.x, PIVOT.y, nx, ny);
    g.lineStyle(2, arm.rim, 0.8).lineBetween(PIVOT.x - 1, PIVOT.y - 2, nx - 1, ny - 2);
    g.fillStyle(arm.face).fillCircle(PIVOT.x, PIVOT.y, 8);
    const ha = Math.atan2(ny - PIVOT.y, nx - PIVOT.x);
    g.save().translateCanvas(nx, ny).rotateCanvas(ha);
    g.fillStyle(0x1e2126).fillRoundedRect(-6, -8, 26, 16, 4);
    g.fillStyle(0x30343b).fillRoundedRect(-6, -8, 26, 8, { tl: 4, tr: 4, br: 0, bl: 0 });
    g.fillStyle(0xe25c5c).fillRect(10, -3, 8, 6);
    g.fillStyle(0xf3f1ea).fillRect(14, 7, 2, 5);
    g.restore();
    // Sparks and a puff where the stylus skids.
    if (finale.skip > 0 && finale.skip < 0.9 && !this.still) {
      g.lineStyle(2, 0xf1c04f, 1 - finale.skip);
      for (let i = 0; i < 4; i++) {
        const a = -1.2 + i * 0.5, d = 10 + finale.skip * 30;
        g.lineBetween(nx, ny, nx + Math.cos(a) * d, ny + Math.sin(a) * d);
      }
    }
  }

  /**
   * The scratching hand: it rides the record, fingertips down, and moves with it through
   * the shove. On a clean round it comes off and goes up; the sleeve stays anchored at
   * the table's edge, so the wrist bends with the reach.
   */
  private scratchHand(g: Phaser.GameObjects.Graphics, push: number, finale: ScratchFinale, now: number, jolt: number): void {
    const { skin, sleeve } = this.hands;
    // The palm rests low on the record's near side; it turns about the spindle with the shove.
    const rest = 0.78, reach = 100;
    const a = rest - push * SCRATCH_MOTION.pushRadians;
    const lift = finale.handsUp;
    const px = DISC.x + Math.cos(a) * reach - lift * 40 + jolt, py = DISC.y + Math.sin(a) * reach - lift * 215;
    const wave = lift > 0.9 && !this.still ? Math.sin(now * 9) * 0.25 : 0;
    // The hand's own frame: fingers point toward the record's centre, up and to the left.
    const heading = Math.atan2(DISC.y - py, DISC.x - px) + wave + lift * 0.9;
    const cos = Math.cos(heading), sin = Math.sin(heading);
    const at = (u: number, v: number): [number, number] => [px + u * cos - v * sin, py + u * sin + v * cos];
    // The sleeve from the table's edge to the wrist, with a wristband.
    const wrist = at(-34, 0);
    const drop = castShadow(8 + lift * 30);
    g.fillStyle(BOOTH.ink, 0.3 + lift * 0.1).fillEllipse(px + drop.dx, py + drop.dy + 6, 72, 60);
    g.lineStyle(38, sleeve.face).lineBetween(320, 262, wrist[0], wrist[1]);
    g.lineStyle(10, sleeve.lit, 0.6).lineBetween(312, 262, wrist[0] - 8, wrist[1] - 2);
    g.lineStyle(8, sleeve.edge, 0.7).lineBetween(328, 262, wrist[0] + 8, wrist[1] + 6);
    g.lineStyle(12, this.hands.band).lineBetween(...at(-38, -20), ...at(-38, 20));
    g.lineStyle(3, shade(this.hands.band, -0.4), 0.8).lineBetween(...at(-36, -18), ...at(-36, 18));
    // Fingers first, so the palm covers their roots; the thumb spread wide on the near side.
    const fingers: readonly [number, number, number][] = [[-22, 44, 0.9], [-8, 56, 1], [8, 54, 1], [22, 42, 0.9]];
    for (const [side, len, w] of fingers) {
      const root = at(6, side), tip = at(6 + len * (1 - lift * 0.1), side * (1 + lift * 0.4));
      g.lineStyle(17 * w, skin.shade).lineBetween(root[0] + 2, root[1] + 3, tip[0] + 2, tip[1] + 3);
      g.lineStyle(16 * w, skin.face).lineBetween(...root, ...tip);
      g.lineStyle(5 * w, skin.lit, 0.7).lineBetween(...at(10, side - 4), ...at(2 + len * 0.8, side - 4));
      // Knuckle creases, and the nail on the tip.
      g.lineStyle(1.5, skin.edge, 0.6).lineBetween(...at(6 + len * 0.55, side - 6), ...at(6 + len * 0.55, side + 6));
      g.fillStyle(this.hands.nail, 0.9).fillEllipse(...at(6 + len - 4, side), 8 * w, 6 * w);
    }
    const thumbTip = at(18, 46 + lift * 6);
    g.lineStyle(16, skin.face).lineBetween(...at(-12, 24), ...thumbTip);
    g.lineStyle(4, skin.lit, 0.7).lineBetween(...at(-10, 20), ...at(14, 40));
    g.fillStyle(this.hands.nail, 0.9).fillEllipse(...thumbTip, 8, 6);
    // The palm, its shaded heel, and a ring on the third finger.
    shape(g, [...at(-30, -28), ...at(14, -30), ...at(20, 30), ...at(-24, 32)], skin.face, skin.edge, 2.5);
    g.fillStyle(skin.shade, 0.7);
    g.beginPath().moveTo(...at(-30, -28)).lineTo(...at(-12, -28)).lineTo(...at(-10, 30)).lineTo(...at(-24, 32)).closePath().fillPath();
    g.fillStyle(skin.lit, 0.6).fillEllipse(...at(0, -10), 20, 14);
    g.lineStyle(1.5, skin.edge, 0.5).lineBetween(...at(-6, -22), ...at(4, 18)).lineBetween(...at(-14, -10), ...at(-4, 24));
    g.lineStyle(4, this.hands.band).lineBetween(...at(14, 4), ...at(14, 14));
    g.fillStyle(0x4fd3e0).fillCircle(...at(14, 9), 2.5);
  }

  /** The fader hand: index finger on the crossfader knob, the rest curled, cutting on the beat. */
  private faderHand(g: Phaser.GameObjects.Graphics, cut: number, finale: ScratchFinale): void {
    const { skin, sleeve } = this.hands;
    const lift = finale.handsUp;
    const knobX = FADER.x - FADER.travel + cut * FADER.travel * 2;
    const px = knobX - 30 + lift * 30, py = FADER.y + 40 - lift * 200;
    const heading = -0.35 + lift * 0.5;
    const cos = Math.cos(heading), sin = Math.sin(heading);
    const at = (u: number, v: number): [number, number] => [px + u * cos - v * sin, py + u * sin + v * cos];
    const drop = castShadow(8 + lift * 30);
    g.fillStyle(BOOTH.ink, 0.3).fillEllipse(px + drop.dx, py + drop.dy + 6, 58, 48);
    const wrist = at(-30, 0);
    g.lineStyle(32, sleeve.face).lineBetween(-300, 262, wrist[0], wrist[1]);
    g.lineStyle(8, sleeve.lit, 0.6).lineBetween(-306, 262, wrist[0] - 6, wrist[1] - 2);
    g.lineStyle(10, this.hands.band).lineBetween(...at(-32, -16), ...at(-32, 16));
    // Curled fingers as a stack of short knuckles, then the index reaching the knob.
    for (let i = 0; i < 3; i++) {
      const v = -2 + i * 12;
      g.lineStyle(13, skin.shade).lineBetween(...at(8, v), ...at(26, v + 4));
      g.lineStyle(12, skin.face).lineBetween(...at(8, v), ...at(24, v + 4));
      g.fillStyle(skin.lit, 0.6).fillCircle(...at(22, v + 2), 3);
    }
    const tip: [number, number] = [knobX, FADER.y - 2 - lift * 160];
    g.lineStyle(14, skin.face).lineBetween(...at(10, -18), ...tip);
    g.lineStyle(4, skin.lit, 0.7).lineBetween(...at(12, -22), tip[0] - 4, tip[1] - 3);
    g.fillStyle(this.hands.nail, 0.9).fillEllipse(tip[0] + 2, tip[1] - 2, 7, 5);
    shape(g, [...at(-26, -22), ...at(10, -24), ...at(12, 24), ...at(-22, 26)], skin.face, skin.edge, 2.5);
    g.fillStyle(skin.shade, 0.7);
    g.beginPath().moveTo(...at(-26, -22)).lineTo(...at(-12, -22)).lineTo(...at(-10, 24)).lineTo(...at(-22, 26)).closePath().fillPath();
    g.fillStyle(skin.lit, 0.6).fillEllipse(...at(0, -6), 16, 12);
  }
}
