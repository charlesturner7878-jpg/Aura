import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/*
 * Saltwood hero stage: a plated still life (stoneware plate, wine glass, rising embers)
 * built entirely from code, so there are no models or photos to load.
 * The page drives it through `state` (scroll + pointer) and `setDish(i)`.
 */

const BG = 0x0e0c0a;
const PLATE_Y = 0.07; // height of the plate's well, where food sits
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  Small geometry + texture helpers                                   */
/* ------------------------------------------------------------------ */

// an organic lump: a sphere pushed around by layered sine noise
function blob(radius, { detail = 4, amp = 0.12, freq = 3, seed = 1 } = {}) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const f = freq / radius;
    const d =
      Math.sin(v.x * f + seed) * Math.sin(v.y * f * 1.3 + seed * 2.1) * Math.sin(v.z * f * 0.9 + seed * 3.7) +
      0.5 * Math.sin(v.x * f * 2.3 - seed) * Math.sin(v.z * f * 2.1 + seed);
    v.addScaledVector(n, d * amp * radius);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// a flat swoosh of sauce: a partial torus squashed onto the plate
function swoosh(radius, tube, arc, flat = 0.32) {
  const g = new THREE.TorusGeometry(radius, tube, 20, 120, arc);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const a = Math.atan2(y, x);
    // taper the ends so it reads like a spoon-drag, not a ring
    const t = clamp(((a + Math.PI * 2) % (Math.PI * 2)) / arc);
    const taper = Math.sin(Math.PI * t) ** 0.5;
    const r = Math.hypot(x, y);
    const k = radius + (r - radius) * taper;
    p.setXYZ(i, (x / r) * k, (y / r) * k, p.getZ(i) * flat * taper);
  }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function leafGeo(len, wid, curl = 0.25) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid, len * 0.45, 0, len);
  s.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / len;
    const x = p.getX(i) / wid;
    p.setZ(i, y * y * curl * len + x * x * 0.08 * len);
  }
  g.computeVertexNormals();
  return g;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// handmade stoneware: warm off-white glaze with iron speckles
