import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Geom: {}, Math: {} } }));

const { PRODUCT } = await import('../src/monetization/types');
const { productArtIds } = await import('../src/ui/productArt');

const icon = (product: string): Buffer | null => {
  const url = new URL(`../store/products/${product}.png`, import.meta.url);
  return existsSync(url) ? readFileSync(url) : null;
};

/** The PNG header's width and height, from the IHDR chunk. */
function pngSize(bytes: Buffer): { readonly width: number; readonly height: number; readonly depth: number; readonly colour: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), depth: bytes[24]!, colour: bytes[25]! };
}

describe('the Play Console product icons', () => {
  it('has a drawing for every product the Console lists, the legacy one included', () => {
    const drawn = productArtIds();
    for (const product of Object.values(PRODUCT)) expect(drawn).toContain(product);
    expect(drawn).toHaveLength(Object.values(PRODUCT).length);
  });

  it('ships each one as Google asks: a square 32-bit PNG between 512 and 1080 px, under 8 MB', () => {
    for (const product of Object.values(PRODUCT)) {
      const bytes = icon(product);
      // Rendered by scripts/product-icons.mjs; a product without its file is one the
      // Console cannot be given.
      expect(bytes, product).not.toBeNull();
      if (bytes === null) continue;
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const { width, height, depth, colour } = pngSize(bytes);
      expect(width).toBe(height);
      expect(width).toBeGreaterThanOrEqual(512);
      expect(width).toBeLessThanOrEqual(1080);
      // Colour type 6 is RGBA at 8 bits a channel: the 32-bit PNG the form asks for.
      expect([depth, colour]).toEqual([8, 6]);
      expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
    }
  });
});
