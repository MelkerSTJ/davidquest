import * as THREE from 'three';
import { heightAt } from './world.js';
import { makeTrackTexture } from './textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

const M = (o) => new THREE.MeshStandardMaterial(o);
const shared = {
  fur: M({ color: '#3b3a3e', roughness: 0.95 }),
  belly: M({ color: '#26252a', roughness: 0.95 }),
  white: M({ color: '#ece8e0', roughness: 0.9 }),
  black: M({ color: '#141416', roughness: 0.6 }),
  eye: M({ color: '#120000', emissive: '#ff2a12', emissiveIntensity: 2.5 }),
  helmet: M({ color: '#f2b51c', roughness: 0.45, metalness: 0.1 }),
  lamp: M({ color: '#fff7c9', emissive: '#ffe28a', emissiveIntensity: 3 }),
  wood: M({ color: '#7a5634', roughness: 0.8 }),
  metal: M({ color: '#9aa1aa', roughness: 0.4, metalness: 0.9 }),
};

/** Grävlingen – gräver av fiber i hela riket. Bär bygghjälm. */
export class Badger {
  constructor(scene, x, z, home) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.mats = { fur: shared.fur.clone(), white: shared.white.clone() };
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, cast = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; parent.add(m); return m;
    };
    const b = this.body;
    mesh(new THREE.SphereGeometry(1, 18, 14), this.mats.fur, b, 0, 0.42, -0.05).scale.set(0.42, 0.32, 0.6);
    mesh(new THREE.SphereGeometry(1, 14, 10), shared.belly, b, 0, 0.3, 0).scale.set(0.34, 0.2, 0.48);
    // huvud
    const head = this.head = new THREE.Group(); head.position.set(0, 0.48, 0.5); b.add(head);
    mesh(new THREE.SphereGeometry(1, 18, 14), this.mats.white, head, 0, 0, 0.05).scale.set(0.24, 0.22, 0.3);
    for (const s of [1, -1]) {
      mesh(new THREE.SphereGeometry(1, 12, 10), shared.black, head, s * 0.1, 0.05, 0.06).scale.set(0.07, 0.11, 0.27);
      mesh(new THREE.SphereGeometry(0.036, 8, 6), shared.eye, head, s * 0.1, 0.06, 0.27, false);
      mesh(new THREE.SphereGeometry(0.07, 10, 8), shared.black, head, s * 0.15, 0.17, -0.08);
    }
    mesh(new THREE.SphereGeometry(0.06, 10, 8), shared.black, head, 0, -0.02, 0.36);
    // hjälm
    mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shared.helmet, head, 0, 0.14, -0.02);
    const brim = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.025, 18), shared.helmet, head, 0, 0.14, 0.0);
    brim.scale.z = 1.1;
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), shared.lamp, head, 0, 0.24, 0.17, false).rotation.x = Math.PI / 2 - 0.4;
    // ben
    this.feet = [];
    for (const [x, z] of [[0.22, 0.32], [-0.22, 0.32], [0.24, -0.38], [-0.24, -0.38]]) {
      const f = mesh(new THREE.CapsuleGeometry(0.075, 0.12, 4, 8), shared.black, b, x, 0.12, z);
      this.feet.push(f);
    }
    // spade på ryggen
    const sp = new THREE.Group(); sp.position.set(0.05, 0.75, -0.2); sp.rotation.set(0.9, 0, 0.3); b.add(sp);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), shared.wood, sp, 0, 0, 0);
    mesh(new THREE.BoxGeometry(0.2, 0.26, 0.03), shared.metal, sp, 0, -0.55, 0);

    this.group.scale.setScalar(1.05);
    scene.add(this.group);
    this.scene = scene;
    this.pos = this.group.position;
    this.pos.set(x, heightAt(x, z), z);
    this.home = home || new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * 6.28;
    this.hp = 3;
    this.radius = 0.6;
    this.state = 'emerge';
    this.stateT = 0;
    this.attackCd = 0.6 + Math.random() * 0.6;
    this.knock = new THREE.Vector3();
    this.flash = 0;
    this.alive = true;
    this.t = Math.random() * 10;
    this.wanderTarget = this.home.clone();
    this.lunge = 0;
    this.body.position.y = -0.9;
  }

  damage(n, from) {
    if (!this.alive || this.state === 'emerge') return false;
    this.hp -= n;
    this.flash = 0.18;
    const d = this.pos.clone().sub(from).setY(0).normalize();
    this.knock.copy(d).multiplyScalar(9);
    if (this.hp <= 0) { this.alive = false; this.state = 'dying'; this.stateT = 0; }
    return true;
  }

  update(dt, hero, game) {
    this.t += dt;
    this.stateT += dt;
    const toHero = hero.pos.clone().sub(this.pos).setY(0);
    const dist = toHero.length();
    let speed = 0;

    if (this.state === 'emerge') {
      this.body.position.y = lerp(-0.9, 0, Math.min(1, this.stateT / 0.7));
      if (this.stateT > 0.7) { this.state = 'idle'; this.body.position.y = 0; }
    } else if (this.state === 'dying') {
      const k = Math.min(1, this.stateT / 0.35);
      this.group.scale.setScalar(1.05 * (1 - k * 0.9));
      this.body.rotation.z = k * 2;
      if (this.stateT > 0.35) { this.scene.remove(this.group); this.state = 'gone'; }
      return;
    } else if (this.state === 'gone') return;
    else if (game.frozen) {
      // vänta
    } else {
      const aggro = dist < 17 && hero.deadT < 0;
      if (aggro) {
        const target = Math.atan2(toHero.x, toHero.z);
        this.yaw += angDiff(this.yaw, target) * Math.min(1, dt * 8);
        this.attackCd -= dt;
        if (dist > 1.35) speed = 4.1;
        if (dist < 1.9 && this.attackCd <= 0) {
          this.lunge = 0.25; this.attackCd = 1.25 + Math.random() * 0.4;
          game.badgerBite(this);
        }
      } else {
        if (this.pos.distanceTo(this.wanderTarget) < 1.5 || this.stateT > 4) {
          this.stateT = 0;
          this.wanderTarget.set(this.home.x + (Math.random() - 0.5) * 10, 0, this.home.z + (Math.random() - 0.5) * 10);
        }
        const tw = this.wanderTarget.clone().sub(this.pos).setY(0);
        if (tw.length() > 1) {
          this.yaw += angDiff(this.yaw, Math.atan2(tw.x, tw.z)) * Math.min(1, dt * 4);
          speed = 1.6;
        }
      }
    }
    if (this.lunge > 0) { this.lunge -= dt; speed = 9; }

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.addScaledVector(fwd, speed * dt);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-dt * 8));
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.group.rotation.y = this.yaw;

    // animation
    const run = Math.min(1, speed / 4);
    const ph = this.t * 16;
    this.feet.forEach((f, i) => { f.position.y = 0.12 + Math.max(0, Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0))) * 0.1 * run; });
    if (this.state !== 'emerge') this.body.position.y = Math.abs(Math.sin(ph * 0.5)) * 0.05 * run;
    this.body.rotation.x = this.lunge > 0 ? -0.25 : Math.sin(ph * 0.5) * 0.04 * run;
    this.head.rotation.y = Math.sin(this.t * 3) * 0.15;
    if (this.flash > 0) this.flash -= dt;
    const f = Math.max(0, this.flash) / 0.18;
    this.mats.fur.emissive.setRGB(f * 2, f * 2, f * 2);
    this.mats.white.emissive.setRGB(f * 2, f * 2, f * 2);
  }
}

