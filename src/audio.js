/** Allt ljud syntas i realtid med WebAudio – inga ljudfiler behövs. */
export class Audio {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.16; this.music.connect(this.master);
    // enkelt eko till musiken
    const delay = this.ctx.createDelay(1); delay.delayTime.value = 0.36;
    const fb = this.ctx.createGain(); fb.gain.value = 0.3;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.music.connect(delay); delay.connect(lp).connect(fb).connect(delay); lp.connect(this.master);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = null, attack = 0.005, when = 0, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { freq = 1000, q = 1, vol = 0.3, type = 'bandpass', slide = null, when = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  swing() { this.noise(0.18, { freq: 700, slide: 3200, q: 2, vol: 0.22 }); this.tone(900, 0.12, { type: 'sine', vol: 0.04, slide: 1800 }); }
  hit() { this.tone(160, 0.18, { type: 'triangle', vol: 0.35, slide: 55 }); this.noise(0.12, { freq: 2500, q: 0.8, vol: 0.25 }); this.tone(1400, 0.15, { vol: 0.06, slide: 2400 }); }
  clang() { this.tone(820, 0.4, { type: 'square', vol: 0.05, slide: 780 }); this.tone(1230, 0.35, { vol: 0.08 }); this.noise(0.1, { freq: 4000, vol: 0.2 }); }
  enemyDie() { this.tone(700, 0.25, { type: 'square', vol: 0.06, slide: 90 }); this.noise(0.35, { freq: 600, slide: 150, vol: 0.3, q: 0.7 }); }
  hurt() { this.tone(240, 0.25, { type: 'sawtooth', vol: 0.12, slide: 90 }); this.noise(0.15, { freq: 900, vol: 0.2 }); }
  dash() { this.noise(0.25, { freq: 400, slide: 2000, q: 1.5, vol: 0.18 }); }
  blip(i) { const f = 440 * Math.pow(2, [0, 4, 7, 12, 16, 19, 24, 28, 31, 36, 40, 43][i % 12] / 12); this.tone(f, 0.18, { type: 'triangle', vol: 0.18 }); this.tone(f * 2, 0.12, { vol: 0.05, when: 0.02 }); }
  wrong() { this.tone(110, 0.25, { type: 'sawtooth', vol: 0.12 }); this.tone(104, 0.25, { type: 'sawtooth', vol: 0.12 }); }
  slam() { this.tone(70, 0.6, { type: 'sine', vol: 0.6, slide: 30 }); this.noise(0.5, { freq: 300, q: 0.5, vol: 0.5, type: 'lowpass', slide: 80 }); }
  telegraph() { this.tone(300, 0.5, { type: 'sawtooth', vol: 0.05, slide: 600 }); }
  bossRoar() { this.tone(90, 1.4, { type: 'sawtooth', vol: 0.18, slide: 50 }); this.tone(93, 1.4, { type: 'square', vol: 0.08, slide: 45 }); this.noise(1.2, { freq: 400, vol: 0.3, q: 0.6, slide: 120 }); }
  explode() { this.noise(0.9, { freq: 900, slide: 60, vol: 0.55, q: 0.4, type: 'lowpass' }); this.tone(60, 0.8, { vol: 0.4, slide: 28 }); }
  online() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 0.9, { type: 'triangle', vol: 0.12, when: i * 0.08 }));
    this.noise(1.6, { freq: 6000, q: 0.5, vol: 0.06, type: 'highpass', when: 0.2 });
    this.tone(1046.5, 1.4, { vol: 0.05, when: 0.45 });
  }
  heal() { [0, 7, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.35, { vol: 0.07, when: i * 0.06 })); }
  victory() {
    const seq = [[0, 0.2], [4, 0.2], [7, 0.2], [12, 0.5], [9, 0.25], [12, 0.25], [16, 0.9]];
    let w = 0;
    for (const [s, d] of seq) { this.tone(392 * Math.pow(2, s / 12), d + 0.25, { type: 'triangle', vol: 0.16, when: w }); this.tone(196 * Math.pow(2, s / 12), d + 0.25, { type: 'sine', vol: 0.1, when: w }); w += d; }
  }
  ui() { this.tone(880, 0.08, { type: 'triangle', vol: 0.08 }); }

  startMusic() {
    // lugnt, äventyrligt ackordspel: Am – F – C – G
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const beat = 0.42;
    let step = 0;
    let next = this.ctx.currentTime + 0.2;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.6) {
        const bar = Math.floor(step / 8) % 4;
        const ch = chords[bar];
        const when = next - this.ctx.currentTime;
        if (step % 8 === 0) {
          ch.forEach((m) => this.tone(mtof(m), beat * 8, { type: 'sine', vol: 0.12, attack: 0.6, when, dest: this.music }));
          this.tone(mtof(ch[0] - 12), beat * 8, { type: 'triangle', vol: 0.14, attack: 0.3, when, dest: this.music });
        }
        const arp = [0, 1, 2, 1, 2, 0, 2, 1][step % 8];
        if (step % 2 === 0 || Math.random() < 0.4) this.tone(mtof(ch[arp] + 12), 0.5, { type: 'triangle', vol: 0.07, when, dest: this.music });
        step++; next += beat;
      }
      this.musicTimer = setTimeout(tick, 150);
    };
    tick();
  }
}
