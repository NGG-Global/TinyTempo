import type { LookCopy } from './Vignette';
import { lookAt } from './lookAt';

/** What the stone holds, and how it is cut: a nugget is a lump, a diamond a brilliant, an emerald a step cut. */
export type Gem = 'gold' | 'diamond' | 'emerald';

/**
 * Three digs, by lap. The gem changes what the act *is*, so it changes its words as well
 * (`VignetteDefinition.looks`): a diamond mine is never announced as striking gold. Each
 * dig has its own ground and its own prospector, so the second visit is a different place
 * and not a recolour. Lap 0 keeps the definition's own words.
 */
export interface ProspectorLook {
  readonly gem: Gem;
  readonly copy: LookCopy;
  /** The face behind him, its shading, and the strata or seams across it. */
  readonly wall: number;
  readonly wallShade: number;
  readonly strata: number;
  /** The boulder he is working, and the dark of its hollow once it opens. */
  readonly rock: number;
  readonly rockShade: number;
  readonly hollow: number;
  /** Flecks in the boulder hinting at what is inside; never enough to give the ending away. */
  readonly fleck: number;
  /** The gem's body, its lit faces and its shaded faces. */
  readonly gemBody: number;
  readonly gemLight: number;
  readonly gemDark: number;
  readonly skin: number;
  readonly beard: number;
  readonly shirt: number;
  readonly overalls: number;
  readonly hat: number;
  /** A mine is lit by a lantern; a canyon and a cliff by the day. */
  readonly lantern: boolean;
}

export const PROSPECTOR_LOOKS: readonly ProspectorLook[] = [
  {
    gem: 'gold', copy: {},
    wall: 0xe4b47e, wallShade: 0xb47c4c, strata: 0xf0cb98,
    rock: 0xb98b62, rockShade: 0x8a6142, hollow: 0x4a3324, fleck: 0xf0c94e,
    gemBody: 0xf2c230, gemLight: 0xffe68c, gemDark: 0xb6841a,
    skin: 0xe9b08a, beard: 0x7b4e2e, shirt: 0xc0533a, overalls: 0x4f6f9a, hat: 0xc79a5b, lantern: false,
  },
  {
    gem: 'diamond',
    copy: { title: 'Dig for diamonds', intro: 'Something\nglints deep.', success: ['A\ndiamond!', 'Cut it and it will shine.'], rough: ['Nothing\nbut rock.', 'Not a glint in it.'] },
    wall: 0x5d5a69, wallShade: 0x3e3b48, strata: 0x6f6b7c,
    rock: 0x7f8a96, rockShade: 0x56606c, hollow: 0x23222b, fleck: 0xdff4ff,
    gemBody: 0xd6efff, gemLight: 0xffffff, gemDark: 0x8cc1df,
    skin: 0xc68f66, beard: 0xc9c2b8, shirt: 0x3f6f8f, overalls: 0x6b5a48, hat: 0x6b4a32, lantern: true,
  },
  {
    gem: 'emerald',
    copy: { title: 'Emerald seam', intro: 'Green in\nthe stone.', success: ['An\nemerald!', 'Green as the hills.'], rough: ['Nothing\nbut rock.', 'Not a speck of green.'] },
    wall: 0xa3b096, wallShade: 0x6d7f64, strata: 0xb7c3aa,
    rock: 0x7f8b7b, rockShade: 0x58654f, hollow: 0x2c3528, fleck: 0x47c583,
    gemBody: 0x2fae6a, gemLight: 0x8be0b0, gemDark: 0x1b6b43,
    skin: 0xf0c4a2, beard: 0xb5622f, shirt: 0xd9a441, overalls: 0x4d6b55, hat: 0x8a5a36, lantern: false,
  },
];
export const prospectorLook = (lap: number): ProspectorLook => lookAt(PROSPECTOR_LOOKS, lap);
