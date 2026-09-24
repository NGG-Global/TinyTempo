import { isAreaFinale, mapLastLevel, type MapLevelState } from '../game/levels';
import { shade } from './colour';

/**
 * Where the map's road puts things, as pure functions of the window: the stops, the seams
 * between them, the room an area finale takes, the stage drawn in that room, the gate
 * plate at an area's foot and the crest the road goes over at the top.
 *
 * Pure because every property worth having here is arithmetic — a seam between every pair
 * of stops, a stage clear of its neighbours and of the gate above it, a crest above the
 * last stop and under the header — and each one only shows up at the one scroll position
 * that reveals it.
 *
 * Design units throughout; the scene multiplies by its scale `s`.
 */
export const ROAD = {
  step: 202,
  /** From the world's top to the next stop past the window, and from the first stop to the bottom. */
  topPad: 420, bottomPad: 660,
  /** The band the header sign hangs in, down from the safe frame's top. */
  hud: 144,
  /** The lowest the top-left objectives puck reaches: 190 down, radius 34, and its depth. */
  pucks: 232,
  /**
   * The map renders a window, not the whole road. It used to build one Phaser Text per
   * level from level 1, so a deep — or corrupt — frontier allocated thousands of them
   * on every entry and re-laid them out on every resize.
   */
  window: 48, history: 20,
  /**
   * Extra road an area finale takes for its stage. `below` lets the plate under its plaza
   * clear the stop before it; `above` lets its bunting clear the barrier that stands at
   * the foot of every following area, half a step under that area's first stop. Without
   * it the gate stood in the middle of the bunting on every finale on the road.
   */
  finaleRoom: { below: 50, above: 140 },
} as const;

/** The stops in view: `first` is the lowest level, and `atEnd` says the window reaches the road's own end. */
export interface MapWindow {
  readonly first: number;
  readonly shown: number;
  readonly atEnd: boolean;
}

/** The window for a frontier, centred on `focus` as far as the history and the road's end allow. */
export function mapWindow(unlocked: number, focus: number): MapWindow {
  const top = mapLastLevel(unlocked);
  const first = Math.max(1, Math.min(focus - ROAD.history, top - ROAD.window + 1));
  const last = Math.min(top, first + ROAD.window - 1);
  return { first, shown: last - first + 1, atEnd: last === top };
}

/** Road added to the span from `level` up to `level + 1`, beyond the ordinary step. */
export function roomAbove(level: number): number {
  return (isAreaFinale(level) ? ROAD.finaleRoom.above : 0) + (isAreaFinale(level + 1) ? ROAD.finaleRoom.below : 0);
}

/**
 * How far each stop in the window stands above the first, in design units. Linear in the
 * index except around a finale, which is why nothing may invert a y into a level by
 * division any more: `pathXAt` walks the road itself.
 */
export function nodeRises(first: number, shown: number): number[] {
  const rises: number[] = [];
  let rise = 0;
  for (let i = 0; i < shown; i++) {
    if (i > 0) rise += ROAD.step + roomAbove(first + i - 1);
    rises.push(rise);
  }
  return rises;
}

/**
 * The world's height in game units. The span past the window is laid out like any other,
 * finale room included, and `topPad` is measured from its far end, so the top of the world
 * — and the crest on it — sits the same distance under the header whatever the window holds.
 */
export function worldHeight(first: number, shown: number, s: number, hud: number): number {
  const rises = nodeRises(first, shown);
  return (ROAD.topPad + roomAbove(first + shown - 1) + ROAD.bottomPad + (rises.at(-1) ?? 0)) * s + hud;
}

/** World y of every stop, level `first` at the bottom and the road climbing. */
export function nodeYs(first: number, shown: number, s: number, hud: number): number[] {
  const world = worldHeight(first, shown, s, hud);
  return nodeRises(first, shown).map(rise => world - (ROAD.bottomPad + rise) * s);
}

/** Where the stop past the window would stand: the road runs on through it and over the crest. */
export function beyondY(s: number, hud: number): number {
  return hud + (ROAD.topPad - ROAD.step) * s;
}

/**
 * The seam under a stop: half an ordinary step below it. The ground changes there, the
 * bake is cut there and an area's gate stands there. Measured from the stop *above* the
 * seam, so a finale's extra room always falls inside the finale's own area.
 */
export function seamBelow(nodeY: number, s: number): number {
  return nodeY + ROAD.step * s / 2;
}

/**
 * The hill the road goes over at the top of the window. The crest line is fixed under
 * the header, so at the top of the map it is always in view below the pucks, and every
 * window's last stop is at least `clearance` under it.
 */
export const CREST = {
  /** The crest line, down from the header's bottom edge. */
  depth: 250,
  /** Least distance from the crest down to the last stop's centre. */
  clearance: 170,
  /** The far ridge's height over the near one. */
  far: 74,
  /** How far down the road the near slope runs before it is ground again. */
  slope: 170,
  /** Either way of each ridge's mean line. */
  swell: 20,
  /** The road runs this far past the crest before it ends, all of it under the horizon. */
  overrun: 200,
  sign: { width: 290, height: 104, gap: 46, lift: 118, post: 16, foot: 46, margin: 18 },
} as const;

/** World y of the crest line at the road. */
export function crestY(s: number, hud: number): number {
  return hud + CREST.depth * s;
}

/**
 * A ridge's height at x: one long swell across the frame, so the land reads as land and
 * not as a ruler line. `phase` separates the far ridge from the near one.
 */
