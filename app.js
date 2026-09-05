/* dxles.eu — vanilla JS, no build step.*/
const CONFIG = {
  isMobile: matchMedia('(max-width: 800px)').matches,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  fine: matchMedia('(pointer: fine)').matches,
};

const DOM = {
  loader: document.getElementById('loader'),
  loaderBar: document.querySelector('.loader-bar-fill'),
  nav: document.getElementById('nav'),
  cursorRing: document.querySelector('.cursor-ring'),
  cursorDot: document.querySelector('.cursor-dot'),
  progressFill: document.querySelector('.progress-fill'),
  progressIdx: document.querySelectorAll('.progress-index'),
  dock: document.getElementById('dock'),
  dockSound: document.getElementById('dock-sound'),
  directory: document.getElementById('directory'),
  directoryToggle: document.getElementById('directory-toggle'),
  directoryTiles: document.querySelectorAll('.directory-tile[data-index]'),
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------------------------------------------------------------------
   Sound — tiny synthesized UI-sound engine (Web Audio API oscillators).
   No audio files are loaded; every tone is generated at runtime, so
   there's nothing to download, license, or fail to load.
------------------------------------------------------------------------ */
const Sound = (() => {
  let ctx = null;
  let enabled = true;
  try { enabled = localStorage.getItem('dxles-sound') !== 'off'; } catch (_) {}
  let lastHover = 0;

  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---- ambient background pad -----------------------------------------
     A quiet, generative chord wash — synthesized on the fly, no audio
     file to load or license. Loops a slow, relaxing chord cycle with
     long fades so chords overlap and dissolve into each other. */
  let ambientMaster = null, ambientFilter = null, ambientPlaying = false, ambientTimer = null, chordIndex = 0;
  const AMBIENT_PROGRESSION = [
    [110.00, 130.81, 164.81, 196.00], // Am7
    [87.31, 110.00, 130.81, 174.61],  // Fmaj7
    [98.00, 123.47, 146.83, 196.00],  // Gsus
    [65.41, 98.00, 123.47, 164.81],   // Cmaj7
  ];
  const AMBIENT_CHORD_SECONDS = 9;

  function ensureAmbientGraph(c) {
    if (ambientMaster) return;
    ambientMaster = c.createGain();
    ambientMaster.gain.value = 0;
    ambientFilter = c.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 850;
    ambientMaster.connect(ambientFilter).connect(c.destination);
  }

  function playAmbientChord(c, freqs, dur) {
    const now = c.currentTime;
    const voiceGain = c.createGain();
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(1, now + 3);
    voiceGain.gain.linearRampToValueAtTime(0, now + dur);
    voiceGain.connect(ambientMaster);
    freqs.forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 6; // tiny drift so it doesn't feel static
      osc.connect(voiceGain);
      osc.start(now);
      osc.stop(now + dur + 0.5);
    });
  }

  function ambientLoop() {
    if (!ambientPlaying) return;
    const c = ctx;
    playAmbientChord(c, AMBIENT_PROGRESSION[chordIndex % AMBIENT_PROGRESSION.length], AMBIENT_CHORD_SECONDS);
    chordIndex++;
    ambientTimer = setTimeout(ambientLoop, (AMBIENT_CHORD_SECONDS - 3) * 1000);
  }

  function startAmbient() {
    if (!enabled || ambientPlaying || CONFIG.reduced) return;
    const c = ensureCtx();
    if (!c) return;
    ensureAmbientGraph(c);
    ambientPlaying = true;
    ambientMaster.gain.cancelScheduledValues(c.currentTime);
    ambientMaster.gain.linearRampToValueAtTime(0.05, c.currentTime + 1.5); // quiet — a wash, not a soundtrack
    ambientLoop();
  }

  function stopAmbient() {
    if (!ambientPlaying) return;
    ambientPlaying = false;
    clearTimeout(ambientTimer);
    if (ambientMaster && ctx) ambientMaster.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
  }
  /* ---------------------------------------------------------------------- */

  function tone({ freq = 800, freqEnd = null, dur = 0.05, type = 'sine', gain = 0.05, delay = 0 }) {
    if (!enabled) return;
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const t0 = c.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  return {
    unlock: () => ensureCtx(),
    hover: () => {
      const now = performance.now();
      if (now - lastHover < 55) return; // throttle rapid mouse travel
      lastHover = now;
      tone({ freq: 1500, freqEnd: 2000, dur: 0.03, type: 'sine', gain: 0.022 });
    },
    click: () => tone({ freq: 560, freqEnd: 200, dur: 0.09, type: 'triangle', gain: 0.05 }),
    navigate: () => tone({ freq: 720, freqEnd: 480, dur: 0.11, type: 'sine', gain: 0.045 }),
    toggleOn: () => tone({ freq: 640, freqEnd: 960, dur: 0.09, type: 'sine', gain: 0.05 }),
    toggleOff: () => tone({ freq: 480, freqEnd: 240, dur: 0.09, type: 'sine', gain: 0.05 }),
    isEnabled: () => enabled,
    setEnabled: (v) => {
      enabled = v;
      try { localStorage.setItem('dxles-sound', v ? 'on' : 'off'); } catch (_) {}
      if (v) startAmbient(); else stopAmbient();
    },
    startAmbient,
    stopAmbient,
  };
})();

