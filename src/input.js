/** Tangentbord + mus + pekskärm (virtuell styrspak). */
export class Input {
  constructor(canvas, touchUI) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.pressed = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space' || k === 'KeyJ') this.pressed.add('attack');
      if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyK') this.pressed.add('dash');
      if (k === 'KeyE' || k === 'Enter') this.pressed.add('interact');
      if (k === 'KeyC') this.pressed.add('selfie');
      if (k === 'KeyM') this.pressed.add('mute');
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // mus: dra = kamera, klick = hugg
    let down = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, btn: e.button };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !down) return;
      const dx = e.movementX ?? 0, dy = e.movementY ?? 0;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (down.moved > 5) { this.look.x += dx; this.look.y += dy; }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' || !down) return;
      if (down.moved <= 5 && down.btn === 0) this.pressed.add('attack');
      down = null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // pekskärm
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = null;
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    this.base = base; this.knob = knob;
    const R = 52;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY;
          base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; base.style.bottom = 'auto';
          base.classList.add('active');
          setKnob(0, 0);
        } else if (this.lookTouch === null) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 };
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.joy.x = dx / R; this.joy.y = dy / R;
          setKnob(dx, dy);
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          const dx = t.clientX - this.lookTouch.x, dy = t.clientY - this.lookTouch.y;
          this.lookTouch.moved += Math.abs(dx) + Math.abs(dy);
          this.look.x += dx * 1.5; this.look.y += dy * 1.5;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.id = null; this.joy.x = this.joy.y = 0; setKnob(0, 0);
          base.classList.remove('active');
          base.style.left = ''; base.style.top = ''; base.style.bottom = '';
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          if (this.lookTouch.moved < 8 && performance.now() - this.lookTouch.t < 250) this.pressed.add('attack');
          this.lookTouch = null;
        }
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    const bindBtn = (id, action) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); this.pressed.add(action); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('pressed'); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); this.pressed.add(action); });
    };
    bindBtn('t-attack', 'attack');
    bindBtn('t-dash', 'dash');
    bindBtn('t-interact', 'interact');
  }

  /** Läs av och nollställ engångstryck */
  frame() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.joy.id !== null) { x += this.joy.x; y -= this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    const out = { move: { ...this.move }, look: { ...this.look }, zoom: this.zoom, pressed: new Set(this.pressed) };
    this.look.x = this.look.y = 0; this.zoom = 0;
    this.pressed.clear();
    if (!this.enabled) { out.move.x = out.move.y = 0; out.pressed.clear(); }
    return out;
  }
}
