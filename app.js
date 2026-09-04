/* dxles.eu — vanilla JS, no build step.
   GSAP + ScrollTrigger (+ optional Lenis) are loaded globally in index.html.
   three.js is dynamically imported as an ES module from CDN inside initSphere()
   so a failed/slow CDN never breaks the rest of the site.

   SCROLL ARCHITECTURE (v4 — scrub-stage, no pin):
   Each of hero/work/systems/about is a `.stage` (CSS position:fixed, always
   filling the viewport) paired with an invisible `.scroll-spacer` sibling
   that reserves real scroll distance in the normal document flow. A single
   GSAP timeline per stage is bound with `scrub:true` to its own spacer's
   ScrollTrigger (start:'top top', end:'bottom top') — so timeline progress
   is a direct, continuous function of scroll position. No `pin:true`
   anywhere, so GSAP never injects a pin-spacer or re-measures a pinned
   element's box at runtime, which is what let two consecutive pinned
   sections desync in the old step-locked version. Fast/inertial scrolling
   can never "blast through" a step because there are no discrete steps —
   just a continuous 0..1 mapping, identical in spirit to how the reference
   site drives `.character-model`/`.landing-container` off `.landing-section`. */

/* ================================ CONFIG ================================ */
const CONFIG = {
  isMobile: matchMedia('(max-width: 800px)').matches,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  fine: matchMedia('(pointer: fine)').matches,
};

/* ================================== DOM =================================== */
const DOM = {
  loader: document.getElementById('loader'),
  loaderBar: document.querySelector('.loader-bar-fill'),
  canvas: document.getElementById('webgl'),
  nav: document.getElementById('nav'),
  cursorRing: document.querySelector('.cursor-ring'),
  cursorDot: document.querySelector('.cursor-dot'),
  progressFill: document.querySelector('.progress-fill'),
  progressIdx: document.querySelectorAll('.progress-index'),
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ================================= LOADER ================================== */
function initLoader() {
  if (!DOM.loader) return;
  if (CONFIG.reduced || !window.gsap) { DOM.loader.style.display = 'none'; return; }
  gsap.timeline({ defaults: { ease: 'power4.inOut' } })
    .to(DOM.loaderBar, { width: '100%', duration: 1.0 })
    .to(DOM.loader, { yPercent: -100, duration: 0.85 }, '-=0.1')
    .set(DOM.loader, { display: 'none' });
}

/* ================================= CURSOR =================================== */
function initCursor() {
  if (!CONFIG.fine || CONFIG.reduced || !DOM.cursorRing) return;
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;

  addEventListener('mousemove', (e) => {
    x = e.clientX; y = e.clientY;
    DOM.cursorDot.style.transform = `translate3d(${x}px,${y}px,0)`;
  });

  (function loop() {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    DOM.cursorRing.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    requestAnimationFrame(loop);
  })();

  document.querySelectorAll('a, button, .project').forEach((el) => {
    el.addEventListener('mouseenter', () => DOM.cursorRing.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => DOM.cursorRing.classList.remove('is-hover'));
  });
}

/* ============================== SMOOTH SCROLL ==============================
   Lenis, same role it plays on the reference site: it intercepts wheel/touch
   and applies the delta to the REAL scroll position via window.scrollTo(),
   eased. Because the scroll position itself is still native, ScrollTrigger
   needs no scrollerProxy and keeps working exactly as if Lenis weren't
   there — Lenis only makes the motion between scroll positions buttery.
   If the CDN fails, or on touch devices, we just fall through to plain
   native scroll; nothing else in this file depends on Lenis existing. */
let lenis = null;
function initSmoothScroll() {
  if (CONFIG.reduced || CONFIG.isMobile || !window.Lenis) return null;
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1,
    infinite: false,
  });
  // Keep ScrollTrigger's cached scroll position in sync with Lenis's eased value.
  if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  return lenis;
}

/* ============================ NAV SMOOTH SCROLL ============================ */
function initNavSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : document.body;
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
      else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ============================ MAGNETIC INTERACTIONS ============================ */
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

/* =========================== THREE.JS SPHERE (GLOBAL) ===========================
   Unchanged in spirit: one wireframe sphere + particle shell, fixed behind
   everything, Y rotation bound to global scroll progress. Still works
   identically under Lenis since scroll position stays native. */
