(() => {
  /*
   * The reveal styles only apply under html.js, so a blocked or failed script leaves
   * every section visible rather than blank.
   */
  document.documentElement.classList.add('js');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => reduce.matches;

  /*
   * The motion is the game's, not a stylesheet's: the curves below are `ui/spring.ts` and
   * `vignettes/motion.ts`, and every pose is a function of time rather than an eased
   * transition, the way the game samples its own from the clock.
   */
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOut = v => 1 - (1 - clamp01(v)) ** 3;
  const backFactors = new Map();
  function backFactor(amount) {
    if (amount <= 0) return 0;
    if (backFactors.has(amount)) return backFactors.get(amount);
    let s = 10 * (1 + amount);
    for (let i = 0; i < 12; i++) s -= (4 * s ** 3 - 27 * amount * (s + 1) ** 2) / (12 * s ** 2 - 54 * amount * (s + 1));
    backFactors.set(amount, s);
    return s;
  }
  const overshoot = (t, amount = 0.25) => { const p = clamp01(t), s = backFactor(amount); return 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2; };
  const settle = (age, frequency, decay) => (!Number.isFinite(age) || age < 0 ? 0 : Math.sin(age * frequency) * Math.exp(-age * decay));
  const spring = (t, damping = 4.5, cycles = 2.2) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-damping * t) * Math.cos(cycles * Math.PI * t));
  const squash = (age, duration, amount) => (age < 0 || age >= duration ? 0 : Math.sin(age / duration * Math.PI) * amount);
  const stagger = (index, count, spread) => (count <= 1 ? 0 : spread * Math.max(0, Math.min(count - 1, index)) / (count - 1));
  const arrive = (age, duration) => { const p = clamp01(age / duration); return { rise: 1 - overshoot(p, 0.12), alpha: easeOut(Math.min(1, p * 1.6)) }; };
  const EXAGGERATION = 1.35;
  const now = () => performance.now() / 1000;

  // ------------------------------------------------------------ the title sign

  /*
   * `MenuScene.update`: the sign drops in on its ropes and swings itself quiet, and at rest
   * drifts a little. Four beads under the title light one at a time on the game's own
   * 120 BPM, the lit one swelling on its beat.
   */
  const sign = document.querySelector('[data-sign]');
  const beads = [...document.querySelectorAll('[data-beads] .bead')];
  const enteredAt = now();
  function drawSign(t) {
    if (!sign) return;
    const age = t - enteredAt;
    if (still()) {
      sign.style.transform = '';
      sign.style.opacity = '';
      beads.forEach((bead, i) => { bead.classList.toggle('lit', i === 0); bead.style.transform = ''; });
      return;
    }
    const entry = arrive(age - 0.1, 0.9);
    const swing = settle(age - 0.3, 5.2, 1.6) * 0.06 * EXAGGERATION + Math.sin(t * 0.7) * 0.012 * EXAGGERATION;
    sign.style.transform = `translateY(${(-entry.rise * 160).toFixed(2)}px) rotate(${swing.toFixed(4)}rad)`;
    sign.style.opacity = entry.alpha.toFixed(3);
    const beat = Math.floor(t * 2) % 4;
    const phase = (t * 2) % 1;
    beads.forEach((bead, i) => {
      const lit = i === beat;
      bead.classList.toggle('lit', lit);
      bead.style.transform = lit ? `scale(${(1 + (1 - phase) ** 2 * 0.7 * EXAGGERATION).toFixed(3)})` : '';
    });
  }

  // ------------------------------------------------------------ the result plaque

  /*
   * `starReveal.ts`: the plaque swings down on its ropes and settles, and each medal drops
   * into its seat, squashes, and knocks the plaque as it lands. It plays once, the first
   * time the plaque comes into view, and is simply there under reduced motion.
   */
  const plaque = document.querySelector('[data-plaque]');
  const medals = [...document.querySelectorAll('[data-plaque] .star')];
  let plaqueAt = null;
  const STAR = { delay: 0.14, spread: 0.5, impact: 0.2, drop: 1.65, spin: 0.48 };
  function starPose(age) {
    if (age <= 0) return null;
    const fall = clamp01(age / 0.26);
    const drop = (1 - easeOut(fall)) * -STAR.drop + settle(age - STAR.impact, 26, 11) * 0.12;
    const amount = squash(age - STAR.impact, 0.16, 0.16 * EXAGGERATION);
    const size = overshoot(clamp01(age / 0.42), 0.16 * EXAGGERATION);
    return {
      alpha: easeOut(clamp01(age / 0.07)), drop,
      scaleX: size * (1 + amount), scaleY: size * (1 - amount * 0.82),
      spin: (1 - spring(clamp01(age / 0.5), 5.2, 1.7)) * -STAR.spin,
    };
  }
  const starAge = (age, k) => age - STAR.delay - stagger(k, 3, STAR.spread);
  function drawPlaque(t) {
    if (!plaque || plaqueAt === null) return;
    const age = t - plaqueAt;
    if (age > 4) {
      // Settled: hand the plaque and its medals back to the stylesheet and stop.
      plaqueAt = null;
      plaque.style.transform = plaque.style.opacity = '';
      medals.forEach(medal => { medal.style.transform = medal.style.opacity = ''; });
      return;
    }
    const fall = clamp01(age / 0.7);
    let drop = (1 - overshoot(fall, 0.1)) * -0.42;
    const tilt = -0.055 * (1 - fall) + settle(age - 0.7 * 0.55, 9.5, 3.4) * 0.055 * 0.8;
    for (let k = 0; k < 3; k++) {
      const since = starAge(age, k) - STAR.impact;
      if (since >= 0) drop += Math.max(0, settle(since, 22, 9)) * 0.05 * EXAGGERATION;
    }
    plaque.style.transform = `translateY(${(drop * plaque.offsetHeight).toFixed(2)}px) rotate(${tilt.toFixed(4)}rad)`;
    plaque.style.opacity = easeOut(clamp01(age / (0.7 * 0.35))).toFixed(3);
    medals.forEach((medal, k) => {
      const pose = starPose(starAge(age, k));
      const radius = medal.offsetWidth / 2;
      medal.style.opacity = pose ? pose.alpha.toFixed(3) : '0';
      medal.style.transform = pose
        ? `translateY(${(pose.drop * radius).toFixed(2)}px) rotate(${pose.spin.toFixed(4)}rad) scale(${pose.scaleX.toFixed(3)}, ${pose.scaleY.toFixed(3)})`
        : 'scale(0)';
    });
  }
  if (plaque && 'IntersectionObserver' in window && !still()) {
    plaque.classList.add('is-waiting');
    new IntersectionObserver((entries, self) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        plaqueAt = now();
        // Posed before it is shown, so the settled plaque never flashes for a frame.
        drawPlaque(plaqueAt);
        plaque.classList.remove('is-waiting');
        self.disconnect();
      }
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0.2 }).observe(plaque);
  }

  // ------------------------------------------------------------ one frame loop

  function frame() {
    const t = now();
    drawSign(t);
    drawPlaque(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------ recorded clips

  /*
   * The handset and the act tiles are clips recorded from the game (scripts/capture-acts.mjs).
   * They play only while on screen, and not at all under reduced motion, which shows each
   * one's poster: the act mid-action, still.
   */
  const clips = [...document.querySelectorAll('video[data-loop]')];
  const onScreen = new Set();
  function play(video) {
    if (still() || document.hidden) return;
    video.muted = true;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  }
  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = entry.target;
        if (entry.isIntersecting) { onScreen.add(video); play(video); }
        else { onScreen.delete(video); video.pause(); }
      }
    }, { threshold: 0.35 });
    clips.forEach(video => watcher.observe(video));
  }
  document.addEventListener('visibilitychange', () => {
    for (const video of onScreen) {
      if (document.hidden) video.pause();
      else play(video);
    }
  });
  reduce.addEventListener?.('change', () => {
    for (const video of clips) {
      if (still()) { video.pause(); video.currentTime = 0; } else if (onScreen.has(video)) play(video);
    }
  });

  // ------------------------------------------------------------ page furniture

  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    header?.classList.toggle('is-stuck', window.scrollY > 8);
  }, { passive: true });

  const revealables = [...document.querySelectorAll('.reveal')];
  if (still() || !('IntersectionObserver' in window)) {
    for (const el of revealables) el.classList.add('in');
  } else {
    const revealer = new IntersectionObserver((entries, self) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const group = [...(entry.target.parentElement?.children ?? [])];
        entry.target.style.setProperty('--stagger', `${Math.min(group.indexOf(entry.target) % 4, 3) * 70}ms`);
        entry.target.classList.add('in');
        self.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    for (const el of revealables) revealer.observe(el);
  }

  if (!still()) {
    const root = document.documentElement;
    const pulse = () => {
      root.dataset.beat = String(Math.floor((performance.now() / 500) % 4));
      requestAnimationFrame(pulse);
    };
    requestAnimationFrame(pulse);
  }
})();
