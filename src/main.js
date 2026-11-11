import './style.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/cinzel-decorative/latin-900.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import faceUrl from './face.webp';
import portraitUrl from './portrait.jpg';
import { buildWorld, heightAt, SPAWN, NODE_DEFS, CENTER, WORLD_RADIUS } from './world.js';
import { Hero } from './hero.js';
import { Badger, Boss } from './enemies.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { runSplice } from './splice.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const params = new URLSearchParams(location.search);
const TS = +(params.get('ts') || 1);
const low = isTouch || (navigator.hardwareConcurrency || 8) <= 4 || params.has('low');
const Q = low
  ? { dpr: Math.min(devicePixelRatio, 1.5), shadow: 1024, terrainSeg: 170, trees: 520, rocks: 90, grass: 6500, flowers: 450, motes: 160, samples: 2 }
  : { dpr: Math.min(devicePixelRatio, 2), shadow: 2048, terrainSeg: 240, trees: 950, rocks: 160, grass: 18000, flowers: 1000, motes: 320, samples: 4 };

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 2500);

const rt = new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: Q.samples });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 2.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const audio = new Audio();
const input = new Input(canvas);
let world, hero, fx;

// ---------------------------------------------------------------- spelets tillstånd
const game = {
  state: 'loading',
  frozen: true,
  fixed: 0,
  kills: 0,
  startTime: 0,
  endTime: 0,
  enemies: [],
  boss: null,
  bossSpawned: false,
  cut: null,
  shake: 0,
  regenT: 0,
  lastWarn: 0,
  deadT: 0,
  fx: null,
  badgerBite(b) {
    if (hero.deadT >= 0 || hero.invuln > 0 || this.frozen) return;
    if (b.pos.distanceTo(hero.pos) > 2.1) return;
    damageHero(1, b.pos);
  },
  telegraph(p, dur) { fx.telegraph(p, dur, 3.6); audio.telegraph(); },
  slam(p) {
    fx.ring(p, 0.5, 9, 0.6, '#ffb15a');
    fx.dirt(p.clone().setY(heightAt(p.x, p.z) + 0.2), 40);
    audio.slam();
    this.shake = 0.9;
    if (hero.deadT < 0 && hero.invuln <= 0 && hero.pos.distanceTo(p) < 3.7) damageHero(3, p, 14);
  },
  spawnAdds(boss) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random();
      spawnBadger(boss.home.x + Math.cos(a) * 9, boss.home.z + Math.sin(a) * 9, boss.home);
    }
    toast('Grävskopan kallar på förstärkning!', 'Grävlingar väller upp ur marken', 'warn');
  },
};

// ---------------------------------------------------------------- kamera
const cam = { yaw: Math.PI, pitch: 0.3, dist: 7.2, mode: 'title', modeT: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), orbit: 0 };
function setCamMode(m) { if (cam.mode !== m) { cam.mode = m; cam.modeT = 0; } }

