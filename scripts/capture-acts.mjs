#!/usr/bin/env node
/*
 * Records every act for the website's gallery, from the game itself.
 *
 * The gallery used to be twenty CSS drawings, each looping on a period of its own —
 * 0.85 s, 1.2 s, 1.9 s, 2.6 s — so none of them moved on the beat and several did not
 * look like the act they named. The honest picture of an act is the act: this runs the
 * dev build, opens each act's first level, lets the debug auto-player answer the task
 * perfectly, and records one whole task: the demonstration, the response, and the coda
 * and table slide that bring on the next one. The clip ends on the next task's downbeat,
 * with a fresh subject in place, so it loops without a seam.
 *
 * The game draws every frame from the audio clock, and a headless browser renders far
 * below 30 fps, so recording in real time would drop most frames. The page runs on a
 * virtual clock instead: Playwright's fake timers drive `performance.now` and
 * `requestAnimationFrame`, and `AudioContext.currentTime` is made to read the same clock,
 * so each frame is stepped exactly 1/30 s and every beat lands on the frame it belongs to.
 * Nothing is heard; nothing needs to be.
 *
 * Needs `ffmpeg` on PATH (as `npm run icons` does) and Playwright, which is not a
 * dependency of the game: `npm i --no-save playwright` if it is not installed. Set
 * CHROMIUM_PATH to use a browser Playwright did not download.
 *
 *   node scripts/capture-acts.mjs            every act, and the hero's screen
 *   node scripts/capture-acts.mjs bell clap  just those
 *   node scripts/capture-acts.mjs screen     just the hero's screen
 *
 * Writes legal/acts/<id>.webm and <id>.mp4 with a poster beside them (<id>.jpg, the
 * demonstration's first contact, which is also what a visitor with reduced motion sees), and
 * the same three for `screen`: level 1's first task with the play HUD left on, for the
 * handset at the top of the page.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'legal', 'acts');
const FPS = 30;
/** A task is three bars at most — the longest coda holds five beats — so this is a ceiling. */
const MAX_SEC = 12;

/**
 * Where each act first plays on its original look. Levels 1–50 cycle the first
 * twenty-five acts, and the era that added the last three opens on them at level 51
 * (`vignettes/rotation.ts`). Checked against the running scene before anything is
 * recorded, so a reordered registry fails here rather than filing a clip under the
 * wrong name.
 */
const ACTS = [
  'hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'cucumber', 'banana', 'paper',
  'egg', 'bubble', 'light', 'doorbell', 'roller', 'bell', 'balloon', 'stapler',
  'fisherman', 'scratch', 'trombone', 'clap', 'snare', 'bongos', 'slushy', 'apple',
  'barber', 'popcorn', 'toothbrush',
].map((id, i) => ({ id, level: i < 25 ? i + 1 : 51 + (i - 25) }));

/** Recorded on a 390x844 handset, the size the game is laid out for most often. */
const VIEW = { width: 390, height: 844 };

/**
 * An act's tile: the stage between the headline and the turn block, which the recording
 * hides anyway, encoded at the crop's 13:16 and about 1.6x the widest tile the gallery
 * draws. The poster is the demonstration's first contact — every pattern opens on its
 * downbeat — a frame after it lands, so a still tile shows the act mid-action.
 */
const actJob = act => ({
  ...act, chrome: false, crop: { x: 0, y: 190, width: 390, height: 480 }, size: { width: 432, height: 532 }, posterSec: 1 / FPS,
});

/**
 * The hero's handset: the whole screen of level 1's first task, headline, turn block and
 * count-in included. Its poster is the answer's second Perfect, with the baton home.
 */
const SCREEN = {
  id: 'screen', act: 'hammer', level: 1, chrome: true, crop: { x: 0, y: 0, ...VIEW }, size: { width: 540, height: 1168 }, posterSec: 2.62,
};

async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return await import(name); } catch { /* try the next */ }
  }
  console.error('Playwright is not installed. Run `npm i --no-save playwright` and try again.');
  process.exit(1);
}

function ffmpeg(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (run.error || run.status !== 0) throw new Error(`ffmpeg failed: ${run.error?.message ?? `exit ${run.status}`}`);
}

/** Runs in the page before any game code: every clock the game reads becomes one clock. */
function virtualAudioClock() {
  const origin = performance.now();
  Object.defineProperty(BaseAudioContext.prototype, 'currentTime', { get() { return (performance.now() - origin) / 1000; } });
  Object.defineProperty(BaseAudioContext.prototype, 'baseLatency', { get() { return 0; } });
  Object.defineProperty(AudioContext.prototype, 'outputLatency', { get() { return 0; } });
  AudioContext.prototype.getOutputTimestamp = function () { return { contextTime: this.currentTime, performanceTime: performance.now() }; };
  // The first-run pass and the finer grids' introductions would each record instead of
  // the act's own first task.
  localStorage.setItem('small-acts.teach.v1', JSON.stringify({ seen: true, triplet: true, sixteenth: true, scrapbook: true, replayTip: true }));
}

