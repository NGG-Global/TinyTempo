import type Phaser from 'phaser';
import { mix, shade } from '@/ui/colour';
import { castShadow, faces, type Faces } from '@/ui/light';
import { fillContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import {
  clapFinale, clapOutcome, clapRing, crowdClap, CROWD_HANDS, handGap, palmSquash, roomWarmth,
  type ClapFinale, type ClapOutcome, type CrowdHand,
} from './clapMotion';
import { clamp01 } from './motion';

/** The room's palette. The ink is a deep warm brown, so dressed type takes no outline. */
export const ROOM = { ink: 0x3b2a2e, wall: 0xdcc3a6, floor: 0xb4906d, warm: 0xf7d489 } as const;
/** The clapping hands, and the sleeve one of them comes out of. */
const MAIN = { skin: faces(0xdb9d6e), nail: 0xf3ddc4, sleeve: faces(0x4f7a6a), cuff: 0xf2e6d2 } as const;
/** Three tones in the crowd, so it is a room of people and not one hand drawn eleven times. */
const CROWD_SKIN: readonly Faces[] = [faces(0xe4b184), faces(0xc18351), faces(0x8f5c35)];
const CROWD_SLEEVE: readonly number[] = [0x9a5f52, 0x4a6478, 0x7a6a94];
/** The room the act stands in: a slab, like every other act's table or bench. */
const STAGE = { half: 352, top: -250, bottom: 250, radius: 24, floor: 150 } as const;
/** Where the palms meet, how far the rebound throws them, and how high the pair sits. */
const SPREAD = { contact: 52, open: 124, y: -40 } as const;
/** How far the hands splay open at the top of the rebound, and how far they turn over in the shrug. */
const TURN = { splay: 0.26, shrug: 1.08 } as const;
const PALM = { half: 50, top: -52, wrist: 74, radius: 22, taper: 0.2 } as const;
/** Root across the palm, length, and width, from the little finger to the index. */
const FINGERS: readonly [number, number, number][] = [[-36, 72, 0.84], [-13, 92, 1], [11, 88, 0.98], [34, 70, 0.88]];
const FINGER_W = 27;

/** A point in a hand's own frame: `u` runs outward from the centre line, `v` down the hand. */
type Local = (u: number, v: number) => [number, number];

/**
 * A rounded box traced in some hand's local frame — the one shape a palm, a cuff and a
 * crowd mitt all want. `taper` narrows it toward the wrist, which is the difference
 * between a hand and a mitten.
 */
function roundedBox(at: Local, u0: number, v0: number, u1: number, v1: number, r: number, taper = 0): number[] {
  const points: number[] = [];
  const corners: readonly [number, number, number][] = [
    [u1 - r, v0 + r, -Math.PI / 2], [u1 - r, v1 - r, 0], [u0 + r, v1 - r, Math.PI / 2], [u0 + r, v0 + r, Math.PI],
  ];
  for (const [cu, cv, from] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = from + i / 4 * (Math.PI / 2);
      const u = cu + Math.cos(a) * r, v = cv + Math.sin(a) * r;
      points.push(...at(u * (1 - taper * clamp01((v - v0) / (v1 - v0))), v));
    }
  }
  return points;
}

/**
 * Two hands clapping. The beat is the contact: the palms meet, flatten, and are thrown
 * apart to wait for the next one. A clean round brings the room up — the hands carry on
 * applauding and a crowd of them rises behind, under the light. A middling round gets a
 * scattered few. A rough one gets nobody at all: the hands come apart, turn palms up, and
 * hold the shrug.
 */
export class ClappingHandsVignette extends HouseholdVignette {
  private outcome: ClapOutcome = 'fail';

  public constructor(scene: Phaser.Scene) { super(scene, 0xe7d5bd, ROOM.warm); }

