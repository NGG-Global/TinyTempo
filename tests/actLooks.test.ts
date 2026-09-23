import { describe, expect, it, vi } from 'vitest';
import { BALLOON_LOOKS, balloonLook } from '../src/vignettes/balloonLooks';
import { BANANA_LOOKS, bananaLook } from '../src/vignettes/bananaLooks';
import { BELL_LOOKS, bellLook } from '../src/vignettes/bellLooks';
import { BONGO_LOOKS, bongoLook } from '../src/vignettes/bongoLooks';
import { BUBBLE_LOOKS, bubbleLook } from '../src/vignettes/bubbleLooks';
import { CLAP_LOOKS, clapLook } from '../src/vignettes/clapLooks';
import { CUCUMBER_LOOKS, cucumberLook } from '../src/vignettes/cucumberLooks';
import { EGG_LOOKS, eggLook } from '../src/vignettes/eggLooks';
import { FISHERMAN_LOOKS, fishermanLook } from '../src/vignettes/fishermanLooks';
import { HAMMER_LOOKS, hammerLook } from '../src/vignettes/hammerLooks';
import { lookAt } from '../src/vignettes/lookAt';
import { ROLLER_GALLERIES, ROLLER_LOOKS, rollerImage, rollerLook } from '../src/vignettes/rollerLooks';
import { SAW_LOOKS, sawLook } from '../src/vignettes/sawLooks';
import { SCRATCH_LOOKS, scratchLook } from '../src/vignettes/scratchLooks';
import { SNARE_LOOKS, snareLook } from '../src/vignettes/snareLooks';
import { STAPLER_LOOKS, staplerLook } from '../src/vignettes/staplerLooks';
import { TOMATO_LOOKS, tomatoLook } from '../src/vignettes/tomatoLooks';
import { TROMBONE_LOOKS, tromboneLook } from '../src/vignettes/tromboneLooks';
import { WINDOW_LOOKS, windowLook } from '../src/vignettes/windowLooks';
import { PAINT_GRID, paintImage } from '../src/vignettes/errandMotion';
import { levelSpec } from '../src/game/levels';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

interface LookList { readonly id: string }

function colours(look: object): number[] {
  const found: number[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'number' && Number.isInteger(value)) found.push(value);
    else if (Array.isArray(value)) for (const item of value) walk(item);
  };
  walk(look);
  return found;
}

function check<T extends LookList>(name: string, looks: readonly T[], pick: (lap: number) => T, firstId: string, level: number): void {
  it(`${name} keeps its original look on lap 0 and changes after that`, () => {
    expect(looks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(looks.map(look => look.id)).size).toBe(looks.length);
    expect(pick(0).id).toBe(firstId);
    expect(pick(0)).toBe(looks[0]);
    expect(pick(looks.length)).toBe(pick(0));
    expect(pick(1).id).not.toBe(pick(0).id);
    for (const bad of [-3, Number.NaN, Number.NEGATIVE_INFINITY]) expect(pick(bad)).toBe(pick(0));
    for (const look of looks) {
      for (const colour of colours(look)) expect(colour >= 0 && colour <= 0xffffff, `${name} ${look.id}`).toBe(true);
    }
    expect(levelSpec(level).vignette).toBe(name);
    expect(levelSpec(level).lap).toBe(0);
    expect(levelSpec(level + VIGNETTES.length).lap).toBe(1);
  });
}

