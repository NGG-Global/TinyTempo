(() => {
  const BPM = 120;
  const BEAT = 60 / BPM;
  const BAR = 4 * BEAT;
  const PATTERN = [0, 1, 3];
  const PERFECT = 0.055;
  const GOOD = 0.13;

  const stage = document.querySelector('[data-stage]');
  const hint = document.querySelector('[data-hint]');
  const gradeEl = document.querySelector('[data-grade]');
  const baton = document.querySelector('[data-baton]');
  const socketsWatch = [...document.querySelectorAll('[data-sockets="watch"] .socket')];
  const socketsPlay = [...document.querySelectorAll('[data-sockets="play"] .socket')];
  const counts = {
    p: document.querySelector('[data-count="perfect"]'),
    g: document.querySelector('[data-count="good"]'),
    m: document.querySelector('[data-count="miss"]'),
  };
  const soundBtn = document.querySelector('[data-sound]');
  const header = document.querySelector('.site-header');

  let audioCtx = null;
  let muted = false;
  let origin = 0;
  let lastCycle = -1;
  let pending = new Set(PATTERN);
  let demoed = new Set();
  let score = { perfect: 0, good: 0, miss: 0 };
  let armed = false;
  let engaged = false;
  let visible = false;
  let tappedThisPlay = false;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function audio() {
    if (muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  }

  function blip(kind, demo) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = demo ? 'sine' : 'triangle';
    osc.frequency.value = kind === 'perfect' ? 880 : kind === 'good' ? 523 : kind === 'demo' ? 392 : 196;
    const peak = demo ? 0.05 : 0.11;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (demo ? 0.08 : 0.13));
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  function flashGrade(label, className) {
    if (!gradeEl) return;
    gradeEl.textContent = label;
    gradeEl.className = `grade pop ${className}`;
    gradeEl.addEventListener('animationend', () => gradeEl.classList.remove('pop'), { once: true });
  }

  function paintCounts() {
    if (counts.p) counts.p.textContent = String(score.perfect);
    if (counts.g) counts.g.textContent = String(score.good);
    if (counts.m) counts.m.textContent = String(score.miss);
  }

  function resetSockets(row) {
    for (const socket of row) {
      socket.classList.remove('is-hit', 'is-now', 'is-perfect', 'is-good', 'is-miss');
    }
  }

  function mark(row, beat, kind) {
    const socket = row[Math.round(beat)];
    if (!socket) return;
    socket.classList.add('is-hit', `is-${kind}`);
  }

  function nearest(local, available) {
    let best = null;
    let bestErr = Infinity;
    for (const beat of available) {
      const err = Math.abs(local - beat);
      const wrap = Math.abs(local - (beat + 4));
      const dist = Math.min(err, wrap);
      if (dist < bestErr) {
        bestErr = dist;
        best = beat;
      }
    }
    return best === null ? null : { beat: best, seconds: bestErr * BEAT };
  }

  function judge(local) {
    const hit = nearest(local, pending);
    if (!hit || hit.seconds > GOOD) {
      score.miss += 1;
      flashGrade('Miss', 'miss');
      blip('miss');
      paintCounts();
      return;
    }
    pending.delete(hit.beat);
    const kind = hit.seconds <= PERFECT ? 'perfect' : 'good';
    score[kind] += 1;
    mark(socketsPlay, hit.beat, kind);
    flashGrade(kind === 'perfect' ? 'Perfect' : 'Good', kind);
    blip(kind);
    paintCounts();
  }

  function expireMisses() {
    for (const beat of pending) {
      score.miss += 1;
      mark(socketsPlay, beat, 'miss');
    }
    if (pending.size) paintCounts();
    pending = new Set(PATTERN);
  }

  function cycleAt(nowMs) {
    return Math.floor((nowMs / 1000 - origin) / (BAR * 2));
  }

  function loop(nowMs) {
    if (!armed) {
      requestAnimationFrame(loop);
      return;
    }
    if (!visible) {
      requestAnimationFrame(loop);
      return;
    }
    const elapsed = nowMs / 1000 - origin;
    const cycle = Math.floor(elapsed / (BAR * 2));
    const inCycle = elapsed - cycle * BAR * 2;
    const playing = inCycle >= BAR;
    const local = ((playing ? inCycle - BAR : inCycle) / BEAT);

    if (cycle !== lastCycle && lastCycle >= 0 && engaged && tappedThisPlay) expireMisses();
    if (cycle !== lastCycle) {
      lastCycle = cycle;
      resetSockets(socketsWatch);
      resetSockets(socketsPlay);
      pending = new Set(PATTERN);
      demoed = new Set();
      tappedThisPlay = false;
    }

    stage?.classList.toggle('is-play', playing);
    stage?.classList.toggle('is-watch', !playing);
    if (hint) {
      hint.textContent = engaged
        ? (playing ? 'Your turn — tap anywhere' : 'Watch the pattern')
        : 'Tap the stage when you are ready';
    }

    const beatIndex = Math.min(3, Math.floor(local));
    for (const [i, socket] of socketsWatch.entries()) socket.classList.toggle('is-now', !playing && i === beatIndex);
    for (const [i, socket] of socketsPlay.entries()) socket.classList.toggle('is-now', playing && i === beatIndex);

    if (!playing) {
      for (const beat of PATTERN) {
        if (local >= beat) {
          mark(socketsWatch, beat, 'hit');
          if (engaged && !demoed.has(beat)) {
            demoed.add(beat);
            blip('demo', true);
          }
        }
      }
    }

    if (baton && stage) {
      const row = playing ? socketsPlay : socketsWatch;
      const socket = row[beatIndex];
      if (socket) {
        const stageBox = stage.getBoundingClientRect();
        const box = socket.getBoundingClientRect();
        baton.style.transform = `translate(${box.left - stageBox.left + box.width / 2 - 7}px, ${box.top - stageBox.top - 10}px)`;
      }
    }

    requestAnimationFrame(loop);
  }

  function startClock() {
    if (armed) return;
    armed = true;
    origin = performance.now() / 1000;
    lastCycle = -1;
    pending = new Set(PATTERN);
    requestAnimationFrame(loop);
  }

  stage?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    engaged = true;
    visible = true;
    startClock();
    const elapsed = performance.now() / 1000 - origin;
    const inCycle = elapsed % (BAR * 2);
    if (inCycle < BAR) {
      blip('demo', true);
      return;
    }
    const local = (inCycle - BAR) / BEAT;
    tappedThisPlay = true;
    judge(local);
  });

  soundBtn?.addEventListener('pointerdown', (event) => event.stopPropagation());
  soundBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    muted = !muted;
    soundBtn.textContent = muted ? 'Sound off' : 'Sound on';
    soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (!muted) audio();
  });

  stage?.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      visible = entry.isIntersecting;
      if (visible) {
        startClock();
        lastCycle = cycleAt(performance.now());
      }
    }
  }, { threshold: 0.35 });
  if (stage) io.observe(stage);

  window.addEventListener('scroll', () => {
    header?.classList.toggle('is-stuck', window.scrollY > 8);
  }, { passive: true });

  if (!reduce) {
    const root = document.documentElement;
    const pulse = () => {
      root.dataset.beat = String(Math.floor((performance.now() / 500) % 4));
      requestAnimationFrame(pulse);
    };
    requestAnimationFrame(pulse);
  }
})();
