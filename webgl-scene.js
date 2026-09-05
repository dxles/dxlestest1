/* ---------------------------------------------------------------------
   dxles.eu — cinematic WebGL backdrop, no build step, no React.

   Ported from Codrops' "Cinematic 3D Scroll Experiences with GSAP"
   (github.com/JosephASG/codrops-cinematic-scroll-animations, article:
   tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-
   experiences-with-gsap). That tutorial has two demos:
     1. A shader-driven WebGL cylinder + inertia particles, camera on a
        scroll-scrubbed dolly through several "shots".
     2. A React-Three-Fiber building scene with the same camera-dolly idea.
   Demo 2 is React-only, so what's ported here is demo 1's *mechanism* —
   a rotating wire shape, particles whose brightness follows scroll
   momentum, and a camera that moves through fixed shot positions instead
   of tracking scroll pixels 1:1 — reimplemented in plain Three.js so it's
   just a `<script type="module">` on a static page.

   Deliberately self-contained: it reads window.scrollY itself and does
   its own easing, so it doesn't depend on GSAP/ScrollSmoother/ScrollTrigger
   having loaded successfully (app.js already degrades gracefully if the
   GSAP CDN fails — this does the same, independently).
------------------------------------------------------------------------ */
(function () {
  const canvas = document.getElementById('cinematic-gl');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!canvas || reduced) return; // CSS also hides #cinematic-gl under reduced-motion

  init().catch((err) => {
    console.warn('[dxles] cinematic WebGL layer unavailable — page still fully usable without it.', err);
  });

  async function init() {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');

    const isMobile = matchMedia('(max-width: 800px)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);

    const renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: 'low-power',
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x0c0d0f); // matches --bg
    scene.fog = new THREE.FogExp2(bgColor, 0.055); // depth cue, same idea as the tutorial's scene.fog

    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 0, 9);

    /* -------------------------------------------------------------
       Central wire shape — stands in for the tutorial's textured
       cylinder. A plain wireframe reads as an accent, not an image
       carousel, which fits a text-led portfolio better.
    ---------------------------------------------------------------*/
    const accent = new THREE.Color(0xff8a4c);  // --accent
    const accent2 = new THREE.Color(0x6e8bff); // --accent-2

    const shapeGeo = new THREE.IcosahedronGeometry(2.15, 1);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(shapeGeo),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.2 })
    );
    scene.add(wire);

    /* -------------------------------------------------------------
       Particle ring with rotational inertia — brightens/quickens
       while the page is being scrolled, settles when it stops. Same
       trick as the tutorial's particle shaders, done with a
       PointsMaterial instead of a custom GLSL pass.
    ---------------------------------------------------------------*/
    const particleCount = isMobile ? 220 : 520;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = 2.7 + Math.random() * 2.7;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 4.4;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: accent2, size: isMobile ? 0.034 : 0.026,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* -------------------------------------------------------------
       Camera "shots" — one loose position per section (hero, work,
       systems, about, lab/contact). Scroll progress blends between
       them with smoothstep easing, so the camera settles into and
       out of each shot instead of tracking the scrollbar 1:1 — this
       (plus the extra lerp in the render loop below) is the actual
       fix for "still feels like I'm scrolling it myself".
    ---------------------------------------------------------------*/
    const shots = [
      { p: [0, 0, 9], t: [0, 0, 0] },
      { p: [-2.5, 0.6, 6.1], t: [0.6, -0.15, 0] },
      { p: [2.6, -0.5, 5.3], t: [-0.55, 0.3, 0] },
      { p: [0, 1.7, 4.3], t: [0, -0.4, 0] },
      { p: [1.5, -1.1, 7.4], t: [0, 0.55, 0] },
    ];
    const smoothstep = (t) => t * t * (3 - 2 * t);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const lerp3 = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];

    function shotForProgress(t) {
      const segs = shots.length - 1;
      const scaled = clamp01(t) * segs;
      const i = Math.min(Math.floor(scaled), segs - 1);
      const local = smoothstep(scaled - i);
      return { p: lerp3(shots[i].p, shots[i + 1].p, local), t: lerp3(shots[i].t, shots[i + 1].t, local) };
    }

    /* -------------------------------------------------------------
       Scroll progress — read raw window.scrollY (unaffected by
       ScrollSmoother's own transform-based smoothing on the DOM
       content) and ease it independently.
    ---------------------------------------------------------------*/
    let targetProgress = 0;
    function readProgress() {
      const max = document.documentElement.scrollHeight - innerHeight;
      targetProgress = max > 0 ? clamp01(scrollY / max) : 0;
    }
    addEventListener('scroll', readProgress, { passive: true });
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      readProgress();
    });
    readProgress();

    let progress = 0, lastProgress = 0, momentum = 0;
    let camPos = [0, 0, 9], camTarget = [0, 0, 0];
    let raf = null;

    function tick() {
      raf = requestAnimationFrame(tick);

      progress += (targetProgress - progress) * 0.07; // the "settle" — never jumps straight to the input value

      const shot = shotForProgress(progress);
      camPos = lerp3(camPos, shot.p, 0.09);
      camTarget = lerp3(camTarget, shot.t, 0.09);
      camera.position.set(camPos[0], camPos[1], camPos[2]);
      camera.lookAt(camTarget[0], camTarget[1], camTarget[2]);

      const vel = progress - lastProgress;
      lastProgress = progress;
      momentum = momentum * 0.9 + Math.abs(vel) * 26; // decay + drive, same shape as the tutorial's inertiaFactor/decayFactor

      wire.rotation.y += 0.0016 + momentum * 0.02;
      wire.rotation.x += 0.0006 + momentum * 0.01;
      particles.rotation.y -= 0.0009 + momentum * 0.015;
      particleMat.opacity += (Math.min(momentum, 1) * 0.7 + 0.05 - particleMat.opacity) * 0.08;

      renderer.render(scene, camera);
    }
    tick();
    canvas.classList.add('is-ready');

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
      else if (raf === null) tick();
    });
  }
})();