describe('looks for the acts that had one', () => {
  check('hammer', HAMMER_LOOKS, hammerLook, 'coral', 1);
  check('window', WINDOW_LOOKS, windowLook, 'garden', 2);
  check('saw', SAW_LOOKS, sawLook, 'pine', 4);
  check('tomato', TOMATO_LOOKS, tomatoLook, 'red', 5);
  check('cucumber', CUCUMBER_LOOKS, cucumberLook, 'garden', 7);
  check('banana', BANANA_LOOKS, bananaLook, 'ripe', 8);
  check('egg', EGG_LOOKS, eggLook, 'cream', 10);
  check('bubble', BUBBLE_LOOKS, bubbleLook, 'mint', 11);
  check('roller', ROLLER_LOOKS, rollerLook, 'plaster', 14);
  check('bell', BELL_LOOKS, bellLook, 'chrome', 15);
  check('balloon', BALLOON_LOOKS, balloonLook, 'party', 16);
  check('stapler', STAPLER_LOOKS, staplerLook, 'red', 17);
  check('fisherman', FISHERMAN_LOOKS, fishermanLook, 'mac', 18);
  check('scratch', SCRATCH_LOOKS, scratchLook, 'magenta', 19);
  check('trombone', TROMBONE_LOOKS, tromboneLook, 'gold', 20);
  check('clap', CLAP_LOOKS, clapLook, 'green', 21);
  check('snare', SNARE_LOOKS, snareLook, 'red', 22);
  check('bongos', BONGO_LOOKS, bongoLook, 'terracotta', 23);

  it('pins lap 0 to the colours the acts already shipped with', () => {
    expect(hammerLook(0)).toMatchObject({ handle: 0xcf5134, head: 0x243e35, wood: 0xc99460, woodDark: 0x936542 });
    expect(windowLook(0)).toMatchObject({ frame: 0x82718a, glove: 0xdc9775, sill: 0xd1c1cd, sky: 0xb7d9db, scene: 'garden' });
    expect(sawLook(0)).toMatchObject({ sapwood: 0xcbb999, lit: 0xe4d8c0, grip: 0x3f5a63, sawdust: 0xd8a24a });
    expect(tomatoLook(0)).toMatchObject({ skin: 0xd94a3a, flesh: 0xe35f4a, seed: 0xf5d98a, skinDeep: 0xe15c47, locule: 0xc95536 });
    expect(cucumberLook(0)).toMatchObject({ skin: 0x4c8848, flesh: 0xeef6d4, ridge: 0x73a55b, seed: 0xf5f3ca });
    expect(bananaLook(0)).toMatchObject({ peel: 0xf3c849, speckleAlpha: 0.65, flesh: 0xfff4c4 });
    expect(eggLook(0)).toMatchObject({ shell: 0xffe7ba, speck: 0xbd9367, speckAlpha: 0.3 });
    expect(bubbleLook(0)).toMatchObject({ sheet: 0xe1f2e7, bubble: 0xaed4d1 });
    expect(rollerLook(0)).toMatchObject({ wall: 0xcfc5b4, handle: 0xd9853c, paper: 0xebe4d6 });
    expect(bellLook(0)).toMatchObject({ metal: 0xd5dbe0, livery: 0xc0392b, trim: 0xf1c40f });
    expect(balloonLook(0).balloons).toEqual([0xe25c5c, 0x4fa3c9, 0xf1c04f]);
    expect(balloonLook(0)).toMatchObject({ barrel: 0x3c8f8c, grip: 0xd9853c });
    expect(staplerLook(0)).toMatchObject({ body: 0xc7423a, leather: 0x3f6b57 });
    expect(fishermanLook(0)).toMatchObject({ coat: 0xf0b429, waders: 0x3f5a48, scarf: 0xc4463c, coatInk: 0x9a6d10 });
    expect(scratchLook(0)).toMatchObject({ sleeve: 0x6a4c93, band: 0xf1c04f, warm: 0xe04f9a, cool: 0x4fd3e0 });
    expect(tromboneLook(0)).toMatchObject({ brass: 0xd9a33a, shirt: 0xf3ede0, cap: 0x4f6e5a });
    expect(clapLook(0)).toMatchObject({ skin: 0xdb9d6e, sleeve: 0x4f7a6a, cuff: 0xf2e6d2 });
    expect(snareLook(0)).toMatchObject({ shell: 0x8c3337, shellLit: 0xc6584e, rim: 0xc5594e });
    expect(bongoLook(0)).toMatchObject({ left: 0xbc643e, right: 0xb57b42, shirt: 0x267673 });
  });

  it('gives the roller a new gallery on later laps without moving the first', () => {
    expect(ROLLER_GALLERIES.length).toBe(ROLLER_LOOKS.length);
    expect(rollerImage(1, 0)).toBe(paintImage(1));
    expect(rollerImage(2, 0).id).toBe('heart');
    expect(rollerImage(1, 1).id).toBe('tree');
    expect(rollerImage(1, 2).id).toBe('moon');
    expect(rollerImage(1, ROLLER_LOOKS.length).id).toBe(rollerImage(1, 0).id);
    for (const gallery of ROLLER_GALLERIES) {
      for (const image of gallery) {
        expect(image.rows).toHaveLength(PAINT_GRID.rows);
        for (const row of image.rows) {
          expect(row).toHaveLength(PAINT_GRID.columns);
          for (const cell of row) expect(Number(cell)).toBeLessThan(image.palette.length);
        }
      }
    }
  });

  it('treats a bad index as the first record', () => {
    expect(lookAt(HAMMER_LOOKS, Number.NaN)).toBe(HAMMER_LOOKS[0]);
    expect(lookAt(['a', 'b'], 5)).toBe('b');
  });
});