function initSoundUI() {
  // Unlock the AudioContext on the first real user gesture — required
  // synchronously inside a genuine interaction by browser autoplay policy.
  const unlock = () => {
    Sound.unlock();
    if (Sound.isEnabled()) Sound.startAmbient();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock, { once: true, passive: true });
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('keydown', unlock, { once: true });

  if (DOM.dockSound) {
    const sync = () => {
      const on = Sound.isEnabled();
      DOM.dockSound.classList.toggle('is-muted', !on);
      DOM.dockSound.setAttribute('aria-pressed', String(on));
      DOM.dockSound.setAttribute('aria-label', on ? 'Ses efektlerini kapat' : 'Ses efektlerini aç');
    };
    sync();
    DOM.dockSound.addEventListener('click', () => {
      Sound.unlock();
      const next = !Sound.isEnabled();
      Sound.setEnabled(next);
      sync();
      if (next) Sound.toggleOn(); else Sound.toggleOff();
    });
  }

  // Hover/click blips across every link and interactive element on the page.
  // (Directory tiles get their own distinct "navigate" tone in initDirectory.)
  const hoverTargets = document.querySelectorAll('a, button:not(#dock-sound), .project, .lab-item');
  hoverTargets.forEach((el) => el.addEventListener('mouseenter', () => Sound.hover()));

  const clickTargets = document.querySelectorAll(
    'a:not(.directory-tile), button:not(#dock-sound):not(#directory-toggle), .project, .lab-item'
  );
  clickTargets.forEach((el) => el.addEventListener('click', () => { Sound.unlock(); Sound.click(); }));
}

function initDirectory() {
  const dir = DOM.directory;
  const toggle = DOM.directoryToggle;
  if (!dir || !toggle) return;
  const label = toggle.querySelector('.dock-btn-label');
  let open = false;

  function ping() {
    if (!DOM.dock) return;
    DOM.dock.classList.add('is-pinging');
    setTimeout(() => DOM.dock.classList.remove('is-pinging'), 260);
  }

  function setOpen(next) {
    open = next;
    dir.classList.toggle('is-open', open);
    document.body.classList.toggle('directory-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    dir.setAttribute('aria-hidden', String(!open));
    if (label) label.textContent = open ? (label.dataset.labelClose || 'Close') : (label.dataset.labelOpen || 'Directory');
    if (smoother) smoother.paused(open);
    Sound.unlock();
    Sound.navigate();
    ping();
  }

  toggle.addEventListener('click', () => setOpen(!open));

  document.querySelectorAll('.directory-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      Sound.unlock();
      Sound.click();
      if (tile.getAttribute('target') !== '_blank') setOpen(false);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });
}

function initLoader() {
  if (!DOM.loader) return;
  if (CONFIG.reduced || !window.gsap) { DOM.loader.style.display = 'none'; return; }
  gsap.timeline({ defaults: { ease: 'power4.inOut' } })
    .to(DOM.loaderBar, { width: '100%', duration: 1.0 })
    .to(DOM.loader, { yPercent: -100, duration: 0.85 }, '-=0.1')
    .set(DOM.loader, { display: 'none' });
}

