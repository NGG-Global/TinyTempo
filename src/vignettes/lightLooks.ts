/**
 * The four rooms the light switch opens onto. Geometry, the floor lamp, the rocker
 * and the five-light finale are shared; a look is the interior and its palette, so a
 * return visit is a different house rather than a new act. Pure data, unit-tested
 * under node.
 */
export type LightInterior = 'salon' | 'kitchen' | 'study' | 'bedroom';

export interface LightLook {
  readonly id: string;
  readonly interior: LightInterior;
  readonly wall: number;
  readonly wallMark: number;
  readonly floor: number;
  readonly floorGrain: number;
  readonly trim: number;
  readonly curtain: number;
  readonly rug: number;
  readonly furniture: number;
  readonly furnitureLit: number;
  readonly accent: number;
}

export const LIGHT_LOOKS: readonly LightLook[] = [
  // The original cutaway salon: sage paper, velvet curtains, jewel sofa.
  {
    id: 'salon', interior: 'salon',
    wall: 0x678c80, wallMark: 0x88a08b,
    floor: 0xc7a078, floorGrain: 0x9b785a,
    trim: 0xe7d6ab, curtain: 0xb46f61,
    rug: 0x965b60, furniture: 0xb87955, furnitureLit: 0xd89b69, accent: 0xc6a362,
  },
  // A morning kitchen: cream tiles, copper, a checked cloth.
  {
    id: 'kitchen', interior: 'kitchen',
    wall: 0xe8dcc8, wallMark: 0xd4c4aa,
    floor: 0xefe6d4, floorGrain: 0xc4784a,
    trim: 0xf4ece0, curtain: 0x7a9e8a,
    rug: 0xc45c4a, furniture: 0xe8e0d2, furnitureLit: 0xf4eee3, accent: 0xc4784a,
  },
  // A green study: wainscot, leather, brass.
  {
    id: 'study', interior: 'study',
    wall: 0x3d5c52, wallMark: 0x2f4a42,
    floor: 0x8a6a48, floorGrain: 0x6b5036,
    trim: 0xc4a06a, curtain: 0x5c3d4a,
    rug: 0x3d4a38, furniture: 0x5c3a28, furnitureLit: 0x7a5640, accent: 0xc4a06a,
  },
  // A dusty-rose bedroom: soft paper, a made bed, dawn in the window.
  {
    id: 'bedroom', interior: 'bedroom',
    wall: 0xd4b8c4, wallMark: 0xc4a4b4,
    floor: 0xc9b896, floorGrain: 0xa09070,
    trim: 0xf0e4d4, curtain: 0xe8d0c0,
    rug: 0x7a6a9a, furniture: 0xd4c4a8, furnitureLit: 0xe8dcc4, accent: 0xe8c4a0,
  },
];

/** Which room the switch lights on this lap of the rotation. Never out of range. */
export function lightLook(lap: number): LightLook {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % LIGHT_LOOKS.length : 0;
  return LIGHT_LOOKS[index]!;
}
