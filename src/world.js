import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeEmblemTexture, makeStoneTexture, makeWaterNormal, makeDotTexture, rng } from './textures.js';

const perlin = new ImprovedNoise();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const CASTLE = { x: 0, z: -58 };
export const SPAWN = { x: 0, z: -32 };
export const CENTER = { x: 0, z: 12 };
export const WORLD_RADIUS = 108;
export const LAKE = { x: -68, z: 76, r: 22 };

export const NODE_DEFS = [
  { id: 0, name: 'Kvarnbäcks by', x: -58, z: -2, fibers: 4, time: 22, enemies: 3, homes: 32,
    road: [[0, -38], [-20, -31], [-42, -17], [-56, -6]] },
  { id: 1, name: 'Skogsnoden', x: 56, z: 14, fibers: 6, time: 26, enemies: 4, homes: 18,
    road: [[0, -38], [22, -29], [44, -7], [54, 9]] },
  { id: 2, name: 'Sjönoden', x: -34, z: 62, fibers: 8, time: 30, enemies: 5, homes: 26,
    road: [[0, -38], [-6, -10], [-14, 22], [-28, 46], [-33, 58]] },
  { id: 3, name: 'Bergsnoden', x: 40, z: 82, fibers: 12, time: 42, boss: true, homes: 64,
    road: [[0, -38], [8, -8], [18, 30], [32, 60], [39, 77]] },
];

function baseHeight(x, z) {
  let h = perlin.noise(x * 0.011, 0.5, z * 0.011) * 7
    + perlin.noise(x * 0.035, 2.1, z * 0.035) * 2
    + perlin.noise(x * 0.09, 5.3, z * 0.09) * 0.35;
  const d = Math.hypot(x - CENTER.x, z - CENTER.z);
  const m = smooth(98, 175, d);
  h += m * (34 + 30 * perlin.noise(x * 0.017, 9.1, z * 0.017)) + m * m * 30;
  return h;
}

const FLATS = [
  { x: CASTLE.x, z: CASTLE.z, r: 24 },
  { x: SPAWN.x, z: SPAWN.z, r: 9 },
  ...NODE_DEFS.map((n) => ({ x: n.x, z: n.z, r: n.boss ? 22 : 12 })),
];
FLATS.forEach((f) => (f.h = baseHeight(f.x, f.z)));

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    const t = 1 - smooth(f.r, f.r + 16, d);
    if (t > 0) h = lerp(h, f.h, t);
  }
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= (1 - smooth(LAKE.r * 0.25, LAKE.r * 1.2, dl)) * 6.5;
  return h;
}

// ---------- vägar ----------
const roads = NODE_DEFS.map((n) => {
  const curve = new THREE.CatmullRomCurve3(n.road.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2));
  return { curve, pts };
});
function roadDist(x, z) {
  let best = 1e9;
  for (const r of roads) {
    const p = r.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i].x, az = p[i].z, bx = p[i + 1].x, bz = p[i + 1].z;
      const vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const dx = x - (ax + vx * t), dz = z - (az + vz * t);
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// UV-skalning så att stenmönstret får rätt storlek
function boxUV(geo, w, h, d, s = 4.5) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / s, uv.getY(k) * dims[f][1] / s);
  }
  return geo;
}
function cylUV(geo, r, h, s = 4.5) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 2 * r) / s, uv.getY(i) * h / s);
  return geo;
}

