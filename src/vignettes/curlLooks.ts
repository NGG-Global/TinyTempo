/**
 * The three people who take turns at the curl. The figure's geometry, motion and gym are
 * shared; a look is the colours and the few features that make one character read as a
 * different person at phone scale. Pure data, so it is unit-tested under node.
 */
export type CurlHair = 'quiff' | 'bun' | 'bald';
export type CurlBadge = 'bolt' | 'star' | 'stripes';

export interface CurlLook {
  readonly id: string;
  readonly skin: number;
  /** The skin warms toward this as the set goes on. */
  readonly flush: number;
  /** Short contour accents on the skin: creases, knuckles, the cheek. */
  readonly crease: number;
  readonly kit: number;
  readonly kitShade: number;
  readonly kitTrim: number;
  readonly kitSeam: number;
  readonly hair: number;
  readonly hairSheen: number;
  readonly hairStyle: CurlHair;
  readonly moustache: boolean;
  readonly beard: boolean;
  readonly badge: CurlBadge;
}

export const CURL_LOOKS: readonly CurlLook[] = [
  // The original coach: swept quiff, curled moustache, teal singlet with a lightning badge.
  {
    id: 'coach', skin: 0xd8945f, flush: 0xd9634a, crease: 0x995b40,
    kit: 0x2e9c8e, kitShade: 0x237a72, kitTrim: 0x89c7b4, kitSeam: 0x154f4b,
    hair: 0x2b2733, hairSheen: 0x5b4c52, hairStyle: 'quiff', moustache: true, beard: false, badge: 'bolt',
  },
  // A sprinter in plum: high bun, clean upper lip, a star on the singlet.
  {
    id: 'sprinter', skin: 0x8a5a3c, flush: 0xa8503f, crease: 0x5e3a26,
    kit: 0xb04a7c, kitShade: 0x8a3760, kitTrim: 0xe39ac0, kitSeam: 0x5f2543,
    hair: 0x1f1a1e, hairSheen: 0x4a3b45, hairStyle: 'bun', moustache: false, beard: false, badge: 'star',
  },
  // The veteran: bald, grey beard, amber singlet with two racing stripes.
  {
    id: 'veteran', skin: 0xe9b892, flush: 0xdb6f5a, crease: 0xb07a5a,
    kit: 0xe07a2f, kitShade: 0xb35d1e, kitTrim: 0xffc38a, kitSeam: 0x7a3d0f,
    hair: 0xc9c2b8, hairSheen: 0xe9e4dc, hairStyle: 'bald', moustache: true, beard: true, badge: 'stripes',
  },
];

/** Which person is at the bench on this lap of the rotation. Never out of range. */
export function curlLook(lap: number): CurlLook {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % CURL_LOOKS.length : 0;
  return CURL_LOOKS[index]!;
}
