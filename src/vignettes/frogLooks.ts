import { lookAt } from './lookAt';

/** How a frog's eyes are drawn: a dark round pupil, a gold iris, or a red one with a slit. */
export type FrogEye = 'round' | 'gold' | 'red';

/** One frog's paint. The singer and the two who join it each carry their own. */
export interface FrogPaint {
  readonly body: number;
  readonly belly: number;
  /** The throat sac when it swells: thin skin, paler than the belly. */
  readonly sac: number;
  readonly spots: number;
  /** The flanks and thighs, where a tree frog shows its second colour; the body's otherwise. */
  readonly flank: number;
  /** The toe pads. */
  readonly toe: number;
  readonly iris: number;
}

/**
 * Three ponds, by lap. A frog is a frog whichever pond it sings in, so the words never
 * change; the place, the hour and the singer do. Lap 0 is the original look.
 */
export interface FrogLook {
  readonly pond: 'noon' | 'moon' | 'lotus';
  /** The sky from its top to the horizon, and the far bank against it. */
  readonly skyTop: number;
  readonly skyLow: number;
  readonly bank: number;
  /** The water near the horizon and in front, and the light lying on it. */
  readonly waterFar: number;
  readonly waterNear: number;
  readonly glint: number;
  readonly pad: number;
  readonly flower: number;
  readonly reed: number;
  readonly eye: FrogEye;
  readonly singer: FrogPaint;
  /** The frogs that come up to listen and, on a good round, join in: left, then right. */
  readonly friends: readonly [FrogPaint, FrogPaint];
  /** The backdrop's paper and its pool of light. */
  readonly paper: number;
  readonly glow: number;
}

export const FROG_LOOKS: readonly FrogLook[] = [
  {
    // A green pond frog at midday, among water lilies.
    pond: 'noon',
    skyTop: 0xa9d8ec, skyLow: 0xe2f2ee, bank: 0x6f9f62,
    waterFar: 0x8ccbcf, waterNear: 0x4f9aa6, glint: 0xe8fbf6,
    pad: 0x5e9f45, flower: 0xf3a5c2, reed: 0x5d7f3e, eye: 'round',
    singer: { body: 0x74be4c, belly: 0xe2e69a, sac: 0xfdfbea, spots: 0x4f9334, flank: 0x74be4c, toe: 0x8fd065, iris: 0x2c2420 },
    friends: [
      { body: 0xb3cf46, belly: 0xece6a8, sac: 0xfefcec, spots: 0x86a32e, flank: 0xb3cf46, toe: 0xc6dc6a, iris: 0x2c2420 },
      { body: 0x4fae8c, belly: 0xd8e8b4, sac: 0xfbfcee, spots: 0x35836a, flank: 0x4fae8c, toe: 0x72c4a5, iris: 0x2c2420 },
    ],
    paper: 0xe8f1ec, glow: 0xf6ecc4,
  },
  {
    // A bullfrog under the moon, with fireflies over the reeds.
    pond: 'moon',
    skyTop: 0x1f2c4f, skyLow: 0x3b4e78, bank: 0x22343a,
    waterFar: 0x34587a, waterNear: 0x213e58, glint: 0xf6efc8,
    pad: 0x3f7a48, flower: 0xf1e7f6, reed: 0x2c4a36, eye: 'gold',
    singer: { body: 0x8e9e52, belly: 0xe6d896, sac: 0xfcf8e6, spots: 0x5d6c33, flank: 0x8e9e52, toe: 0xa5b468, iris: 0xd8ae45 },
    friends: [
      { body: 0x6f8f4f, belly: 0xe0d49c, sac: 0xfbf8e8, spots: 0x4b6435, flank: 0x6f8f4f, toe: 0x89a766, iris: 0xd8ae45 },
      { body: 0xa3a35c, belly: 0xe8dca2, sac: 0xfdfaea, spots: 0x77773c, flank: 0xa3a35c, toe: 0xbcbc77, iris: 0xd8ae45 },
    ],
    paper: 0xdfe3ec, glow: 0xf3e3a8,
  },
  {
    // Red-eyed tree frogs among lotus flowers at sunset.
    pond: 'lotus',
    skyTop: 0xf3a77d, skyLow: 0xfbdcae, bank: 0x8d6a7c,
    waterFar: 0xc99ab0, waterNear: 0x7b80ab, glint: 0xffe6b8,
    pad: 0x5f9a4a, flower: 0xf08fb0, reed: 0x6d7f45, eye: 'red',
    singer: { body: 0x86cf4a, belly: 0xeee6b4, sac: 0xfefcee, spots: 0x86cf4a, flank: 0x3a7bc4, toe: 0xf28c2e, iris: 0xe0392e },
    friends: [
      { body: 0x9ed65a, belly: 0xefe8b8, sac: 0xfefcef, spots: 0x9ed65a, flank: 0x4a68c0, toe: 0xf5a13c, iris: 0xe0392e },
      { body: 0x6cc35a, belly: 0xebe4b2, sac: 0xfdfcee, spots: 0x6cc35a, flank: 0x3a8fb8, toe: 0xee7f34, iris: 0xe0392e },
    ],
    paper: 0xf6e8dc, glow: 0xfbd9a4,
  },
];
export const frogLook = (lap: number): FrogLook => lookAt(FROG_LOOKS, lap);
