import * as THREE from 'three';
import { makeDotTexture } from './textures.js';
import { heightAt } from './world.js';

/** Enkel partikelpool med additiv eller vanlig blandning. */
class Particles {
  constructor(scene, n, additive) {
    this.n = n;
    this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: makeDotTexture() }, uScale: { value: window.innerHeight / 2 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=color; vA=alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: additive
        ? `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; gl_FragColor = vec4(vC*a, a); }`
        : `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if(a<0.02) discard; gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.material = m;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  emit(p, v, color, size, life, { grav = 0, drag = 1, grow = 0 } = {}) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.min(1, k * 2.5) * (k > 0.9 ? (1 - k) * 10 : 1);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
}

const rnd = (s = 1) => (Math.random() - 0.5) * 2 * s;
const V = new THREE.Vector3();
const C = (h) => new THREE.Color(h);
const COL = { cyan: C('#7ff6ff').multiplyScalar(4), white: C('#ffffff').multiplyScalar(4.5), gold: C('#ffd27a').multiplyScalar(4), red: C('#ff4a2a').multiplyScalar(4), orange: C('#ffa53a').multiplyScalar(4.5), dirt: C('#6a4a2c'), dirt2: C('#8a6a45'), smoke: C('#3a3a3e'), dust: C('#b9a582') };

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Particles(scene, 1400, true);
    this.solid = new Particles(scene, 900, false);
    this.rings = [];
    this.telegraphs = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    this.fireworksT = -1;
  }

  sparks(p, n = 14, color = COL.cyan, speed = 6) {
    for (let i = 0; i < n; i++) this.glow.emit(p, V.set(rnd(speed), Math.random() * speed, rnd(speed)), color, 0.18 + Math.random() * 0.12, 0.35 + Math.random() * 0.35, { grav: 12, drag: 2 });
  }
  hit(p) {
    this.sparks(p, 18, COL.white, 7);
    this.sparks(p, 10, COL.cyan, 5);
    for (let i = 0; i < 6; i++) this.solid.emit(p, V.set(rnd(2), Math.random() * 3, rnd(2)), COL.dust, 0.35, 0.5, { grav: 4, drag: 3, grow: 0.8 });
  }
  dirt(p, n = 22) {
    for (let i = 0; i < n; i++) this.solid.emit(p, V.set(rnd(3.5), 3 + Math.random() * 5, rnd(3.5)), Math.random() < 0.5 ? COL.dirt : COL.dirt2, 0.22 + Math.random() * 0.25, 0.8 + Math.random() * 0.4, { grav: 16, drag: 0.6 });
  }
  poof(p) {
    this.dirt(p, 18);
    for (let i = 0; i < 14; i++) this.solid.emit(V.copy(p).add(new THREE.Vector3(rnd(0.4), Math.random() * 0.6, rnd(0.4))), new THREE.Vector3(rnd(1.5), 0.8 + Math.random() * 1.5, rnd(1.5)), COL.dust, 0.6, 0.9, { drag: 2.5, grow: 1.6 });
    this.sparks(p.clone().setY(p.y + 0.5), 12, COL.gold, 5);
  }
  smoke(p) {
    this.solid.emit(p, V.set(rnd(0.3), 1.6 + Math.random(), rnd(0.3)), COL.smoke, 0.5, 1.6, { drag: 0.5, grow: 1.4 });
  }
  dashTrail(p) {
    this.glow.emit(V.copy(p).add(new THREE.Vector3(rnd(0.3), 0.3 + Math.random() * 1.4, rnd(0.3))), new THREE.Vector3(0, 0.3, 0), COL.cyan, 0.25, 0.4, { drag: 3 });
  }
  explosion(p, s = 1) {
    for (let i = 0; i < 26 * s; i++) this.glow.emit(p, V.set(rnd(8 * s), Math.random() * 9 * s, rnd(8 * s)), Math.random() < 0.5 ? COL.orange : COL.gold, 0.35 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, { grav: 9, drag: 1.8 });
    for (let i = 0; i < 10 * s; i++) this.solid.emit(p, V.set(rnd(2), 1 + Math.random() * 2, rnd(2)), COL.smoke, 1.2, 1.5, { drag: 1.5, grow: 2 });
  }
  nodeBurst(p) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 8;
      this.glow.emit(p, V.set(Math.cos(a) * s, 2 + Math.random() * 10, Math.sin(a) * s), Math.random() < 0.7 ? COL.cyan : COL.white, 0.25 + Math.random() * 0.3, 1 + Math.random() * 0.8, { grav: 6, drag: 1.2 });
    }
    this.ring(p, 0.2, 16, 1.0, '#7ff6ff');
    this.ring(p, 0.2, 9, 0.7, '#ffffff');
  }
  heal(p) {
    for (let i = 0; i < 26; i++) this.glow.emit(V.copy(p).add(new THREE.Vector3(rnd(0.6), Math.random() * 2, rnd(0.6))), new THREE.Vector3(0, 1.5 + Math.random() * 2, 0), COL.gold, 0.2, 1.0, { drag: 1 });
  }
  ring(p, r0, r1, dur, color, y = 0.15) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(p.x, heightAt(p.x, p.z) + y, p.z);
    m.renderOrder = 6;
    this.scene.add(m);
    this.rings.push({ m, r0, r1, dur, t: 0 });
  }
  telegraph(p, dur, radius) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3a1a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    const disc = new THREE.Mesh(this.discGeo, mat);
    const edge = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a2a').multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const y = heightAt(p.x, p.z) + 0.12;
    disc.position.set(p.x, y, p.z); edge.position.set(p.x, y + 0.01, p.z);
    edge.scale.setScalar(radius);
    disc.renderOrder = edge.renderOrder = 6;
    this.scene.add(disc, edge);
    this.telegraphs.push({ disc, edge, dur, t: 0, radius });
  }
  fireworks(on) { this.fireworksT = on ? 0 : -1; this.fwCenter = on; }

  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const k = r.t / r.dur;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - Math.min(1, k), 3)));
      r.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i]; tg.t += dt;
      const k = Math.min(1, tg.t / tg.dur);
      tg.disc.scale.setScalar(tg.radius * k);
      tg.disc.material.opacity = 0.18 + k * 0.25 + Math.sin(tg.t * 30) * 0.05;
      if (tg.t >= tg.dur + 0.15) { this.scene.remove(tg.disc, tg.edge); tg.disc.material.dispose(); tg.edge.material.dispose(); this.telegraphs.splice(i, 1); }
    }
    if (this.fireworksT >= 0) {
      this.fireworksT -= dt;
      if (this.fireworksT <= 0) {
        this.fireworksT = 0.35 + Math.random() * 0.5;
        const c = this.fwCenter;
        const p = new THREE.Vector3(c.x + rnd(25), c.y + 18 + Math.random() * 14, c.z + rnd(25));
        const col = [COL.cyan, COL.gold, COL.red, COL.white, C('#b48bff').multiplyScalar(4)][Math.floor(Math.random() * 5)];
        for (let i = 0; i < 70; i++) {
          const v = new THREE.Vector3(rnd(1), rnd(1), rnd(1)).normalize().multiplyScalar(7 + Math.random() * 3);
          this.glow.emit(p, v, col, 0.4, 1.3 + Math.random() * 0.6, { grav: 3, drag: 1.4 });
        }
      }
    }
  }
}
