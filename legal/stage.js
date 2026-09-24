/*
 * The playable stage: level 1's hammer and nail over the turn block, drawn and timed the
 * way the game draws and times them.
 *
 * Nothing here is an impression of the app. Each piece is a port of the code the app runs,
 * kept in the same order and with the same numbers, so a change there has one obvious
 * place to land here:
 *
 *   the act            src/vignettes/HammerNailVignette.ts, hammerMotion.ts, hammerLooks.ts
 *   the block          src/ui/turnBlock.ts, ui/panel.ts, ui/icons.ts, ui/flourish.ts
 *   the timing         src/game/beatTrack.ts, game/TaskSequence.ts, rhythm/judge.ts
 *   the motion         src/ui/spring.ts, vignettes/motion.ts, ui/light.ts, ui/colour.ts
 *   the sound          src/audio/hammerSounds.ts, the count-in tones in audio/AudioEngine.ts
 *
 * The game's Graphics calls become Canvas 2D calls one for one, in design units: the canvas
 * is 720 wide like the game's design box, and scaled to whatever the page gives it.
 *
 * What the page does differently, on purpose: a task the visitor never taps in is not
 * scored and ends without the rough coda — the game would bend the nail, and a reader
 * scrolling past should not be told off — and sound waits for the first tap, as a browser
 * requires. There is no music; a quiet tick on each beat stands in for its pulse.
 */
