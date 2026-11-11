import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sir Davids vapen: guld-D av ljusande fiber på kungsblått. */
export function makeEmblemTexture() {
  const [c, g] = canvas(512, 640);
  const grd = g.createLinearGradient(0, 0, 0, 640);
  grd.addColorStop(0, '#2457c4');
  grd.addColorStop(1, '#122c6e');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 640);
  // diagonal damask
  g.globalAlpha = 0.08; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  for (let i = -640; i < 640; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 640, 640); g.stroke(); }
  g.globalAlpha = 1;
  // guldkant
  g.strokeStyle = '#e9c46a'; g.lineWidth = 22; g.strokeRect(14, 14, 484, 612);
  g.strokeStyle = '#8a5a18'; g.lineWidth = 4; g.strokeRect(30, 30, 452, 580);
  // fiber-D
  const cx = 256, cy = 330;
  const drawD = (lw, color, blur) => {
    g.save();
    g.shadowColor = '#59f3ff'; g.shadowBlur = blur;
    g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx - 80, cy - 150);
    g.lineTo(cx - 80, cy + 150);
    g.moveTo(cx - 80, cy - 150);
    g.bezierCurveTo(cx + 150, cy - 150, cx + 150, cy + 150, cx - 80, cy + 150);
    g.stroke();
    g.restore();
  };
  drawD(46, '#e9c46a', 0);
  drawD(16, '#bffbff', 40);
  drawD(6, '#ffffff', 18);
  // ljuspulser
  g.fillStyle = '#ffffff'; g.shadowColor = '#59f3ff'; g.shadowBlur = 30;
  for (const [x, y] of [[cx - 80, cy - 40], [cx + 92, cy], [cx - 80, cy + 110]]) { g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); }
  g.shadowBlur = 0;
  // stjärnor
  g.fillStyle = '#e9c46a';
  for (const [x, y] of [[110, 110], [402, 110], [256, 560]]) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 9 : 22, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Kullersten/huggen sten för slottet och nodsocklar. */
export function makeStoneTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  g.fillStyle = '#5d574f'; g.fillRect(0, 0, 512, 512);
  const rows = 8, rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    let x = (y % 2) * -40;
    while (x < 512) {
      const w = 70 + r() * 60;
      const l = 120 + r() * 50;
      g.fillStyle = `rgb(${l + 8},${l + 2},${l - 8})`;
      g.fillRect(x + 3, y * rh + 3, w - 6, rh - 6);
      // fläckar
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`;
        g.beginPath(); g.arc(x + r() * w, y * rh + r() * rh, 2 + r() * 8, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 3, y * rh + 3, w - 6, 3);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3, y * rh + rh - 6, w - 6, 3);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Vågigt normalmap för sjön. */
export function makeWaterNormal() {
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const hgt = (x, y) => {
    let v = 0;
    for (let k = 1; k <= 4; k++) {
      v += Math.sin((x * (k * 1.7) + y * (k * 0.9)) * (Math.PI * 2 / 256) * k * 2 + k * 1.3) / k;
      v += Math.cos((y * (k * 1.3) - x * (k * 0.6)) * (Math.PI * 2 / 256) * k * 3 + k) / (k * 1.5);
    }
    return v;
  };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y);
    const dy = hgt(x, y + 1) - hgt(x, y - 1);
    const n = new THREE.Vector3(-dx, -dy, 2).normalize();
    const i = (y * 256 + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255;
    img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Hårstrån – slickat bakåt. */
export function makeHairTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  g.fillStyle = '#4a302c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = r() * 256;
    const l = 30 + r() * 60;
    g.strokeStyle = r() < 0.5 ? `rgba(20,10,8,${0.2 + r() * 0.3})` : `rgba(140,96,80,${0.15 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, r() * 256); g.lineTo(x + (r() - 0.5) * 6, l + r() * 256); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Larvband för Grävskopan. */
export function makeTrackTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#1e1f22'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = '#3a3c41'; g.fillRect(2, y + 2, 60, 9);
    g.fillStyle = '#55585f'; g.fillRect(2, y + 2, 60, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Mjuk rund partikel. */
export function makeDotTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export { rng };