function initCursor() {
  if (!CONFIG.fine || CONFIG.reduced || !DOM.cursorRing) return;
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
  let scale = 1, targetScale = 1;

  addEventListener('mousemove', (e) => {
    x = e.clientX; y = e.clientY;
    DOM.cursorDot.style.transform = `translate3d(${x}px,${y}px,0)`;
  });

  (function loop() {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    scale += (targetScale - scale) * 0.22;
    DOM.cursorRing.style.transform = `translate3d(${rx}px,${ry}px,0) scale(${scale})`;
    requestAnimationFrame(loop);
  })();

  document.querySelectorAll('a, button, .project, .lab-item').forEach((el) => {
    el.addEventListener('mouseenter', () => { DOM.cursorRing.classList.add('is-hover'); targetScale = 14; });
    el.addEventListener('mouseleave', () => { DOM.cursorRing.classList.remove('is-hover'); targetScale = 1; });
  });
}

/* ---------------------------------------------------------------------
   Cinematic scroll — ported from Codrops' "Cinematic 3D Scroll
   Experiences with GSAP" (github.com/JosephASG/codrops-cinematic-scroll-
   animations). Two things are ported from that tutorial:
     1. The *mechanism* that makes scroll feel directed instead of
        dragged: GSAP's own ScrollSmoother (already eases the scroll
        position ScrollTrigger reads, no manual raf/sync code needed)
        plus named CustomEase curves used *inside* each scrubbed
        timeline so a "shot" accelerates/decelerates like something
        being played back, rather than tracking scroll pixels 1:1.
     2. The actual WebGL visual — see webgl-scene.js, a small OGL/Three
        style rotating wire shape + inertia particles behind a
        GSAP-scrubbed camera dolly, same idea as the tutorial's cylinder
        demo, sized down to fit this page instead of taking it over.
   ScrollSmoother now runs on mobile too (lightly) — leaving it desktop
   -only was the main reason the site still felt like "just scrolling a
   div" on phones.
------------------------------------------------------------------------ */
function setupCinematicEases() {
  if (!window.gsap || !window.CustomEase) return;
  gsap.registerPlugin(CustomEase);
  CustomEase.create('cinematicSilk', '0.45,0.05,0.55,0.95');
  CustomEase.create('cinematicFlow', '0.33,0,0.2,1');
  CustomEase.create('cinematicSmooth', '0.25,0.1,0.25,1');
}

let smoother = null;
function initSmoothScroll() {
  if (CONFIG.reduced || !window.ScrollSmoother) return null;
  smoother = ScrollSmoother.create({
    wrapper: '#smooth-wrapper',
    content: '#smooth-content',
    smooth: CONFIG.isMobile ? 1.1 : 1.8,  // how much the visual scroll lags/eases behind input — the main "weight" knob
    smoothTouch: CONFIG.isMobile ? 0.35 : 0.1, // light on touch so it eases without feeling laggy
    effects: false,
    normalizeScroll: !CONFIG.isMobile,
  });
  return smoother;
}

function initNavSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : document.body;
      if (!target) return;
      e.preventDefault();
      if (smoother) smoother.scrollTo(target, true, 'top top');
      else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function initMagneticElements() {
  if (!CONFIG.fine || CONFIG.reduced || !window.gsap) return;
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = clamp((e.clientX - r.left - r.width / 2) * 0.3, -10, 10);
      const my = clamp((e.clientY - r.top - r.height / 2) * 0.3, -10, 10);
      gsap.to(el, { x: mx, y: my, duration: 0.4, ease: 'power3.out' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,0.4)' });
    });
  });
}

