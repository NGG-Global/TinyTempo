/**
 * The four front doors the bell rings. Hinge, swing, hallway and cat are shared; a
 * look is the leaf, its panels and the metal on it, so a return visit is a different
 * house rather than a new act. Pure data, unit-tested under node.
 */
export type DoorStyle = 'panels' | 'victorian' | 'cottage' | 'planks';

export interface DoorLook {
  readonly id: string;
  readonly style: DoorStyle;
  readonly brick: number;
  readonly brickInk: number;
  readonly mortar: number;
  readonly frame: number;
  readonly frameInk: number;
  readonly door: number;
  readonly doorShade: number;
  readonly panel: number;
  readonly panelInk: number;
  readonly panelLit: number;
  readonly hardware: number;
  readonly hardwareLit: number;
}

export const DOOR_LOOKS: readonly DoorLook[] = [
  // The original teal four-panel with a brass knocker.
  {
    id: 'teal', style: 'panels',
    brick: 0xddc2a1, brickInk: 0xb6987e, mortar: 0xb99a7f,
    frame: 0xeedeae, frameInk: 0x9b805f,
    door: 0x527e73, doorShade: 0x355b55,
    panel: 0x608f7f, panelInk: 0x386559, panelLit: 0x9aba91,
    hardware: 0xd4af69, hardwareLit: 0xe0bf7a,
  },
  // A crimson six-panel with a lion knocker, the classic painted town door.
  {
    id: 'crimson', style: 'victorian',
    brick: 0xc9b4a0, brickInk: 0x9a7e68, mortar: 0xb09a86,
    frame: 0xe8dcc0, frameInk: 0x8a7058,
    door: 0x8b2e2e, doorShade: 0x5c1c1c,
    panel: 0x9a3838, panelInk: 0x5c1c1c, panelLit: 0xc46a6a,
    hardware: 0xc9a227, hardwareLit: 0xe8c84a,
  },
  // An ochre cottage leaf: oval window up top, one field below, black iron.
  {
    id: 'ochre', style: 'cottage',
    brick: 0xd8c0a0, brickInk: 0xa88868, mortar: 0xc4a888,
    frame: 0xf2e6c8, frameInk: 0x8a7050,
    door: 0xd4a04a, doorShade: 0x8a6828,
    panel: 0xdcac58, panelInk: 0x8a6828, panelLit: 0xf0d090,
    hardware: 0x4a4540, hardwareLit: 0x6a6560,
  },
  // A navy plank door with a letter slot and a chrome bar.
  {
    id: 'navy', style: 'planks',
    brick: 0xb8b0a8, brickInk: 0x8a8480, mortar: 0x9a948c,
    frame: 0xe8e0d4, frameInk: 0x7a7268,
    door: 0x2c3e5a, doorShade: 0x1a2536,
    panel: 0x344a68, panelInk: 0x1a2536, panelLit: 0x5a7a98,
    hardware: 0xc0c4c8, hardwareLit: 0xe0e4e8,
  },
];

/** Which door the bell sits beside on this lap of the rotation. Never out of range. */
export function doorLook(lap: number): DoorLook {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % DOOR_LOOKS.length : 0;
  return DOOR_LOOKS[index]!;
}