export function ridgeAt(x: number, left: number, width: number, base: number, s: number, phase: number): number {
  const u = width > 0 ? (x - left) / width : 0;
  // Two swells of different lengths, so neither ridge repeats itself across the frame.
  return base + (Math.sin(u * Math.PI * 1.7 + phase) * 0.7 + Math.sin(u * Math.PI * 3.1 + phase * 1.9) * 0.3) * CREST.swell * s;
}

/** The signpost at the crest: its panel, on the roomier side of the road, and its post. */
export interface Signpost {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly postX: number;
  readonly footY: number;
  readonly onLeft: boolean;
}

export function signpostAt(roadX: number, crest: number, left: number, right: number, s: number): Signpost {
  const S = CREST.sign;
  const width = Math.min(S.width * s, right - left - 2 * S.margin * s);
  const onLeft = roadX > (left + right) / 2;
  const want = onLeft ? roadX - S.gap * s - width : roadX + S.gap * s;
  const x = Math.max(left + S.margin * s, Math.min(right - S.margin * s - width, want));
  const y = crest - S.lift * s;
  return { x, y, width, height: S.height * s, postX: x + width / 2, footY: crest + S.foot * s, onLeft };
}

/**
 * An area finale's stop, drawn as a stage in the room `ROAD.finaleRoom` makes: a plaza the
 * road widens into, bunting between two posts, a crown of three star seats over a larger
 * puck, and a plate under it all naming the act.
 */
export const FINALE_STOP = {
  /** The puck, against an ordinary stop's 46. */
  puck: 67,
  /** The two brass rings, out from the puck's edge. */
  rings: [6, 15],
  plaza: 130,
  /** Seats on an arc of this radius over the puck, the outer two this many radians either way. */
  crown: { radius: 106, spread: 0.52, seat: 13, middle: 16 },
  bunting: { reach: 172, top: 186, foot: 20, sag: 18, every: 34, width: 22, length: 28, margin: 22 },
  plate: { width: 236, height: 80, top: 92 },
} as const;

/**
 * The ring of an empty crown seat on the plaza. The seat sits on road surface rather than
 * on a plate, and the roads run from Grass's pale sand down to Pavement's grey; a deep
 * self-shade clears 3:1 on all of them, where a light ring fails on the pale ones.
 */
export function crownHollow(roadFace: number): number {
  return shade(roadFace, -0.68);
}

/** The three crown seats, left to right. The middle one is larger and sits highest. */
export function crownSeats(x: number, y: number, s: number): { x: number; y: number; r: number }[] {
  const C = FINALE_STOP.crown;
  return [-1, 0, 1].map(k => {
    const angle = -Math.PI / 2 + k * C.spread;
    return { x: x + Math.cos(angle) * C.radius * s, y: y + Math.sin(angle) * C.radius * s, r: (k === 0 ? C.middle : C.seat) * s };
  });
}

/**
 * The two bunting posts. Kept inside the safe frame, so a finale near the edge strings its
 * line shorter on that side rather than off the screen.
 */
export function buntingPosts(x: number, y: number, s: number, left: number, right: number): { left: number; right: number; top: number; foot: number } {
  const B = FINALE_STOP.bunting;
  return {
    left: Math.max(left + B.margin * s, x - B.reach * s),
    right: Math.min(right - B.margin * s, x + B.reach * s),
    top: y - B.top * s,
    foot: y - B.foot * s,
  };
}

/** The wood plate under the plaza. */
export function finalePlate(x: number, y: number, s: number): { x: number; y: number; width: number; height: number } {
  const P = FINALE_STOP.plate;
  return { x: x - P.width * s / 2, y: y + P.top * s, width: P.width * s, height: P.height * s };
}

/** Everything the stage draws, as one box: nothing else on the road may stand in it. */
export function finaleStageBounds(x: number, y: number, s: number, left: number, right: number): { left: number; right: number; top: number; bottom: number } {
  const posts = buntingPosts(x, y, s, left, right);
  const plate = finalePlate(x, y, s);
  const post = 8 * s;
  return {
    left: Math.min(posts.left - post, x - FINALE_STOP.plaza * s),
    right: Math.max(posts.right + post, x + FINALE_STOP.plaza * s),
    top: posts.top - post,
    bottom: plate.y + plate.height + 8 * s,
  };
}

/** What a finale stop looks like in each state its puck is drawn in. */
export interface FinaleStopLook {
  /** Bunting and plate in their own colours, or faded toward the ground. */
  readonly lit: boolean;
  /** A padlock badge on the puck. */
  readonly padlock: boolean;
  readonly ringAlpha: number;
  /** Which of the puck's own fills it takes. */
  readonly puck: 'frontier' | 'cleared' | 'locked' | 'preview';
}

/**
 * The stop's state, from the state the map draws its puck in — which is `finaleMapMark`'s,
 * except that a frontier a closed gate holds is drawn locked. The stage replaces the old
 * flag entirely; an earned crown seat is read from the level's best, not from here.
 */
export function finaleStopLook(state: MapLevelState): FinaleStopLook {
  if (state === 'frontier') return { lit: true, padlock: false, ringAlpha: 1, puck: 'frontier' };
  if (state === 'cleared') return { lit: true, padlock: false, ringAlpha: 1, puck: 'cleared' };
  return { lit: false, padlock: true, ringAlpha: 0.5, puck: state };
}

/** The star gate at an area's foot: two posts, a bar, and a cream plate hanging under it. */
export const GATE = {
  post: 14, height: 62, reach: 18, bar: 15,
  plate: { width: 176, height: 50, drop: 12, radius: 25 },
} as const;

/** Top of the plate under a gate's bar, with the bar down. The plate's text and its drawing agree through this. */
export function gatePlateTop(seam: number, s: number): number {
  return seam - (GATE.height - GATE.bar - GATE.plate.drop) * s;
}
