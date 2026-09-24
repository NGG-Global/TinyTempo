import { lookAt } from './lookAt';

/**
 * Who is in the barber's chair. The shop, the shears, the cut and all three endings are
 * shared; a look is the customer's hair and skin, the cape they are wrapped in, what is
 * under it for the reveal, the beanie a rough round hides it with, and the shop's walls.
 * Pure data, unit-tested under node.
 */
export interface BarberLook {
  readonly id: string;
  readonly wall: number;
  readonly wainscot: number;
  readonly skin: number;
  readonly skinInk: number;
  readonly blush: number;
  readonly hair: number;
  readonly hairInk: number;
  /** The strands drawn over each lock, lighter than the hair. */
  readonly hairLit: number;
  readonly cape: number;
  readonly capeInk: number;
  readonly stripe: number;
  /** Under the cape: revealed on a clean or a middling round. */
  readonly shirt: number;
  readonly tie: number;
  readonly hat: number;
  readonly hatRib: number;
}

export const BARBER_LOOKS: readonly BarberLook[] = [
  // The original: a chestnut mop under a navy pinstripe cape, in a mint shop.
  {
    id: 'chestnut', wall: 0xd6eadf, wainscot: 0x8fb9a6, skin: 0xf2c29b, skinInk: 0xa8704e, blush: 0xe8917f,
    hair: 0x7a4b2a, hairInk: 0x46291a, hairLit: 0xa0693e, cape: 0x2f4a6d, capeInk: 0x1c2e45, stripe: 0xdfe6ee,
    shirt: 0xf4efe4, tie: 0xc4463c, hat: 0xe0a93b, hatRib: 0xb9832a,
  },
  // Ginger curls under a burgundy cape, in a pale blue shop.
  {
    id: 'ginger', wall: 0xdbe5ee, wainscot: 0x93a9c1, skin: 0xf6d6bf, skinInk: 0xb07b62, blush: 0xef9d8e,
    hair: 0xd0703a, hairInk: 0x86401f, hairLit: 0xeb9a5c, cape: 0x8c2f3c, capeInk: 0x561b24, stripe: 0xf2d5d5,
    shirt: 0x6d8fb3, tie: 0xe5b547, hat: 0x2f8a86, hatRib: 0x216663,
  },
  // Jet-black hair under a forest-green cape, in a cream shop.
  {
    id: 'jet', wall: 0xf0e6d2, wainscot: 0xc3a57c, skin: 0x9a6444, skinInk: 0x5e3a26, blush: 0xb86a55,
    hair: 0x2d2626, hairInk: 0x120e0e, hairLit: 0x5d5050, cape: 0x2f5a44, capeInk: 0x1b3829, stripe: 0xe4efe6,
    shirt: 0xefc75e, tie: 0x2f4a6d, hat: 0xc4463c, hatRib: 0x8f2f28,
  },
];

export function barberLook(lap: number): BarberLook {
  return lookAt(BARBER_LOOKS, lap);
}