  public override finish(successful: boolean, contactSec: number, accuracy = successful ? 100 : 0): void {
    super.finish(successful, contactSec);
    this.outcome = clapOutcome(accuracy);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const age = now - this.strikeAt;
    const finale = clapFinale(ending, this.outcome, this.still);
    // Once the round is resolved the hands are applauding, shrugging or waiting; until
    // then they are answering the beat.
    const gap = ending >= 0 ? finale.open : handGap(age, beat);
    const squash = ending >= 0 ? 0 : palmSquash(age, beat);
    const hits = this.watching ? this.demoTimes.length : this.hitTimes.length;
    const warmth = ending >= 0 ? finale.lights : roomWarmth(hits, this.plan?.targets.length ?? 4);
    // A tap that hit nothing, or a beat that went by, shakes both hands the same way.
    const since = now - this.errorAt;
    const jolt = !this.still && since < 0.25 ? Math.sin(since * 64) * (1 - since / 0.25) * 5 : 0;

    this.room(g, warmth, finale);
    this.crowd(g, finale, now);
    if (ending < 0) this.ring(g, clapRing(age, beat));
    for (const side of [-1, 1] as const) this.hand(g, side, gap, squash, finale, jolt);
    if (finale.lights > 0.6 && !this.still) {
      const a = Math.sin(clamp01((ending - 0.6) / 1.0) * Math.PI);
      sparkle(g, -284, -164, 15 * a, a);
      sparkle(g, 266, -192, 12 * a, a);
      sparkle(g, 70, -218, 10 * a, a);
    }
  }

  // ------------------------------------------------------------------ The room

  /** The wall, the floor the crowd stands behind, and the pool of warmth the landed claps raise. */
  private room(g: Phaser.GameObjects.Graphics, warmth: number, finale: ClapFinale): void {
    const wall = faces(ROOM.wall), floor = faces(ROOM.floor);
    const { half, top, bottom, radius, floor: line } = STAGE;
    slab(g, -half, top, half * 2, bottom - top, wall.face, radius, ROOM.ink);
    g.fillStyle(wall.lit, 0.3).fillRoundedRect(-half + 4, top + 4, half * 2 - 8, 96, { tl: radius, tr: radius, br: 0, bl: 0 });
    // The warmth: a pool of light on the wall behind the hands, one step wider per landed
    // clap. It is the room warming up rather than a halo stuck to the hands.
    const r = 130 + warmth * 180;
    for (const [step, alpha] of [[1, 0.1], [0.78, 0.12], [0.52, 0.16]] as const) {
      g.fillStyle(mix(ROOM.wall, ROOM.warm, 0.4 + (1 - step) * 0.8), alpha * (0.7 + warmth)).fillCircle(0, SPREAD.y, r * step);
    }
    // The floor, with the shadow line where it meets the wall.
    g.fillStyle(floor.face).fillRoundedRect(-half, line, half * 2, bottom - line, { tl: 0, tr: 0, br: radius, bl: radius });
    g.fillStyle(shade(ROOM.wall, -0.2), 0.7).fillRect(-half + 2, line - 10, half * 2 - 4, 12);
    g.fillStyle(floor.lit, 0.3).fillRect(-half + 2, line + 14, half * 2 - 4, 5);
    if (finale.lights > 0) {
      g.fillStyle(0xfff3d4, 0.18 * finale.lights).fillRoundedRect(-half, top, half * 2, bottom - top, radius);
    }
    g.lineStyle(3, ROOM.ink, 0.45).lineBetween(-half + 4, line, half - 4, line);
  }

  /** The ring of air a clap throws out: two arcs leaving the palms, wider and fainter as they go. */
  private ring(g: Phaser.GameObjects.Graphics, ring: number): void {
    if (ring <= 0) return;
    const alpha = (1 - ring) * 0.45;
    for (const [r, w] of [[58, 4], [104, 2.5]] as const) {
      const radius = r + ring * 110;
      g.lineStyle(w, 0xfff6de, alpha);
      for (const side of [-1, 1] as const) {
        g.beginPath().arc(0, SPREAD.y, radius, side > 0 ? -0.85 : Math.PI + 0.85, side > 0 ? 0.85 : Math.PI - 0.85, side < 0).strokePath();
      }
    }
  }

  // ------------------------------------------------------------------ The two hands

