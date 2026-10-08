import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// The level table loads the vignette registry, which loads Phaser.
vi.mock('phaser', () => ({ default: {} }));
const { AREAS } = await import('../src/game/levels');
const { drawGroundMotif, drawProp } = await import('../src/ui/mapScenery');

/**
 * What stands on each area's ground. The map clears a box for every prop (off a finale's
 * stage, under the crest) and claims a motif by its top when strips are cut, so both have
 * limits; and an area that silently fell back to Grass's scenery would pass every other test.
 */

/** A stand-in Graphics that records where each call draws, and in what order. */
function recorder() {
  const calls: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const at = (x: number, y: number, rx = 0, ry = rx) => {
    minX = Math.min(minX, x - rx); maxX = Math.max(maxX, x + rx);
    minY = Math.min(minY, y - ry); maxY = Math.max(maxY, y + ry);
  };
  const spans: Record<string, (...a: number[]) => void> = {
    fillRect: (x, y, w, h) => { at(x!, y!); at(x! + w!, y! + h!); },
    strokeRect: (x, y, w, h) => { at(x!, y!); at(x! + w!, y! + h!); },
    fillRoundedRect: (x, y, w, h) => { at(x!, y!); at(x! + w!, y! + h!); },
    fillCircle: (x, y, r) => at(x!, y!, r!),
    fillEllipse: (x, y, w, h) => at(x!, y!, w! / 2, h! / 2),
    fillTriangle: (...p) => { for (let i = 0; i < 6; i += 2) at(p[i]!, p[i + 1]!); },
    lineBetween: (...p) => { at(p[0]!, p[1]!); at(p[2]!, p[3]!); },
    moveTo: (x, y) => at(x!, y!),
    lineTo: (x, y) => at(x!, y!),
  };
  const g: Record<string, unknown> = {};
  const proxy = new Proxy(g, {
    get: (_, name: string) => (...args: unknown[]) => {
      calls.push(`${name}(${args.map(a => (typeof a === 'number' ? a.toFixed(2) : JSON.stringify(a))).join(',')})`);
      spans[name]?.(...(args as number[]));
      return proxy;
    },
  });
  return { g: proxy as never, calls, bounds: () => ({ left: minX, right: maxX, top: minY, bottom: maxY }) };
}

const NEW = ['Garden', 'Swamp', 'Village', 'Castle'];

describe('the scenery beside the road', () => {
  it('gives every area its own two props, and none of the new ones falls back to Grass', () => {
    const drawn = AREAS.map(area => [0, 1].map(variant => {
      const r = recorder();
      drawProp(r.g, area, variant, 0, 0, 1);
      return r.calls.join(';');
    }));
    const all = drawn.flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps every new prop inside the box the map clears for it', () => {
    // `drawScenery` keeps a prop's box, foot - 132k to foot + 10k, off a finale's stage and
    // under the crest's swell; a prop that stood taller would be cut off by the horizon. The
    // first five areas' props predate this test, and the Dusk lantern's translucent glow
    // pool already reaches a little over it; the areas added since are held to it whole.
    for (const area of AREAS.filter(each => NEW.includes(each.name))) {
      for (const variant of [0, 1]) {
        for (const k of [0.74, 1.36]) {
          const r = recorder();
          drawProp(r.g, area, variant, 0, 0, k);
          const b = r.bounds();
          expect(b.top, `${area.name} ${variant}`).toBeGreaterThanOrEqual(-132 * k);
          // Only the cast shadow falls below the foot, down and to the right of it.
          expect(b.bottom, `${area.name} ${variant}`).toBeLessThanOrEqual(16 * k);
          expect(Math.max(-b.left, b.right), `${area.name} ${variant}`).toBeLessThanOrEqual(42 * k);
        }
      }
    }
  });

  it('lights the street lamp and the castle torch, and nothing else', () => {
    const lit: string[] = [];
    for (const area of AREAS) {
      for (const variant of [0, 1]) {
        const light = drawProp(recorder().g, area, variant, 100, 500, 1);
        if (!light) continue;
        lit.push(`${area.name} ${variant}`);
        // The glow sits on the prop, above its foot.
        expect(light.x).toBe(100);
        expect(light.y).toBeLessThan(500);
        expect(light.y).toBeGreaterThan(500 - 132);
      }
    }
    expect(lit).toEqual(['Pavement 0', 'Castle 1']);
  });
});

describe('the motif in the ground', () => {
  const map = readFileSync('src/scenes/MapScene.ts', 'utf8');
  const overhang = Number(/overhang: \{ motif: (\d+)/.exec(map)?.[1]);

  it('is its own in every area', () => {
    const drawn = AREAS.map(area => {
      const r = recorder();
      drawGroundMotif(r.g, area, 0, 0, 1, 0.7, 0.3, 1);
      return r.calls.join(';');
    });
    expect(new Set(drawn).size).toBe(AREAS.length);
  });

  it('reaches no further above its row than a strip claims it by', () => {
    expect(overhang).toBeGreaterThan(0);
    for (const area of AREAS) {
      for (const n of [0, 0.3, 0.6, 0.99]) {
        const r = recorder();
        drawGroundMotif(r.g, area, 0, 0, 1, n, n, 2);
        expect(r.bounds().top, `${area.name} ${n}`).toBeGreaterThanOrEqual(-overhang);
      }
    }
  });
});
