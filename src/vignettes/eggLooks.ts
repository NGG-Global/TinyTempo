import { lookAt } from './lookAt';

/**
 * The egg over the bowl. The crack, the drop and the yolk are shared; a look is the
 * shell, so a return visit is a different egg. Pure data, unit-tested under node.
 */
export interface EggLook {
  readonly id: string;
  readonly shell: number;
  readonly ink: number;
  readonly highlight: number;
  readonly speck: number;
  readonly speckAlpha: number;
}

export const EGG_LOOKS: readonly EggLook[] = [
  // The original cream egg, lightly speckled.
  { id: 'cream', shell: 0xffe7ba, ink: 0xa17c51, highlight: 0xfff9e2, speck: 0xbd9367, speckAlpha: 0.3 },
  // A brown egg, speckled darker.
  { id: 'brown', shell: 0xc4784a, ink: 0x6b3a22, highlight: 0xe8c49a, speck: 0x4a2818, speckAlpha: 0.45 },
  // A blue egg, plainly speckled.
  { id: 'blue', shell: 0xd5e4ee, ink: 0x6a8494, highlight: 0xf7fbfe, speck: 0x5a7890, speckAlpha: 0.55 },
];

export function eggLook(lap: number): EggLook {
  return lookAt(EGG_LOOKS, lap);
}