(() => {
  'use strict';

  const host = document.querySelector('[data-stage]');
  const canvas = host?.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!host || !canvas || !ctx) return;

  // ------------------------------------------------------------------ config

  const PALETTE = { paper: 0xeee8d8, ink: 0x243e35, muted: 0x4e5a52, coral: 0xcf5134 };
  const SHELL = { cream: 0xfff4dc, puck: 0xf6ead0, wood: 0xd98a48, sun: 0xdfc37f };
  const WORKSHOP = { paper: 0xeee8d8, ink: 0x243e35, sun: 0xdfc37f, red: 0xcf5134, cream: 0xfff9e8 };
  /** Lap 0 of `HAMMER_LOOKS`: the coral handle, the dark head, the pine bench. */
  const LOOK = { handle: 0xcf5134, head: 0x243e35, wood: 0xc99460, woodDark: 0x936542 };
  /** The workshop treatment (`config/style.ts`). */
  const STYLE = { outline: 7, exaggeration: 1.35 };
  const RHYTHM = { perfectMs: 55, goodMs: 130, deliveryGraceMs: 50, runwayBeats: 2, turnCountBeats: 3, goodPoints: 70, extraPenalty: 25 };
  const HAMMER = { anticipationSec: 0.24, contactHoldSec: 0.026, recoilSec: 0.34 };
  const TRACK = {
    beadGap: 58, beadRadius: 19, plateHeight: 72, plateDepth: 7, plateRadius: 28, pipGap: 30, pipRadius: 6,
    shelfHeight: 46, shelfRadius: 22, shelfInset: 24, shelfBeadRadius: 12, rowGap: 14,
    ownerSlotRadius: 26, ownerInset: 46, slotClearance: 10, batonRadius: 26, faceLift: 15, batonBow: 60,
  };
  const SOCKET_RING = 0x8f3620;
  const RECESS = 0x5a4230;
  const COPY = { success: 'Nicely done.', rough: 'It has character.' };

  const BPM = 120;
  const BEAT = 60 / BPM;
  /**
   * The patterns a first area opens on: every one starts on its downbeat, as the game's
   * vocabulary does, and rests where a player learns to count one.
   */
  const PATTERNS = [[0, 1, 2, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2]];

  /**
   * The stage in design units: the lower part of the game's screen, where the act meets
   * the bench and the block sits on its timber. The act's scale and the distance from the
   * bench to the block are the game's on a 390x844 handset.
   */
  const W = 720;
  const H = 880;
  const ACT_SCALE = 0.92;
  const BENCH_Y = 500;
  const TRACK_Y = BENCH_Y + 232;
  const STAGE_X = W / 2 - 350 * ACT_SCALE;

  // ------------------------------------------------------------------ motion

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOut = v => 1 - (1 - clamp01(v)) ** 3;
  const easeInOutCubic = v => { const t = clamp01(v); return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; };
  const backFactors = new Map();
  function backFactor(amount) {
    if (amount <= 0) return 0;
    if (backFactors.has(amount)) return backFactors.get(amount);
    let s = 10 * (1 + amount);
    for (let i = 0; i < 12; i++) {
      const f = 4 * s ** 3 - 27 * amount * (s + 1) ** 2;
      const df = 12 * s ** 2 - 54 * amount * (s + 1);
      s -= f / df;
    }
    backFactors.set(amount, s);
    return s;
  }
  function overshoot(t, amount = 0.25) {
    const p = clamp01(t);
    const s = backFactor(amount);
    return 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
  }
  const squash = (age, duration, amount) => (age < 0 || age >= duration ? 0 : Math.sin(age / duration * Math.PI) * amount);
  const settle = (age, frequency, decay) => (!Number.isFinite(age) || age < 0 ? 0 : Math.sin(age * frequency) * Math.exp(-age * decay));
  const stagger = (index, count, spread) => (count <= 1 ? 0 : spread * Math.max(0, Math.min(count - 1, index)) / (count - 1));
  function arrive(age, duration) {
    const p = clamp01(age / duration);
    return { rise: 1 - overshoot(p, 0.12), alpha: easeOut(Math.min(1, p * 1.6)) };
  }

  function anticipation(untilImpact, recoveredAngle = 0.55) {
    const p = clamp01(1 - untilImpact / HAMMER.anticipationSec);
    const lift = p < 0.42 ? 0.55 + 0.27 * Math.sin(p / 0.42 * Math.PI / 2) : 0.82 * (1 - ((p - 0.42) / 0.58) ** 3);
    return lift + (Math.min(0.55, recoveredAngle) - 0.55) * (1 - p);
  }
  function recoil(age) {
    const p = clamp01((age - HAMMER.contactHoldSec) / (HAMMER.recoilSec - HAMMER.contactHoldSec));
    return 0.55 * easeOut(p) + 0.13 * Math.sin(p * Math.PI) ** 2;
  }
  const nailHeight = depth => 213 * (1 - clamp01(depth)) - 10;

  // ------------------------------------------------------------------ colour

  const byte = v => Math.max(0, Math.min(255, Math.round(v)));
  function mix(a, b, t) {
    const k = clamp01(t);
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return (byte(ar + (br - ar) * k) << 16) | (byte(ag + (bg - ag) * k) << 8) | byte(ab + (bb - ab) * k);
  }
  const shade = (c, amount) => (amount >= 0 ? mix(c, 0xffffff, amount) : mix(c, 0x000000, -amount));
  const rgba = (c, a = 1) => `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${a})`;
  function luminance(c) {
    const chan = v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * chan((c >> 16) & 0xff) + 0.7152 * chan((c >> 8) & 0xff) + 0.0722 * chan(c & 0xff);
  }
  function contrast(a, b) {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  /** `typeStroke`: an outline only where the letter's own fill can carry one. */
  function typeStroke(fill) {
    const stroke = luminance(fill) > 0.45 ? shade(PALETTE.ink, -0.22) : shade(fill, -0.72);
    return contrast(fill, stroke) >= 3 ? stroke : null;
  }
  const faces = c => ({ lit: shade(c, 0.14), face: c, shade: shade(c, -0.28), edge: shade(c, -0.45), rim: mix(shade(c, 0.35), 0xffffff, 0.35) });
  /** One key light, high on the left (`ui/light.ts`). */
  function castShadow(depth) {
    const reach = depth * 1.1;
    return { dx: 0.5 * reach, dy: 0.75 * reach, alpha: Math.max(0.08, 0.28 - reach * 0.012) };
  }

  // ------------------------------------------------------------------ Graphics → Canvas

  function roundRect(x, y, w, h, r) {
    const k = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }
  const fill = (c, a = 1) => { ctx.fillStyle = rgba(c, a); ctx.fill(); };
  const stroke = (width, c, a = 1) => { ctx.lineWidth = width; ctx.strokeStyle = rgba(c, a); ctx.stroke(); };
  const fillRR = (x, y, w, h, r, c, a = 1) => { if (w > 0 && h > 0) { roundRect(x, y, w, h, r); fill(c, a); } };
  const strokeRR = (x, y, w, h, r, width, c, a = 1) => { roundRect(x, y, w, h, r); stroke(width, c, a); };
  const fillRect = (x, y, w, h, c, a = 1) => { if (w > 0 && h > 0) { ctx.fillStyle = rgba(c, a); ctx.fillRect(x, y, w, h); } };
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); };
  const fillCircle = (x, y, r, c, a = 1) => { circle(x, y, r); fill(c, a); };
  const strokeCircle = (x, y, r, width, c, a = 1) => { circle(x, y, r); stroke(width, c, a); };
  /** Phaser's ellipses take a centre and a full width and height. */
  const ellipse = (x, y, w, h) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2); };
  const fillEllipse = (x, y, w, h, c, a = 1) => { ellipse(x, y, w, h); fill(c, a); };
  const strokeEllipse = (x, y, w, h, width, c, a = 1) => { ellipse(x, y, w, h); stroke(width, c, a); };
  const line = (x1, y1, x2, y2, width, c, a = 1) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); stroke(width, c, a); };
  function poly(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  function path(points, width, c, a = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    stroke(width, c, a);
  }

  /** `drawPanel`: a slab with thickness under the one light, and the workshop outline. */
  function drawPanel(x, y, w, h, spec) {
    const depth = spec.depth ?? 10;
    const radius = Math.min(h / 2, spec.radius ?? 18);
    const f = faces(spec.fill);
    const shadow = castShadow(depth);
    fillRR(x + shadow.dx, y + shadow.dy + depth, w, h, radius, 0x1a1410, shadow.alpha);
    fillRR(x, y + depth, w, h, radius, f.shade);
    const edgeH = 3, edgeInset = Math.max(radius * 0.55, 8);
    fillRect(x + edgeInset, y + depth + h - edgeH, w - edgeInset * 2, edgeH, f.edge);
    fillRR(x, y, w, h, radius, f.face);
    fillRR(x + radius * 0.6, y + 2, w - radius * 1.2, 3.5, 2, f.rim, 0.55);
    strokeRR(x, y, w, h, radius, STYLE.outline * 0.55, shade(spec.fill, -0.6));
  }

  const HAMMER_TILT = -36 * Math.PI / 180;
  function rotatedRoundedRect(cx, cy, w, h, radius, angle, ox, oy) {
    const r = Math.min(radius, w / 2, h / 2);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const points = [];
    for (const [kx, ky, from] of [[cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI]]) {
      for (let i = 0; i <= 4; i++) {
        const a = from + (i / 4) * (Math.PI / 2);
        const px = kx + Math.cos(a) * r, py = ky + Math.sin(a) * r;
        points.push([ox + (px - ox) * cos - (py - oy) * sin, oy + (px - ox) * sin + (py - oy) * cos]);
      }
    }
    return points;
  }
  /** The demonstration's glyph: a hammer in profile, head low-left. */
  function drawHammerMark(x, y, r, c, a = 1) {
    poly(rotatedRoundedRect(x - r * 0.28, y, r * 0.71, r, r * 0.18, HAMMER_TILT, x, y)); fill(c, a);
    poly(rotatedRoundedRect(x + r * 0.33, y, r, r * 0.35, r * 0.18, HAMMER_TILT, x, y)); fill(c, a);
  }
  /** The player's glyph: a fingertip on the surface, two ripples above it. */
  function drawTapMark(x, y, r, c, a = 1) {
    const cy = y + r * 0.28;
    fillCircle(x, cy, r * 0.42, c, a);
    ctx.beginPath(); ctx.arc(x, cy, r * 0.7, -2.55, -0.59); stroke(r * 0.2, c, a);
    ctx.beginPath(); ctx.arc(x, cy, r * 1.05, -2.42, -0.72); stroke(r * 0.2, c, a * 0.6);
  }

  /** Display type the way `ui/type.ts` dresses it: an outline where it can carry one, and a drop. */
  function dressedText(text, x, y, size, colour, { alpha = 1, scale = 1, tilt = 0 } = {}) {
    if (alpha <= 0.01) return;
    const outline = typeStroke(colour);
    const width = outline === null ? 0 : Math.max(1.5, size * 0.02 * STYLE.outline * Math.min(1, size / 44) ** 2);
    const drop = outline === null ? SHELL.cream : luminance(colour) > 0.45 ? shade(PALETTE.ink, -0.25) : shade(colour, -0.7);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const dy = Math.max(1, size * (outline === null ? 0.05 : 0.07));
    // Phaser strokes the glyph at `strokeThickness` and fills over it, so half the width shows.
    if (width > 0) { ctx.lineWidth = width; ctx.strokeStyle = rgba(drop); ctx.strokeText(text, 0, dy); }
    ctx.fillStyle = rgba(drop);
    ctx.fillText(text, 0, dy);
    if (width > 0) { ctx.lineWidth = width; ctx.strokeStyle = rgba(outline); ctx.strokeText(text, 0, 0); }
    ctx.fillStyle = rgba(colour);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.lineJoin = 'miter';
  }

  // ------------------------------------------------------------------ materials

  function lcg(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }
  /** `textures/materials.ts`: the wood tile, tinted the way Phaser tints a texture. */
  function woodTile(tint) {
    const size = 256;
    const tile = document.createElement('canvas');
    tile.width = tile.height = size;
    const c = tile.getContext('2d');
    const image = c.createImageData(size, size);
    const d = image.data;
    const tr = ((tint >> 16) & 0xff) / 255, tg = ((tint >> 8) & 0xff) / 255, tb = (tint & 0xff) / 255;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
        const warp = Math.sin(u) * 0.55 + Math.sin(u * 3 + 1.3) * 0.2;
        const slow = Math.sin(v * 4 + warp);
        const ring = Math.sign(slow) * Math.abs(slow) ** 0.35 * 0.5 + Math.sin(v * 9 + warp * 2 + 0.7) * 0.22;
        const streak = Math.sin(v * 58 + Math.sin(u * 2) * 2.5) * (0.5 + 0.5 * Math.sin(u * 5 + v * 3)) * 0.045;
        const g = clamp01(0.85 + ring * 0.1 + streak) * 255;
        const i = (y * size + x) * 4;
        d[i] = g * tr; d[i + 1] = g * tg; d[i + 2] = g * tb; d[i + 3] = 255;
      }
    }
    c.putImageData(image, 0, 0);
    const random = lcg(733);
    for (let i = 0; i < 420; i++) {
      c.fillStyle = `rgba(0,0,0,${0.06 + random() * 0.1})`;
      c.fillRect(Math.floor(random() * size), Math.floor(random() * size), 2 + Math.floor(random() * 14), 1);
    }
    return ctx.createPattern(tile, 'repeat');
  }
  function paperTile() {
    const size = 256;
    const tile = document.createElement('canvas');
    tile.width = tile.height = size;
    const c = tile.getContext('2d');
    const random = lcg(431);
    for (let i = 0; i < 9000; i++) {
      const x = Math.floor(random() * size), y = Math.floor(random() * size);
      const light = random() < 0.4;
      c.fillStyle = light ? `rgba(255,255,255,${0.18 + random() * 0.22})` : `rgba(0,0,0,${0.06 + random() * 0.1})`;
      const length = random() < 0.15 ? 2 + Math.floor(random() * 3) : 1;
      if (random() < 0.7) c.fillRect(x, y, length, 1); else c.fillRect(x, y, 1, length);
    }
    return ctx.createPattern(tile, 'repeat');
  }
  /** The soft disc a pool of light is drawn with (`ui/feedback.ts`), tinted. */
  function glow(x, y, size, c, a) {
    const r = size / 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(0.5, rgba(c, a * 0.8));
    g.addColorStop(0.82, rgba(c, a * 0.22));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, size, size);
  }
  let bench = null;
  let fibre = null;

  // ------------------------------------------------------------------ particles

  /**
   * Phaser's emitters, as pure functions of age: a burst is its launch, and where each
   * particle is at any moment follows from that, so a dropped frame costs only the frame.
   */
  const PRESETS = {
    dust: { speed: [60, 190], angle: [200, 340], gravity: 420, life: [0.32, 0.62], scale: [0.55, 0.05], alpha: [0.9, 0], add: false },
    sparks: { speed: [180, 420], angle: [0, 360], gravity: 300, life: [0.18, 0.42], scale: [0.45, 0], alpha: [1, 0], add: true },
  };
  const particles = [];
  const between = ([a, b]) => a + Math.random() * (b - a);
  function burst(preset, space, x, y, tints, count, at) {
    const p = PRESETS[preset];
    const n = Math.round(count * STYLE.exaggeration);
    for (let i = 0; i < n; i++) {
      const angle = between(p.angle) * Math.PI / 180, speed = between(p.speed);
      particles.push({ p, space, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: at, life: between(p.life), tint: tints[i % tints.length] });
    }
  }
  function drawParticles(space, now) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      const age = now - q.born;
      if (age > q.life || age < -1) { if (age > q.life) particles.splice(i, 1); continue; }
      if (q.space !== space || age < 0) continue;
      const k = age / q.life;
      const x = q.x + q.vx * age, y = q.y + q.vy * age + 0.5 * q.p.gravity * age * age;
      const r = 16 * (q.p.scale[0] + (q.p.scale[1] - q.p.scale[0]) * k);
      const a = q.p.alpha[0] + (q.p.alpha[1] - q.p.alpha[0]) * k;
      if (r <= 0.2 || a <= 0.01) continue;
      ctx.globalCompositeOperation = q.p.add ? 'lighter' : 'source-over';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(q.tint, a));
      g.addColorStop(0.55, rgba(q.tint, a * 0.85));
      g.addColorStop(1, rgba(q.tint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ sound

  let audio = null;
  let muted = false;
  function synthesizeImpact(sampleRate, kind) {
    const duration = kind === 'flush' ? 0.7 : kind === 'bent' ? 0.42 : kind === 'skid' ? 0.2 : kind === 'dead' ? 0.26 : 0.22;
    const samples = new Float32Array(Math.ceil(sampleRate * duration));
    if (kind === 'skid' || kind === 'dead') {
      let seed = 1063, rasp = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        rasp = rasp * 0.86 + (seed / 4294967296 * 2 - 1) * 0.14;
        const voice = kind === 'skid'
          ? (rasp * 1.5 + Math.sin(2 * Math.PI * (980 * t - 520 * t * t)) * 0.16) * Math.exp(-t * 15)
          : (Math.sin(2 * Math.PI * 96 * t) * 0.5 + rasp * 0.5) * Math.exp(-t * 19);
        samples[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.0015) * voice));
      }
      return samples;
    }
    let seed = 731;
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 4294967296 * 2 - 1;
      const body = Math.sin(2 * Math.PI * (kind === 'flush' ? 104 : 145) * t) * Math.exp(-t * 35);
      const metal = Math.sin(2 * Math.PI * (kind === 'bent' ? 770 - 250 * t : 1860) * t) * Math.exp(-t * 65);
      const attack = noise * Math.exp(-t * 180);
      const ring = kind === 'flush'
        ? (Math.sin(2 * Math.PI * 1320 * t) + 0.5 * Math.sin(2 * Math.PI * 1980 * t)) * Math.exp(-t * 9) * 0.13
        : kind === 'bent' ? Math.sin(2 * Math.PI * (480 * t - 130 * t * t)) * Math.exp(-t * 13) * 0.2 : 0;
      samples[i] = Math.tanh(body * 0.65 + metal * 0.18 + attack * 0.33 + ring) * Math.min(1, t / 0.0008);
    }
    return samples;
  }
  function openAudio() {
    if (audio || muted) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const context = new AC();
      const master = context.createGain();
      master.gain.value = 0.8;
      master.connect(context.destination);
      const buffers = {};
      for (const kind of ['hit', 'flush', 'bent', 'skid', 'dead']) {
        const data = synthesizeImpact(context.sampleRate, kind);
        const buffer = context.createBuffer(1, data.length, context.sampleRate);
        buffer.getChannelData(0).set(data);
        buffers[kind] = buffer;
      }
      audio = { context, master, buffers };
    } catch {
      audio = null;
    }
    return audio;
  }
  /** How far behind `currentTime` the sample being heard is: base plus output latency. */
  const outputLag = () => (audio ? (audio.context.baseLatency || 0) + (audio.context.outputLatency || 0) : 0);
  /**
   * Sounds at a time on the page's clock, so it is *heard* then: written one output lag
   * early, the way the game schedules its demonstration on the grid. A voice already
   * late by more than a few frames is dropped rather than played off the beat.
   */
  function sound(kind, at, now) {
    if (!audio || muted) return;
    const { context, master, buffers } = audio;
    if (context.state === 'suspended') void context.resume();
    const when = context.currentTime + (at - now) - outputLag();
    if (when < context.currentTime - 0.04) return;
    const start = Math.max(context.currentTime, when);
    if (kind === 'count' || kind === 'ready' || kind === 'tick') {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = kind === 'ready' ? 660 : kind === 'count' ? 440 : 520;
      const peak = kind === 'tick' ? 0.035 : 0.1;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.065);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + 0.08);
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffers[kind];
    gain.gain.value = kind === 'hit' ? 0.65 : 0.8;
    source.connect(gain).connect(master);
    source.start(start);
  }

  // ------------------------------------------------------------------ the timeline

  /**
   * One task every three bars, back to back, as a level runs them: the demonstration, the
   * response on the very next downbeat, then the coda's contact, the hold and the table
   * slide (`TaskSequence.ending` with the hammer's one-beat hold). Only the first task of
   * a session has a lead-in bar.
   */
  function taskAt(origin, index) {
    const pattern = PATTERNS[index % PATTERNS.length];
    const demo = origin + 4 * BEAT + index * 12 * BEAT;
    const response = demo + 4 * BEAT;
    const end = response + 4 * BEAT;
    const targets = pattern.map(p => response + p * BEAT);
    const windows = windowsFor(targets);
    return {
      index, pattern, demo, response, end, targets, windows,
      cues: pattern.map(p => demo + p * BEAT),
      lead: index === 0 ? [0, 1, 2, 3].map(i => origin + i * BEAT) : [],
      contact: end + BEAT, slide: end + 2 * BEAT, swap: end + 3 * BEAT, next: end + 4 * BEAT,
      handoverAt: targets[0] - RHYTHM.runwayBeats * BEAT,
      outcomes: pattern.map(() => null), extras: 0, played: false, finished: false, flawlessAt: -Infinity,
    };
  }

  function windowsFor(targets) {
    let spacing = Infinity;
    for (let i = 1; i < targets.length; i++) spacing = Math.min(spacing, targets[i] - targets[i - 1]);
    const perfectMs = Number.isFinite(spacing) ? Math.min(RHYTHM.perfectMs, Math.floor(spacing * 1000 * 0.45)) : RHYTHM.perfectMs;
    return { perfectMs, goodMs: RHYTHM.goodMs, graceMs: RHYTHM.deliveryGraceMs };
  }
  /** `judgeTap`: the nearest target, resolved or not; outside Good, or already taken, is an extra. */
  function judgeTap(task, time) {
    let index = 0;
    for (let i = 1; i < task.targets.length; i++) {
      if (Math.abs(time - task.targets[i]) < Math.abs(time - task.targets[index]) - 1e-9) index = i;
    }
    const deltaMs = (time - task.targets[index]) * 1000;
    if (Math.abs(deltaMs) > task.windows.goodMs + 1e-6 || task.outcomes[index] !== null) {
      task.extras++;
      return { kind: 'extra', grade: 'Miss', index: null };
    }
    const result = { kind: 'hit', grade: Math.abs(deltaMs) <= task.windows.perfectMs + 1e-6 ? 'Perfect' : 'Good', index };
    task.outcomes[index] = result;
    return result;
  }
  function expireTargets(task, now) {
    const missed = [];
    task.targets.forEach((target, i) => {
      const next = task.targets[i + 1];
      const edge = Math.min(target + task.windows.goodMs / 1000, next === undefined ? Infinity : (target + next) / 2);
      if (task.outcomes[i] === null && now > edge + task.windows.graceMs / 1000) {
        task.outcomes[i] = { kind: 'omission', grade: 'Miss', index: i };
        missed.push(i);
      }
    });
    return missed;
  }
  function accuracy(task) {
    let perfect = 0, good = 0;
    for (const o of task.outcomes) {
      if (o?.kind !== 'hit') continue;
      if (o.grade === 'Perfect') perfect++;
      else good++;
    }
    return Math.max(0, perfect * 100 + good * RHYTHM.goodPoints - task.extras * RHYTHM.extraPenalty) / task.targets.length;
  }
  const markFor = o => (!o ? 'pending' : o.kind === 'omission' ? 'miss' : o.grade === 'Perfect' ? 'perfect' : o.grade === 'Good' ? 'good' : 'miss');

  function phaseOf(task, now) {
    if (now < task.demo) return 'prepare';
    if (now < task.response) return 'demonstrate';
    if (now < task.end) return 'respond';
    return 'result';
  }

  /** `handover`: the runway across the last two beats of the demonstration, then yours. */
  function handover(task, now) {
    const first = task.targets[0];
    return { runway: clamp01((now - task.handoverAt) / (first - task.handoverAt)), yours: clamp01((now - first) / (BEAT * 0.18)) };
  }
  const fuse = (turn, index) => Math.max(turn.yours, clamp01((turn.runway - index * 0.17) / 0.3));
  function turnCount(task, now) {
    const beats = RHYTHM.turnCountBeats;
    const first = task.targets[0];
    const from = Math.max(first - beats * BEAT, task.demo);
    if (now < from || now >= first + 0.75 * BEAT) return null;
    const remaining = Math.ceil((first - now) / BEAT - 1e-9);
    const count = now >= first ? 0 : Math.min(beats, Math.max(1, remaining));
    return { count, age: Math.max(0, now - (first - count * BEAT)), weight: (beats - count + 1) / (beats + 1) };
  }
  function turnCountPose(call, still) {
    const beats = RHYTHM.turnCountBeats;
    const go = call.count === 0;
    const heat = clamp01((beats - call.count) / beats);
    const leaving = go ? 1 - clamp01((call.age - BEAT * 0.75 * 0.45) / (BEAT * 0.75 * 0.55)) : 1;
    const presence = 0.55 + 0.45 * call.weight;
    if (still) return { scale: 1, rise: 0, alpha: presence * leaving, tilt: 0, heat, ring: { spread: 1, alpha: 0 } };
    const stamp = BEAT * 0.34;
    const p = clamp01(call.age / stamp);
    const from = go ? 1.9 : 1.45;
    const ringP = clamp01(call.age / (BEAT * 0.6));
    return {
      scale: 1 + (from - 1) * (1 - overshoot(p, 0.18)),
      rise: -26 * (1 - overshoot(p, 0.1)),
      alpha: presence * clamp01(call.age / (stamp * 0.3)) * leaving,
      tilt: go ? settle(call.age, 26, 7) * 0.09 : (call.count % 2 === 0 ? 1 : -1) * 0.085 * (1 - 0.35 * p),
      heat,
      ring: { spread: ringP, alpha: ringP > 0 && ringP < 1 ? (1 - ringP) ** 1.6 * (0.5 + 0.5 * call.weight) : 0 },
    };
  }
  function flawlessPose(age, still) {
    if (!Number.isFinite(age) || age < 0 || age >= 1.5) return null;
    const leaving = 1 - clamp01((age - 1.5 * 0.72) / (1.5 * 0.28));
    if (still) return { scale: 1, rise: 0, alpha: leaving, tilt: 0, glow: 0 };
    const p = clamp01(age / 0.32);
    return {
      scale: 1 + 0.9 * (1 - overshoot(p, 0.2)), rise: -30 * (1 - overshoot(p, 0.1)),
      alpha: clamp01(age / (0.32 * 0.3)) * leaving, tilt: settle(age, 24, 6) * 0.08,
      glow: Math.sin(Math.PI * clamp01(age / 1.5)) * leaving,
    };
  }
  function sweepBand(age) {
    if (!Number.isFinite(age) || age < 0 || age >= 0.55) return { at: 0, alpha: 0 };
    const p = age / 0.55;
    return { at: -0.2 + 1.4 * easeOut(p), alpha: Math.sin(Math.PI * p) * 0.55 };
  }
  function socketGlint(age, index, count) {
    if (Number.isNaN(age) || age < 0) return -1;
    const local = age - (stagger(index, count, 0.55 * 0.7) + 0.55 * 0.1);
    return local < 0 ? -1 : Math.min(1, local / 0.4);
  }
  function ghostRing(target, now) {
    const span = BEAT * 0.9;
    const closing = clamp01((now - (target - span)) / span);
    return { radius: 1 - easeInOutCubic(closing), alpha: clamp01(closing * 2.4) * (1 - clamp01((now - target) / 0.14)) };
  }

  // ------------------------------------------------------------------ the act

  /** `HammerNailVignette`'s state, reset at each task's swap exactly as `reset(plan)` does. */
  const act = {
    depth: 0, depthFrom: 0, depthTo: 0, depthAt: -100, strikeAt: -100, strength: 1, impactY: -203,
    finishAt: null, finishDone: false, successful: false, bend: 0, lastDemo: -Infinity,
  };
  function resetAct() {
    Object.assign(act, { depth: 0, depthFrom: 0, depthTo: 0, depthAt: -100, strikeAt: -100, strength: 1, finishAt: null, finishDone: false, successful: false, bend: 0, lastDemo: -Infinity });
  }
  function setDepth(value, now) {
    act.depthFrom = act.depth;
    act.depthTo = clamp01(value);
    act.depthAt = now;
  }
  function strike(at, strength, still) {
    act.strikeAt = at;
    act.strength = strength;
    act.impactY = -nailHeight(act.depth) - 10;
    if (!still) burst('dust', 'stage', 310, act.impactY + 6, [WORKSHOP.cream, WORKSHOP.sun, LOOK.wood], Math.round(8 * strength), at);
  }

  function drawHammer() {
    const w = STYLE.outline * 1.4;
    const red = faces(LOOK.handle), ink = faces(WORKSHOP.ink), head = faces(LOOK.head);
    fillRR(-256, -14, 275, 52, 16, WORKSHOP.ink, 0.08);
    strokeRR(-270, -25, 286, 48, 14, w, shade(WORKSHOP.red, -0.65));
    fillRR(-270, -25, 286, 48, 14, red.shade);
    fillRR(-270, -25, 286, 36, 14, red.face);
    fillRR(-248, -24, 220, 8, 4, red.lit);
    fillRR(-240, -22, 120, 3, 1.5, red.rim, 0.7);
    strokeRR(-45, -26, 68, 51, 13, w, ink.edge);
    fillRR(-45, -26, 68, 51, 13, ink.face);
    fillRR(-45, -26, 68, 14, 13, ink.lit);
    for (let x = -34; x < 11; x += 9) line(x, -15, x + 6, 14, 2, 0x698075, 0.42);
    const claw = [[-210, -52], [-158, -44], [-139, -3], [-167, -18], [-196, -23], [-209, -16]];
    strokeRR(-322, -63, 78, 101, 8, w, head.edge);
    ctx.beginPath(); ctx.rect(-247, -52, 42, 36); stroke(w, head.edge);
    poly(claw); stroke(w, head.edge);
    fillRR(-322, -63, 78, 101, 8, head.face);
    fillRect(-247, -52, 42, 36, head.face);
    poly(claw); fill(head.face);
    fillRR(-322, -63, 78, 16, 5, head.lit);
    fillRect(-316, -60, 66, 3, head.rim, 0.6);
    fillRect(-247, -52, 42, 7, head.lit, 0.7);
    fillRect(-322, -8, 78, 46, head.shade);
    fillRR(-327, 25, 88, 13, 4, head.edge);
    fillRR(-327, 33, 88, 5, 2, 0xa9b6a1);
    fillCircle(-275, -34, 4, WORKSHOP.paper);
  }

  function drawNail(now, phase) {
    const h = nailHeight(act.depth);
    const x = 310;
    const bentX = act.bend * 48;
    const since = now - (act.finishAt ?? now);
    const wobble = phase === 'result' && act.bend > 0 ? Math.sin(since * 19) * Math.exp(-since * 3) * 4 : 0;
    const ink = faces(LOOK.head);
    const w = STYLE.outline * 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 12, 5); ctx.lineTo(x + 12, 5); ctx.lineTo(x + Math.max(0, h) * 0.7, 34 + Math.max(0, h) * 0.14);
    ctx.closePath(); fill(WORKSHOP.ink, 0.075);
    fillEllipse(x + 7, 3, 72, 14, WORKSHOP.ink, 0.2);
    const tipX = x + bentX + wobble;
    if (h > 0) {
      const shaft = [[x, 0], [x, -h * 0.38], [tipX, -h]];
      path(shaft, 25 + w * 2, ink.edge);
      path(shaft, 25, ink.face);
      path([[x - 6, -4], [x - 6, -h * 0.4], [tipX - 6, -h]], 6, ink.rim, 0.8);
    }
    strokeRR(tipX - 38, -h - 10, 76, 15, 5, w, ink.edge);
    fillRR(tipX - 38, -h - 10, 76, 15, 5, ink.face);
    fillEllipse(tipX, -h - 10, 76, 13, ink.lit);
    line(x + bentX - 20, -h - 13, x + bentX + 11, -h - 13, 2, WORKSHOP.cream, 0.8);
    if (act.finishDone && act.successful) {
      const p = clamp01((now - act.finishAt) / 0.7);
      line(x + 42, -25 - p * 20, x + 42, -9 - p * 20, 2, WORKSHOP.cream, 1 - p);
      line(x + 34, -17 - p * 20, x + 50, -17 - p * 20, 2, WORKSHOP.cream, 1 - p);
    }
  }

  function drawDust(age) {
    if (age < 0 || age > 0.17) return;
    const w = 3 + STYLE.outline * 0.4;
    const ix = 310, iy = act.impactY;
    if (age < 0.08) {
      line(ix - 48, iy - 10, ix - 66, iy - 25, w, WORKSHOP.cream, 1 - age / 0.08);
      line(ix + 48, iy - 10, ix + 66, iy - 25, w, WORKSHOP.cream, 1 - age / 0.08);
    }
    const ring = age / 0.17;
    strokeEllipse(ix, iy + 4, 78 + ring * 65, 12 + ring * 15, 2, WORKSHOP.cream, (1 - ring) * 0.55);
  }

  /** `update(now)` and everything it poses, in the stage's own space. */
  function drawAct(now, task, phase, offset, still) {
    if (phase === 'prepare' || phase === 'demonstrate') {
      for (const cue of task.cues) if (cue <= now && cue > act.lastDemo) { act.lastDemo = cue; strike(cue, 0.8, still); }
    }
    act.depth = act.depthFrom + (act.depthTo - act.depthFrom) * easeOut((now - act.depthAt) / 0.085);
    if (act.finishAt !== null && now >= act.finishAt && !act.finishDone) {
      act.finishDone = true;
      strike(act.finishAt, act.successful ? 1.6 : 0.7, still);
      setDepth(act.successful ? 1 : Math.max(0.5, act.depth), act.finishAt);
    }
    const age = now - act.strikeAt;
    let angle = age < HAMMER.recoilSec ? recoil(age) : 0.55;
    const next = phase === 'demonstrate' || phase === 'prepare' ? task.cues.find(cue => cue > now) : undefined;
    const upcoming = act.finishAt !== null && !act.finishDone ? act.finishAt : next;
    if (upcoming !== undefined && upcoming - now < HAMMER.anticipationSec) angle = anticipation(upcoming - now, angle);
    if (act.finishDone && !act.successful) {
      const since = now - act.finishAt;
      act.bend = easeOut(since / 0.36);
      angle += Math.sin(since * 14) * Math.exp(-since * 3) * 0.1;
    }
    const sq = age >= 0 && age < 0.07 ? Math.sin(age / 0.07 * Math.PI) * 0.045 * act.strength * STYLE.exaggeration : 0;
    const shake = still || age < 0 || age > 0.2 ? 0 : Math.sin(age * 110) * Math.exp(-age * 20) * act.strength * 2.7 * STYLE.exaggeration;
    const pressure = age >= 0 && age < 0.18 ? Math.sin(age / 0.18 * Math.PI) * act.strength : 0;
    const transfer = phase === 'idle' ? 0 : easeOut((now - task.handoverAt) / 0.22);

    ctx.save();
    ctx.translate(STAGE_X + shake * ACT_SCALE + offset, BENCH_Y + shake * ACT_SCALE * 0.35);
    ctx.scale(ACT_SCALE, ACT_SCALE);
    const s = 1 + transfer * 0.09;
    glow(270 + transfer * 40, -285 + transfer * 28, 620 * s, WORKSHOP.sun, 0.5 + transfer * 0.22);

    const benchY = still ? 0 : pressure * 1.6;
    const wood = faces(LOOK.wood);
    ctx.save();
    ctx.translate(-2500, benchY);
    ctx.scale(1.5, 1.5);
    ctx.fillStyle = bench;
    ctx.fillRect(0, 0, 5700 / 1.5, 2500 / 1.5);
    ctx.restore();
    fillRect(-2500, benchY, 5700, 22, wood.lit);
    fillRect(-2500, benchY, 5700, 4, wood.rim, 0.55);
    fillRect(-2500, benchY + 22, 5700, 6, wood.shade, 0.7);
    fillRect(-2500, benchY - STYLE.outline * 0.7, 5700, STYLE.outline * 0.7, shade(LOOK.wood, -0.6));
    strokeEllipse(538, 124 + benchY, 58, 16, 2.5, LOOK.woodDark, 0.35);
    strokeEllipse(538, 124 + benchY, 26, 6, 2.5, LOOK.woodDark, 0.35);

    ctx.save();
    ctx.translate(340 - Math.sin(angle) * 25, 10);
    ctx.scale(1 + pressure * 0.25, 1 - pressure * 0.2);
    fillEllipse(0, 0, 142, 22, WORKSHOP.ink, 0.12 * (0.8 + pressure * 0.2));
    ctx.restore();

    drawNail(now, phase);

    ctx.save();
    ctx.translate(600 + (290 * Math.cos(angle) - 38 * Math.sin(angle)) * sq, -nailHeight(act.depth) - 48 + (290 * Math.sin(angle) + 38 * Math.cos(angle)) * sq);
    ctx.rotate(angle);
    ctx.scale(1 + sq, 1 - sq);
    drawHammer();
    ctx.restore();

    drawDust(age);
    drawParticles('stage', now);
    ctx.restore();
    return transfer;
  }

  // ------------------------------------------------------------------ the block

  function trackGeometry(count) {
    const width = Math.max(160, Math.min(620, W - 48) - (TRACK.shelfInset + TRACK.ownerInset + TRACK.ownerSlotRadius + TRACK.slotClearance) * 2);
    const gap = count > 1 ? Math.min(TRACK.beadGap, width / (count - 1)) : 0;
    const radius = count > 1 ? Math.min(TRACK.beadRadius, gap * 0.38) : TRACK.beadRadius;
    return { centres: Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * gap), radius };
  }
  function blockGeometry(centres, radius) {
    const slotRoom = TRACK.shelfInset + TRACK.ownerInset + TRACK.ownerSlotRadius + TRACK.slotClearance;
    const last = centres.at(-1) ?? 0;
    const beadSpan = last - (centres[0] ?? 0) + radius * 2;
    const width = Math.min(Math.max((last + radius + 34) * 2, 220, beadSpan + slotRoom * 2), W - 48);
    const face = { x: W / 2 - width / 2, y: TRACK_Y - TRACK.plateHeight / 2, width, height: TRACK.plateHeight };
    const shelfCentreY = TRACK_Y - (TRACK.plateHeight / 2 + TRACK.rowGap + TRACK.shelfHeight / 2);
    const shelf = { x: face.x + TRACK.shelfInset, y: shelfCentreY - TRACK.shelfHeight / 2, width: width - TRACK.shelfInset * 2, height: TRACK.shelfHeight };
    return {
      face, shelf, shelfCentreY, faceCentreY: TRACK_Y,
      faceSlot: { x: face.x + TRACK.ownerInset, y: TRACK_Y }, shelfSlot: { x: shelf.x + TRACK.ownerInset, y: shelfCentreY },
    };
  }

  function drawShelf(geo, state) {
    const alpha = 1 - 0.5 * state.turn.yours;
    const { shelf } = geo;
    const x = shelf.x + state.rattle;
    const lid = 4, lip = 2;
    const r = Math.min(TRACK.shelfRadius, shelf.height / 2);
    fillRR(x, shelf.y, shelf.width, shelf.height, r, 0x000000, 0.3 * alpha);
    const plankTop = shelf.y + lid;
    const plankHeight = shelf.height - lid - lip;
    fillRR(x, plankTop, shelf.width, plankHeight, Math.min(r, plankHeight / 2), mix(SHELL.wood, PALETTE.ink, 0.28), alpha);
    const inner = Math.min(r, plankHeight / 2);
    fillRect(x + inner, plankTop + plankHeight * 0.55, shelf.width - inner * 2, plankHeight * 0.45, mix(SHELL.wood, PALETTE.ink, 0.16), alpha);
    fillRect(x + inner, shelf.y + shelf.height - lip, shelf.width - inner * 2, lip, SHELL.cream, 0.14 * alpha);
    for (let i = 0; i < state.centres.length; i++) {
      const bx = geo.face.x + geo.face.width / 2 + state.centres[i] + state.rattle;
      if (i < state.played) {
        fillCircle(bx, geo.shelfCentreY + 2, TRACK.shelfBeadRadius, 0x000000, 0.22 * alpha);
        fillCircle(bx, geo.shelfCentreY, TRACK.shelfBeadRadius, SHELL.cream, alpha);
      } else {
        fillCircle(bx, geo.shelfCentreY, TRACK.shelfBeadRadius, 0x000000, 0.3 * alpha);
        fillCircle(bx, geo.shelfCentreY + 2, TRACK.shelfBeadRadius * 0.9, 0x000000, 0.26 * alpha);
      }
    }
  }

  function drawFace(geo, state, heat, lift) {
    const rest = mix(PALETTE.paper, SHELL.wood, 0.16);
    const hot = mix(PALETTE.paper, PALETTE.coral, 0.54);
    const fillColour = mix(rest, hot, easeOut(heat));
    const plate = { x: geo.face.x + state.rattle, y: geo.face.y - lift, width: geo.face.width, height: geo.face.height };
    drawPanel(plate.x, plate.y, plate.width, plate.height, { fill: fillColour, depth: TRACK.plateDepth + lift, radius: TRACK.plateRadius });
    if (state.turn.yours > 0.01) {
      strokeRR(plate.x + 7, plate.y + 7, plate.width - 14, plate.height - 14, TRACK.plateRadius - 7, 2, PALETTE.coral, state.turn.yours * 0.72);
    }
    const y = geo.faceCentreY - lift;
    const centreX = geo.face.x + geo.face.width / 2;
    for (let i = 0; i < state.centres.length; i++) {
      const alpha = state.still ? (state.turn.yours > 0 ? 1 : state.turn.runway > 0 ? 0.5 : 0) * (1 - 0.7 * state.turn.yours) * 0.42 : fuse(state.turn, i) * (1 - 0.7 * state.turn.yours) * 0.42;
      if (alpha <= 0.01) continue;
      const x = centreX + state.centres[i] + state.rattle;
      line(x, geo.shelfCentreY + TRACK.shelfBeadRadius + 3, x, y - state.socketRadius - 2, 2.4, SOCKET_RING, alpha);
    }
    for (let i = 0; i < state.centres.length; i++) {
      const x = centreX + state.centres[i] + state.rattle;
      const mark = state.marks[i];
      const lit = state.still ? (state.turn.yours > 0 ? 1 : state.turn.runway > 0 ? 0.5 : 0) : fuse(state.turn, i);
      const struck = mark === 'perfect' || mark === 'good';
      const swell = i === state.struck.index ? state.struck.amount : struck || state.still ? 0 : Math.sin(Math.PI * clamp01(lit)) * 0.14;
      const r = state.socketRadius * (1 + swell);
      if (struck) {
        const disc = mark === 'good' ? r * 0.62 : r;
        fillCircle(x, y + 2, disc, PALETTE.ink, 0.35);
        fillCircle(x, y, disc, SHELL.cream);
        strokeCircle(x, y, r, 4.6, SOCKET_RING);
      } else {
        fillCircle(x, y, r, shade(PALETTE.ink, -0.1), 0.3);
        fillCircle(x, y + 2, r * 0.92, mix(fillColour, RECESS, 0.26));
        const ring = mark === 'miss' ? PALETTE.muted : mix(mix(PALETTE.ink, fillColour, 0.5), SOCKET_RING, lit);
        strokeCircle(x, y, r, 3 + 1.6 * lit, ring);
        if (mark === 'miss') line(x - r * 1.2, y, x + r * 1.2, y, 4, shade(WORKSHOP.ink, -0.1));
      }
    }
    // The flawless sweep and glints, on the row the task was earned on.
    const age = state.flawless;
    if (Number.isFinite(age) && age >= 0) {
      const band = state.still ? { at: 0, alpha: 0 } : sweepBand(age);
      if (band.alpha > 0.01) {
        const half = plate.width * 0.09;
        const centre = plate.x + plate.width * band.at;
        const left = Math.max(plate.x, centre - half), right = Math.min(plate.x + plate.width, centre + half);
        if (right > left) fillRect(left, plate.y + 4, right - left, plate.height - 8, SHELL.cream, band.alpha);
      }
      for (let i = 0; i < state.centres.length; i++) {
        const glint = state.still ? Math.min(1, age / 0.4) : socketGlint(age, i, state.centres.length);
        if (glint < 0 || glint >= 1) continue;
        const x = centreX + state.centres[i] + state.rattle;
        const fade = (1 - glint) ** 1.4;
        strokeCircle(x, y, state.socketRadius * (1.05 + 1.6 * glint), 5 - 3 * glint, 0xffe7a0, fade * 0.85);
        fillCircle(x, y, state.socketRadius * 0.9, SHELL.cream, fade * 0.45);
      }
    }
    const ghost = state.ghost;
    if (ghost && ghost.alpha > 0.01) {
      const gx = centreX + (state.centres[ghost.index] ?? 0) + state.rattle;
      const radius = 26 + 30 * ghost.radius;
      strokeCircle(gx, y, radius, 12, SHELL.cream, ghost.alpha * 0.28);
      strokeCircle(gx, y, radius, 4, SHELL.cream, ghost.alpha);
    }
    return fillColour;
  }

  function drawOwnerSlots(geo, turn, face, lift, rattle) {
    const r = TRACK.ownerSlotRadius;
    const glyph = r * 0.62;
    const shelfAlpha = 1 - 0.5 * turn.yours;
    const sx = geo.shelfSlot.x + rattle;
    fillCircle(sx, geo.shelfSlot.y, r, 0x000000, 0.3 * shelfAlpha);
    fillCircle(sx, geo.shelfSlot.y + 3, r * 0.92, 0x000000, 0.2 * shelfAlpha);
    drawHammerMark(sx, geo.shelfSlot.y, glyph, SHELL.cream, (1 - 0.58 * turn.yours) * shelfAlpha);
    const fx = geo.faceSlot.x + rattle, fy = geo.faceSlot.y - lift;
    fillCircle(fx, fy, r, shade(PALETTE.ink, -0.1), 0.26);
    fillCircle(fx, fy + 3, r * 0.92, mix(face, RECESS, 0.2));
    if (turn.yours < 0.99) drawTapMark(fx, fy, glyph, PALETTE.ink, 0.62 * (1 - turn.yours));
    if (turn.yours > 0.01) drawTapMark(fx, fy, glyph, SHELL.cream, turn.yours);
  }

  function batonAt(geo, t, lift, still) {
    const arc = still ? 0 : Math.sin(Math.PI * t);
    return {
      x: geo.shelfSlot.x + (geo.faceSlot.x - geo.shelfSlot.x) * t + TRACK.batonBow * arc,
      y: geo.shelfCentreY + (geo.faceCentreY - geo.shelfCentreY) * t - lift * t,
      arc,
    };
  }
  function drawBaton(geo, turn, still, lift, rattle, landed) {
    const t = still ? (turn.runway > 0 ? 1 : 0) : easeInOutCubic(turn.runway);
    const at = batonAt(geo, t, lift, still);
    const x = at.x + rattle, y = at.y;
    const r = TRACK.batonRadius * (1 + 0.16 * at.arc);
    if (!still && t > 0 && t < 1) {
      const speed = Math.sin(Math.PI * t);
      for (let k = 1; k <= 4; k++) {
        const behind = t - k * 0.06;
        if (behind <= 0) break;
        const alpha = speed * (0.34 - 0.07 * k);
        const past = batonAt(geo, behind, lift, still);
        fillCircle(past.x + rattle, past.y, TRACK.batonRadius * (1 + 0.16 * past.arc) * (0.72 + 0.2 * alpha), PALETTE.coral, alpha);
      }
    }
    const landing = !still && Number.isFinite(landed) && landed >= 0 && landed < 0.46;
    if (landing) {
      const p = landed / 0.46;
      const spread = easeOut(p), alpha = (1 - p) ** 1.5 * 0.7;
      const reach = r * (1 + 3.2 * spread);
      strokeCircle(x, y, reach, 6 - 4 * spread, PALETTE.coral, alpha);
      strokeCircle(x, y, reach * 0.82, 2, SHELL.cream, alpha * 0.6);
    }
    const glowR = 10 + 30 * at.arc;
    for (let i = 3; i >= 1; i--) fillCircle(x, y, r + glowR * (i / 3), PALETTE.coral, 0.5 * (i === 3 ? 0.18 : i === 2 ? 0.26 : 0.34));
    const sq = still ? 0 : squash(landed, 0.46 * 0.7, 0.22);
    const w = r * 2 * (1 + sq), h = r * 2 * (1 - sq);
    fillEllipse(x, y + 3, w, h, mix(PALETTE.coral, PALETTE.ink, 0.45));
    fillEllipse(x, y, w, h, PALETTE.coral);
    fillEllipse(x - r * 0.22, y - r * 0.3, w * 0.36, h * 0.22, SHELL.cream, 0.28);
    const glyph = r * 0.5 * (still ? 1 : 0.25 + 0.75 * Math.abs(Math.cos(Math.PI * clamp01(t))));
    if (t < 0.5) drawHammerMark(x, y, glyph, SHELL.cream);
    else drawTapMark(x, y, glyph, SHELL.cream);
  }

  // ------------------------------------------------------------------ the page's state

  const hud = {
    title: document.querySelector('[data-hint-title]'),
    copy: document.querySelector('[data-hint]'),
    counts: {
      perfect: document.querySelector('[data-count="perfect"]'),
      good: document.querySelector('[data-count="good"]'),
      miss: document.querySelector('[data-count="miss"]'),
    },
  };
  const soundButton = document.querySelector('[data-sound]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const score = { perfect: 0, good: 0, miss: 0 };

  let origin = 0;
  let index = 0;
  let task = null;
  let running = false;
  let engaged = false;
  let frame = 0;
  let scheduled = new Set();
  let verdict = { word: '', colour: PALETTE.ink, at: -Infinity };
  let struck = { index: -1, at: -Infinity };
  let extraAt = -Infinity;
  let earlyAt = -Infinity;
  let heldHit = null;
  let goStruck = -1;
  let lastCopy = '';

  const clock = () => performance.now() / 1000;

  function begin(now) {
    origin = now + 0.35;
    index = 0;
    task = taskAt(origin, 0);
    resetAct();
    particles.length = 0;
    scheduled = new Set();
    verdict = { word: '', colour: PALETTE.ink, at: -Infinity };
    struck = { index: -1, at: -Infinity };
    heldHit = null;
    goStruck = -1;
  }

  function say(result, now, still) {
    verdict = { word: result.grade, colour: result.grade === 'Perfect' ? PALETTE.coral : result.grade === 'Good' ? WORKSHOP.ink : PALETTE.muted, at: now };
    if (result.kind === 'hit' && result.grade === 'Perfect' && !still) {
      const { centres } = trackGeometry(task.targets.length);
      burst('sparks', 'ui', W / 2 + centres[result.index], TRACK_Y, [PALETTE.coral, SHELL.cream], 8, now);
    }
  }
  function tally(kind) {
    score[kind]++;
    const el = hud.counts[kind];
    if (el) el.textContent = String(score[kind]);
  }

  /** The task's marks enter the tally only once the visitor has played it. */
  function commit(result) {
    if (result.kind === 'hit') tally(result.grade === 'Perfect' ? 'perfect' : 'good');
    else tally('miss');
  }

  function tap(time) {
    const now = clock();
    engaged = true;
    openAudio();
    if (!running) return;
    const t = task;
    const still = reduce.matches;
    // As the controller: only the response, with a Good window's grace at either end.
    if (time < t.response - t.windows.goodMs / 1000 || time > t.end + t.windows.goodMs / 1000) {
      if (time < t.response) earlyAt = now;
      return;
    }
    if (!t.played) {
      t.played = true;
      // Beats that went by before the first tap are this task's misses too.
      t.outcomes.forEach(o => { if (o?.kind === 'omission') tally('miss'); });
    }
    const result = judgeTap(t, time);
    commit(result);
    if (time >= t.response) playerHit(result, now, still);
    else heldHit = result;
    say(result, now, still);
    return { task: t, result };
  }
  /**
   * A touch that turns into a scroll was never a tap. The judgement is made on the press,
   * where the timing is, and taken back if the browser claims the touch for panning.
   */
  function untap({ task: t, result }) {
    if (t !== task) return;
    if (heldHit === result) heldHit = null;
    if (result.kind === 'hit') {
      t.outcomes[result.index] = null;
      untally(result.grade === 'Perfect' ? 'perfect' : 'good');
      if (struck.index === result.index) struck = { index: -1, at: -Infinity };
      setDepth(act.depthTo - 0.75 / t.targets.length, clock());
    } else {
      t.extras = Math.max(0, t.extras - 1);
      untally('miss');
    }
    verdict.at = -Infinity;
  }
  function untally(kind) {
    score[kind] = Math.max(0, score[kind] - 1);
    const el = hud.counts[kind];
    if (el) el.textContent = String(score[kind]);
  }
  function playerHit(result, now, still) {
    strike(now, 1, still);
    sound('hit', now, now);
    if (result.kind === 'hit') {
      setDepth(act.depthTo + 0.75 / task.targets.length, now);
      struck = { index: result.index, at: now };
    } else {
      act.strength = 0.4;
      extraAt = now;
      sound('skid', now, now);
    }
  }

  function schedule(now) {
    if (!audio || muted) return;
    const horizon = now + 0.35;
    const want = (key, kind, at) => {
      if (at < now - 0.02 || at > horizon || scheduled.has(key)) return;
      scheduled.add(key);
      sound(kind, at, now);
    };
    for (const k of [index, index + 1]) {
      const t = k === index ? task : taskAt(origin, k);
      t.lead.forEach((at, i) => want(`${k}:lead:${i}`, i === 3 ? 'ready' : 'count', at));
      t.cues.forEach((at, i) => want(`${k}:cue:${i}`, 'hit', at));
      for (let b = 0; b < 8; b++) want(`${k}:tick:${b}`, 'tick', t.demo + b * BEAT);
    }
  }

  function words(now, phase) {
    const t = task;
    let title = '', copy = '';
    if (phase === 'prepare' && t.lead.length) { title = 'Listen'; copy = 'Four counts, then the hammer plays.'; }
    else if (phase === 'prepare') { title = 'Their turn'; copy = 'A fresh nail. The hammer plays first.'; }
    else if (phase === 'demonstrate' && now < t.handoverAt) {
      title = now - earlyAt < 0.8 ? 'Too early' : 'Their turn';
      copy = now - earlyAt < 0.8 ? 'Wait for the token to reach your row.' : 'The hammer plays. Each beat lights a bead on the top row.';
    } else if (phase === 'demonstrate') { title = 'Get ready'; copy = 'The token is crossing. Your turn starts on the next beat.'; }
    else if (phase === 'respond') { title = 'Your turn'; copy = engaged ? 'Tap anywhere on the stage. Match the spacing you heard.' : 'Tap anywhere on the stage, on the beats you heard.'; }
    else if (t.played) {
      const good = accuracy(t) >= 70;
      title = good ? COPY.success : COPY.rough;
      copy = `${Math.round(accuracy(t))}% on the beat. The next one is already on its way.`;
    } else { title = 'Next task'; copy = 'Tap anywhere when the token lands on your row.'; }
    const key = `${title}|${copy}`;
    if (key !== lastCopy) {
      lastCopy = key;
      if (hud.title) hud.title.textContent = title;
      if (hud.copy) hud.copy.textContent = copy;
    }
  }

  // ------------------------------------------------------------------ frame

  function resize() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.width * H / W * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw() {
    frame = 0;
    if (!running) return;
    const now = clock();
    const still = reduce.matches;

    // The task in hand is the old one until its swap; the new one slides in from there.
    if (now >= task.swap) {
      index++;
      task = taskAt(origin, index);
      resetAct();
      struck = { index: -1, at: -Infinity };
      verdict.at = -Infinity;
      heldHit = null;
      scheduled.forEach(key => { if (Number(key.split(':')[0]) < index) scheduled.delete(key); });
    }
    const t = task;
    const phase = phaseOf(t, now);
    if (heldHit && now >= t.response) { playerHit(heldHit, now, still); heldHit = null; }
    for (const i of expireTargets(t, now)) {
      if (!t.played) continue;
      tally('miss');
      say({ kind: 'omission', grade: 'Miss', index: i }, now, still);
      sound('dead', now, now);
    }
    if (!t.finished && now >= t.end) {
      t.finished = true;
      if (t.played) {
        const good = accuracy(t) >= 70;
        act.successful = good;
        act.finishAt = t.contact;
        scheduled.add(`${index}:finish`);
        if (audio && !muted) sound(good ? 'flush' : 'bent', t.contact, now);
        if (t.outcomes.every(o => o?.kind === 'hit' && o.grade === 'Perfect')) t.flawlessAt = now;
      }
    }
    schedule(now);
    words(now, phase);

    ctx.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    // The backdrop: the paper, and the pool of light that opens toward the player.
    fillRect(0, 0, W, H, WORKSHOP.paper);
    const turn = handover(t, now);
    const open = phase === 'idle' ? 0 : easeOut((now - t.handoverAt) / 0.22);
    const pool = Math.max(W, H) * 1.25 * (1 + 0.14 * open);
    glow(W * 0.38 + (W * 0.5 - W * 0.38) * 0.45 * open, H * 0.34 + H * 0.13 * open, pool, mix(WORKSHOP.paper, WORKSHOP.sun, 0.7 + 0.28 * open), Math.min(1, 0.85 + 0.15 * open));

    // The table slide between tasks: out to the left over a beat, in from the right over the next.
    let offset = 0;
    if (!still) {
      const prev = index > 0 ? taskAt(origin, index - 1) : null;
      if (now >= t.slide && now < t.swap) offset = -W * clamp01((now - t.slide) / (t.swap - t.slide)) ** 3;
      else if (prev && now < t.demo) offset = W * (1 - easeOut((now - prev.swap) / (prev.next - prev.swap)));
    }
    drawAct(now, t, phase, offset, still);
    ctx.fillStyle = fibre;
    ctx.globalAlpha = 0.32 * 0.55;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // The workshop steps back as the turn arrives.
    fillRect(0, 0, W, H, PALETTE.ink, turn.yours * 0.17);

    const { centres, radius } = trackGeometry(t.targets.length);
    const geo = blockGeometry(centres, radius);
    const marks = t.played ? t.outcomes.map(markFor) : t.outcomes.map(o => (o?.kind === 'hit' ? markFor(o) : 'pending'));
    let ghost = null;
    if (turn.yours > 0.2) {
      const i = marks.findIndex((mark, k) => mark === 'pending' && t.targets[k] >= now - 0.14);
      if (i >= 0) { const g = ghostRing(t.targets[i], now); ghost = { index: i, ...g }; }
    }
    const heat = still ? (turn.yours > 0 ? 1 : turn.runway > 0 ? 0.44 : 0) : Math.max(turn.yours, turn.runway * 0.44);
    const lift = still ? 0 : Math.max(turn.yours, easeInOutCubic(turn.runway) * 0.5) * TRACK.faceLift;
    const state = {
      centres, socketRadius: radius, played: t.cues.filter(cue => cue <= now).length, marks, turn,
      struck: { index: struck.index, amount: still ? 0 : squash(now - struck.at, 0.22, 0.45) },
      rattle: still ? 0 : settle(now - extraAt, 90, 18) * 3, still, ghost, flawless: now - t.flawlessAt,
    };
    drawShelf(geo, state);
    const face = drawFace(geo, state, heat, lift);
    drawOwnerSlots(geo, turn, face, lift, state.rattle);
    drawBaton(geo, turn, still, lift, state.rattle, now - t.targets[0]);

    // The count-in's pips, over the shelf, in the lead-in bar.
    if (t.lead.length && now < t.demo && now >= t.lead[0] - BEAT) {
      const pips = t.lead.filter(at => at <= now).length;
      for (let i = 0; i < 4; i++) {
        const x = W / 2 + (i - 1.5) * TRACK.pipGap;
        if (i < pips) fillCircle(x, geo.shelf.y - 22, TRACK.pipRadius, WORKSHOP.ink, 0.9);
        else strokeCircle(x, geo.shelf.y - 22, TRACK.pipRadius, 2.5, WORKSHOP.ink, 0.35);
      }
    }

    // The verdict, over the shelf: one word, replaced rather than stacked.
    const verdictY = TRACK_Y - (TRACK.plateHeight / 2 + TRACK.rowGap + TRACK.shelfHeight + 34);
    const said = now - verdict.at;
    const flaw = flawlessPose(now - t.flawlessAt, still);
    if (!flaw && said >= 0 && said < 0.55) {
      const { rise, alpha } = still ? { rise: 0, alpha: 1 } : arrive(said, 0.45);
      dressedText(verdict.word, W / 2, verdictY - (1 - rise) * 18, 38, verdict.colour, { alpha: alpha * (1 - Math.max(0, (said - 0.35) / 0.2)) });
    }
    if (flaw) {
      if (flaw.glow > 0.01) for (let i = 3; i >= 1; i--) fillEllipse(W / 2, verdictY + flaw.rise, 230 * flaw.scale * (0.7 + 0.25 * i), 60 * (0.8 + 0.3 * i), 0xffe7a0, flaw.glow * 0.09 * i);
      dressedText('Flawless!', W / 2, verdictY + flaw.rise, 54, PALETTE.coral, flaw);
    }

    // The count into the player's turn, under their row.
    const call = turnCount(t, now);
    if (call) {
      const pose = turnCountPose(call, still);
      const callY = TRACK_Y + TRACK.plateHeight / 2 + TRACK.plateDepth + 44;
      const colour = mix(WORKSHOP.ink, PALETTE.coral, pose.heat);
      if (pose.ring.alpha > 0.01) strokeCircle(W / 2, callY, 30 + 70 * pose.ring.spread, 5 - 3.5 * pose.ring.spread, colour, pose.ring.alpha);
      dressedText(call.count === 0 ? 'Go!' : String(call.count), W / 2, callY + pose.rise, 36 + 18 * call.weight, colour, pose);
      if (call.count === 0 && goStruck !== index) {
        goStruck = index;
        if (!still) burst('sparks', 'ui', W / 2, callY, [PALETTE.coral, SHELL.cream], 12, now);
      }
    }
    drawParticles('ui', now);
    frame = requestAnimationFrame(draw);
  }

  // ------------------------------------------------------------------ wiring

  function start() {
    if (running) return;
    resize();
    bench = bench ?? woodTile(LOOK.wood);
    fibre = fibre ?? paperTile();
    running = true;
    begin(clock());
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (audio?.context.state === 'running') void audio.context.suspend();
  }

  const eventTime = event => {
    const now = performance.now();
    const stamp = event.timeStamp;
    return (Number.isFinite(stamp) && stamp > 0 && stamp <= now + 1 && now - stamp < 80 ? stamp : now) / 1000;
  };
  let press = null;
  host.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const receipt = tap(eventTime(event));
    press = receipt ? { id: event.pointerId, receipt, at: clock() } : null;
  });
  host.addEventListener('pointercancel', event => {
    if (press && press.id === event.pointerId && clock() - press.at < 0.6) untap(press.receipt);
    press = null;
  });
  host.addEventListener('pointerup', () => { press = null; });
  host.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) tap(eventTime(event));
  });
  soundButton?.addEventListener('click', () => {
    muted = !muted;
    const word = soundButton.querySelector('.sound-word');
    if (word) word.textContent = muted ? 'Sound off' : 'Sound on';
    soundButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (muted && audio?.context.state === 'running') void audio.context.suspend();
    if (!muted) { openAudio(); if (running && audio?.context.state === 'suspended') void audio.context.resume(); }
  });

  /**
   * One frame of the stage at rest, so it is never an empty box: before it scrolls in, and
   * after a resize has cleared the canvas while it was off screen.
   */
  function paintStill() {
    resize();
    bench = bench ?? woodTile(LOOK.wood);
    fibre = fibre ?? paperTile();
    const idle = task;
    task = taskAt(clock() + 10, 0);
    running = true;
    draw();
    cancelAnimationFrame(frame);
    frame = 0;
    running = false;
    task = idle ?? task;
  }

  let visible = false;
  window.addEventListener('resize', () => { if (running) resize(); else paintStill(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (visible) start();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      }
    }, { threshold: 0.2 }).observe(host);
  } else {
    visible = true;
    start();
  }
  paintStill();
})();