/**
 * Hides everything that is not the act's, every frame before it renders: the headline,
 * the turn block, the pucks, the debug readout, and a finale's pennants — egg cracking and
 * the trombone first play on levels 10 and 20, which close their areas. What the act owns
 * is whatever its vignette reaches; everything else on the display list goes. With
 * `chrome`, only the debug readout and the replay panel go, and the play HUD stays.
 */
function hideChrome(chrome) {
  const scene = window.__PHASER_GAME__.scene.getScenes(true).find(active => active.vignette);
  const style = document.createElement('style');
  style.textContent = 'body > div:not(#game-root), button { display: none !important; }';
  document.head.append(style);
  if (chrome) {
    scene.events.on('postupdate', () => scene.debug?.setVisible(false));
    return;
  }
  const isObject = value => value && typeof value === 'object' && typeof value.setVisible === 'function' && 'displayList' in value;
  const isScene = value => value && typeof value === 'object' && value.sys?.settings !== undefined;
  const acts = () => {
    const keep = new Set();
    const seen = new Set();
    const walk = (value, depth) => {
      if (!value || typeof value !== 'object' || seen.has(value) || isScene(value) || depth > 5) return;
      seen.add(value);
      if (isObject(value)) { keep.add(value); for (const child of value.list ?? []) walk(child, depth + 1); return; }
      for (const item of Array.isArray(value) ? value : Object.values(value)) walk(item, depth + 1);
    };
    walk(scene.vignette, 0);
    return keep;
  };
  scene.events.on('postupdate', () => {
    const keep = acts();
    for (const child of scene.children.list) if (!keep.has(child)) child.visible = false;
  });
}

function sceneState() {
  const scene = window.__PHASER_GAME__?.scene.getScenes(true).find(active => active.vignette);
  const plan = scene?.controller?.plan;
  return {
    ready: Boolean(scene),
    id: scene?.definition?.id,
    lap: scene?.spec?.lap,
    now: scene?.now?.() ?? 0,
    plan: plan ? { id: plan.id, bpm: plan.bpm, demo: plan.demo, response: plan.response, targets: plan.targets } : null,
    phase: scene?.controller?.phase ?? null,
  };
}


/** Opens the job's level, starts the auto-player and screenshots one task, frame by frame. */
async function roll(page, job, dir, origin) {
  page.on('pageerror', error => console.error(`  ${job.id}: ${error.message}`));
  await page.addInitScript(virtualAudioClock);
  await page.clock.install({ time: new Date('2026-09-24T12:00:00Z') });
  await page.goto(`${origin}/?debug&level=${job.level}`, { waitUntil: 'load' });
  // An installed clock still flows in real time, and a software-rendered screenshot takes a
  // quarter of a second: paused, it moves only when stepped. The pause has to land in the
  // page's future, which keeps moving while this asks for it.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 2000);

  // Loading, decoding and the curtain happen in real time; let virtual time creep along
  // beside them until the scene is up. Vite may reload the page once while it bundles
  // dependencies on a cold start, which destroys the context an evaluate was running in.
  const poll = () => page.evaluate(sceneState).catch(() => ({ ready: false }));
  let state = await poll();
  for (let i = 0; i < 200 && !state.ready; i++) {
    await page.clock.runFor(50).catch(() => {});
    await page.waitForTimeout(40);
    state = await poll();
  }
  const act = job.act ?? job.id;
  if (!state.ready) throw new Error(`${job.id}: the play scene never started`);
  if (state.id !== act || state.lap !== 0) throw new Error(`level ${job.level} plays ${state.id} lap ${state.lap}, not ${act} lap 0`);
  for (let i = 0; i < 20; i++) { await page.clock.runFor(50); await page.waitForTimeout(40); }
  await page.evaluate(hideChrome, job.chrome);

  // The auto-player starts the round and answers every target on time.
  const before = (await page.evaluate(sceneState)).plan?.demo;
  // It is clicked in the page because the recording has already hidden its panel.
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Accurate replay');
    button?.click();
    return Boolean(button);
  });
  if (!started) throw new Error(`${job.id}: no auto-player; is this a development build with ?debug?`);
  // A round may already have been planned when the scene came up; the one to record is
  // the auto-player's, whose demonstration is still a bar ahead when it appears.
  for (let i = 0; i < 400; i++) {
    state = await page.evaluate(sceneState);
    if (state.plan && state.plan.demo !== before && state.plan.demo - state.now > 0.5) break;
    await page.clock.runFor(50);
    await page.waitForTimeout(30);
  }
  if (!state.plan || state.plan.demo === before || state.plan.demo - state.now <= 0.5) throw new Error(`${job.id}: the round never started`);
  // Up to the downbeat in small steps, so every frame on the way has rendered with the
  // chrome hidden and the first frame recorded is the demonstration's first.
  while (state.now < state.plan.demo - 0.012) {
    await page.clock.runFor(Math.min(50, Math.max(1, Math.round((state.plan.demo - state.now) * 1000) - 4)));
    state = await page.evaluate(sceneState);
  }

  const first = state.plan.demo;
  // Whole milliseconds, carried so frame i lands at i/FPS: the fake timers stop firing
  // animation frames after a fractional step. The clip stops short of the next task's
  // downbeat, which is the frame the loop comes back round to.
  let frames = 0;
  for (; frames < MAX_SEC * FPS; frames++) {
    if (frames > 0) {
      await page.clock.runFor(Math.round(frames * 1000 / FPS) - Math.round((frames - 1) * 1000 / FPS));
      state = await page.evaluate(sceneState);
      if (state.plan && state.plan.demo > first + 0.1 && state.now >= state.plan.demo - 0.5 / FPS) break;
    }
    await page.screenshot({ path: join(dir, `${String(frames).padStart(4, '0')}.png`), clip: job.crop });
  }
  if (frames >= MAX_SEC * FPS) throw new Error(`${job.id}: the next task never came`);
  return frames;
}