/** Grävskopan – en mekanisk grävmaskinsdrake som slukar fiberkabel. */
export class Boss {
  constructor(scene, x, z) {
    this.scene = scene;
    this.group = new THREE.Group();
    const yellow = this.yellow = M({ color: '#f0b21e', roughness: 0.45, metalness: 0.35 });
    const dark = M({ color: '#26282d', roughness: 0.7, metalness: 0.5 });
    const steel = M({ color: '#b4bcc6', roughness: 0.25, metalness: 1 });
    const glass = M({ color: '#0d1116', roughness: 0.05, metalness: 0.6 });
    this.eyeMat = M({ color: '#200', emissive: '#ff3010', emissiveIntensity: 4 });
    this.weakMat = M({ color: '#3a0a00', emissive: '#ff7a1a', emissiveIntensity: 0 });
    const tt = makeTrackTexture(); tt.repeat.set(1, 3);
    const trackMat = M({ map: tt, roughness: 0.9 });
    this.trackTex = tt;
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const g = this.group;
    for (const s of [1, -1]) {
      mesh(new THREE.BoxGeometry(1.1, 1.0, 4.6), trackMat, g, s * 1.55, 0.55, 0);
      for (const zz of [-1.9, 1.9]) mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.12, 16), dark, g, s * 1.55, 0.55, zz).rotation.z = Math.PI / 2;
    }
    const upper = this.upper = new THREE.Group(); upper.position.y = 1.2; g.add(upper);
    mesh(new THREE.BoxGeometry(3.4, 1.4, 3.6), yellow, upper, 0, 0.75, -0.3);
    mesh(new THREE.BoxGeometry(3.5, 0.25, 3.7), dark, upper, 0, 0.05, -0.3);
    // hytt
    mesh(new THREE.BoxGeometry(1.6, 1.7, 1.7), yellow, upper, -0.8, 2.25, 0.6);
    mesh(new THREE.BoxGeometry(1.45, 1.1, 0.06), glass, upper, -0.8, 2.4, 1.46);
    for (const s of [1, -1]) {
      const e = mesh(new THREE.SphereGeometry(0.14, 12, 10), this.eyeMat, upper, -0.8 + s * 0.35, 2.45, 1.4);
      e.scale.set(1.3, 0.6, 0.4);
    }
    // horn + avgasrör
    for (const s of [1, -1]) mesh(new THREE.ConeGeometry(0.18, 0.9, 10), dark, upper, -0.8 + s * 0.6, 3.4, 0.5).rotation.z = -s * 0.5;
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 10), dark, upper, 1.2, 2.0, -1.4);
    this.exhaust = new THREE.Vector3(1.2, 2.8, -1.4);
    // motvikt med taggar
    for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.16, 0.6, 8), dark, upper, -1.4 + i * 0.7, 1.7, -2.05).rotation.x = -0.6;
    // bom + sticka + skopa
    const boom = this.boom = new THREE.Group(); boom.position.set(0.7, 1.2, 1.2); upper.add(boom);
    mesh(new THREE.BoxGeometry(0.55, 0.7, 3.4), yellow, boom, 0, 0, 1.6);
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 10), steel, boom, 0, -0.55, 1.0).rotation.x = Math.PI / 2 - 0.15;
    const stick = this.stick = new THREE.Group(); stick.position.set(0, 0, 3.3); boom.add(stick);
    mesh(new THREE.BoxGeometry(0.45, 0.5, 2.6), yellow, stick, 0, 0, 1.2);
    const bucket = this.bucket = new THREE.Group(); bucket.position.set(0, 0, 2.5); stick.add(bucket);
    mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), dark, bucket, 0, -0.35, 0.3);
    mesh(new THREE.BoxGeometry(1.2, 0.6, 0.6), this.weakMat, bucket, 0, -0.3, 0.1);
    for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.1, 0.4, 6), steel, bucket, -0.56 + i * 0.28, -0.95, 0.65).rotation.x = Math.PI;

    g.scale.setScalar(1.15);
    scene.add(g);
    this.pos = g.position;
    this.pos.set(x, heightAt(x, z) - 4, z);
    this.home = new THREE.Vector3(x, 0, z);
    this.yaw = Math.PI;
    this.maxHp = 40;
    this.hp = this.maxHp;
    this.radius = 2.7;
    this.state = 'rise';
    this.stateT = 0;
    this.slamCd = 2.5;
    this.slamTarget = new THREE.Vector3();
    this.alive = true;
    this.flash = 0;
    this.spawnedAdds = false;
    this.t = 0;
    this.boomRest = -0.35; this.stickRest = 1.1; this.bucketRest = 0.6;
    this.boom.rotation.x = this.boomRest; this.stick.rotation.x = this.stickRest; this.bucket.rotation.x = this.bucketRest;
  }

  get stuck() { return this.state === 'stuck'; }

  damage(n, from) {
    if (!this.alive || this.state === 'rise') return false;
    const dmg = this.stuck ? n * 2 : n;
    this.hp -= dmg;
    this.flash = 0.15;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.state = 'dying'; this.stateT = 0; }
    return dmg;
  }

  bucketWorld() { return this.bucket.localToWorld(new THREE.Vector3(0, -0.8, 0.5)); }

  update(dt, hero, game) {
    this.t += dt;
    this.stateT += dt;
    const ground = heightAt(this.pos.x, this.pos.z);
    const toHero = hero.pos.clone().sub(this.pos).setY(0);
    const dist = toHero.length();
    const phase2 = this.hp < this.maxHp * 0.5;
    let move = 0;

    if (this.state === 'rise') {
      this.pos.y = lerp(ground - 4, ground, Math.min(1, this.stateT / 2.2));
      this.group.rotation.z = Math.sin(this.t * 30) * 0.03 * (1 - Math.min(1, this.stateT / 2.2));
      if (this.stateT > 2.4) { this.state = 'chase'; this.stateT = 0; this.group.rotation.z = 0; }
    } else if (this.state === 'dying') {
      const k = Math.min(1, this.stateT / 2.0);
      this.group.rotation.z = k * 0.6;
      this.pos.y = ground - k * 1.5;
      this.boom.rotation.x = lerp(this.boom.rotation.x, 0.6, dt * 3);
      this.eyeMat.emissiveIntensity = Math.max(0, 4 * (1 - k * 1.5));
      if (this.stateT > 0.2 && Math.random() < dt * 14) game.fx.explosion(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4)), 0.6);
      if (this.stateT > 2.6) { this.state = 'gone'; this.scene.remove(this.group); }
      return;
    } else if (this.state === 'gone') return;
    else if (!game.frozen) {
      const target = Math.atan2(toHero.x, toHero.z);
      if (this.state === 'chase') {
        this.yaw += angDiff(this.yaw, target) * Math.min(1, dt * 1.6);
        if (dist > 6.5) move = phase2 ? 3.4 : 2.6;
        this.slamCd -= dt;
        this.boom.rotation.x = lerp(this.boom.rotation.x, this.boomRest + Math.sin(this.t * 2) * 0.05, dt * 4);
        this.stick.rotation.x = lerp(this.stick.rotation.x, this.stickRest, dt * 4);
        this.bucket.rotation.x = lerp(this.bucket.rotation.x, this.bucketRest, dt * 4);
        if (this.slamCd <= 0 && dist < 16 && hero.deadT < 0) {
          this.state = 'raise'; this.stateT = 0;
          // sikta där riddaren står (lite framför)
          this.slamTarget.copy(hero.pos).addScaledVector(hero.vel, 0.25);
          game.telegraph(this.slamTarget, phase2 ? 0.75 : 1.0);
        }
      } else if (this.state === 'raise') {
        const T = phase2 ? 0.75 : 1.0;
        const st = this.slamTarget.clone().sub(this.pos).setY(0);
        this.yaw += angDiff(this.yaw, Math.atan2(st.x, st.z)) * Math.min(1, dt * 6);
        const k = Math.min(1, this.stateT / T);
        this.boom.rotation.x = lerp(this.boomRest, -1.05, k);
        this.stick.rotation.x = lerp(this.stickRest, 0.3, k);
        this.bucket.rotation.x = lerp(this.bucketRest, -0.3, k);
        // flytta närmare om målet är långt bort
        const sd = st.length();
        if (sd > 8.5) move = 5;
        if (this.stateT >= T) { this.state = 'slam'; this.stateT = 0; }
      } else if (this.state === 'slam') {
        const k = Math.min(1, this.stateT / 0.14);
        this.boom.rotation.x = lerp(-1.05, 0.12, k);
        this.stick.rotation.x = lerp(0.3, 0.75, k);
        this.bucket.rotation.x = lerp(-0.3, 1.0, k);
        if (this.stateT >= 0.14) { this.state = 'stuck'; this.stateT = 0; game.slam(this.slamTarget.clone(), this); }
      } else if (this.state === 'stuck') {
        this.weakMat.emissiveIntensity = 2.5 + Math.sin(this.t * 20) * 1.5;
        this.group.rotation.z = Math.sin(this.t * 40) * 0.01;
        if (this.stateT > (phase2 ? 1.25 : 1.6)) { this.state = 'chase'; this.stateT = 0; this.slamCd = phase2 ? 1.9 : 2.8; this.weakMat.emissiveIntensity = 0; this.group.rotation.z = 0; }
      }
      if (phase2 && !this.spawnedAdds) { this.spawnedAdds = true; game.spawnAdds(this); }
    }

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.addScaledVector(fwd, move * dt);
    // stanna i arenan
    const fromHome = this.pos.clone().sub(this.home).setY(0);
    if (fromHome.length() > 17) this.pos.sub(fromHome.setLength(fromHome.length() - 17));
    if (this.state !== 'rise') this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.trackTex.offset.y -= move * dt * 0.25;
    this.upper.rotation.y = Math.sin(this.t * 1.3) * 0.04;
    if (this.flash > 0) this.flash -= dt;
    const f = Math.max(0, this.flash) / 0.15;
    this.yellow.emissive.setRGB(f * 1.5, f * 1.2, f * 1.0);
    if (Math.random() < dt * 10) game.fx.smoke(this.upper.localToWorld(this.exhaust.clone()));
    this.group.updateMatrixWorld(true);
  }
}
