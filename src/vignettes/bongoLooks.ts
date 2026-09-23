import { lookAt } from './lookAt';

/**
 * The two drums and the shirt behind them. The beat is shared; a look is the wood and
 * the sleeves, so a return visit is a different pair of bongos. Pure data, unit-tested
 * under node.
 */
export interface BongoLook {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly stave: number;
  readonly staveDark: number;
  readonly ink: number;
  readonly shirt: number;
  readonly shirtLit: number;
  readonly palm: number;
  readonly palmLit: number;
}

export const BONGO_LOOKS: readonly BongoLook[] = [
  // The original terracotta and tan drums, teal sleeves.
  {
    id: 'terracotta', left: 0xbc643e, right: 0xb57b42, stave: 0xe2a257, staveDark: 0x8a4e32, ink: 0x65442f,
    shirt: 0x267673, shirtLit: 0x66a79a, palm: 0xd69268, palmLit: 0xe3a379,
  },
  // Dark walnut drums and a mustard shirt.
  {
    id: 'walnut', left: 0x6a4030, right: 0x7a5238, stave: 0xc4926a, staveDark: 0x4a2e22, ink: 0x3a281c,
    shirt: 0xc4922a, shirtLit: 0xe8c070, palm: 0xc48a62, palmLit: 0xd4a078,
  },
  // A painted red drum and a cream one, coral sleeves.
  {
    id: 'painted', left: 0xc4453a, right: 0xe8d8c0, stave: 0xf0b090, staveDark: 0xa06050, ink: 0x6b3830,
    shirt: 0xd46a58, shirtLit: 0xf0a090, palm: 0xf0c4a0, palmLit: 0xf8d8c0,
  },
];

export function bongoLook(lap: number): BongoLook {
  return lookAt(BONGO_LOOKS, lap);
}
