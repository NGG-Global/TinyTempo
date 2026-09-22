/**
 * The five flavours the slushy is poured in. Cup, straw, drinker and brain freeze are
 * shared; a look is the drink's colours, the straw's stripe and the fruit printed on the
 * cup's label, so a return visit is a different flavour rather than a new act. Pure data,
 * unit-tested under node.
 */
export type SlushyLabel = 'berry' | 'wheel' | 'cluster';

export interface SlushyLook {
  readonly id: string;
  /** The body of the drink, and the darker wedge where the cup's far wall shades it. */
  readonly drink: number;
  readonly deep: number;
  /** The frothy meniscus the level falls through. */
  readonly surface: number;
  /** Ice granules: most are pale, every third one catches the syrup. */
  readonly ice: number;
  readonly syrup: number;
  /** Beads travelling up the straw while it sips. */
  readonly sip: number;
  readonly stripe: number;
  readonly label: SlushyLabel;
  readonly fruit: number;
  readonly fruitInk: number;
}

export const SLUSHY_LOOKS: readonly SlushyLook[] = [
  // The original berry slushy.
  {
    id: 'berry', drink: 0xd96a92, deep: 0xb44078, surface: 0xf59cba, ice: 0xffccdd, syrup: 0xb24479,
    sip: 0xf19dba, stripe: 0xd94f6b, label: 'berry', fruit: 0xbc5776, fruitInk: 0x528f72,
  },
  // Blue raspberry, the colour no fruit has.
  {
    id: 'blue', drink: 0x4f9bd9, deep: 0x2f66a8, surface: 0x9ccbf1, ice: 0xd4ebfb, syrup: 0x2d5f9e,
    sip: 0x8fc2ee, stripe: 0x3a78c2, label: 'berry', fruit: 0x3f6fbf, fruitInk: 0x528f72,
  },
  // Lime, with a wheel of it on the label.
  {
    id: 'lime', drink: 0x86c25a, deep: 0x4f8d37, surface: 0xbfe39a, ice: 0xe4f5cf, syrup: 0x4a8633,
    sip: 0xb0dc86, stripe: 0x5a9e40, label: 'wheel', fruit: 0x8cc85a, fruitInk: 0x4a7f35,
  },
  // Orange.
  {
    id: 'orange', drink: 0xf19a3e, deep: 0xc76a1d, surface: 0xfbc57d, ice: 0xffe5c2, syrup: 0xbe601a,
    sip: 0xf8b86c, stripe: 0xe2762c, label: 'wheel', fruit: 0xf2a142, fruitInk: 0xb8641f,
  },
  // Grape, with a little bunch on the label.
  {
    id: 'grape', drink: 0x9a62c2, deep: 0x6c3b93, surface: 0xc9a2e3, ice: 0xe9d9f5, syrup: 0x663a8c,
    sip: 0xbf95de, stripe: 0x8350b0, label: 'cluster', fruit: 0x7e4aa8, fruitInk: 0x528f72,
  },
];

export function slushyLook(lap: number): SlushyLook {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % SLUSHY_LOOKS.length : 0;
  return SLUSHY_LOOKS[index]!;
}