async function record(browser, job, work) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  const dir = mkdtempSync(join(work.tmp, `${job.id}-`));
  try {
    const frames = await roll(page, job, dir, work.origin).finally(() => page.close().catch(() => {}));
    const scale = `scale=${job.size.width}:${job.size.height}:flags=lanczos`;
    const input = ['-framerate', String(FPS), '-i', join(dir, '%04d.png'), '-vf', `${scale},format=yuv420p`, '-g', String(frames), '-an'];
    // VP9 first, because an open-source Chromium decodes no H.264; H.264 for the Safari
    // that plays no WebM. Both from the same frames, never one transcoded from the other.
    ffmpeg([...input, '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', join(OUT, `${job.id}.webm`)]);
    ffmpeg([...input, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryslow', '-crf', '27', '-tune', 'animation',
      '-movflags', '+faststart', join(OUT, `${job.id}.mp4`)]);
    const poster = Math.min(frames - 1, Math.round(job.posterSec * FPS));
    ffmpeg(['-i', join(dir, `${String(poster).padStart(4, '0')}.png`), '-vf', scale, '-q:v', '4', join(OUT, `${job.id}.jpg`)]);
    console.log(`  ${job.id} (level ${job.level}): ${(frames / FPS).toFixed(2)} s`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const wanted = new Set(process.argv.slice(2));
  const every = [...ACTS.map(actJob), SCREEN];
  const jobs = wanted.size ? every.filter(job => wanted.has(job.id)) : every;
  if (jobs.length === 0) { console.error(`Nothing called that. Known: ${every.map(job => job.id).join(', ')}`); process.exit(1); }
  if (spawnSync('ffmpeg', ['-version']).error) { console.error('ffmpeg is not on PATH.'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });

  const { chromium } = await loadPlaywright();
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const address = server.httpServer.address();
  const work = { origin: `http://127.0.0.1:${address.port}`, tmp: mkdtempSync(join(tmpdir(), 'tiny-tempo-acts-')) };
  const launch = () => chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  // A browser per worker, never a tab: a second tab in the same window is a background
  // tab, and the game pauses itself when its page is hidden — which recorded two bars of
  // an act standing perfectly still.
  const browsers = await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, launch));
  try {
    console.log(`Recording ${jobs.length} clip${jobs.length === 1 ? '' : 's'} into legal/acts/`);
    const queue = [...jobs];
    const failed = [];
    await Promise.all(browsers.map(async browser => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        // A software renderer under load drops the odd page; one retry, then report it.
        try { await record(browser, job, work); } catch (first) {
          console.error(`  ${job.id}: ${first.message.split('\n')[0]}; trying again`);
          try { await record(browser, job, work); } catch (second) { failed.push(job.id); console.error(`  ${job.id}: ${second.message.split('\n')[0]}`); }
        }
      }
    }));
    if (failed.length) throw new Error(`Not recorded: ${failed.join(', ')}`);
  } finally {
    await Promise.all(browsers.map(browser => browser.close()));
    await server.close();
    rmSync(work.tmp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exit(1); });
