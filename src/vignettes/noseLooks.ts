import { lookAt } from './lookAt';

/** Different people, with a shared readable silhouette around the tissue. */
export const NOSE_LOOKS = [
  { id: 'swoop', skin: 0xe8af87, hair: 0x553b31, shirt: 0x518d99, style: 'swoop', glasses: false },
  { id: 'curls', skin: 0x946044, hair: 0x302d31, shirt: 0xe7a34c, style: 'curls', glasses: false },
  { id: 'silver', skin: 0xf2c6a5, hair: 0xc4cbd1, shirt: 0x947aa5, style: 'side', glasses: true },
  { id: 'bun', skin: 0xc48c60, hair: 0x3d3030, shirt: 0x7a9f70, style: 'bun', glasses: true },
] as const;
export type NoseLook = typeof NOSE_LOOKS[number];
export const noseLook = (lap: number): NoseLook => lookAt(NOSE_LOOKS, lap);