  /**
   * One of the pair. Everything is laid out in the hand's own frame, and the left hand is
   * that frame mirrored — so the two hands are one drawing and cannot drift apart from
   * each other.
   */
  private hand(g: Phaser.GameObjects.Graphics, side: -1 | 1, gap: number, squash: number, finale: ClapFinale, jolt: number): void {
    const { skin, nail, sleeve } = MAIN;
    const cx = side * (SPREAD.contact + gap * (SPREAD.open - SPREAD.contact)) + jolt;
    const cy = SPREAD.y - finale.shrug * 20;
    // The hands hinge at the wrist, so their tops come apart further than their heels do;
    // the shrug carries on turning the same way until the palm is up.
    const rot = side * (gap * TURN.splay + finale.shrug * TURN.shrug);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const sx = 1 - squash * 0.12;
    const at: Local = (u, v) => {
      const lx = side * u * sx;
      return [cx + lx * cos - v * sin, cy + lx * sin + v * cos];
    };
    const palmUp = finale.shrug > 0.5;

    const drop = castShadow(12);
    g.fillStyle(ROOM.ink, drop.alpha).fillEllipse(cx + drop.dx, cy + drop.dy + 52, 118, 74);
    // The forearm, running off the bottom of the room, with a cuff at the wrist.
    const wrist = at(0, PALM.wrist - 6);
    g.lineStyle(46, sleeve.face).lineBetween(side * 236, STAGE.bottom, wrist[0], wrist[1]);
    g.lineStyle(11, sleeve.lit, 0.45).lineBetween(side * 222, STAGE.bottom, wrist[0] - side * 12, wrist[1] - 4);
    g.lineStyle(9, sleeve.edge, 0.55).lineBetween(side * 252, STAGE.bottom, wrist[0] + side * 12, wrist[1] + 8);
    shape(g, roundedBox(at, -46, PALM.wrist - 18, 46, PALM.wrist + 8, 9), MAIN.cuff, shade(MAIN.cuff, -0.4), 2.5);

    // Fingers first, so the palm covers their roots. They fan a little, and wider still in
    // the shrug, where the hand has given up holding itself together.
    const fan = 1.12 + finale.shrug * 0.45;
    for (const [u, len, w] of FINGERS) {
      const root = at(u, PALM.top + 22), tip = at(u * fan, PALM.top - len);
      g.lineStyle(FINGER_W * w + 3, skin.edge).lineBetween(...root, ...tip);
      g.lineStyle(FINGER_W * w, skin.face).lineBetween(...root, ...tip);
      g.fillStyle(skin.face).fillCircle(...tip, FINGER_W * w / 2);
      g.lineStyle(2, skin.edge, 0.5).beginPath().arc(...tip, FINGER_W * w / 2, 0, Math.PI * 2).strokePath();
      g.lineStyle(6 * w, palmUp ? skin.shade : skin.lit, 0.45).lineBetween(...at(u - 7, PALM.top + 6), ...at(u * fan - 7, PALM.top - len * 0.82));
      // The middle knuckle, and the nail — which is on the other side once the hand has turned over.
      g.lineStyle(2, skin.edge, 0.22).lineBetween(...at(u - 7, PALM.top - len * 0.44), ...at(u + 7, PALM.top - len * 0.44));
      if (!palmUp) g.fillStyle(nail, 0.85).fillEllipse(...at(u * fan, PALM.top - len + 7), 12 * w, 9 * w);
    }

    // The palm over their roots: one rounded, tapered shape, shaded at the heel or creased
    // across if the hand has turned over.
    shape(g, roundedBox(at, -PALM.half, PALM.top, PALM.half, PALM.wrist, PALM.radius, PALM.taper),
      palmUp ? skin.lit : skin.face, skin.edge, 3);
    if (palmUp) {
      g.lineStyle(2.5, skin.edge, 0.4);
      g.lineBetween(...at(-30, -18), ...at(26, 4)).lineBetween(...at(-32, 10), ...at(22, 32)).lineBetween(...at(-22, 42), ...at(16, 54));
    } else {
      g.fillStyle(skin.shade, 0.26);
      fillContour(g, roundedBox(at, -PALM.half + 3, 30, PALM.half - 3, PALM.wrist - 2, 16, PALM.taper));
      g.fillStyle(skin.lit, 0.45).fillEllipse(...at(-2, -14), 48, 26);
      for (const [u, , w] of FINGERS) g.fillStyle(skin.edge, 0.28).fillEllipse(...at(u, PALM.top + 16), 10 * w, 6 * w);
    }

    // The thumb last, lying over the palm on the inner edge where the hands meet.
    const root = at(-12, 44), tip = at(-(PALM.half - 8) - finale.shrug * 22, -14);
    g.lineStyle(29, skin.edge).lineBetween(...root, ...tip);
    g.lineStyle(26, palmUp ? skin.lit : skin.face).lineBetween(...root, ...tip);
    g.fillStyle(palmUp ? skin.lit : skin.face).fillCircle(...tip, 13);
    g.lineStyle(2.5, skin.edge, 0.6).beginPath().arc(...tip, 13, 0, Math.PI * 2).strokePath();
    if (!palmUp) g.fillStyle(nail, 0.8).fillEllipse(...at(-(PALM.half - 6) - finale.shrug * 22, -18), 10, 8);
    g.lineStyle(2, skin.edge, 0.3).lineBetween(...at(-18, 52), ...at(-32, 14));

    // Two little arcs over a hand that has turned over: the shrug, said out loud.
    if (finale.shrug > 0.55 && !this.still) {
      g.lineStyle(3.5, ROOM.ink, (finale.shrug - 0.55) * 1.4);
      for (const r of [26, 44]) {
        g.beginPath().arc(cx + side * 104, cy - 104, r, Math.PI * (side > 0 ? 1.12 : 1.42), Math.PI * (side > 0 ? 1.58 : 1.88), false).strokePath();
      }
    }
  }