function updateCamera(dt, t) {
  cam.modeT += dt;
  const hp = hero.pos;
  let look, pos;
  if (cam.mode === 'follow') {
    look = new THREE.Vector3(hp.x, hp.y + 1.65, hp.z);
    const d = cam.dist, p = cam.pitch;
    pos = look.clone().add(new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(p) * d, Math.sin(p) * d, Math.cos(cam.yaw) * Math.cos(p) * d));
  } else if (cam.mode === 'selfie' || cam.mode === 'cutscene') {
    const portrait = innerHeight > innerWidth;
    look = new THREE.Vector3(hp.x, hp.y + (portrait ? 1.6 : 1.7), hp.z);
    const y = hero.yaw + Math.sin(t * 0.6) * 0.18 + (cam.mode === 'cutscene' ? 0.35 : 0);
    const d = portrait ? 4.4 : 3.3;
    pos = look.clone().add(new THREE.Vector3(Math.sin(y) * d, 0.25, Math.cos(y) * d));
  } else if (cam.mode === 'title') {
    const portrait = innerHeight > innerWidth;
    look = new THREE.Vector3(hp.x, hp.y + (portrait ? 1.35 : 1.45), hp.z);
    const y = hero.yaw + 0.25 + Math.sin(t * 0.22) * 0.5;
    const d = portrait ? 6.0 : 4.6;
    pos = look.clone().add(new THREE.Vector3(Math.sin(y) * d, 0.35 + Math.sin(t * 0.3) * 0.15, Math.cos(y) * d));
  } else if (cam.mode === 'face') {
    look = new THREE.Vector3(hp.x, hp.y + 1.82, hp.z);
    const y = hero.yaw + (cam.faceYaw || 0);
    pos = look.clone().add(new THREE.Vector3(Math.sin(y) * 1.5, 0.05, Math.cos(y) * 1.5));
  } else if (cam.mode === 'victory') {
    cam.orbit += dt * 0.18;
    look = new THREE.Vector3(hp.x, hp.y + 1.5, hp.z);
    const y = hero.yaw + Math.sin(cam.orbit) * 0.9;
    const d = innerHeight > innerWidth ? 6.5 : 5;
    pos = look.clone().add(new THREE.Vector3(Math.sin(y) * d, 0.6, Math.cos(y) * d));
  }
  const gy = heightAt(pos.x, pos.z) + 0.6;
  if (pos.y < gy) pos.y = gy;
  const k = cam.mode === 'face' ? 1 : cam.mode === 'follow' && cam.modeT > 0.8 ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 3.2);
  if (cam.pos.lengthSq() === 0) { cam.pos.copy(pos); cam.look.copy(look); }
  cam.pos.lerp(pos, k);
  cam.look.lerp(look, cam.mode === 'follow' ? 1 - Math.exp(-dt * 18) : k);
  camera.position.copy(cam.pos);
  if (game.shake > 0) {
    camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(game.shake * 0.35));
    game.shake = Math.max(0, game.shake - dt * 2.5);
  }
  camera.lookAt(cam.look);
}