async function initSphere() {
  if (!DOM.canvas || !window.WebGLRenderingContext) return;
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.178.0/build/three.module.js');
  } catch (err) {
    console.warn('[dxles] three.js CDN failed, trying local vendor copy.', err);
    try {
      THREE = await import('./vendor/three.module.js');
    } catch (err2) {
      console.warn('[dxles] three.js could not be loaded, hiding WebGL layer.', err2);
      DOM.canvas.remove();
      return;
    }
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
  camera.position.z = 9;

  const renderer = new THREE.WebGLRenderer({ canvas: DOM.canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const setPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.isMobile ? 1.3 : 1.7));
  setPR();
  renderer.setSize(innerWidth, innerHeight);

  const group = new THREE.Group();
  group.position.x = CONFIG.isMobile ? 0 : 1.4;
  scene.add(group);

  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.1, CONFIG.isMobile ? 1 : 2),
    new THREE.MeshBasicMaterial({ color: 0xd8ff3e, wireframe: true, transparent: true, opacity: 0.14 })
  );
  group.add(wire);

  const count = CONFIG.isMobile ? 420 : 1100;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 2.3 + Math.random() * 2.4;
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(b) * Math.cos(a);
    positions[i * 3 + 1] = r * Math.cos(b);
    positions[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
  }
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(pointsGeo, new THREE.PointsMaterial({
    color: 0xd8ff3e, size: 0.014, transparent: true, opacity: 0.45,
  }));
  group.add(points);

  let targetRot = 0, rot = 0;
  if (!CONFIG.reduced && window.gsap && window.ScrollTrigger) {
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => { targetRot = self.progress * Math.PI * 2; },
    });
  }

  let mx = 0, my = 0, tx = 0, ty = 0;
  if (CONFIG.fine && !CONFIG.reduced) {
    addEventListener('mousemove', (e) => {
      tx = (e.clientX / innerWidth - 0.5) * 0.6;
      ty = (e.clientY / innerHeight - 0.5) * 0.4;
    });
  }

  const animate = () => {
    rot += (targetRot - rot) * 0.12;
    mx += (tx - mx) * 0.04;
    my += (ty - my) * 0.04;

    group.rotation.y = rot;
    group.rotation.x = my * 0.3;
    group.position.y = -my * 0.4;
    group.position.x = (CONFIG.isMobile ? 0 : 1.4) + mx * 0.5;
    points.rotation.y = -rot * 0.35;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  if (CONFIG.reduced) {
    renderer.render(scene, camera);
  } else {
    animate();
  }

  addEventListener('resize', debounce(() => {
    CONFIG.isMobile = matchMedia('(max-width: 800px)').matches;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    setPR();
    renderer.setSize(innerWidth, innerHeight);
    if (CONFIG.reduced) renderer.render(scene, camera);
  }, 150));
}