  // ------------------------------------------------------------------ The crowd

  /** The room answering: pairs of hands rising into view, each clapping at its own rate. */
  private crowd(g: Phaser.GameObjects.Graphics, finale: ClapFinale, now: number): void {
    if (finale.hands <= 0 || finale.crowd <= 0) return;
    for (let i = 0; i < finale.hands && i < CROWD_HANDS.length; i++) {
      const hand = CROWD_HANDS[i]!;
      // Staggered, so the room does not come up as one object: the ones further back
      // arrive a moment after the ones in front.
      const up = clamp01((finale.crowd - i * 0.04) / 0.82);
      if (up <= 0) continue;
      this.crowdPair(g, hand, up, crowdClap(now, i, this.still));
    }
  }

  /** One pair of hands in the crowd: two mitts meeting over a cuff, drawn small and plain. */
  private crowdPair(g: Phaser.GameObjects.Graphics, hand: CrowdHand, up: number, open: number): void {
    const skin = CROWD_SKIN[hand.tone % CROWD_SKIN.length]!;
    const sleeve = CROWD_SLEEVE[hand.tone % CROWD_SLEEVE.length]!;
    const y = hand.y + (1 - up) * 210;
    const s = hand.scale;
    for (const side of [-1, 1] as const) {
      const rot = hand.tilt + side * (0.1 + open * 0.3);
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const x = hand.x + side * (34 + open * 30) * s;
      const at: Local = (u, v) => {
        const lx = side * u * s, ly = v * s;
        return [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
      };
      // A sleeve stub rather than an arm: these are hands in a crowd, and a crowd of
      // forearms reaching off the bottom of the room is a different picture.
      const cuff = Math.min(150, (STAGE.bottom - 10 - y) / Math.max(0.2, s));
      g.lineStyle(32 * s, sleeve).lineBetween(...at(0, 36), ...at(10, cuff));
      g.lineStyle(9 * s, mix(sleeve, 0xffffff, 0.35), 0.4).lineBetween(...at(-10, 40), ...at(0, cuff - 10));
      for (const [u, len, w] of FINGERS) {
        const tip = at(u * 1.08, -32 - len * 0.58);
        g.lineStyle(20 * s * w, skin.face).lineBetween(...at(u * 0.86, -18), ...tip);
        g.fillStyle(skin.face).fillCircle(...tip, 10 * s * w);
      }
      shape(g, roundedBox(at, -36, -36, 36, 56, 15, 0.15), skin.face, skin.edge, 2.4 * s);
      g.fillStyle(skin.lit, 0.35).fillEllipse(...at(-4, -8), 30 * s, 18 * s);
    }
  }
}
