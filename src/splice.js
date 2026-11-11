// Fiberfärgkoden (TIA-598 / IEC) – precis som på riktigt.
export const FIBERS = [
  { name: 'Blå', c: '#2f6df6' }, { name: 'Orange', c: '#ff8a1f' }, { name: 'Grön', c: '#2fb24a' },
  { name: 'Brun', c: '#8a5a2b' }, { name: 'Grå', c: '#9aa0a8' }, { name: 'Vit', c: '#f4f4f4' },
  { name: 'Röd', c: '#e8322a' }, { name: 'Svart', c: '#1b1b1e' }, { name: 'Gul', c: '#f7d81c' },
  { name: 'Violett', c: '#8b4fd8' }, { name: 'Rosa', c: '#ff8fc0' }, { name: 'Turkos', c: '#2fd8d0' },
];

const $ = (id) => document.getElementById(id);

/**
 * Skarvnings-minispel. Löser ut true när alla fibrer är skarvade.
 * Om tiden tar slut får man försöka igen (eller avbryta).
 */
export function runSplice({ nodeName, count, time, audio }) {
  return new Promise((resolve) => {
    const root = $('splice'), card = root.querySelector('.splice-card');
    const left = $('splice-left'), right = $('splice-right'), svg = $('splice-svg'), foot = $('splice-foot');
    const timeBar = $('splice-time');
    $('splice-node').textContent = nodeName;
    root.classList.remove('hidden');

    let fibers, order, sel, done, tLeft, timer, ended;

    const start = () => {
      fibers = FIBERS.slice(0, count);
      order = fibers.map((_, i) => i);
      do { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
      while (order.every((v, i) => v === i) && count > 1);
      sel = null; done = new Set(); tLeft = time; ended = false;
      left.innerHTML = ''; right.innerHTML = ''; svg.innerHTML = ''; foot.innerHTML = '';
      const mk = (f, i, side) => {
        const el = document.createElement('button');
        el.className = 'fiber';
        el.dataset.i = i;
        el.innerHTML = `<span class="lbl">${f.name}</span><span class="dot" style="background:${f.c}"></span>`;
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(side, i, el); });
        return el;
      };
      fibers.forEach((f, i) => left.appendChild(mk(f, i, 'L')));
      order.forEach((i) => right.appendChild(mk(fibers[i], i, 'R')));
      clearInterval(timer);
      let last = performance.now();
      timer = setInterval(() => {
        const now = performance.now();
        tLeft -= (now - last) / 1000; last = now;
        timeBar.style.width = Math.max(0, (tLeft / time) * 100) + '%';
        if (tLeft <= 0 && !ended) fail();
      }, 50);
      redraw();
    };

    // offset-mått påverkas inte av CSS-animationer (scale) på kortet
    const lineFor = (i) => {
      const l = left.querySelector(`[data-i="${i}"]`);
      const r = right.querySelector(`[data-i="${i}"]`);
      return [l.offsetLeft + l.offsetWidth - 4, l.offsetTop + l.offsetHeight / 2, r.offsetLeft + 4, r.offsetTop + r.offsetHeight / 2];
    };
    const redraw = () => {
      svg.innerHTML = `<defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
      for (const i of done) {
        const [x1, y1, x2, y2] = lineFor(i);
        const mx = (x1 + x2) / 2;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        p.setAttribute('stroke', fibers[i].c === '#1b1b1e' ? '#555' : fibers[i].c);
        p.setAttribute('stroke-width', '4'); p.setAttribute('fill', 'none'); p.setAttribute('filter', 'url(#gl)');
        p.setAttribute('stroke-linecap', 'round');
        svg.appendChild(p);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', mx); c.setAttribute('cy', (y1 + y2) / 2); c.setAttribute('r', 3.5);
        c.setAttribute('fill', '#bffcff'); c.setAttribute('filter', 'url(#gl)');
        svg.appendChild(c);
      }
    };
    const onResize = () => redraw();
    addEventListener('resize', onResize);

    const pick = (side, i, el) => {
      if (ended || done.has(i)) return;
      if (side === 'L') {
        left.querySelectorAll('.fiber').forEach((f) => f.classList.remove('sel'));
        sel = i; el.classList.add('sel'); audio.ui();
        return;
      }
      if (sel === null) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 250); return; }
      if (sel === i) {
        done.add(i);
        left.querySelector(`[data-i="${i}"]`).classList.remove('sel');
        left.querySelector(`[data-i="${i}"]`).classList.add('done');
        el.classList.add('done');
        audio.blip(done.size - 1);
        sel = null;
        redraw();
        if (done.size === count) win();
      } else {
        audio.wrong();
        el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 300);
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        tLeft -= 2;
        foot.textContent = 'Fel färg! −2 s';
        setTimeout(() => { if (!ended) foot.textContent = ''; }, 900);
      }
    };

    const close = (ok) => {
      clearInterval(timer);
      removeEventListener('resize', onResize);
      root.classList.add('hidden');
      resolve(ok);
    };
    const win = () => {
      ended = true;
      clearInterval(timer);
      const loss = (0.01 + Math.random() * 0.03).toFixed(2);
      foot.innerHTML = `Skarven klar! Dämpning ${loss} dB ✨`;
      setTimeout(() => close(true), 900);
    };
    const fail = () => {
      ended = true;
      clearInterval(timer);
      audio.wrong();
      foot.innerHTML = `Tiden tog slut – skarven brast! <button class="btn-primary" id="splice-retry">Försök igen</button>`;
      $('splice-retry').addEventListener('click', () => start());
    };

    start();
  });
}
