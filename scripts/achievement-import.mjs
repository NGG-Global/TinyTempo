#!/usr/bin/env node
/*
 * Writes the Play Console's achievement import ZIP from `src/config/achievementImport.ts`,
 * icons included.
 *
 * The Console takes one flat ZIP (developer.android.com/games/pgs/integrate-achievements):
 * `AchievementsMetadata.csv` — Name, Description, Incremental, Steps, Initial state,
 * Points, List order, no header row — `AchievementsIconsMappings.csv` — Name, icon file —
 * and the icons beside them, 512 px square. No subdirectories, no commas in a name or a
 * description, every file under 1 MB.
 *
 * The icons are drawn by the game (`src/ui/achievementArt.ts`), so this runs the dev build
 * in Chromium, draws each one at twice its size through Phaser's canvas renderer — a 2D
 * canvas antialiases its paths, as `BakedLayer` relies on — and halves it. Needs
 * Playwright, which is not a dependency of the game: `npm i --no-save playwright` if it is
 * not installed. Set CHROMIUM_PATH to use a browser Playwright did not download. Needs
 * `zip` on PATH.
 *
 *   node scripts/achievement-import.mjs
 *
 * Writes store/achievements/: the ZIP to upload, the files it was made from (`import/`),
 * and `preview.png`, every icon on one sheet with its name and points, for review.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'store', 'achievements');
const FILES = join(OUT, 'import');
const ZIP = join(OUT, 'tiny-tempo-achievements-batch-3.zip');
const ICON = 512;

async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return await import(name); } catch { /* try the next */ }
  }
  console.error('Playwright is not installed. Run `npm i --no-save playwright` and try again.');
  process.exit(1);
}

/** Runs in the page: every row of the batch, and each icon as a PNG data URL, plus the sheet. */
async function drawEverything(icon) {
  const { ACHIEVEMENT_BATCH } = await import('/src/config/achievementImport.ts');
  const { rasterAchievementIcon, rimFor } = await import('/src/ui/achievementArt.ts');
  const scene = window.__PHASER_GAME__.scene.getScenes(true)[0];
  const out = [];
  for (const entry of ACHIEVEMENT_BATCH) {
    const canvas = rasterAchievementIcon(scene, entry.art, icon, rimFor(entry.points));
    out.push({ ...entry, png: canvas.toDataURL('image/png'), canvas });
  }
  // The review sheet: six across, each tile with its name and points under it.
  const cols = 6, tile = 200, pad = 18, label = 52;
  const rows = Math.ceil(out.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * (tile + pad) + pad; sheet.height = rows * (tile + pad + label) + pad;
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#eee8d8'; sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.imageSmoothingQuality = 'high';
  out.forEach((entry, i) => {
    const x = pad + (i % cols) * (tile + pad), y = pad + Math.floor(i / cols) * (tile + pad + label);
    sctx.drawImage(entry.canvas, x, y, tile, tile);
    // The toast's circle, so what it crops can be judged on the sheet.
    sctx.strokeStyle = 'rgba(36,62,53,0.35)'; sctx.setLineDash([6, 6]); sctx.lineWidth = 2;
    sctx.beginPath(); sctx.arc(x + tile / 2, y + tile / 2, tile / 2, 0, Math.PI * 2); sctx.stroke(); sctx.setLineDash([]);
    sctx.fillStyle = '#243e35'; sctx.font = '600 17px Nunito, sans-serif'; sctx.textAlign = 'center';
    sctx.fillText(entry.name, x + tile / 2, y + tile + 22);
    sctx.fillStyle = '#4e5a52'; sctx.font = '15px Nunito, sans-serif';
    sctx.fillText(`${entry.points} pts · ${entry.key}`, x + tile / 2, y + tile + 42);
  });
  return { rows: out.map(({ canvas, ...rest }) => rest), sheet: sheet.toDataURL('image/png') };
}

const png = dataUrl => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

/** The import's own rules, checked again here so a bad row never reaches the Console. */
function check(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const field of ['name', 'description']) {
      if (/[,\n"]/.test(row[field])) throw new Error(`${row.key}: ${field} has a comma, quote or line break`);
    }
    if (row.name.length > 100 || row.description.length > 500) throw new Error(`${row.key}: too long`);
    if (names.has(row.name)) throw new Error(`${row.key}: name repeated`);
    names.add(row.name);
    if (row.points % 5 !== 0 || row.points < 5 || row.points > 200) throw new Error(`${row.key}: points ${row.points}`);
  }
}

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
    await page.evaluate(() => document.fonts.ready);
    const { rows, sheet } = await page.evaluate(drawEverything, ICON);
    check(rows);

    rmSync(FILES, { recursive: true, force: true });
    mkdirSync(FILES, { recursive: true });
    const metadata = rows.map(r => [r.name, r.description, 'False', '', 'Revealed', r.points, r.order].join(','));
    const mappings = rows.map(r => `${r.name},${r.key}.png`);
    writeFileSync(join(FILES, 'AchievementsMetadata.csv'), `${metadata.join('\n')}\n`);
    writeFileSync(join(FILES, 'AchievementsIconsMappings.csv'), `${mappings.join('\n')}\n`);
    for (const r of rows) {
      const file = join(FILES, `${r.key}.png`);
      writeFileSync(file, png(r.png));
      if (statSync(file).size >= 1_000_000) throw new Error(`${r.key}.png is over 1 MB`);
    }
    writeFileSync(join(OUT, 'preview.png'), png(sheet));
    rmSync(ZIP, { force: true });
    // -j: flat, as the import requires; -X: no extra attributes.
    const zip = spawnSync('zip', ['-j', '-X', '-q', ZIP, join(FILES, 'AchievementsMetadata.csv'), join(FILES, 'AchievementsIconsMappings.csv'), ...rows.map(r => join(FILES, `${r.key}.png`))], { stdio: 'inherit' });
    if (zip.status !== 0) throw new Error('zip failed');
    const points = rows.reduce((sum, r) => sum + r.points, 0);
    console.log(`${rows.length} achievements, ${points} points, ${rows.length + 2} files → ${ZIP.slice(ROOT.length)}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
