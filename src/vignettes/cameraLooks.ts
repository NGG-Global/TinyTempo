import type { LookCopy } from './Vignette';
import { lookAt } from './lookAt';

/** What is in front of the camera. */
export type CameraSubject = 'cat' | 'cake' | 'castle';

/**
 * Three shoots, by lap. The subject changes what the act *is*, so it changes its words as
 * well (`VignetteDefinition.looks`): a birthday cake is never announced as a cat's portrait.
 * Each has its own room and its own camera, so the second visit is a different shoot and
 * not a recolour. Lap 0 keeps the definition's own words.
 *
 * The camera is an instant camera of no make: a single stripe of colour, never the
 * rainbow stripe one maker owns.
 */
export interface CameraLook {
  readonly subject: CameraSubject;
  readonly copy: LookCopy;
  /** The wall behind (or the sky, at the seaside), its shade (or the sea), and the floor. */
  readonly wall: number;
  readonly wallShade: number;
  readonly floor: number;
  readonly floorShade: number;
  /** The camera's body, its shaded underside, its trim and lens barrel, and its one stripe. */
  readonly body: number;
  readonly bodyShade: number;
  readonly trim: number;
  readonly stripe: number;
  /** The subject's main colour, its shade, and a second colour (the cushion, the icing, the flag). */
  readonly accent: number;
  readonly accentShade: number;
  readonly second: number;
}

export const CAMERA_LOOKS: readonly CameraLook[] = [
  {
    subject: 'cat', copy: {},
    wall: 0xcfe3d6, wallShade: 0x9fbfaa, floor: 0xc79a6c, floorShade: 0x9a7350,
    body: 0xf2efe6, bodyShade: 0xcfc8b8, trim: 0x3c3a3e, stripe: 0xe2603f,
    accent: 0xe8964a, accentShade: 0xc46f2e, second: 0x5f7fb8,
  },
  {
    subject: 'cake',
    copy: { title: 'Party snapshot', intro: 'Everybody\nsmile!', success: ['Make a\nwish!', 'A birthday to remember.'], rough: ['Blurry\nshot.', 'The candles moved.'] },
    wall: 0xf6d6e0, wallShade: 0xd9a9b9, floor: 0xb07a52, floorShade: 0x86583a,
    body: 0x34323a, bodyShade: 0x222127, trim: 0x9aa0a6, stripe: 0x3fb6a8,
    accent: 0xfbe3c2, accentShade: 0xe0bd92, second: 0xf28fb0,
  },
  {
    subject: 'castle',
    copy: { title: 'Holiday snapshot', intro: 'Catch the\nview.', success: ['Wish you\nwere here!', 'Straight onto the fridge.'], rough: ['Blurry\nshot.', 'The sun got in.'] },
    wall: 0xbfe3f2, wallShade: 0x5fa8c8, floor: 0xecd29a, floorShade: 0xcfae6e,
    body: 0x8fc4e8, bodyShade: 0x6a9fc4, trim: 0xf6f2ea, stripe: 0xf2c14e,
    accent: 0xe6c27e, accentShade: 0xc49a52, second: 0xe2603f,
  },
];
export const cameraLook = (lap: number): CameraLook => lookAt(CAMERA_LOOKS, lap);