/* ============================ SCROLL CHOREOGRAPHY ============================
   Scrub-stage pattern. `createScrubStage` wires one `.stage` to its
   `.scroll-spacer` sibling with a single scrubbed timeline. `build(tl)`
   populates that timeline; its total duration is just "1" (GSAP timelines
   are unitless under scrub — only relative position matters), and scrub
   maps [spacer top hits viewport top] → [spacer bottom hits viewport top]
   onto timeline progress [0 → 1]. */
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
  // Fixed stages can't drive a ScrollTrigger's start/end math (their
  // getBoundingClientRect never changes with scroll), so the progress rail
  // watches each stage's in-flow spacer instead; lab/contact are normal,
  // non-fixed sections and are watched directly as before.
  const railTriggers = { work: 'work-spacer', systems: 'systems-spacer', about: 'about-spacer', lab: 'lab', contact: 'contact' };
  ['work', 'systems', 'about', 'lab', 'contact'].forEach((id, i) => {
    const el = document.getElementById(railTriggers[id]);
    if (!el) return;
    ScrollTrigger.create({
      trigger: el, start: 'top center', end: 'bottom center',
      onEnter: () => setActiveIndex(i), onEnterBack: () => setActiveIndex(i),
    });
  });

  /* ---------- Reusable scrub-bound stage ---------- */
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
        scrub: 0.4,          // small smoothing so scrub doesn't feel stepped even on a jittery trackpad
        invalidateOnRefresh: true,
      },
    });
    build(tl, stage);
  }

  /* ---------- STAGE 1 · HERO: name scales in, chrome fades in, then the
     whole stage cedes visibility to Work as its spacer runs out ---------- */
  createScrubStage('hero', 'hero-spacer', (tl) => {
    const heroName = document.getElementById('hero-name');
    if (!heroName) return;
    gsap.set(heroName, { scale: CONFIG.isMobile ? 3.6 : 6, yPercent: 10 });
    gsap.set('.hero-top, .hero-bottom', { opacity: 0, y: 18 });
    gsap.set('#hero', { autoAlpha: 1 });

    tl.to(heroName, { scale: 1, yPercent: 0, duration: 0.35 }, 0)
      .to('.hero-top, .hero-bottom', { opacity: 1, y: 0, duration: 0.15 }, 0.15)
      // hold fully visible through the middle of its own spacer
      .to('#hero', { autoAlpha: 1, duration: 0.35 }, 0.35)
      // cede to Work in the last stretch of the hero spacer
      .to('#hero', { autoAlpha: 0, duration: 0.2 }, 0.8);
  });

  /* ---------- STAGE 2 · WORK: fades in as Hero cedes, projects reveal
     one by one across the middle of the spacer, fades out into Toolkit ---------- */
  createScrubStage('work', 'work-spacer', (tl) => {
    const projects = gsap.utils.toArray('.project');
    if (!projects.length) return;
    gsap.set('#work', { autoAlpha: 0 });
    gsap.set(projects, { x: () => -innerWidth * 0.35, opacity: 0, filter: 'blur(0px)' });
    gsap.set('#work .section-head', { opacity: 0, y: 24 });

    tl.to('#work', { autoAlpha: 1, duration: 0.08 }, 0)
      .to('#work .section-head', { opacity: 1, y: 0, duration: 0.06 }, 0.02);

    const revealStart = 0.1, revealEnd = 0.85;
    const span = (revealEnd - revealStart) / projects.length;
    projects.forEach((item, i) => {
      const t0 = revealStart + i * span;
      tl.to(item, { x: 0, opacity: 1, duration: span * 0.7 }, t0);
      if (i > 0) {
        tl.to(projects[i - 1], { filter: 'blur(6px)', opacity: 0.35, duration: span * 0.7 }, t0);
      }
    });
    // settle all back to full clarity right before handing off to Toolkit
    tl.to(projects, { filter: 'blur(0px)', opacity: 1, duration: 0.08 }, revealEnd)
      .to('#work', { autoAlpha: 0, duration: 0.12 }, 0.88);
  });

  /* ---------- STAGE 3 · TOOLKIT: columns focus in sequence ---------- */
  createScrubStage('systems', 'systems-spacer', (tl) => {
    const cols = gsap.utils.toArray('.systems-col');
    if (!cols.length) return;
    gsap.set('#systems', { autoAlpha: 0 });
    gsap.set(cols, { filter: 'blur(14px)', opacity: 0.18 });
    gsap.set('#systems .section-head', { opacity: 0, y: 24 });

    tl.to('#systems', { autoAlpha: 1, duration: 0.08 }, 0)
      .to('#systems .section-head', { opacity: 1, y: 0, duration: 0.06 }, 0.02);

    const revealStart = 0.1, revealEnd = 0.85;
    const span = (revealEnd - revealStart) / cols.length;
    cols.forEach((col, i) => {
      const t0 = revealStart + i * span;
      tl.to(col, { filter: 'blur(0px)', opacity: 1, duration: span * 0.8 }, t0);
    });
    tl.to(cols, { filter: 'blur(0px)', opacity: 1, duration: 0.08 }, revealEnd)
      .to('#systems', { autoAlpha: 0, duration: 0.12 }, 0.88);
  });

  /* ---------- STAGE 4 · ABOUT: bio blocks reveal in sequence, then the
     stage itself fades and normal (non-fixed) scroll takes over for
     Lab/Contact below it ---------- */
  createScrubStage('about', 'about-spacer', (tl) => {
    const blocks = gsap.utils.toArray('.about-block');
    if (!blocks.length) return;
    gsap.set('#about', { autoAlpha: 0 });
    gsap.set(blocks, { opacity: 0, y: 42 });
    gsap.set('#about .section-head', { opacity: 0, y: 24 });

    tl.to('#about', { autoAlpha: 1, duration: 0.08 }, 0)
      .to('#about .section-head', { opacity: 1, y: 0, duration: 0.06 }, 0.02);

    const revealStart = 0.1, revealEnd = 0.8;
    const span = (revealEnd - revealStart) / blocks.length;
    blocks.forEach((b, i) => {
      const t0 = revealStart + i * span;
      tl.to(b, { opacity: 1, y: 0, duration: span * 0.8 }, t0);
    });
    tl.to('#about', { autoAlpha: 0, duration: 0.15 }, 0.85);
  });

  /* ---------- LAB & CONTACT: already scrub-based, non-fixed, unchanged ---------- */
  const labItems = gsap.utils.toArray('.lab-item');
  if (labItems.length) {
    gsap.fromTo(labItems,
      { scale: 0.84, opacity: 0.25 },
      {
        scale: 1, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: '.lab-list', start: 'top 88%', end: 'top 34%', scrub: true },
      });
  }

  gsap.fromTo('.contact-title, .contact-email, .contact-links',
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out',
      scrollTrigger: { trigger: '#contact', start: 'top 78%', toggleActions: 'play none none reverse' },
    });

  requestAnimationFrame(() => ScrollTrigger.refresh());
}

function setActiveIndex(i) {
  DOM.progressIdx.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.index) === i));
}

/* ==================================== INIT ==================================== */
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
  try {
    if (!window.gsap) await loadScript('vendor/gsap.min.js');
    if (!window.ScrollTrigger) await loadScript('vendor/ScrollTrigger.min.js');
    if (!window.Lenis) await loadScript('vendor/lenis.min.js');
  } catch (err) {
    console.warn('[dxles] GSAP/Lenis unavailable — serving static, fully readable page.', err);
  }
  initLoader();
  initCursor();
  initSmoothScroll();
  initNavSmoothScroll();
  initMagneticElements();
  initSphere();

  // Fonts + full page load must settle before the first ScrollTrigger
  // measurement, or spacer heights get computed against fallback-font
  // layout and drift once web fonts swap in.
  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  const windowLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => addEventListener('load', resolve, { once: true }));
  await Promise.all([fontsReady, windowLoaded]);

  initScrollChoreography();
}

boot();

addEventListener('resize', debounce(() => {
  CONFIG.isMobile = matchMedia('(max-width: 800px)').matches;
}, 150));
