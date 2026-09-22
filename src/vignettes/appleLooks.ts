import type { LookCopy } from './Vignette';

/**
 * What is on the picnic plate: the apple, a pear, a peach and a donut. The cloth, the
 * plate, the bite rhythm and the two endings' timing are shared; a look is the subject's
 * silhouette, its skin and flesh, what a clean round leaves behind and who turns up on a
 * rough one. A donut is not an apple, so unlike the other acts' looks this one also
 * renames the act (`copy`). Pure data, unit-tested under node.
 */
export interface FruitLook {
  readonly kind: 'fruit';
  readonly id: string;
  /**
   * Half-width of the whole fruit at `p`, from the shoulder (0, y = -105) to the base
   * (1, y = 125). Bites carve inwards from it towards the core.
   */
  readonly width: (p: number) => number;
  /** The top cap, from the stem dimple at `dimple` to the shoulder: two control points. */
  readonly dimple: number;
  readonly top: readonly [number, number, number, number];
  /** The base, from the right edge to the centre at `base`: two control points. */
  readonly base: number;
  readonly bottom: readonly [number, number, number, number];
  readonly skin: number;
  readonly skinInk: number;
  readonly peelInk: number;
  readonly flesh: number;
  readonly fleshInk: number;
  /** Specular patch while the left cheek is still whole, and where it sits. */
  readonly shine: readonly [number, number];
  readonly shineAt: readonly [number, number];
  /** Lenticels over the skin: faint on an apple, bold on a pear, fuzz on a peach. */
  readonly dots: number;
  readonly dotAlpha: number;
  /** A peach's blush on the right cheek, which is eaten last. */
  readonly blush?: number;
  /** The seam down a peach's side. */
  readonly cleft?: boolean;
  /** What a clean round leaves: an apple's or pear's core and pips, or a peach's stone. */
  readonly core: 'pips' | 'stone';
  readonly coreColour: number;
  /** The stem as a polyline up from the dimple; leaves sprout at its second point. */
  readonly stem: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  readonly stemWidth: number;
  readonly leaves: 1 | 2;
  /** Where the worm's hole opens on a rough round, inside what three bites leave. */
  readonly worm: readonly [number, number];
  readonly crumbs: readonly [number, number];
  readonly copy: LookCopy;
}

export interface DonutLook {
  readonly kind: 'donut';
  readonly id: string;
  readonly dough: number;
  readonly doughInk: number;
  readonly icing: number;
  readonly icingInk: number;
  readonly sprinkles: readonly number[];
  readonly crumbs: readonly [number, number];
  readonly copy: LookCopy;
}

export type PlateLook = FruitLook | DonutLook;

const bump = (p: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, p)));

export const APPLE_LOOKS: readonly PlateLook[] = [
  // The original red apple. Lap 0 keeps the registry's own words.
  {
    kind: 'fruit', id: 'apple',
    width: p => 86 + 44 * Math.sin(p * Math.PI) - 12 * p,
    dimple: -109, top: [31, -139, 67, -137], base: 130, bottom: [41, 149, 25, 139],
    skin: 0xd94b3f, skinInk: 0xc64536, peelInk: 0xa34934, flesh: 0xffe9b5, fleshInk: 0x965b38,
    shine: [0xffbb87, 0xffe1ab], shineAt: [-54, -64], dots: 0xffca7e, dotAlpha: 0.45,
    core: 'pips', coreColour: 0xf2d390,
    stem: [[0, -108], [5, -139], [21, -164]], stemWidth: 13, leaves: 1, worm: [41, -57],
    crumbs: [0xfff0b8, 0xe86b4a], copy: {},
  },
  // A green-gold pear: a narrow neck over a round belly, freckled all over.
  {
    kind: 'fruit', id: 'pear',
    // The belly only starts below the neck; the power keeps the join smooth.
    width: p => 30 + 14 * p + 76 * bump(p - 0.15) ** 1.3,
    dimple: -120, top: [14, -128, 30, -121], base: 152, bottom: [68, 146, 38, 153],
    skin: 0xc3c65a, skinInk: 0x9fa443, peelInk: 0x7f8638, flesh: 0xfdf3d0, fleshInk: 0x8f7a45,
    shine: [0xe4e68f, 0xf6f5c0], shineAt: [-64, 18], dots: 0x7d7032, dotAlpha: 0.5,
    core: 'pips', coreColour: 0xeee0a4,
    stem: [[0, -119], [3, -146], [16, -176]], stemWidth: 10, leaves: 1, worm: [26, 12],
    crumbs: [0xfff7dc, 0xb4ba4a],
    copy: {
      title: 'Pear', intro: 'Ripe and\nready.',
      success: ['To the\ncore.', 'Juicy right to the stalk.'],
      rough: ['Oh,\nhello.', 'Someone else ordered the pear.'],
    },
  },
  // A blushing peach with its seam, soft golden flesh and a stone at its heart.
  {
    kind: 'fruit', id: 'peach',
    width: p => 94 + 36 * Math.sin(p * Math.PI) - 8 * p,
    dimple: -110, top: [34, -142, 74, -138], base: 134, bottom: [50, 152, 28, 142],
    skin: 0xf2a25c, skinInk: 0xd9854a, peelInk: 0xb86638, flesh: 0xffcf7a, fleshInk: 0xa8653a,
    shine: [0xffc690, 0xffe4bf], shineAt: [-62, -58], dots: 0xfff1d4, dotAlpha: 0.3, blush: 0xe0604c, cleft: true,
    core: 'stone', coreColour: 0x9c5a3c,
    stem: [[0, -109], [3, -124], [8, -134]], stemWidth: 12, leaves: 2, worm: [40, -52],
    crumbs: [0xffd88c, 0xee8a52],
    copy: {
      title: 'Peach', intro: 'Soft and\nsweet.',
      success: ['Down to\nthe stone.', 'Every drop of summer.'],
      rough: ['Oh,\nhello.', 'Someone else ordered the peach.'],
    },
  },
  // A strawberry-iced ring donut with sprinkles. A wasp, not a worm, fancies the icing.
  {
    kind: 'donut', id: 'donut',
    dough: 0xe0a45e, doughInk: 0x94592f, icing: 0xf29bb8, icingInk: 0xc65f86,
    sprinkles: [0xfff4d8, 0x6cc3c9, 0xf6cf52, 0x8f6fd0, 0x7cc27a],
    crumbs: [0xe8b574, 0xf29bb8],
    copy: {
      title: 'Donut', intro: 'Sweet\ntooth.',
      success: ['Not a\ncrumb.', 'Sprinkles and all.'],
      rough: ['Buzz\noff!', 'A wasp had its eye on the icing.'],
    },
  },
];

export function appleLook(lap: number): PlateLook {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % APPLE_LOOKS.length : 0;
  return APPLE_LOOKS[index]!;
}