function initScrollChoreography() {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  ScrollTrigger.create({
    start: 'top -80', end: 99999,
    onUpdate: (self) => DOM.nav && DOM.nav.classList.toggle('is-scrolled', self.scroll() > 80),
  });
  if (DOM.progressFill) {
    gsap.to(DOM.progressFill, {
      height: '100%', ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true },
    });
  }
  const railTriggers = { work: 'work-spacer', systems: 'systems-spacer', about: 'about-spacer', lab: 'lab', contact: 'contact' };
  ['work', 'systems', 'about', 'lab', 'contact'].forEach((id, i) => {
    const el = document.getElementById(railTriggers[id]);
    if (!el) return;
    ScrollTrigger.create({
      trigger: el, start: 'top center', end: 'bottom center',
      onEnter: () => setActiveIndex(i), onEnterBack: () => setActiveIndex(i),
    });
  });

  function createScrubStage(stageId, spacerId, build) {
    const stage = document.getElementById(stageId);
    const spacer = document.getElementById(spacerId);
    if (!stage || !spacer) return;

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: spacer,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.4,
        invalidateOnRefresh: true,
        onLeave: () => gsap.set(stage, { autoAlpha: 0 }),
        onEnterBack: () => gsap.set(stage, { autoAlpha: 1 }),
      },
    });
    build(tl, stage);
  }

  createScrubStage('hero', 'hero-spacer', (tl) => {
    const heroName = document.getElementById('hero-name');
    if (!heroName) return;

    gsap.set(heroName, { scale: 1, yPercent: 0 });
    const naturalWidth = heroName.getBoundingClientRect().width || 1;
    const fitScale = (innerWidth * 0.92) / naturalWidth;
    const maxScale = CONFIG.isMobile ? 3.6 : 6;
    const entryScale = Math.min(fitScale, maxScale);

    gsap.set(heroName, { scale: entryScale, yPercent: 10 });
    gsap.set('.hero-top, .hero-bottom', { opacity: 0, y: 18 });
    gsap.set('#hero', { autoAlpha: 1 });

    tl.to(heroName, { scale: 1, yPercent: 0, duration: 0.35, ease: 'cinematicFlow' }, 0)
      .to('.hero-top, .hero-bottom', { opacity: 1, y: 0, duration: 0.15, ease: 'cinematicSmooth' }, 0.15)
      .to('#hero', { autoAlpha: 1, duration: 0.35 }, 0.35)
      .to('#hero', { autoAlpha: 0, duration: 0.2, ease: 'cinematicSilk' }, 0.8);
  });

  createScrubStage('work', 'work-spacer', (tl) => {
    const projects = gsap.utils.toArray('.project');
    if (!projects.length) return;
    gsap.set('#work', { autoAlpha: 0 });
    gsap.set(projects, { x: () => -innerWidth * 0.35, opacity: 0, filter: 'blur(0px)' });
    gsap.set('#work .section-head', { opacity: 0, y: 24 });

    tl.to('#work', { autoAlpha: 1, duration: 0.08 }, 0)
      .to('#work .section-head', { opacity: 1, y: 0, duration: 0.06, ease: 'cinematicSmooth' }, 0.02);

    const revealStart = 0.1, revealEnd = 0.85;
    const span = (revealEnd - revealStart) / projects.length;
    projects.forEach((item, i) => {
      const t0 = revealStart + i * span;
      tl.to(item, { x: 0, opacity: 1, duration: span * 0.7, ease: 'cinematicFlow' }, t0);
      if (i > 0) {
        tl.to(projects[i - 1], { filter: 'blur(6px)', opacity: 0.35, duration: span * 0.7, ease: 'cinematicSilk' }, t0);
      }
    });

    tl.to(projects, { filter: 'blur(0px)', opacity: 1, duration: 0.08 }, revealEnd)
      .to('#work', { autoAlpha: 0, duration: 0.12, ease: 'cinematicSilk' }, 0.88);
  });

  createScrubStage('systems', 'systems-spacer', (tl) => {
    const cols = gsap.utils.toArray('.systems-col');
    if (!cols.length) return;
    gsap.set('#systems', { autoAlpha: 0 });
    gsap.set(cols, { filter: 'blur(14px)', opacity: 0.18 });
    gsap.set('#systems .section-head', { opacity: 0, y: 24 });

    tl.to('#systems', { autoAlpha: 1, duration: 0.08 }, 0)
      .to('#systems .section-head', { opacity: 1, y: 0, duration: 0.06, ease: 'cinematicSmooth' }, 0.02);

    const revealStart = 0.1, revealEnd = 0.85;
    const span = (revealEnd - revealStart) / cols.length;
    cols.forEach((col, i) => {
      const t0 = revealStart + i * span;
      tl.to(col, { filter: 'blur(0px)', opacity: 1, duration: span * 0.8, ease: 'cinematicFlow' }, t0);
    });
    tl.to(cols, { filter: 'blur(0px)', opacity: 1, duration: 0.08 }, revealEnd)
      .to('#systems', { autoAlpha: 0, duration: 0.12, ease: 'cinematicSilk' }, 0.88);
  });

  createScrubStage('about', 'about-spacer', (tl) => {
    const blocks = gsap.utils.toArray('.about-block');
    if (!blocks.length) return;
    gsap.set('#about', { autoAlpha: 0 });
    gsap.set(blocks, { opacity: 0, y: 42 });
    gsap.set('#about .section-head', { opacity: 0, y: 24 });

    tl.to('#about', { autoAlpha: 1, duration: 0.08 }, 0)
      .to('#about .section-head', { opacity: 1, y: 0, duration: 0.06, ease: 'cinematicSmooth' }, 0.02);

    const revealStart = 0.1, revealEnd = 0.42;
    const span = (revealEnd - revealStart) / blocks.length;
    blocks.forEach((b, i) => {
      const t0 = revealStart + i * span;
      tl.to(b, { opacity: 1, y: 0, duration: span * 0.8, ease: 'cinematicFlow' }, t0);
    });

    tl.to('#about', { autoAlpha: 0, duration: 0.15, ease: 'cinematicSilk' }, 0.5);
  });

  gsap.set('.lab-line', { scaleX: 0 });
  gsap.to('.lab-line', {
    scaleX: 1, ease: 'cinematicFlow',
    scrollTrigger: { trigger: '.lab-line', start: 'top 85%', end: 'top 55%', scrub: 0.4 },
  });

  const labItems = gsap.utils.toArray('.lab-item');
  labItems.forEach((item, i) => {
    const fromLeft = i % 2 === 0;
    gsap.fromTo(item,
      { x: fromLeft ? -70 : 70, rotate: fromLeft ? -1.5 : 1.5, opacity: 0.15, filter: 'blur(8px)' },
      {
        x: 0, rotate: 0, opacity: 1, filter: 'blur(0px)', ease: 'cinematicSilk',
        scrollTrigger: { trigger: item, start: 'top 85%', end: 'top 55%', scrub: 0.4 },
      });
  });

  gsap.to('.contact-glow', {
    opacity: 1, scale: 1, ease: 'cinematicSmooth',
    scrollTrigger: { trigger: '#contact', start: 'top bottom', end: 'top 25%', scrub: 0.4 },
  });
  gsap.fromTo('.contact-title',
    { opacity: 0, y: 50, rotate: 1.2 },
    {
      opacity: 1, y: 0, rotate: 0, duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: '#contact', start: 'top 78%', toggleActions: 'play none none reverse' },
    });
  gsap.fromTo('.contact-email',
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0, duration: 0.9, delay: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger: '#contact', start: 'top 78%', toggleActions: 'play none none reverse' },
    });
  gsap.fromTo('.contact-links a',
    { opacity: 0, y: 26 },
    {
      opacity: 1, y: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out',
      scrollTrigger: { trigger: '.contact-links', start: 'top 92%', toggleActions: 'play none none reverse' },
    });

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
    if (smoother) smoother.refresh();
  });
}

