#!/usr/bin/env node
/*
 * Writes the Play Console icon for every in-app product (`docs/PLAY_PRODUCTS.md`).
 *
 * The Console wants a 32-bit PNG, 1:1, between 512 and 1080 px a side, under 8 MB, with no
 * text, price or branding. The icons are drawn by the game (`src/ui/productArt.ts`), so
 * this runs the dev build in Chromium, draws each one at twice its size through Phaser's
 * canvas renderer and halves it, as `scripts/achievement-import.mjs` does. Needs
 * Playwright, which is not a dependency of the game: `npm i --no-save playwright` if it is
 * not installed. Set CHROMIUM_PATH to use a browser Playwright did not download.
 *
 *   node scripts/product-icons.mjs
 *
 * Writes store/products/<product id>.png at 1024 px, and `preview.png`, every icon on one
 * sheet with its id, for review.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'store', 'products');
const ICON = 1024;
const LIMIT = 8 * 1024 * 1024;

async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return await import(name); } catch { /* try the next */ }
  }
  console.error('Playwright is not installed. Run `npm i --no-save playwright` and try again.');
  process.exit(1);
}

/** Runs in the page: each product's icon as a PNG data URL, plus the review sheet. */
async function drawEverything(icon) {
  const { productArtIds, rasterProductIcon } = await import('/src/ui/productArt.ts');
  const scene = window.__PHASER_GAME__.scene.getScenes(true)[0];
  const out = [];
  for (const product of productArtIds()) {
    const canvas = rasterProductIcon(scene, product, icon);
    out.push({ product, png: canvas.toDataURL('image/png'), canvas });
  }
  const cols = 3, tile = 256, pad = 20, label = 36;
  const rows = Math.ceil(out.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * (tile + pad) + pad; sheet.height = rows * (tile + pad + label) + pad;
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#eee8d8'; sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.imageSmoothingQuality = 'high';
  out.forEach((entry, i) => {
    const x = pad + (i % cols) * (tile + pad), y = pad + Math.floor(i / cols) * (tile + pad + label);
    sctx.drawImage(entry.canvas, x, y, tile, tile);
    sctx.fillStyle = '#243e35'; sctx.font = '600 16px Nunito, sans-serif'; sctx.textAlign = 'center';
    sctx.fillText(entry.product, x + tile / 2, y + tile + 24);
  });
  return { rows: out.map(({ canvas, ...rest }) => rest), sheet: sheet.toDataURL('image/png') };
}

const png = dataUrl => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

async function main() {
  const { chromium } = await loadPlaywright();
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window.__PHASER_GAME__?.scene.getScenes(true).length ?? 0) > 0, null, { timeout: 60_000 });
    const { rows, sheet } = await page.evaluate(drawEverything, ICON);
    mkdirSync(OUT, { recursive: true });
    for (const r of rows) {
      const file = join(OUT, `${r.product}.png`);
      writeFileSync(file, png(r.png));
      if (statSync(file).size > LIMIT) throw new Error(`${r.product}.png is over 8 MB`);
    }
    writeFileSync(join(OUT, 'preview.png'), png(sheet));
    console.log(`${rows.length} icons at ${ICON} px → ${OUT.slice(ROOT.length)}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
