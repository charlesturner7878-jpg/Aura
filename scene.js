import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const isSmall = () => window.innerWidth < 900;

export function start({ onReady, reduceMotion }) {
  /* ------------------------------------------------------------------ */
  /*  3D stage                                                           */
  /* ------------------------------------------------------------------ */

  const canvas = document.getElementById("stage");
  // throws when WebGL is unavailable; main.js falls back to a CSS glow
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0b0907, 1);

  const scene = new THREE.Scene();
  // set as a background (not only a clear color) so it stays correct inside the bloom render targets
  scene.background = new THREE.Color(0x0b0907);
  scene.fog = new THREE.FogExp2(0x0b0907, 0.035);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 11);

  /* ---------- the aura glow behind everything ---------- */
  const auraMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0xffa62b) },
      uColorB: { value: new THREE.Color(0xff3d1f) },
      uIntensity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float a = atan(p.y, p.x);
        // wobbling, flame-like edge
        float wob = 0.03 * sin(a * 5.0 + uTime * 1.3) + 0.02 * sin(a * 9.0 - uTime * 2.1);
        float core = smoothstep(0.42 + wob, 0.0, r);
        float halo = smoothstep(0.5, 0.15 + wob, r) * 0.5;
        vec3 col = mix(uColorB, uColorA, core);
        float alpha = (core * core * 0.38 + halo * 0.12) * uIntensity;
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
  });
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), auraMat);
  aura.position.z = -2.5;

  /* ---------- the extruded AS monogram (built from the real logo) ---------- */
  const logoGroup = new THREE.Group();
  const logoInner = new THREE.Group();
  logoGroup.add(logoInner);
  logoGroup.add(aura);
  scene.add(logoGroup);

  const layerMaterials = [];
  const LAYERS = 30;
  const DEPTH = 0.42;

  new THREE.TextureLoader().load(
    "assets/logo-as.png",
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const aspect = tex.image.width / tex.image.height;
      const w = 5.2;
      const geo = new THREE.PlaneGeometry(w, w / aspect);

      const front = new THREE.Color(0xe9cf96);
      const edgeHot = new THREE.Color(0xc9861f);
      const edgeDeep = new THREE.Color(0x241304);

      for (let i = 0; i < LAYERS; i++) {
        const t = i / (LAYERS - 1); // 0 = front, 1 = back
        const color = i === 0 ? front : edgeHot.clone().lerp(edgeDeep, Math.pow(t, 0.7));
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          color,
          transparent: true,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
        });
        layerMaterials.push(mat);
        const m = new THREE.Mesh(geo, mat);
        m.position.z = DEPTH / 2 - t * DEPTH;
        m.renderOrder = LAYERS - i;
        logoInner.add(m);
      }
      onReady();
    },
    undefined,
    () => onReady(),
  );

  /* ---------- orbit rings ---------- */
  function makeRing(radius, tube, color, opacity) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 16, 220),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    return ring;
  }
  const ringA = makeRing(3.6, 0.018, 0xffb43c, 0.95);
  ringA.rotation.set(1.2, 0.35, 0.2);
  const ringB = makeRing(4.3, 0.01, 0xff5a1f, 0.6);
  ringB.rotation.set(1.45, -0.5, -0.4);
  const ringC = makeRing(5.1, 0.006, 0xefe1ba, 0.25);
  ringC.rotation.set(1.05, 0.1, 0.9);
  logoGroup.add(ringA, ringB, ringC);

  // little "planet" riding ring A
  const satellite = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe3a0 }),
  );
  ringA.add(satellite);
  const satellite2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xff7a3a }),
  );
  ringB.add(satellite2);

  /* ---------- particle aura field ---------- */
  const COUNT = isSmall() ? 1400 : 3200;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    // mostly a thick shell around the logo, plus a sparse outer field
    const outer = Math.random() < 0.35;
    const r = outer ? 7 + Math.random() * 14 : 2.6 + Math.pow(Math.random(), 1.6) * 4.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * (outer ? 1 : 0.7);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    seeds[i * 4] = Math.random(); // color pick
    seeds[i * 4 + 1] = Math.random(); // size
    seeds[i * 4 + 2] = Math.random() * Math.PI * 2; // phase
    seeds[i * 4 + 3] = 0.3 + Math.random() * 0.9; // orbital speed
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));

  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uScroll: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uScroll;
      uniform vec2 uPointer;
      varying vec3 vColor;
      varying float vFade;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      void main() {
        vec3 p = position;
        float rad = length(p.xz);
        // inner particles swirl faster, like heat coming off the body
        float speed = aSeed.w * (0.6 / (0.4 + rad * 0.12)) * (1.0 + uScroll * 1.5);
        p.xz = rot(uTime * 0.12 * speed + aSeed.z) * p.xz;
        p.y += sin(uTime * 0.6 + aSeed.z * 3.0) * 0.25 + uScroll * (aSeed.x - 0.5) * 4.0;
        p.xy += uPointer * 0.35 * (1.0 / (1.0 + rad * 0.2));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(1.5, 5.5, pow(aSeed.y, 3.0));
        gl_PointSize = size * uPixelRatio * (10.0 / -mv.z);

        vec3 gold = vec3(1.0, 0.70, 0.22);
        vec3 ember = vec3(1.0, 0.33, 0.10);
        vec3 cream = vec3(1.0, 0.93, 0.78);
        vColor = aSeed.x < 0.55 ? gold : (aSeed.x < 0.85 ? ember : cream);
        vFade = 0.55 + 0.45 * sin(uTime * 1.5 + aSeed.z * 6.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        gl_FragColor = vec4(vColor * a * vFade, a * vFade);
      }
    `,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  /* ---------- post-processing: bloom ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- layout + interaction ---------- */
  const pointer = new THREE.Vector2();
  const pointerSmooth = new THREE.Vector2();
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    },
    { passive: true },
  );

  let scrollProgress = 0; // 0 at top, 1 after one viewport
  let pageProgress = 0; // 0..1 through the whole page
  function readScroll() {
    scrollProgress = window.scrollY / window.innerHeight;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    pageProgress = max > 0 ? window.scrollY / max : 0;
  }
  window.addEventListener("scroll", readScroll, { passive: true });
  readScroll();

  // where the logo rests in the hero: right side on desktop, top on mobile
  const basePos = new THREE.Vector3();
  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    pMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();

    if (isSmall()) {
      basePos.set(0, 2.55, 0);
      logoGroup.scale.setScalar(Math.min(0.85, w / 640));
    } else {
      basePos.set(2.9, 0.15, 0);
      logoGroup.scale.setScalar(1);
    }
  }
  window.addEventListener("resize", layout);
  layout();

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  const timeScale = reduceMotion ? 0.15 : 1;
  let visible = true;
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) clock.getDelta();
  });

  let t = 0;
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    t += Math.min(clock.getDelta(), 0.05) * timeScale;

    pointerSmooth.lerp(pointer, 0.05);
    const sp = Math.min(scrollProgress, 2);

    // monogram: breathe + sway + follow cursor, then lift & fade as you scroll
    logoInner.rotation.y = Math.sin(t * 0.5) * 0.35 + pointerSmooth.x * 0.45 + sp * 0.9;
    logoInner.rotation.x = Math.sin(t * 0.37) * 0.08 - pointerSmooth.y * 0.25;
    logoInner.position.y = Math.sin(t * 0.9) * 0.12;

    logoGroup.position.set(basePos.x - sp * basePos.x * 0.6, basePos.y + sp * 3.2, basePos.z - sp * 2);
    const fade = THREE.MathUtils.clamp(1 - (sp - 0.35) / 0.75, 0, 1);
    for (const m of layerMaterials) m.opacity = fade;
    auraMat.uniforms.uIntensity.value = (0.85 + 0.15 * Math.sin(t * 1.7)) * (0.35 + 0.65 * fade);

    // rings orbit like the swoosh in the logo
    ringA.rotation.z = t * 0.35;
    ringB.rotation.z = -t * 0.22;
    ringC.rotation.z = t * 0.12;
    ringA.material.opacity = 0.95 * (0.3 + 0.7 * fade);
    satellite.position.set(Math.cos(t * 0.9) * 3.6, Math.sin(t * 0.9) * 3.6, 0);
    satellite2.position.set(Math.cos(-t * 0.6 + 2) * 4.3, Math.sin(-t * 0.6 + 2) * 4.3, 0);

    // particle field keeps living behind the rest of the page
    particles.rotation.y = pageProgress * Math.PI * 0.8;
    particles.position.x = basePos.x * (1 - Math.min(sp, 1));
    pMat.uniforms.uTime.value = t;
    pMat.uniforms.uScroll.value = Math.min(sp, 1);
    pMat.uniforms.uPointer.value.copy(pointerSmooth);
    auraMat.uniforms.uTime.value = t;

    camera.position.x = pointerSmooth.x * 0.4;
    camera.position.y = pointerSmooth.y * 0.3;
    camera.lookAt(0, 0, 0);

    composer.render();
  }
  tick();
}
