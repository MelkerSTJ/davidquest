import * as THREE from 'three';
import { makeHairTexture } from './textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Ytan som fotot ligger på: en ellipsoid runt huvudet + ett platt skägg framför bröstet. */
const FACE = { W: 0.43, H: 0.76, top: 0.3, a: 0.262, b: 0.3, c: 0.292 };
function decalZ(x, y) {
  const { a, b, c } = FACE;
  const e = 1 - (x * x) / (a * a) - (y * y) / (b * b);
  const zh = e > 0 ? c * Math.sqrt(e) : 0;
  const zb = 0.212 - 1.55 * x * x - Math.max(0, -y - 0.3) * 0.22;
  return (y < -0.02 ? Math.max(zh, zb) : zh) + 0.006;
}

/** Ansiktet: fotot böjs runt huvudet + skägget hänger fritt framför bröstet. */
function makeFaceGeometry() {
  const { W, H, top } = FACE;
  const g = new THREE.PlaneGeometry(W, H, 30, 48);
  g.translate(0, top - H / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, decalZ(p.getX(i), p.getY(i)));
  g.computeVertexNormals();
  return g;
}

/** Håret: en kalott som stoppas in bakom fotot där fotot ligger. */
function makeHairGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 22, 0, Math.PI * 2, 0, 1.8);
  g.rotateX(-0.55);
  g.scale(0.272, 0.3, 0.288);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0 && Math.abs(x) < FACE.W / 2 && y > FACE.top - FACE.H) {
      const dz = decalZ(x, y) - 0.014;
      if (z > dz) p.setZ(i, Math.max(dz, 0));
    }
  }
  g.computeVertexNormals();
  return g;
}

export class Hero {
  constructor(faceTex, emblemTex) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const M = (o) => new THREE.MeshStandardMaterial(o);
    this.mats = {
      steel: M({ color: '#b8bfca', metalness: 0.9, roughness: 0.55, envMapIntensity: 1.0 }),
      dark: M({ color: '#5a6170', metalness: 0.9, roughness: 0.42 }),
      gold: M({ color: '#dcaa45', metalness: 1, roughness: 0.28 }),
      cloth: M({ color: '#1d4fae', roughness: 0.85 }),
      cape: M({ color: '#7e1528', roughness: 0.78, side: THREE.DoubleSide }),
      leather: M({ color: '#4a2f1d', roughness: 0.7 }),
      skin: M({ color: '#d8aa94', roughness: 0.62 }),
      hair: M({ color: '#8a6456', roughness: 0.5, map: makeHairTexture() }),
      beard: M({ color: '#7a5a50', roughness: 0.8 }),
    };
    const mt = this.mats;
    mt.beard.map = mt.hair.map;
    this.flashMats = [mt.steel, mt.dark, mt.cloth];

    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // ---- höfter + ben ----
    const hips = this.hips = pivot(this.body, 0, 0.95, 0);
    mesh(new THREE.CylinderGeometry(0.29, 0.41, 0.52, 22, 1, true), mt.cloth, hips, 0, -0.18, 0).material = mt.cloth;
    hips.children[0].material = mt.cloth;
    mt.cloth.side = THREE.DoubleSide;
    mesh(new THREE.TorusGeometry(0.405, 0.022, 6, 32), mt.gold, hips, 0, -0.43, 0).rotation.x = Math.PI / 2;
    this.legs = [];
    for (const s of [1, -1]) {
      const hip = pivot(hips, s * 0.15, -0.02, 0);
      mesh(new THREE.CapsuleGeometry(0.11, 0.24, 6, 12), mt.dark, hip, 0, -0.2, 0);
      const knee = pivot(hip, 0, -0.44, 0);
      mesh(new THREE.SphereGeometry(0.092, 12, 10), mt.steel, knee, 0, 0, 0.03);
      mesh(new THREE.CapsuleGeometry(0.098, 0.22, 6, 12), mt.steel, knee, 0, -0.19, 0);
      const foot = mesh(new THREE.BoxGeometry(0.17, 0.11, 0.3), mt.dark, knee, 0, -0.43, 0.05);
      foot.geometry.translate(0, 0, 0);
      this.legs.push({ hip, knee });
    }