function setActiveIndex(i) {
  DOM.progressIdx.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.index) === i));
  DOM.directoryTiles.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.index) === i));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  try {
    if (!window.gsap) await loadScript('vendor/gsap.min.js');
    if (!window.ScrollTrigger) await loadScript('vendor/ScrollTrigger.min.js');
    if (!window.ScrollSmoother) await loadScript('vendor/ScrollSmoother.min.js');
    if (!window.CustomEase) await loadScript('vendor/CustomEase.min.js');
  } catch (err) {
    console.warn('[dxles] GSAP bonus plugins unavailable — serving static, fully readable page.', err);
  }
  setupCinematicEases();
  initLoader();
  initCursor();
  initSmoothScroll();
  initNavSmoothScroll();
  initMagneticElements();
  initSoundUI();
  initDirectory();

  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  const windowLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => addEventListener('load', resolve, { once: true }));
  await Promise.all([fontsReady, windowLoaded]);

  initScrollChoreography();
}

boot();

addEventListener('pageshow', (e) => {
  if (e.persisted) {
    window.scrollTo(0, 0);
    if (smoother) smoother.scrollTo(0, false);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
});

addEventListener('resize', debounce(() => {
  CONFIG.isMobile = matchMedia('(max-width: 800px)').matches;
}, 150));