const speckleTex = () =>
  canvasTex(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#efe8dc";
    ctx.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(${70 + r() * 40},${45 + r() * 25},${30 + r() * 20},${0.25 + r() * 0.55})`;
      ctx.beginPath();
      ctx.arc(r() * w, r() * h, 0.5 + r() * r() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

// soft round gradient used for the contact shadow + the warm pool of light
const radialTex = (stops) =>
  canvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

// the cut face of a medium-rare slice: crust, grey band, rosy centre
const steakFaceTex = () =>
  canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#3a1a0e";
    ctx.fillRect(0, 0, w, h);
    const band = (inset, color, blur) => {
      ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(inset, inset * 0.8, w - inset * 2, h - inset * 1.6, 40);
      ctx.fill();
    };
    band(10, "#7a4a3a", 4);
    band(26, "#b4505a", 10);
    band(46, "#c9606a", 16);
    ctx.filter = "none";
    const r = rng(3);
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = `rgba(255,225,215,${0.08 + r() * 0.12})`;
      ctx.lineWidth = 0.6 + r();
      ctx.beginPath();
      const x = 40 + r() * (w - 80);
      const y = 40 + r() * (h - 80);
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 10);
      ctx.stroke();
    }
  });

// charred leek: pale green with grill stripes
const leekTex = () =>
  canvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#9fb46a");
    g.addColorStop(0.5, "#dfe6b4");
    g.addColorStop(1, "#9fb46a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.filter = "blur(6px)";
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "rgba(30,20,10,0.75)";
      ctx.fillRect(0, 30 + i * 60, w, 12);
    }
    ctx.filter = "none";
  });

/* ------------------------------------------------------------------ */
/*  Materials                                                          */
/* ------------------------------------------------------------------ */

function phys(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, envMapIntensity: 0.55, ...o });
}

function makeMaterials() {
  return {
    creme: phys(0xf2eadb, { roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    beet: phys(0x6a0b24, { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    goldenBeet: phys(0xd8962a, { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.14 }),
    hazelnut: phys(0xa8713c, { roughness: 0.75 }),
    leaf: phys(0x4c7a2a, { roughness: 0.45, side: THREE.DoubleSide, sheen: 0.6, sheenColor: 0x9ccf6a }),
    leafDark: phys(0x2f5a1f, { roughness: 0.45, side: THREE.DoubleSide }),
    petalYellow: phys(0xf2c641, { roughness: 0.5 }),
    petalPink: phys(0xd46a9c, { roughness: 0.5 }),
    butter: phys(0xc98a2c, { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }),
    chiveOil: phys(0x2e6a1c, { roughness: 0.05, clearcoat: 1 }),
    scallop: phys(0xf0e2c6, { roughness: 0.42, sheen: 0.5, sheenColor: 0xffffff }),
    sear: phys(0xa65a1e, { roughness: 0.55, clearcoat: 0.5 }),
    caviar: phys(0x0d0d0f, { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 }),
    apple: phys(0xe2e8a6, { roughness: 0.35, transmission: 0.25, thickness: 0.05 }),
    garlic: phys(0x170c08, { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    crust: phys(0x3b1c10, { roughness: 0.68 }),
    steakFace: phys(0xffffff, { roughness: 0.48, map: steakFaceTex(), clearcoat: 0.25 }),
    leek: phys(0xffffff, { roughness: 0.45, map: leekTex() }),
    salt: phys(0xffffff, { roughness: 0.2, transmission: 0.3, thickness: 0.02 }),
    jus: phys(0x3d160b, { roughness: 0.06, clearcoat: 1 }),
    sable: phys(0x7a4a22, { roughness: 0.85 }),
    glaze: phys(0x2a1109, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.1 }),
    gold: phys(0xe0b04f, { metalness: 1, roughness: 0.22, envMapIntensity: 1.4, side: THREE.DoubleSide }),
    caramel: phys(0xb5621a, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
    raspberry: phys(0xa8142f, { roughness: 0.38, clearcoat: 0.6, sheen: 0.8, sheenColor: 0xff7090 }),
    soil: phys(0x2b170d, { roughness: 0.9 }),
  };
}

/* ------------------------------------------------------------------ */
/*  The four plates                                                    */
/* ------------------------------------------------------------------ */

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function scatter(geo, mat, count, place) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    d.position.set(0, 0, 0);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(1);
    place(d, i);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  }
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function leaves(mat, list) {
  const g = new THREE.Group();
  for (const [x, z, len, yaw, pitch, y = PLATE_Y + 0.05] of list) {
    const l = mesh(leafGeo(len, len * 0.42), mat, x, y, z);
    l.rotation.set(-pitch, yaw, 0, "YXZ");
    g.add(l);
  }
  return g;
}

function beetDish(M) {
  const d = new THREE.Group();
  const r = rng(11);

  const sauce = mesh(swoosh(0.56, 0.07, Math.PI * 1.25, 0.28), M.creme, 0, PLATE_Y + 0.012, 0);
  sauce.rotation.y = 0.6;
  d.add(sauce);

  const beets = [
    [-0.16, 0.08, 0.23, M.beet, 2],
    [0.17, -0.06, 0.2, M.beet, 5],
    [-0.02, -0.27, 0.16, M.goldenBeet, 8],
    [0.13, 0.26, 0.15, M.beet, 3],
    [-0.33, -0.15, 0.12, M.goldenBeet, 6],
  ];
  for (const [x, z, rad, mat, seed] of beets) {
    const b = mesh(blob(rad, { amp: 0.08, freq: 2.2, seed }), mat, x, PLATE_Y + rad * 0.78, z);
    b.scale.y = 0.86;
    b.rotation.set(r(), r() * 6, r());
    d.add(b);
  }

  const dots = new THREE.SphereGeometry(0.038, 20, 12);
  [
    [0.48, 0.2],
    [0.42, 0.36],
    [0.3, 0.47],
    [0.52, 0.02],
  ].forEach(([x, z], i) => {
    const m = mesh(dots, M.creme, x, PLATE_Y + 0.02, z);
    m.scale.set(1 - i * 0.12, 0.6, 1 - i * 0.12);
    d.add(m);
  });

  d.add(
    scatter(new THREE.DodecahedronGeometry(0.03, 0), M.hazelnut, 34, (o, i) => {
      const a = r() * Math.PI * 2;
      const rad = 0.08 + r() * 0.42;
      const onTop = i < 10;
      const b = beets[i % beets.length];
      if (onTop) o.position.set(b[0] + (r() - 0.5) * 0.1, PLATE_Y + b[2] * 1.45, b[1] + (r() - 0.5) * 0.1);
      else o.position.set(Math.cos(a) * rad, PLATE_Y + 0.02, Math.sin(a) * rad);
      o.rotation.set(r() * 6, r() * 6, r() * 6);
      o.scale.setScalar(0.5 + r() * 0.8);
    }),
  );

  d.add(
    leaves(M.leaf, [
      [-0.12, 0.05, 0.2, 0.4, 0.9, PLATE_Y + 0.36],
      [0.15, -0.05, 0.17, 2.4, 1.0, PLATE_Y + 0.32],
      [0.08, 0.24, 0.14, -1.3, 0.8, PLATE_Y + 0.26],
      [-0.28, -0.2, 0.13, 3.6, 0.7, PLATE_Y + 0.2],
    ]),
  );
  d.add(
    leaves(M.leafDark, [
      [0.0, -0.22, 0.12, 1.2, 0.6, PLATE_Y + 0.28],
      [-0.05, 0.12, 0.11, -2.4, 0.7, PLATE_Y + 0.38],
    ]),
  );

  const petal = new THREE.SphereGeometry(0.022, 12, 8);
  [
    [-0.1, 0.13, 0.4, M.petalYellow],
    [0.2, 0.0, 0.33, M.petalPink],
    [0.05, -0.3, 0.27, M.petalYellow],
    [0.42, 0.28, 0.1, M.petalPink],
  ].forEach(([x, z, y, mat]) => d.add(mesh(petal, mat, x, PLATE_Y + y, z)));
  return d;
}

function scallopDish(M) {
  const d = new THREE.Group();
  const r = rng(21);

  const pool = mesh(blob(0.62, { detail: 5, amp: 0.05, freq: 1.4, seed: 4 }), M.butter, 0, PLATE_Y - 0.002, 0);
  pool.scale.set(1, 0.035, 0.92);
  d.add(pool);

  d.add(
    scatter(new THREE.SphereGeometry(0.03, 16, 10), M.chiveOil, 16, (o, i) => {
      const a = (i / 16) * Math.PI * 2 + r() * 0.2;
      const rad = 0.46 + r() * 0.1;
      o.position.set(Math.cos(a) * rad, PLATE_Y + 0.02, Math.sin(a) * rad * 0.92);
      o.scale.set(0.6 + r() * 0.8, 0.3, 0.6 + r() * 0.8);
    }),
  );

  const body = new THREE.CylinderGeometry(0.19, 0.205, 0.16, 48);
  const top = new THREE.CylinderGeometry(0.192, 0.19, 0.02, 48);
  const pearl = new THREE.SphereGeometry(0.016, 10, 8);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 0.27;
    const z = Math.sin(a) * 0.27;
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    s.add(mesh(body, M.scallop, 0, PLATE_Y + 0.09, 0));
    s.add(mesh(top, M.sear, 0, PLATE_Y + 0.175, 0));
    s.add(
      scatter(pearl, M.caviar, 14, (o) => {
        const aa = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * 0.07;
        o.position.set(Math.cos(aa) * rr, PLATE_Y + 0.2 + r() * 0.015, Math.sin(aa) * rr);
      }),
    );
    s.castShadow = true;
    d.add(s);
  }

  d.add(
    scatter(new THREE.BoxGeometry(0.016, 0.016, 0.2), M.apple, 14, (o, i) => {
      o.position.set((r() - 0.5) * 0.12, PLATE_Y + 0.03 + i * 0.012, (r() - 0.5) * 0.12);
      o.rotation.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3);
    }),
  );

  d.add(
    leaves(M.leaf, [
      [0.02, 0.02, 0.1, 0.3, 1.1, PLATE_Y + 0.2],
      [-0.03, -0.01, 0.09, 2.6, 1.0, PLATE_Y + 0.19],
      [0.3, 0.42, 0.08, -0.8, 0.5, PLATE_Y + 0.04],
    ]),
  );
  return d;
}

function wagyuDish(M) {
  const d = new THREE.Group();
  const r = rng(31);

  const sauce = mesh(swoosh(0.52, 0.075, Math.PI * 1.1, 0.25), M.garlic, 0, PLATE_Y + 0.01, 0);
  sauce.rotation.y = 2.2;
  d.add(sauce);

  // slices lean on each other like fallen dominoes, cut faces out
  const slice = new THREE.BoxGeometry(0.075, 0.2, 0.4);
  const mats = [M.steakFace, M.steakFace, M.crust, M.crust, M.crust, M.crust];
  const fan = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(slice, mats);
    m.castShadow = m.receiveShadow = true;
    m.position.set(-0.24 + i * 0.105, PLATE_Y + 0.095, 0);
    m.rotation.z = -0.42;
    fan.add(m);
  }
  fan.rotation.y = 0.35;
  fan.position.set(0.02, 0, -0.04);
  d.add(fan);

  d.add(
    scatter(new THREE.BoxGeometry(0.018, 0.004, 0.016), M.salt, 16, (o) => {
      o.position.set(-0.26 + r() * 0.52, PLATE_Y + 0.2 + r() * 0.02, -0.15 + r() * 0.24);
      o.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
      o.rotation.set(r() - 0.5, r() * 3, r() - 0.5);
    }),
  );

  const leek = new THREE.CylinderGeometry(0.075, 0.075, 0.6, 32);
  [
    [0.1, 0.36, 0.25],
    [-0.08, 0.42, 0.1],
  ].forEach(([x, z, yaw]) => {
    const l = mesh(leek, M.leek, x, PLATE_Y + 0.075, z);
    l.rotation.set(0, yaw, Math.PI / 2, "YXZ");
    d.add(l);
  });

  d.add(
    scatter(new THREE.SphereGeometry(0.035, 16, 10), M.jus, 6, (o, i) => {
      const a = -0.5 + i * 0.28;
      o.position.set(Math.cos(a) * 0.62, PLATE_Y + 0.018, Math.sin(a) * 0.62);
      o.scale.set(1 - i * 0.1, 0.45, 1 - i * 0.1);
    }),
  );

  d.add(
    leaves(M.leafDark, [
      [0.12, 0.0, 0.11, 0.8, 1.2, PLATE_Y + 0.24],
      [0.18, -0.03, 0.09, -2.2, 1.1, PLATE_Y + 0.23],
    ]),
  );
  return d;
}

function chocolateDish(M) {
  const d = new THREE.Group();
  const r = rng(41);

  const ring = mesh(swoosh(0.6, 0.032, Math.PI * 1.35, 0.5), M.caramel, 0, PLATE_Y + 0.01, 0);
  ring.rotation.y = -0.9;
  d.add(ring);

  d.add(mesh(new THREE.CylinderGeometry(0.36, 0.37, 0.07, 64), M.sable, -0.05, PLATE_Y + 0.035, 0.02));
  const dome = mesh(
    new THREE.SphereGeometry(0.34, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    M.glaze,
    -0.05,
    PLATE_Y + 0.07,
    0.02,
  );
  dome.scale.y = 0.92;
  d.add(dome);

  // crumpled gold leaf sitting on the crown of the dome
  const goldGeo = new THREE.CircleGeometry(0.07, 7);
  const gp = goldGeo.attributes.position;
  for (let i = 1; i < gp.count; i++) {
    gp.setX(i, gp.getX(i) * (0.7 + r() * 0.6));
    gp.setY(i, gp.getY(i) * (0.7 + r() * 0.6));
    gp.setZ(i, (r() - 0.5) * 0.03);
  }
  goldGeo.computeVertexNormals();
  [
    [-0.06, 0.39, 0.02, 0.2],
    [0.0, 0.37, 0.07, 0.6],
    [-0.11, 0.37, -0.03, -0.4],
  ].forEach(([x, y, z, tilt]) => {
    const g = mesh(goldGeo, M.gold, x, PLATE_Y + y - 0.07, z);
    g.rotation.set(-Math.PI / 2 + tilt * 0.6, tilt, r());
    d.add(g);
  });

  [
    [0.38, 0.22, 4],
    [0.46, 0.04, 9],
    [0.3, 0.38, 13],
  ].forEach(([x, z, seed]) => {
    const b = mesh(blob(0.085, { detail: 3, amp: 0.12, freq: 6, seed }), M.raspberry, x, PLATE_Y + 0.07, z);
    b.scale.y = 1.15;
    d.add(b);
  });

  d.add(
    scatter(new THREE.DodecahedronGeometry(0.028, 0), M.soil, 40, (o) => {
      const a = Math.PI * 0.75 + r() * 1.3;
      const rad = 0.42 + r() * 0.22;
      o.position.set(Math.cos(a) * rad, PLATE_Y + 0.015, Math.sin(a) * rad);
      o.rotation.set(r() * 6, r() * 6, r() * 6);
      o.scale.setScalar(0.4 + r() * 0.9);
    }),
  );

  d.add(
    leaves(M.leaf, [
      [0.37, 0.12, 0.09, -1.6, 0.4, PLATE_Y + 0.1],
      [0.42, 0.16, 0.08, 0.8, 0.5, PLATE_Y + 0.1],
    ]),
  );
  return d;
}

/* ------------------------------------------------------------------ */
/*  Tableware                                                          */
/* ------------------------------------------------------------------ */

function makePlate() {
  const pts = [
    [0, 0.07],
    [0.9, 0.07],
    [1.02, 0.082],
    [1.2, 0.125],
    [1.45, 0.185],
    [1.62, 0.212],
    [1.68, 0.208],
    [1.705, 0.192],
    [1.68, 0.175],
    [1.45, 0.15],
    [1.2, 0.095],
    [0.98, 0.04],
    [0.84, 0.018],
    [0.82, 0.0],
    [0.74, 0.0],
    [0.72, 0.018],
    [0, 0.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 160);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3.6 + 0.5, pos.getZ(i) / 3.6 + 0.5);
  const mat = phys(0xffffff, {
    map: speckleTex(),
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
    envMapIntensity: 0.7,
  });
  const plate = mesh(geo, mat);
  const rim = mesh(
    new THREE.TorusGeometry(1.695, 0.012, 10, 200),
    phys(0x4a3324, { roughness: 0.4, clearcoat: 0.6 }),
    0,
    0.198,
    0,
  );
  rim.rotation.x = Math.PI / 2;
  plate.add(rim);
  return plate;
}

function makeGlass() {
  const g = new THREE.Group();
  const curve = new THREE.SplineCurve(
    [
      [0.001, 0.0],
      [0.46, 0.0],
      [0.48, 0.012],
      [0.42, 0.024],
      [0.12, 0.04],
      [0.05, 0.08],
      [0.034, 0.16],
      [0.032, 0.6],
      [0.036, 0.9],
      [0.07, 0.98],
      [0.22, 1.04],
      [0.37, 1.15],
      [0.45, 1.31],
      [0.465, 1.5],
      [0.44, 1.72],
      [0.4, 1.95],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 0.05,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(new THREE.LatheGeometry(curve.getPoints(120), 96), glassMat);
  g.add(glass);

  const wineCurve = new THREE.SplineCurve(
    [
      [0.001, 1.0],
      [0.06, 1.0],
      [0.2, 1.045],
      [0.35, 1.15],
      [0.425, 1.3],
      [0.438, 1.38],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const wPts = wineCurve.getPoints(40);
  wPts.push(new THREE.Vector2(0.001, 1.38));
  const wine = new THREE.Mesh(
    new THREE.LatheGeometry(wPts, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x6e0a1c,
      roughness: 0.05,
      transmission: 0.55,
      thickness: 0.8,
      attenuationColor: new THREE.Color(0x3a0010),
      attenuationDistance: 0.12,
      ior: 1.34,
      clearcoat: 1,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    }),
  );
  g.add(wine);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Embers                                                             */
/* ------------------------------------------------------------------ */

function makeEmbers(count) {
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  const r = rng(99);
  for (let i = 0; i < count; i++) seeds.set([r(), r(), r(), r()], i * 4);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uTime;
      uniform float uPixel;
      varying float vLife;
      varying float vHeat;
      void main() {
        float speed = 0.18 + seed.x * 0.35;
        float life = fract(seed.y + uTime * speed * 0.16);
        float ang = seed.z * 6.2831 + uTime * (0.15 + seed.w * 0.25) + life * 3.0;
        float rad = 0.6 + seed.w * 2.6 + life * 0.6;
        vec3 p = vec3(cos(ang) * rad, life * 4.2 - 0.2, sin(ang) * rad * 0.7 - 0.6);
        p.x += sin(uTime * 1.7 + seed.x * 40.0) * 0.08;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vLife = life;
        vHeat = seed.x;
        gl_PointSize = (2.0 + seed.w * 5.0) * uPixel * (6.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      varying float vLife;
      varying float vHeat;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= smoothstep(0.0, 0.12, vLife) * smoothstep(1.0, 0.55, vLife) * uFade;
        vec3 col = mix(vec3(1.0, 0.36, 0.1), vec3(1.0, 0.78, 0.45), vHeat * (1.0 - vLife));
        gl_FragColor = vec4(col * a, a);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/* ------------------------------------------------------------------ */
/*  Stage                                                              */
/* ------------------------------------------------------------------ */

// framing for each scroll chapter; nx/ny place the subject in NDC (-1..1)
const SHOTS = {
  desktop: {
    hero: { fit: 2.25, elev: 0.36, az: -0.35, focus: [0.32, 0.55, -0.2], glass: 1 },
    story: { nx: 0.56, ny: 0.02, fit: 2.55, elev: 0.5, az: 0.35, focus: [0.32, 0.5, -0.2], glass: 1 },
    sig: { nx: 0.42, ny: -0.02, fit: 1.85, elev: 0.92, az: 0.1, focus: [0, 0.12, 0], glass: 0 },
  },
  mobile: {
    hero: { fit: 2.2, elev: 0.36, az: -0.35, focus: [0.32, 0.55, -0.2], glass: 1 },
    story: { nx: 0, ny: -0.1, fit: 2.5, elev: 0.5, az: 0.35, focus: [0.32, 0.5, -0.2], glass: 1 },
    sig: { nx: 0, ny: 0.4, fit: 1.75, elev: 0.95, az: 0.1, focus: [0, 0.12, 0], glass: 0 },
  },
};

export function start({ canvas, state, reduceMotion, onReady }) {
  const small = () => window.innerWidth <= 900;
  // throws without WebGL; main.js then falls back to a CSS glow
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 9, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  /* ---------- lights: warm key, ember rim, faint fill ---------- */
  const key = new THREE.SpotLight(0xffd6ae, 420, 0, 0.42, 0.75, 2);
  key.position.set(-4.5, 8, 4);
  key.target.position.set(0.2, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(small() ? 1024 : 2048, small() ? 1024 : 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 16;
  scene.add(key, key.target);

  const rim = new THREE.PointLight(0xff6a2a, 55, 0, 2);
  rim.position.set(3.2, 2.2, -3.2);
  scene.add(rim);
  const rim2 = new THREE.PointLight(0xffa860, 14, 0, 2);
  rim2.position.set(-3, 1.2, -2.5);
  scene.add(rim2);
  scene.add(new THREE.HemisphereLight(0xffe9d2, 0x140c06, 0.25));

  /* ---------- table: invisible except for shadows + a warm pool of light ---------- */
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.55 }),
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: radialTex([
        [0, "rgba(255,170,110,0.22)"],
        [0.45, "rgba(226,104,60,0.08)"],
        [1, "rgba(0,0,0,0)"],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.2, -0.002, -0.2);
  scene.add(pool);

  const contact = (size, x, z, o = 0.6) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: radialTex([
          [0, `rgba(0,0,0,${o})`],
          [0.6, `rgba(0,0,0,${o * 0.4})`],
          [1, "rgba(0,0,0,0)"],
        ]),
        transparent: true,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.001, z);
    return m;
  };

  /* ---------- the set ---------- */
  const set = new THREE.Group();
  scene.add(set);

  const plateGroup = new THREE.Group();
  set.add(plateGroup);
  plateGroup.add(makePlate());
  set.add(contact(4.2, 0, 0, 0.75));

  const glassHome = new THREE.Vector3(1.55, 0, -1.05);
  const glassAway = new THREE.Vector3(5.5, 0, -4.2);
  const glass = makeGlass();
  glass.position.copy(glassHome);
  const glassShadow = contact(1.4, 0, 0, 0.7);
  glass.add(glassShadow);
  set.add(glass);

  const M = makeMaterials();
  const dishes = [beetDish(M), scallopDish(M), wagyuDish(M), chocolateDish(M)];
  for (const dish of dishes) {
    dish.children.forEach((c) => {
      c.userData.pos = c.position.clone();
      c.userData.scale = c.scale.clone();
    });
    dish.scale.setScalar(1.3);
    dish.position.y = PLATE_Y * (1 - 1.3); // keep the food sitting on the plate after scaling
    dish.userData.appear = 0;
    dish.userData.target = 0;
    dish.visible = false;
    plateGroup.add(dish);
  }

  const embers = makeEmbers(small() ? 70 : 140);
  set.add(embers);

  /* ---------- dish switching ---------- */
  let current = -1;
  let plateSpin = 0;
  function setDish(i) {
    if (i === current) return;
    if (current !== -1) plateSpin += Math.PI * 0.55;
    current = i;
    dishes.forEach((d, j) => (d.userData.target = j === i ? 1 : 0));
    if (reduceMotion) dishes.forEach((d) => (d.userData.appear = d.userData.target));
  }

  function animateDishes(dt) {
    const leaving = dishes.some((d) => d.userData.target === 0 && d.userData.appear > 0.35);
    for (const d of dishes) {
      const u = d.userData;
      if (u.target === 0) u.appear = Math.max(0, u.appear - dt * 2.4);
      else if (!leaving) u.appear = Math.min(1, u.appear + dt * 0.95);
      d.visible = u.appear > 0.001;
      if (!d.visible) continue;
      const n = d.children.length;
      d.children.forEach((c, i) => {
        const t = clamp((u.appear - (i / Math.max(1, n - 1)) * 0.5) / 0.5);
        const s = Math.max(0.0001, easeOutBack(t));
        c.scale.copy(c.userData.scale).multiplyScalar(s);
        c.position.copy(c.userData.pos);
        c.position.y += (1 - easeOutCubic(t)) * 0.9;
      });
    }
  }

  /* ---------- camera framing ---------- */
  const cur = { nx: 0, ny: 0, fit: 2.3, elev: 0.4, az: 0, glass: 1, fx: 0, fy: 0, fz: 0 };
  let first = true;
  const pointer = { x: 0, y: 0 };

  function targetShot() {
    const set = small() ? SHOTS.mobile : SHOTS.desktop;
    const a = smooth(clamp(state.hero * 1.6));
    const b = smooth(clamp(state.sigIn));
    const hero = { ...set.hero, nx: state.anchorX, ny: state.anchorY };
    const mix = (k) => lerp(lerp(hero[k], set.story[k], a), set.sig[k], b);
    const mixF = (i) => lerp(lerp(set.hero.focus[i], set.story.focus[i], a), set.sig.focus[i], b);
    return {
      nx: mix("nx"),
      ny: mix("ny"),
      fit: mix("fit"),
      elev: mix("elev"),
      az: mix("az"),
      glass: mix("glass"),
      fx: mixF(0),
      fy: mixF(1),
      fz: mixF(2),
    };
  }

  let w = 0;
  let h = 0;
  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small() ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    embers.material.uniforms.uPixel.value = renderer.getPixelRatio() * (h / 900);
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let time = 0;
  let readySent = false;
  const focus = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.active && readySent) return;
    time += reduceMotion ? 0 : dt;

    const t = targetShot();
    const k = first ? 1 : 1 - Math.pow(0.0015, dt);
    for (const key in t) cur[key] = lerp(cur[key], t[key], k);
    first = false;

    pointer.x = lerp(pointer.x, reduceMotion ? 0 : state.pointerX, 1 - Math.pow(0.02, dt));
    pointer.y = lerp(pointer.y, reduceMotion ? 0 : state.pointerY, 1 - Math.pow(0.02, dt));

    // fit the subject's radius into the smaller of the view's half-width/height
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fitK = small() ? 0.92 : 0.8;
    const dist = cur.fit / (tanH * fitK * Math.min(1, camera.aspect));
    const az = cur.az + Math.sin(time * 0.12) * 0.18 + pointer.x * 0.12;
    const el = clamp(cur.elev - pointer.y * 0.05, 0.12, 1.3);
    focus.set(cur.fx, cur.fy, cur.fz);
    camera.position.set(
      focus.x + Math.sin(az) * Math.cos(el) * dist,
      focus.y + Math.sin(el) * dist,
      focus.z + Math.cos(az) * Math.cos(el) * dist,
    );
    camera.lookAt(focus);
    scene.fog.near = dist + 1;
    scene.fog.far = dist + 14;
    camera.setViewOffset(w, h, (-cur.nx * w) / 2, (cur.ny * h) / 2, w, h);

    glass.position.lerpVectors(glassAway, glassHome, smooth(clamp(cur.glass)));
    glass.visible = cur.glass > 0.02;

    plateSpin += reduceMotion ? 0 : dt * 0.06;
    plateGroup.rotation.y = lerp(plateGroup.rotation.y, plateSpin, 1 - Math.pow(0.03, dt));

    animateDishes(reduceMotion ? 10 : dt);

    embers.material.uniforms.uTime.value = time;
    embers.material.uniforms.uFade.value = 1 - 0.6 * smooth(clamp(state.sigIn));
    embers.visible = !reduceMotion;

    renderer.render(scene, camera);

    if (!readySent) {
      readySent = true;
      requestAnimationFrame(() => onReady?.());
    }
  }

  setDish(0);
  dishes[0].userData.appear = reduceMotion ? 1 : 0.0001;
  frame();

  return { setDish };
}
