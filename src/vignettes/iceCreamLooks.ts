import type { LookCopy } from './Vignette';
import { lookAt } from './lookAt';

/** What is being licked, and so how it is drawn and how it wears down. */
export type Treat = 'cone' | 'icePop' | 'lollipop';
/** The licker's hair, so a second visit is a different person and not a recolour. */
export type Hair = 'bob' | 'bun' | 'curls';

/**
 * Three treats, by lap. The treat changes what the act *is*, so it changes its words too
 * (`VignetteDefinition.looks`): an ice pop is never announced as ice cream. Each treat has
 * its own place and its own licker. Lap 0 keeps the definition's own words.
 */
export interface IceCreamLook {
  readonly treat: Treat;
  readonly copy: LookCopy;
  /** The scene behind: its sky or wall, the band across it, and the floor. */
  readonly sky: number;
  readonly band: number;
  readonly floor: number;
  /** The awning, umbrella or tent stripe that says where we are. */
  readonly stripe: number;
  /** The treat's body, its lit side, its shaded side and its second colour. */
  readonly body: number;
  readonly light: number;
  readonly dark: number;
  readonly second: number;
  /** The tongue once the treat is gone: it is whatever colour was licked. */
  readonly tongue: number;
  readonly skin: number;
  readonly hair: number;
  readonly hairStyle: Hair;
  readonly shirt: number;
}

export const ICE_CREAM_LOOKS: readonly IceCreamLook[] = [
  {
    treat: 'cone', copy: {},
    sky: 0xcfe8f2, band: 0xf6e2c4, floor: 0xd8c4a2, stripe: 0xe57a8a,
    // Strawberry on a waffle cone; `second` is the waffle.
    body: 0xf4a6b8, light: 0xffd6df, dark: 0xd77791, second: 0xd9a35a,
    tongue: 0xf08aa3,
    skin: 0xf2c4a0, hair: 0x6b3e26, hairStyle: 'bob', shirt: 0x4f8fc0,
  },
  {
    treat: 'icePop',
    copy: { title: 'Ice pop', intro: 'Before it\ndrips.', success: ['Down to\nthe stick!', 'Cool all the way down.'], rough: ['Dropped\nit!', 'It slid right off the stick.'] },
    sky: 0xbfe4f0, band: 0x6cc3d5, floor: 0xf1dfb2, stripe: 0xf2b84b,
    // Cherry over lemon, frozen in two layers.
    body: 0xe2484f, light: 0xff8a8a, dark: 0xa92f39, second: 0xf6d65a,
    tongue: 0xe8505a,
    skin: 0xa86a48, hair: 0x2e2422, hairStyle: 'curls', shirt: 0xf0a23c,
  },
  {
    treat: 'lollipop',
    copy: { title: 'Lollipop', intro: 'One lick\nat a time.', success: ['Licked\nclean!', 'Right down to the stick.'], rough: ['Dropped\nit!', 'Straight onto the floor.'] },
    sky: 0xf6e1ee, band: 0xfbeed6, floor: 0xc9b39a, stripe: 0x8f6cc4,
    // A swirl of grape and cream.
    body: 0x9b6fd0, light: 0xd2b8f2, dark: 0x6a46a0, second: 0xfff4f8,
    tongue: 0xa57ad8,
    skin: 0xf6d2b4, hair: 0xd9a441, hairStyle: 'bun', shirt: 0x5aa37c,
  },
];
export const iceCreamLook = (lap: number): IceCreamLook => lookAt(ICE_CREAM_LOOKS, lap);