// ---------------------------------------------------------------- HUD
const heartSVG = (fill) => `<svg viewBox="0 0 24 22"><defs><clipPath id="hc${fill}"><rect x="0" y="0" width="${fill * 24}" height="22"/></clipPath></defs>
  <path d="M12 21 C 5 15 1 11 1 6.5 A5.5 5.5 0 0 1 12 4 A5.5 5.5 0 0 1 23 6.5 C 23 11 19 15 12 21Z" fill="#2a0d10" stroke="#e9c46a" stroke-width="1.6"/>
  <path clip-path="url(#hc${fill})" d="M12 21 C 5 15 1 11 1 6.5 A5.5 5.5 0 0 1 12 4 A5.5 5.5 0 0 1 23 6.5 C 23 11 19 15 12 21Z" fill="#ff3d4f"/>
  <path clip-path="url(#hc${fill})" d="M6 5.5 A3 3 0 0 1 10 6" stroke="#ffd0d6" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
let lastHp = -1;
function renderHearts() {
  if (hero.hp === lastHp) return;
  lastHp = hero.hp;
  let h = '';
  for (let i = 0; i < hero.maxHp / 2; i++) {
    const v = clamp(hero.hp - i * 2, 0, 2) / 2;
    h += `<div class="heart">${heartSVG(v)}</div>`;
  }
  $('hearts').innerHTML = h;
}
function toast(main, sub = '', cls = '') {
  const el = document.createElement('div');
  el.className = 'toast-item ' + cls;
  el.innerHTML = main + (sub ? `<span class="sub">${sub}</span>` : '');
  const box = $('toast');
  box.innerHTML = '';
  box.appendChild(el);
}
function updateObjective() {
  const n = game.fixed;
  $('objective').innerHTML = n >= 4 ? '<span class="ok">Hela riket är online!</span>' : `Noder online: <span class="ok">${n}</span> / 4`;
}
function targetNode() {
  let best = null, bd = 1e9;
  for (const nd of world.nodes) {
    if (nd.fixed) continue;
    if (nd.def.boss && game.fixed < 3) continue;
    const d = nd.pos.distanceTo(hero.pos);
    if (d < bd) { bd = d; best = nd; }
  }
  return best;
}
function updateCompass() {
  const nd = targetNode();
  const el = $('compass');
  if (!nd) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible';
  const dir = nd.pos.clone().sub(hero.pos).setY(0);
  const d = dir.length();
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const a = Math.atan2(dir.dot(right), dir.dot(fwd));
  $('compass-arrow').style.transform = `rotate(${a - Math.PI / 2}rad)`;
  $('compass-text').textContent = `${nd.def.name} · ${Math.round(d)} m`;
}

// ---------------------------------------------------------------- strid
function damageHero(n, from, knock = 7) {
  hero.hp = Math.max(0, hero.hp - n);
  hero.hurt();
  hero.invuln = 0.7;
  audio.hurt();
  game.shake = Math.max(game.shake, 0.35 + n * 0.12);
  game.regenT = 0;
  const p = $('portrait-img').parentElement;
  p.classList.remove('hurt'); void p.offsetWidth; p.classList.add('hurt');
  const kb = hero.pos.clone().sub(from).setY(0);
  if (kb.lengthSq() > 0.0001) hero.vel.add(kb.normalize().multiplyScalar(knock));
  if (hero.hp <= 0) {
    hero.die();
    game.deadT = 0;
    setCamMode('follow');
  }
}

function spawnBadger(x, z, home) {
  const b = new Badger(scene, x, z, home ? home.clone() : null);
  fx.dirt(new THREE.Vector3(x, heightAt(x, z) + 0.2, z), 26);
  game.enemies.push(b);
  return b;
}

function heroAttack() {
  if (!hero.attack()) return;
  audio.swing();
}

function resolveHits() {
  if (!hero.strikeNow) return;
  hero.hitDone = true;
  const f = hero.forward();
  let hitAny = false;
  for (const e of game.enemies) {
    if (!e.alive || e.state === 'emerge') continue;
    const d = e.pos.clone().sub(hero.pos).setY(0);
    const dist = d.length();
    if (dist > 2.9) continue;
    if (dist > 0.6 && d.normalize().dot(f) < 0.15) continue;
    e.damage(1, hero.pos);
    hitAny = true;
    fx.hit(e.pos.clone().setY(e.pos.y + 0.55));
    if (!e.alive) {
      game.kills++;
      fx.poof(e.pos.clone().setY(e.pos.y + 0.3));
      audio.enemyDie();
    }
  }
  const b = game.boss;
  if (b && b.alive && b.state !== 'rise') {
    const d = b.pos.clone().sub(hero.pos).setY(0);
    const dist = d.length();
    const bucket = b.bucketWorld();
    const nearBucket = b.stuck && bucket.distanceTo(hero.pos) < 3.4;
    if (nearBucket || (dist < b.radius + 2.4 && d.normalize().dot(f) > 0.1)) {
      const dmg = b.damage(1, hero.pos);
      hitAny = true;
      const p = nearBucket ? bucket : hero.pos.clone().addScaledVector(f, 1.6).setY(hero.pos.y + 1.2);
      fx.hit(p);
      if (dmg > 1) { fx.sparks(p, 20, new THREE.Color('#ffa53a').multiplyScalar(4.5), 8); }
      audio.clang();
      game.shake = Math.max(game.shake, 0.18);
      if (!b.alive) bossDefeated();
    }
  }
  if (hitAny) audio.hit();
}

function bossDefeated() {
  audio.explode();
  game.shake = 1.2;
  fx.explosion(game.boss.pos.clone().setY(game.boss.pos.y + 2), 2);
  $('bossbar').classList.add('hidden');
  game.kills++;
  setTimeout(() => toast('Grävskopan är besegrad!', 'Skarva Bergsnoden och för hem ljuset'), 900);
}

// ---------------------------------------------------------------- noder
function nodeBlocked(nd) {
  const near = game.enemies.some((e) => e.alive && e.pos.distanceTo(nd.pos) < 26);
  if (near) return 'Besegra grävlingarna först!';
  if (nd.def.boss) {
    if (game.fixed < 3) return 'Laga de andra noderna först';
    if (!game.bossSpawned || (game.boss && game.boss.alive)) return 'Grävskopan vaktar noden!';
  }
  return null;
}

async function startSplice(nd) {
  game.state = 'splice';
  game.frozen = true;
  $('prompt').classList.add('hidden');
  $('t-interact').classList.add('hidden');
  const ok = await runSplice({ nodeName: nd.def.name, count: nd.def.fibers, time: nd.def.time, audio });
  if (ok) nodeFixed(nd);
  else { game.state = 'play'; game.frozen = false; }
}

function nodeFixed(nd) {
  nd.fixed = true;
  nd.interactable = false;
  game.fixed++;
  game.state = 'cutscene';
  game.frozen = true;
  hero.hp = hero.maxHp;
  hero.yaw = Math.atan2(nd.pos.x - hero.pos.x, nd.pos.z - hero.pos.z) + Math.PI;
  setCamMode('cutscene');
  hero.cheer();
  audio.online();
  game.cut = { nd, t: 0, activated: false };
}

function activateNode(nd) {
  nd.crystalMat.color.set('#c8fbff');
  nd.crystalMat.emissive.set('#3fe7ff');
  nd.crystalMat.emissiveIntensity = 5.5;
  nd.runeMat.emissive.set('#3fe7ff');
  nd.runeMat.emissiveIntensity = 5;
  nd.beamMat.uniforms.uColor.value.set('#59f3ff');
  nd.beamMat.uniforms.uOpacity.value = 0.65;
  nd.cable.mat.uniforms.uBroken.value = 0;
  fx.nodeBurst(nd.pos.clone().setY(nd.pos.y + 3.3));
  fx.heal(hero.pos);
  game.shake = 0.4;
  toast(`${nd.def.name} är online!`, `${nd.def.homes} hushåll anslutna · 1 Gbit/s`);
  updateObjective();
}

function updateCutscene(dt) {
  const c = game.cut;
  c.t += dt;
  const u = c.nd.cable.mat.uniforms;
  u.uLit.value = Math.min(1, Math.pow(c.t / 1.7, 1.15));
  if (c.t > 1.7 && !c.activated) { c.activated = true; activateNode(c.nd); }
  if (c.activated) {
    const wm = c.nd.windowMat;
    wm.emissiveIntensity = Math.min(3.6, wm.emissiveIntensity + dt * 4);
    u.uFlash.value = Math.max(0, 1 - (c.t - 1.7) * 1.5);
  }
  if (c.t > 4.2) {
    game.cut = null;
    if (game.fixed >= 4) return startVictory();
    game.state = 'play';
    game.frozen = false;
    setCamMode('follow');
    cam.yaw = hero.yaw + Math.PI;
    if (game.fixed === 3) {
      setTimeout(() => toast('Marken skakar vid Bergsnoden…', 'Den mörka barriären har fallit', 'warn'), 400);
      game.shake = 0.8;
    }
  }
}

// ---------------------------------------------------------------- spärren runt Bergsnoden
let barrier;
function makeBarrier() {
  const nd = world.nodes[3];
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: world.time, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vP = position; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime, uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float hex = abs(sin(vP.x*1.3 + uTime*0.6)*sin(vP.y*1.3 - uTime*0.8)*sin(vP.z*1.3));
        float lines = smoothstep(0.92, 1.0, hex);
        float band = 0.5 + 0.5*sin(vP.y*0.8 - uTime*2.0);
        vec3 c = mix(vec3(0.5,0.05,0.9), vec3(1.0,0.2,0.3), band) * (f*1.6 + lines*0.8 + 0.06);
        gl_FragColor = vec4(c*uOpacity, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  barrier = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  barrier.position.copy(nd.pos).setY(nd.pos.y - 1.5);
  scene.add(barrier);
}

// ---------------------------------------------------------------- titel, intro, seger
function startVictory() {
  game.state = 'victory';
  game.frozen = true;
  game.endTime = performance.now();
  setCamMode('victory');
  fx.fireworks(hero.pos.clone());
  audio.victory();
  hero.cheer();
  $('hud').classList.add('hidden');
  const secs = Math.round((game.endTime - game.startTime) / 1000);
  const homes = NODE_DEFS.reduce((s, n) => s + n.homes, 0);
  $('stats').innerHTML = `
    <div class="stat"><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>Tid</span></div>
    <div class="stat"><b>${game.kills}</b><span>Grävlingar besegrade</span></div>
    <div class="stat"><b>${homes}</b><span>Hushåll anslutna</span></div>
    <div class="stat"><b>${NODE_DEFS.reduce((s, n) => s + n.fibers, 0)}</b><span>Fibrer skarvade</span></div>`;
  $('victory').classList.remove('hidden');
  setInterval(() => { if (game.state === 'victory') hero.cheer(); }, 3200);
}

function showDialog(title, body, btn = 'OK') {
  return new Promise((res) => {
    $('dialog-title').textContent = title;
    $('dialog-body').innerHTML = body;
    $('dialog-btn').textContent = btn;
    $('dialog').classList.remove('hidden');
    $('dialog-btn').onclick = () => { audio.ui(); $('dialog').classList.add('hidden'); res(); };
  });
}

async function startGame() {
  audio.init();
  audio.ui();
  $('title').classList.add('hidden');
  game.state = 'intro';
  hero.yaw = 0;
  setCamMode('follow');
  cam.yaw = Math.PI;
  const controls = isTouch
    ? `<div class="ctl"><span>🕹️</span><span>Vänster tumme: gå</span><span>👆</span><span>Dra höger sida: kamera</span><span>⚔️</span><span>Hugg · 💨 rusa · 🔧 laga</span><span>🤳</span><span>Selfie-kamera – visa ansiktet!</span></div>`
    : `<div class="ctl"><kbd>WASD</kbd><span>Gå</span><kbd>Dra med musen</kbd><span>Kamera (scrolla för zoom)</span><kbd>Klick / Space</kbd><span>Hugg med Fiberklingan</span><kbd>Shift</kbd><span>Rusa (undvik attacker)</span><kbd>E</kbd><span>Skarva fibern vid en nod</span><kbd>C</kbd><span>Selfie-kamera</span></div>`;
  await showDialog('Riket har tappat uppkopplingen!',
    `Sir David! <b>Grävlingarna</b> har grävt av fibern till rikets fyra noder. Byarna är mörka och ingen kan streama något alls.<br><br>
     Följ de <b>röda ljuspelarna</b>, besegra grävlingarna med <b>Fiberklingan</b> och <b>skarva fibern</b> enligt färgkoden. ${controls}`,
    'Till handling!');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch-ui').classList.remove('hidden');
  else $('keys-hint').textContent = 'WASD gå · dra kamera · klick hugg · Shift rusa · E laga · C selfie';
  game.state = 'play';
  game.frozen = false;
  game.startTime = performance.now();
  updateObjective();
  renderHearts();
  toast('Följ de röda ljuspelarna', 'Där har fibern grävts av');
}

// ---------------------------------------------------------------- uppdatering
const tmpV = new THREE.Vector3();
let sparkT = 0;
function updatePlay(dt, t, inp) {
  // kamera
  cam.yaw -= inp.look.x * 0.0055;
  cam.pitch = clamp(cam.pitch + inp.look.y * 0.004, -0.05, 1.15);
  cam.dist = clamp(cam.dist + inp.zoom * 0.7, 3.5, 13);

  const p = inp.pressed;
  if (p.has('mute')) toggleMute();
  if (p.has('selfie')) toggleSelfie();

  if (hero.deadT >= 0) {
    hero.vel.multiplyScalar(Math.exp(-dt * 6));
    game.deadT += dt;
    if (game.deadT > 1.6 && $('dead').classList.contains('hidden')) { $('dead').classList.remove('hidden'); game.frozen = true; }
    return;
  }

  const mvLen = Math.hypot(inp.move.x, inp.move.y);
  if (cam.mode === 'selfie' && (mvLen > 0.1 || p.has('attack') || p.has('dash'))) toggleSelfie(false);
  if (p.has('attack')) heroAttack();
  if (p.has('dash') && hero.dash()) audio.dash();

  const fwd = tmpV.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const mx = Math.cos(cam.yaw) * inp.move.x + fwd.x * inp.move.y;
  const mz = -Math.sin(cam.yaw) * inp.move.x + fwd.z * inp.move.y;
  let speed = 6.8 * (hero.attacking ? 0.35 : 1);
  const want = new THREE.Vector3(mx, 0, mz).multiplyScalar(speed);
  if (mvLen > 0.08) hero.yaw += angDiff(hero.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 14);
  if (hero.dashT >= 0) {
    want.copy(hero.forward()).multiplyScalar(18);
    fx.dashTrail(hero.pos);
  }
  hero.vel.lerp(want, 1 - Math.exp(-dt * (hero.dashT >= 0 ? 30 : 12)));
  hero.pos.addScaledVector(hero.vel, dt);

  // kollisioner
  for (const c of world.colliders) {
    const dx = hero.pos.x - c.x, dz = hero.pos.z - c.z;
    const r = c.r + 0.45;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); hero.pos.x = c.x + dx / d * r; hero.pos.z = c.z + dz / d * r; }
  }
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const dx = hero.pos.x - e.pos.x, dz = hero.pos.z - e.pos.z, r = e.radius + 0.4;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); hero.pos.x = e.pos.x + dx / d * r; hero.pos.z = e.pos.z + dz / d * r; }
  }
  const b = game.boss;
  if (b && b.alive) {
    const dx = hero.pos.x - b.pos.x, dz = hero.pos.z - b.pos.z, r = b.radius + 0.5;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); hero.pos.x = b.pos.x + dx / d * r; hero.pos.z = b.pos.z + dz / d * r; }
  }
  // världens kant
  const fc = hero.pos.clone().sub(new THREE.Vector3(CENTER.x, 0, CENTER.z)).setY(0);
  if (fc.length() > WORLD_RADIUS) { fc.setLength(WORLD_RADIUS); hero.pos.x = CENTER.x + fc.x; hero.pos.z = CENTER.z + fc.z; }
  // spärren
  const bn = world.nodes[3];
  if (barrier && barrier.visible && game.fixed < 3) {
    const d = hero.pos.clone().sub(bn.pos).setY(0);
    if (d.length() < 21) {
      d.setLength(21); hero.pos.x = bn.pos.x + d.x; hero.pos.z = bn.pos.z + d.z;
      if (t - game.lastWarn > 4) { game.lastWarn = t; toast('En mörk kraft skyddar Bergsnoden', 'Laga de tre andra noderna först', 'warn'); }
    }
  }
  hero.pos.y = heightAt(hero.pos.x, hero.pos.z);

  // spawna fiender vid noder
  for (const nd of world.nodes) {
    const d = nd.pos.distanceTo(hero.pos);
    if (!nd.spawned && !nd.def.boss && d < 34) {
      nd.spawned = true;
      for (let i = 0; i < nd.def.enemies; i++) {
        const a = (i / nd.def.enemies) * Math.PI * 2 + Math.random() * 0.5;
        const r = 5 + Math.random() * 4;
        spawnBadger(nd.pos.x + Math.cos(a) * r, nd.pos.z + Math.sin(a) * r, nd.pos);
      }
      toast('Grävlingar!', `De har grävt av fibern vid ${nd.def.name}`, 'warn');
    }
    if (nd.def.boss && !game.bossSpawned && game.fixed >= 3 && d < 26) {
      game.bossSpawned = true;
      game.boss = new Boss(scene, nd.pos.x + 3, nd.pos.z + 6);
      game.shake = 1.5;
      audio.bossRoar();
      fx.dirt(new THREE.Vector3(nd.pos.x + 3, nd.pos.y + 0.5, nd.pos.z + 6), 80);
      $('bossbar').classList.remove('hidden');
      toast('GRÄVSKOPAN', 'Undvik skopan – hugg när den sitter fast!', 'warn');
    }
  }

  // interaktion
  let near = null;
  for (const nd of world.nodes) { nd.interactable = false; if (!nd.fixed && nd.pos.distanceTo(hero.pos) < 4) near = nd; }
  const pr = $('prompt');
  if (near) {
    const block = nodeBlocked(near);
    if (block) {
      pr.innerHTML = '⚠️ ' + block; pr.classList.remove('hidden');
      $('t-interact').classList.add('hidden');
    } else {
      near.interactable = true;
      pr.innerHTML = isTouch ? '🔧 Tryck <b>Laga</b> för att skarva' : '<kbd>E</kbd>Skarva fibern';
      pr.classList.remove('hidden');
      if (isTouch) $('t-interact').classList.remove('hidden');
      if (p.has('interact')) startSplice(near);
    }
  } else {
    pr.classList.add('hidden');
    $('t-interact').classList.add('hidden');
  }

  // återhämtning
  const danger = game.enemies.some((e) => e.alive && e.pos.distanceTo(hero.pos) < 18) || (game.boss && game.boss.alive && game.boss.pos.distanceTo(hero.pos) < 25);
  game.regenT = danger ? 0 : game.regenT + dt;
  if (game.regenT > 3.5 && hero.hp < hero.maxHp) { hero.hp++; game.regenT = 2.2; fx.heal(hero.pos); audio.heal(); }

  // gnistor vid avgrävda kablar
  sparkT -= dt;
  if (sparkT <= 0) {
    sparkT = 0.25;
    for (const nd of world.nodes) if (!nd.fixed && nd.pos.distanceTo(hero.pos) < 70) {
      const m = nd.mound.getWorldPosition(new THREE.Vector3());
      fx.sparks(m.setY(m.y + 0.6), 5, new THREE.Color('#ff7a2a').multiplyScalar(4.5), 4);
    }
  }
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
}
function toggleSelfie(force) {
  if (game.state !== 'play' || hero.deadT >= 0) return;
  const on = force === undefined ? cam.mode !== 'selfie' : force;
  setCamMode(on ? 'selfie' : 'follow');
  if (!on) cam.yaw = hero.yaw + Math.PI;
  $('btn-selfie').classList.toggle('active', on);
}

let lastNow = performance.now();
let elapsed = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastNow) / 1000) * TS;
  lastNow = now;
  elapsed += dt;
  const t = elapsed;
  const inp = input.frame();

  if (game.state === 'play') updatePlay(dt, t, inp);
  else if (game.state === 'cutscene') updateCutscene(dt);
  if (game.state === 'title' && inp.pressed.has('interact')) startGame();

  // hjälten
  const sp = hero.vel.length() / 6.8;
  hero.selfieWave = cam.mode === 'selfie' ? Math.min(1, cam.modeT * 2) : 0;
  hero.update(dt, game.state === 'play' ? sp : 0);
  if (game.state === 'play') resolveHits();

  // fiender
  for (const e of game.enemies) e.update(dt, hero, game);
  game.enemies = game.enemies.filter((e) => e.state !== 'gone');
  if (game.boss) {
    game.boss.update(dt, hero, game);
    $('boss-fill').style.width = (game.boss.hp / game.boss.maxHp) * 100 + '%';
  }

  // spärr
  if (barrier) {
    const u = barrier.material.uniforms.uOpacity;
    if (game.fixed >= 3) { u.value = Math.max(0, u.value - dt * 0.6); if (u.value <= 0) barrier.visible = false; }
  }

  world.update(dt, t, hero.pos);
  fx.update(dt);
  updateCamera(dt, t);
  if (game.state === 'play' || game.state === 'cutscene') { renderHearts(); updateCompass(); }
  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  if (fx) { fx.glow.material.uniforms.uScale.value = innerHeight / 2; fx.solid.material.uniforms.uScale.value = innerHeight / 2; }
});

// ---------------------------------------------------------------- start
async function boot() {
  const setLoad = (p, txt) => { $('load-fill').style.width = p + '%'; $('load-text').textContent = txt; };
  setLoad(10, 'Smider rustningen…');
  await nextFrame();
  const faceTex = await new THREE.TextureLoader().loadAsync(faceUrl);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  $('portrait-img').src = portraitUrl;
  setLoad(30, 'Gräver fram landskapet…');
  await nextFrame();
  world = buildWorld(scene, renderer, Q);
  setLoad(70, 'Drar fiber till byarna…');
  await nextFrame();
  fx = new FX(scene);
  game.fx = fx;
  hero = new Hero(faceTex, world.emblemTex);
  hero.addTo(scene);
  hero.pos.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
  hero.yaw = 0;
  makeBarrier();
  // några kringströvande grävlingar längs vägarna
  for (const [x, z] of [[-24, -22], [26, -14], [-10, 24], [14, 36], [-40, 34], [44, 44]]) spawnBadger(x, z, new THREE.Vector3(x, 0, z));
  setLoad(90, 'Tänder ljuset i Huvudcentralen…');
  await nextFrame();
  renderer.compile(scene, camera);
  setLoad(100, 'Klart!');
  await nextFrame();
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  $('title-hint').textContent = isTouch ? 'Spela med ljudet på 🔊 · bäst i liggande läge' : 'Tryck E eller på knappen · ljud på 🔊';
  game.state = 'title';
  loop();
}

$('btn-start').addEventListener('click', startGame);
$('btn-respawn').addEventListener('click', () => {
  $('dead').classList.add('hidden');
  hero.revive();
  hero.pos.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
  hero.vel.set(0, 0, 0);
  hero.yaw = 0; cam.yaw = Math.PI;
  game.deadT = 0;
  game.frozen = false;
  if (game.boss && game.boss.alive) { game.boss.pos.copy(game.boss.home); game.boss.state = 'chase'; game.boss.stateT = 0; }
  fx.heal(hero.pos);
  audio.heal();
  lastHp = -1;
});
$('btn-again').addEventListener('click', () => location.reload());
$('btn-mute').addEventListener('click', toggleMute);
$('btn-selfie').addEventListener('click', () => toggleSelfie());
$('btn-selfie').addEventListener('touchstart', (e) => { e.preventDefault(); toggleSelfie(); }, { passive: false });
$('btn-mute').addEventListener('touchstart', (e) => { e.preventDefault(); toggleMute(); }, { passive: false });

// debug-krokar för automatiska tester (?debug)
if (params.has('debug') || navigator.webdriver) window.__dq = { activate(i) { const nd = world.nodes[i]; nd.fixed = true; game.fixed++; nd.cable.mat.uniforms.uLit.value = 1; nd.windowMat.emissiveIntensity = 3.6; activateNode(nd); }, game, get hero() { return hero; }, get world() { return world; }, cam, startGame, startSplice, nodeFixed, setCamMode, toggleSelfie, spawnBadger };

boot().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'Kunde inte starta: ' + e.message;
});