    // ---- bål ----
    const torso = this.torso = pivot(this.body, 0, 1.0, 0);
    mesh(new THREE.CapsuleGeometry(0.29, 0.2, 8, 24), mt.steel, torso, 0, 0.33, 0).scale.set(1.12, 1, 0.8);
    mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.12, 22), mt.dark, torso, 0, 0.06, 0);
    mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.1, 22), mt.steel, torso, 0, -0.04, 0);
    mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), mt.leather, torso, 0, -0.1, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), mt.gold, torso, 0, -0.1, 0.3);
    // vapnet på bröstet
    {
      const g = new THREE.PlaneGeometry(0.34, 0.4, 8, 8);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -1.6 * x * x - 0.9 * Math.max(0, y) * Math.max(0, y)); }
      g.computeVertexNormals();
      const em = emblemTex.clone(); em.needsUpdate = true;
      const m = mesh(g, M({ map: em, roughness: 0.75 }), torso, 0, 0.3, 0.262);
      m.castShadow = false;
    }
    mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.13, 20), mt.steel, torso, 0, 0.63, -0.01);
    // axelskydd
    this.arms = [];
    for (const s of [1, -1]) {
      const pa = mesh(new THREE.SphereGeometry(0.19, 20, 14), mt.steel, torso, s * 0.38, 0.55, 0);
      pa.scale.set(1.15, 0.62, 1.12); pa.rotation.z = -s * 0.5;
      const pa2 = mesh(new THREE.SphereGeometry(0.15, 18, 12), mt.steel, torso, s * 0.45, 0.45, 0);
      pa2.scale.set(1.1, 0.55, 1.08); pa2.rotation.z = -s * 0.8;
      const sh = pivot(torso, s * 0.39, 0.52, 0);
      mesh(new THREE.CapsuleGeometry(0.085, 0.22, 6, 12), mt.dark, sh, 0, -0.17, 0);
      const el = pivot(sh, 0, -0.34, 0);
      mesh(new THREE.CapsuleGeometry(0.08, 0.16, 6, 12), mt.dark, el, 0, -0.12, 0);
      mesh(new THREE.CylinderGeometry(0.098, 0.088, 0.2, 14), mt.steel, el, 0, -0.16, 0);
      const hand = pivot(el, 0, -0.32, 0);
      mesh(new THREE.SphereGeometry(0.085, 12, 10), mt.dark, hand, 0, 0, 0);
      this.arms.push({ sh, el, hand, side: s });
    }
    this.armL = this.arms[0];
    this.armR = this.arms[1];

    // ---- svärdet: Fiberklingan ----
    const sword = this.sword = new THREE.Group();
    this.armR.hand.add(sword);
    mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.2, 10), mt.leather, sword, 0, 0, 0);
    mesh(new THREE.SphereGeometry(0.045, 12, 10), mt.gold, sword, 0, -0.12, 0);
    mesh(new THREE.BoxGeometry(0.36, 0.05, 0.06), mt.gold, sword, 0, 0.11, 0);
    for (const s of [1, -1]) mesh(new THREE.SphereGeometry(0.035, 10, 8), mt.gold, sword, s * 0.18, 0.11, 0);
    {
      const sh = new THREE.Shape();
      sh.moveTo(-0.046, 0); sh.lineTo(-0.04, 0.95); sh.lineTo(0, 1.09); sh.lineTo(0.04, 0.95); sh.lineTo(0.046, 0); sh.lineTo(-0.046, 0);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.006, bevelSegments: 1 });
      bg.translate(0, 0.135, -0.006);
      mesh(bg, M({ color: '#eef3fa', metalness: 1, roughness: 0.16, envMapIntensity: 1.6 }), sword);
      this.bladeCoreMat = M({ color: '#bffcff', emissive: '#3feaff', emissiveIntensity: 5 });
      const core = mesh(new THREE.BoxGeometry(0.014, 0.88, 0.03), this.bladeCoreMat, sword, 0, 0.135 + 0.48, 0);
      core.castShadow = false;
      const gem = mesh(new THREE.OctahedronGeometry(0.03), this.bladeCoreMat, sword, 0, 0.11, 0.035);
      gem.castShadow = false;
    }
    this.bladeBase = new THREE.Vector3(0, 0.22, 0);
    this.bladeTip = new THREE.Vector3(0, 1.2, 0);

    // ---- skölden ----
    {
      const s = new THREE.Shape();
      s.moveTo(0, -0.5); s.quadraticCurveTo(0.3, -0.15, 0.3, 0.24); s.lineTo(0.3, 0.32);
      s.quadraticCurveTo(0, 0.42, -0.3, 0.32); s.lineTo(-0.3, 0.24); s.quadraticCurveTo(-0.3, -0.15, 0, -0.5);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.025, bevelSegments: 2, curveSegments: 16 });
      g.translate(0, 0, -0.018);
      const tex = emblemTex.clone();
      tex.repeat.set(1 / 0.66, 1 / 0.98); tex.offset.set(0.5, 0.53);
      tex.needsUpdate = true;
      const shield = new THREE.Mesh(g, [M({ map: tex, roughness: 0.55, metalness: 0.25 }), mt.gold]);
      shield.castShadow = true;
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
      shield.quaternion.setFromRotationMatrix(basis);
      shield.position.set(0.11, -0.17, 0.02);
      shield.scale.setScalar(0.92);
      this.armL.el.add(shield);
      this.shield = shield;
    }

    // ---- huvud ----
    const head = this.head = pivot(torso, 0, 0.86, 0.01);
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 12), mt.skin, torso, 0, 0.68, 0);
    const skull = mesh(new THREE.SphereGeometry(1, 32, 24), mt.skin, head);
    skull.scale.set(0.25, 0.28, 0.265);
    // käkskägg runt sidorna
    const jaw = mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mt.beard, head, 0, -0.03, 0);
    jaw.scale.set(0.256, 0.3, 0.24);
    // långt skägg (volym bakom fotot)
    const beardGeo = new THREE.ConeGeometry(0.17, 0.42, 18, 1);
    beardGeo.rotateX(Math.PI);
    const beard = mesh(beardGeo, mt.beard, head, 0, -0.33, 0.1);
    beard.scale.set(1, 1, 0.62);
    // hår: bakåtkammat + knut
    mesh(makeHairGeometry(), mt.hair, head);
    mesh(new THREE.SphereGeometry(0.095, 16, 12), mt.hair, head, 0, 0.08, -0.29).scale.set(1, 0.9, 0.85);
    mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 16), mt.leather, head, 0, 0.1, -0.235).rotation.x = 0.3;
    // ansiktet (foto)
    this.faceMat = new THREE.MeshStandardMaterial({
      map: faceTex, transparent: true, roughness: 1, metalness: 0, color: '#d2ccc8',
      emissive: '#ffffff', emissiveMap: faceTex, emissiveIntensity: 0.1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
    });
    const face = new THREE.Mesh(makeFaceGeometry(), this.faceMat);
    face.renderOrder = 2;
    head.add(face);
    this.faceMesh = face;

    // ---- mantel ----
    {
      const g = new THREE.PlaneGeometry(0.72, 1.15, 6, 14);
      g.translate(0, -0.575, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = -p.getY(i) / 1.15; p.setX(i, p.getX(i) * (0.85 + v * 0.45)); }
      this.capeBase = Float32Array.from(p.array);
      const cape = mesh(g, mt.cape, torso, 0, 0.6, -0.2);
      cape.castShadow = true;
      this.cape = cape;
      for (const s of [1, -1]) mesh(new THREE.SphereGeometry(0.045, 10, 8), mt.gold, torso, s * 0.27, 0.6, -0.14);
    }

    // ---- svärdsspår ----
    this.trailN = 18;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 2 * 3), 3));
    tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(this.trailN * 2), 1));
    const idx = [];
    for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(1.2,3.2,3.8)*vA, vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.trail.frustumCulled = false;
    this.trailPts = [];

    // ---- tillstånd ----
    this.pos = this.root.position;
    this.yaw = 0;
    this.vel = new THREE.Vector3();
    this.walk = 0;
    this.speed01 = 0;
    this.attackT = -1;
    this.attackStyle = 0;
    this.hitDone = false;
    this.dashT = -1;
    this.dashCd = 0;
    this.hurtT = 0;
    this.cheerT = -1;
    this.deadT = -1;
    this.t = 0;
    this.maxHp = 10;
    this.hp = 10;
    this.invuln = 0;
    this.selfieWave = 0;
  }

  addTo(scene) { scene.add(this.root); scene.add(this.trail); }

  attack() {
    if (this.deadT >= 0 || this.attackT >= 0 && this.attackT < 0.3) return false;
    this.attackT = 0;
    this.attackStyle = (this.attackStyle + 1) % 2;
    this.hitDone = false;
    this.trailPts.length = 0;
    return true;
  }
  dash() {
    if (this.deadT >= 0 || this.dashCd > 0) return false;
    this.dashT = 0; this.dashCd = 0.75; this.invuln = Math.max(this.invuln, 0.3);
    return true;
  }
  cheer() { this.cheerT = 0; }
  hurt() { this.hurtT = 0.35; }
  die() { this.deadT = 0; }
  revive() { this.deadT = -1; this.hp = this.maxHp; this.root.rotation.set(0, this.yaw, 0); this.body.position.set(0, 0, 0); }

  /** true precis det ögonblick svärdet träffar */
  get strikeNow() { return this.attackT >= 0.1 && !this.hitDone; }
  get attacking() { return this.attackT >= 0 && this.attackT < 0.36; }

  update(dt, moveSpeed01) {
    this.t += dt;
    const t = this.t;
    this.speed01 = lerp(this.speed01, moveSpeed01, 1 - Math.exp(-dt * 10));
    const sp = this.speed01;
    this.walk += dt * (4 + sp * 7.5) * (sp > 0.05 ? 1 : 0);
    const w = this.walk;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    const L = this.armL, Rr = this.armR;
    // grundpose
    let bodyY = Math.abs(Math.sin(w)) * 0.06 * sp + Math.sin(t * 2) * 0.008;
    let lean = sp * 0.12;
    let torsoY = 0, torsoX = 0;
    const legSw = Math.sin(w) * 0.75 * sp;
    this.legs[0].hip.rotation.x = legSw;
    this.legs[1].hip.rotation.x = -legSw;
    this.legs[0].knee.rotation.x = Math.max(0, -Math.sin(w)) * 1.0 * sp + 0.05;
    this.legs[1].knee.rotation.x = Math.max(0, Math.sin(w)) * 1.0 * sp + 0.05;

    // vänster arm (sköld)
    L.sh.rotation.set(-0.35 - Math.sin(w) * 0.25 * sp, 0, 0.22);
    L.el.rotation.set(-1.25, 0, 0);
    // höger arm (svärd, redo-läge)
    let rsx = -0.35 + Math.sin(w) * 0.35 * sp, rsy = 0, rsz = -0.2, rex = -0.75, swx = Math.PI / 2 + 0.15, swz = 0;

    // attack
    if (this.attackT >= 0) {
      this.attackT += dt;
      const a = this.attackT;
      if (this.attackStyle === 0) {
        // överhandshugg
        if (a < 0.08) { const k = ease(a / 0.08); rsx = lerp(rsx, 2.55, k); rex = lerp(rex, -0.2, k); swx = lerp(swx, 2.7, k); torsoY = lerp(0, 0.35, k); }
        else if (a < 0.22) { const k = ease((a - 0.08) / 0.14); rsx = lerp(2.55, 5.75, k); rex = -0.15; swx = lerp(2.7, 2.2, k); torsoY = lerp(0.35, -0.35, k); torsoX = lerp(-0.1, 0.25, k); }
        else if (a < 0.36) { const k = ease((a - 0.22) / 0.14); rsx = lerp(5.75, rsx + Math.PI * 2, k); rex = lerp(-0.15, rex, k); swx = lerp(2.2, swx, k); torsoY = lerp(-0.35, 0, k); torsoX = lerp(0.25, 0, k); }
      } else {
        // sidohugg
        if (a < 0.08) { const k = ease(a / 0.08); rsx = lerp(rsx, -1.45, k); rsz = lerp(rsz, -1.2, k); rex = lerp(rex, -0.1, k); swx = lerp(swx, 2.9, k); torsoY = lerp(0, -1.0, k); }
        else if (a < 0.22) { const k = ease((a - 0.08) / 0.14); rsx = -1.45; rsz = lerp(-1.2, 0.2, k); rex = -0.1; swx = 2.9; torsoY = lerp(-1.0, 1.05, k); }
        else if (a < 0.36) { const k = ease((a - 0.22) / 0.14); rsx = lerp(-1.45, rsx, k); rsz = lerp(0.2, rsz, k); rex = lerp(-0.1, rex, k); swx = lerp(2.9, swx, k); torsoY = lerp(1.05, 0, k); }
      }
      if (a >= 0.36) this.attackT = -1;
    }

    // jubel
    if (this.cheerT >= 0) {
      this.cheerT += dt;
      const c = this.cheerT;
      const k = Math.min(1, c / 0.25) * (c > 2.6 ? Math.max(0, 1 - (c - 2.6) / 0.3) : 1);
      rsx = lerp(rsx, Math.PI - 0.15, k); rsz = lerp(rsz, -0.25, k); rex = lerp(rex, -0.1, k); swx = lerp(swx, Math.PI, k);
      L.sh.rotation.set(lerp(L.sh.rotation.x, -0.6, k), 0, lerp(0.22, 0.9, k));
      bodyY += Math.max(0, Math.sin(c * 7)) * 0.12 * k;
      if (c > 2.9) this.cheerT = -1;
    }
    // hjältepose i selfie-läge: svärdet i luften
    if (this.selfieWave > 0 && this.attackT < 0 && this.cheerT < 0 && sp < 0.1) {
      const k = ease(Math.min(1, this.selfieWave));
      rsx = lerp(rsx, Math.PI - 0.35, k); rsz = lerp(rsz, -0.35, k); rex = lerp(rex, -0.35, k); swx = lerp(swx, Math.PI - 0.1, k);
      L.sh.rotation.set(lerp(L.sh.rotation.x, -0.55, k), 0, lerp(0.22, 0.32, k));
      torsoY = lerp(torsoY, 0.12, k);
    }
    // rusning
    if (this.dashT >= 0) {
      this.dashT += dt;
      lean = 0.45;
      if (this.dashT > 0.22) this.dashT = -1;
    }

    Rr.sh.rotation.set(rsx, rsy, rsz);
    Rr.el.rotation.set(rex, 0, 0);
    this.sword.rotation.set(swx, 0, swz);

    this.torso.rotation.set(lean + torsoX, torsoY, 0);
    this.hips.rotation.y = -torsoY * 0.3;
    this.body.position.y = bodyY;
    this.head.rotation.set(-lean * 0.5 + Math.sin(t * 1.3) * 0.02, -torsoY * 0.4, 0);

    // mantel
    {
      const p = this.cape.geometry.attributes.position;
      const base = this.capeBase;
      const flap = 0.06 + sp * 0.42 + (this.dashT >= 0 ? 0.4 : 0);
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1];
        const v = -by / 1.15;
        const wave = Math.sin(t * (5 + sp * 6) + v * 4 + bx * 4) * 0.035 * v * (0.6 + sp * 1.5);
        p.setXYZ(i, bx, by + v * v * flap * 0.25, -v * v * flap - v * 0.05 + wave);
      }
      p.needsUpdate = true;
      this.cape.geometry.computeVertexNormals();
    }

    // skadeblink
    if (this.hurtT > 0) this.hurtT -= dt;
    const hf = Math.max(0, this.hurtT) / 0.35;
    for (const m of this.flashMats) { m.emissive.setRGB(hf * 1.2, hf * 0.1, hf * 0.05); }
    this.bladeCoreMat.emissiveIntensity = 4.6 + (this.attacking ? 4 : 0) + Math.sin(t * 4) * 0.6;

    // död
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = ease(Math.min(1, this.deadT / 0.7));
      this.body.rotation.x = -k * 1.45;
      this.body.position.y = k * 0.25;
    } else {
      this.body.rotation.x = 0;
    }

    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    this.updateTrail(dt);
  }

  updateTrail(dt) {
    const active = this.attackT >= 0.05 && this.attackT < 0.3;
    if (active) {
      const b = this.sword.localToWorld(this.bladeBase.clone());
      const tip = this.sword.localToWorld(this.bladeTip.clone());
      this.trailPts.unshift({ b, tip, life: 1 });
      if (this.trailPts.length > this.trailN) this.trailPts.pop();
    }
    for (const p of this.trailPts) p.life -= dt * 5;
    while (this.trailPts.length && this.trailPts[this.trailPts.length - 1].life <= 0) this.trailPts.pop();
    const pos = this.trail.geometry.attributes.position, al = this.trail.geometry.attributes.alpha;
    const n = this.trailPts.length;
    for (let i = 0; i < this.trailN; i++) {
      const p = this.trailPts[Math.min(i, n - 1)];
      if (!p) { pos.setXYZ(i * 2, 0, -999, 0); pos.setXYZ(i * 2 + 1, 0, -999, 0); al.setX(i * 2, 0); al.setX(i * 2 + 1, 0); continue; }
      pos.setXYZ(i * 2, p.b.x, p.b.y, p.b.z);
      pos.setXYZ(i * 2 + 1, p.tip.x, p.tip.y, p.tip.z);
      const a = Math.max(0, p.life) * (1 - i / this.trailN) * (i < n ? 1 : 0);
      al.setX(i * 2, a * 0.15);
      al.setX(i * 2 + 1, a * 0.9);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  bladeTipWorld() { return this.sword.localToWorld(this.bladeTip.clone()); }
}