export function buildWorld(scene, renderer, quality) {
  const R = rng(1337);
  const colliders = [];
  const updaters = [];
  const time = { value: 0 };

  // ---------- himmel + ljus ----------
  const sunDir = new THREE.Vector3(0.8, 0.36, 0.55).normalize();
  const patchSky = (sk, gain) => {
    sk.material.uniforms.uSkyGain = { value: gain };
    sk.material.fragmentShader = 'uniform float uSkyGain;\n' + sk.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uSkyGain, 1.0 );');
  };
  const sky = new Sky();
  sky.scale.setScalar(4000);
  patchSky(sky, quality.skyGain ?? 0.42);
  const su = sky.material.uniforms;
  su.turbidity.value = 5.5;
  su.rayleigh.value = 1.5;
  su.mieCoefficient.value = 0.006;
  su.mieDirectionalG.value = 0.86;
  su.sunPosition.value.copy(sunDir).multiplyScalar(400000);
  if (su.cloudCoverage) { su.cloudCoverage.value = 0.32; su.cloudDensity.value = 0.45; su.cloudElevation.value = 0.55; }
  scene.add(sky);
  updaters.push((dt, t) => { if (su.time) su.time.value = t; });

  // miljökarta för reflexer i rustningen
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(4000);
  patchSky(sky2, 0.55);
  Object.keys(su).forEach((k) => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = su[k].value?.clone ? su[k].value.clone() : su[k].value; });
  envScene.add(sky2);
  const groundEnv = new THREE.Mesh(new THREE.SphereGeometry(1000, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4a4632', side: THREE.BackSide }));
  envScene.add(groundEnv);
  const envRT = pmrem.fromScene(envScene, 0.03);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;

  scene.fog = new THREE.FogExp2('#cdb79b', 0.0042);

  const hemi = new THREE.HemisphereLight('#a8c8ff', '#5f5236', 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd3a0', 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  const sc = sun.shadow.camera;
  sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.045;
  scene.add(sun, sun.target);

  // ---------- terräng ----------
  const SIZE = 520, SEG = quality.terrainSeg;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const tn = tg.attributes.normal;

  const lakeRim = [];
  for (let a = 0; a < 24; a++) lakeRim.push(heightAt(LAKE.x + Math.cos(a / 24 * 6.283) * LAKE.r * 1.05, LAKE.z + Math.sin(a / 24 * 6.283) * LAKE.r * 1.05));
  const waterY = Math.min(...lakeRim) - 0.7;

  const C = (h) => new THREE.Color(h);
  const cols = {
    g1: C('#5a7c2c'), g2: C('#8d913b'), g3: C('#41622a'), g4: C('#9a8a3c'),
    dirt: C('#8f6c45'), dirt2: C('#a0805a'), rock: C('#79726a'), rock2: C('#5f5a55'),
    snow: C('#eef2f7'), sand: C('#b8a678'), cobble: C('#8a8478'),
  };
  const colArr = new Float32Array(tp.count * 3);
  const tmp = new THREE.Color(), tmp2 = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
    const n1 = perlin.noise(x * 0.05, 11.1, z * 0.05) * 0.5 + 0.5;
    const n2 = perlin.noise(x * 0.013, 4.4, z * 0.013) * 0.5 + 0.5;
    const n3 = perlin.noise(x * 0.25, 1.7, z * 0.25) * 0.5 + 0.5;
    tmp.copy(cols.g1).lerp(cols.g3, smooth(0.35, 0.7, n1));
    tmp.lerp(cols.g2, smooth(0.45, 0.8, n2) * 0.8);
    tmp.lerp(cols.g4, smooth(0.6, 0.85, n3) * 0.25);
    // väg
    const dCenter = Math.hypot(x - CENTER.x, z - CENTER.z);
    if (dCenter < 140) {
      const rd = roadDist(x, z);
      const wob = perlin.noise(x * 0.3, 2.2, z * 0.3) * 0.6;
      const rt = 1 - smooth(1.6 + wob, 3.0 + wob, rd);
      if (rt > 0) tmp.lerp(tmp2.copy(cols.dirt).lerp(cols.dirt2, n3), rt * 0.95);
    }
    // borggård
    const dc = Math.max(Math.abs(x - CASTLE.x), Math.abs(z - CASTLE.z));
    if (dc < 15) tmp.lerp(cols.cobble, 0.9);
    // nodplatser – nedtrampat
    for (const n of NODE_DEFS) {
      const dn = Math.hypot(x - n.x, z - n.z);
      if (dn < 7) tmp.lerp(cols.dirt, (1 - smooth(3, 7, dn)) * 0.6);
    }
    // sluttning / berg / snö
    const slope = 1 - tn.getY(i);
    tmp.lerp(tmp2.copy(cols.rock).lerp(cols.rock2, n1), smooth(0.18, 0.38, slope));
    tmp.lerp(cols.rock, smooth(22, 34, y) * 0.7);
    tmp.lerp(cols.snow, smooth(44 + n2 * 10, 52 + n2 * 10, y) * (1 - smooth(0.45, 0.7, slope) * 0.6));
    // strand
    if (y < waterY + 1.2) tmp.lerp(cols.sand, 1 - smooth(waterY + 0.2, waterY + 1.2, y));
    colArr[i * 3] = tmp.r; colArr[i * 3 + 1] = tmp.g; colArr[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- sjö ----------
  const wn = makeWaterNormal();
  wn.repeat.set(6, 6);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE.r * 1.6, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#1f5566', roughness: 0.05, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9, envMapIntensity: 1.4 }),
  );
  water.position.set(LAKE.x, waterY, LAKE.z);
  water.receiveShadow = true;
  scene.add(water);
  updaters.push((dt, t) => { wn.offset.set(t * 0.012, t * 0.007); });
  colliders.push({ x: LAKE.x, z: LAKE.z, r: LAKE.r * 0.95, lake: true });

  // ---------- material ----------
  const stoneTex = makeStoneTexture();
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: '#b9b1a2', roughness: 0.92 });
  const slateMat = new THREE.MeshStandardMaterial({ color: '#3d4f74', roughness: 0.6, metalness: 0.2 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#3b2717', roughness: 0.8 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#d9a943', metalness: 1, roughness: 0.3 });
  const faluMat = new THREE.MeshStandardMaterial({ color: '#74201a', roughness: 0.9 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#d9d3c7', roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#2f3036', roughness: 0.7, flatShading: true });
  const emblemTex = makeEmblemTexture();
  const bannerMat = new THREE.MeshStandardMaterial({ map: emblemTex, roughness: 0.8, side: THREE.DoubleSide });

  // ---------- slottet: Huvudcentralen ----------
  const castle = new THREE.Group();
  const ch = heightAt(CASTLE.x, CASTLE.z);
  castle.position.set(CASTLE.x, ch, CASTLE.z);
  scene.add(castle);
  const HW = 15, WH = 7, WT = 2;
  const merlonGeo = new THREE.BoxGeometry(1, 1.1, 0.7);
  const merlons = [];
  const addWall = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const g = boxUV(new THREE.BoxGeometry(len, WH, WT), len, WH, WT);
    const m = new THREE.Mesh(g, stoneMat);
    m.position.set((x1 + x2) / 2, WH / 2 - 0.5, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    m.castShadow = m.receiveShadow = true;
    castle.add(m);
    const n = Math.floor(len / 2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const ang = m.rotation.y;
      // ytterkant
      const ox = Math.sin(ang) * (WT / 2 - 0.35), oz = Math.cos(ang) * (WT / 2 - 0.35);
      for (const s of [1, -1]) merlons.push([lerp(x1, x2, t) + ox * s, WH + 0.05, lerp(z1, z2, t) + oz * s, ang]);
    }
    // kollision
    const steps = Math.ceil(len / 1.5);
    for (let i = 0; i <= steps; i++) colliders.push({ x: CASTLE.x + lerp(x1, x2, i / steps), z: CASTLE.z + lerp(z1, z2, i / steps), r: 1.4 });
  };
  addWall(-HW, -HW, HW, -HW);
  addWall(-HW, -HW, -HW, HW);
  addWall(HW, -HW, HW, HW);
  addWall(-HW, HW, -3.2, HW);
  addWall(3.2, HW, HW, HW);
  // porten
  const arch = new THREE.Mesh(boxUV(new THREE.BoxGeometry(7.6, 3.2, 3), 7.6, 3.2, 3), stoneMat);
  arch.position.set(0, WH + 0.3, HW); arch.castShadow = true; castle.add(arch);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.6, WH + 3, 3.2), 1.6, WH + 3, 3.2), stoneMat);
    p.position.set(s * 3.6, (WH + 3) / 2 - 0.5, HW); p.castShadow = true; castle.add(p);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), bannerMat);
    b.position.set(s * 6.2, WH - 2.3, HW + WT / 2 + 0.06); castle.add(b);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), goldMat);
    rod.rotation.z = Math.PI / 2; rod.position.set(s * 6.2, WH - 0.15, HW + WT / 2 + 0.1); castle.add(rod);
  }
  const portcullis = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.2, 0.3), darkWood);
  portcullis.position.set(0, WH - 1.1, HW); castle.add(portcullis);
  // torn
  for (const [tx, tz] of [[-HW, -HW], [HW, -HW], [-HW, HW], [HW, HW]]) {
    const tower = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(3, 3.3, 12, 20), 3.2, 12), stoneMat);
    tower.position.set(tx, 5.5, tz); tower.castShadow = tower.receiveShadow = true; castle.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 6.5, 20), slateMat);
    roof.position.set(tx, 11.5 + 3.25, tz); roof.castShadow = true; castle.add(roof);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), bannerMat);
    flag.position.set(tx + 0.7, 19.2, tz); castle.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), goldMat);
    pole.position.set(tx, 18.6, tz); castle.add(pole);
    updaters.push((dt, t) => { flag.rotation.y = Math.sin(t * 2.3 + tx) * 0.35; });
    colliders.push({ x: CASTLE.x + tx, z: CASTLE.z + tz, r: 3.6 });
  }
  // kärntorn
  const keep = new THREE.Mesh(boxUV(new THREE.BoxGeometry(10, 15, 10), 10, 15, 10), stoneMat);
  keep.position.set(0, 7, -2); keep.castShadow = keep.receiveShadow = true; castle.add(keep);
  colliders.push({ x: CASTLE.x, z: CASTLE.z - 2, r: 7 });
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    merlons.push([-4 + i * 2, 15, -2 + s * 4.75, 0]);
    merlons.push([s * 4.75, 15, -6 + i * 2, Math.PI / 2]);
  }
  const mm = new THREE.InstancedMesh(merlonGeo, stoneMat, merlons.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  merlons.forEach(([x, y, z, a], i) => { mm.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), one)); });
  mm.castShadow = true; castle.add(mm);
  // Huvudcentralens kristall
  const coreMat = new THREE.MeshStandardMaterial({ color: '#bffaff', emissive: '#3fe7ff', emissiveIntensity: 5, roughness: 0.15, metalness: 0.1 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 0), coreMat);
  core.scale.y = 1.6;
  const coreY = 15 + 5.2;
  core.position.set(0, coreY, -2); castle.add(core);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(3 + i * 0.8, 0.09, 8, 64), goldMat);
    r.position.copy(core.position); castle.add(r); rings.push(r);
  }
  const coreLight = new THREE.PointLight('#59f3ff', 60, 45, 1.6);
  coreLight.position.set(0, coreY, -2); castle.add(coreLight);
  updaters.push((dt, t) => {
    core.rotation.y = t * 0.6;
    core.position.y = coreY + Math.sin(t * 1.4) * 0.35;
    rings.forEach((r, i) => { r.rotation.x = t * (0.4 + i * 0.25) + i; r.rotation.y = t * (0.3 - i * 0.2); });
    coreMat.emissiveIntensity = 4.8 + Math.sin(t * 3) * 0.8;
  });
  const coreWorld = new THREE.Vector3(CASTLE.x, ch + coreY, CASTLE.z - 2);

  // ---------- hus (falurött) ----------
  const houses = [];
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-2.75, 0); roofShape.lineTo(0, 1.9); roofShape.lineTo(2.75, 0); roofShape.lineTo(-2.75, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 4.4, bevelEnabled: false });
  roofGeo.translate(0, 0, -2.2);
  const winGeo = new THREE.BoxGeometry(0.75, 0.8, 0.08);
  function makeHouse(x, z, rot, windowMat, scale = 1) {
    const g = new THREE.Group();
    const h = heightAt(x, z);
    g.position.set(x, h - 0.15, z); g.rotation.y = rot; g.scale.setScalar(scale);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.7, 3.6), faluMat);
    body.position.y = 1.35; body.castShadow = body.receiveShadow = true; g.add(body);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.72, 0.18), whiteMat);
      c.position.set(sx * 2.4, 1.36, sz * 1.8); g.add(c);
    }
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.68; roof.rotation.y = Math.PI / 2; roof.scale.set(1.05 * 3.6 / 5.5 * 1.25, 1, 1.18);
    roof.castShadow = true; g.add(roof);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), whiteMat);
    chim.position.set(1.2, 3.8, 0.4); chim.castShadow = true; g.add(chim);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.1), new THREE.MeshStandardMaterial({ color: '#2d5a3d', roughness: 0.7 }));
    door.position.set(-0.9, 0.85, 1.82); g.add(door);
    const dframe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.85, 0.06), whiteMat);
    dframe.position.set(-0.9, 0.92, 1.8); g.add(dframe);
    for (const [wx, wz, ry] of [[0.9, 1.82, 0], [-0.9, -1.82, Math.PI], [0.9, -1.82, Math.PI], [2.42, 0, Math.PI / 2], [-2.42, 0, -Math.PI / 2]]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.0, 0.06), whiteMat);
      fr.position.set(wx, 1.55, wz); fr.rotation.y = ry; g.add(fr);
      const w = new THREE.Mesh(winGeo, windowMat);
      w.position.set(wx + Math.sin(ry) * 0.03, 1.55, wz + Math.cos(ry) * 0.03); w.rotation.y = ry; g.add(w);
    }
    scene.add(g);
    houses.push(g);
    colliders.push({ x, z, r: 3.0 * scale });
    return g;
  }

  // ---------- noder ----------
  const cabinetMat = new THREE.MeshStandardMaterial({ color: '#41604f', metalness: 0.55, roughness: 0.42 });
  const beamGeo = new THREE.CylinderGeometry(0.55, 1.1, 160, 20, 1, true);
  beamGeo.translate(0, 80, 0);
  const makeBeamMat = (color) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.5 }, uTime: time },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
      void main(){ float f = pow(1.0 - vUv.y, 2.2); float s = 0.75 + 0.25*sin(vUv.y*80.0 - uTime*6.0);
      float edge = 0.55 + 0.45*abs(sin(vUv.x*3.14159*2.0));
      gl_FragColor = vec4(uColor * (1.8*f*s*edge), f*uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(2.3, 2.75, 48).rotateX(-Math.PI / 2);
  const nodes = NODE_DEFS.map((def) => {
    const h = heightAt(def.x, def.z);
    const g = new THREE.Group();
    g.position.set(def.x, h, def.z);
    scene.add(g);
    const base = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(1.8, 2.1, 0.55, 8), 2, 0.55, 2), stoneMat);
    base.position.y = 0.2; base.castShadow = base.receiveShadow = true; g.add(base);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.9, 0.8), cabinetMat);
    cab.position.y = 0.48 + 0.95; cab.castShadow = true; g.add(cab);
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 1.0), goldMat);
    capTop.position.y = 0.48 + 1.9 + 0.07; g.add(capTop);
    for (const s of [-1, 1]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), goldMat);
      trim.position.set(s * 0.58, 1.43, 0.41); g.add(trim);
    }
    const runeMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff3a2a', emissiveIntensity: 3.5 });
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 24), runeMat);
    rune.position.set(0, 1.65, 0.42); g.add(rune);
    const runeBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), runeMat);
    runeBar.position.set(0, 1.12, 0.42); g.add(runeBar);
    const crystalMat = new THREE.MeshStandardMaterial({ color: '#552222', emissive: '#ff2a1a', emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.1, flatShading: true });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
    crystal.scale.y = 1.7;
    crystal.position.y = 3.35; g.add(crystal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 8, 48), goldMat);
    ring.position.y = 3.35; g.add(ring);
    const beamMat = makeBeamMat('#ff3b2a');
    beamMat.uniforms.uOpacity.value = 0.35;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 3; beam.frustumCulled = false; g.add(beam);
    const gRingMat = new THREE.MeshBasicMaterial({ color: '#59f3ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const gRing = new THREE.Mesh(ringGeo, gRingMat);
    gRing.position.y = 0.52; g.add(gRing);
    // uppgrävd hög + avgrävd kabel
    const dirtMat = new THREE.MeshStandardMaterial({ color: '#5b3d24', roughness: 1, flatShading: true });
    const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), dirtMat);
    mound.scale.set(1.5, 0.55, 1.1); mound.position.set(2.9, 0.05, 1.2); mound.castShadow = true; g.add(mound);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#120b06' }));
    hole.position.set(1.4, 0.06, 2.2); g.add(hole);
    const windowMat = new THREE.MeshStandardMaterial({ color: '#23262e', emissive: '#ffc670', emissiveIntensity: 0, roughness: 0.3 });
    colliders.push({ x: def.x, z: def.z, r: 1.6 });
    const node = { def, group: g, pos: new THREE.Vector3(def.x, h, def.z), crystal, crystalMat, ring, beamMat, runeMat, gRingMat, windowMat,
      fixed: false, lit: 0, cable: null, mound, interactable: false, phase: R() * 6 };
    updaters.push((dt, t) => {
      crystal.rotation.y = t * (node.fixed ? 1.4 : 0.3);
      crystal.position.y = 3.35 + Math.sin(t * 1.6 + node.phase) * 0.12;
      ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.8 + node.phase) * 0.4;
      ring.rotation.z = t * (node.fixed ? 1.2 : 0.2);
      if (!node.fixed) {
        const fl = Math.random() < 0.08 ? 0.2 : 1;
        crystalMat.emissiveIntensity = (2.2 + Math.sin(t * 9) * 0.8) * fl;
        runeMat.emissiveIntensity = 3.2 * fl;
      }
      gRingMat.opacity = node.interactable ? 0.45 + Math.sin(t * 6) * 0.25 : Math.max(0, gRingMat.opacity - dt * 2);
      gRing.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    });
    return node;
  });

  // byar
  const castleWindows = new THREE.MeshStandardMaterial({ color: '#23262e', emissive: '#ffc670', emissiveIntensity: 3.6, roughness: 0.3 });
  makeHouse(-25, -48, 0.4, castleWindows);
  makeHouse(25, -50, -0.5, castleWindows);
  const n0 = NODE_DEFS[0], n1 = NODE_DEFS[1], n2 = NODE_DEFS[2];
  [[-12, 3, 1.6], [-6, 13, 3.0], [6, 13, 2.8], [-13, -10, 1.2], [-1, -15, 0.2], [10, -13, -0.3]].forEach(([dx, dz, r]) => makeHouse(n0.x + dx, n0.z + dz, r, nodes[0].windowMat));
  makeHouse(n1.x + 9, n1.z - 6, -0.9, nodes[1].windowMat, 0.85);
  makeHouse(n1.x + 6, n1.z + 9, 2.4, nodes[1].windowMat, 0.85);
  [[-6, -11, 0.6], [4, 13, 2.9], [12, 3, -1.4]].forEach(([dx, dz, r]) => makeHouse(n2.x + dx, n2.z + dz, r, nodes[2].windowMat));

  // väderkvarn vid sjön
  {
    const wx = n2.x - 3, wz = n2.z + 17;
    const h = heightAt(wx, wz);
    const mill = new THREE.Group();
    mill.position.set(wx, h, wz); mill.rotation.y = 0.5;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 8, 12), whiteMat);
    tower.position.y = 4; tower.castShadow = true; mill.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 2.4, 12), roofMat);
    cap.position.y = 9.2; cap.castShadow = true; mill.add(cap);
    const hub = new THREE.Group(); hub.position.set(0, 8.2, 1.9); mill.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; hub.add(arm);
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6, 0.12), darkWood); spar.position.y = 3; arm.add(spar);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.6, 0.05), new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.9 }));
      sail.position.set(0.62, 3.5, 0); sail.castShadow = true; arm.add(sail);
    }
    updaters.push((dt) => { hub.rotation.z -= dt * (nodes[2].fixed ? 1.4 : 0.35); });
    scene.add(mill);
    colliders.push({ x: wx, z: wz, r: 2.6 });
  }

  // ---------- stolpar + fiberkablar ----------
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.17, 5.6, 7); poleGeo.translate(0, 2.8, 0);
  const armGeo = new THREE.BoxGeometry(1.4, 0.14, 0.14); armGeo.translate(0, 5.25, 0);
  const poleMats = [];
  const cableMats = [];
  roads.forEach((road, ri) => {
    const node = nodes[ri];
    const curve = road.curve;
    const len = curve.getLength();
    const count = Math.floor(len / 10);
    const tops = [coreWorld.clone()];
    for (let i = 1; i <= count; i++) {
      const u = i / (count + 0.6);
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(3.4);
      const px = p.x + side.x, pz = p.z + side.z;
      if (Math.hypot(px - node.def.x, pz - node.def.z) < 6) continue;
      if (Math.hypot(px - CASTLE.x, pz - CASTLE.z) < 22) continue;
      if (roadDist(px, pz) < 2.8) continue;
      const ph = heightAt(px, pz);
      poleMats.push(m4.clone().compose(v3.set(px, ph - 0.2, pz), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(tan.x, tan.z) + Math.PI / 2), one));
      tops.push(new THREE.Vector3(px, ph + 5.25, pz));
      colliders.push({ x: px, z: pz, r: 0.45 });
    }
    tops.push(new THREE.Vector3(node.def.x, node.pos.y + 2.9, node.def.z));
    const pts = [];
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      const span = a.distanceTo(b);
      const n = Math.max(4, Math.ceil(span / 1.5));
      const sag = Math.min(1.2, span * 0.04);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push(new THREE.Vector3(lerp(a.x, b.x, t), lerp(a.y, b.y, t) - sag * 4 * t * (1 - t), lerp(a.z, b.z, t)));
      }
    }
    pts.push(tops[tops.length - 1]);
    const cc = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const clen = cc.getLength();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uLit: { value: 0 }, uLen: { value: clen }, uBroken: { value: 1 }, uFlash: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime, uLit, uLen, uBroken, uFlash;
        void main(){
          float s = vUv.x;
          vec3 base = vec3(0.03,0.032,0.04) + vec3(0.02)*vUv.y;
          float lit = smoothstep(uLit+0.002, uLit-0.002, s);
          float p = fract(s*uLen/9.0 - uTime*1.3);
          float pulse = pow(smoothstep(0.82,1.0,p),4.0);
          float front = (1.0 - smoothstep(0.0, 0.025, abs(s-uLit))) * step(uLit, 0.995) * step(0.002, uLit);
          vec3 c = base + lit*(vec3(0.15,0.95,1.1)*(1.9 + pulse*5.0)) + front*vec3(6.0,7.0,7.0) + uFlash*vec3(1.5,2.0,2.0)*lit;
          float nearEnd = smoothstep(0.94,1.0,s);
          c += uBroken * nearEnd * vec3(1.2,0.15,0.05) * (0.4 + 0.6*abs(sin(uTime*13.0 + s*300.0)));
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(cc, pts.length * 2, 0.075, 5, false), mat);
    tube.frustumCulled = false;
    scene.add(tube);
    node.cable = { mat, length: clen, curve: cc };
    cableMats.push(mat);
  });
  const polesIM = new THREE.InstancedMesh(poleGeo, woodMat, poleMats.length);
  const armsIM = new THREE.InstancedMesh(armGeo, woodMat, poleMats.length);
  poleMats.forEach((m, i) => { polesIM.setMatrixAt(i, m); armsIM.setMatrixAt(i, m); });
  polesIM.castShadow = armsIM.castShadow = true;
  scene.add(polesIM, armsIM);

  // ---------- vegetation ----------
  const isFree = (x, z, pad = 0) => {
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.15 + pad) return false;
    if (Math.max(Math.abs(x - CASTLE.x), Math.abs(z - CASTLE.z)) < 22 + pad) return false;
    for (const n of NODE_DEFS) if (Math.hypot(x - n.x, z - n.z) < (n.boss ? 20 : 11) + pad) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) return false;
    for (const h of houses) if (Math.hypot(x - h.position.x, z - h.position.z) < 5 + pad) return false;
    if (roadDist(x, z) < 4 + pad) return false;
    return true;
  };

  // granar
  const pineParts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6); trunk.translate(0, 0.8, 0);
  const paint = (geo, hex) => {
    const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  pineParts.push(paint(trunk.toNonIndexed(), '#4b3423'));
  [[1.6, 2.4, 1.6], [1.25, 2.1, 2.9], [0.85, 1.8, 4.0], [0.45, 1.3, 4.95]].forEach(([r, h, y], i) => {
    const c = new THREE.ConeGeometry(r, h, 8); c.translate(0, y, 0);
    pineParts.push(paint(c.toNonIndexed(), i % 2 ? '#2d5a33' : '#244b2c'));
  });
  const pineGeo = mergeGeometries(pineParts);
  pineGeo.computeVertexNormals();
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  // lövträd (höstfärger)
  const ltrunk = new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6); ltrunk.translate(0, 1.2, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1.5, 1);
  { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const s = 1 + (perlin.noise(p.getX(i) * 2, p.getY(i) * 2, p.getZ(i) * 2)) * 0.35; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.9 + 3.1, p.getZ(i) * s); } leafGeo.computeVertexNormals(); }
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
  const birchMat = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.8 });
  const autumn = ['#c4661f', '#d99a2b', '#e0b83a', '#9c3b1d', '#6f8a2d', '#b8501c', '#c7882a'].map((c) => new THREE.Color(c));

  const pines = [], leafs = [];
  const want = quality.trees;
  let tries = 0;
  while (pines.length + leafs.length < want && tries < want * 30) {
    tries++;
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 165;
    const x = CENTER.x + Math.cos(a) * d, z = CENTER.z + Math.sin(a) * d;
    if (!isFree(x, z)) continue;
    const h = heightAt(x, z);
    if (h > 34) continue;
    // skogsklungor
    const dens = perlin.noise(x * 0.03, 7.7, z * 0.03) + (Math.hypot(x - n1.x, z - n1.z) < 40 ? 0.5 : 0) + (d > 95 ? 0.35 : 0);
    if (dens < -0.05 + R() * 0.3) continue;
    const s = 0.75 + R() * 0.7;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), new THREE.Vector3(s, s * (0.85 + R() * 0.4), s));
    const pine = R() < 0.58 || h > 18;
    (pine ? pines : leafs).push(m);
    if (d < WORLD_RADIUS + 4) colliders.push({ x, z, r: 0.55 * s });
  }
  const pineIM = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);
  pines.forEach((m, i) => { pineIM.setMatrixAt(i, m); const b = 0.8 + R() * 0.4; pineIM.setColorAt(i, new THREE.Color(b, b, b)); });
  pineIM.castShadow = true; pineIM.receiveShadow = true;
  const trunkIM = new THREE.InstancedMesh(ltrunk, birchMat, leafs.length);
  const leafIM = new THREE.InstancedMesh(leafGeo, leafMat, leafs.length);
  leafs.forEach((m, i) => { trunkIM.setMatrixAt(i, m); leafIM.setMatrixAt(i, m); leafIM.setColorAt(i, autumn[Math.floor(R() * autumn.length)].clone().multiplyScalar(0.85 + R() * 0.3)); });
  trunkIM.castShadow = leafIM.castShadow = true; leafIM.receiveShadow = true;
  scene.add(pineIM, trunkIM, leafIM);

  // stenar
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8a847b', roughness: 0.9, flatShading: true });
  const rocks = [];
  for (let i = 0; i < 220 && rocks.length < quality.rocks; i++) {
    const a = R() * 6.28, d = 10 + Math.sqrt(R()) * 150;
    const x = CENTER.x + Math.cos(a) * d, z = CENTER.z + Math.sin(a) * d;
    if (!isFree(x, z, -2)) continue;
    const s = 0.3 + R() * (d > 90 ? 2.6 : 1.1);
    rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - s * 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), new THREE.Vector3(s, s * 0.7, s * (0.8 + R() * 0.4))));
    if (s > 0.8 && d < WORLD_RADIUS) colliders.push({ x, z, r: s * 0.9 });
  }
  const rockIM = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  rocks.forEach((m, i) => rockIM.setMatrixAt(i, m));
  rockIM.castShadow = rockIM.receiveShadow = true;
  scene.add(rockIM);

  // gräs
  const blade = new THREE.BufferGeometry();
  {
    const w = 0.055, hgt = 0.48;
    const P = [-w, 0, 0, w, 0, 0, -w * 0.7, hgt * 0.4, 0.02, w * 0.7, hgt * 0.4, 0.02, -w * 0.35, hgt * 0.75, 0.05, w * 0.35, hgt * 0.75, 0.05, 0, hgt, 0.1];
    const Cc = []; for (let i = 0; i < 7; i++) { const t = P[i * 3 + 1] / hgt; Cc.push(0.35 + t * 0.65, 0.4 + t * 0.6, 0.3 + t * 0.5); }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  }
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 gwp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float sway = sin(uTime*1.7 + gwp.x*0.32 + gwp.z*0.21)*0.6 + sin(uTime*3.3 + gwp.x*0.9 - gwp.z*0.4)*0.25;
      transformed.x += sway * 0.22 * position.y * position.y;
      transformed.z += sway * 0.12 * position.y * position.y;`);
  };
  const grassCols = ['#6f8f33', '#86933b', '#5b7a2a', '#9c9a45', '#7a8d35'].map((c) => new THREE.Color(c));
  const grassMs = [];
  for (let i = 0; grassMs.length < quality.grass && i < quality.grass * 6; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * 100;
    const x = CENTER.x + Math.cos(a) * d, z = CENTER.z + Math.sin(a) * d;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.1) continue;
    if (Math.max(Math.abs(x - CASTLE.x), Math.abs(z - CASTLE.z)) < 17) continue;
    if (roadDist(x, z) < 2.6) continue;
    const cl = perlin.noise(x * 0.08, 3.3, z * 0.08);
    if (cl < -0.25) continue;
    const s = 0.6 + R() * 0.6 + cl * 0.35;
    grassMs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - 0.03, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3)), new THREE.Vector3(s, s * (0.7 + R() * 0.7), s)));
  }
  const grassIM = new THREE.InstancedMesh(blade, grassMat, grassMs.length);
  grassMs.forEach((m, i) => { grassIM.setMatrixAt(i, m); grassIM.setColorAt(i, grassCols[i % grassCols.length]); });
  scene.add(grassIM);

  // blommor
  const flowerIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), quality.flowers);
  const fcols = ['#ffffff', '#f6d743', '#b48bf2', '#ff8fb1', '#ffffff'].map((c) => new THREE.Color(c));
  let fi = 0;
  for (let i = 0; fi < quality.flowers && i < quality.flowers * 8; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * 95;
    const x = CENTER.x + Math.cos(a) * d, z = CENTER.z + Math.sin(a) * d;
    if (!isFree(x, z, -3)) continue;
    if (perlin.noise(x * 0.06, 8.8, z * 0.06) < 0.1) continue;
    flowerIM.setMatrixAt(fi, new THREE.Matrix4().makeTranslation(x, heightAt(x, z) + 0.35 + R() * 0.15, z));
    flowerIM.setColorAt(fi, fcols[fi % fcols.length]);
    fi++;
  }
  flowerIM.count = fi;
  scene.add(flowerIM);

  // svävande pollen i kvällsljuset
  const motes = (() => {
    const N = quality.motes, BOX = 70;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { p[i * 3] = R() * BOX; p[i * 3 + 1] = R() * 14; p[i * 3 + 2] = R() * BOX; ph[i] = R() * 6.28; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uCenter: { value: new THREE.Vector3() }, uTex: { value: makeDotTexture() }, uBox: { value: BOX } },
      vertexShader: `attribute float phase; uniform float uTime; uniform vec3 uCenter; uniform float uBox; varying float vA;
        void main(){ vec3 p = position;
          p.x = mod(p.x - uCenter.x + uTime*0.4, uBox) - uBox*0.5 + uCenter.x;
          p.z = mod(p.z - uCenter.z + sin(uTime*0.2+phase)*2.0, uBox) - uBox*0.5 + uCenter.z;
          p.y += uCenter.y - 2.0 + sin(uTime*0.7 + phase)*0.8;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_PointSize = (90.0 / -mv.z);
          vA = 0.5 + 0.5*sin(uTime*2.0 + phase*3.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(2.4,1.9,1.0)*t.a*vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return m;
  })();

  // osynlig gräns: stora stenar runt kanten är redan berg
  const bounds = { cx: CENTER.x, cz: CENTER.z, r: WORLD_RADIUS };

  function update(dt, t, focus) {
    time.value = t;
    for (const u of updaters) u(dt, t);
    sun.position.set(focus.x + sunDir.x * 90, focus.y + sunDir.y * 90, focus.z + sunDir.z * 90);
    sun.target.position.set(focus.x, focus.y, focus.z);
    motes.uniforms.uCenter.value.copy(focus);
  }

  return { update, nodes, colliders, bounds, waterY, coreWorld, sunDir, time, emblemTex, goldMat, stoneMat, castle };
}
